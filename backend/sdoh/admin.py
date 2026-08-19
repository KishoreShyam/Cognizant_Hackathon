from django.contrib import admin
from .models import (
    CommunitySDOH, Patient, PatientRiskPrediction, 
    CurrentPatient, CurrentCommunity, CurrentPatientPrediction,
    InterventionContact, CommunityInterventionNotification, Staff
)

@admin.register(CommunitySDOH)
class CommunitySDOHAdmin(admin.ModelAdmin):
    list_display = (
        'tract_fips',
        'county',
        'state',
        'poverty_2022',
        'income_2022',
        'unemployment_2022',
        'housing_burden_2022',
        'uninsured_2022',
    )
    search_fields = ('tract_fips', 'county')
    list_filter = ('county', 'state')
    ordering = ('tract_fips',)


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = (
        'patient_id',
        'tract_fips',
        'snapshot_date',
        'encounters_last_12m',
        'clinical_burden_last_12m',
        'healthcare_utilization_last_12m',
        'created_at',
    )
    search_fields = ('patient_id', 'tract_fips')
    list_filter = ('snapshot_date',)
    ordering = ('patient_id',)


@admin.register(PatientRiskPrediction)
class PatientRiskPredictionAdmin(admin.ModelAdmin):
    list_display = (
        'patient',
        'tract_fips',
        'current_risk_level',
        'current_risk_confidence',
        'future_risk_level',
        'future_risk_confidence',
        'intervention_priority',
        'created_at',
    )
    search_fields = ('patient__patient_id', 'tract_fips')
    list_filter = ('current_risk_level', 'future_risk_level')
    ordering = ('-created_at',)


@admin.register(CurrentPatient)
class CurrentPatientAdmin(admin.ModelAdmin):
    list_display = (
        'PATIENT_ID',
        'PATIENT_NAME',
        'FIPS_ID',
        'STATE_NAME',
        'AGE',
        'GENDER',
        'created_at',
    )
    search_fields = ('PATIENT_ID', 'FIPS_ID', 'PATIENT_NAME')
    ordering = ('PATIENT_ID',)


@admin.register(CurrentCommunity)
class CurrentCommunityAdmin(admin.ModelAdmin):
    list_display = (
        'tract_fips',
        'county_name',
        'state_abbreviation',
        'social_vulnerability_index',
        'poverty_rate',
        'median_household_income',
        'uninsured_rate',
    )
    search_fields = ('tract_fips', 'county_name')
    ordering = ('tract_fips',)


@admin.register(CurrentPatientPrediction)
class CurrentPatientPredictionAdmin(admin.ModelAdmin):
    list_display = (
        'patient',
        'tract_fips',
        'clinical_risk_score',
        'clinical_risk_level',
        'community_risk_score',
        'community_risk_level',
        'final_current_risk_score',
        'final_current_risk_level',
        'prediction_timestamp',
    )
    search_fields = ('patient__PATIENT_ID', 'tract_fips')
    list_filter = ('clinical_risk_level', 'community_risk_level', 'final_current_risk_level')
    ordering = ('-prediction_timestamp',)


@admin.register(InterventionContact)
class InterventionContactAdmin(admin.ModelAdmin):
    list_display = ('county_name', 'domain', 'municipality', 'contact_role', 'contact_email', 'email_type', 'notification_enabled')
    search_fields = ('county_name', 'domain', 'municipality', 'contact_role')
    list_filter = ('domain', 'email_type', 'notification_enabled')
    ordering = ('county_name', 'domain')


@admin.register(CommunityInterventionNotification)
class CommunityInterventionNotificationAdmin(admin.ModelAdmin):
    list_display = ('notification_id', 'county_name', 'municipality', 'domain', 'priority', 'status', 'created_at')
    search_fields = ('notification_id', 'county_name', 'domain', 'status')
    list_filter = ('domain', 'priority', 'status')
    ordering = ('-created_at',)


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ('firebase_uid', 'name', 'email', 'role', 'created_at')
    search_fields = ('firebase_uid', 'name', 'email')
    list_filter = ('role',)
    ordering = ('-created_at',)
