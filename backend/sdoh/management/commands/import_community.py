import os
import re
import pandas as pd
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from sdoh.models import CommunitySDOH

class Command(BaseCommand):
    help = "Import California Community SDOH dataset from CSV into PostgreSQL database"

    def add_arguments(self, parser):
        parser.add_argument(
            'csv_path',
            nargs='?',
            type=str,
            default=None,
            help='Path to the community SDOH CSV dataset'
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
            help='Wipe existing CommunitySDOH records before importing (clean reload)'
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=1000,
            help='Batch size for bulk insertion (default: 1000)'
        )

    def normalize_fips(self, raw_val):
        """
        Normalizes any input CENSUS_TRACT_GEOID representation to an 11-digit zero-padded string.
        Example: 6001400200 -> '06001400200'
                 6001400200.0 -> '06001400200'
                 '06001400200' -> '06001400200'
        """
        if pd.isna(raw_val):
            return None
        
        # Convert to string and clean float representations
        val_str = str(raw_val).strip()
        if '.' in val_str:
            val_str = val_str.split('.')[0]
            
        # Keep only digits
        val_str = re.sub(r'\D', '', val_str)
        if not val_str:
            return None
            
        # Zero-pad to 11 digits
        return val_str.zfill(11)

    def parse_float(self, val):
        """Safely parse float value or return None if NaN/invalid."""
        if pd.isna(val):
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    def parse_str(self, val, max_len=None):
        """Safely parse string value or return None/trimmed string."""
        if pd.isna(val):
            return None
        s = str(val).strip()
        if not s or s.lower() == 'nan' or s.lower() == 'null':
            return None
        if max_len:
            return s[:max_len]
        return s

    def find_csv_file(self, specified_path):
        """Locate CSV file from arguments or search common project locations."""
        if specified_path and os.path.exists(specified_path):
            return specified_path

        # Potential default search locations
        possible_paths = [
            specified_path,
            os.path.join("datasets", "community_Datas_DB.csv"),
            os.path.join("backend", "datasets", "community_Datas_DB.csv"),
            os.path.join("..", "datasets", "community_Datas_DB.csv"),
            os.path.join("data", "community_sdoh.csv"),
            os.path.join("..", "data", "community_sdoh.csv"),
            "community_sdoh.csv",
            os.path.join("sdoh", "data", "community_sdoh.csv"),
        ]
        
        for path in possible_paths:
            if path and os.path.exists(path):
                return path

        return None

    def handle(self, *args, **options):
        specified_path = options['csv_file'] or options['csv_path']
        csv_path = self.find_csv_file(specified_path)

        if not csv_path or not os.path.exists(csv_path):
            raise CommandError(
                f"CSV dataset not found at '{specified_path or 'default paths'}'. "
                f"Please provide the valid path using: python manage.py import_community <path/to/file.csv>"
            )

        self.stdout.write(self.style.NOTICE(f"\n========================================================"))
        self.stdout.write(self.style.NOTICE(f" Starting Community SDOH Data Ingestion"))
        self.stdout.write(self.style.NOTICE(f" Source File: {csv_path}"))
        self.stdout.write(self.style.NOTICE(f"========================================================\n"))

        # Read CSV with pandas
        try:
            df = pd.read_csv(csv_path, dtype=str)
        except Exception as e:
            raise CommandError(f"Error reading CSV file '{csv_path}': {e}")

        total_rows = len(df)
        self.stdout.write(f"Total rows read from CSV: {total_rows}")

        # Normalize column names in DataFrame to lowercase for flexible mapping
        col_map = {col: col.strip().lower() for col in df.columns}
        df_lower = df.rename(columns=col_map)

        # Locate FIPS identifier column
        fips_col = None
        for candidate in ['census_tract_geoid', 'tract_fips', 'geoid', 'tract', 'fips']:
            if candidate in df_lower.columns:
                fips_col = candidate
                break

        if not fips_col:
            raise CommandError(
                f"Required census tract identifier column ('CENSUS_TRACT_GEOID' or 'tract_fips') "
                f"not found in CSV. Available columns: {list(df.columns)}"
            )

        self.stdout.write(f"Identified tract ID column: '{fips_col}'")

        # Prepare field mapping
        sdoh_model_fields = [
            f.name for f in CommunitySDOH._meta.get_fields() 
            if not f.is_relation and f.name not in ['id', 'created_at', 'updated_at']
        ]

        valid_records = []
        rejected_counts = {
            'empty_fips': 0,
            'non_california': 0,
            'invalid_length': 0,
            'duplicate_in_csv': 0
        }
        seen_fips = set()

        for idx, row in df_lower.iterrows():
            raw_fips = row.get(fips_col)
            normalized_fips = self.normalize_fips(raw_fips)

            if not normalized_fips:
                rejected_counts['empty_fips'] += 1
                continue

            if len(normalized_fips) != 11:
                rejected_counts['invalid_length'] += 1
                continue

            # California validation: MUST start with '06'
            if not normalized_fips.startswith("06"):
                rejected_counts['non_california'] += 1
                continue

            if normalized_fips in seen_fips:
                rejected_counts['duplicate_in_csv'] += 1
                continue

            seen_fips.add(normalized_fips)

            # Build model instance dictionary
            record_kwargs = {
                'tract_fips': normalized_fips,
                'county': self.parse_str(row.get('county'), max_len=100),
                'state': self.parse_str(row.get('state', 'CA'), max_len=50) or 'CA',
            }

            # Map all SDOH features present in the CSV
            for field in sdoh_model_fields:
                if field in ['tract_fips', 'county', 'state']:
                    continue
                if field in df_lower.columns:
                    val = row.get(field)
                    if field.endswith('_trend'):
                        record_kwargs[field] = self.parse_str(val, max_len=50)
                    else:
                        record_kwargs[field] = self.parse_float(val)

            valid_records.append(CommunitySDOH(**record_kwargs))

        # Output validation summary
        self.stdout.write(self.style.SUCCESS(f"\n--- Validation Summary ---"))
        self.stdout.write(f"Total Valid California Tracts: {len(valid_records)}")
        self.stdout.write(f"Rejected Records Breakdown:")
        self.stdout.write(f"  - Empty / Invalid FIPS:     {rejected_counts['empty_fips']}")
        self.stdout.write(f"  - Non-California FIPS:      {rejected_counts['non_california']}")
        self.stdout.write(f"  - Invalid Length (!= 11):   {rejected_counts['invalid_length']}")
        self.stdout.write(f"  - Duplicates in CSV:        {rejected_counts['duplicate_in_csv']}")

        if not valid_records:
            self.stdout.write(self.style.WARNING("No valid California records to import. Aborting."))
            return

        batch_size = options['batch_size']
        replace = options['replace']

        # Atomic transaction import
        with transaction.atomic():
            if replace:
                self.stdout.write(self.style.WARNING("Replacing existing records (--replace active)..."))
                deleted_count, _ = CommunitySDOH.objects.all().delete()
                self.stdout.write(f"Deleted {deleted_count} existing records.")

            update_fields = [
                f.name for f in CommunitySDOH._meta.get_fields() 
                if not f.is_relation and f.name not in ['id', 'tract_fips', 'created_at', 'updated_at']
            ]

            self.stdout.write(f"Bulk importing {len(valid_records)} records (batch size: {batch_size})...")
            
            CommunitySDOH.objects.bulk_create(
                valid_records,
                batch_size=batch_size,
                update_conflicts=True,
                update_fields=update_fields,
                unique_fields=['tract_fips']
            )

        total_db_count = CommunitySDOH.objects.count()
        sample = CommunitySDOH.objects.filter(tract_fips=valid_records[0].tract_fips).first()

        self.stdout.write(self.style.SUCCESS(f"\n========================================================"))
        self.stdout.write(self.style.SUCCESS(f" Ingestion Completed Successfully!"))
        self.stdout.write(self.style.SUCCESS(f" Total records in PostgreSQL: {total_db_count}"))
        if sample:
            self.stdout.write(self.style.SUCCESS(f" Sample Tract: {sample.tract_fips} ({sample.county or 'N/A'}, {sample.state})"))
            self.stdout.write(f"   - Poverty 2022:       {sample.poverty_2022}")
            self.stdout.write(f"   - Income 2022:        {sample.income_2022}")
            self.stdout.write(f"   - Unemployment 2022:  {sample.unemployment_2022}")
            self.stdout.write(f"   - Housing Burden 2022:{sample.housing_burden_2022}")
            self.stdout.write(f"   - Uninsured 2022:     {sample.uninsured_2022}")
        self.stdout.write(self.style.SUCCESS(f"========================================================\n"))
