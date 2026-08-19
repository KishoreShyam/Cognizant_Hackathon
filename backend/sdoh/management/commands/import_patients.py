import os
import re
import pandas as pd
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from sdoh.models import Patient, CommunitySDOH


class Command(BaseCommand):
    help = "Import Patient dataset from CSV into PostgreSQL database and link with CommunitySDOH"

    def add_arguments(self, parser):
        parser.add_argument(
            'csv_path',
            nargs='?',
            type=str,
            default=None,
            help='Path to the patient CSV dataset'
        )
        parser.add_argument(
            '--file',
            '-f',
            dest='csv_file',
            type=str,
            default=None,
            help='Alternative flag for specifying CSV file path'
        )
        parser.add_argument(
            '--replace',
            action='store_true',
            help='Wipe existing Patient records before importing (clean reload)'
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=1000,
            help='Batch size for bulk insertion (default: 1000)'
        )

    def normalize_fips(self, raw_val):
        """
        Normalizes any input tract_fips/GEOID representation to an 11-digit zero-padded string.
        Example: 6001400200 -> '06001400200'
                 6001400200.0 -> '06001400200'
                 '06001400200' -> '06001400200'
        """
        if pd.isna(raw_val):
            return None

        val_str = str(raw_val).strip()
        if '.' in val_str:
            val_str = val_str.split('.')[0]

        val_str = re.sub(r'\D', '', val_str)
        if not val_str:
            return None

        return val_str.zfill(11)

    def parse_float(self, val):
        """Safely parse float value or return None if NaN/invalid."""
        if pd.isna(val):
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    def parse_date(self, val):
        """Safely parse date string to YYYY-MM-DD or return None."""
        if pd.isna(val):
            return None
        try:
            dt = pd.to_datetime(val)
            return dt.date()
        except Exception:
            return None

    def parse_str(self, val, max_len=None):
        """Safely parse string value or return None/trimmed string."""
        if pd.isna(val):
            return None
        s = str(val).strip()
        if '.' in s and re.match(r'^\d+\.0$', s):
            s = s.split('.')[0]
        if not s or s.lower() == 'nan' or s.lower() == 'null':
            return None
        if max_len:
            return s[:max_len]
        return s

    def find_csv_file(self, specified_path):
        """Locate CSV file from arguments or search common project locations."""
        if specified_path and os.path.exists(specified_path):
            return specified_path

        possible_paths = [
            specified_path,
            os.path.join("datasets", "patients_100.csv"),
            os.path.join("datasets", "patient_data.csv"),
            os.path.join("datasets", "patient_Datas_DB.csv"),
            os.path.join("datasets", "patients.csv"),
            os.path.join("backend", "datasets", "patients_100.csv"),
            os.path.join("backend", "datasets", "patient_data.csv"),
            os.path.join("backend", "datasets", "patient_Datas_DB.csv"),
            os.path.join("backend", "datasets", "patients.csv"),
            os.path.join("..", "datasets", "patients_100.csv"),
            os.path.join("..", "datasets", "patient_data.csv"),
            os.path.join("..", "datasets", "patient_Datas_DB.csv"),
            os.path.join("..", "datasets", "patients.csv"),
            "patients_100.csv",
            "patient_data.csv",
            "patients.csv",
        ]

        for path in possible_paths:
            if path and os.path.exists(path):
                return path

        # Also search datasets directory for any file starting with patient
        for folder in ["datasets", os.path.join("backend", "datasets"), ".."]:
            if os.path.exists(folder):
                for f in os.listdir(folder):
                    if f.lower().startswith("patient") and f.lower().endswith(".csv"):
                        return os.path.join(folder, f)

        return None

    def handle(self, *args, **options):
        specified_path = options['csv_file'] or options['csv_path']
        csv_path = self.find_csv_file(specified_path)

        if not csv_path or not os.path.exists(csv_path):
            raise CommandError(
                f"Patient CSV dataset not found at '{specified_path or 'default paths'}'. "
                f"Please specify the path using: python manage.py import_patients <path/to/patient_file.csv>"
            )

        self.stdout.write(self.style.NOTICE(f"\n========================================================"))
        self.stdout.write(self.style.NOTICE(f" Starting Patient Data Ingestion"))
        self.stdout.write(self.style.NOTICE(f" Source File: {csv_path}"))
        self.stdout.write(self.style.NOTICE(f"========================================================\n"))

        try:
            df = pd.read_csv(csv_path, dtype=str)
        except Exception as e:
            raise CommandError(f"Error reading CSV file '{csv_path}': {e}")

        total_rows = len(df)
        self.stdout.write(f"Total rows read from CSV: {total_rows}")

        # Map column names to lowercase
        col_map = {col: col.strip().lower() for col in df.columns}
        df_lower = df.rename(columns=col_map)

        # Identify required columns
        patient_id_col = None
        for cand in ['patient_id', 'patientid', 'id']:
            if cand in df_lower.columns:
                patient_id_col = cand
                break

        fips_col = None
        for cand in ['tract_fips', 'census_tract_geoid', 'geoid', 'fips']:
            if cand in df_lower.columns:
                fips_col = cand
                break

        if not patient_id_col:
            raise CommandError(f"Required column 'PATIENT_ID' not found in CSV. Columns: {list(df.columns)}")
        if not fips_col:
            raise CommandError(f"Required column 'tract_fips' not found in CSV. Columns: {list(df.columns)}")

        # Fetch all existing California CommunitySDOH tract_fips for validation
        known_sdoh_fips = set(CommunitySDOH.objects.values_list('tract_fips', flat=True))
        self.stdout.write(f"Loaded {len(known_sdoh_fips)} valid CommunitySDOH tracts from database for verification.")

        patient_model_fields = [
            f.name for f in Patient._meta.get_fields()
            if not f.is_relation and f.name not in ['id', 'created_at', 'updated_at']
        ]

        valid_records = []
        rejected_counts = {
            'empty_patient_id': 0,
            'empty_fips': 0,
            'invalid_fips_length': 0,
            'non_california_fips': 0,
            'duplicate_in_csv': 0,
        }

        unmatched_fips_set = set()
        unmatched_patient_count = 0
        seen_patient_ids = set()

        for idx, row in df_lower.iterrows():
            raw_patient_id = row.get(patient_id_col)
            patient_id = self.parse_str(raw_patient_id, max_len=64)

            if not patient_id:
                rejected_counts['empty_patient_id'] += 1
                continue

            if patient_id in seen_patient_ids:
                rejected_counts['duplicate_in_csv'] += 1
                continue

            raw_fips = row.get(fips_col)
            normalized_fips = self.normalize_fips(raw_fips)

            if not normalized_fips:
                rejected_counts['empty_fips'] += 1
                continue

            if len(normalized_fips) != 11:
                rejected_counts['invalid_fips_length'] += 1
                continue

            if not normalized_fips.startswith("06"):
                rejected_counts['non_california_fips'] += 1
                continue

            # Check if tract exists in CommunitySDOH
            if normalized_fips not in known_sdoh_fips:
                unmatched_fips_set.add(normalized_fips)
                unmatched_patient_count += 1

            seen_patient_ids.add(patient_id)

            record_kwargs = {
                'patient_id': patient_id,
                'tract_fips': normalized_fips,
                'snapshot_date': self.parse_date(row.get('snapshot_date')),
            }

            for field in patient_model_fields:
                if field in ['patient_id', 'tract_fips', 'snapshot_date']:
                    continue
                if field in df_lower.columns:
                    record_kwargs[field] = self.parse_float(row.get(field))

            valid_records.append(Patient(**record_kwargs))

        # Summary output
        self.stdout.write(self.style.SUCCESS(f"\n--- Validation Summary ---"))
        self.stdout.write(f"Total Valid Patient Records: {len(valid_records)}")
        self.stdout.write(f"Rejected Records Breakdown:")
        self.stdout.write(f"  - Empty Patient ID:         {rejected_counts['empty_patient_id']}")
        self.stdout.write(f"  - Empty FIPS:               {rejected_counts['empty_fips']}")
        self.stdout.write(f"  - Invalid FIPS Length:      {rejected_counts['invalid_fips_length']}")
        self.stdout.write(f"  - Non-California FIPS:      {rejected_counts['non_california_fips']}")
        self.stdout.write(f"  - Duplicate IDs in CSV:     {rejected_counts['duplicate_in_csv']}")

        self.stdout.write(f"\n--- Community SDOH Match Verification ---")
        if unmatched_fips_set:
            self.stdout.write(self.style.WARNING(
                f"  - Patients with UNMATCHED tract_fips: {unmatched_patient_count}"
            ))
            self.stdout.write(self.style.WARNING(
                f"  - Number of distinct unmatched tract_fips: {len(unmatched_fips_set)}"
            ))
            sample_unmatched = list(unmatched_fips_set)[:5]
            self.stdout.write(self.style.WARNING(
                f"  - Sample unmatched tract_fips: {sample_unmatched}"
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"  - All {len(valid_records)} patient tract_fips matched known CommunitySDOH tracts perfectly!"
            ))

        if not valid_records:
            self.stdout.write(self.style.WARNING("No valid patient records to import. Aborting."))
            return

        batch_size = options['batch_size']
        replace = options['replace']

        with transaction.atomic():
            if replace:
                self.stdout.write(self.style.WARNING("Replacing existing patient records (--replace active)..."))
                deleted_count, _ = Patient.objects.all().delete()
                self.stdout.write(f"Deleted {deleted_count} existing patient records.")

            update_fields = [
                f.name for f in Patient._meta.get_fields()
                if not f.is_relation and f.name not in ['id', 'patient_id', 'created_at', 'updated_at']
            ]

            self.stdout.write(f"Bulk importing {len(valid_records)} patient records (batch size: {batch_size})...")

            Patient.objects.bulk_create(
                valid_records,
                batch_size=batch_size,
                update_conflicts=True,
                update_fields=update_fields,
                unique_fields=['patient_id']
            )

        total_patient_count = Patient.objects.count()
        sample_patient = Patient.objects.first()

        self.stdout.write(self.style.SUCCESS(f"\n========================================================"))
        self.stdout.write(self.style.SUCCESS(f" Patient Ingestion Completed Successfully!"))
        self.stdout.write(self.style.SUCCESS(f" Total Patient records in PostgreSQL: {total_patient_count}"))

        if sample_patient:
            sdoh_match = sample_patient.community_sdoh
            self.stdout.write(self.style.SUCCESS(
                f" Sample Patient: {sample_patient.patient_id} (Tract: {sample_patient.tract_fips})"
            ))
            self.stdout.write(f"   - Encounters (12M):      {sample_patient.encounters_last_12m}")
            self.stdout.write(f"   - Clinical Burden:       {sample_patient.clinical_burden_last_12m}")
            self.stdout.write(f"   - Healthcare Utilization:{sample_patient.healthcare_utilization_last_12m}")
            if sdoh_match:
                self.stdout.write(self.style.SUCCESS(
                    f"   - Linked SDOH County:    {sdoh_match.county} ({sdoh_match.state})"
                ))
                self.stdout.write(f"   - SDOH Poverty 2022:     {sdoh_match.poverty_2022}")
                self.stdout.write(f"   - SDOH Income 2022:      {sdoh_match.income_2022}")
            else:
                self.stdout.write(self.style.WARNING(f"   - Linked SDOH: No matching record found for tract {sample_patient.tract_fips}"))
        self.stdout.write(self.style.SUCCESS(f"========================================================\n"))
