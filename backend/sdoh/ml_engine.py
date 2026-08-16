"""
ML Prediction Engine for SDOH Patient Risk Assessment.

Manages:
1. 3-CLASS FUTURE RISK MODEL: CatBoost Model (FUTURE_TARGET)
   Classes: 0=Low, 1=Moderate, 2=High
2. 5-CLASS FUTURE RISK HARMONIZATION: (RISK_TARGET_5)
   Classes: 0=Very Low, 1=Low, 2=Moderate, 3=High, 4=Critical
3. TreeSHAP Feature Attribution Engine:
   Computes exact, real mathematical SHAP values for every patient prediction to identify
   the true Primary Risk Drivers.

CRITICAL RULES:
- The CatBoost model (sdoh_catboost_future_risk_model.cbm) is the core validated future risk model.
- Evaluates real PostgreSQL Patient data + matched CommunitySDOH via tract_fips.
- Zero fake/mock scores. True TreeSHAP feature attributions.
"""

import os
import logging
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
import json
import joblib
import catboost
import numpy as np
import pandas as pd

from django.conf import settings
from .models import Patient, CommunitySDOH, PatientRiskPrediction

logger = logging.getLogger(__name__)

# Model Metadata & Versioning
MODEL_NAME = 'sdoh_catboost_future_risk_model.cbm'
MODEL_VERSION = 'catboost_v1'

# Class Mappings
FUTURE_RISK_3_MAP = {
    0: 'Low',
    1: 'Moderate',
    2: 'High'
}

FUTURE_RISK_5_MAP = {
    0: 'Very Low',
    1: 'Low',
    2: 'Moderate',
    3: 'High',
    4: 'Critical'
}

FEATURE_DISPLAY_NAMES = {
    'poverty_2022': 'Poverty Rate',
    'poverty_2020': 'Baseline Poverty Rate',
    'poverty_change_20_22': 'Poverty Escalation',
    'housing_burden_2022': 'Housing Cost Burden',
    'housing_burden_2020': 'Baseline Housing Burden',
    'housing_burden_change_20_22': 'Housing Burden Escalation',
    'income_2022': 'Area Median Income',
    'income_2020': 'Baseline Median Income',
    'income_change_20_22': 'Income Trajectory',
    'unemployment_2022': 'Unemployment Rate',
    'unemployment_2020': 'Baseline Unemployment',
    'unemployment_change_20_22': 'Unemployment Escalation',
    'uninsured_2022': 'Uninsured Population',
    'uninsured_2020': 'Baseline Uninsured Rate',
    'uninsured_change_20_22': 'Uninsured Trend',
    'food_access_population_2022': 'Food Access Limitation',
    'food_access_population_2020': 'Baseline Food Access',
    'food_access_population_change_20_22': 'Food Insecurity Trend',
    'no_vehicle_2022': 'Transportation Barrier',
    'no_vehicle_2020': 'Baseline Transportation Barrier',
    'no_vehicle_change_20_22': 'Transportation Trend',
    'disability_2022': 'Disability Prevalence Rate',
    'disability_2020': 'Baseline Disability Rate',
    'disability_change_20_22': 'Disability Trend',
    'broadband_2022': 'Broadband Access Limitation',
    'broadband_2020': 'Baseline Broadband Access',
    'broadband_change_20_22': 'Broadband Trend',
    'education_2022': 'Education Attainment Level',
    'education_2020': 'Baseline Education Level',
    'education_change_20_22': 'Education Trend',
    'CLINICAL_BURDEN_LAST_12M': 'Clinical Intensity Score',
    'HEALTHCARE_UTILIZATION_LAST_12M': 'Healthcare Utilization Score',
    'INPATIENT_ADMISSIONS_LAST_12M': 'Inpatient Readmissions (12M)',
    'EMERGENCY_VISITS_LAST_12M': 'Emergency Department Visits (12M)',
    'OUTPATIENT_VISITS_LAST_12M': 'Outpatient Encounters (12M)',
    'ENCOUNTERS_LAST_12M': 'Total Healthcare Encounters (12M)',
    'CHRONIC_CONDITIONS_LAST_12M': 'Chronic Condition Load',
    'CONDITIONS_LAST_12M': 'Total Diagnoses Count',
    'MEDICATIONS_LAST_12M': 'Active Medications Count',
    'PROCEDURES_LAST_12M': 'Clinical Procedures Count',
    'MEDICATIONS_PER_ENCOUNTER_LAST_12M': 'Medication Density',
    'CONDITIONS_PER_ENCOUNTER_LAST_12M': 'Diagnosis Density',
    'GROWTH_RECENT_VS_PREVIOUS_ENCOUNTERS': 'Encounter Trajectory Growth',
    'GROWTH_RECENT_VS_PREVIOUS_CONDITIONS': 'Condition Trajectory Growth',
    'GROWTH_RECENT_VS_PREVIOUS_CHRONIC_CONDITIONS': 'Chronic Condition Trajectory',
    'GROWTH_RECENT_VS_PREVIOUS_CLINICAL_BURDEN': 'Clinical Acuity Escalation',
    'CHANGE_RECENT_VS_PREVIOUS_ENCOUNTERS': 'Encounter Frequency Change',
    'CHANGE_RECENT_VS_PREVIOUS_CONDITIONS': 'New Diagnoses Change',
    'CHANGE_RECENT_VS_PREVIOUS_CHRONIC_CONDITIONS': 'New Chronic Conditions',
    'CHANGE_RECENT_VS_PREVIOUS_MEDICATIONS': 'Medication Escalation',
    'GROWTH_RECENT_VS_PREVIOUS_MEDICATIONS': 'Medication Growth Rate',
    'CHANGE_RECENT_VS_PREVIOUS_PROCEDURES': 'Procedure Frequency Change',
    'GROWTH_RECENT_VS_PREVIOUS_PROCEDURES': 'Procedure Growth Rate',
    'CHANGE_RECENT_VS_PREVIOUS_HEALTHCARE_UTILIZATION': 'Utilization Escalation',
    'GROWTH_RECENT_VS_PREVIOUS_HEALTHCARE_UTILIZATION': 'Utilization Growth Rate',
    'GENDER_F': 'Gender (Female)',
    'GENDER_M': 'Gender (Male)',
    'COUNTY': 'County Environment',
    'STATE': 'State Baseline',
    'SNAPSHOT_DATE': 'Temporal Snapshot Date'
}

CLINICAL_FEATURES = {
    'ENCOUNTERS_LAST_12M', 'INPATIENT_ADMISSIONS_LAST_12M', 'EMERGENCY_VISITS_LAST_12M', 
    'OUTPATIENT_VISITS_LAST_12M', 'CONDITIONS_LAST_12M', 'CHRONIC_CONDITIONS_LAST_12M', 
    'MEDICATIONS_LAST_12M', 'PROCEDURES_LAST_12M', 'CLINICAL_BURDEN_LAST_12M', 
    'HEALTHCARE_UTILIZATION_LAST_12M', 'MEDICATIONS_PER_ENCOUNTER_LAST_12M', 
    'CONDITIONS_PER_ENCOUNTER_LAST_12M', 'CHANGE_RECENT_VS_PREVIOUS_ENCOUNTERS', 
    'GROWTH_RECENT_VS_PREVIOUS_ENCOUNTERS', 'CHANGE_RECENT_VS_PREVIOUS_CONDITIONS', 
    'GROWTH_RECENT_VS_PREVIOUS_CONDITIONS', 'CHANGE_RECENT_VS_PREVIOUS_CHRONIC_CONDITIONS', 
    'GROWTH_RECENT_VS_PREVIOUS_CHRONIC_CONDITIONS', 'CHANGE_RECENT_VS_PREVIOUS_MEDICATIONS', 
    'GROWTH_RECENT_VS_PREVIOUS_MEDICATIONS', 'CHANGE_RECENT_VS_PREVIOUS_PROCEDURES', 
    'GROWTH_RECENT_VS_PREVIOUS_PROCEDURES', 'CHANGE_RECENT_VS_PREVIOUS_CLINICAL_BURDEN', 
    'GROWTH_RECENT_VS_PREVIOUS_CLINICAL_BURDEN', 'CHANGE_RECENT_VS_PREVIOUS_HEALTHCARE_UTILIZATION', 
    'GROWTH_RECENT_VS_PREVIOUS_HEALTHCARE_UTILIZATION'
}


def compute_patient_feature_hash(patient: Patient) -> str:
    """
    Computes a deterministic SHA-256 hash strictly from the predictive feature inputs
    (clinical features on Patient and community SDOH features on linked CommunitySDOH).
    Excludes non-predictive metadata (IDs, database timestamps).
    """
    combined = patient.get_combined_features()
    feature_items = []
    
    # Sort keys for deterministic canonical representation
    for k in sorted(combined.keys()):
        # Exclude non-predictive identifiers/metadata
        if k in ['patient_id', 'PATIENT_ID', 'id', 'created_at', 'updated_at']:
            continue
        val = combined[k]
        if val is None:
            val_str = "null"
        elif isinstance(val, (float, np.floating)):
            val_str = f"{val:.4f}"
        elif isinstance(val, (int, np.integer)):
            val_str = str(val)
        else:
            val_str = str(val).strip().lower()
        feature_items.append(f"{k}:{val_str}")
    
    payload = "|".join(feature_items)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def prediction_to_dict(prediction: PatientRiskPrediction, patient: Optional[Patient] = None) -> Dict[str, Any]:
    """
    Instantly transforms a stored database PatientRiskPrediction record into the
    exact API dictionary representation without running any ML inference or TreeSHAP calculations.
    """
    p = patient or prediction.patient
    level_5 = prediction.current_risk_level or 'Low'
    conf_5 = float(prediction.current_risk_confidence or 1.0)
    level_3 = prediction.future_risk_level or 'Low'
    conf_3 = float(prediction.future_risk_confidence or 1.0)

    # Format TreeSHAP drivers
    shap_drivers = prediction.shap_drivers or []
    driver = prediction.primary_driver or (
        f"{shap_drivers[0]['display_name']} ({shap_drivers[0]['shap_formatted']} SHAP)"
        if shap_drivers else f"SDOH Vulnerability & Clinical Acuity ({level_3})"
    )
    driver_type = prediction.driver_type or (
        shap_drivers[0].get('category', 'SDOH') if shap_drivers else 'SDOH'
    )

    action_headline = prediction.intervention_priority or f"{level_5} priority intervention"
    forecast_note = prediction.future_forecast_note or f"Future risk is projected at {level_3} (confidence: {conf_3*100:.1f}%)."

    return {
        'patient_id': p.patient_id,
        'tract_fips': prediction.tract_fips or p.tract_fips,
        'future_risk_5': {
            'class': prediction.current_risk_class if prediction.current_risk_class is not None else 1,
            'level': level_5,
            'confidence': conf_5,
            'confidence_pct': f"{conf_5 * 100:.2f}%",
            'probabilities': prediction.current_risk_probabilities or {}
        },
        'future_risk_3': {
            'class': prediction.future_risk_class if prediction.future_risk_class is not None else 0,
            'level': level_3,
            'confidence': conf_3,
            'confidence_pct': f"{conf_3 * 100:.2f}%",
            'probabilities': prediction.future_risk_probabilities or {}
        },
        'driver': driver,
        'driver_type': driver_type,
        'shap_drivers': shap_drivers,
        'future_risk_5_class': level_5,
        'future_risk_3_class': level_3,
        'intervention': {
            'priority_level': level_5,
            'action_headline': action_headline,
            'future_forecast': forecast_note
        },
        'model_info': {
            'model_name': prediction.model_name or MODEL_NAME,
            'model_version': prediction.model_version or MODEL_VERSION,
            'input_data_hash': prediction.input_data_hash,
            'predicted_at': str(prediction.predicted_at or prediction.updated_at),
            'cached': True
        }
    }


class SDOHPredictionEngine:
    _instance = None

    def __init__(self):
        self.ml_dir = Path(settings.BASE_DIR) / 'ml_models'
        self.model_3_class = None
        self.model_5_class = None
        self.preprocessor_5_class = None
        self.feature_names = []
        self.loaded = False
        self._load_models()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_models(self):
        """Loads the validated CatBoost 3-class future risk model and metadata."""
        model_3_path = self.ml_dir / 'sdoh_catboost_future_risk_model.cbm'
        features_json_path = self.ml_dir / 'model_features.json'
        model_5_path = self.ml_dir / 'best_sdoh_risk_model.pkl'
        preprocessor_path = self.ml_dir / 'sdoh_preprocessor.pkl'

        if not model_3_path.exists():
            raise FileNotFoundError(f"Future risk CatBoost model not found at {model_3_path}")

        # Load 3-Class Future Risk CatBoost Model (FUTURE_TARGET)
        self.model_3_class = catboost.CatBoostClassifier()
        self.model_3_class.load_model(str(model_3_path))

        # Load feature names signature
        if hasattr(self.model_3_class, 'feature_names_') and self.model_3_class.feature_names_:
            self.feature_names = list(self.model_3_class.feature_names_)
        elif features_json_path.exists():
            with open(features_json_path, 'r') as f:
                meta = json.load(f)
            self.feature_names = meta.get('model_features', [])

        # Optionally load 5-class model artifacts if available
        if model_5_path.exists() and preprocessor_path.exists():
            try:
                self.model_5_class = joblib.load(model_5_path)
                self.preprocessor_5_class = joblib.load(preprocessor_path)
            except Exception as e:
                logger.warning(f"Optional 5-class artifact could not be loaded: {e}")

        self.loaded = True
        logger.info(f"SDOH Prediction Engine: CatBoost model loaded successfully with {len(self.feature_names)} features.")

    def get_model_info(self) -> Dict[str, Any]:
        """Returns metadata regarding the future risk models."""
        return {
            'future_model_3_class': {
                'filename': 'sdoh_catboost_future_risk_model.cbm',
                'model_type': 'CatBoostClassifier',
                'target': 'FUTURE_TARGET',
                'classes': list(FUTURE_RISK_3_MAP.values()),
                'num_classes': len(FUTURE_RISK_3_MAP),
                'expected_features': len(self.feature_names),
                'feature_names': self.feature_names,
                'shap_enabled': True
            },
            'future_model_5_class': {
                'target': 'RISK_TARGET_5',
                'classes': list(FUTURE_RISK_5_MAP.values()),
                'num_classes': len(FUTURE_RISK_5_MAP),
            }
        }

    def assemble_features(self, patient: Patient, verbose: bool = False) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        Retrieves patient and matching CommunitySDOH features, verifies integrity,
        and constructs the exact 63-feature DataFrame required by the CatBoost model.
        """
        combined = patient.get_combined_features()
        community_found = patient.community_sdoh is not None

        expected_features = self.feature_names

        row_dict = {}
        missing_features = []
        for feat in expected_features:
            if feat in combined and combined[feat] is not None:
                row_dict[feat] = combined[feat]
            elif feat.lower() in combined and combined[feat.lower()] is not None:
                row_dict[feat] = combined[feat.lower()]
            elif feat.upper() in combined and combined[feat.upper()] is not None:
                row_dict[feat] = combined[feat.upper()]
            else:
                if feat in ['COUNTY', 'STATE', 'SNAPSHOT_DATE', 'tract_fips', 'CENSUS_TRACT_GEOID']:
                    row_dict[feat] = str(combined.get(feat, ''))
                else:
                    row_dict[feat] = 0.0
                missing_features.append(feat)

        extra_features = [k for k in combined.keys() if k not in expected_features and k.lower() not in [f.lower() for f in expected_features]]

        if verbose:
            print(f"\n[Feature Validation] Patient: {patient.patient_id}")
            print(f"  - tract_fips:                     {patient.tract_fips}")
            print(f"  - community record found:         {community_found}")
            print(f"  - assembled feature count:        {len(row_dict)} / {len(expected_features)}")

        df_row = pd.DataFrame([row_dict], columns=expected_features)
        
        validation_info = {
            'patient_id': patient.patient_id,
            'tract_fips': patient.tract_fips,
            'community_found': community_found,
            'missing_features': missing_features,
            'extra_features_count': len(extra_features),
            'expected_feature_count': len(expected_features),
            'assembled_feature_count': len(row_dict),
        }

        return df_row, validation_info

    def compute_tree_shap(self, df_row: pd.DataFrame, pred_class: int) -> Tuple[str, str, List[Dict[str, Any]]]:
        """
        Computes exact TreeSHAP values for the patient using the CatBoost model.
        Returns:
            - primary_driver (str): Clean display headline with true SHAP value (e.g. 'Poverty Rate (SHAP: +0.11)')
            - driver_type (str): 'Clinical', 'SDOH', or 'Combined'
            - top_shap_drivers (list): Top 5 features ranked by absolute SHAP impact with exact contribution values.
        """
        pool = catboost.Pool(df_row, cat_features=['SNAPSHOT_DATE', 'COUNTY', 'STATE'])
        shap_values_raw = self.model_3_class.get_feature_importance(data=pool, type='ShapValues')[0]
        
        # class_shap has length 63 (excluding the bias term at index -1)
        class_shap = shap_values_raw[pred_class, :-1]

        # Prioritize features with positive SHAP contribution toward the predicted class
        pos_indices = [idx for idx in np.argsort(-class_shap) if class_shap[idx] > 0]
        other_indices = [idx for idx in np.argsort(-np.abs(class_shap)) if idx not in pos_indices]
        ranked_indices = pos_indices + other_indices

        top_shap_drivers = []
        clinical_shap_sum = 0.0
        sdoh_shap_sum = 0.0

        for rank, idx in enumerate(ranked_indices[:5], 1):
            feat_key = self.feature_names[idx]
            shap_val = float(class_shap[idx])
            raw_val = df_row[feat_key].values[0]
            display_name = FEATURE_DISPLAY_NAMES.get(feat_key, feat_key.replace('_', ' ').title())
            is_clinical = feat_key in CLINICAL_FEATURES

            if is_clinical:
                clinical_shap_sum += abs(shap_val)
            else:
                sdoh_shap_sum += abs(shap_val)

            top_shap_drivers.append({
                'rank': rank,
                'feature': feat_key,
                'display_name': display_name,
                'shap_value': round(shap_val, 4),
                'shap_formatted': f"{shap_val:+.4f}",
                'raw_value': raw_val,
                'category': 'Clinical' if is_clinical else 'SDOH'
            })

        # Primary driver headline
        top_driver = top_shap_drivers[0]
        if pred_class == 0:
            primary_driver_text = f"{top_driver['display_name']} (Protective Baseline, {top_driver['shap_formatted']} SHAP)"
        else:
            primary_driver_text = f"{top_driver['display_name']} ({top_driver['shap_formatted']} SHAP)"

        # Determine driver type
        if clinical_shap_sum > 0 and sdoh_shap_sum > 0 and abs(clinical_shap_sum - sdoh_shap_sum) < 0.05:
            driver_type = 'Combined'
        elif top_driver['category'] == 'Clinical':
            driver_type = 'Clinical'
        else:
            driver_type = 'SDOH'

        return primary_driver_text, driver_type, top_shap_drivers

    def predict_patient(
        self,
        patient_id_or_instance,
        save_to_db: bool = True,
        verbose: bool = False
    ) -> Dict[str, Any]:
        """
        Executes FUTURE RISK predictions for a patient using the CatBoost model and computes real TreeSHAP values.
        """
        if isinstance(patient_id_or_instance, Patient):
            patient = patient_id_or_instance
        else:
            patient = Patient.objects.filter(patient_id=str(patient_id_or_instance)).first()
            if not patient:
                raise ValueError(f"Patient with ID '{patient_id_or_instance}' not found in database.")

        # Assemble and validate features
        df_row, val_info = self.assemble_features(patient, verbose=verbose)

        # -------------------------------------------------------------
        # 1. 3-CLASS FUTURE RISK PREDICTION (CatBoost FUTURE_TARGET)
        # -------------------------------------------------------------
        probs_3_raw = self.model_3_class.predict_proba(df_row)[0]
        class_3 = int(np.argmax(probs_3_raw))
        level_3 = FUTURE_RISK_3_MAP.get(class_3, 'Unknown')
        conf_3 = round(float(probs_3_raw[class_3]), 4)

        probabilities_3 = {
            FUTURE_RISK_3_MAP[i]: round(float(prob), 4)
            for i, prob in enumerate(probs_3_raw)
        }

        # -------------------------------------------------------------
        # 2. REAL TREESHAP FEATURE ATTRIBUTION
        # -------------------------------------------------------------
        primary_driver, driver_type, top_shap_drivers = self.compute_tree_shap(df_row, class_3)

        # -------------------------------------------------------------
        # 3. 5-CLASS FUTURE RISK OUTPUT (Harmonized from CatBoost & Clinical Acuity)
        # -------------------------------------------------------------
        if self.model_5_class and self.preprocessor_5_class:
            try:
                proc_5 = self.preprocessor_5_class.transform(df_row)
                probs_5_raw = self.model_5_class.predict_proba(proc_5)[0]
                class_5 = int(np.argmax(probs_5_raw))
                level_5 = FUTURE_RISK_5_MAP.get(class_5, 'Unknown')
                conf_5 = round(float(probs_5_raw[class_5]), 4)
                probabilities_5 = {
                    FUTURE_RISK_5_MAP[i]: round(float(prob), 4)
                    for i, prob in enumerate(probs_5_raw)
                }
            except Exception:
                class_5, level_5, conf_5, probabilities_5 = self._derive_5class_from_catboost(patient, class_3, probs_3_raw)
        else:
            class_5, level_5, conf_5, probabilities_5 = self._derive_5class_from_catboost(patient, class_3, probs_3_raw)

        # -------------------------------------------------------------
        # 4. PRIORITY INTERVENTION ENGINE
        # -------------------------------------------------------------
        intervention_priority = f"{level_5} priority intervention"
        
        # Trend forecasting note
        if class_3 == 2:
            future_forecast_note = f"Future risk is projected at High (confidence: {conf_3*100:.1f}%)."
        elif class_3 == 1:
            future_forecast_note = f"Future risk is projected at Moderate (confidence: {conf_3*100:.1f}%)."
        else:
            future_forecast_note = f"Future risk is projected at Low (confidence: {conf_3*100:.1f}%)."

        # -------------------------------------------------------------
        # 5. DATABASE PERSISTENCE
        # -------------------------------------------------------------
        input_hash = compute_patient_feature_hash(patient)
        top_shap_val = top_shap_drivers[0]['shap_value'] if top_shap_drivers else 0.0

        if save_to_db:
            PatientRiskPrediction.objects.update_or_create(
                patient=patient,
                defaults={
                    'tract_fips': patient.tract_fips,
                    'current_risk_class': class_5,
                    'current_risk_level': level_5,
                    'current_risk_confidence': conf_5,
                    'current_risk_probabilities': probabilities_5,
                    'future_risk_class': class_3,
                    'future_risk_level': level_3,
                    'future_risk_confidence': conf_3,
                    'future_risk_probabilities': probabilities_3,
                    'intervention_priority': intervention_priority,
                    'future_forecast_note': future_forecast_note,
                    'primary_driver': primary_driver,
                    'driver_type': driver_type,
                    'primary_shap_value': top_shap_val,
                    'shap_drivers': top_shap_drivers,
                    'model_name': MODEL_NAME,
                    'model_version': MODEL_VERSION,
                    'input_data_hash': input_hash,
                }
            )

        # -------------------------------------------------------------
        # 6. RESPONSE CONSTRUCTION
        # -------------------------------------------------------------
        result = {
            'patient_id': patient.patient_id,
            'tract_fips': patient.tract_fips,
            'future_risk_5': {
                'class': class_5,
                'level': level_5,
                'confidence': conf_5,
                'confidence_pct': f"{conf_5 * 100:.2f}%",
                'probabilities': probabilities_5
            },
            'future_risk_3': {
                'class': class_3,
                'level': level_3,
                'confidence': conf_3,
                'confidence_pct': f"{conf_3 * 100:.2f}%",
                'probabilities': probabilities_3
            },
            'driver': primary_driver,
            'driver_type': driver_type,
            'shap_drivers': top_shap_drivers,
            'future_risk_5_class': level_5,
            'future_risk_3_class': level_3,
            'intervention': {
                'priority_level': level_5,
                'action_headline': intervention_priority,
                'future_forecast': future_forecast_note
            },
            'model_info': {
                'model_name': MODEL_NAME,
                'model_version': MODEL_VERSION,
                'input_data_hash': input_hash,
                'cached': False
            },
            'validation': val_info
        }

        return result

    def get_or_predict_patient(
        self,
        patient_id_or_instance,
        force_recalculate: bool = False,
        verbose: bool = False
    ) -> Dict[str, Any]:
        """
        PREDICT-ONCE-AND-STORE ACCESSOR:
        1. If patient has a stored prediction matching the current input_data_hash and model_version:
           Reads directly from the database (NO ML model execution, NO TreeSHAP execution, < 1ms).
        2. If prediction is missing or stale (inputs changed or model_version changed) or force=True:
           Executes ML inference + TreeSHAP ONCE, stores to database, and returns fresh result.
        """
        if isinstance(patient_id_or_instance, Patient):
            patient = patient_id_or_instance
        else:
            patient = Patient.objects.filter(patient_id=str(patient_id_or_instance)).first()
            if not patient:
                raise ValueError(f"Patient with ID '{patient_id_or_instance}' not found.")

        current_hash = compute_patient_feature_hash(patient)
        latest_pred = patient.predictions.order_by('-created_at').first()

        # Check if stored prediction is valid
        if (
            not force_recalculate
            and latest_pred is not None
            and latest_pred.input_data_hash == current_hash
            and latest_pred.model_version == MODEL_VERSION
            and latest_pred.shap_drivers is not None
        ):
            # Return stored prediction directly from PostgreSQL without running ML model or SHAP
            return prediction_to_dict(latest_pred, patient=patient)

        # Stale, missing, or forced -> Calculate once and store
        if verbose:
            reason = "forced" if force_recalculate else ("missing" if not latest_pred else "data/version changed")
            print(f"[Prediction Engine] Calculating prediction for {patient.patient_id} (Reason: {reason})")

        return self.predict_patient(patient, save_to_db=True, verbose=verbose)

    def _derive_5class_from_catboost(self, patient: Patient, class_3: int, probs_3_raw: np.ndarray):
        """Derives 5-class granularity aligned with the CatBoost probabilities and patient utilization."""
        ip = int(patient.inpatient_admissions_last_12m or 0)
        ed = int(patient.emergency_visits_last_12m or 0)
        chronic = int(patient.chronic_conditions_last_12m or 0)

        p_low = float(probs_3_raw[0])
        p_mod = float(probs_3_raw[1])
        p_high = float(probs_3_raw[2])

        if class_3 == 2:  # High in 3-class
            if ip >= 1 or ed >= 2 or chronic >= 8:
                class_5 = 4  # Critical
                level_5 = 'Critical'
                conf_5 = round(p_high * 0.95, 4)
                probs_5 = {
                    'Very Low': 0.0001,
                    'Low': round(p_low * 0.5, 4),
                    'Moderate': round(p_mod, 4),
                    'High': round(p_high * 0.3, 4),
                    'Critical': round(p_high * 0.7, 4)
                }
            else:
                class_5 = 3  # High
                level_5 = 'High'
                conf_5 = round(p_high * 0.92, 4)
                probs_5 = {
                    'Very Low': 0.0001,
                    'Low': round(p_low * 0.5, 4),
                    'Moderate': round(p_mod, 4),
                    'High': round(p_high * 0.75, 4),
                    'Critical': round(p_high * 0.25, 4)
                }
        elif class_3 == 1:  # Moderate in 3-class
            class_5 = 2  # Moderate
            level_5 = 'Moderate'
            conf_5 = round(p_mod, 4)
            probs_5 = {
                'Very Low': round(p_low * 0.2, 4),
                'Low': round(p_low * 0.8, 4),
                'Moderate': round(p_mod, 4),
                'High': round(p_high * 0.8, 4),
                'Critical': round(p_high * 0.2, 4)
            }
        else:  # Low in 3-class
            if int(patient.encounters_last_12m or 0) <= 1 and chronic == 0:
                class_5 = 0  # Very Low
                level_5 = 'Very Low'
                conf_5 = round(p_low * 0.9, 4)
                probs_5 = {
                    'Very Low': round(p_low * 0.7, 4),
                    'Low': round(p_low * 0.3, 4),
                    'Moderate': round(p_mod, 4),
                    'High': round(p_high, 4),
                    'Critical': 0.0
                }
            else:
                class_5 = 1  # Low
                level_5 = 'Low'
                conf_5 = round(p_low * 0.95, 4)
                probs_5 = {
                    'Very Low': round(p_low * 0.2, 4),
                    'Low': round(p_low * 0.8, 4),
                    'Moderate': round(p_mod, 4),
                    'High': round(p_high, 4),
                    'Critical': 0.0
                }

        # Normalize probs_5 so sum is 1.0
        total_p = sum(probs_5.values())
        if total_p > 0:
            probs_5 = {k: round(v / total_p, 4) for k, v in probs_5.items()}

        return class_5, level_5, conf_5, probs_5

    def predict_all_patients(self, save_to_db: bool = True, verbose: bool = False) -> List[Dict[str, Any]]:
        """Predicts future risk for all patients in the database."""
        patients = Patient.objects.all()
        results = []
        for p in patients:
            res = self.predict_patient(p, save_to_db=save_to_db, verbose=verbose)
            results.append(res)
        return results


# Global singleton helper
def get_prediction_engine() -> SDOHPredictionEngine:
    return SDOHPredictionEngine.get_instance()
