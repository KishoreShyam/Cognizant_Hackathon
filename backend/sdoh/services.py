"""
Prediction Service Layer for SDOH Patient Risk Architecture.

Implements PREDICT-ONCE-AND-STORE:
1. Validates input feature hashes and model versions.
2. Reads stored database predictions without running ML/TreeSHAP on GET requests.
3. Automatically executes ML inference and TreeSHAP only when records are missing or stale.
"""

import logging
from typing import Dict, Any, Optional, List, Tuple
import pandas as pd
from django.utils import timezone
from .models import Patient, CommunitySDOH, PatientRiskPrediction
from .ml_engine import (
    get_prediction_engine,
    compute_patient_feature_hash,
    prediction_to_dict,
    MODEL_NAME,
    MODEL_VERSION,
)

logger = logging.getLogger(__name__)


def is_prediction_stale(patient: Patient, prediction: Optional[PatientRiskPrediction] = None) -> bool:
    """
    Determines if a patient's stored prediction is stale or invalid:
    - True if no prediction exists.
    - True if the prediction was made with an older model version.
    - True if the input predictive features (clinical/SDOH) have changed since the prediction was made.
    - True if TreeSHAP attributions are missing.
    - False if stored prediction is 100% fresh and matching current data.
    """
    if prediction is None:
        prediction = patient.predictions.order_by('-created_at').first()

    if prediction is None:
        return True

    if prediction.model_version != MODEL_VERSION:
        return True

    if not prediction.shap_drivers or not prediction.primary_driver:
        return True

    current_hash = compute_patient_feature_hash(patient)
    if prediction.input_data_hash != current_hash:
        return True

    return False


def get_or_predict_patient_risk(
    patient_id_or_instance,
    force_recalculate: bool = False,
    verbose: bool = False
) -> Dict[str, Any]:
    """
    High-level entry point for single patient prediction retrieval:
    - Reads cached prediction from PostgreSQL if fresh.
    - Runs ML + TreeSHAP only if stale or forced.
    """
    engine = get_prediction_engine()
    return engine.get_or_predict_patient(
        patient_id_or_instance,
        force_recalculate=force_recalculate,
        verbose=verbose
    )


def batch_ensure_predictions(verbose: bool = False) -> Dict[str, int]:
    """
    One-time batch check: ensures all patients in the database have fresh stored predictions.
    Only computes ML/SHAP for patients that actually need it.
    """
    engine = get_prediction_engine()
    patients = list(Patient.objects.all().order_by('patient_id'))
    pred_map = {
        pred.patient_id: pred
        for pred in PatientRiskPrediction.objects.filter(patient__in=patients)
    }

    fresh_count = 0
    calculated_count = 0

    for patient in patients:
        existing_pred = pred_map.get(patient.id)
        if existing_pred and not is_prediction_stale(patient, existing_pred):
            fresh_count += 1
        else:
            engine.predict_patient(patient, save_to_db=True, verbose=verbose)
            calculated_count += 1

    if verbose:
        logger.info(f"Batch ensure complete: {fresh_count} already cached, {calculated_count} computed.")

    return {
        'total': len(patients),
        'fresh_cached': fresh_count,
        'calculated': calculated_count
    }


def get_patient_with_sdoh(patient_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve clinical patient features combined with matching community SDOH features.
    """
    patient = Patient.objects.filter(patient_id=patient_id).first()
    if not patient:
        return None
    return patient.get_combined_features()


def get_patient_sdoh_record(patient_id: str) -> Optional[CommunitySDOH]:
    """
    Retrieve the CommunitySDOH model instance matching the patient's tract_fips.
    """
    patient = Patient.objects.filter(patient_id=patient_id).first()
    if not patient or not patient.tract_fips:
        return None
    return CommunitySDOH.objects.filter(tract_fips=patient.tract_fips).first()


def get_combined_features_dataframe(patient_ids: Optional[List[str]] = None) -> pd.DataFrame:
    """
    Retrieve a batch of patients with their matched CommunitySDOH features
    as a pandas DataFrame ready for model input.
    """
    qs = Patient.objects.all()
    if patient_ids:
        qs = qs.filter(patient_id__in=patient_ids)

    combined_list = []
    for patient in qs.iterator():
        combined_list.append(patient.get_combined_features())

    return pd.DataFrame(combined_list)
