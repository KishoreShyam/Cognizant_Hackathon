"""
Service layer for retrieving combined Patient and Community SDOH features
and running ML risk predictions.
"""

from typing import Dict, Any, Optional, List
import pandas as pd
from .models import Patient, CommunitySDOH, PatientRiskPrediction
from .ml_engine import get_prediction_engine


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


def predict_patient_risk(patient_id: str, save_to_db: bool = True, verbose: bool = False) -> Dict[str, Any]:
    """
    Runs separate CURRENT (5-class) and FUTURE (3-class) risk prediction for a patient.
    """
    engine = get_prediction_engine()
    return engine.predict_patient(patient_id, save_to_db=save_to_db, verbose=verbose)


def predict_all_patients_risk(save_to_db: bool = True, verbose: bool = False) -> List[Dict[str, Any]]:
    """
    Runs risk predictions for all patients in the database.
    """
    engine = get_prediction_engine()
    return engine.predict_all_patients(save_to_db=save_to_db, verbose=verbose)
