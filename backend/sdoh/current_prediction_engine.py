import os
import json
import logging
import joblib
import numpy as np
import pandas as pd
from django.conf import settings
from django.utils import timezone
from .models import CurrentPatient, CurrentCommunity, CurrentPatientPrediction

logger = logging.getLogger(__name__)

# Precomputed min/max values derived from the 9,109 California community tracts population
COMMUNITY_STATS = {
    'social_vulnerability_index': {'min': 0.0, 'max': 1.0},
    'poverty_rate': {'min': 0.0, 'max': 100.0},
    'median_household_income': {'min': 9417.0, 'max': 250001.0},
    'uninsured_rate': {'min': 0.0, 'max': 57.1},
    'housing_cost_burden': {'min': 0.0, 'max': 100.0},
    'no_vehicle_rate': {'min': 0.0, 'max': 100.0},
    'low_access_households_no_vehicle': {'min': 0.0, 'max': 83.96},
    'low_access_population_rate': {'min': 0.0, 'max': 100.0},
    'disability_rate': {'min': 0.0, 'max': 100.0},
    'unemployment_rate': {'min': 0.0, 'max': 66.7},
    'no_internet_access_rate': {'min': 0.0, 'max': 72.7},
    'limited_english_rate': {'min': 0.0, 'max': 100.0}
}

class CurrentPredictionEngine:
    _instance = None

    def __init__(self):
        self.ml_dir = os.path.join(settings.BASE_DIR, 'ml_models', 'current prediction')
        self.model = None
        self.calibrator = None
        self.explainer = None
        self.label_encoder = None
        self.config = {}
        self.features = []
        self.loaded = False
        self._load_artifacts()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_artifacts(self):
        """Loads XGBoost classifier, calibrator, shap explainer, and configs into memory."""
        try:
            config_path = os.path.join(self.ml_dir, 'clinical_model_config.json')
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    self.config = json.load(f)
                self.features = self.config.get('features', [])

            model_path = os.path.join(self.ml_dir, 'clinical_xgboost_model.pkl')
            calibrator_path = os.path.join(self.ml_dir, 'clinical_probability_calibrator.pkl')
            explainer_path = os.path.join(self.ml_dir, 'clinical_shap_explainer.pkl')
            label_encoder_path = os.path.join(self.ml_dir, 'clinical_label_encoder.pkl')

            if os.path.exists(model_path):
                self.model = joblib.load(model_path)
            if os.path.exists(calibrator_path):
                self.calibrator = joblib.load(calibrator_path)
            if os.path.exists(explainer_path):
                self.explainer = joblib.load(explainer_path)
            if os.path.exists(label_encoder_path):
                self.label_encoder = joblib.load(label_encoder_path)

            self.loaded = True
            logger.info("CurrentPredictionEngine artifacts loaded successfully.")
        except Exception as e:
            logger.error(f"Error loading CurrentPredictionEngine artifacts: {e}", exc_info=True)

    def get_risk_level_from_score(self, score: float) -> str:
        """Determines categorical risk level from score based on configured thresholds."""
        if score < 12.5:
            return "VERY LOW"
        elif score < 35.0:
            return "LOW"
        elif score < 60.0:
            return "MEDIUM"
        elif score < 80.0:
            return "HIGH"
        else:
            return "VERY HIGH"

    def predict_current_patient(self, patient_id_or_instance, save_to_db: bool = True) -> dict:
        """Runs end-to-end current patient risk prediction workflow."""
        if not self.loaded:
            self._load_artifacts()

        # 1. Retrieve current patient record
        if isinstance(patient_id_or_instance, CurrentPatient):
            patient = patient_id_or_instance
        else:
            patient = CurrentPatient.objects.filter(PATIENT_ID=str(patient_id_or_instance)).first()
            if not patient:
                raise ValueError(f"CurrentPatient with ID '{patient_id_or_instance}' not found.")

        # 2. Extract clinical features expected by model
        feat_dict = {
            "AGE": patient.AGE,
            "GENDER": patient.GENDER,
            "CHRONIC_CONDITIONS": patient.CHRONIC_CONDITIONS,
            "CONDITIONS": patient.CONDITIONS,
            "INPATIENT_ADMISSIONS": patient.INPATIENT_ADMISSIONS,
            "EMERGENCY_VISITS": patient.EMERGENCY_VISITS,
            "OUTPATIENT_VISITS": patient.OUTPATIENT_VISITS,
            "MEDICATIONS": patient.MEDICATIONS,
            "PROCEDURES": patient.PROCEDURES,
            "MEDICATIONS_PER_ENCOUNTER": patient.MEDICATIONS_PER_ENCOUNTER,
            "CONDITIONS_PER_ENCOUNTER": patient.CONDITIONS_PER_ENCOUNTER,
        }

        # 3. Create DataFrame and enforce GENDER as category dtype
        df_row = pd.DataFrame([feat_dict], columns=self.features)
        df_row["GENDER"] = df_row["GENDER"].astype("category")

        # 4. Predict probabilities using calibrator or model
        predictor = self.calibrator if self.calibrator is not None else self.model
        if predictor is None:
            raise RuntimeError("No model or calibrator loaded in CurrentPredictionEngine.")

        probs_raw = predictor.predict_proba(df_row)[0]
        class_order = self.config.get("risk_class_order", ["HIGH", "LOW", "MEDIUM", "VERY HIGH", "VERY LOW"])
        
        prob_dict = {cls: float(probs_raw[i]) for i, cls in enumerate(class_order)}
        predicted_clinical_class = max(prob_dict, key=prob_dict.get)

        # Calculate clinical risk score continuous
        clinical_risk_score = (
            prob_dict.get("VERY LOW", 0.0) * 0.0 +
            prob_dict.get("LOW", 0.0) * 25.0 +
            prob_dict.get("MEDIUM", 0.0) * 50.0 +
            prob_dict.get("HIGH", 0.0) * 75.0 +
            prob_dict.get("VERY HIGH", 0.0) * 100.0
        )
        clinical_risk_level = self.get_risk_level_from_score(clinical_risk_score)

        # 5. Explain clinical risk using SHAP explainer
        clinical_shap_drivers = []
        if self.explainer is not None:
            try:
                # shap_vals has shape (1, 11, 5)
                shap_vals = self.explainer.shap_values(df_row)
                class_idx = class_order.index(predicted_clinical_class)
                shap_row = shap_vals[0, :, class_idx]

                for i, feat in enumerate(self.features):
                    clinical_shap_drivers.append({
                        "feature": feat,
                        "shap_value": float(shap_row[i]),
                        "shap_formatted": f"{float(shap_row[i]):+.4f}",
                        "raw_value": str(df_row[feat].values[0]),
                        "display_name": feat.replace('_', ' ').title()
                    })
                # Sort descending by absolute SHAP value
                clinical_shap_drivers.sort(key=lambda x: -abs(x["shap_value"]))
            except Exception as e:
                logger.warning(f"Error evaluating clinical SHAP: {e}")

        # 6. Retrieve current community
        community = CurrentCommunity.objects.filter(tract_fips=patient.FIPS_ID).first()
        if not community:
            # Fallback or raise error
            raise ValueError(f"Community tract '{patient.FIPS_ID}' not found in current_community.")

        # 7. Community normalization and risk direction reverse
        raw_sdoh = {}
        normalized_sdoh = {}
        risk_oriented_sdoh = {}
        
        sum_risk_values = 0.0
        feature_risk_values = {}

        for feat, stats in COMMUNITY_STATS.items():
            raw_val = getattr(community, feat)
            if raw_val is None:
                raw_val = 0.0
            
            raw_sdoh[feat] = float(raw_val)

            # Normalize using fit parameters
            min_val = stats['min']
            max_val = stats['max']
            denom = (max_val - min_val) if max_val != min_val else 1.0
            norm_val = (raw_val - min_val) / denom
            # Clip between 0 and 1
            norm_val = max(0.0, min(1.0, norm_val))
            normalized_sdoh[feat] = float(norm_val)

            # Risk direction (reverse higher-is-better features)
            if feat == 'median_household_income':
                risk_val = 1.0 - norm_val
            else:
                risk_val = norm_val
            
            risk_oriented_sdoh[feat] = float(risk_val)
            feature_risk_values[feat] = risk_val
            sum_risk_values += risk_val

        # Community risk score (0-100 scale)
        community_risk_score = (sum_risk_values / 12.0) * 100.0
        community_risk_level = self.get_risk_level_from_score(community_risk_score)

        # Calculate SDOH feature contributions
        contributions = []
        for feat, risk_val in feature_risk_values.items():
            pct = (risk_val / sum_risk_values * 100.0) if sum_risk_values > 0 else 8.33
            contributions.append({
                "feature": feat,
                "display_name": feat.replace('_', ' ').title(),
                "raw_value": raw_sdoh[feat],
                "normalized_value": normalized_sdoh[feat],
                "risk_value": risk_val,
                "contribution_percentage": round(pct, 2)
            })
        # Sort contributions descending by percentage
        contributions.sort(key=lambda x: -x["contribution_percentage"])

        sdoh_feature_contribution_percentages = {c["feature"]: c["contribution_percentage"] for c in contributions}

        # 8. Combine 75% Clinical + 25% Community
        final_current_risk_score = (0.75 * clinical_risk_score) + (0.25 * community_risk_score)
        final_current_risk_level = self.get_risk_level_from_score(final_current_risk_score)

        # 9. Database updates
        if save_to_db:
            # A. Update CurrentCommunity derived fields
            community.normalized_values = normalized_sdoh
            community.risk_oriented_values = risk_oriented_sdoh
            community.feature_contribution_percentages = sdoh_feature_contribution_percentages
            community.community_risk_score = community_risk_score
            community.community_risk_level = community_risk_level
            community.save()

            # B. Save new record to CurrentPatientPrediction to preserve history
            CurrentPatientPrediction.objects.create(
                patient=patient,
                tract_fips=patient.FIPS_ID,
                clinical_risk_score=clinical_risk_score,
                clinical_risk_level=clinical_risk_level,
                clinical_probability_very_low=prob_dict.get("VERY LOW", 0.0),
                clinical_probability_low=prob_dict.get("LOW", 0.0),
                clinical_probability_medium=prob_dict.get("MEDIUM", 0.0),
                clinical_probability_high=prob_dict.get("HIGH", 0.0),
                clinical_probability_very_high=prob_dict.get("VERY HIGH", 0.0),
                community_risk_score=community_risk_score,
                community_risk_level=community_risk_level,
                final_current_risk_score=final_current_risk_score,
                final_current_risk_level=final_current_risk_level,
                raw_sdoh_values=raw_sdoh,
                normalized_sdoh_values=normalized_sdoh,
                risk_oriented_sdoh_values=risk_oriented_sdoh,
                sdoh_feature_contribution_percentages=sdoh_feature_contribution_percentages,
                clinical_shap_drivers=clinical_shap_drivers,
                model_version='xgboost_v1'
            )

        # 10. Construct API output format
        return {
            "patient_id": patient.PATIENT_ID,
            "tract_fips": patient.FIPS_ID,
            "clinical": {
                "risk_score": round(clinical_risk_score, 2),
                "risk_level": clinical_risk_level,
                "probabilities": {
                    "very_low": round(prob_dict.get("VERY LOW", 0.0), 4),
                    "low": round(prob_dict.get("LOW", 0.0), 4),
                    "medium": round(prob_dict.get("MEDIUM", 0.0), 4),
                    "high": round(prob_dict.get("HIGH", 0.0), 4),
                    "very_high": round(prob_dict.get("VERY HIGH", 0.0), 4)
                },
                "shap_drivers": clinical_shap_drivers
            },
            "community": {
                "risk_score": round(community_risk_score, 2),
                "risk_level": community_risk_level,
                "sdoh_features": [
                    {
                        "feature": feat,
                        "display_name": feat.replace('_', ' ').title(),
                        "raw_value": raw_sdoh[feat],
                        "normalized_value": round(normalized_sdoh[feat], 4),
                        "risk_value": round(risk_oriented_sdoh[feat], 4),
                        "contribution_percentage": round(sdoh_feature_contribution_percentages.get(feat, 0.0), 2)
                    } for feat in COMMUNITY_STATS.keys()
                ],
                "contributions": contributions
            },
            "final": {
                "risk_score": round(final_current_risk_score, 2),
                "risk_level": final_current_risk_level
            }
        }

def get_current_engine() -> CurrentPredictionEngine:
    return CurrentPredictionEngine.get_instance()
