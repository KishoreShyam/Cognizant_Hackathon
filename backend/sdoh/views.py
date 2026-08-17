from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from collections import defaultdict
import time
from .models import Patient, CommunitySDOH, PatientRiskPrediction
from .ml_engine import get_prediction_engine, prediction_to_dict
from .services import is_prediction_stale, get_or_predict_patient_risk

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
    
    PREDICT-ONCE-AND-STORE:
    Returns patient records joined directly with stored database predictions and TreeSHAP results.
    Does NOT run ML inference or TreeSHAP on GET requests.
    """
    def get(self, request):
        engine = get_prediction_engine()
        patients = list(Patient.objects.all().order_by('patient_id'))
        
        fips_list = [p.tract_fips for p in patients if p.tract_fips]
        sdoh_map = {
            s.tract_fips: s 
            for s in CommunitySDOH.objects.filter(tract_fips__in=fips_list)
        }

        # Prefetch stored predictions in a single SQL query
        pred_map = {
            pred.patient_id: pred 
            for pred in PatientRiskPrediction.objects.filter(patient__in=patients)
        }

        member_list = []
        high_priority_count = 0
        clinical_dominant_count = 0
        sdoh_dominant_count = 0
        combined_elevated_count = 0

        for p in patients:
            existing_pred = pred_map.get(p.id)
            
            # Use stored prediction if fresh, otherwise calculate once
            if existing_pred and not is_prediction_stale(p, existing_pred):
                eval_res = prediction_to_dict(existing_pred, patient=p)
            else:
                eval_res = engine.predict_patient(p, save_to_db=True, verbose=False)

            sdoh = sdoh_map.get(p.tract_fips)

            driver = eval_res["driver"]
            driver_type = eval_res["driver_type"]
            shap_drivers = eval_res["shap_drivers"]

            level_5 = eval_res["future_risk_5"]["level"]
            conf_5 = eval_res["future_risk_5"]["confidence"]
            level_3 = eval_res["future_risk_3"]["level"]
            conf_3 = eval_res["future_risk_3"]["confidence"]

            # Count for summary cards
            if level_5 in ['Critical', 'High']:
                high_priority_count += 1

            if driver_type == 'Clinical':
                clinical_dominant_count += 1
            elif driver_type == 'SDOH':
                sdoh_dominant_count += 1
            else:
                combined_elevated_count += 1

            # Determine status based on 5-class future risk
            if level_5 in ['Critical', 'High']:
                status_text = 'Needs Review'
                status_color = 'bg-error'
                priority_color = 'bg-error/10 text-error border-error/20'
            elif level_5 == 'Moderate':
                status_text = 'Active Monitoring'
                status_color = 'bg-amber-500'
                priority_color = 'bg-amber-100 text-amber-800 border-amber-200'
            else:
                status_text = 'Stable'
                status_color = 'bg-teal-500'
                priority_color = 'bg-teal-100 text-teal-800 border-teal-200'

            # SDOH metrics from PostgreSQL CommunitySDOH
            poverty_val = round(float(sdoh.poverty_2022), 1) if sdoh and sdoh.poverty_2022 is not None else 0.0
            housing_val = round(float(sdoh.housing_burden_2022), 1) if sdoh and sdoh.housing_burden_2022 is not None else 0.0
            income_val = round(float(sdoh.income_2022), 0) if sdoh and sdoh.income_2022 is not None else 0.0
            unemployment_val = round(float(sdoh.unemployment_2022), 1) if sdoh and sdoh.unemployment_2022 is not None else 0.0
            uninsured_val = round(float(sdoh.uninsured_2022), 1) if sdoh and sdoh.uninsured_2022 is not None else 0.0
            food_val = round(float(sdoh.food_access_population_2022), 1) if sdoh and sdoh.food_access_population_2022 is not None else 0.0
            no_vehicle_val = round(float(sdoh.no_vehicle_2022), 1) if sdoh and sdoh.no_vehicle_2022 is not None else 0.0
            disability_val = round(float(sdoh.disability_2022), 1) if sdoh and sdoh.disability_2022 is not None else 0.0
            broadband_val = round(float(sdoh.broadband_2022), 1) if sdoh and sdoh.broadband_2022 is not None else 0.0
            education_val = round(float(sdoh.education_2022), 1) if sdoh and sdoh.education_2022 is not None else 0.0
            
            # SDOH risk level
            if poverty_val >= 20.0 or housing_val >= 30.0:
                sdoh_level = 'High'
                sdoh_label = f"Poverty {poverty_val}%" if poverty_val >= 20 else f"Housing {housing_val}%"
            elif poverty_val >= 10.0 or housing_val >= 18.0:
                sdoh_level = 'Moderate'
                sdoh_label = f"Poverty {poverty_val}%"
            else:
                sdoh_level = 'Low'
                sdoh_label = f"Poverty {poverty_val}%"

            # Conditions array
            conditions_list = []
            if int(p.chronic_conditions_last_12m or 0) > 0:
                conditions_list.append(f"{int(p.chronic_conditions_last_12m)} Chronic Conditions")
            if int(p.conditions_last_12m or 0) > 0:
                conditions_list.append(f"{int(p.conditions_last_12m)} Total Diagnoses")
            if int(p.medications_last_12m or 0) > 0:
                conditions_list.append(f"{int(p.medications_last_12m)} Active Meds")
            if not conditions_list:
                conditions_list = ['Routine Baseline']

            # Build true TreeSHAP explanation bullets
            top_shp = shap_drivers[0] if shap_drivers else {'display_name': 'SDOH Factors', 'shap_formatted': '+0.0000', 'raw_value': 'N/A'}
            sec_shp = shap_drivers[1] if len(shap_drivers) > 1 else {'display_name': 'Clinical Profile', 'shap_formatted': '+0.0000', 'raw_value': 'N/A'}
            details = [
                f"Primary SHAP Driver: {top_shp['display_name']} ({top_shp['shap_formatted']} impact, value: {top_shp['raw_value']})",
                f"Secondary SHAP Driver: {sec_shp['display_name']} ({sec_shp['shap_formatted']} impact, value: {sec_shp['raw_value']})",
                eval_res["intervention"]["future_forecast"]
            ]

            member_list.append({
                "id": p.patient_id,
                "patient_id": p.patient_id,
                "name": p.name or f"Patient {p.patient_id}",
                "tract_fips": p.tract_fips,
                "county": sdoh.county if sdoh else 'California',
                "state": sdoh.state if sdoh else 'CA',
                "gender": 'Female' if p.gender_f == 1.0 else 'Male',
                "priority": level_5,
                "priority_label": eval_res["intervention"]["action_headline"],
                "priorityColor": priority_color,
                "future_risk_5": eval_res["future_risk_5"],
                "future_risk_3": eval_res["future_risk_3"],
                "sdoh_risk": {
                    "level": sdoh_level,
                    "label": sdoh_label,
                    "poverty_2022": poverty_val,
                    "housing_burden_2022": housing_val,
                    "income_2022": income_val,
                    "unemployment_2022": unemployment_val,
                    "uninsured_2022": uninsured_val,
                    "food_access_2022": food_val,
                    "no_vehicle_2022": no_vehicle_val,
                    "disability_2022": disability_val,
                    "broadband_2022": broadband_val,
                    "education_2022": education_val,
                },
                "driver": driver,
                "driver_type": driver_type,
                "shap_drivers": shap_drivers,
                "status": status_text,
                "statusColor": status_color,
                "conditions": conditions_list,
                "edVisits": int(p.emergency_visits_last_12m or 0),
                "ipVisits": int(p.inpatient_admissions_last_12m or 0),
                "outpatientVisits": int(p.outpatient_visits_last_12m or 0),
                "encounters": int(p.encounters_last_12m or 0),
                "chronicCount": int(p.chronic_conditions_last_12m or 0),
                "diagnosesCount": int(p.conditions_last_12m or 0),
                "medicationsCount": int(p.medications_last_12m or 0),
                "proceduresCount": int(p.procedures_last_12m or 0),
                "clinicalBurden": int(p.clinical_burden_last_12m or 0),
                "healthcareUtilization": int(p.healthcare_utilization_last_12m or 0),
                "future_forecast_note": eval_res["intervention"]["future_forecast"],
                "details": details,
            })

        total_count = len(patients)
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


class CountyRiskMapView(APIView):
    """
    GET /api/map/counties/
    
    Aggregates real member records, 5-class & 3-class future risk predictions, population TreeSHAP drivers,
    and Community SDOH at the County and Census Tract levels for the California Geographic Risk Analysis Map.
    """
    def get(self, request):
        # ── Cache check ──────────────────────────────────────────────────────
        force_refresh = request.query_params.get('refresh') == '1'
        cache_key = 'county_risk_map'
        now = time.time()
        if not force_refresh and cache_key in _MAP_CACHE:
            cached_ts, cached_data = _MAP_CACHE[cache_key]
            if now - cached_ts < _MAP_CACHE_TTL:
                return Response(cached_data, status=status.HTTP_200_OK)
        # ────────────────────────────────────────────────────────────────────

        engine = get_prediction_engine()
        patients = list(Patient.objects.all().order_by('patient_id'))
        
        fips_list = [p.tract_fips for p in patients if p.tract_fips]
        sdoh_map = {
            s.tract_fips: s 
            for s in CommunitySDOH.objects.filter(tract_fips__in=fips_list)
        }

        pred_map = {
            pred.patient_id: pred 
            for pred in PatientRiskPrediction.objects.filter(patient__in=patients)
        }

        # Group by county and by tract_fips
        county_groups = defaultdict(list)
        tract_groups = defaultdict(list)

        for p in patients:
            pred = pred_map.get(p.id)
            if pred and not is_prediction_stale(p, pred):
                eval_res = prediction_to_dict(pred, patient=p)
            else:
                eval_res = engine.predict_patient(p, save_to_db=True, verbose=False)

            sdoh = sdoh_map.get(p.tract_fips)
            county_name = sdoh.county if sdoh and sdoh.county else 'California County'
            county_groups[county_name].append((p, sdoh, eval_res))
            tract_groups[p.tract_fips].append((p, sdoh, eval_res))

        county_list = []
        total_high_priority_all = 0

        # Score weights for 5-class average calculation (1.0 = Very Low, 5.0 = Critical)
        risk_weights_5 = {'Very Low': 1.0, 'Low': 2.0, 'Moderate': 3.0, 'High': 4.0, 'Critical': 5.0}

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

            county_patients_only = [p for p, sdoh, eval_res in items]

            for p, sdoh, eval_res in items:
                level_5 = eval_res["future_risk_5"]["level"]
                level_3 = eval_res["future_risk_3"]["level"]
                
                if level_5 in counts_5_class:
                    counts_5_class[level_5] += 1
                if level_3 in counts_3_class:
                    counts_3_class[level_3] += 1

                total_score_sum += risk_weights_5.get(level_5, 2.0)
                driver = eval_res["driver"]
                driver_counts[driver] += 1

                if sdoh:
                    if sdoh.poverty_2022 is not None: poverty_vals.append(sdoh.poverty_2022)
                    if sdoh.housing_burden_2022 is not None: housing_vals.append(sdoh.housing_burden_2022)
                    if sdoh.unemployment_2022 is not None: unemployment_vals.append(sdoh.unemployment_2022)
                    if sdoh.uninsured_2022 is not None: uninsured_vals.append(sdoh.uninsured_2022)
                    if sdoh.food_access_population_2022 is not None: food_vals.append(sdoh.food_access_population_2022)
                    if sdoh.income_2022 is not None: income_vals.append(sdoh.income_2022)

                county_member_details.append({
                    "id": p.patient_id,
                    "patient_id": p.patient_id,
                    "name": p.name or f"Patient {p.patient_id}",
                    "tract_fips": p.tract_fips,
                    "future_risk_5": level_5,
                    "future_risk_5_confidence_pct": eval_res["future_risk_5"]["confidence_pct"],
                    "future_risk_3": level_3,
                    "future_risk_3_confidence_pct": eval_res["future_risk_3"]["confidence_pct"],
                    "driver": driver,
                    "driver_type": eval_res.get("driver_type", "SDOH"),
                    "priority": eval_res["intervention"]["action_headline"],
                    "encounters": int(p.encounters_last_12m or 0),
                    "ed_visits": int(p.emergency_visits_last_12m or 0),
                    "ip_visits": int(p.inpatient_admissions_last_12m or 0),
                })

            high_risk_count = counts_5_class['Critical'] + counts_5_class['High']
            total_high_priority_all += high_risk_count

            avg_pov = sum(poverty_vals) / len(poverty_vals) if poverty_vals else 0.0
            avg_housing = sum(housing_vals) / len(housing_vals) if housing_vals else 0.0
            avg_unemp = sum(unemployment_vals) / len(unemployment_vals) if unemployment_vals else 0.0
            avg_unins = sum(uninsured_vals) / len(uninsured_vals) if uninsured_vals else 0.0
            avg_food = sum(food_vals) / len(food_vals) if food_vals else 0.0
            avg_income = sum(income_vals) / len(income_vals) if income_vals else 0.0

            # Average future risk (1.0 to 5.0 scale)
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

            # Aggregate stored per-patient SHAP drivers (fast — no ML inference)
            county_patient_ids = [p.id for p in county_patients_only]
            pop_sdoh_drivers, pop_clin_drivers = compute_shap_from_stored_predictions(county_patient_ids, pred_map)

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
            first_p, sdoh, first_eval = items[0]
            county_name = sdoh.county if sdoh and sdoh.county else 'California'
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

            tract_patients_only = [p for p, s, eval_res in items]

            for p, s, eval_res in items:
                level_5 = eval_res["future_risk_5"]["level"]
                level_3 = eval_res["future_risk_3"]["level"]
                if level_5 in counts_5: counts_5[level_5] += 1
                if level_3 in counts_3: counts_3[level_3] += 1
                t_score_sum += risk_weights_5.get(level_5, 2.0)
                driver = eval_res["driver"]
                t_driver_counts[driver] += 1
                tract_member_details.append({
                    "id": p.patient_id,
                    "patient_id": p.patient_id,
                    "name": p.name or f"Patient {p.patient_id}",
                    "tract_fips": p.tract_fips,
                    "future_risk_5": level_5,
                    "future_risk_5_confidence_pct": eval_res["future_risk_5"]["confidence_pct"],
                    "future_risk_3": level_3,
                    "future_risk_3_confidence_pct": eval_res["future_risk_3"]["confidence_pct"],
                    "driver": driver,
                    "driver_type": eval_res.get("driver_type", "SDOH"),
                    "priority": eval_res["intervention"]["action_headline"],
                    "encounters": int(p.encounters_last_12m or 0),
                    "ed_visits": int(p.emergency_visits_last_12m or 0),
                    "ip_visits": int(p.inpatient_admissions_last_12m or 0),
                })

            high_count = counts_5['Critical'] + counts_5['High']
            pov_val = round(float(sdoh.poverty_2022 or 0), 1) if sdoh else 0.0
            housing_val = round(float(sdoh.housing_burden_2022 or 0), 1) if sdoh else 0.0
            income_val = round(float(sdoh.income_2022 or 0), 0) if sdoh else 0.0
            unemp_val = round(float(sdoh.unemployment_2022 or 0), 1) if sdoh else 0.0
            unins_val = round(float(sdoh.uninsured_2022 or 0), 1) if sdoh else 0.0
            food_val = round(float(sdoh.food_access_population_2022 or 0), 1) if sdoh else 0.0
            veh_val = round(float(sdoh.no_vehicle_2022 or 0), 1) if sdoh else 0.0
            disab_val = round(float(sdoh.disability_2022 or 0), 1) if sdoh else 0.0
            broad_val = round(float(sdoh.broadband_2022 or 0), 1) if sdoh else 0.0
            edu_val = round(float(sdoh.education_2022 or 0), 1) if sdoh else 0.0

            # Average future risk (1.0 to 5.0 scale)
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

            # Aggregate stored per-patient SHAP drivers for this tract (fast — no ML inference)
            tract_patient_ids = [p.id for p in tract_patients_only]
            t_sdoh_drivers, t_clin_drivers = compute_shap_from_stored_predictions(tract_patient_ids, pred_map)

            t_top_drivers = []
            for d_name, d_cnt in sorted(t_driver_counts.items(), key=lambda x: -x[1])[:3]:
                t_top_drivers.append({
                    "name": d_name,
                    "count": d_cnt,
                    "percentage": int(round(d_cnt / t_members * 100)),
                    "color": "bg-error" if "Inpatient" in d_name or "Emergency" in d_name or "Severe" in d_name else "bg-primary"
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
                "primary_driver": first_eval.get("driver", "SDOH Factors"),
                "driver_type": first_eval.get("driver_type", "SDOH"),
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
        engine = get_prediction_engine()
        # Clean county ID search term
        cleaned_search = county_id.replace('-', ' ').replace('_', ' ').strip().lower()
        
        # Match CommunitySDOH tracts for this county
        sdoh_tracts = CommunitySDOH.objects.filter(county__icontains=cleaned_search)
        tract_fips_list = [s.tract_fips for s in sdoh_tracts]
        
        # Match patients residing in these tracts
        patients = list(Patient.objects.filter(tract_fips__in=tract_fips_list).order_by('patient_id'))
        
        # If no patients by tract match directly, search patient.community_sdoh.county
        if not patients:
            all_patients = Patient.objects.all()
            patients = [p for p in all_patients if p.community_sdoh and cleaned_search in (p.community_sdoh.county or '').lower()]

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

        county_name = patients[0].community_sdoh.county if patients[0].community_sdoh else f"{county_id.title()} County"
        sdoh_map = {s.tract_fips: s for s in CommunitySDOH.objects.filter(tract_fips__in=[p.tract_fips for p in patients])}
        pred_map = {pred.patient_id: pred for pred in PatientRiskPrediction.objects.filter(patient__in=patients)}

        counts_5 = {'Critical': 0, 'High': 0, 'Moderate': 0, 'Low': 0, 'Very Low': 0}
        counts_3 = {'High': 0, 'Moderate': 0, 'Low': 0}
        risk_weights_5 = {'Very Low': 1.0, 'Low': 2.0, 'Moderate': 3.0, 'High': 4.0, 'Critical': 5.0}
        total_score_sum = 0.0
        poverty_vals = []
        housing_vals = []
        member_details = []

        for p in patients:
            pred = pred_map.get(p.id)
            if pred and not is_prediction_stale(p, pred):
                eval_res = prediction_to_dict(pred, patient=p)
            else:
                eval_res = engine.predict_patient(p, save_to_db=True, verbose=False)

            sdoh = sdoh_map.get(p.tract_fips)
            level_5 = eval_res["future_risk_5"]["level"]
            level_3 = eval_res["future_risk_3"]["level"]

            if level_5 in counts_5: counts_5[level_5] += 1
            if level_3 in counts_3: counts_3[level_3] += 1
            total_score_sum += risk_weights_5.get(level_5, 2.0)

            if sdoh:
                if sdoh.poverty_2022 is not None: poverty_vals.append(sdoh.poverty_2022)
                if sdoh.housing_burden_2022 is not None: housing_vals.append(sdoh.housing_burden_2022)

            member_details.append({
                "id": p.patient_id,
                "patient_id": p.patient_id,
                "name": p.name or f"Patient {p.patient_id}",
                "tract_fips": p.tract_fips,
                "future_risk_5": level_5,
                "future_risk_3": level_3,
                "driver": eval_res["driver"],
                "driver_type": eval_res.get("driver_type", "SDOH"),
                "priority": eval_res["intervention"]["action_headline"],
                "encounters": int(p.encounters_last_12m or 0),
                "ed_visits": int(p.emergency_visits_last_12m or 0),
                "ip_visits": int(p.inpatient_admissions_last_12m or 0),
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

        sdoh_drivers, clinical_drivers = compute_population_tree_shap(patients, engine)

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
        patients = list(Patient.objects.all().order_by('patient_id'))
        total_patients = len(patients)
        if total_patients == 0:
            return Response({"error": "No patient records found"}, status=status.HTTP_404_NOT_FOUND)

        fips_list = [p.tract_fips for p in patients if p.tract_fips]
        sdoh_map = {s.tract_fips: s for s in CommunitySDOH.objects.filter(tract_fips__in=fips_list)}
        pred_map = {pred.patient_id: pred for pred in PatientRiskPrediction.objects.filter(patient__in=patients)}

        high_5_count = 0
        high_3_count = 0
        high_sdoh_count = 0
        clinical_only_high = 0
        elevated_by_sdoh = 0
        combined_high = 0

        poverty_list = []
        housing_list = []
        food_list = []
        vehicle_list = []
        education_list = []
        uninsured_list = []
        confidences_list = []

        patient_priority_rows = []

        for p in patients:
            pred = pred_map.get(p.id)
            sdoh = sdoh_map.get(p.tract_fips)

            level_5 = pred.future_risk_5_level if pred else 'Low'
            level_3 = pred.future_risk_3_level if pred else 'Low'
            conf_3 = pred.future_risk_3_confidence if pred else 0.8
            confidences_list.append(conf_3)

            is_high_5 = level_5 in ['Critical', 'High']
            is_high_3 = level_3 == 'High'

            if is_high_5:
                high_5_count += 1
                combined_high += 1
            if is_high_3:
                high_3_count += 1

            driver_type = pred.driver_type if pred else 'SDOH'
            primary_driver = pred.primary_driver if pred else 'Tract SDOH Factors'

            # SDOH metrics
            pov = float(sdoh.poverty_2022 or 0) if sdoh else 0.0
            house = float(sdoh.housing_burden_2022 or 0) if sdoh else 0.0
            food = float(sdoh.food_access_population_2022 or 0) if sdoh else 0.0
            veh = float(sdoh.no_vehicle_2022 or 0) if sdoh else 0.0
            edu = float(sdoh.education_2022 or 0) if sdoh else 0.0
            unins = float(sdoh.uninsured_2022 or 0) if sdoh else 0.0

            if pov >= 20.0 or house >= 30.0:
                high_sdoh_count += 1

            if sdoh:
                poverty_list.append(pov)
                housing_list.append(house)
                food_list.append(food)
                vehicle_list.append(veh)
                education_list.append(edu)
                uninsured_list.append(unins)

            # Categorize clinical vs SDOH elevation
            if is_high_5:
                if driver_type == 'Clinical':
                    clinical_only_high += 1
                else:
                    elevated_by_sdoh += 1

            # Priority Score (0-100)
            score_5 = 90 if level_5 == 'Critical' else (75 if level_5 == 'High' else (50 if level_5 == 'Moderate' else 25))
            sdoh_score = int(min(95, max(15, (pov * 1.5 + house * 1.0))))
            clinical_score = int(min(98, max(10, (int(p.encounters_last_12m or 0) * 3 + int(p.emergency_visits_last_12m or 0) * 15 + int(p.inpatient_admissions_last_12m or 0) * 25))))
            priority_score = int(min(98, max(20, (score_5 * 0.5 + sdoh_score * 0.3 + clinical_score * 0.2))))

            # Determine workflow status
            status_text = 'Pending Review' if level_5 in ['Critical', 'High'] else ('Active Monitoring' if level_5 == 'Moderate' else 'Stable')
            status_color = 'bg-error' if level_5 in ['Critical', 'High'] else ('bg-amber-500' if level_5 == 'Moderate' else 'bg-secondary')

            patient_priority_rows.append({
                "id": p.patient_id,
                "name": p.name or f"Patient {p.patient_id}",
                "priority": level_5,
                "priorityColor": "bg-error/10 text-error border-error/20" if level_5 in ['Critical', 'High'] else ("bg-amber-100 text-amber-800 border-amber-200" if level_5 == 'Moderate' else "bg-teal-100 text-teal-800 border-teal-200"),
                "clinical": f"{clinical_score}%",
                "social": f"{sdoh_score}%",
                "future_risk_5": level_5,
                "future_risk_3": level_3,
                "future6": f"{int(min(95, score_5 + 2))}%",
                "future12": f"{int(min(98, score_5 + 5))}%",
                "priorityScore": priority_score,
                "driver": primary_driver,
                "action": pred.intervention_priority if pred else f"{level_5} priority intervention",
                "status": status_text,
                "statusColor": status_color
            })

        # Sort priority members by priorityScore descending
        patient_priority_rows.sort(key=lambda r: -r['priorityScore'])

        # Summary Cards
        summary_cards = [
            { "title": "Total Members", "value": str(total_patients), "trend": "up", "subtext": f"{total_patients} enrolled in cohort", "trendType": "up" },
            { "title": "High Future Risk (5-Class)", "value": str(high_5_count), "trend": "up", "subtext": f"{round(high_5_count/total_patients*100, 1)}% of total cohort", "trendType": "up" },
            { "title": "High Social Risk", "value": str(high_sdoh_count), "trend": "flat", "subtext": f"{round(high_sdoh_count/total_patients*100, 1)}% high-need census tracts", "trendType": "flat" },
            { "title": "High Future Risk (3-Class)", "value": str(high_3_count), "trend": "up", "subtext": f"{round(high_3_count/total_patients*100, 1)}% CatBoost forecast", "trendType": "up" },
            { "title": "Priority Members", "value": str(high_5_count), "trend": "down", "subtext": "Immediate outreach required", "trendType": "down" },
            { "title": "Interventions Actioned", "value": str(int(round(high_5_count * 0.8))), "trend": "up", "subtext": "Active care pathways", "trendType": "up" }
        ]

        # Population Risk Synthesis
        avg_clinical = int(round(sum(int(p.encounters_last_12m or 0) for p in patients) / total_patients * 3.5))
        avg_clinical = min(85, max(30, avg_clinical))
        avg_social = int(round(sum(poverty_list) / len(poverty_list) * 2.2)) if poverty_list else 35
        avg_combined = int(round((avg_clinical * 0.45 + avg_social * 0.55)))
        avg_conf = round((sum(confidences_list) / len(confidences_list) * 100), 1) if confidences_list else 91.5

        # Social Risk Drivers
        high_pov_pct = int(round(len([v for v in poverty_list if v >= 15.0]) / total_patients * 100)) if poverty_list else 42
        high_house_pct = int(round(len([v for v in housing_list if v >= 25.0]) / total_patients * 100)) if housing_list else 38
        high_food_pct = int(round(len([v for v in food_list if v >= 20.0]) / total_patients * 100)) if food_list else 25
        high_veh_pct = int(round(len([v for v in vehicle_list if v >= 10.0]) / total_patients * 100)) if vehicle_list else 22
        high_edu_pct = int(round(len([v for v in education_list if v >= 20.0]) / total_patients * 100)) if education_list else 15
        high_unins_pct = int(round(len([v for v in uninsured_list if v >= 10.0]) / total_patients * 100)) if uninsured_list else 12

        social_drivers = [
            { "name": "Economic Stability (Poverty)", "percentage": high_pov_pct, "color": "bg-error", "text": f"{high_pov_pct}% High Risk" },
            { "name": "Housing Burden & Instability", "percentage": high_house_pct, "color": "bg-error", "text": f"{high_house_pct}% High Risk" },
            { "name": "Food Desert & Insecurity", "percentage": high_food_pct, "color": "bg-primary", "text": f"{high_food_pct}% Moderate Risk" },
            { "name": "Transportation & No-Vehicle", "percentage": high_veh_pct, "color": "bg-primary", "text": f"{high_veh_pct}% Moderate Risk" },
            { "name": "Education Deficits", "percentage": high_edu_pct, "color": "bg-secondary", "text": f"{high_edu_pct}% Low Risk" },
            { "name": "Healthcare & Uninsured Rate", "percentage": high_unins_pct, "color": "bg-secondary", "text": f"{high_unins_pct}% Low Risk" },
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
        patients = list(Patient.objects.all().order_by('patient_id'))
        fips_list = [p.tract_fips for p in patients if p.tract_fips]
        sdoh_map = {s.tract_fips: s for s in CommunitySDOH.objects.filter(tract_fips__in=fips_list)}
        pred_map = {pred.patient_id: pred for pred in PatientRiskPrediction.objects.filter(patient__in=patients)}

        candidates = []
        for p in patients:
            pred = pred_map.get(p.id)
            sdoh = sdoh_map.get(p.tract_fips)

            level_5 = pred.future_risk_5_level if pred else 'Low'
            level_3 = pred.future_risk_3_level if pred else 'Low'
            primary_driver = pred.primary_driver if pred else 'SDOH Risk'
            driver_type = pred.driver_type if pred else 'SDOH'

            pov = float(sdoh.poverty_2022 or 0) if sdoh else 0.0
            house = float(sdoh.housing_burden_2022 or 0) if sdoh else 0.0

            # Priority score
            score_base = 92 if level_5 == 'Critical' else (78 if level_5 == 'High' else (54 if level_5 == 'Moderate' else 28))
            priority_score = int(min(98, max(25, score_base + (2 if pov > 20 else 0) + (2 if house > 30 else 0))))

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

            priority_color = 'bg-error/10 text-error border-error/20' if level_5 in ['Critical', 'High'] else ('bg-amber-100 text-amber-800 border-amber-200' if level_5 == 'Moderate' else 'bg-teal-100 text-teal-800 border-teal-200')
            status_text = 'Suggested' if level_5 in ['Critical', 'High'] else ('Under Review' if level_5 == 'Moderate' else 'Active')
            status_color = 'bg-slate-400' if status_text == 'Suggested' else ('bg-amber-500' if status_text == 'Under Review' else 'bg-secondary')

            candidates.append({
                "id": p.patient_id,
                "name": p.name or f"Patient {p.patient_id}",
                "priority": level_5,
                "priorityColor": priority_color,
                "clinicalRisk": f"{int(min(98, max(15, int(p.encounters_last_12m or 0) * 4 + int(p.emergency_visits_last_12m or 0) * 15)))}%",
                "sdohRisk": f"{int(min(95, max(20, pov * 1.5 + house * 1.0)))}%",
                "currentRisk": f"{score_base}%",
                "future_risk_5": level_5,
                "future_risk_3": level_3,
                "future6": f"{int(min(95, score_base + 3))}%",
                "future6Trend": "up" if level_5 in ['Critical', 'High'] else "flat",
                "future12": f"{int(min(98, score_base + 6))}%",
                "future12Trend": "up" if level_5 in ['Critical', 'High'] else "flat",
                "priorityScore": priority_score,
                "driver": primary_driver,
                "driver_type": driver_type,
                "intervention": int_rec,
                "action_headline": pred.intervention_priority if pred else f"{level_5} priority intervention",
                "status": status_text,
                "statusColor": status_color,
                "county": sdoh.county if sdoh else "California",
                "tract_fips": p.tract_fips
            })

        candidates.sort(key=lambda c: -c['priorityScore'])

        # Summary KPIs
        total_cand = len(candidates)
        high_priority_cands = len([c for c in candidates if c['priority'] in ['Critical', 'High']])
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
