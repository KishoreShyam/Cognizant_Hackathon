from django.core.management.base import BaseCommand, CommandError
from sdoh.models import Patient
from sdoh.ml_engine import get_prediction_engine


class Command(BaseCommand):
    help = "Run separate FUTURE RISK (5-class) and FUTURE RISK (3-class) ML predictions on patients"

    def add_arguments(self, parser):
        parser.add_argument(
            '--patient-id',
            type=str,
            default=None,
            help='Run prediction for a specific patient ID'
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Limit the number of patients to predict'
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Print detailed feature assembly and validation logs'
        )

    def handle(self, *args, **options):
        engine = get_prediction_engine()
        patient_id = options.get('patient_id')
        limit = options.get('limit')
        verbose = options.get('verbose', False)

        self.stdout.write(self.style.NOTICE("========================================================"))
        self.stdout.write(self.style.NOTICE(" SDOH ML Prediction Engine (Future 5-Class + Future 3-Class)"))
        self.stdout.write(self.style.NOTICE("========================================================\n"))

        if patient_id:
            patients = Patient.objects.filter(patient_id=patient_id)
            if not patients.exists():
                raise CommandError(f"Patient with ID '{patient_id}' not found.")
        else:
            patients = Patient.objects.all()
            if limit:
                patients = patients[:limit]

        total = len(patients) if isinstance(patients, list) else patients.count()
        self.stdout.write(f"Evaluating {total} patient(s)...\n")

        for idx, patient in enumerate(patients, 1):
            res = engine.predict_patient(patient, save_to_db=True, verbose=verbose)
            
            f5_res = res['future_risk_5']
            f3_res = res['future_risk_3']
            int_res = res['intervention']

            self.stdout.write(f"[{idx}/{total}] Patient: {res['patient_id']} | Tract: {res['tract_fips']}")
            self.stdout.write(self.style.SUCCESS(f"  FUTURE RISK (5-Class):"))
            self.stdout.write(f"    Class:         {f5_res['class']}")
            self.stdout.write(f"    Risk Level:    {f5_res['level']}")
            self.stdout.write(f"    Confidence:    {f5_res['confidence']:.4f}")
            self.stdout.write(f"    Probabilities: {f5_res['probabilities']}")
            
            self.stdout.write(self.style.NOTICE(f"  FUTURE RISK (3-Class CatBoost):"))
            self.stdout.write(f"    Class:         {f3_res['class']}")
            self.stdout.write(f"    Risk Level:    {f3_res['level']}")
            self.stdout.write(f"    Confidence:    {f3_res['confidence']:.4f}")
            self.stdout.write(f"    Probabilities: {f3_res['probabilities']}")

            self.stdout.write(f"  PRIORITY INTERVENTION:")
            self.stdout.write(f"    Headline:      {int_res['action_headline']}")
            self.stdout.write(f"    Forecast Note: {int_res['future_forecast']}\n")

        self.stdout.write(self.style.SUCCESS(f"Finished evaluating and saving predictions for {total} patient(s)."))
