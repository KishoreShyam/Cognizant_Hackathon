from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from collections import defaultdict
from .models import Patient, CommunitySDOH, PatientRiskPrediction
from .ml_engine import get_prediction_engine


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
            engine = get_prediction_engine()
            result = engine.predict_patient(patient, save_to_db=True, verbose=False)
            
            response_data = {
                "patient_id": result["patient_id"],
                "tract_fips": result["tract_fips"],
                "future_risk_5": result["future_risk_5"],
                "future_risk_3": result["future_risk_3"],
                "driver": result["driver"],
                "driver_type": result["driver_type"],
                "shap_drivers": result["shap_drivers"],
                "intervention": result["intervention"]
            }
            return Response(response_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"error": f"Prediction failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def get(self, request, patient_id):
        return self.post(request, patient_id)


class PatientListView(APIView):
    """
    GET /api/patients/
    GET /api/members/
    
    Returns all real database patients with matched community SDOH data,
    real 5-class future risk, real 3-class future risk, REAL TreeSHAP drivers,
    and dynamically calculated summary cards.
    """
    def get(self, request):
        engine = get_prediction_engine()
        patients = list(Patient.objects.all().order_by('patient_id'))
        
        fips_list = [p.tract_fips for p in patients if p.tract_fips]
        sdoh_map = {
            s.tract_fips: s 
            for s in CommunitySDOH.objects.filter(tract_fips__in=fips_list)
        }

        member_list = []
        high_priority_count = 0
        clinical_dominant_count = 0
        sdoh_dominant_count = 0
        combined_elevated_count = 0

        for p in patients:
            # Predict and calculate real TreeSHAP values
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
            details = [
                f"Primary SHAP Driver: {shap_drivers[0]['display_name']} ({shap_drivers[0]['shap_formatted']} impact, value: {shap_drivers[0]['raw_value']})",
                f"Secondary SHAP Driver: {shap_drivers[1]['display_name']} ({shap_drivers[1]['shap_formatted']} impact, value: {shap_drivers[1]['raw_value']})",
                eval_res["intervention"]["future_forecast"]
            ]

            member_list.append({
                "id": p.patient_id,
                "patient_id": p.patient_id,
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
    Returns full patient features, matched Community SDOH info, and TreeSHAP risk predictions.
    """
    def get(self, request, patient_id):
        patient = get_object_or_404(Patient, patient_id=patient_id)
        combined = patient.get_combined_features()
        engine = get_prediction_engine()
        eval_res = engine.predict_patient(patient, save_to_db=True, verbose=False)
        sdoh = patient.community_sdoh

        shap_drivers = eval_res["shap_drivers"]
        details = [
            f"Primary SHAP Driver: {shap_drivers[0]['display_name']} ({shap_drivers[0]['shap_formatted']} impact, value: {shap_drivers[0]['raw_value']})",
            f"Secondary SHAP Driver: {shap_drivers[1]['display_name']} ({shap_drivers[1]['shap_formatted']} impact, value: {shap_drivers[1]['raw_value']})",
            eval_res["intervention"]["future_forecast"]
        ]

        response_data = {
            "patient": combined,
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


class CountyRiskMapView(APIView):
    """
    GET /api/map/counties/
    
    Aggregates real member records, 5-class & 3-class future risk predictions, TreeSHAP drivers, and Community SDOH
    at the County level for the California Population Risk Map.
    """
    def get(self, request):
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

        # Group by county
        county_groups = defaultdict(list)

        for p in patients:
            pred = pred_map.get(p.id)
            if not pred:
                eval_res = engine.predict_patient(p, save_to_db=True, verbose=False)
                pred = p.latest_prediction
            else:
                level_5 = pred.future_risk_5_level or 'Low'
                level_3 = pred.future_risk_3_level or 'Low'
                conf_5_pct = f"{(pred.future_risk_5_confidence or 1.0)*100:.2f}%"
                conf_3_pct = f"{(pred.future_risk_3_confidence or 1.0)*100:.2f}%"
                headline = pred.intervention_priority or f"{level_5} priority intervention"
                forecast = pred.future_forecast_note or f"Future risk is projected at {level_3}."
                eval_res = {
                    "future_risk_5": {
                        "level": level_5,
                        "confidence_pct": conf_5_pct,
                        "probabilities": pred.future_risk_5_probabilities
                    },
                    "future_risk_3": {
                        "level": level_3,
                        "confidence_pct": conf_3_pct,
                        "probabilities": pred.future_risk_3_probabilities
                    },
                    "driver": f"Tract SDOH & Clinical Acuity ({level_3})",
                    "intervention": {
                        "action_headline": headline,
                        "future_forecast": forecast
                    }
                }

            sdoh = sdoh_map.get(p.tract_fips)
            county_name = sdoh.county if sdoh and sdoh.county else 'California County'
            county_groups[county_name].append((p, sdoh, eval_res))

        county_list = []
        total_high_priority_all = 0

        for county_name, items in county_groups.items():
            total_members = len(items)
            counts_5_class = {'Critical': 0, 'High': 0, 'Moderate': 0, 'Low': 0, 'Very Low': 0}
            counts_3_class = {'High': 0, 'Moderate': 0, 'Low': 0}
            
            poverty_vals = []
            housing_vals = []
            unemployment_vals = []
            uninsured_vals = []
            food_vals = []
            
            county_member_details = []
            driver_counts = defaultdict(int)

            for p, sdoh, eval_res in items:
                level_5 = eval_res["future_risk_5"]["level"]
                level_3 = eval_res["future_risk_3"]["level"]
                
                if level_5 in counts_5_class:
                    counts_5_class[level_5] += 1
                if level_3 in counts_3_class:
                    counts_3_class[level_3] += 1

                driver = eval_res["driver"]
                driver_counts[driver] += 1

                if sdoh:
                    if sdoh.poverty_2022 is not None: poverty_vals.append(sdoh.poverty_2022)
                    if sdoh.housing_burden_2022 is not None: housing_vals.append(sdoh.housing_burden_2022)
                    if sdoh.unemployment_2022 is not None: unemployment_vals.append(sdoh.unemployment_2022)
                    if sdoh.uninsured_2022 is not None: uninsured_vals.append(sdoh.uninsured_2022)
                    if sdoh.food_access_population_2022 is not None: food_vals.append(sdoh.food_access_population_2022)

                county_member_details.append({
                    "id": p.patient_id,
                    "tract_fips": p.tract_fips,
                    "future_risk_5": level_5,
                    "future_risk_5_confidence_pct": eval_res["future_risk_5"]["confidence_pct"],
                    "future_risk_3": level_3,
                    "future_risk_3_confidence_pct": eval_res["future_risk_3"]["confidence_pct"],
                    "driver": driver,
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

            # Top drivers with percentages
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
                "name": county_name,
                "lat": coords[0],
                "lng": coords[1],
                "total_members": total_members,
                "high_risk_members": high_risk_count,
                "priorityScore": priority_score,
                "status": status_label,
                "statusColor": status_color,
                "future_risk_5_breakdown": counts_5_class,
                "future_risk_3_breakdown": counts_3_class,
                "sdoh_averages": {
                    "poverty": round(avg_pov, 1),
                    "housing_burden": round(avg_housing, 1),
                    "unemployment": round(avg_unemp, 1),
                    "uninsured": round(avg_unins, 1),
                    "food_access": round(avg_food, 1),
                },
                "drivers": top_drivers,
                "members": county_member_details,
            })

        # Sort counties by priorityScore descending
        county_list.sort(key=lambda c: (-c['priorityScore'], -c['total_members']))

        return Response({
            "total_counties": len(county_list),
            "total_members": len(patients),
            "total_high_risk_members": total_high_priority_all,
            "counties": county_list
        }, status=status.HTTP_200_OK)
