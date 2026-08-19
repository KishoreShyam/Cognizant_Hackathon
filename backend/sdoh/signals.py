"""
Django signals for automatic ML prediction lifecycle management.

Hooks:
1. Patient post_save:
   - When a new patient is created or predictive clinical data is updated,
     automatically evaluates and stores the new ML prediction and TreeSHAP values.
2. CommunitySDOH post_save:
   - When a census tract SDOH values are updated, updates predictions for linked patients.
"""

import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Patient, CommunitySDOH
from .services import is_prediction_stale, get_or_predict_patient_risk

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Patient)
def handle_patient_saved(sender, instance: Patient, created: bool, **kwargs):
    """
    Automatically executes and stores ML prediction when a new patient is created
    or when an existing patient's clinical inputs change.
    """
    try:
        # Check if prediction is missing or stale based on input hash
        if is_prediction_stale(instance):
            logger.info(f"Signal: Evaluating prediction for patient {instance.patient_id} (created={created})...")
            get_or_predict_patient_risk(instance, force_recalculate=True)
    except Exception as e:
        logger.error(f"Error evaluating prediction signal for patient {instance.patient_id}: {e}")


@receiver(post_save, sender=CommunitySDOH)
def handle_community_sdoh_saved(sender, instance: CommunitySDOH, created: bool, **kwargs):
    """
    Invalidates and recalculates predictions for all patients residing in the updated Census Tract.
    """
    try:
        patients = list(Patient.objects.filter(tract_fips=instance.tract_fips))
        if patients:
            logger.info(f"Signal: Recalculating predictions for {len(patients)} patients in updated tract {instance.tract_fips}...")
            for p in patients:
                get_or_predict_patient_risk(p, force_recalculate=True)
    except Exception as e:
        logger.error(f"Error handling CommunitySDOH update signal for tract {instance.tract_fips}: {e}")
