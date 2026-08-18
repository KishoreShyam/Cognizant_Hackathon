from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from collections import defaultdict
import time
from .models import Patient, CommunitySDOH, PatientRiskPrediction, Staff
from .ml_engine import get_prediction_engine, prediction_to_dict
from .services import is_prediction_stale, get_or_predict_patient_risk
from .permissions import RolePermission

# ---------------------------------------------------------------------------
# In-memory response cache for the expensive CountyRiskMapView endpoint.
# Keyed by view name; value is (timestamp, response_data).
# Cache TTL: 5 minutes (300 seconds). Invalidated when Refresh Map is clicked.
# ---------------------------------------------------------------------------
_MAP_CACHE: dict = {}
_MAP_CACHE_TTL: int = 300  # seconds


class PatientPredictView(APIView):
    """
    POST /api/patients/<patient_id>/predict/
    GET  /api/patients/<patient_id>/predict/
    
    Loads patient, matches CommunitySDOH using tract_fips,
    runs CatBoost future risk model, calculates real TreeSHAP values,
    saves predictions to database, and returns the response.
    """
    def post(self, request, patient_id):
        patient = get_object_or_404(Patient, patient_id=patient_id)
        try:
            # Force recalculation upon explicit user POST
            result = get_or_predict_patient_risk(patient, force_recalculate=True)
            
            response_data = {
                "patient_id": result["patient_id"],
                "tract_fips": result["tract_fips"],
                "future_risk_5": result["future_risk_5"],
                "future_risk_3": result["future_risk_3"],
                "driver": result["driver"],
                "driver_type": result["driver_type"],
                "shap_drivers": result["shap_drivers"],
                "intervention": result["intervention"],
                "model_info": result.get("model_info", {})
            }
            return Response(response_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"error": f"Prediction failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def get(self, request, patient_id):
        patient = get_object_or_404(Patient, patient_id=patient_id)
        try:
            result = get_or_predict_patient_risk(patient, force_recalculate=False)
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"error": f"Prediction retrieval failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PatientListView(APIView):
    """
    GET /api/patients/
    GET /api/members/
    
    UNIFIED CLIENT WORKSPACE VIEW:
    Returns the unified 120 unique current patients cohort.
    If a patient has a matching past/historical record, combines their current and future risk.
    """
    def get(self, request):
        from .current_prediction_engine import get_current_engine
        engine = get_current_engine()

        # Fetch current patients (120 records)
        current_patients = list(CurrentPatient.objects.all().order_by('PATIENT_ID'))

        # Fetch historical patient mapping to detect overlaps (100 records)
        past_patients_map = {
            p.patient_id: p
            for p in Patient.objects.all()
        }

        # Prefetch current predictions (oldest first, so newest overwrites in dictionary)
        curr_pred_map = {
            pred.patient_id: pred
            for pred in CurrentPatientPrediction.objects.all().order_by('prediction_timestamp')
        }

        # Prefetch historical/future risk predictions (oldest first, so newest overwrites in dictionary)
        future_pred_map = {
            pred.patient.patient_id: pred
            for pred in PatientRiskPrediction.objects.all().select_related('patient').order_by('created_at')
        }

        # Prefetch current communities to map county names
        communities_map = {
            c.tract_fips: c
            for c in CurrentCommunity.objects.all()
        }

        member_list = []
        high_priority_count = 0
        clinical_dominant_count = 0
        sdoh_dominant_count = 0
        combined_elevated_count = 0

        for p in current_patients:
            # Check overlap by matching PATIENT_ID with past patient_id
            patient_id = p.PATIENT_ID
            has_past_record = patient_id in past_patients_map
            past_patient_obj = past_patients_map.get(patient_id)

            # Get current prediction, calculate if missing
            latest_curr_pred = curr_pred_map.get(patient_id)
            if not latest_curr_pred:
                # Runs prediction dynamically
                try:
                    engine.predict_current_patient(p, save_to_db=True)
                    latest_curr_pred = CurrentPatientPrediction.objects.filter(patient=p).first()
                except Exception as e:
                    logger.error(f"Failed to calculate current prediction for {patient_id}: {e}")

            # Get future prediction
            future_pred = future_pred_map.get(patient_id) if has_past_record else None

            # Get community info
            community = communities_map.get(p.FIPS_ID)
            county_name = community.county_name if community else 'California'
            state_name = community.state_abbreviation if community else 'CA'

            # Risk levels
            if latest_curr_pred:
                level_5 = latest_curr_pred.final_current_risk_level
                if level_5 == 'VERY HIGH':
                    level_5 = 'CRITICAL'
                score_5 = latest_curr_pred.final_current_risk_score
                clinical_score = latest_curr_pred.clinical_risk_score
                community_score = latest_curr_pred.community_risk_score
                clinical_risk_level = getattr(latest_curr_pred, 'clinical_risk_level', 'LOW') or 'LOW'
                if clinical_risk_level in ['VERY HIGH', 'VERY_HIGH']:
                    clinical_risk_level = 'CRITICAL'
                community_risk_level = getattr(latest_curr_pred, 'community_risk_level', 'LOW') or 'LOW'
                if community_risk_level in ['VERY HIGH', 'VERY_HIGH']:
                    community_risk_level = 'CRITICAL'
                raw_sdoh = latest_curr_pred.raw_sdoh_values or {}
                norm_sdoh = latest_curr_pred.normalized_sdoh_values or {}
                risk_sdoh = latest_curr_pred.risk_oriented_sdoh_values or {}
                sdoh_contrib = latest_curr_pred.sdoh_feature_contribution_percentages or {}
                clinical_shaps_list = latest_curr_pred.clinical_shap_drivers or []
            else:
                level_5 = 'LOW'
                score_5 = 10.0
                clinical_score = 10.0
                community_score = 10.0
                clinical_risk_level = 'LOW'
                community_risk_level = 'LOW'
                raw_sdoh = {}
                norm_sdoh = {}
                risk_sdoh = {}
                sdoh_contrib = {}
                clinical_shaps_list = []

            level_3 = future_pred.future_risk_level if future_pred else 'N/A'
            conf_3 = future_pred.future_risk_confidence if future_pred else 0.0

            # Compute priority score: Current Risk Score (50/50 combined) + Future Risk Score (CatBoost probabilities)
            if future_pred:
                prob = future_pred.future_risk_probabilities or {}
                # Map 3-class CatBoost level to a 0-100 continuous score
                future_score = float(prob.get('Low', 0.0)) * 20.0 + float(prob.get('Moderate', 0.0)) * 60.0 + float(prob.get('High', 0.0)) * 100.0
                priority_score = 0.5 * (score_5 / 100.0) + 0.5 * (future_score / 100.0)
            else:
                priority_score = score_5 / 100.0

            # Map aggregated Priority Risk Score to Priority Level and styling
            if priority_score >= 0.75:
                priority_level = 'CRITICAL'
                status_text = 'Needs Review'
                status_color = 'bg-error'
                priority_color = 'bg-error/10 text-error border-error/20'
            elif priority_score >= 0.65:
                priority_level = 'HIGH'
                status_text = 'Needs Review'
                status_color = 'bg-error'
                priority_color = 'bg-orange-100 text-orange-800 border border-orange-200'
            elif priority_score >= 0.40:
                priority_level = 'MEDIUM'
                status_text = 'Active Monitoring'
                status_color = 'bg-amber-500'
                priority_color = 'bg-amber-100 text-amber-800 border border-amber-200'
            elif priority_score >= 0.20:
                priority_level = 'LOW'
                status_text = 'Stable'
                status_color = 'bg-teal-500'
                priority_color = 'bg-teal-100 text-teal-800 border border-teal-200'
            else:
                priority_level = 'VERY LOW'
                status_text = 'Stable'
                status_color = 'bg-teal-500'
                priority_color = 'bg-emerald-100 text-emerald-800 border border-emerald-200'

            # Count summary aggregates
            if priority_level in ['CRITICAL', 'HIGH', 'VERY HIGH']:
                high_priority_count += 1

            if clinical_score > community_score:
                clinical_dominant_count += 1
                driver_type = 'Clinical'
            elif community_score > clinical_score:
                sdoh_dominant_count += 1
                driver_type = 'SDOH'
            else:
                combined_elevated_count += 1
                driver_type = 'Combined'

            # SDOH risk level
            poverty_val = raw_sdoh.get("poverty_rate", 0.0)
            housing_val = raw_sdoh.get("housing_cost_burden", 0.0)
            income_val = raw_sdoh.get("median_household_income", 0.0)
            unemployment_val = raw_sdoh.get("unemployment_rate", 0.0)
            uninsured_val = raw_sdoh.get("uninsured_rate", 0.0)
            food_val = raw_sdoh.get("low_access_population_rate", 0.0)
            no_vehicle_val = raw_sdoh.get("no_vehicle_rate", 0.0)
            disability_val = raw_sdoh.get("disability_rate", 0.0)
            broadband_val = raw_sdoh.get("no_internet_access_rate", 0.0)

            sdoh_risk_level = community.community_risk_level if community else 'LOW'

            # Conditions list
            conditions_list = []
            if (p.CHRONIC_CONDITIONS or 0) > 0:
                conditions_list.append(f"{p.CHRONIC_CONDITIONS} Chronic Conditions")
            if (p.CONDITIONS or 0) > 0:
                conditions_list.append(f"{p.CONDITIONS} Total Diagnoses")
            if (p.MEDICATIONS or 0) > 0:
                conditions_list.append(f"{p.MEDICATIONS} Active Meds")
            if not conditions_list:
                conditions_list = ['Routine Baseline']

            # Build combined SHAP + SDOH explanation drivers
            shap_drivers = []
            rank = 1
            # Clinical drivers (top 3)
            for drv in clinical_shaps_list[:3]:
                shap_drivers.append({
                    "rank": rank,
                    "feature": drv["feature"],
                    "display_name": drv["display_name"],
                    "shap_value": drv["shap_value"],
                    "shap_formatted": drv["shap_formatted"],
                    "raw_value": drv["raw_value"],
                    "category": "Clinical"
                })
                rank += 1
            
            # SDOH drivers (top 3)
            sorted_sdoh = sorted(sdoh_contrib.items(), key=lambda x: -x[1])
            for feat, pct in sorted_sdoh[:3]:
                shap_drivers.append({
                    "rank": rank,
                    "feature": feat,
                    "display_name": feat.replace('_', ' ').title(),
                    "shap_value": pct / 100.0,
                    "shap_formatted": f"{pct:+.1f}%",
                    "raw_value": raw_sdoh.get(feat, 0.0),
                    "category": "SDOH"
                })
                rank += 1

            driver = clinical_shaps_list[0]["display_name"] if clinical_shaps_list else "Clinical Acuity"
            top_sdoh = sorted_sdoh[0][0].replace('_', ' ').title() if sorted_sdoh else "SDOH Factors"
            
            details = [
                f"Primary Clinical Driver: {driver}",
                f"Primary SDOH Driver: {top_sdoh} ({sorted_sdoh[0][1] if sorted_sdoh else 0}% contrib)",
                f"Combined score: {score_5:.1f}/100. Future level: {level_3}"
            ]

            member_list.append({
                "id": patient_id,
                "patient_id": patient_id,
                "name": p.PATIENT_NAME or f"Patient {patient_id}",
                "tract_fips": p.FIPS_ID,
                "county": county_name,
                "state": state_name,
                "gender": p.GENDER,
                "priority": priority_level,
                "priority_label": f"Priority Risk: {priority_level} (Score: {priority_score:.2f})",
                "priorityColor": priority_color,
                "clinical_risk": {
                    "level": clinical_risk_level,
                    "score": clinical_score
                },
                "community_risk": {
                    "level": community_risk_level,
                    "score": community_score
                },
                "future_risk_5": {
                    "level": level_5,
                    "class": 0,
                    "confidence": 1.0,
                    "confidence_pct": f"{score_5:.1f}% score"
                },
                "future_risk_3": {
                    "level": level_3,
                    "class": future_pred.future_risk_class if future_pred else -1,
                    "confidence": conf_3,
                    "confidence_pct": f"{conf_3 * 100:.1f}% conf" if future_pred else 'N/A'
                },
                "sdoh_risk": {
                    "level": sdoh_risk_level,
                    "label": sdoh_risk_level,
                    "poverty_2022": poverty_val,
                    "housing_burden_2022": housing_val,
                    "income_2022": income_val,
                    "unemployment_2022": unemployment_val,
                    "uninsured_2022": uninsured_val,
                    "food_access_2022": food_val,
                    "no_vehicle_2022": no_vehicle_val,
                    "disability_2022": disability_val,
                    "broadband_2022": broadband_val,
                    "education_2022": 0.0,
                },
                "driver": driver,
                "driver_type": driver_type,
                "shap_drivers": shap_drivers,
                "status": status_text,
                "statusColor": status_color,
                "conditions": conditions_list,
                "edVisits": int(p.EMERGENCY_VISITS or 0),
                "ipVisits": int(p.INPATIENT_ADMISSIONS or 0),
                "outpatientVisits": int(p.OUTPATIENT_VISITS or 0),
                "encounters": int((p.EMERGENCY_VISITS or 0) + (p.INPATIENT_ADMISSIONS or 0) + (p.OUTPATIENT_VISITS or 0)),
                "chronicCount": int(p.CHRONIC_CONDITIONS or 0),
                "diagnosesCount": int(p.CONDITIONS or 0),
                "medicationsCount": int(p.MEDICATIONS or 0),
                "proceduresCount": int(p.PROCEDURES or 0),
                "clinicalBurden": int((p.CHRONIC_CONDITIONS or 0) * 10 + (p.CONDITIONS or 0) * 2),
                "healthcareUtilization": int((p.EMERGENCY_VISITS or 0) * 15 + (p.INPATIENT_ADMISSIONS or 0) * 50),
                "future_forecast_note": f"Current risk evaluated at {level_5} (Combined Score: {score_5:.1f}). Future forecast: {level_3}.",
                "priority_score": priority_score,
                "details": details,
            })

        # Sort member list by Priority Risk Score descending
        member_list.sort(key=lambda m: -m["priority_score"])

        total_count = len(current_patients)
        summary = {
            "total_patients": total_count,
            "high_priority_count": high_priority_count,
            "clinical_dominant_pct": round((clinical_dominant_count / total_count * 100), 1) if total_count > 0 else 0,
            "sdoh_dominant_pct": round((sdoh_dominant_count / total_count * 100), 1) if total_count > 0 else 0,
            "combined_elevated_pct": round((combined_elevated_count / total_count * 100), 1) if total_count > 0 else 0,
        }

        return Response({
            "summary": summary,
            "total": total_count,
            "members": member_list
        }, status=status.HTTP_200_OK)


class PatientDetailView(APIView):
    """
    GET /api/patients/<patient_id>/
    Returns full patient features, matched Community SDOH info, and stored TreeSHAP risk predictions.
    """
    def get(self, request, patient_id):
        patient = get_object_or_404(Patient, patient_id=patient_id)
        combined = patient.get_combined_features()
        eval_res = get_or_predict_patient_risk(patient, force_recalculate=False)
        sdoh = patient.community_sdoh

        shap_drivers = eval_res.get("shap_drivers", [])
        top_shp = shap_drivers[0] if shap_drivers else {'display_name': 'SDOH Factors', 'shap_formatted': '+0.0000', 'raw_value': 'N/A'}
        sec_shp = shap_drivers[1] if len(shap_drivers) > 1 else {'display_name': 'Clinical Profile', 'shap_formatted': '+0.0000', 'raw_value': 'N/A'}
        details = [
            f"Primary SHAP Driver: {top_shp['display_name']} ({top_shp['shap_formatted']} impact, value: {top_shp['raw_value']})",
            f"Secondary SHAP Driver: {sec_shp['display_name']} ({sec_shp['shap_formatted']} impact, value: {sec_shp['raw_value']})",
            eval_res["intervention"]["future_forecast"]
        ]

        response_data = {
            "patient": {**combined, "name": patient.name or f"Patient {patient.patient_id}"},
            "name": patient.name or f"Patient {patient.patient_id}",
            "sdoh": {
                "tract_fips": patient.tract_fips,
                "county": sdoh.county if sdoh else "California",
                "state": sdoh.state if sdoh else "CA",
                "poverty_2022": sdoh.poverty_2022 if sdoh else None,
                "income_2022": sdoh.income_2022 if sdoh else None,
                "unemployment_2022": sdoh.unemployment_2022 if sdoh else None,
                "housing_burden_2022": sdoh.housing_burden_2022 if sdoh else None,
                "uninsured_2022": sdoh.uninsured_2022 if sdoh else None,
                "food_access_population_2022": sdoh.food_access_population_2022 if sdoh else None,
                "no_vehicle_2022": sdoh.no_vehicle_2022 if sdoh else None,
                "disability_2022": sdoh.disability_2022 if sdoh else None,
                "broadband_2022": sdoh.broadband_2022 if sdoh else None,
            } if sdoh else None,
            "prediction": {
                "future_risk_5": eval_res["future_risk_5"],
                "future_risk_3": eval_res["future_risk_3"],
                "intervention": eval_res["intervention"],
                "driver": eval_res["driver"],
                "driver_type": eval_res["driver_type"],
                "shap_drivers": shap_drivers,
                "details": details,
                "model_info": eval_res.get("model_info", {})
            }
        }
        return Response(response_data, status=status.HTTP_200_OK)


class BatchPredictAllView(APIView):
    """
    POST /api/patients/predict-all/
    Runs risk prediction on all patients and saves results to database.
    """
    def post(self, request):
        try:
            engine = get_prediction_engine()
            results = engine.predict_all_patients(save_to_db=True, verbose=False)
            return Response({
                "message": f"Successfully evaluated and saved future risk predictions for {len(results)} patients.",
                "total_patients": len(results),
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"error": f"Batch prediction failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ModelInfoView(APIView):
    """
    GET /api/model-info/
    Returns metadata about both models.
    """
    def get(self, request):
        engine = get_prediction_engine()
        return Response(engine.get_model_info(), status=status.HTTP_200_OK)


# California County Centroid Coordinates Mapping
CALIFORNIA_COUNTY_COORDS = {
    'Los Angeles County': [34.0522, -118.2437],
    'San Diego County': [32.7157, -117.1611],
    'Orange County': [33.7175, -117.8311],
    'Riverside County': [33.9533, -117.3962],
    'San Bernardino County': [34.1083, -117.2898],
    'Santa Clara County': [37.3541, -121.9552],
    'Alameda County': [37.6017, -121.7195],
    'Sacramento County': [38.5816, -121.4944],
    'Contra Costa County': [37.8534, -121.9018],
    'Fresno County': [36.7468, -119.7726],
    'San Francisco County': [37.7749, -122.4194],
    'Ventura County': [34.2805, -119.2945],
    'San Mateo County': [37.5630, -122.3255],
    'San Joaquin County': [37.9577, -121.2908],
    'Marin County': [38.0834, -122.7633],
    'Tulare County': [36.2077, -119.3473],
    'Monterey County': [36.2168, -121.3153],
    'Santa Barbara County': [34.4208, -119.6982],
    'Sonoma County': [38.2919, -122.4580],
    'Kern County': [35.3733, -119.0187],
    'Merced County': [37.3022, -120.4830],
    'Shasta County': [40.5865, -122.3917],
    'El Dorado County': [38.7426, -120.5251],
    'Madera County': [36.9613, -120.0607],
    'Napa County': [38.2975, -122.2869],
    'Nevada County': [39.2616, -121.0161],
    'Solano County': [38.3105, -121.9018],
    'Stanislaus County': [37.5091, -120.9876],
    'Placer County': [39.0916, -120.8039],
    'San Luis Obispo County': [35.3102, -120.4358],
    'Santa Cruz County': [37.0454, -122.0224],
    'Yolo County': [38.7646, -121.9018],
    'Imperial County': [32.8412, -115.5683],
    'Butte County': [39.6672, -121.6080],
    'Kings County': [36.0754, -119.8155],
}


def compute_shap_from_stored_predictions(patient_ids: list, pred_map: dict) -> tuple:
    """
    Aggregates population-level SHAP feature attributions from already-stored
    PatientRiskPrediction.shap_drivers records — no CatBoost inference needed.

    Each stored shap_drivers entry has the per-patient top-5 list:
      [{'feature': str, 'display_name': str, 'shap_value': float,
        'shap_formatted': str, 'raw_value': any, 'category': str}, ...]

    We accumulate SHAP values per feature across all patients, then compute
    mean_abs_shap and mean_shap for ranking, mimicking compute_population_tree_shap.
    """
    from .ml_engine import FEATURE_DISPLAY_NAMES, CLINICAL_FEATURES

    if not patient_ids:
        return [], []

    total_n = len(patient_ids)
    # feature -> {'shap_sum': float, 'abs_shap_sum': float, 'count': int,
    #             'display_name': str, 'category': str, 'raw_vals': list}
    feat_accum: dict = {}

    for pid in patient_ids:
        pred = pred_map.get(pid)
        drivers = (pred.shap_drivers or []) if pred else []
        for d in drivers:
            feat = d.get('feature')
            if not feat:
                continue
            sv = float(d.get('shap_value', 0.0))
            rv = d.get('raw_value', 0)
            if feat not in feat_accum:
                feat_accum[feat] = {
                    'shap_sum': 0.0,
                    'abs_shap_sum': 0.0,
                    'count': 0,
                    'pos_count': 0,
                    'display_name': d.get('display_name', FEATURE_DISPLAY_NAMES.get(feat, feat.replace('_', ' ').title())),
                    'category': d.get('category', 'Clinical' if feat in CLINICAL_FEATURES else 'SDOH'),
                    'raw_vals': [],
                }
            feat_accum[feat]['shap_sum'] += sv
            feat_accum[feat]['abs_shap_sum'] += abs(sv)
            feat_accum[feat]['count'] += 1
            if sv > 0.0001:
                feat_accum[feat]['pos_count'] += 1
            try:
                feat_accum[feat]['raw_vals'].append(float(rv))
            except (TypeError, ValueError):
                pass

    sdoh_drivers = []
    clinical_drivers = []

    for feat, acc in feat_accum.items():
        mean_abs = acc['abs_shap_sum'] / total_n
        mean_s = acc['shap_sum'] / total_n
        affected_cnt = acc['pos_count'] or (acc['count'] if mean_abs > 0.01 else 0)
        affected_pct = round(affected_cnt / total_n * 100, 1) if total_n > 0 else 0.0

        raw_vals = acc['raw_vals']
        avg_val_raw = sum(raw_vals) / len(raw_vals) if raw_vals else 0.0
        feat_lower = feat.lower()
        if 'income' in feat_lower:
            avg_val_str = f"${int(round(avg_val_raw)):,}"
        elif any(k in feat_lower for k in [
            'poverty', 'housing', 'unemploy', 'uninsur', 'disab',
            'broadband', 'education', 'rate', 'pct', 'food_access'
        ]):
            avg_val_str = f"{avg_val_raw:.1f}%"
        elif 'growth' in feat_lower or 'change' in feat_lower:
            avg_val_str = f"{avg_val_raw:+.1f}"
        else:
            avg_val_str = str(int(round(avg_val_raw))) if abs(avg_val_raw - round(avg_val_raw)) < 0.05 else f"{avg_val_raw:.1f}"

        item = {
            'feature': feat,
            'display_name': acc['display_name'],
            'mean_abs_shap': round(mean_abs, 4),
            'mean_shap': round(mean_s, 4),
            'shap_formatted': f"{mean_s:+.3f}" if abs(mean_s) >= 0.001 else f"{mean_s:+.4f}",
            'affected_members': affected_cnt,
            'total_members': total_n,
            'affected_percentage': affected_pct,
            'affected_display': f"{affected_cnt} / {total_n} ({int(round(affected_pct))}%)",
            'average_value': avg_val_str,
            'average_value_raw': round(avg_val_raw, 2),
            'category': acc['category'],
        }
        if acc['category'] == 'Clinical':
            clinical_drivers.append(item)
        elif feat not in ('SNAPSHOT_DATE', 'COUNTY', 'STATE'):
            sdoh_drivers.append(item)

    sdoh_drivers.sort(key=lambda x: -x['mean_abs_shap'])
    clinical_drivers.sort(key=lambda x: -x['mean_abs_shap'])
    return sdoh_drivers, clinical_drivers


def compute_population_tree_shap(patients_list, engine):
    """
    Aggregates population-level TreeSHAP feature attributions across members in a geographic region (county or tract).
    Calculates:
      - mean_abs_shap: mean(|SHAP|) used for ranking importance
      - mean_shap: mean(SHAP) preserving direction (+/- risk contribution)
      - affected_members: count and percentage of members affected by the feature
      - average_value: clean human-formatted feature average
    """
    if not patients_list:
        return [], []

    import numpy as np
    import pandas as pd
    import catboost
    from .ml_engine import FEATURE_DISPLAY_NAMES, CLINICAL_FEATURES

    # Assemble features for all patients in cohort
    df_list = []
    preds_classes = []
    for p in patients_list:
        df_row, _ = engine.assemble_features(p)
        df_list.append(df_row)
        latest = p.latest_prediction
        if latest and latest.future_risk_class is not None:
            preds_classes.append(latest.future_risk_class)
        else:
            res = engine.predict_patient(p, save_to_db=False)
            preds_classes.append(res['future_risk_3']['class'])

    df_cohort = pd.concat(df_list, ignore_index=True)
    pool = catboost.Pool(df_cohort, cat_features=['SNAPSHOT_DATE', 'COUNTY', 'STATE'])
    
    # Calculate exact TreeSHAP matrix (N, 3, 64)
    shaps_raw = engine.model_3_class.get_feature_importance(data=pool, type='ShapValues')
    
    # Extract predicted class SHAP for each patient
    patient_shaps = np.array([shaps_raw[i, preds_classes[i], :-1] for i in range(len(patients_list))])
    feat_names = engine.feature_names
    total_n = len(patients_list)

    sdoh_drivers = []
    clinical_drivers = []

    for idx, feat in enumerate(feat_names):
        vals = df_cohort[feat].values
        s_vals = patient_shaps[:, idx]
        is_clin = feat in CLINICAL_FEATURES
        
        mean_abs = float(np.mean(np.abs(s_vals)))
        mean_s = float(np.mean(s_vals))
        
        # Affected count: members with positive risk contribution or notable absolute contribution
        pos_shap_count = int(np.sum(s_vals > 0.0001))
        if pos_shap_count > 0:
            affected_cnt = pos_shap_count
        else:
            affected_cnt = int(np.sum(np.abs(s_vals) > 0.005))

        # Bound affected count between 1 and total_n if mean_abs is non-trivial
        if affected_cnt == 0 and mean_abs > 0.01:
            affected_cnt = max(1, int(round(total_n * 0.5)))
        elif affected_cnt == 0:
            affected_cnt = 0

        affected_pct = round(affected_cnt / total_n * 100, 1) if total_n > 0 else 0.0

        numeric_series = pd.to_numeric(pd.Series(vals), errors='coerce')
        avg_val_raw = float(numeric_series.mean()) if not numeric_series.isna().all() else 0.0

        display_name = FEATURE_DISPLAY_NAMES.get(feat, feat.replace('_', ' ').title())
        feat_lower = feat.lower()

        # Format average value nicely for presentation
        if 'income' in feat_lower:
            avg_val_str = f"${int(round(avg_val_raw)):,}"
        elif 'poverty' in feat_lower or 'housing' in feat_lower or 'unemploy' in feat_lower or 'uninsur' in feat_lower or 'disab' in feat_lower or 'broadband' in feat_lower or 'education' in feat_lower or 'rate' in feat_lower or 'pct' in feat_lower or 'food_access' in feat_lower:
            avg_val_str = f"{avg_val_raw:.1f}%"
        elif 'growth' in feat_lower or 'change' in feat_lower:
            avg_val_str = f"{avg_val_raw:+.1f}"
        else:
            if avg_val_raw.is_integer() or abs(avg_val_raw - round(avg_val_raw)) < 0.05:
                avg_val_str = str(int(round(avg_val_raw)))
            else:
                avg_val_str = f"{avg_val_raw:.1f}"

        item = {
            'feature': feat,
            'display_name': display_name,
            'mean_abs_shap': round(mean_abs, 4),
            'mean_shap': round(mean_s, 4),
            'shap_formatted': f"{mean_s:+.3f}" if abs(mean_s) >= 0.001 else f"{mean_s:+.4f}",
            'affected_members': affected_cnt,
            'total_members': total_n,
            'affected_percentage': affected_pct,
            'affected_display': f"{affected_cnt} / {total_n} ({int(round(affected_pct))}%)",
            'average_value': avg_val_str,
            'average_value_raw': round(avg_val_raw, 2),
            'category': 'Clinical' if is_clin else 'SDOH'
        }

        if is_clin:
            clinical_drivers.append(item)
        elif feat not in ['SNAPSHOT_DATE', 'COUNTY', 'STATE']:
            sdoh_drivers.append(item)

    sdoh_drivers.sort(key=lambda x: -x['mean_abs_shap'])
    clinical_drivers.sort(key=lambda x: -x['mean_abs_shap'])

    return sdoh_drivers, clinical_drivers


def get_current_prediction_driver(pred):
    if not pred:
        return 'Tract SDOH Factors', 'SDOH'
    
    driver_type = 'Clinical' if pred.clinical_risk_score > pred.community_risk_score else 'SDOH'
    
    top_clinical = None
    if pred.clinical_shap_drivers:
        try:
            top_d = pred.clinical_shap_drivers[0]
            top_clinical = f"{top_d.get('display_name', top_d.get('feature'))} ({top_d.get('shap_formatted', '+0.00')})"
        except Exception:
            pass
            
    top_sdoh = None
    if pred.sdoh_feature_contribution_percentages:
        try:
            sorted_sdoh = sorted(pred.sdoh_feature_contribution_percentages.items(), key=lambda x: -x[1])
            if sorted_sdoh:
                feat_name, pct = sorted_sdoh[0]
                display_name = feat_name.replace('_', ' ').title()
                top_sdoh = f"{display_name} ({pct:.1f}%)"
        except Exception:
            pass
            
    if driver_type == 'Clinical' and top_clinical:
        return top_clinical, 'Clinical'
    elif top_sdoh:
        return top_sdoh, 'SDOH'
    elif top_clinical:
        return top_clinical, 'Clinical'
    else:
        return 'Tract SDOH Factors', 'SDOH'


def compute_current_population_drivers(patients_list, pred_map):
    if not patients_list:
        return [], []

    total_n = len(patients_list)
    clin_accum = {}
    sdoh_accum = {}
    
    from .current_prediction_engine import COMMUNITY_STATS
    
    for p in patients_list:
        pred = pred_map.get(p.PATIENT_ID)
        if not pred:
            continue
            
        if pred.clinical_shap_drivers:
            for d in pred.clinical_shap_drivers:
                feat = d.get('feature')
                if not feat:
                    continue
                sv = float(d.get('shap_value', 0.0))
                rv = d.get('raw_value', 0.0)
                try:
                    rv_float = float(rv)
                except (ValueError, TypeError):
                    rv_float = 0.0
                    
                if feat not in clin_accum:
                    clin_accum[feat] = {
                        'shap_sum': 0.0,
                        'abs_shap_sum': 0.0,
                        'pos_count': 0,
                        'count': 0,
                        'display_name': d.get('display_name', feat.replace('_', ' ').title()),
                        'raw_vals': []
                    }
                clin_accum[feat]['shap_sum'] += sv
                clin_accum[feat]['abs_shap_sum'] += abs(sv)
                clin_accum[feat]['count'] += 1
                if sv > 0.0001:
                    clin_accum[feat]['pos_count'] += 1
                clin_accum[feat]['raw_vals'].append(rv_float)
                
        if pred.risk_oriented_sdoh_values and pred.raw_sdoh_values:
            for feat in COMMUNITY_STATS.keys():
                risk_val = float(pred.risk_oriented_sdoh_values.get(feat, 0.0))
                raw_val = float(pred.raw_sdoh_values.get(feat, 0.0))
                
                if feat not in sdoh_accum:
                    sdoh_accum[feat] = {
                        'risk_sum': 0.0,
                        'count': 0,
                        'display_name': feat.replace('_', ' ').title(),
                        'raw_vals': []
                    }
                sdoh_accum[feat]['risk_sum'] += risk_val
                sdoh_accum[feat]['count'] += 1
                sdoh_accum[feat]['raw_vals'].append(raw_val)

    clinical_drivers = []
    for feat, acc in clin_accum.items():
        n = len(acc['raw_vals']) or 1
        mean_abs = acc['abs_shap_sum'] / n
        mean_s = acc['shap_sum'] / n
        affected_cnt = acc['pos_count'] or (acc['count'] if mean_abs > 0.01 else 0)
        affected_pct = round(affected_cnt / n * 100, 1)
        
        avg_val_raw = sum(acc['raw_vals']) / len(acc['raw_vals']) if acc['raw_vals'] else 0.0
        avg_val_str = str(int(round(avg_val_raw))) if abs(avg_val_raw - round(avg_val_raw)) < 0.05 else f"{avg_val_raw:.1f}"
        
        clinical_drivers.append({
            'feature': feat,
            'display_name': acc['display_name'],
            'mean_abs_shap': round(mean_abs, 4),
            'mean_shap': round(mean_s, 4),
            'shap_formatted': f"{mean_s:+.3f}" if abs(mean_s) >= 0.001 else f"{mean_s:+.4f}",
            'affected_members': affected_cnt,
            'total_members': total_n,
            'affected_percentage': affected_pct,
            'affected_display': f"{affected_cnt} / {total_n} ({int(round(affected_pct))}%)",
            'average_value': avg_val_str,
            'average_value_raw': round(avg_val_raw, 2),
            'category': 'Clinical',
        })
    clinical_drivers.sort(key=lambda x: -x['mean_abs_shap'])

    sdoh_drivers = []
    for feat, acc in sdoh_accum.items():
        n = len(acc['raw_vals']) or 1
        mean_s = acc['risk_sum'] / n
        mean_abs = mean_s
        
        risk_vals = [pred_map[p.PATIENT_ID].risk_oriented_sdoh_values.get(feat, 0.0) for p in patients_list if p.PATIENT_ID in pred_map]
        affected_cnt = sum(1 for rv in risk_vals if rv > 0.35)
        affected_pct = round(affected_cnt / total_n * 100, 1) if total_n > 0 else 0.0

        avg_val_raw = sum(acc['raw_vals']) / len(acc['raw_vals']) if acc['raw_vals'] else 0.0
        feat_lower = feat.lower()
        if 'income' in feat_lower:
            avg_val_str = f"${int(round(avg_val_raw)):,}"
        elif any(k in feat_lower for k in [
            'poverty', 'housing', 'unemploy', 'uninsur', 'disab',
            'broadband', 'education', 'rate', 'pct', 'access', 'limited_english'
        ]):
            avg_val_str = f"{avg_val_raw:.1f}%"
        else:
            avg_val_str = f"{avg_val_raw:.2f}"
            
        sdoh_drivers.append({
            'feature': feat,
            'display_name': acc['display_name'],
            'mean_abs_shap': round(mean_abs, 4),
            'mean_shap': round(mean_s, 4),
            'shap_formatted': f"+{mean_s:.3f}",
            'affected_members': affected_cnt,
            'total_members': total_n,
            'affected_percentage': affected_pct,
            'affected_display': f"{affected_cnt} / {total_n} ({int(round(affected_pct))}%)",
            'average_value': avg_val_str,
            'average_value_raw': round(avg_val_raw, 2),
            'category': 'SDOH',
        })
    sdoh_drivers.sort(key=lambda x: -x['mean_abs_shap'])

    return sdoh_drivers, clinical_drivers



class CountyRiskMapView(APIView):
    """
    GET /api/map/counties/
    
    Aggregates real current member records, XGBoost current risk predictions, population drivers,
    and Current Community SDOH at the County and Census Tract levels for the California Geographic Risk Analysis Map.
    """
    def get(self, request):
        import logging
        logger = logging.getLogger(__name__)

        # ── Cache check ──────────────────────────────────────────────────────
        force_refresh = request.query_params.get('refresh') == '1'
        cache_key = 'county_risk_map'
        now = time.time()
        if not force_refresh and cache_key in _MAP_CACHE:
            cached_ts, cached_data = _MAP_CACHE[cache_key]
            if now - cached_ts < _MAP_CACHE_TTL:
                return Response(cached_data, status=status.HTTP_200_OK)
        # ────────────────────────────────────────────────────────────────────

        from .current_prediction_engine import get_current_engine, COMMUNITY_STATS
        engine = get_current_engine()
        patients = list(CurrentPatient.objects.all().order_by('PATIENT_ID'))
        
        fips_list = [p.FIPS_ID for p in patients if p.FIPS_ID]
        sdoh_map = {
            s.tract_fips: s 
            for s in CurrentCommunity.objects.filter(tract_fips__in=fips_list)
        }

        pred_map = {
            pred.patient_id: pred 
            for pred in CurrentPatientPrediction.objects.filter(patient__in=patients).order_by('prediction_timestamp')
        }

        # Group by county and by tract_fips
        county_groups = defaultdict(list)
        tract_groups = defaultdict(list)

        for p in patients:
            pred = pred_map.get(p.PATIENT_ID)
            if not pred:
                try:
                    engine.predict_current_patient(p, save_to_db=True)
                    pred = CurrentPatientPrediction.objects.filter(patient=p).order_by('-prediction_timestamp').first()
                except Exception as e:
                    logger.error(f"Failed to calculate current prediction for {p.PATIENT_ID}: {e}")

            # update our local pred map in case we added it
            if pred:
                pred_map[p.PATIENT_ID] = pred

            sdoh = sdoh_map.get(p.FIPS_ID)
            county_name = sdoh.county_name if sdoh and sdoh.county_name else 'California County'
            county_groups[county_name].append((p, sdoh, pred))
            tract_groups[p.FIPS_ID].append((p, sdoh, pred))

        county_list = []
        total_high_priority_all = 0

        # Score weights for risk level (1.0 = Very Low, 5.0 = Critical/Very High)
        risk_weights_5 = {'Very Low': 1.0, 'Low': 2.0, 'Moderate': 3.0, 'High': 4.0, 'Critical': 5.0}

        risk_level_map = {
            'VERY HIGH': 'Critical',
            'CRITICAL': 'Critical',
            'HIGH': 'High',
            'MEDIUM': 'Moderate',
            'LOW': 'Low',
            'VERY LOW': 'Very Low'
        }
        level_3_map = {
            'VERY HIGH': 'High',
            'CRITICAL': 'High',
            'HIGH': 'High',
            'MEDIUM': 'Moderate',
            'LOW': 'Low',
            'VERY LOW': 'Low'
        }

        for county_name, items in county_groups.items():
            total_members = len(items)
            counts_5_class = {'Critical': 0, 'High': 0, 'Moderate': 0, 'Low': 0, 'Very Low': 0}
            counts_3_class = {'High': 0, 'Moderate': 0, 'Low': 0}
            
            poverty_vals = []
            housing_vals = []
            unemployment_vals = []
            uninsured_vals = []
            food_vals = []
            income_vals = []
            
            county_member_details = []
            driver_counts = defaultdict(int)
            total_score_sum = 0.0

            county_patients_only = [p for p, sdoh, pred in items]

            for p, sdoh, pred in items:
                if pred:
                    level_5 = risk_level_map.get(pred.final_current_risk_level, 'Low')
                    level_3 = level_3_map.get(pred.final_current_risk_level, 'Low')
                    driver, driver_type = get_current_prediction_driver(pred)
                    priority = pred.intervention_priority if hasattr(pred, 'intervention_priority') else f"{level_5} priority intervention"
                else:
                    level_5 = 'Low'
                    level_3 = 'Low'
                    driver = 'Tract SDOH Factors'
                    driver_type = 'SDOH'
                    priority = 'Low priority intervention'
                
                if level_5 in counts_5_class:
                    counts_5_class[level_5] += 1
                if level_3 in counts_3_class:
                    counts_3_class[level_3] += 1

                total_score_sum += risk_weights_5.get(level_5, 2.0)
                driver_counts[driver] += 1

                if sdoh:
                    if sdoh.poverty_rate is not None: poverty_vals.append(sdoh.poverty_rate)
                    if sdoh.housing_cost_burden is not None: housing_vals.append(sdoh.housing_cost_burden)
                    if sdoh.unemployment_rate is not None: unemployment_vals.append(sdoh.unemployment_rate)
                    if sdoh.uninsured_rate is not None: uninsured_vals.append(sdoh.uninsured_rate)
                    if sdoh.low_access_population_rate is not None: food_vals.append(sdoh.low_access_population_rate)
                    if sdoh.median_household_income is not None: income_vals.append(sdoh.median_household_income)

                # Mapped class probabilities to get a confidence value
                if pred:
                    probs = {
                        'VERY LOW': pred.clinical_probability_very_low,
                        'LOW': pred.clinical_probability_low,
                        'MEDIUM': pred.clinical_probability_medium,
                        'HIGH': pred.clinical_probability_high,
                        'VERY HIGH': pred.clinical_probability_very_high,
                        'CRITICAL': pred.clinical_probability_very_high
                    }
                    conf_val_5 = probs.get(pred.clinical_risk_level, 0.5) * 100.0
                    conf_val_3 = pred.clinical_probability_high * 100.0 # fallback
                else:
                    conf_val_5 = 50.0
                    conf_val_3 = 50.0

                county_member_details.append({
                    "id": p.PATIENT_ID,
                    "patient_id": p.PATIENT_ID,
                    "name": p.PATIENT_NAME or f"Patient {p.PATIENT_ID}",
                    "tract_fips": p.FIPS_ID,
                    "future_risk_5": level_5,
                    "future_risk_5_confidence_pct": round(conf_val_5, 1),
                    "future_risk_3": level_3,
                    "future_risk_3_confidence_pct": round(conf_val_3, 1),
                    "driver": driver,
                    "driver_type": driver_type,
                    "priority": priority,
                    "encounters": int(p.EMERGENCY_VISITS or 0) + int(p.INPATIENT_ADMISSIONS or 0) + int(p.OUTPATIENT_VISITS or 0),
                    "ed_visits": int(p.EMERGENCY_VISITS or 0),
                    "ip_visits": int(p.INPATIENT_ADMISSIONS or 0),
                })

            high_risk_count = counts_5_class['Critical'] + counts_5_class['High']
            total_high_priority_all += high_risk_count

            avg_pov = sum(poverty_vals) / len(poverty_vals) if poverty_vals else 0.0
            avg_housing = sum(housing_vals) / len(housing_vals) if housing_vals else 0.0
            avg_unemp = sum(unemployment_vals) / len(unemployment_vals) if unemployment_vals else 0.0
            avg_unins = sum(uninsured_vals) / len(uninsured_vals) if uninsured_vals else 0.0
            avg_food = sum(food_vals) / len(food_vals) if food_vals else 0.0
            avg_income = sum(income_vals) / len(income_vals) if income_vals else 0.0

            # Average risk (1.0 to 5.0 scale)
            avg_future_risk_num = round(total_score_sum / total_members, 1) if total_members > 0 else 2.0

            # SDOH Environment classification
            if avg_pov >= 20.0 or avg_housing >= 30.0:
                sdoh_env_label = 'High Risk'
            elif avg_pov >= 12.0 or avg_housing >= 20.0:
                sdoh_env_label = 'Moderate Risk'
            else:
                sdoh_env_label = 'Low / Stable'

            # Calculate composite priority score (0-100)
            risk_ratio = (counts_5_class['Critical'] * 1.0 + counts_5_class['High'] * 0.8 + counts_5_class['Moderate'] * 0.4) / total_members
            sdoh_factor = min(1.0, (avg_pov / 25.0 + avg_housing / 35.0) / 2.0)
            priority_score = int(min(96, max(30, (risk_ratio * 60 + sdoh_factor * 40))))

            # Determine status
            if counts_5_class['Critical'] > 0 or (high_risk_count / total_members >= 0.5):
                status_label = 'Critical'
                status_color = 'bg-error/10 text-error border-error/20'
            elif high_risk_count > 0:
                status_label = 'Elevated'
                status_color = 'bg-rose-100 text-rose-800 border-rose-200'
            elif counts_5_class['Moderate'] > 0:
                status_label = 'Moderate'
                status_color = 'bg-amber-100 text-amber-800 border-amber-200'
            else:
                status_label = 'Stable'
                status_color = 'bg-teal-100 text-teal-800 border-teal-200'

            # Aggregate stored per-patient SHAP drivers
            pop_sdoh_drivers, pop_clin_drivers = compute_current_population_drivers(county_patients_only, pred_map)

            # Top drivers preview
            top_drivers = []
            for d_name, d_cnt in sorted(driver_counts.items(), key=lambda x: -x[1])[:3]:
                top_drivers.append({
                    "name": d_name,
                    "count": d_cnt,
                    "percentage": int(round(d_cnt / total_members * 100)),
                    "color": "bg-error" if "Inpatient" in d_name or "Emergency" in d_name or "Severe" in d_name else "bg-primary"
                })

            coords = CALIFORNIA_COUNTY_COORDS.get(county_name, [36.7783, -119.4179])

            county_list.append({
                "id": county_name,
                "name": county_name,
                "county": county_name,
                "state": "California",
                "type": "county",
                "lat": coords[0],
                "lng": coords[1],
                "total_members": total_members,
                "high_risk_members": high_risk_count,
                "priorityScore": priority_score,
                "status": status_label,
                "statusColor": status_color,
                "average_future_risk": avg_future_risk_num,
                "sdoh_environment": sdoh_env_label,
                "future_risk_5_breakdown": counts_5_class,
                "future_risk_3_breakdown": counts_3_class,
                "sdoh_averages": {
                    "poverty": round(avg_pov, 1),
                    "housing_burden": round(avg_housing, 1),
                    "income": round(avg_income, 0),
                    "unemployment": round(avg_unemp, 1),
                    "uninsured": round(avg_unins, 1),
                    "food_access": round(avg_food, 1),
                },
                "sdoh_drivers": pop_sdoh_drivers,
                "clinical_drivers": pop_clin_drivers,
                "drivers": top_drivers,
                "members": county_member_details,
            })

        # Sort counties by priorityScore descending
        county_list.sort(key=lambda c: (-c['priorityScore'], -c['total_members']))

        # Build Census Tract List (Tract-Level View)
        import hashlib
        tract_list = []
        for tract_fips, items in tract_groups.items():
            first_p, sdoh, first_pred = items[0]
            county_name = sdoh.county_name if sdoh and sdoh.county_name else 'California'
            base_coords = CALIFORNIA_COUNTY_COORDS.get(county_name, [36.7783, -119.4179])
            
            # Deterministic tract offset calculation based on FIPS
            h = int(hashlib.md5(tract_fips.encode('utf-8')).hexdigest()[:8], 16)
            angle = (h % 360) * 3.14159 / 180.0
            dist = ((h >> 8) % 100) / 100.0 * 0.12 + 0.02
            t_lat = base_coords[0] + dist * 0.7 * (1 if (h % 2 == 0) else -1) * abs(hash(tract_fips + 'lat') % 100 / 100.0)
            t_lng = base_coords[1] + dist * 0.9 * (1 if ((h >> 4) % 2 == 0) else -1) * abs(hash(tract_fips + 'lng') % 100 / 100.0)

            t_members = len(items)
            counts_5 = {'Critical': 0, 'High': 0, 'Moderate': 0, 'Low': 0, 'Very Low': 0}
            counts_3 = {'High': 0, 'Moderate': 0, 'Low': 0}
            tract_member_details = []
            t_driver_counts = defaultdict(int)
            t_score_sum = 0.0

            tract_patients_only = [p for p, s, pr in items]

            for p, s, pr in items:
                if pr:
                    level_5 = risk_level_map.get(pr.final_current_risk_level, 'Low')
                    level_3 = level_3_map.get(pr.final_current_risk_level, 'Low')
                    driver, driver_type = get_current_prediction_driver(pr)
                    priority = pr.intervention_priority if hasattr(pr, 'intervention_priority') else f"{level_5} priority intervention"
                else:
                    level_5 = 'Low'
                    level_3 = 'Low'
                    driver = 'Tract SDOH Factors'
                    driver_type = 'SDOH'
                    priority = 'Low priority intervention'

                if level_5 in counts_5: counts_5[level_5] += 1
                if level_3 in counts_3: counts_3[level_3] += 1
                t_score_sum += risk_weights_5.get(level_5, 2.0)
                t_driver_counts[driver] += 1

                if pr:
                    probs = {
                        'VERY LOW': pr.clinical_probability_very_low,
                        'LOW': pr.clinical_probability_low,
                        'MEDIUM': pr.clinical_probability_medium,
                        'HIGH': pr.clinical_probability_high,
                        'VERY HIGH': pr.clinical_probability_very_high,
                        'CRITICAL': pr.clinical_probability_very_high
                    }
                    conf_val_5 = probs.get(pr.clinical_risk_level, 0.5) * 100.0
                    conf_val_3 = pr.clinical_probability_high * 100.0
                else:
                    conf_val_5 = 50.0
                    conf_val_3 = 50.0

                tract_member_details.append({
                    "id": p.PATIENT_ID,
                    "patient_id": p.PATIENT_ID,
                    "name": p.PATIENT_NAME or f"Patient {p.PATIENT_ID}",
                    "tract_fips": p.FIPS_ID,
                    "future_risk_5": level_5,
                    "future_risk_5_confidence_pct": round(conf_val_5, 1),
                    "future_risk_3": level_3,
                    "future_risk_3_confidence_pct": round(conf_val_3, 1),
                    "driver": driver,
                    "driver_type": driver_type,
                    "priority": priority,
                    "encounters": int(p.EMERGENCY_VISITS or 0) + int(p.INPATIENT_ADMISSIONS or 0) + int(p.OUTPATIENT_VISITS or 0),
                    "ed_visits": int(p.EMERGENCY_VISITS or 0),
                    "ip_visits": int(p.INPATIENT_ADMISSIONS or 0),
                })

            high_count = counts_5['Critical'] + counts_5['High']
            pov_val = round(float(sdoh.poverty_rate or 0.0), 1) if sdoh else 0.0
            housing_val = round(float(sdoh.housing_cost_burden or 0.0), 1) if sdoh else 0.0
            income_val = round(float(sdoh.median_household_income or 0.0), 0) if sdoh else 0.0
            unemp_val = round(float(sdoh.unemployment_rate or 0.0), 1) if sdoh else 0.0
            unins_val = round(float(sdoh.uninsured_rate or 0.0), 1) if sdoh else 0.0
            food_val = round(float(sdoh.low_access_population_rate or 0.0), 1) if sdoh else 0.0
            veh_val = round(float(sdoh.no_vehicle_rate or 0.0), 1) if sdoh else 0.0
            disab_val = round(float(sdoh.disability_rate or 0.0), 1) if sdoh else 0.0
            broad_val = round(float(sdoh.no_internet_access_rate or 0.0), 1) if sdoh else 0.0
            edu_val = 0.0

            # Average risk (1.0 to 5.0 scale)
            t_avg_future_risk = round(t_score_sum / t_members, 1) if t_members > 0 else 2.0

            # SDOH Environment classification
            if pov_val >= 20.0 or housing_val >= 30.0:
                t_sdoh_env = 'High Risk'
            elif pov_val >= 12.0 or housing_val >= 20.0:
                t_sdoh_env = 'Moderate Risk'
            else:
                t_sdoh_env = 'Low / Stable'

            # Determine dominant status
            if counts_5['Critical'] > 0:
                t_status = 'Critical'
                t_status_color = 'bg-error/10 text-error border-error/20'
            elif counts_5['High'] > 0:
                t_status = 'Elevated'
                t_status_color = 'bg-rose-100 text-rose-800 border-rose-200'
            elif counts_5['Moderate'] > 0:
                t_status = 'Moderate'
                t_status_color = 'bg-amber-100 text-amber-800 border-amber-200'
            else:
                t_status = 'Stable'
                t_status_color = 'bg-teal-100 text-teal-800 border-teal-200'

            t_priority_score = int(min(98, max(25, (90 if t_status == 'Critical' else (78 if t_status == 'Elevated' else (55 if t_status == 'Moderate' else 28))) + (pov_val * 0.2))))

            # Aggregate stored per-patient SHAP drivers for this tract
            t_sdoh_drivers, t_clin_drivers = compute_current_population_drivers(tract_patients_only, pred_map)

            t_top_drivers = []
            if first_pred:
                drv, drv_t = get_current_prediction_driver(first_pred)
            else:
                drv, drv_t = 'Tract SDOH Factors', 'SDOH'
            t_top_drivers.append({
                "name": drv,
                "count": t_members,
                "percentage": 100,
                "color": "bg-primary"
            })

            tract_list.append({
                "id": tract_fips,
                "tract_fips": tract_fips,
                "name": f"Tract {tract_fips}",
                "county": county_name,
                "state": "California",
                "type": "tract",
                "lat": round(t_lat, 5),
                "lng": round(t_lng, 5),
                "total_members": t_members,
                "high_risk_members": high_count,
                "priorityScore": t_priority_score,
                "status": t_status,
                "statusColor": t_status_color,
                "average_future_risk": t_avg_future_risk,
                "sdoh_environment": t_sdoh_env,
                "future_risk_5_breakdown": counts_5,
                "future_risk_3_breakdown": counts_3,
                "primary_driver": drv,
                "driver_type": drv_t,
                "sdoh_metrics": {
                    "poverty": pov_val,
                    "housing_burden": housing_val,
                    "income": income_val,
                    "unemployment": unemp_val,
                    "uninsured": unins_val,
                    "food_access": food_val,
                    "no_vehicle": veh_val,
                    "disability": disab_val,
                    "broadband": broad_val,
                    "education": edu_val,
                },
                "sdoh_averages": {
                    "poverty": pov_val,
                    "housing_burden": housing_val,
                    "income": income_val,
                    "unemployment": unemp_val,
                    "uninsured": unins_val,
                    "food_access": food_val,
                },
                "sdoh_drivers": t_sdoh_drivers,
                "clinical_drivers": t_clin_drivers,
                "drivers": t_top_drivers,
                "members": tract_member_details,
            })

        tract_list.sort(key=lambda t: (-t['priorityScore'], -t['total_members']))

        response_data = {
            "total_counties": len(county_list),
            "total_tracts": len(tract_list),
            "total_members": len(patients),
            "total_high_risk_members": total_high_priority_all,
            "counties": county_list,
            "tracts": tract_list,
        }
        # Store in in-memory cache
        _MAP_CACHE[cache_key] = (time.time(), response_data)
        return Response(response_data, status=status.HTTP_200_OK)


class CountyDetailRiskView(APIView):
    """
    GET /api/geographic-risk/county/<county_id>/
    GET /api/map/counties/<county_id>/
    
    Provides deep population-level intelligence for a single selected county:
    - Overall members & high/critical priority counts
    - 5-Class future risk breakdown with average risk calculation
    - SDOH environment vulnerability classification
    - Top population TreeSHAP SDOH Drivers
    - Top population TreeSHAP Clinical Drivers
    - Full list of members residing in that county
    """
    def get(self, request, county_id):
        import logging
        logger = logging.getLogger(__name__)

        from .current_prediction_engine import get_current_engine
        engine = get_current_engine()

        # Clean county ID search term
        cleaned_search = county_id.replace('-', ' ').replace('_', ' ').strip().lower()
        
        # Match CurrentCommunity tracts for this county
        sdoh_tracts = CurrentCommunity.objects.filter(county_name__icontains=cleaned_search)
        tract_fips_list = [s.tract_fips for s in sdoh_tracts]
        
        # Match patients residing in these tracts
        patients = list(CurrentPatient.objects.filter(FIPS_ID__in=tract_fips_list).order_by('PATIENT_ID'))
        
        # Fallback search if no patients by tract match directly
        if not patients:
            all_patients = CurrentPatient.objects.all()
            for p in all_patients:
                comm = CurrentCommunity.objects.filter(tract_fips=p.FIPS_ID).first()
                if comm and cleaned_search in (comm.county_name or '').lower():
                    patients.append(p)

        if not patients:
            # Return empty structure gracefully with 200 OK so UI can show empty state without crashing
            county_display_name = county_id.title()
            if 'County' not in county_display_name:
                county_display_name += ' County'
            return Response({
                "county": {
                    "id": county_id,
                    "name": county_display_name,
                    "state": "California"
                },
                "members": {
                    "total": 0,
                    "high_critical": 0
                },
                "risk_distribution": {
                    "critical": 0,
                    "high": 0,
                    "moderate": 0,
                    "low": 0,
                    "very_low": 0
                },
                "average_future_risk": 0.0,
                "sdoh_environment": "No Data",
                "sdoh_drivers": [],
                "clinical_drivers": [],
                "member_list": []
            }, status=status.HTTP_200_OK)

        # Get county name from the first patient's community
        first_comm = CurrentCommunity.objects.filter(tract_fips=patients[0].FIPS_ID).first()
        county_name = first_comm.county_name if first_comm else f"{county_id.title()} County"

        sdoh_map = {s.tract_fips: s for s in CurrentCommunity.objects.filter(tract_fips__in=[p.FIPS_ID for p in patients])}
        pred_map = {pred.patient_id: pred for pred in CurrentPatientPrediction.objects.filter(patient__in=patients).order_by('prediction_timestamp')}

        counts_5 = {'Critical': 0, 'High': 0, 'Moderate': 0, 'Low': 0, 'Very Low': 0}
        counts_3 = {'High': 0, 'Moderate': 0, 'Low': 0}
        risk_weights_5 = {'Very Low': 1.0, 'Low': 2.0, 'Moderate': 3.0, 'High': 4.0, 'Critical': 5.0}
        total_score_sum = 0.0
        poverty_vals = []
        housing_vals = []
        member_details = []

        risk_level_map = {
            'VERY HIGH': 'Critical',
            'CRITICAL': 'Critical',
            'HIGH': 'High',
            'MEDIUM': 'Moderate',
            'LOW': 'Low',
            'VERY LOW': 'Very Low'
        }
        level_3_map = {
            'VERY HIGH': 'High',
            'CRITICAL': 'High',
            'HIGH': 'High',
            'MEDIUM': 'Moderate',
            'LOW': 'Low',
            'VERY LOW': 'Low'
        }

        for p in patients:
            pred = pred_map.get(p.PATIENT_ID)
            if not pred:
                try:
                    engine.predict_current_patient(p, save_to_db=True)
                    pred = CurrentPatientPrediction.objects.filter(patient=p).order_by('-prediction_timestamp').first()
                except Exception as e:
                    logger.error(f"Failed to calculate current prediction for {p.PATIENT_ID}: {e}")

            if pred:
                pred_map[p.PATIENT_ID] = pred
                level_5 = risk_level_map.get(pred.final_current_risk_level, 'Low')
                level_3 = level_3_map.get(pred.final_current_risk_level, 'Low')
                driver, driver_type = get_current_prediction_driver(pred)
                priority = pred.intervention_priority if hasattr(pred, 'intervention_priority') else f"{level_5} priority intervention"
            else:
                level_5 = 'Low'
                level_3 = 'Low'
                driver = 'Tract SDOH Factors'
                driver_type = 'SDOH'
                priority = 'Low priority intervention'

            if level_5 in counts_5: counts_5[level_5] += 1
            if level_3 in counts_3: counts_3[level_3] += 1
            total_score_sum += risk_weights_5.get(level_5, 2.0)

            sdoh = sdoh_map.get(p.FIPS_ID)
            if sdoh:
                if sdoh.poverty_rate is not None: poverty_vals.append(sdoh.poverty_rate)
                if sdoh.housing_cost_burden is not None: housing_vals.append(sdoh.housing_cost_burden)

            member_details.append({
                "id": p.PATIENT_ID,
                "patient_id": p.PATIENT_ID,
                "name": p.PATIENT_NAME or f"Patient {p.PATIENT_ID}",
                "tract_fips": p.FIPS_ID,
                "future_risk_5": level_5,
                "future_risk_3": level_3,
                "driver": driver,
                "driver_type": driver_type,
                "priority": priority,
                "encounters": int(p.EMERGENCY_VISITS or 0) + int(p.INPATIENT_ADMISSIONS or 0) + int(p.OUTPATIENT_VISITS or 0),
                "ed_visits": int(p.EMERGENCY_VISITS or 0),
                "ip_visits": int(p.INPATIENT_ADMISSIONS or 0),
            })

        total_members = len(patients)
        high_critical = counts_5['Critical'] + counts_5['High']
        avg_future_risk = round(total_score_sum / total_members, 1) if total_members > 0 else 2.0
        avg_pov = sum(poverty_vals) / len(poverty_vals) if poverty_vals else 0.0
        avg_housing = sum(housing_vals) / len(housing_vals) if housing_vals else 0.0

        if avg_pov >= 20.0 or avg_housing >= 30.0:
            sdoh_env = 'High Risk'
        elif avg_pov >= 12.0 or avg_housing >= 20.0:
            sdoh_env = 'Moderate Risk'
        else:
            sdoh_env = 'Low / Stable'

        sdoh_drivers, clinical_drivers = compute_current_population_drivers(patients, pred_map)

        return Response({
            "county": {
                "id": county_id,
                "name": county_name,
                "state": "California"
            },
            "members": {
                "total": total_members,
                "high_critical": high_critical
            },
            "risk_distribution": {
                "critical": counts_5['Critical'],
                "high": counts_5['High'],
                "moderate": counts_5['Moderate'],
                "low": counts_5['Low'],
                "very_low": counts_5['Very Low']
            },
            "future_risk_5_breakdown": counts_5,
            "future_risk_3_breakdown": counts_3,
            "average_future_risk": avg_future_risk,
            "sdoh_environment": sdoh_env,
            "sdoh_drivers": sdoh_drivers,
            "clinical_drivers": clinical_drivers,
            "member_list": member_details
        }, status=status.HTTP_200_OK)



class OverviewView(APIView):
    """
    GET /api/overview/
    
    Aggregates real-time population metrics from PostgreSQL and stored predictions:
    - Summary Cards (Total Members, High Future Risk 5-Class, High Social Risk, High Future Risk 3-Class, Priority Members, Interventions Done)
    - Population Risk Synthesis (Clinical Risk %, Social Risk %, Combined Risk %, AI Model Confidence)
    - Population Social Risk Drivers (Economic Stability, Housing, Food Access, Transportation, Education, Healthcare Access)
    - Impact of SDOH on Prioritization (Clinical-Only High-Risk, Members Elevated by SDOH, Clinical+SDOH High-Risk)
    - Priority Members Table (Top members requiring attention with real IDs, drivers, and actions)
    """
    def get(self, request):
        current_patients = list(CurrentPatient.objects.all().order_by('PATIENT_ID'))
        total_patients = len(current_patients)
        if total_patients == 0:
            return Response({"error": "No patient records found"}, status=status.HTTP_404_NOT_FOUND)

        # Fetch historical patient mapping to detect overlaps (100 records)
        past_patients_map = {
            p.patient_id: p
            for p in Patient.objects.all()
        }

        # Prefetch current predictions (oldest first, so newest overwrites in dictionary)
        curr_pred_map = {
            pred.patient_id: pred
            for pred in CurrentPatientPrediction.objects.all().order_by('prediction_timestamp')
        }

        # Prefetch historical/future risk predictions (oldest first, so newest overwrites in dictionary)
        future_pred_map = {
            pred.patient.patient_id: pred
            for pred in PatientRiskPrediction.objects.all().select_related('patient').order_by('created_at')
        }

        # Prefetch current communities to map county names
        communities_map = {
            c.tract_fips: c
            for c in CurrentCommunity.objects.all()
        }

        # Prefetch historical communities to map education rates
        hist_communities_map = {
            c.tract_fips: c
            for c in CommunitySDOH.objects.all()
        }

        high_5_count = 0
        high_3_count = 0
        high_sdoh_count = 0
        clinical_only_high = 0
        elevated_by_sdoh = 0
        combined_high = 0
        high_priority_count = 0

        poverty_list = []
        housing_list = []
        food_list = []
        vehicle_list = []
        education_list = []
        uninsured_list = []
        confidences_list = []

        # Track risk level counts and feature averages dynamically
        risk_level_counts = {
            'Critical': 0,
            'High': 0,
            'Medium': 0,
            'Low': 0,
            'Very Low': 0
        }
        tier_stats = {
            'Critical': {'clinical': [], 'social': [], 'deterioration': []},
            'High': {'clinical': [], 'social': [], 'deterioration': []},
            'Medium': {'clinical': [], 'social': [], 'deterioration': []},
            'Low': {'clinical': [], 'social': [], 'deterioration': []},
            'Very Low': {'clinical': [], 'social': [], 'deterioration': []}
        }

        patient_priority_rows = []

        for p in current_patients:
            latest_curr_pred = curr_pred_map.get(p.PATIENT_ID)
            latest_past_pred = future_pred_map.get(p.PATIENT_ID)
            past_patient = past_patients_map.get(p.PATIENT_ID)
            sdoh = communities_map.get(p.FIPS_ID)

            # Risk levels
            if latest_curr_pred:
                level_5 = latest_curr_pred.final_current_risk_level
                if level_5 == 'VERY HIGH':
                    level_5 = 'CRITICAL'
                score_5 = latest_curr_pred.final_current_risk_score
            else:
                level_5 = 'LOW'
                score_5 = 25.0

            if latest_past_pred:
                level_3 = latest_past_pred.future_risk_3_level
                score_3 = latest_past_pred.future_risk_probabilities or {}
                conf_3 = latest_past_pred.future_risk_3_confidence or 0.8
            else:
                level_3 = 'N/A'
                score_3 = {}
                conf_3 = 0.8

            confidences_list.append(conf_3)

            is_high_5 = level_5 in ['VERY HIGH', 'HIGH', 'VERY_HIGH', 'CRITICAL']
            is_high_3 = level_3 == 'High'

            if is_high_5:
                high_5_count += 1
                combined_high += 1
            if is_high_3:
                high_3_count += 1

            # Compute priority score: Current Risk Score (75/25 combined) + Future Risk Score (CatBoost probabilities)
            if latest_past_pred:
                prob = latest_past_pred.future_risk_probabilities or {}
                # Map 3-class CatBoost level to a 0-100 continuous score
                future_score = float(prob.get('Low', 0.0)) * 20.0 + float(prob.get('Moderate', 0.0)) * 60.0 + float(prob.get('High', 0.0)) * 100.0
                priority_score = 0.5 * (score_5 / 100.0) + 0.5 * (future_score / 100.0)
            else:
                priority_score = score_5 / 100.0

            # Map aggregated Priority Risk Score to Priority Level and styling
            if priority_score >= 0.75:
                priority_level = 'CRITICAL'
                status_text = 'Needs Review'
                status_color = 'bg-error'
                priority_color = 'bg-error/10 text-error border-error/20'
            elif priority_score >= 0.65:
                priority_level = 'HIGH'
                status_text = 'Needs Review'
                status_color = 'bg-error'
                priority_color = 'bg-orange-100 text-orange-800 border border-orange-200'
            elif priority_score >= 0.40:
                priority_level = 'MEDIUM'
                status_text = 'Active Monitoring'
                status_color = 'bg-amber-500'
                priority_color = 'bg-amber-100 text-amber-800 border border-amber-200'
            elif priority_score >= 0.20:
                priority_level = 'LOW'
                status_text = 'Stable'
                status_color = 'bg-teal-500'
                priority_color = 'bg-teal-100 text-teal-800 border border-teal-200'
            else:
                priority_level = 'VERY LOW'
                status_text = 'Stable'
                status_color = 'bg-teal-500'
                priority_color = 'bg-emerald-100 text-emerald-800 border border-emerald-200'

            if priority_level in ['CRITICAL', 'HIGH']:
                high_priority_count += 1

            # SDOH drivers
            if latest_curr_pred and latest_curr_pred.sdoh_feature_contribution_percentages:
                contributions = sorted(latest_curr_pred.sdoh_feature_contribution_percentages.items(), key=lambda item: -item[1])
                primary_driver = contributions[0][0].replace('_', ' ').title() if contributions else 'Tract SDOH Factors'
            elif latest_past_pred:
                primary_driver = latest_past_pred.primary_driver or 'Tract SDOH Factors'
            else:
                primary_driver = 'Tract SDOH Factors'

            driver_type = 'Clinical' if (latest_curr_pred and latest_curr_pred.clinical_risk_score > latest_curr_pred.community_risk_score) else 'SDOH'

            # SDOH metrics
            pov = float(sdoh.poverty_rate or 0) if sdoh else 0.0
            house = float(sdoh.housing_cost_burden or 0) if sdoh else 0.0
            food = float(sdoh.low_access_population_rate or 0) if sdoh else 0.0
            veh = float(sdoh.no_vehicle_rate or 0) if sdoh else 0.0
            unins = float(sdoh.uninsured_rate or 0) if sdoh else 0.0
            unemp = float(sdoh.unemployment_rate or 0) if sdoh else 0.0
            disab = float(sdoh.disability_rate or 0) if sdoh else 0.0
            internet = float(sdoh.no_internet_access_rate or 0) if sdoh else 0.0

            if pov >= 20.0 or house >= 30.0:
                high_sdoh_count += 1

            hist_sdoh = hist_communities_map.get(p.FIPS_ID)
            edu_deficit = 100.0 - float(hist_sdoh.education_2022) if hist_sdoh and hist_sdoh.education_2022 is not None else 0.0

            if sdoh:
                poverty_list.append(pov)
                housing_list.append(house)
                food_list.append(food)
                vehicle_list.append(veh)
                uninsured_list.append(unins)
                education_list.append(edu_deficit)

            # Categorize clinical vs SDOH elevation
            if is_high_5:
                if driver_type == 'Clinical':
                    clinical_only_high += 1
                else:
                    elevated_by_sdoh += 1

            # Priority Score (0-100)
            score_5_mapped = 90 if level_5 in ['VERY HIGH', 'CRITICAL'] else (75 if level_5 == 'HIGH' else (50 if level_5 == 'MEDIUM' else 25))
            sdoh_score = int(min(95, max(15, (pov * 1.5 + house * 1.0))))
            encounters = (p.EMERGENCY_VISITS or 0) + (p.INPATIENT_ADMISSIONS or 0) + (p.OUTPATIENT_VISITS or 0)
            clinical_score = int(min(98, max(10, encounters * 3 + int(p.EMERGENCY_VISITS or 0) * 15 + int(p.INPATIENT_ADMISSIONS or 0) * 25)))

            # Increment counts for the 5 tiers and calculate clinical, social, and deterioration scores
            display_level = 'Critical' if level_5 in ['VERY HIGH', 'CRITICAL'] else (
                'High' if level_5 == 'HIGH' else (
                    'Medium' if level_5 == 'MEDIUM' else (
                        'Low' if level_5 == 'LOW' else 'Very Low'
                    )
                )
            )
            risk_level_counts[display_level] += 1
            
            # Deterioration score mapping
            det_score = 88 if level_3 == 'High' else (62 if level_3 == 'Moderate' else (28 if level_3 == 'Low' else 15))
            
            tier_stats[display_level]['clinical'].append(clinical_score)
            tier_stats[display_level]['social'].append(sdoh_score)
            tier_stats[display_level]['deterioration'].append(det_score)

            patient_priority_rows.append({
                "id": p.PATIENT_ID,
                "name": p.PATIENT_NAME or f"Patient {p.PATIENT_ID}",
                "priority": level_5,
                "priorityColor": "bg-error/10 text-error border-error/20" if level_5 in ['VERY HIGH', 'HIGH', 'CRITICAL'] else ("bg-amber-100 text-amber-800 border-amber-200" if level_5 == 'MEDIUM' else "bg-teal-100 text-teal-800 border-teal-200"),
                "clinical": f"{clinical_score}%",
                "social": f"{sdoh_score}%",
                "future_risk_5": level_5,
                "future_risk_3": level_3,
                "future6": f"{int(min(95, score_5_mapped + 2))}%",
                "future12": f"{int(min(98, score_5_mapped + 5))}%",
                "priorityScore": int(priority_score * 100),
                "driver": primary_driver,
                "action": latest_curr_pred.intervention_priority if latest_curr_pred and hasattr(latest_curr_pred, 'intervention_priority') else f"{level_5} priority intervention",
                "status": status_text,
                "statusColor": status_color
            })

        # Sort priority members by priorityScore descending
        patient_priority_rows.sort(key=lambda r: -r['priorityScore'])

        # Summary Cards
        summary_cards = [
            { "title": "Total Members", "value": str(total_patients), "trend": "up", "subtext": f"{total_patients} enrolled in cohort", "trendType": "up" },
            { "title": "High Current Risk", "value": str(high_5_count), "trend": "up", "subtext": f"{round(high_5_count/total_patients*100, 1)}% of total cohort", "trendType": "up" },
            { "title": "High Social Risk", "value": str(high_sdoh_count), "trend": "flat", "subtext": f"{round(high_sdoh_count/total_patients*100, 1)}% high-need census tracts", "trendType": "flat" },
            { "title": "High Future Risk", "value": str(high_3_count), "trend": "up", "subtext": f"{round(high_3_count/total_patients*100, 1)}% CatBoost forecast", "trendType": "up" },
            { "title": "Priority Members", "value": str(high_priority_count), "trend": "down", "subtext": "Immediate outreach required", "trendType": "down" }
        ]

        # Population Risk Synthesis
        avg_clinical = int(round(sum((p.EMERGENCY_VISITS or 0) + (p.INPATIENT_ADMISSIONS or 0) + (p.OUTPATIENT_VISITS or 0) for p in current_patients) / total_patients * 3.5))
        avg_clinical = min(85, max(30, avg_clinical))
        avg_social = int(round(sum(poverty_list) / len(poverty_list) * 2.2)) if poverty_list else 35
        avg_combined = int(round((avg_clinical * 0.45 + avg_social * 0.55)))
        avg_conf = round((sum(confidences_list) / len(confidences_list) * 100), 1) if confidences_list else 91.5

        # Social Risk Drivers
        high_pov_pct = int(round(len([v for v in poverty_list if v >= 15.0]) / total_patients * 100)) if poverty_list else 42
        high_house_pct = int(round(len([v for v in housing_list if v >= 25.0]) / total_patients * 100)) if housing_list else 38
        high_food_pct = int(round(len([v for v in food_list if v >= 20.0]) / total_patients * 100)) if food_list else 25
        high_veh_pct = int(round(len([v for v in vehicle_list if v >= 10.0]) / total_patients * 100)) if vehicle_list else 22
        high_edu_pct = int(round(len([v for v in education_list if v >= 15.0]) / total_patients * 100)) if education_list else 15
        high_unins_pct = int(round(len([v for v in uninsured_list if v >= 10.0]) / total_patients * 100)) if uninsured_list else 12

        social_drivers = [
            { "name": "Economic Stability (Poverty)", "percentage": high_pov_pct, "color": "bg-error", "text": f"{high_pov_pct}% High Risk" },
            { "name": "Housing Burden & Instability", "percentage": high_house_pct, "color": "bg-error", "text": f"{high_house_pct}% High Risk" },
            { "name": "Food Desert & Insecurity", "percentage": high_food_pct, "color": "bg-primary", "text": f"{high_food_pct}% Moderate Risk" },
            { "name": "Transportation & No-Vehicle", "percentage": high_veh_pct, "color": "bg-primary", "text": f"{high_veh_pct}% Moderate Risk" },
            { "name": "Education Deficits", "percentage": high_edu_pct, "color": "bg-secondary", "text": f"{high_edu_pct}% Low Risk" },
            { "name": "Healthcare & Uninsured Rate", "percentage": high_unins_pct, "color": "bg-secondary", "text": f"{high_unins_pct}% Low Risk" },
        ]

        # Calculate averages for each risk tier
        def get_avg(lst, default):
            return int(round(sum(lst)/len(lst))) if lst else default

        risk_distribution = [
            {
                "name": "Critical",
                "value": risk_level_counts['Critical'],
                "color": "#ba1a1a",
                "clinical": get_avg(tier_stats['Critical']['clinical'], 85),
                "social": get_avg(tier_stats['Critical']['social'], 75),
                "deterioration": get_avg(tier_stats['Critical']['deterioration'], 90),
                "meaning": "Immediate Intervention",
                "actions": [
                    "Clinical assessment by provider within 24 hours",
                    "Nurse outreach for symptom checklist",
                    "Medication reconciliation review",
                    "SDOH barriers screening (housing/food)",
                    "Arrange urgent transportation assistance"
                ]
            },
            {
                "name": "High",
                "value": risk_level_counts['High'],
                "color": "#ff7900",
                "clinical": get_avg(tier_stats['High']['clinical'], 70),
                "social": get_avg(tier_stats['High']['social'], 60),
                "deterioration": get_avg(tier_stats['High']['deterioration'], 70),
                "meaning": "Active Care Management",
                "actions": [
                    "Designated care manager assignment",
                    "Regular telehealth wellness checks",
                    "Coordinate community SDOH support services",
                    "Primary care follow-up scheduling",
                    "Medication adherence support"
                ]
            },
            {
                "name": "Medium",
                "value": risk_level_counts['Medium'],
                "color": "#f1c40f",
                "clinical": get_avg(tier_stats['Medium']['clinical'], 50),
                "social": get_avg(tier_stats['Medium']['social'], 45),
                "deterioration": get_avg(tier_stats['Medium']['deterioration'], 45),
                "meaning": "Preventive Intervention",
                "actions": [
                    "Provide disease-specific education booklets",
                    "Annual wellness and screening coordination",
                    "Enroll in local nutrition or fitness classes",
                    "Assess minor social barriers dynamically"
                ]
            },
            {
                "name": "Low",
                "value": risk_level_counts['Low'],
                "color": "#005599",
                "clinical": get_avg(tier_stats['Low']['clinical'], 30),
                "social": get_avg(tier_stats['Low']['social'], 30),
                "deterioration": get_avg(tier_stats['Low']['deterioration'], 20),
                "meaning": "Routine Monitoring",
                "actions": [
                    "Automated portal check-ins",
                    "Standard screening reminder alerts",
                    "Preventive care checklist updates"
                ]
            },
            {
                "name": "Very Low",
                "value": risk_level_counts['Very Low'],
                "color": "#046a64",
                "clinical": get_avg(tier_stats['Very Low']['clinical'], 15),
                "social": get_avg(tier_stats['Very Low']['social'], 15),
                "deterioration": get_avg(tier_stats['Very Low']['deterioration'], 10),
                "meaning": "Maintain & Monitor",
                "actions": [
                    "General health newsletter updates",
                    "Standard wellness portal account features"
                ]
            }
        ]

        return Response({
            "summary_cards": summary_cards,
            "risk_synthesis": {
                "clinical_risk_pct": avg_clinical,
                "social_risk_pct": avg_social,
                "combined_risk_pct": avg_combined,
                "model_confidence_label": "High",
                "model_confidence_pct": avg_conf
            },
            "social_drivers": social_drivers,
            "risk_distribution": risk_distribution,
            "sdoh_impact": {
                "clinical_only_high": clinical_only_high,
                "elevated_by_sdoh": elevated_by_sdoh,
                "combined_high": combined_high,
                "headline": f"SDOH insights elevated {elevated_by_sdoh} additional members into the high-risk group."
            },
            "priority_members": patient_priority_rows[:10]
        }, status=status.HTTP_200_OK)


class InterventionsView(APIView):
    """
    GET /api/interventions/
    
    Returns prioritized intervention candidates from PostgreSQL with specific
    action recommendations mapped directly to their TreeSHAP drivers.
    """
    def get(self, request):
        current_patients = list(CurrentPatient.objects.all().order_by('PATIENT_ID'))
        # Fetch historical patient mapping to detect overlaps (100 records)
        past_patients_map = {
            p.patient_id: p
            for p in Patient.objects.all()
        }

        # Prefetch current predictions (oldest first, so newest overwrites in dictionary)
        curr_pred_map = {
            pred.patient_id: pred
            for pred in CurrentPatientPrediction.objects.all().order_by('prediction_timestamp')
        }

        # Prefetch historical/future risk predictions (oldest first, so newest overwrites in dictionary)
        future_pred_map = {
            pred.patient.patient_id: pred
            for pred in PatientRiskPrediction.objects.all().select_related('patient').order_by('created_at')
        }

        # Prefetch current communities to map county names
        communities_map = {
            c.tract_fips: c
            for c in CurrentCommunity.objects.all()
        }

        candidates = []
        for p in current_patients:
            latest_curr_pred = curr_pred_map.get(p.PATIENT_ID)
            latest_past_pred = future_pred_map.get(p.PATIENT_ID)
            past_patient = past_patients_map.get(p.PATIENT_ID)
            sdoh = communities_map.get(p.FIPS_ID)

            # Risk levels
            if latest_curr_pred:
                level_5 = latest_curr_pred.final_current_risk_level
                if level_5 == 'VERY HIGH':
                    level_5 = 'CRITICAL'
                score_5 = latest_curr_pred.final_current_risk_score
            else:
                level_5 = 'LOW'
                score_5 = 25.0

            if latest_past_pred:
                level_3 = latest_past_pred.future_risk_3_level
                score_3 = latest_past_pred.future_risk_probabilities or {}
            else:
                level_3 = 'N/A'
                score_3 = {}

            # Compute priority score: Current Risk Score (75/25 combined) + Future Risk Score (CatBoost probabilities)
            if latest_past_pred:
                prob = latest_past_pred.future_risk_probabilities or {}
                # Map 3-class CatBoost level to a 0-100 continuous score
                future_score = float(prob.get('Low', 0.0)) * 20.0 + float(prob.get('Moderate', 0.0)) * 60.0 + float(prob.get('High', 0.0)) * 100.0
                priority_score = 0.5 * (score_5 / 100.0) + 0.5 * (future_score / 100.0)
            else:
                priority_score = score_5 / 100.0

            # SDOH drivers
            if latest_curr_pred and latest_curr_pred.sdoh_feature_contribution_percentages:
                contributions = sorted(latest_curr_pred.sdoh_feature_contribution_percentages.items(), key=lambda item: -item[1])
                primary_driver = contributions[0][0].replace('_', ' ').title() if contributions else 'Tract SDOH Factors'
            elif latest_past_pred:
                primary_driver = latest_past_pred.primary_driver or 'Tract SDOH Factors'
            else:
                primary_driver = 'Tract SDOH Factors'

            driver_type = 'Clinical' if (latest_curr_pred and latest_curr_pred.clinical_risk_score > latest_curr_pred.community_risk_score) else 'SDOH'

            pov = float(sdoh.poverty_rate or 0) if sdoh else 0.0
            house = float(sdoh.housing_cost_burden or 0) if sdoh else 0.0

            # Tailor recommended intervention based on primary driver
            d_lower = primary_driver.lower()
            if 'poverty' in d_lower or 'income' in d_lower or 'economic' in d_lower:
                int_rec = 'Economic Support & CalFresh'
            elif 'housing' in d_lower or 'rent' in d_lower:
                int_rec = 'Housing Stabilization Support'
            elif 'food' in d_lower:
                int_rec = 'Food Desert & Nutrition Voucher'
            elif 'vehicle' in d_lower or 'transportation' in d_lower:
                int_rec = 'Medical Transportation Subsidy'
            elif 'broadband' in d_lower or 'digital' in d_lower:
                int_rec = 'Telehealth & Digital Access Subsidy'
            elif 'emergency' in d_lower or 'inpatient' in d_lower or 'encounter' in d_lower:
                int_rec = 'Acute Care Transition Coordination'
            elif 'chronic' in d_lower or 'condition' in d_lower:
                int_rec = 'Chronic Disease Self-Management'
            elif 'medication' in d_lower:
                int_rec = 'Medication Adherence Consultation'
            else:
                int_rec = 'Comprehensive SDOH Care Plan'

            priority_color = 'bg-error/10 text-error border-error/20' if priority_score >= 0.75 else ('bg-orange-100 text-orange-800 border-orange-200' if priority_score >= 0.65 else ('bg-amber-100 text-amber-800 border-amber-200' if priority_score >= 0.40 else 'bg-teal-100 text-teal-800 border-teal-200'))
            status_text = 'Suggested' if priority_score >= 0.65 else ('Under Review' if priority_score >= 0.40 else 'Active')
            status_color = 'bg-slate-400' if status_text == 'Suggested' else ('bg-amber-500' if status_text == 'Under Review' else 'bg-secondary')

            encounters = (p.EMERGENCY_VISITS or 0) + (p.INPATIENT_ADMISSIONS or 0) + (p.OUTPATIENT_VISITS or 0)
            clinical_risk_pct = int(min(98, max(15, encounters * 4 + int(p.EMERGENCY_VISITS or 0) * 15)))

            candidates.append({
                "id": p.PATIENT_ID,
                "name": p.PATIENT_NAME or f"Patient {p.PATIENT_ID}",
                "priority": 'CRITICAL' if priority_score >= 0.75 else ('HIGH' if priority_score >= 0.65 else ('MEDIUM' if priority_score >= 0.40 else 'LOW')),
                "priorityColor": priority_color,
                "clinicalRisk": f"{clinical_risk_pct}%",
                "sdohRisk": f"{int(min(95, max(20, pov * 1.5 + house * 1.0)))}%",
                "currentRisk": f"{int(score_5)}%",
                "future_risk_5": level_5,
                "future_risk_3": level_3,
                "future6": f"{int(min(95, score_5 + 3))}%",
                "future6Trend": "up" if priority_score >= 0.65 else "flat",
                "future12": f"{int(min(98, score_5 + 6))}%",
                "future12Trend": "up" if priority_score >= 0.65 else "flat",
                "priorityScore": int(priority_score * 100),
                "driver": primary_driver,
                "driver_type": driver_type,
                "intervention": int_rec,
                "action_headline": latest_curr_pred.intervention_priority if latest_curr_pred and hasattr(latest_curr_pred, 'intervention_priority') else f"{level_5} priority intervention",
                "status": status_text,
                "statusColor": status_color,
                "county": sdoh.county_name if sdoh else "California",
                "tract_fips": p.FIPS_ID
            })

        candidates.sort(key=lambda c: -c['priorityScore'])

        # Summary KPIs
        total_cand = len(candidates)
        high_priority_cands = len([c for c in candidates if c['priority'] in ['CRITICAL', 'HIGH']])
        sdoh_driven_cands = len([c for c in candidates if c['driver_type'] == 'SDOH'])
        suggested_cands = len([c for c in candidates if c['status'] == 'Suggested'])

        return Response({
            "summary": {
                "total_candidates": total_cand,
                "high_priority": high_priority_cands,
                "sdoh_driven": sdoh_driven_cands,
                "suggested_count": suggested_cands,
            },
            "candidates": candidates
        }, status=status.HTTP_200_OK)


from .current_prediction_engine import get_current_engine, COMMUNITY_STATS
from .models import CurrentPatient, CurrentCommunity, CurrentPatientPrediction, InterventionContact, CommunityInterventionNotification

class CurrentPatientListView(APIView):
    """
    GET /api/current-patients/
    
    Lists all current patients, optionally filtered by tract_fips.
    """
    def get(self, request):
        tract_fips = request.query_params.get('tract_fips')
        qs = CurrentPatient.objects.all()
        if tract_fips:
            qs = qs.filter(FIPS_ID=tract_fips)
        
        data = []
        for p in qs:
            data.append({
                "patient_id": p.PATIENT_ID,
                "name": p.PATIENT_NAME or f"Patient {p.PATIENT_ID}",
                "tract_fips": p.FIPS_ID,
                "age": p.AGE,
                "gender": p.GENDER,
                "chronic_count": p.CHRONIC_CONDITIONS,
                "conditions_count": p.CONDITIONS,
                "inpatient_visits": p.INPATIENT_ADMISSIONS,
                "ed_visits": p.EMERGENCY_VISITS,
                "outpatient_visits": p.OUTPATIENT_VISITS,
                "medications_count": p.MEDICATIONS,
                "procedures_count": p.PROCEDURES
            })
        return Response(data, status=status.HTTP_200_OK)


class CurrentPatientPredictView(APIView):
    """
    GET /api/current-patients/<str:patient_id>/predict/
    
    Evaluates or retrieves the latest current patient prediction record.
    """
    def get(self, request, patient_id):
        try:
            engine = get_current_engine()
            force_recalculate = request.query_params.get('force') == '1'
            
            # Check if prediction already exists in history to avoid redundant calculation
            latest_pred = CurrentPatientPrediction.objects.filter(patient__PATIENT_ID=patient_id).first()
            if latest_pred and not force_recalculate:
                # Format response from DB
                prob_dict = {
                    "very_low": latest_pred.clinical_probability_very_low,
                    "low": latest_pred.clinical_probability_low,
                    "medium": latest_pred.clinical_probability_medium,
                    "high": latest_pred.clinical_probability_high,
                    "very_high": latest_pred.clinical_probability_very_high
                }
                # Construct features list
                sdoh_features = []
                for feat in COMMUNITY_STATS.keys():
                    raw_val = latest_pred.raw_sdoh_values.get(feat, 0.0)
                    norm_val = latest_pred.normalized_sdoh_values.get(feat, 0.0)
                    risk_val = latest_pred.risk_oriented_sdoh_values.get(feat, 0.0)
                    contrib = latest_pred.sdoh_feature_contribution_percentages.get(feat, 0.0)
                    sdoh_features.append({
                        "feature": feat,
                        "display_name": feat.replace('_', ' ').title(),
                        "raw_value": raw_val,
                        "normalized_value": round(norm_val, 4),
                        "risk_value": round(risk_val, 4),
                        "contribution_percentage": round(contrib, 2)
                    })
                
                # Sort contributions
                contributions = sorted(
                    sdoh_features, 
                    key=lambda x: -x["contribution_percentage"]
                )
                
                response_data = {
                    "patient_id": patient_id,
                    "tract_fips": latest_pred.tract_fips,
                    "clinical": {
                        "risk_score": round(latest_pred.clinical_risk_score, 2),
                        "risk_level": latest_pred.clinical_risk_level,
                        "probabilities": prob_dict,
                        "shap_drivers": latest_pred.clinical_shap_drivers or []
                    },
                    "community": {
                        "risk_score": round(latest_pred.community_risk_score, 2),
                        "risk_level": latest_pred.community_risk_level,
                        "sdoh_features": sdoh_features,
                        "contributions": contributions
                    },
                    "final": {
                        "risk_score": round(latest_pred.final_current_risk_score, 2),
                        "risk_level": latest_pred.final_current_risk_level
                    }
                }
                return Response(response_data, status=status.HTTP_200_OK)
            
            # Predict and store
            result = engine.predict_current_patient(patient_id, save_to_db=True)
            return Response(result, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error predicting current risk: {e}", exc_info=True)
            return Response({"error": f"Prediction failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CurrentCommunityDetailView(APIView):
    """
    GET /api/current-communities/<str:tract_fips>/
    
    Returns the processed current community features, score, and contributions.
    """
    def get(self, request, tract_fips):
        community = CurrentCommunity.objects.filter(tract_fips=tract_fips).first()
        if not community:
            return Response({"error": f"Community tract '{tract_fips}' not found."}, status=status.HTTP_404_NOT_FOUND)
        
        # If not scored yet, calculate/evaluate using engine on a dummy patient or compute raw
        if community.community_risk_score is None:
            # Score it dynamically
            raw_sdoh = {}
            normalized_sdoh = {}
            risk_oriented_sdoh = {}
            sum_risk_values = 0.0
            feature_risk_values = {}

            for feat, stats in COMMUNITY_STATS.items():
                raw_val = getattr(community, feat) or 0.0
                raw_sdoh[feat] = float(raw_val)
                min_val = stats['min']
                max_val = stats['max']
                denom = (max_val - min_val) if max_val != min_val else 1.0
                norm_val = max(0.0, min(1.0, (raw_val - min_val) / denom))
                normalized_sdoh[feat] = float(norm_val)
                risk_val = 1.0 - norm_val if feat == 'median_household_income' else norm_val
                risk_oriented_sdoh[feat] = float(risk_val)
                feature_risk_values[feat] = risk_val
                sum_risk_values += risk_val

            community_risk_score = (sum_risk_values / 12.0) * 100.0
            engine = get_current_engine()
            community_risk_level = engine.get_risk_level_from_score(community_risk_score)
            
            contributions = []
            for feat, risk_val in feature_risk_values.items():
                pct = (risk_val / sum_risk_values * 100.0) if sum_risk_values > 0 else 8.33
                contributions.append({
                    "feature": feat,
                    "display_name": feat.replace('_', ' ').title(),
                    "raw_value": raw_sdoh[feat],
                    "normalized_value": norm_val,
                    "risk_value": risk_val,
                    "contribution_percentage": round(pct, 2)
                })
            contributions.sort(key=lambda x: -x["contribution_percentage"])
            
            # Save it
            community.normalized_values = normalized_sdoh
            community.risk_oriented_values = risk_oriented_sdoh
            community.feature_contribution_percentages = {c["feature"]: c["contribution_percentage"] for c in contributions}
            community.community_risk_score = community_risk_score
            community.community_risk_level = community_risk_level
            community.save()
        else:
            # Load from DB
            raw_sdoh = {feat: float(getattr(community, feat) or 0.0) for feat in COMMUNITY_STATS.keys()}
            normalized_sdoh = community.normalized_values or {}
            risk_oriented_sdoh = community.risk_oriented_values or {}
            
            contributions = []
            for feat in COMMUNITY_STATS.keys():
                raw_val = raw_sdoh.get(feat, 0.0)
                norm_val = normalized_sdoh.get(feat, 0.0)
                risk_val = risk_oriented_sdoh.get(feat, 0.0)
                contrib = (community.feature_contribution_percentages or {}).get(feat, 0.0)
                contributions.append({
                    "feature": feat,
                    "display_name": feat.replace('_', ' ').title(),
                    "raw_value": raw_val,
                    "normalized_value": norm_val,
                    "risk_value": risk_val,
                    "contribution_percentage": contrib
                })
            contributions.sort(key=lambda x: -x["contribution_percentage"])

        sdoh_features = [
            {
                "feature": c["feature"],
                "display_name": c["display_name"],
                "raw_value": c["raw_value"],
                "normalized_value": round(c["normalized_value"], 4),
                "risk_value": round(c["risk_value"], 4),
                "contribution_percentage": round(c["contribution_percentage"], 2)
            } for c in contributions
        ]

        return Response({
            "tract_fips": tract_fips,
            "county_name": community.county_name,
            "community_risk_score": round(community.community_risk_score, 2),
            "community_risk_level": community.community_risk_level,
            "sdoh_features": sdoh_features,
            "contributions": contributions
        }, status=status.HTTP_200_OK)


class BatchCurrentPredictView(APIView):
    """
    POST /api/current-patients/predict-all/
    
    Batch runs current predictions for all 120 patients.
    """
    def post(self, request):
        try:
            engine = get_current_engine()
            patients = CurrentPatient.objects.all()
            total_count = patients.count()
            
            results = []
            for patient in patients:
                res = engine.predict_current_patient(patient, save_to_db=True)
                results.append(res)
                
            return Response({
                "message": f"Successfully evaluated and saved current risk predictions for {len(results)} patients.",
                "total_patients": total_count,
                "predicted_count": len(results)
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Batch current prediction failed: {e}", exc_info=True)
            return Response({"error": f"Batch prediction failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ─── COMMUNITY INTERVENTION WORKFLOW VIEWS ───

SDOH_FEATURE_MAPPING = {
    'no_internet_access_rate': {
        'display_name': 'Broadband Access Limitation',
        'domain': 'Healthcare Access',
        'interventions': [
            'Mobile/community clinics setup',
            'Telehealth access extension programs',
            'Insurance enrollment assistance',
            'Community healthcare outreach programs',
            'Accessibility support for disabled individuals'
        ]
    },
    'disability_rate': {
        'display_name': 'Disability Prevalence Rate',
        'domain': 'Healthcare Access',
        'interventions': [
            'Mobile/community clinics setup',
            'Telehealth access extension programs',
            'Insurance enrollment assistance',
            'Community healthcare outreach programs',
            'Accessibility support for disabled individuals'
        ]
    },
    'uninsured_rate': {
        'display_name': 'Uninsured Population',
        'domain': 'Healthcare Access',
        'interventions': [
            'Mobile/community clinics setup',
            'Telehealth access extension programs',
            'Insurance enrollment assistance',
            'Community healthcare outreach programs',
            'Accessibility support for disabled individuals'
        ]
    },
    'poverty_rate': {
        'display_name': 'Poverty Rate',
        'domain': 'Social & Economic Services',
        'interventions': [
            'Financial assistance outreach',
            'Benefits enrollment support',
            'Employment assistance programs',
            'Job-training and skills programs',
            'Community resource navigation systems',
            'Education/resource support programs'
        ]
    },
    'unemployment_rate': {
        'display_name': 'Unemployment Rate',
        'domain': 'Social & Economic Services',
        'interventions': [
            'Financial assistance outreach',
            'Benefits enrollment support',
            'Employment assistance programs',
            'Job-training and skills programs',
            'Community resource navigation systems',
            'Education/resource support programs'
        ]
    },
    'limited_english_rate': {
        'display_name': 'Education Attainment Level',
        'domain': 'Social & Economic Services',
        'interventions': [
            'Financial assistance outreach',
            'Benefits enrollment support',
            'Employment assistance programs',
            'Job-training and skills programs',
            'Community resource navigation systems',
            'Education/resource support programs'
        ]
    },
    'median_household_income': {
        'display_name': 'Area Median Income',
        'domain': 'Social & Economic Services',
        'interventions': [
            'Financial assistance outreach',
            'Benefits enrollment support',
            'Employment assistance programs',
            'Job-training and skills programs',
            'Community resource navigation systems',
            'Education/resource support programs'
        ]
    },
    'social_vulnerability_index': {
        'display_name': 'Baseline Median Income',
        'domain': 'Social & Economic Services',
        'interventions': [
            'Financial assistance outreach',
            'Benefits enrollment support',
            'Employment assistance programs',
            'Job-training and skills programs',
            'Community resource navigation systems',
            'Education/resource support programs'
        ]
    },
    'low_access_population_rate': {
        'display_name': 'Food Access Limitation',
        'domain': 'Food & Nutrition',
        'interventions': [
            'Food assistance enrollment outreach',
            'Food distribution logistics setup',
            'Food bank & community pantry programs',
            'Nutrition assistance educational initiatives',
            'Healthy food access enhancement programs'
        ]
    },
    'low_access_households_no_vehicle': {
        'display_name': 'Food Access Limitation',
        'domain': 'Food & Nutrition',
        'interventions': [
            'Food assistance enrollment outreach',
            'Food distribution logistics setup',
            'Food bank & community pantry programs',
            'Nutrition assistance educational initiatives',
            'Healthy food access enhancement programs'
        ]
    },
    'no_vehicle_rate': {
        'display_name': 'Transportation Barrier',
        'domain': 'Transportation',
        'interventions': [
            'Non-emergency medical transportation support',
            'Community shuttle programs implementation',
            'Transportation assistance grants',
            'Transportation voucher programs setup'
        ]
    },
    'housing_cost_burden': {
        'display_name': 'Housing Cost Burden',
        'domain': 'Housing',
        'interventions': [
            'Housing assistance programs',
            'Rental assistance support',
            'Utility assistance programs',
            'Housing stability support services'
        ]
    }
}

def serialize_community_notification(n):
    return {
        'notification_id': n.notification_id,
        'county_fips': n.county_fips,
        'county_name': n.county_name,
        'municipality': n.municipality,
        'risk_score': n.risk_score,
        'risk_level': n.risk_level,
        'primary_driver': n.primary_driver,
        'primary_driver_shap': n.primary_driver_shap,
        'domain': n.domain,
        'priority': n.priority,
        'intervention': n.intervention,
        'reason': n.reason,
        'recipient_email': n.recipient_email,
        'email_type': n.email_type,
        'status': n.status,
        'ai_email_subject': n.ai_email_subject,
        'ai_email_body': n.ai_email_body,
        'created_at': n.created_at.isoformat(),
        'sent_at': n.sent_at.isoformat() if n.sent_at else None,
        'acknowledged_at': n.acknowledged_at.isoformat() if n.acknowledged_at else None,
        'resolved_at': n.resolved_at.isoformat() if n.resolved_at else None,
    }


class CommunityCountyListView(APIView):
    """
    GET /api/community/counties/
    """
    def get(self, request):
        from django.db.models import Avg, Count, Q
        agg = CurrentCommunity.objects.values('state_county_fips', 'county_name').annotate(
            total_tracts=Count('tract_fips'),
            avg_risk=Avg('community_risk_score'),
            high_tracts=Count('tract_fips', filter=Q(community_risk_level__in=['HIGH', 'VERY HIGH', 'CRITICAL'])),
            vhigh_tracts=Count('tract_fips', filter=Q(community_risk_level__in=['VERY HIGH', 'CRITICAL']))
        ).order_by('-avg_risk')

        counties = []
        for c in agg:
            fips = c['state_county_fips'].strip().zfill(5)
            avg_risk = c['avg_risk'] or 0.0
            total_tracts = c['total_tracts']
            high = c['high_tracts']
            vhigh = c['vhigh_tracts']
            
            if avg_risk >= 30.0:
                risk_level = 'CRITICAL'
                priority = 'Critical'
            elif avg_risk >= 27.0:
                risk_level = 'HIGH'
                priority = 'High'
            elif avg_risk >= 24.0:
                risk_level = 'MEDIUM'
                priority = 'Moderate'
            elif avg_risk >= 20.0:
                risk_level = 'LOW'
                priority = 'Low'
            else:
                risk_level = 'VERY LOW'
                priority = 'Very Low'

            pct_priority = round(((high) / total_tracts * 100), 1) if total_tracts > 0 else 0.0
            
            notif = CommunityInterventionNotification.objects.filter(county_fips=fips).order_by('-created_at').first()
            notif_status = notif.status if notif else 'None'

            tracts = CurrentCommunity.objects.filter(state_county_fips=c['state_county_fips'])
            avg_contrib = {}
            for t in tracts:
                contribs = t.feature_contribution_percentages or {}
                for k, v in contribs.items():
                    avg_contrib[k] = avg_contrib.get(k, 0.0) + v
            if tracts.exists():
                for k in avg_contrib:
                    avg_contrib[k] /= tracts.count()
            
            sorted_drivers = sorted(avg_contrib.items(), key=lambda x: -x[1])
            top_driver_key = sorted_drivers[0][0] if sorted_drivers else 'poverty_rate'
            top_driver_name = SDOH_FEATURE_MAPPING.get(top_driver_key, {}).get('display_name', top_driver_key.replace('_', ' ').title())
            priority_domain = SDOH_FEATURE_MAPPING.get(top_driver_key, {}).get('domain', 'Social & Economic Services')

            counties.append({
                'county_fips': fips,
                'county_name': c['county_name'] or 'Unknown County',
                'state': 'California',
                'total_tracts': total_tracts,
                'avg_risk': round(avg_risk, 2),
                'high_tracts': high,
                'vhigh_tracts': vhigh,
                'pct_priority_tracts': pct_priority,
                'risk_level': risk_level,
                'priority': priority,
                'top_driver': top_driver_name,
                'priority_domain': priority_domain,
                'notification_status': notif_status
            })

        return Response(counties, status=status.HTTP_200_OK)


class CommunityCountyDetailView(APIView):
    """
    GET /api/community/counties/<county_fips>/
    """
    def get(self, request, county_fips):
        county_fips_clean = county_fips.strip().zfill(5)
        tracts = CurrentCommunity.objects.filter(state_county_fips=county_fips_clean.lstrip('0') if county_fips_clean.startswith('0') else county_fips_clean)
        if not tracts.exists():
            tracts = CurrentCommunity.objects.filter(state_county_fips=county_fips_clean)
        
        if not tracts.exists():
            return Response({"error": "County not found"}, status=status.HTTP_404_NOT_FOUND)

        sample_tract = tracts.first()
        county_name = sample_tract.county_name
        
        from django.db.models import Avg, Count, Q
        stats = tracts.aggregate(
            avg_risk=Avg('community_risk_score'),
            high_tracts=Count('tract_fips', filter=Q(community_risk_level__in=['HIGH', 'VERY HIGH', 'CRITICAL'])),
            vhigh_tracts=Count('tract_fips', filter=Q(community_risk_level__in=['VERY HIGH', 'CRITICAL']))
        )
        
        avg_risk = stats['avg_risk'] or 0.0
        total_tracts = tracts.count()
        high = stats['high_tracts']
        vhigh = stats['vhigh_tracts']

        if avg_risk >= 30.0:
            risk_level = 'CRITICAL'
            priority = 'Critical'
        elif avg_risk >= 27.0:
            risk_level = 'HIGH'
            priority = 'High'
        elif avg_risk >= 24.0:
            risk_level = 'MEDIUM'
            priority = 'Moderate'
        elif avg_risk >= 20.0:
            risk_level = 'LOW'
            priority = 'Low'
        else:
            risk_level = 'VERY LOW'
            priority = 'Very Low'

        tract_list = []
        for t in tracts.order_by('-community_risk_score'):
            tract_list.append({
                'tract_fips': t.tract_fips,
                'risk_score': round(t.community_risk_score or 0.0, 2),
                'risk_level': t.community_risk_level or 'LOW'
            })

        return Response({
            'county_fips': county_fips_clean,
            'county_name': county_name,
            'state': 'California',
            'total_tracts': total_tracts,
            'avg_risk': round(avg_risk, 2),
            'high_tracts': high,
            'vhigh_tracts': vhigh,
            'risk_level': risk_level,
            'priority': priority,
            'tracts': tract_list
        }, status=status.HTTP_200_OK)


class CommunityCountyDriversView(APIView):
    """
    GET /api/community/counties/<county_fips>/drivers/
    """
    def get(self, request, county_fips):
        county_fips_clean = county_fips.strip().zfill(5)
        tracts = CurrentCommunity.objects.filter(state_county_fips=county_fips_clean.lstrip('0') if county_fips_clean.startswith('0') else county_fips_clean)
        if not tracts.exists():
            tracts = CurrentCommunity.objects.filter(state_county_fips=county_fips_clean)
        
        if not tracts.exists():
            return Response({"error": "County not found"}, status=status.HTTP_404_NOT_FOUND)

        avg_contrib = {}
        for t in tracts:
            contribs = t.feature_contribution_percentages or {}
            for k, v in contribs.items():
                avg_contrib[k] = avg_contrib.get(k, 0.0) + v
        
        n = tracts.count()
        for k in avg_contrib:
            avg_contrib[k] /= n

        sorted_drivers = sorted(avg_contrib.items(), key=lambda x: -x[1])
        
        drivers = []
        for idx, (feat, val) in enumerate(sorted_drivers):
            display = SDOH_FEATURE_MAPPING.get(feat, {}).get('display_name', feat.replace('_', ' ').title())
            domain = SDOH_FEATURE_MAPPING.get(feat, {}).get('domain', 'Social & Economic Services')
            
            raw_vals = [getattr(t, feat) or 0.0 for t in tracts]
            avg_raw = sum(raw_vals) / len(raw_vals) if raw_vals else 0.0

            drivers.append({
                'rank': idx + 1,
                'feature': feat,
                'display_name': display,
                'domain': domain,
                'shap_value': round(val / 100.0, 4),
                'shap_formatted': f"+{val/100.0:.3f}",
                'contribution_percentage': round(val, 2),
                'average_raw_value': round(avg_raw, 1)
            })

        return Response({
            'county_fips': county_fips_clean,
            'county_name': tracts.first().county_name,
            'drivers': drivers
        }, status=status.HTTP_200_OK)


def generate_custom_openai_interventions(county_name, domain, primary_driver, shap_contrib_percentage, avg_risk=None, risk_level=None):
    import os
    import logging
    logger = logging.getLogger(__name__)
    
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        return None, None
        
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        
        # 1. Generate Custom Actionable Interventions
        system_prompt_intv = (
            "You are an expert public health consultant specializing in Social Determinants of Health (SDOH). "
            "Given a county's primary vulnerability driver, write a list of 4-6 highly specific, practical, "
            "and actionable community-level interventions for that county. Do NOT output numbers, letters, "
            "or markdown styling. Output one intervention per line, starting with '• '."
        )
        user_prompt_intv = (
            f"County: {county_name}, California\n"
            f"Domain: {domain}\n"
            f"Primary Driver: {primary_driver} (TreeSHAP contribution: {shap_contrib_percentage:.1f}%)\n"
            f"Generate exactly 4 to 6 specific, actionable interventions."
        )
        completion_intv = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt_intv},
                {"role": "user", "content": user_prompt_intv}
            ],
            temperature=0.7,
            max_tokens=300
        )
        interventions_str = completion_intv.choices[0].message.content.strip()
        
        # 2. Generate Explainability Reason
        system_prompt_reason = "You are a public health data scientist. Write a concise, professional, two-sentence explanation."
        
        avg_risk_str = f"{avg_risk:.1f}" if avg_risk is not None else "elevated"
        risk_level_str = risk_level if risk_level else "moderate"
        
        user_prompt_reason = (
            f"Write a two-sentence explainability reason for why the domain '{domain}' is prioritized in {county_name}. "
            f"Mention the overall county community risk score ({avg_risk_str} - {risk_level_str} risk level) and "
            f"the primary driver '{primary_driver}' which contributes {shap_contrib_percentage:.1f}% to the overall SDOH risk score."
        )
        completion_reason = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt_reason},
                {"role": "user", "content": user_prompt_reason}
            ],
            temperature=0.7,
            max_tokens=150
        )
        reason_str = completion_reason.choices[0].message.content.strip()
        
        return interventions_str, reason_str
    except Exception as e:
        logger.error(f"Error calling OpenAI in generate_custom_openai_interventions: {e}", exc_info=True)
        return None, None


class CommunityCountyInterventionsView(APIView):
    """
    GET /api/community/counties/<county_fips>/interventions/
    """
    def get(self, request, county_fips):
        from django.db.models import Avg
        county_fips_clean = county_fips.strip().zfill(5)
        tracts = CurrentCommunity.objects.filter(state_county_fips=county_fips_clean.lstrip('0') if county_fips_clean.startswith('0') else county_fips_clean)
        if not tracts.exists():
            tracts = CurrentCommunity.objects.filter(state_county_fips=county_fips_clean)
        
        if not tracts.exists():
            return Response({"error": "County not found"}, status=status.HTTP_404_NOT_FOUND)

        county_name = tracts.first().county_name
        avg_risk = tracts.aggregate(avg=Avg('community_risk_score'))['avg'] or 0.0
        
        if avg_risk >= 30.0:
            risk_level = 'CRITICAL'
        elif avg_risk >= 27.0:
            risk_level = 'HIGH'
        elif avg_risk >= 24.0:
            risk_level = 'MEDIUM'
        elif avg_risk >= 20.0:
            risk_level = 'LOW'
        else:
            risk_level = 'VERY LOW'

        avg_contrib = {}
        for t in tracts:
            contribs = t.feature_contribution_percentages or {}
            for k, v in contribs.items():
                avg_contrib[k] = avg_contrib.get(k, 0.0) + v
        n = tracts.count()
        for k in avg_contrib:
            avg_contrib[k] /= n

        sorted_drivers = sorted(avg_contrib.items(), key=lambda x: -x[1])
        top_3_drivers = sorted_drivers[:3]

        domains = []
        for idx, (feat, val) in enumerate(top_3_drivers):
            display = SDOH_FEATURE_MAPPING.get(feat, {}).get('display_name', feat.replace('_', ' ').title())
            domain = SDOH_FEATURE_MAPPING.get(feat, {}).get('domain', 'Social & Economic Services')
            potential = SDOH_FEATURE_MAPPING.get(feat, {}).get('interventions', [])
            reason = f"Based on the county's average tract risk, {display} ({val:.1f}% contribution) is one of the top risk drivers."
            
            if domain not in [d['name'] for d in domains]:
                # Try calling OpenAI helper for dynamic, county-tailored interventions
                ai_intv_str, ai_reason_str = generate_custom_openai_interventions(
                    county_name=county_name,
                    domain=domain,
                    primary_driver=display,
                    shap_contrib_percentage=val,
                    avg_risk=avg_risk,
                    risk_level=risk_level
                )
                if ai_intv_str and ai_reason_str:
                    lines = [l.strip().lstrip('•-* ').strip() for l in ai_intv_str.split('\n') if l.strip()]
                    if len(lines) >= 3:
                        potential = lines
                        reason = ai_reason_str
                
                domains.append({
                    'name': domain,
                    'primary_driver': display,
                    'shap_value': round(val / 100.0, 4),
                    'shap_formatted': f"+{val/100.0:.3f}",
                    'interventions': potential,
                    'reason': reason
                })

        return Response({
            'county_fips': county_fips_clean,
            'county_name': county_name,
            'domains': domains
        }, status=status.HTTP_200_OK)


class CommunityInterventionGenerateView(APIView):
    """
    POST /api/community/interventions/generate/
    Body: { county_fips: str, domain: str }
    """
    def post(self, request):
        county_fips = request.data.get('county_fips')
        domain = request.data.get('domain')

        if not county_fips or not domain:
            return Response({"error": "county_fips and domain are required"}, status=status.HTTP_400_BAD_REQUEST)

        county_fips_clean = county_fips.strip().zfill(5)
        
        active_notif = CommunityInterventionNotification.objects.filter(
            county_fips=county_fips_clean,
            domain=domain
        ).exclude(status__in=['RESOLVED', 'FAILED']).first()

        if active_notif:
            return Response({
                "message": "Found existing active notification for this county and domain.",
                "notification": serialize_community_notification(active_notif)
            }, status=status.HTTP_200_OK)

        tracts = CurrentCommunity.objects.filter(state_county_fips=county_fips_clean.lstrip('0') if county_fips_clean.startswith('0') else county_fips_clean)
        if not tracts.exists():
            tracts = CurrentCommunity.objects.filter(state_county_fips=county_fips_clean)
        if not tracts.exists():
            return Response({"error": "County not found"}, status=status.HTTP_404_NOT_FOUND)

        sample_tract = tracts.first()
        county_name = sample_tract.county_name

        from django.db.models import Avg
        avg_risk = tracts.aggregate(avg=Avg('community_risk_score'))['avg'] or 0.0
        
        if avg_risk >= 30.0:
            risk_level = 'CRITICAL'
            priority = 'CRITICAL'
        elif avg_risk >= 27.0:
            risk_level = 'HIGH'
            priority = 'HIGH'
        elif avg_risk >= 24.0:
            risk_level = 'MEDIUM'
            priority = 'MODERATE'
        elif avg_risk >= 20.0:
            risk_level = 'LOW'
            priority = 'LOW'
        else:
            risk_level = 'VERY LOW'
            priority = 'LOW'

        contact = InterventionContact.objects.filter(county_fips=county_fips_clean, domain=domain).first()
        if not contact:
            contact = InterventionContact.objects.filter(county_name__icontains=county_name.replace('County', '').strip(), domain=domain).first()
            
        if not contact:
            recipient_email = "outreach@california-municipal.gov"
            municipality = county_name.replace('County', '').strip()
            email_type = "SYNTHETIC_DEMO"
            contact_role = "Community Outreach Coordinator"
        else:
            recipient_email = contact.contact_email
            municipality = contact.municipality
            email_type = contact.email_type
            contact_role = contact.contact_role

        avg_contrib = {}
        for t in tracts:
            contribs = t.feature_contribution_percentages or {}
            for k, v in contribs.items():
                avg_contrib[k] = avg_contrib.get(k, 0.0) + v
        n = tracts.count()
        for k in avg_contrib:
            avg_contrib[k] /= n

        domain_features = [feat for feat, mapping in SDOH_FEATURE_MAPPING.items() if mapping['domain'] == domain]
        domain_contribs = [(feat, avg_contrib.get(feat, 0.0)) for feat in domain_features]
        domain_contribs.sort(key=lambda x: -x[1])
        
        primary_feat = domain_contribs[0][0] if domain_contribs else 'poverty_rate'
        primary_val = domain_contribs[0][1] if domain_contribs else 0.0
        primary_display = SDOH_FEATURE_MAPPING.get(primary_feat, {}).get('display_name', primary_feat.replace('_', ' ').title())
        
        interventions_list = SDOH_FEATURE_MAPPING.get(primary_feat, {}).get('interventions', ['Community outreach programs'])
        recommended_interventions_str = "\n".join([f"• {i}" for i in interventions_list[:4]])

        reason = (
            f"The county's overall community risk score is elevated ({avg_risk:.1f} - {risk_level} risk level). "
            f"Based on TreeSHAP feature attribution, this vulnerability is primarily driven by {primary_display} "
            f"which contributes {primary_val:.1f}% of the local community determinants of health risk."
        )

        # Call OpenAI helper for dynamic, county-tailored interventions
        ai_intv_str, ai_reason_str = generate_custom_openai_interventions(
            county_name=county_name,
            domain=domain,
            primary_driver=primary_display,
            shap_contrib_percentage=primary_val,
            avg_risk=avg_risk,
            risk_level=risk_level
        )
        if ai_intv_str and ai_reason_str:
            recommended_interventions_str = ai_intv_str
            reason = ai_reason_str

        import uuid
        notif_id = f"notif-{uuid.uuid4().hex[:12]}"

        new_notif = CommunityInterventionNotification.objects.create(
            notification_id=notif_id,
            county_fips=county_fips_clean,
            county_name=county_name,
            municipality=municipality,
            risk_score=round(avg_risk, 2),
            risk_level=risk_level,
            primary_driver=primary_display,
            primary_driver_shap=round(primary_val / 100.0, 4),
            domain=domain,
            priority=priority,
            intervention=recommended_interventions_str,
            reason=reason,
            recipient_email=recipient_email,
            email_type=email_type,
            status='PENDING'
        )

        return Response({
            "message": "Successfully generated community intervention notification.",
            "notification": serialize_community_notification(new_notif)
        }, status=status.HTTP_201_CREATED)


class CommunityNotificationSendView(APIView):
    """
    POST /api/community/notifications/<notification_id>/send/
    """
    permission_classes = [RolePermission]
    required_roles = ['admin', 'claims_officer']

    def post(self, request, notification_id):
        notif = CommunityInterventionNotification.objects.filter(notification_id=notification_id).first()
        if not notif:
            return Response({"error": "Notification not found"}, status=status.HTTP_404_NOT_FOUND)
        
        # Accept edited email details from front-end
        subject = request.data.get('ai_email_subject')
        body = request.data.get('ai_email_body')
        recipient_email = request.data.get('recipient_email')
        
        if subject is not None:
            notif.ai_email_subject = subject
        if body is not None:
            notif.ai_email_body = body
        if recipient_email is not None:
            notif.recipient_email = recipient_email
            
        import django.utils.timezone as timezone
        notif.status = 'SENT'
        notif.sent_at = timezone.now()
        notif.save()
        
        return Response({
            "message": "Notification successfully sent live (simulated live pathway).",
            "notification": serialize_community_notification(notif)
        }, status=status.HTTP_200_OK)


class CommunityNotificationSimulateView(APIView):
    """
    POST /api/community/notifications/<notification_id>/simulate/
    """
    permission_classes = [RolePermission]
    required_roles = ['admin', 'claims_officer']

    def post(self, request, notification_id):
        notif = CommunityInterventionNotification.objects.filter(notification_id=notification_id).first()
        if not notif:
            return Response({"error": "Notification not found"}, status=status.HTTP_404_NOT_FOUND)
        
        import django.utils.timezone as timezone
        notif.status = 'SIMULATED'
        notif.sent_at = timezone.now()
        notif.save()
        
        return Response({
            "message": "Intervention notification successfully simulated.",
            "notification": serialize_community_notification(notif)
        }, status=status.HTTP_200_OK)


class CommunityNotificationListView(APIView):
    """
    GET /api/community/notifications/
    """
    def get(self, request):
        notifs = CommunityInterventionNotification.objects.all().order_by('-created_at')
        
        county_fips = request.query_params.get('county_fips')
        if county_fips:
            notifs = notifs.filter(county_fips=county_fips)
            
        domain = request.query_params.get('domain')
        if domain:
            notifs = notifs.filter(domain=domain)
            
        priority = request.query_params.get('priority')
        if priority:
            notifs = notifs.filter(priority=priority)
            
        status_param = request.query_params.get('status')
        if status_param:
            notifs = notifs.filter(status=status_param)

        return Response([serialize_community_notification(n) for n in notifs], status=status.HTTP_200_OK)


class CommunityNotificationStatusUpdateView(APIView):
    """
    PATCH /api/community/notifications/<notification_id>/status/
    Body: { status: str }
    """
    permission_classes = [RolePermission]
    required_roles = ['admin', 'claims_officer']

    def patch(self, request, notification_id):
        notif = CommunityInterventionNotification.objects.filter(notification_id=notification_id).first()
        if not notif:
            return Response({"error": "Notification not found"}, status=status.HTTP_404_NOT_FOUND)
        
        new_status = request.data.get('status')
        if new_status not in ['PENDING', 'SIMULATED', 'SENT', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'FAILED']:
            return Response({"error": "Invalid notification status value"}, status=status.HTTP_400_BAD_REQUEST)
        
        import django.utils.timezone as timezone
        notif.status = new_status
        
        if new_status == 'ACKNOWLEDGED':
            notif.acknowledged_at = timezone.now()
        elif new_status == 'RESOLVED':
            notif.resolved_at = timezone.now()
            
        notif.save()
        
        return Response({
            "message": f"Successfully updated status to {new_status}.",
            "notification": serialize_community_notification(notif)
        }, status=status.HTTP_200_OK)


class CommunityDomainListView(APIView):
    """
    GET /api/community/domains/
    """
    def get(self, request):
        domains = [
            { 'id': 'healthcare', 'name': 'Healthcare Access' },
            { 'id': 'social_economic', 'name': 'Social & Economic Services' },
            { 'id': 'food_nutrition', 'name': 'Food & Nutrition' },
            { 'id': 'transportation', 'name': 'Transportation' },
            { 'id': 'housing', 'name': 'Housing' }
        ]
        return Response(domains, status=status.HTTP_200_OK)


class CommunityCountyContactsView(APIView):
    """
    GET /api/community/contacts/<county_fips>/
    """
    def get(self, request, county_fips):
        county_fips_clean = county_fips.strip().zfill(5)
        contacts = InterventionContact.objects.filter(county_fips=county_fips_clean)
        
        res = []
        for c in contacts:
            res.append({
                'domain': c.domain,
                'municipality': c.municipality,
                'contact_role': c.contact_role,
                'contact_email': c.contact_email,
                'email_type': c.email_type,
                'notification_enabled': c.notification_enabled
            })
        return Response(res, status=status.HTTP_200_OK)


class CommunityNotificationGenerateAIEmailView(APIView):
    """
    POST /api/community/notifications/<notification_id>/generate-ai-email/
    """
    def post(self, request, notification_id):
        import os
        from openai import OpenAI
        
        notif = CommunityInterventionNotification.objects.filter(notification_id=notification_id).first()
        if not notif:
            return Response({"error": "Notification not found"}, status=status.HTTP_404_NOT_FOUND)
            
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            return Response({"error": "OPENAI_API_KEY not configured in backend environment variables"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            client = OpenAI(api_key=api_key)
            
            system_prompt = (
                "You are an expert Social Determinants of Health (SDOH) care management system coordinator. "
                "Your job is to draft a formal, professional, highly persuasive, and actionable alert email to municipal outreach authorities "
                "about elevated health and social risk scores in their county."
            )
            
            user_prompt = (
                f"Draft an intervention email alert for the following county-level SDOH risk:\n\n"
                f"- County: {notif.county_name}, California (Municipality: {notif.municipality})\n"
                f"- Risk Score: {notif.risk_score} / 100 ({notif.risk_level} Risk Level)\n"
                f"- Primary Driver: {notif.primary_driver} (TreeSHAP impact: {notif.primary_driver_shap:.3f})\n"
                f"- Priority Domain: {notif.domain}\n"
                f"- Recommended Interventions:\n{notif.intervention}\n"
                f"- Attribution Reason:\n{notif.reason}\n\n"
                f"Instructions:\n"
                f"1. Write a compelling and professional Subject line starting with 'Subject: ' on the first line.\n"
                f"2. Write the detailed email body on subsequent lines, addressed formally to the {notif.municipality} Social/Health outreach lead.\n"
                f"3. Make the email clear, data-driven, highlighting the TreeSHAP-calculated SDOH primary driver impact, and explaining why these interventions are recommended.\n"
                f"4. Keep a highly professional, collaborative, and urgent tone.\n"
                f"5. Do NOT include markdown styling like triple backticks in your output; output raw text only."
            )
            
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7
            )
            
            response_text = completion.choices[0].message.content.strip()
            
            # Parse subject and body
            subject = f"COMMUNITY INTERVENTION ALERT: {notif.county_name} - {notif.domain}"
            body = response_text
            
            lines = response_text.split('\n')
            first_line = lines[0].strip()
            if first_line.lower().startswith('subject:'):
                subject = first_line[len('subject:'):].strip()
                body = '\n'.join(lines[1:]).strip()
            
            notif.ai_email_subject = subject
            notif.ai_email_body = body
            notif.save()
            
            return Response({
                "message": "AI email successfully generated via OpenAI GPT.",
                "notification": serialize_community_notification(notif)
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({"error": f"OpenAI generation failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StaffListView(APIView):
    permission_classes = [RolePermission]
    required_roles = ['admin']

    def get(self, request):
        staff_members = Staff.objects.all().order_by('-created_at')
        data = [{
            'firebase_uid': s.firebase_uid,
            'name': s.name,
            'email': s.email,
            'role': s.role,
            'created_at': s.created_at
        } for s in staff_members]
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        firebase_uid = request.data.get('firebase_uid')
        name = request.data.get('name')
        email = request.data.get('email')
        role = request.data.get('role', 'underwriter')

        if not firebase_uid or not name or not email:
            return Response({"error": "firebase_uid, name, and email are required"}, status=status.HTTP_400_BAD_REQUEST)

        if role not in ['admin', 'claims_officer', 'underwriter']:
            return Response({"error": "Invalid role specified"}, status=status.HTTP_400_BAD_REQUEST)

        if Staff.objects.filter(firebase_uid=firebase_uid).exists():
            return Response({"error": "Staff with this UID already exists"}, status=status.HTTP_400_BAD_REQUEST)

        staff = Staff.objects.create(
            firebase_uid=firebase_uid,
            name=name,
            email=email,
            role=role
        )
        return Response({
            "message": "Staff created successfully",
            "staff": {
                'firebase_uid': staff.firebase_uid,
                'name': staff.name,
                'email': staff.email,
                'role': staff.role
            }
        }, status=status.HTTP_201_CREATED)


class StaffDetailView(APIView):
    permission_classes = [RolePermission]
    required_roles = ['admin']

    def patch(self, request, firebase_uid):
        staff = Staff.objects.filter(firebase_uid=firebase_uid).first()
        if not staff:
            return Response({"error": "Staff member not found"}, status=status.HTTP_404_NOT_FOUND)

        role = request.data.get('role')
        name = request.data.get('name')
        
        if role:
            if role not in ['admin', 'claims_officer', 'underwriter']:
                return Response({"error": "Invalid role specified"}, status=status.HTTP_400_BAD_REQUEST)
            staff.role = role
        if name:
            staff.name = name

        staff.save()
        return Response({
            "message": "Staff details updated successfully",
            "staff": {
                'firebase_uid': staff.firebase_uid,
                'name': staff.name,
                'email': staff.email,
                'role': staff.role
            }
        }, status=status.HTTP_200_OK)


class CurrentPatientUploadView(APIView):
    """
    POST /api/current-patients/upload/
    
    Handles Excel sheet upload (bulk patients) and PDF chart extraction (OpenAI GPT).
    """
    def post(self, request):
        import logging
        import pandas as pd
        import os
        import json
        from openai import OpenAI
        from rest_framework.parsers import MultiPartParser, FormParser
        from .current_prediction_engine import get_current_engine
        from .models import Patient
        from .ml_engine import get_prediction_engine
        
        logger = logging.getLogger(__name__)
        engine = get_current_engine()
        engine_hist = get_prediction_engine()
        
        upload_type = request.data.get('type', 'excel').lower()
        file_obj = request.FILES.get('file')
        
        if not file_obj:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)
            
        # 1. EXCEL UPLOAD PATHWAY
        if upload_type == 'excel':
            try:
                # Read using pandas
                df = pd.read_excel(file_obj)
                
                # Normalize column headers case-insensitively and space-insensitively
                normalized_cols = {}
                for col in df.columns:
                    c_norm = str(col).strip().upper().replace(' ', '_').replace('-', '_')
                    if c_norm in ['PATIENTID', 'PATIENT_ID', 'ID']:
                        normalized_cols[col] = 'PATIENT_ID'
                    elif c_norm in ['FIPSID', 'FIPS_ID', 'FIPS', 'TRACT_FIPS', 'TRACT_ID']:
                        normalized_cols[col] = 'FIPS_ID'
                    elif c_norm in ['PATIENTNAME', 'PATIENT_NAME', 'NAME']:
                        normalized_cols[col] = 'PATIENT_NAME'
                    elif c_norm in ['STATENAME', 'STATE_NAME', 'STATE']:
                        normalized_cols[col] = 'STATE_NAME'
                    elif c_norm in ['AGE']:
                        normalized_cols[col] = 'AGE'
                    elif c_norm in ['GENDER']:
                        normalized_cols[col] = 'GENDER'
                    elif c_norm in ['CHRONICCONDITIONS', 'CHRONIC_CONDITIONS', 'CHRONIC']:
                        normalized_cols[col] = 'CHRONIC_CONDITIONS'
                    elif c_norm in ['CONDITIONS', 'DIAGNOSES']:
                        normalized_cols[col] = 'CONDITIONS'
                    elif c_norm in ['INPATIENTADMISSIONS', 'INPATIENT_ADMISSIONS', 'INPATIENT', 'INPATIENT_VISITS']:
                        normalized_cols[col] = 'INPATIENT_ADMISSIONS'
                    elif c_norm in ['EMERGENCYVISITS', 'EMERGENCY_VISITS', 'EMERGENCY', 'ED_VISITS']:
                        normalized_cols[col] = 'EMERGENCY_VISITS'
                    elif c_norm in ['OUTPATIENTVISITS', 'OUTPATIENT_VISITS', 'OUTPATIENT']:
                        normalized_cols[col] = 'OUTPATIENT_VISITS'
                    elif c_norm in ['MEDICATIONS', 'MEDS']:
                        normalized_cols[col] = 'MEDICATIONS'
                    elif c_norm in ['PROCEDURES']:
                        normalized_cols[col] = 'PROCEDURES'
                    elif c_norm in ['MEDICATIONSPERENCOUNTER', 'MEDICATIONS_PER_ENCOUNTER']:
                        normalized_cols[col] = 'MEDICATIONS_PER_ENCOUNTER'
                    elif c_norm in ['CONDITIONSPERENCOUNTER', 'CONDITIONS_PER_ENCOUNTER']:
                        normalized_cols[col] = 'CONDITIONS_PER_ENCOUNTER'
                
                df = df.rename(columns=normalized_cols)
                
                # Check for required columns
                required_cols = ['PATIENT_ID', 'FIPS_ID']
                missing_cols = [col for col in required_cols if col not in df.columns]
                if missing_cols:
                    return Response({
                        "error": f"Missing required columns in Excel: {', '.join(missing_cols)}"
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                patients_created = []
                for _, row in df.iterrows():
                    p_id = str(row['PATIENT_ID']).strip()
                    fips = str(row['FIPS_ID']).strip().split('.')[0].zfill(11) # handle floats or standard formats
                    
                    if not p_id or not fips or p_id.lower() == 'nan' or fips.lower() == 'nan':
                        continue
                        
                    # Extract fields with safe fallbacks
                    p_name = str(row.get('PATIENT_NAME', '')).strip() if 'PATIENT_NAME' in df.columns and pd.notna(row['PATIENT_NAME']) else f"Patient {p_id}"
                    state_name = str(row.get('STATE_NAME', 'California')).strip() if 'STATE_NAME' in df.columns and pd.notna(row['STATE_NAME']) else 'California'
                    
                    age = None
                    if 'AGE' in df.columns and pd.notna(row['AGE']):
                        try: age = int(row['AGE'])
                        except: pass
                        
                    gender = str(row.get('GENDER', 'Unknown')).strip() if 'GENDER' in df.columns and pd.notna(row['GENDER']) else 'Unknown'
                    
                    def safe_int(col_name):
                        if col_name in df.columns and pd.notna(row[col_name]):
                            try: return int(row[col_name])
                            except: return 0
                        return 0
                        
                    chronic = safe_int('CHRONIC_CONDITIONS')
                    conditions = safe_int('CONDITIONS')
                    inpatient = safe_int('INPATIENT_ADMISSIONS')
                    emergency = safe_int('EMERGENCY_VISITS')
                    outpatient = safe_int('OUTPATIENT_VISITS')
                    meds = safe_int('MEDICATIONS')
                    procs = safe_int('PROCEDURES')
                    
                    encounters = max(1, inpatient + emergency + outpatient)
                    
                    if 'MEDICATIONS_PER_ENCOUNTER' in df.columns and pd.notna(row['MEDICATIONS_PER_ENCOUNTER']):
                        try: meds_per_enc = float(row['MEDICATIONS_PER_ENCOUNTER'])
                        except: meds_per_enc = float(meds) / encounters
                    else:
                        meds_per_enc = float(meds) / encounters
                        
                    if 'CONDITIONS_PER_ENCOUNTER' in df.columns and pd.notna(row['CONDITIONS_PER_ENCOUNTER']):
                        try: cond_per_enc = float(row['CONDITIONS_PER_ENCOUNTER'])
                        except: cond_per_enc = float(conditions) / encounters
                    else:
                        cond_per_enc = float(conditions) / encounters
                    
                    # Generate a unique ID if it already exists to guarantee it is added as a new patient
                    original_p_id = p_id
                    suffix_counter = 1
                    while CurrentPatient.objects.filter(PATIENT_ID=p_id).exists():
                        p_id = f"{original_p_id}_{suffix_counter}"
                        suffix_counter += 1
                        
                    patient = CurrentPatient.objects.create(
                        PATIENT_ID=p_id,
                        PATIENT_NAME=p_name,
                        FIPS_ID=fips,
                        STATE_NAME=state_name,
                        AGE=age,
                        GENDER=gender,
                        CHRONIC_CONDITIONS=chronic,
                        CONDITIONS=conditions,
                        INPATIENT_ADMISSIONS=inpatient,
                        EMERGENCY_VISITS=emergency,
                        OUTPATIENT_VISITS=outpatient,
                        MEDICATIONS=meds,
                        PROCEDURES=procs,
                        MEDICATIONS_PER_ENCOUNTER=meds_per_enc,
                        CONDITIONS_PER_ENCOUNTER=cond_per_enc
                    )
                    
                    # Create corresponding Patient model record to run CatBoost future predictions
                    patient_hist = Patient.objects.create(
                        patient_id=p_id,
                        name=p_name,
                        tract_fips=fips,
                        encounters_last_12m=float(encounters),
                        inpatient_admissions_last_12m=float(inpatient),
                        emergency_visits_last_12m=float(emergency),
                        outpatient_visits_last_12m=float(outpatient),
                        conditions_last_12m=float(conditions),
                        chronic_conditions_last_12m=float(chronic),
                        medications_last_12m=float(meds),
                        procedures_last_12m=float(procs),
                        medications_per_encounter_last_12m=meds_per_enc,
                        conditions_per_encounter_last_12m=cond_per_enc,
                        gender_f=1.0 if gender.lower() == 'female' else 0.0,
                        gender_m=1.0 if gender.lower() == 'male' else 0.0,
                        change_recent_vs_previous_encounters=0.0,
                        growth_recent_vs_previous_encounters=0.0,
                        change_recent_vs_previous_conditions=0.0,
                        growth_recent_vs_previous_conditions=0.0,
                        change_recent_vs_previous_chronic_conditions=0.0,
                        growth_recent_vs_previous_chronic_conditions=0.0,
                        change_recent_vs_previous_medications=0.0,
                        growth_recent_vs_previous_medications=0.0,
                        change_recent_vs_previous_procedures=0.0,
                        growth_recent_vs_previous_procedures=0.0,
                        change_recent_vs_previous_clinical_burden=0.0,
                        growth_recent_vs_previous_clinical_burden=0.0,
                        change_recent_vs_previous_healthcare_utilization=0.0,
                        growth_recent_vs_previous_healthcare_utilization=0.0,
                        clinical_burden_last_12m=0.0,
                        healthcare_utilization_last_12m=0.0
                    )
                    
                    # Predict immediately
                    engine.predict_current_patient(patient, save_to_db=True)
                    engine_hist.predict_patient(patient_hist, save_to_db=True)
                    patients_created.append(p_id)
                
                # Clear map cache
                _MAP_CACHE.clear()
                
                return Response({
                    "message": f"Successfully uploaded and processed {len(patients_created)} patients from Excel.",
                    "patients": patients_created
                }, status=status.HTTP_201_CREATED)
                
            except Exception as e:
                logger.error(f"Excel processing failed: {e}", exc_info=True)
                return Response({"error": f"Failed to process Excel file: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
                
        # 2. PDF UPLOAD PATHWAY
        elif upload_type == 'pdf':
            try:
                import pypdf
                
                # Load API key
                api_key = os.getenv('OPENAI_API_KEY')
                if not api_key:
                    return Response({"error": "OPENAI_API_KEY is not configured in backend .env"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
                # Extract text using pypdf
                reader = pypdf.PdfReader(file_obj)
                text_content = ""
                for page in reader.pages:
                    text_content += page.extract_text() or ""
                    
                if not text_content.strip():
                    return Response({"error": "Failed to extract text from the PDF chart. Make sure it is not an image-only scan."}, status=status.HTTP_400_BAD_REQUEST)
                    
                # Call OpenAI GPT-4o-mini with response_format JSON
                client = OpenAI(api_key=api_key)
                system_prompt = (
                    "You are an expert clinical coding assistant. Parse the patient clinical chart text and extract "
                    "demographics and healthcare service encounter counts. You MUST return a JSON object with these exact keys:\n"
                    "- PATIENT_ID: extract unique patient id or generate a new unique one (e.g. TEST-CA-0125)\n"
                    "- PATIENT_NAME: patient's full name\n"
                    "- FIPS_ID: extract 11-digit zero-padded Census Tract FIPS code (e.g., 06037599100) if found, else default to '06067004203'\n"
                    "- AGE: patient age (integer)\n"
                    "- GENDER: patient gender (e.g. Male, Female, Other)\n"
                    "- CHRONIC_CONDITIONS: count of active chronic conditions (integer)\n"
                    "- CONDITIONS: total number of distinct diagnoses/conditions/problems (integer)\n"
                    "- INPATIENT_ADMISSIONS: count of inpatient hospital admissions in the past 12m (integer)\n"
                    "- EMERGENCY_VISITS: count of ER visits in the past 12m (integer)\n"
                    "- OUTPATIENT_VISITS: count of outpatient clinic visits in the past 12m (integer)\n"
                    "- MEDICATIONS: count of active current medications (integer)\n"
                    "- PROCEDURES: count of surgical or medical procedures performed in the past 12m (integer)"
                )
                
                completion = client.chat.completions.create(
                    model="gpt-4o-mini",
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Here is the patient clinical chart text:\n\n{text_content[:8000]}"}
                    ],
                    temperature=0.0
                )
                
                extracted_data = json.loads(completion.choices[0].message.content)
                
                # Clean and save the patient
                p_id = str(extracted_data.get('PATIENT_ID', '')).strip()
                if not p_id or p_id.lower() == 'nan':
                    import uuid
                    p_id = f"TEST-CA-{str(uuid.uuid4())[:4]}"
                    
                fips = str(extracted_data.get('FIPS_ID', '06067004203')).strip().split('.')[0].zfill(11)
                
                p_name = str(extracted_data.get('PATIENT_NAME', '')).strip() or f"Patient {p_id}"
                state_name = 'California'
                
                age = extracted_data.get('AGE')
                try: age = int(age) if age is not None else None
                except: age = None
                
                gender = str(extracted_data.get('GENDER', 'Unknown')).strip()
                
                chronic = int(extracted_data.get('CHRONIC_CONDITIONS', 0))
                conditions = int(extracted_data.get('CONDITIONS', 0))
                inpatient = int(extracted_data.get('INPATIENT_ADMISSIONS', 0))
                emergency = int(extracted_data.get('EMERGENCY_VISITS', 0))
                outpatient = int(extracted_data.get('OUTPATIENT_VISITS', 0))
                meds = int(extracted_data.get('MEDICATIONS', 0))
                procs = int(extracted_data.get('PROCEDURES', 0))
                
                encounters = max(1, inpatient + emergency + outpatient)
                meds_per_enc = float(meds) / encounters
                cond_per_enc = float(conditions) / encounters
                
                # Generate unique ID if already exists to guarantee it is added as a new patient
                original_p_id = p_id
                suffix_counter = 1
                while CurrentPatient.objects.filter(PATIENT_ID=p_id).exists():
                    p_id = f"{original_p_id}_{suffix_counter}"
                    suffix_counter += 1
                    
                patient = CurrentPatient.objects.create(
                    PATIENT_ID=p_id,
                    PATIENT_NAME=p_name,
                    FIPS_ID=fips,
                    STATE_NAME=state_name,
                    AGE=age,
                    GENDER=gender,
                    CHRONIC_CONDITIONS=chronic,
                    CONDITIONS=conditions,
                    INPATIENT_ADMISSIONS=inpatient,
                    EMERGENCY_VISITS=emergency,
                    OUTPATIENT_VISITS=outpatient,
                    MEDICATIONS=meds,
                    PROCEDURES=procs,
                    MEDICATIONS_PER_ENCOUNTER=meds_per_enc,
                    CONDITIONS_PER_ENCOUNTER=cond_per_enc
                )
                
                # Create corresponding Patient model record to run CatBoost future predictions
                patient_hist = Patient.objects.create(
                    patient_id=p_id,
                    name=p_name,
                    tract_fips=fips,
                    encounters_last_12m=float(encounters),
                    inpatient_admissions_last_12m=float(inpatient),
                    emergency_visits_last_12m=float(emergency),
                    outpatient_visits_last_12m=float(outpatient),
                    conditions_last_12m=float(conditions),
                    chronic_conditions_last_12m=float(chronic),
                    medications_last_12m=float(meds),
                    procedures_last_12m=float(procs),
                    medications_per_encounter_last_12m=meds_per_enc,
                    conditions_per_encounter_last_12m=cond_per_enc,
                    gender_f=1.0 if gender.lower() == 'female' else 0.0,
                    gender_m=1.0 if gender.lower() == 'male' else 0.0,
                    change_recent_vs_previous_encounters=0.0,
                    growth_recent_vs_previous_encounters=0.0,
                    change_recent_vs_previous_conditions=0.0,
                    growth_recent_vs_previous_conditions=0.0,
                    change_recent_vs_previous_chronic_conditions=0.0,
                    growth_recent_vs_previous_chronic_conditions=0.0,
                    change_recent_vs_previous_medications=0.0,
                    growth_recent_vs_previous_medications=0.0,
                    change_recent_vs_previous_procedures=0.0,
                    growth_recent_vs_previous_procedures=0.0,
                    change_recent_vs_previous_clinical_burden=0.0,
                    growth_recent_vs_previous_clinical_burden=0.0,
                    change_recent_vs_previous_healthcare_utilization=0.0,
                    growth_recent_vs_previous_healthcare_utilization=0.0,
                    clinical_burden_last_12m=0.0,
                    healthcare_utilization_last_12m=0.0
                )
                
                # Predict
                engine.predict_current_patient(patient, save_to_db=True)
                engine_hist.predict_patient(patient_hist, save_to_db=True)
                
                # Clear map cache
                _MAP_CACHE.clear()
                
                return Response({
                    "message": f"Successfully parsed clinical chart PDF via AI and added patient {p_name} ({p_id}).",
                    "patient_id": p_id,
                    "patient_name": p_name,
                    "extracted_data": extracted_data
                }, status=status.HTTP_201_CREATED)
                
            except Exception as e:
                logger.error(f"PDF AI extraction failed: {e}", exc_info=True)
                return Response({"error": f"Failed to extract details from PDF: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
                
        else:
            return Response({"error": "Unsupported upload type. Choose either 'excel' or 'pdf'."}, status=status.HTTP_400_BAD_REQUEST)


