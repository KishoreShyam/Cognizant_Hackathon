"""
Django management command: generate_predictions

Populates and pre-computes stored ML predictions and TreeSHAP feature attributions
for all patients in PostgreSQL.

Usage:
    python manage.py generate_predictions
    python manage.py generate_predictions --force
"""

from django.core.management.base import BaseCommand
from sdoh.models import Patient, PatientRiskPrediction
from sdoh.services import batch_ensure_predictions, is_prediction_stale, get_or_predict_patient_risk


class Command(BaseCommand):
    help = "Generate and store ML future risk predictions and TreeSHAP attributions for all patients"

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force recalculation for all patients even if stored predictions exist'
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Print detailed feature and SHAP logs'
        )

    def handle(self, *args, **options):
        force = options.get('force', False)
        verbose = options.get('verbose', False)

        self.stdout.write(self.style.NOTICE("========================================================"))
        self.stdout.write(self.style.NOTICE(" PREDICT-ONCE-AND-STORE: Batch Prediction Generator"))
        self.stdout.write(self.style.NOTICE("========================================================\n"))

        patients = list(Patient.objects.all().order_by('patient_id'))
        total = len(patients)
        self.stdout.write(f"Found {total} patients in PostgreSQL database.")

        if force:
            self.stdout.write(self.style.WARNING("Force flag enabled: Recalculating all predictions..."))
            computed = 0
            for idx, p in enumerate(patients, 1):
                res = get_or_predict_patient_risk(p, force_recalculate=True, verbose=verbose)
                computed += 1
                if verbose or idx % 20 == 0 or idx == total:
                    self.stdout.write(f"  [{idx}/{total}] Patient {p.patient_id}: {res['future_risk_3']['level']} (3-Class), {res['future_risk_5']['level']} (5-Class) - {res['driver']}")
            self.stdout.write(self.style.SUCCESS(f"\nSuccessfully generated fresh predictions for all {computed} patients."))
        else:
            stats = batch_ensure_predictions(verbose=verbose)
            self.stdout.write(self.style.SUCCESS(
                f"\nBatch processing complete:"
                f"\n  - Total patients:       {stats['total']}"
                f"\n  - Stored cache hits:    {stats['fresh_cached']}"
                f"\n  - Freshly calculated:   {stats['calculated']}"
            ))

        self.stdout.write(self.style.SUCCESS("\nAll patient predictions and TreeSHAP drivers are stored in PostgreSQL."))
