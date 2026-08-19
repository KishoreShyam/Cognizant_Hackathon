import os
import re
import pandas as pd
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from sdoh.models import CurrentPatient, CurrentCommunity

class Command(BaseCommand):
    help = "Idempotently import current patient and community datasets into PostgreSQL"

    def normalize_fips(self, raw_val):
        """
        Normalizes tract_fips / FIPS representations to an 11-digit zero-padded string.
        Example: 6001400100 -> '06001400100'
        """
        if pd.isna(raw_val):
            return ""
        val_str = str(raw_val).strip()
        if '.' in val_str:
            val_str = val_str.split('.')[0]
        val_str = re.sub(r'\D', '', val_str)
        if not val_str:
            return ""
        return val_str.zfill(11)

    def normalize_county_fips(self, raw_val):
        """
        Normalizes county FIPS to a 4- or 5-digit zero-padded string.
        Example: 6001 -> '06001' or '6001'
        """
        if pd.isna(raw_val):
            return ""
        val_str = str(raw_val).strip()
        if '.' in val_str:
            val_str = val_str.split('.')[0]
        val_str = re.sub(r'\D', '', val_str)
        return val_str

    def parse_float(self, val):
        if pd.isna(val):
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    def parse_int(self, val):
        if pd.isna(val):
            return None
        try:
            return int(float(val))
        except (ValueError, TypeError):
            return None

    def parse_str(self, val, max_len=None):
        if pd.isna(val):
            return ""
        s = str(val).strip()
        if '.' in s and re.match(r'^\d+\.0$', s):
            s = s.split('.')[0]
        if not s or s.lower() == 'nan' or s.lower() == 'null':
            return ""
        if max_len:
            return s[:max_len]
        return s

    def handle(self, *args, **options):
        # Paths to datasets
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        patient_path = os.path.join(base_dir, "datasets", "filled_patient_dataset_5_risk_levels.xlsx")
        community_path = os.path.join(base_dir, "datasets", "current_community_readable.csv")

        if not os.path.exists(patient_path):
            raise CommandError(f"Patient Excel file not found at: {patient_path}")
        if not os.path.exists(community_path):
            raise CommandError(f"Community CSV file not found at: {community_path}")

        # -------------------------------------------------------------
        # 1. IMPORT CURRENT PATIENTS
        # -------------------------------------------------------------
        self.stdout.write(self.style.NOTICE("Importing current patients..."))
        try:
            df_patient = pd.read_excel(patient_path)
        except Exception as e:
            raise CommandError(f"Failed to read patient Excel file: {str(e)}")

        if len(df_patient) != 120:
            raise CommandError(f"Patient dataset contains {len(df_patient)} records, expected exactly 120.")

        # ID Renaming: TEST-CA-0101 to TEST-CA-0120 for the last 20 rows
        patient_ids = []
        for idx, row in df_patient.iterrows():
            if idx < 100:
                p_id = self.parse_str(row.get("PATIENT_ID"))
            else:
                p_id = f"TEST-CA-0{101 + (idx - 100)}"
            patient_ids.append(p_id)

        df_patient["PATIENT_ID_MAPPED"] = patient_ids

        # Unique patient ID check
        if df_patient["PATIENT_ID_MAPPED"].nunique() != 120:
            raise CommandError("Mapped patient IDs are not unique.")

        imported_patients_count = 0
        with transaction.atomic():
            for idx, row in df_patient.iterrows():
                p_id = row["PATIENT_ID_MAPPED"]
                fips_normalized = self.normalize_fips(row.get("FIPS_ID"))

                defaults = {
                    "PATIENT_NAME": self.parse_str(row.get("PATIENT_NAME")),
                    "FIPS_ID": fips_normalized,
                    "STATE_NAME": self.parse_str(row.get("STATE_NAME")),
                    "AGE": self.parse_int(row.get("AGE")),
                    "GENDER": self.parse_str(row.get("GENDER")),
                    "CHRONIC_CONDITIONS": self.parse_int(row.get("CHRONIC_CONDITIONS")),
                    "CONDITIONS": self.parse_int(row.get("CONDITIONS")),
                    "INPATIENT_ADMISSIONS": self.parse_int(row.get("INPATIENT_ADMISSIONS")),
                    "EMERGENCY_VISITS": self.parse_int(row.get("EMERGENCY_VISITS")),
                    "OUTPATIENT_VISITS": self.parse_int(row.get("OUTPATIENT_VISITS")),
                    "MEDICATIONS": self.parse_int(row.get("MEDICATIONS")),
                    "PROCEDURES": self.parse_int(row.get("PROCEDURES")),
                    "MEDICATIONS_PER_ENCOUNTER": self.parse_float(row.get("MEDICATIONS_PER_ENCOUNTER")),
                    "CONDITIONS_PER_ENCOUNTER": self.parse_float(row.get("CONDITIONS_PER_ENCOUNTER")),
                }

                # Idempotent upsert
                obj, created = CurrentPatient.objects.update_or_create(
                    PATIENT_ID=p_id,
                    defaults=defaults
                )
                imported_patients_count += 1

        self.stdout.write(self.style.SUCCESS(f"Successfully processed {imported_patients_count} current patient records."))

        # -------------------------------------------------------------
        # 2. IMPORT CURRENT COMMUNITY SDOH RECORDS
        # -------------------------------------------------------------
        self.stdout.write(self.style.NOTICE("Importing current community records..."))
        try:
            df_community = pd.read_csv(community_path)
        except Exception as e:
            raise CommandError(f"Failed to read community CSV file: {str(e)}")

        if len(df_community) != 9109:
            raise CommandError(f"Community dataset contains {len(df_community)} records, expected exactly 9,109.")

        imported_community_count = 0

        with transaction.atomic():
            for idx, row in df_community.iterrows():
                tract_fips = self.normalize_fips(row.get("tract_fips"))
                state_county_fips = self.normalize_county_fips(row.get("state_county_fips"))
                tract_id = self.parse_str(row.get("tract_id"))

                defaults = {
                    "state_abbreviation": self.parse_str(row.get("state_abbreviation")),
                    "state_county_fips": state_county_fips,
                    "county_name": self.parse_str(row.get("county_name")),
                    "tract_id": tract_id,
                    "social_vulnerability_index": self.parse_float(row.get("social_vulnerability_index")),
                    "poverty_rate": self.parse_float(row.get("poverty_rate")),
                    "median_household_income": self.parse_float(row.get("median_household_income")),
                    "uninsured_rate": self.parse_float(row.get("uninsured_rate")),
                    "housing_cost_burden": self.parse_float(row.get("housing_cost_burden")),
                    "no_vehicle_rate": self.parse_float(row.get("no_vehicle_rate")),
                    "low_access_households_no_vehicle": self.parse_float(row.get("low_access_households_no_vehicle")),
                    "low_access_population_rate": self.parse_float(row.get("low_access_population_rate")),
                    "disability_rate": self.parse_float(row.get("disability_rate")),
                    "unemployment_rate": self.parse_float(row.get("unemployment_rate")),
                    "no_internet_access_rate": self.parse_float(row.get("no_internet_access_rate")),
                    "limited_english_rate": self.parse_float(row.get("limited_english_rate")),
                }

                # Idempotent upsert via update_or_create to handle database re-runs safely
                obj, created = CurrentCommunity.objects.update_or_create(
                    tract_fips=tract_fips,
                    defaults=defaults
                )
                imported_community_count += 1
                if imported_community_count % 1000 == 0:
                    self.stdout.write(f"Processed {imported_community_count} community records...")

        self.stdout.write(self.style.SUCCESS(f"Successfully processed {imported_community_count} current community records."))

        # -------------------------------------------------------------
        # 3. SEED DATA VALIDATION
        # -------------------------------------------------------------
        self.stdout.write(self.style.NOTICE("Running data integrity checks..."))

        # Patient validations
        actual_patients = CurrentPatient.objects.count()
        if actual_patients != 120:
            raise CommandError(f"Integrity check failed: CurrentPatient has {actual_patients} rows instead of 120.")

        first_p = CurrentPatient.objects.filter(PATIENT_ID="TEST-CA-0001").first()
        if not first_p:
            raise CommandError("Integrity check failed: TEST-CA-0001 is missing.")

        last_p = CurrentPatient.objects.filter(PATIENT_ID="TEST-CA-0120").first()
        if not last_p:
            raise CommandError("Integrity check failed: TEST-CA-0120 is missing.")

        # Verify numeric columns in patient table
        if first_p.AGE is None or first_p.AGE <= 0:
            raise CommandError("Integrity check failed: Patient AGE contains invalid value.")
        if first_p.FIPS_ID is None or len(first_p.FIPS_ID) != 11:
            raise CommandError("Integrity check failed: FIPS_ID is not normalized to 11 characters.")

        # Community validations
        actual_communities = CurrentCommunity.objects.count()
        if actual_communities != 9109:
            raise CommandError(f"Integrity check failed: CurrentCommunity has {actual_communities} rows instead of 9,109.")

        # Check random record for raw value preservation
        # poverty_rate for 06001400100 (Alameda County) should be exactly 4.4, median_household_income 234236.0
        sample_comm = CurrentCommunity.objects.filter(tract_fips="06001400100").first()
        if not sample_comm:
            raise CommandError("Integrity check failed: Sample tract 06001400100 is missing.")
        if sample_comm.poverty_rate != 4.4:
            raise CommandError(f"Integrity check failed: Raw poverty_rate is {sample_comm.poverty_rate}, expected 4.4.")
        if sample_comm.median_household_income != 234236.0:
            raise CommandError(f"Integrity check failed: Raw median_household_income is {sample_comm.median_household_income}, expected 234236.0.")

        self.stdout.write(self.style.SUCCESS("All validation and integrity checks PASSED successfully!"))
