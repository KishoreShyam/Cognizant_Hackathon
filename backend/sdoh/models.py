from django.db import models


class CommunitySDOH(models.Model):
    """
    Represents one California census tract and its community SDOH features.
    
    IMPORTANT:
    - tract_fips is an 11-character string identifier (e.g., '06001400200'), NOT a number.
    - All features store raw numerical or categorical values required by the ML model.
    - Risk scores are NOT computed per SDOH column.
    """
    tract_fips = models.CharField(
        max_length=11,
        unique=True,
        db_index=True,
        help_text="11-digit zero-padded Census Tract FIPS code (e.g. 06001400200)"
    )
    county = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="County name"
    )
    state = models.CharField(
        max_length=50,
        default="CA",
        blank=True,
        null=True,
        help_text="State abbreviation (California only)"
    )

    # --- Poverty ---
    poverty_2018 = models.FloatField(null=True, blank=True)
    poverty_2020 = models.FloatField(null=True, blank=True)
    poverty_2022 = models.FloatField(null=True, blank=True)
    poverty_change_20_22 = models.FloatField(null=True, blank=True)
    poverty_change_trend = models.CharField(max_length=50, null=True, blank=True)

    # --- Income ---
    income_2018 = models.FloatField(null=True, blank=True)
    income_2020 = models.FloatField(null=True, blank=True)
    income_2022 = models.FloatField(null=True, blank=True)
    income_change_20_22 = models.FloatField(null=True, blank=True)
    income_change_trend = models.CharField(max_length=50, null=True, blank=True)

    # --- Unemployment ---
    unemployment_2018 = models.FloatField(null=True, blank=True)
    unemployment_2020 = models.FloatField(null=True, blank=True)
    unemployment_2022 = models.FloatField(null=True, blank=True)
    unemployment_change_20_22 = models.FloatField(null=True, blank=True)
    unemployment_change_trend = models.CharField(max_length=50, null=True, blank=True)

    # --- Education ---
    education_2018 = models.FloatField(null=True, blank=True)
    education_2020 = models.FloatField(null=True, blank=True)
    education_2022 = models.FloatField(null=True, blank=True)
    education_change_20_22 = models.FloatField(null=True, blank=True)
    education_change_trend = models.CharField(max_length=50, null=True, blank=True)

    # --- Housing Burden ---
    housing_burden_2018 = models.FloatField(null=True, blank=True)
    housing_burden_2020 = models.FloatField(null=True, blank=True)
    housing_burden_2022 = models.FloatField(null=True, blank=True)
    housing_burden_change_20_22 = models.FloatField(null=True, blank=True)
    housing_burden_change_trend = models.CharField(max_length=50, null=True, blank=True)

    # --- No Vehicle ---
    no_vehicle_2018 = models.FloatField(null=True, blank=True)
    no_vehicle_2020 = models.FloatField(null=True, blank=True)
    no_vehicle_2022 = models.FloatField(null=True, blank=True)
    no_vehicle_change_20_22 = models.FloatField(null=True, blank=True)
    no_vehicle_change_trend = models.CharField(max_length=50, null=True, blank=True)

    # --- Food Access ---
    food_access_population_2018 = models.FloatField(null=True, blank=True)
    food_access_population_2020 = models.FloatField(null=True, blank=True)
    food_access_population_2022 = models.FloatField(null=True, blank=True)
    food_access_population_change_20_22 = models.FloatField(null=True, blank=True)
    food_access_population_change_trend = models.CharField(max_length=50, null=True, blank=True)

    # --- Uninsured ---
    uninsured_2018 = models.FloatField(null=True, blank=True)
    uninsured_2020 = models.FloatField(null=True, blank=True)
    uninsured_2022 = models.FloatField(null=True, blank=True)
    uninsured_change_20_22 = models.FloatField(null=True, blank=True)
    uninsured_change_trend = models.CharField(max_length=50, null=True, blank=True)

    # --- Disability ---
    disability_2018 = models.FloatField(null=True, blank=True)
    disability_2020 = models.FloatField(null=True, blank=True)
    disability_2022 = models.FloatField(null=True, blank=True)
    disability_change_20_22 = models.FloatField(null=True, blank=True)
    disability_change_trend = models.CharField(max_length=50, null=True, blank=True)

    # --- Broadband ---
    broadband_2018 = models.FloatField(null=True, blank=True)
    broadband_2020 = models.FloatField(null=True, blank=True)
    broadband_2022 = models.FloatField(null=True, blank=True)
    broadband_change_20_22 = models.FloatField(null=True, blank=True)
    broadband_change_trend = models.CharField(max_length=50, null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'community_sdoh'
        verbose_name = 'Community SDOH'
        verbose_name_plural = 'Community SDOH Records'
        ordering = ['tract_fips']

    def __str__(self):
        county_str = f" ({self.county})" if self.county else ""
        return f"Tract {self.tract_fips}{county_str}"


class Patient(models.Model):
    """
    Represents an individual patient and their clinical/utilization features.
    
    Connected to CommunitySDOH via tract_fips.
    SDOH columns are not duplicated in this table.
    """
    patient_id = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Unique patient identifier (string)"
    )
    snapshot_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of snapshot / encounter summary"
    )
    tract_fips = models.CharField(
        max_length=11,
        db_index=True,
        help_text="11-digit zero-padded Census Tract FIPS code"
    )

    # --- Clinical & Utilization Features (Last 12 Months) ---
    encounters_last_12m = models.FloatField(null=True, blank=True)
    inpatient_admissions_last_12m = models.FloatField(null=True, blank=True)
    emergency_visits_last_12m = models.FloatField(null=True, blank=True)
    outpatient_visits_last_12m = models.FloatField(null=True, blank=True)
    conditions_last_12m = models.FloatField(null=True, blank=True)
    chronic_conditions_last_12m = models.FloatField(null=True, blank=True)
    medications_last_12m = models.FloatField(null=True, blank=True)
    procedures_last_12m = models.FloatField(null=True, blank=True)
    clinical_burden_last_12m = models.FloatField(null=True, blank=True)
    healthcare_utilization_last_12m = models.FloatField(null=True, blank=True)
    medications_per_encounter_last_12m = models.FloatField(null=True, blank=True)
    conditions_per_encounter_last_12m = models.FloatField(null=True, blank=True)

    # --- Changes and Growth (Recent vs Previous) ---
    change_recent_vs_previous_encounters = models.FloatField(null=True, blank=True)
    growth_recent_vs_previous_encounters = models.FloatField(null=True, blank=True)
    change_recent_vs_previous_conditions = models.FloatField(null=True, blank=True)
    growth_recent_vs_previous_conditions = models.FloatField(null=True, blank=True)
    change_recent_vs_previous_chronic_conditions = models.FloatField(null=True, blank=True)
    growth_recent_vs_previous_chronic_conditions = models.FloatField(null=True, blank=True)
    change_recent_vs_previous_medications = models.FloatField(null=True, blank=True)
    growth_recent_vs_previous_medications = models.FloatField(null=True, blank=True)
    change_recent_vs_previous_procedures = models.FloatField(null=True, blank=True)
    growth_recent_vs_previous_procedures = models.FloatField(null=True, blank=True)
    change_recent_vs_previous_clinical_burden = models.FloatField(null=True, blank=True)
    growth_recent_vs_previous_clinical_burden = models.FloatField(null=True, blank=True)
    change_recent_vs_previous_healthcare_utilization = models.FloatField(null=True, blank=True)
    growth_recent_vs_previous_healthcare_utilization = models.FloatField(null=True, blank=True)

    # --- Demographics ---
    gender_f = models.FloatField(null=True, blank=True)
    gender_m = models.FloatField(null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'patient'
        verbose_name = 'Patient'
        verbose_name_plural = 'Patients'
        ordering = ['patient_id']

    def __str__(self):
        return f"Patient {self.patient_id} (Tract: {self.tract_fips})"

    @property
    def community_sdoh(self):
        """
        Retrieves matching CommunitySDOH record using tract_fips.
        """
        if not self.tract_fips:
            return None
        return CommunitySDOH.objects.filter(tract_fips=self.tract_fips).first()

    @property
    def latest_prediction(self):
        """
        Retrieves latest risk prediction for this patient.
        """
        return self.predictions.order_by('-created_at').first()

    def get_combined_features(self):
        """
        Returns a dictionary combining Patient features and CommunitySDOH features.
        """
        patient_data = {
            'patient_id': self.patient_id,
            'PATIENT_ID': self.patient_id,
            'snapshot_date': str(self.snapshot_date) if self.snapshot_date else '2026-08-15',
            'SNAPSHOT_DATE': str(self.snapshot_date) if self.snapshot_date else '2026-08-15',
            'tract_fips': self.tract_fips,
            'CENSUS_TRACT_GEOID': self.tract_fips,
            'encounters_last_12m': self.encounters_last_12m,
            'ENCOUNTERS_LAST_12M': self.encounters_last_12m,
            'inpatient_admissions_last_12m': self.inpatient_admissions_last_12m,
            'INPATIENT_ADMISSIONS_LAST_12M': self.inpatient_admissions_last_12m,
            'emergency_visits_last_12m': self.emergency_visits_last_12m,
            'EMERGENCY_VISITS_LAST_12M': self.emergency_visits_last_12m,
            'outpatient_visits_last_12m': self.outpatient_visits_last_12m,
            'OUTPATIENT_VISITS_LAST_12M': self.outpatient_visits_last_12m,
            'conditions_last_12m': self.conditions_last_12m,
            'CONDITIONS_LAST_12M': self.conditions_last_12m,
            'chronic_conditions_last_12m': self.chronic_conditions_last_12m,
            'CHRONIC_CONDITIONS_LAST_12M': self.chronic_conditions_last_12m,
            'medications_last_12m': self.medications_last_12m,
            'MEDICATIONS_LAST_12M': self.medications_last_12m,
            'procedures_last_12m': self.procedures_last_12m,
            'PROCEDURES_LAST_12M': self.procedures_last_12m,
            'clinical_burden_last_12m': self.clinical_burden_last_12m,
            'CLINICAL_BURDEN_LAST_12M': self.clinical_burden_last_12m,
            'healthcare_utilization_last_12m': self.healthcare_utilization_last_12m,
            'HEALTHCARE_UTILIZATION_LAST_12M': self.healthcare_utilization_last_12m,
            'medications_per_encounter_last_12m': self.medications_per_encounter_last_12m,
            'MEDICATIONS_PER_ENCOUNTER_LAST_12M': self.medications_per_encounter_last_12m,
            'conditions_per_encounter_last_12m': self.conditions_per_encounter_last_12m,
            'CONDITIONS_PER_ENCOUNTER_LAST_12M': self.conditions_per_encounter_last_12m,
            'change_recent_vs_previous_encounters': self.change_recent_vs_previous_encounters,
            'CHANGE_RECENT_VS_PREVIOUS_ENCOUNTERS': self.change_recent_vs_previous_encounters,
            'growth_recent_vs_previous_encounters': self.growth_recent_vs_previous_encounters,
            'GROWTH_RECENT_VS_PREVIOUS_ENCOUNTERS': self.growth_recent_vs_previous_encounters,
            'change_recent_vs_previous_conditions': self.change_recent_vs_previous_conditions,
            'CHANGE_RECENT_VS_PREVIOUS_CONDITIONS': self.change_recent_vs_previous_conditions,
            'growth_recent_vs_previous_conditions': self.growth_recent_vs_previous_conditions,
            'GROWTH_RECENT_VS_PREVIOUS_CONDITIONS': self.growth_recent_vs_previous_conditions,
            'change_recent_vs_previous_chronic_conditions': self.change_recent_vs_previous_chronic_conditions,
            'CHANGE_RECENT_VS_PREVIOUS_CHRONIC_CONDITIONS': self.change_recent_vs_previous_chronic_conditions,
            'growth_recent_vs_previous_chronic_conditions': self.growth_recent_vs_previous_chronic_conditions,
            'GROWTH_RECENT_VS_PREVIOUS_CHRONIC_CONDITIONS': self.growth_recent_vs_previous_chronic_conditions,
            'change_recent_vs_previous_medications': self.change_recent_vs_previous_medications,
            'CHANGE_RECENT_VS_PREVIOUS_MEDICATIONS': self.change_recent_vs_previous_medications,
            'growth_recent_vs_previous_medications': self.growth_recent_vs_previous_medications,
            'GROWTH_RECENT_VS_PREVIOUS_MEDICATIONS': self.growth_recent_vs_previous_medications,
            'change_recent_vs_previous_procedures': self.change_recent_vs_previous_procedures,
            'CHANGE_RECENT_VS_PREVIOUS_PROCEDURES': self.change_recent_vs_previous_procedures,
            'growth_recent_vs_previous_procedures': self.growth_recent_vs_previous_procedures,
            'GROWTH_RECENT_VS_PREVIOUS_PROCEDURES': self.growth_recent_vs_previous_procedures,
            'change_recent_vs_previous_clinical_burden': self.change_recent_vs_previous_clinical_burden,
            'CHANGE_RECENT_VS_PREVIOUS_CLINICAL_BURDEN': self.change_recent_vs_previous_clinical_burden,
            'growth_recent_vs_previous_clinical_burden': self.growth_recent_vs_previous_clinical_burden,
            'GROWTH_RECENT_VS_PREVIOUS_CLINICAL_BURDEN': self.growth_recent_vs_previous_clinical_burden,
            'change_recent_vs_previous_healthcare_utilization': self.change_recent_vs_previous_healthcare_utilization,
            'CHANGE_RECENT_VS_PREVIOUS_HEALTHCARE_UTILIZATION': self.change_recent_vs_previous_healthcare_utilization,
            'growth_recent_vs_previous_healthcare_utilization': self.growth_recent_vs_previous_healthcare_utilization,
            'GROWTH_RECENT_VS_PREVIOUS_HEALTHCARE_UTILIZATION': self.growth_recent_vs_previous_healthcare_utilization,
            'gender_f': self.gender_f,
            'GENDER_F': self.gender_f,
            'gender_m': self.gender_m,
            'GENDER_M': self.gender_m,
        }

        sdoh = self.community_sdoh
        if sdoh:
            patient_data['COUNTY'] = sdoh.county or 'Alameda County'
            patient_data['STATE'] = sdoh.state or 'California'
            for f in CommunitySDOH._meta.get_fields():
                if not f.is_relation and f.name not in ['id', 'created_at', 'updated_at']:
                    val = getattr(sdoh, f.name)
                    patient_data[f.name] = val
                    patient_data[f.name.upper()] = val

        return patient_data


class PatientRiskPrediction(models.Model):
    """
    Stores separate CURRENT (5-class) and FUTURE (3-class) ML risk predictions for a patient.
    
    IMPORTANT ARCHITECTURE RULES:
    - 5-Class Future Risk (RISK_TARGET_5) and 3-Class Future Risk (FUTURE_TARGET) are stored separately.
    - No combined risk score or averaging is performed.
    - Priority intervention is based on the 5-class Future Risk assessment with the 3-class model as a complementary forecast.
    """
    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='predictions',
        help_text="Associated Patient record"
    )
    tract_fips = models.CharField(
        max_length=11,
        db_index=True,
        help_text="Patient Census Tract FIPS"
    )

    # --- FUTURE RISK (5-Class Model - RISK_TARGET_5) ---
    current_risk_class = models.IntegerField(
        null=True,
        blank=True,
        help_text="5-class Future risk predicted class integer: 0=Very Low, 1=Low, 2=Moderate, 3=High, 4=Critical"
    )
    current_risk_level = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        help_text="5-class Future risk level name: 'Very Low', 'Low', 'Moderate', 'High', 'Critical'"
    )
    current_risk_confidence = models.FloatField(
        null=True,
        blank=True,
        help_text="Confidence probability of 5-class Future risk predicted class"
    )
    current_risk_probabilities = models.JSONField(
        null=True,
        blank=True,
        help_text="5-class Future risk probability distribution dictionary"
    )

    # --- FUTURE RISK (3-Class CatBoost Model - FUTURE_TARGET) ---
    future_risk_class = models.IntegerField(
        null=True,
        blank=True,
        help_text="3-class Future risk predicted class integer: 0=Low, 1=Moderate, 2=High"
    )
    future_risk_level = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        help_text="3-class Future risk level name: 'Low', 'Moderate', 'High'"
    )
    future_risk_confidence = models.FloatField(
        null=True,
        blank=True,
        help_text="Confidence probability of 3-class Future risk predicted class"
    )
    future_risk_probabilities = models.JSONField(
        null=True,
        blank=True,
        help_text="3-class Future risk probability distribution dictionary"
    )

    # --- PRIORITY INTERVENTION ---
    intervention_priority = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text="Intervention priority headline based on 5-class future risk"
    )
    future_forecast_note = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Forecasting note comparing 5-class and 3-class future risk trends"
    )

    # --- TREESHAP ATTRBUTION & DRIVERS ---
    primary_driver = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Primary feature driver headline formatted with SHAP impact"
    )
    driver_type = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="Dominant risk driver category: 'Clinical', 'SDOH', or 'Combined'"
    )
    primary_shap_value = models.FloatField(
        null=True,
        blank=True,
        help_text="Numeric SHAP attribution value of the primary driver"
    )
    shap_drivers = models.JSONField(
        null=True,
        blank=True,
        help_text="Full top-5 TreeSHAP feature attribution array with rank, category, and exact SHAP impact"
    )

    # --- CHANGE DETECTION & MODEL VERSIONING ---
    model_name = models.CharField(
        max_length=100,
        default='sdoh_catboost_future_risk_model.cbm',
        help_text="Name of the deployed ML model"
    )
    model_version = models.CharField(
        max_length=50,
        default='catboost_v1',
        db_index=True,
        help_text="Model release version tag for cache invalidation"
    )
    input_data_hash = models.CharField(
        max_length=64,
        db_index=True,
        null=True,
        blank=True,
        help_text="SHA-256 hash of predictive input features for change detection"
    )

    # Timestamps
    predicted_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Convenience accessors for 5-Class Future Risk
    @property
    def future_risk_5_class(self):
        return self.current_risk_class

    @property
    def future_risk_5_level(self):
        return self.current_risk_level

    @property
    def future_risk_5_confidence(self):
        return self.current_risk_confidence

    @property
    def future_risk_5_probabilities(self):
        return self.current_risk_probabilities

    # Convenience accessors for 3-Class Future Risk
    @property
    def future_risk_3_class(self):
        return self.future_risk_class

    @property
    def future_risk_3_level(self):
        return self.future_risk_level

    @property
    def future_risk_3_confidence(self):
        return self.future_risk_confidence

    @property
    def future_risk_3_probabilities(self):
        return self.future_risk_probabilities

    class Meta:
        db_table = 'patient_risk_prediction'
        verbose_name = 'Patient Risk Prediction'
        verbose_name_plural = 'Patient Risk Predictions'
        ordering = ['-created_at']

    def __str__(self):
        return f"Prediction for {self.patient.patient_id} - Future (5-Class): {self.current_risk_level}, Future (3-Class): {self.future_risk_level}"

