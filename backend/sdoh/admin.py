from django.contrib import admin
from .models import CommunitySDOH, Patient, PatientRiskPrediction


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
