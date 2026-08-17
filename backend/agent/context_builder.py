"""
context_builder.py

Builds a structured patient context from real database records.
Reads:
  - Patient (clinical/utilization features)
  - CommunitySDOH (census tract SDOH features)
  - PatientRiskPrediction (stored ML risk + TreeSHAP results)

Does NOT run ML inference or recalculate SHAP.
Does NOT invent or hallucinate patient data.
"""

from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Intervention mapping: deterministic driver → intervention category
INTERVENTION_MAP = {
    'poverty': 'Financial Assistance / Benefits Navigation',
    'income': 'Financial Assistance / Benefits Navigation',
    'unemployment': 'Employment Support / Benefits Navigation',
    'housing': 'Housing Support / Stability Program',
    'food': 'Food Assistance Program',
    'vehicle': 'Transportation Assistance',
    'transport': 'Transportation Assistance',
    'broadband': 'Digital Access / Telehealth Enablement',
    'digital': 'Digital Access / Telehealth Enablement',
    'education': 'Health Literacy / Education Support',
    'uninsured': 'Insurance Enrollment / Benefits Navigation',
    'disability': 'Disability Support Services',
    'medication': 'Medication Adherence Support',
    'emergency': 'Care Coordination / ED Follow-up',
    'inpatient': 'Care Coordination / Post-Discharge Follow-up',
    'hospitalization': 'Care Coordination / Post-Discharge Follow-up',
    'chronic': 'Chronic Disease Management Program',
    'clinical_burden': 'Complex Care Management',
    'utilization': 'Care Coordination / Utilization Management',
}


def get_intervention_for_driver(feature_name: str, display_name: str) -> str:
    """Map a driver feature to an intervention category deterministically."""
    key = (feature_name + ' ' + display_name).lower()
    for kw, intervention in INTERVENTION_MAP.items():
        if kw in key:
            return intervention
    return 'Care Management Review'


def build_patient_context(patient_id: str) -> dict:
    """
    Build structured patient context from existing database records.
    Returns a dict with:
      - patient_info: demographics, geography
      - risk_info: 5-class and 3-class predictions, confidence
      - sdoh_data: community SDOH values
      - shap_drivers: stored TreeSHAP results (SDOH + Clinical)
      - intervention_options: deterministic driver → intervention mapping
      - context_text: pre-formatted plain-text summary for the LLM
    """
    from sdoh.models import Patient, PatientRiskPrediction, CommunitySDOH

    try:
        patient = Patient.objects.select_related().get(patient_id=patient_id)
    except Patient.DoesNotExist:
        return {'error': f'Patient {patient_id} not found in database.'}

    sdoh = patient.community_sdoh
    pred = patient.predictions.order_by('-created_at').first()

    # ── Patient demographics ──
    gender = 'Female' if patient.gender_f == 1.0 else 'Male'
    county = sdoh.county if sdoh else 'Unknown County'
    state = sdoh.state if sdoh else 'CA'
    tract = patient.tract_fips

    # ── Risk predictions ──
    risk_5_level = pred.current_risk_level if pred else 'Unknown'
    risk_5_confidence = round(pred.current_risk_confidence * 100, 1) if pred and pred.current_risk_confidence else None
    risk_5_confidence_pct = f'{risk_5_confidence}%' if risk_5_confidence else 'N/A'
    risk_3_level = pred.future_risk_level if pred else 'Unknown'
    risk_3_confidence = round(pred.future_risk_confidence * 100, 1) if pred and pred.future_risk_confidence else None
    risk_3_confidence_pct = f'{risk_3_confidence}%' if risk_3_confidence else 'N/A'
    intervention_priority = pred.intervention_priority if pred else 'N/A'
    driver_type = pred.driver_type if pred else 'N/A'
    primary_driver = pred.primary_driver if pred else 'N/A'

    # ── SDOH data ──
    sdoh_data = {}
    if sdoh:
        sdoh_data = {
            'poverty_rate': sdoh.poverty_2022,
            'area_median_income': sdoh.income_2022,
            'unemployment_rate': sdoh.unemployment_2022,
            'housing_burden': sdoh.housing_burden_2022,
            'uninsured_rate': sdoh.uninsured_2022,
            'food_access_limitation': sdoh.food_access_population_2022,
            'transportation_barrier': sdoh.no_vehicle_2022,
            'disability_rate': sdoh.disability_2022,
            'broadband_limitation': sdoh.broadband_2022,
            'education_attainment': sdoh.education_2022,
        }

    # ── Clinical utilization ──
    clinical_data = {
        'encounters_last_12m': patient.encounters_last_12m,
        'inpatient_admissions': patient.inpatient_admissions_last_12m,
        'emergency_visits': patient.emergency_visits_last_12m,
        'outpatient_visits': patient.outpatient_visits_last_12m,
        'conditions': patient.conditions_last_12m,
        'chronic_conditions': patient.chronic_conditions_last_12m,
        'medications': patient.medications_last_12m,
        'procedures': patient.procedures_last_12m,
        'clinical_burden': patient.clinical_burden_last_12m,
        'healthcare_utilization': patient.healthcare_utilization_last_12m,
    }

    # ── TreeSHAP drivers (stored – not recalculated) ──
    raw_shap = pred.shap_drivers if pred else []
    sdoh_drivers = [d for d in raw_shap if d.get('category') == 'SDOH']
    clinical_drivers = [d for d in raw_shap if d.get('category') == 'Clinical']

    # ── Intervention options ──
    intervention_options = []
    for d in raw_shap[:8]:
        iv = get_intervention_for_driver(d.get('feature', ''), d.get('display_name', ''))
        intervention_options.append({
            'driver': d.get('display_name'),
            'shap': d.get('shap_value', 0),
            'shap_formatted': d.get('shap_formatted', ''),
            'category': d.get('category', 'Unknown'),
            'intervention': iv,
        })

    # ── Build plain-text context for the LLM ──
    context_lines = [
        '=== PATIENT INFORMATION ===',
        f'Patient ID: {patient_id}',
        f'Name: {patient.name or patient_id}',
        f'Gender: {gender}',
        f'County: {county}, {state}',
        f'Census Tract: {tract}',
        '',
        '=== RISK PREDICTIONS (ML SYSTEM — DO NOT RECALCULATE) ===',
        f'Future Risk Class (5-Class CatBoost): {risk_5_level} ({risk_5_confidence_pct} confidence)',
        f'Future Risk Class (3-Class CatBoost): {risk_3_level} ({risk_3_confidence_pct} confidence)',
        f'Primary Driver Category: {driver_type}',
        f'Primary Driver: {primary_driver}',
        f'Intervention Priority: {intervention_priority}',
        '',
        '=== TOP SDOH DRIVERS (TreeSHAP — DO NOT RECALCULATE) ===',
    ]
    for i, d in enumerate(sdoh_drivers[:5], 1):
        context_lines.append(
            f'{i}. {d.get("display_name")} | Value: {d.get("raw_value")} | SHAP: {d.get("shap_formatted")}'
        )

    context_lines += ['', '=== TOP CLINICAL DRIVERS (TreeSHAP — DO NOT RECALCULATE) ===']
    for i, d in enumerate(clinical_drivers[:5], 1):
        context_lines.append(
            f'{i}. {d.get("display_name")} | Value: {d.get("raw_value")} | SHAP: {d.get("shap_formatted")}'
        )

    context_lines += ['', '=== COMMUNITY SDOH DATA ===']
    for k, v in sdoh_data.items():
        if v is not None:
            context_lines.append(f'{k.replace("_", " ").title()}: {v}')

    context_lines += ['', '=== CLINICAL UTILIZATION (LAST 12 MONTHS) ===']
    for k, v in clinical_data.items():
        if v is not None:
            context_lines.append(f'{k.replace("_", " ").title()}: {v}')

    context_lines += [
        '',
        '=== INTERVENTION OPTIONS (DETERMINISTIC MAPPING) ===',
    ]
    seen = set()
    for opt in intervention_options:
        iv = opt['intervention']
        if iv not in seen:
            context_lines.append(f'- {opt["driver"]} ({opt["shap_formatted"]}) → {iv}')
            seen.add(iv)

    context_text = '\n'.join(context_lines)

    return {
        'patient_id': patient_id,
        'name': patient.name or patient_id,
        'gender': gender,
        'county': county,
        'state': state,
        'tract_fips': tract,
        'risk_5_level': risk_5_level,
        'risk_5_confidence_pct': risk_5_confidence_pct,
        'risk_3_level': risk_3_level,
        'risk_3_confidence_pct': risk_3_confidence_pct,
        'intervention_priority': intervention_priority,
        'driver_type': driver_type,
        'primary_driver': primary_driver,
        'sdoh_data': sdoh_data,
        'clinical_data': clinical_data,
        'shap_drivers': raw_shap,
        'sdoh_drivers': sdoh_drivers,
        'clinical_drivers': clinical_drivers,
        'intervention_options': intervention_options,
        'context_text': context_text,
    }
