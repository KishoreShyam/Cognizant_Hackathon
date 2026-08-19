import os
import pandas as pd
from django.core.management.base import BaseCommand
from django.conf import settings
from sdoh.models import InterventionContact

class Command(BaseCommand):
    help = 'Seeds the database with California Community Intervention Contacts from Excel'

    def handle(self, *args, **options):
        excel_path = os.path.join(settings.BASE_DIR, 'datasets', 'california_community_intervention_contacts.xlsx')
        if not os.path.exists(excel_path):
            self.stdout.write(self.style.ERROR(f"Excel file not found at {excel_path}"))
            return

        self.stdout.write(self.style.SUCCESS(f"Reading Excel dataset from {excel_path}..."))
        df = pd.read_excel(excel_path)
        
        # Print info
        self.stdout.write(f"Total rows found: {len(df)}")

        created_cnt = 0
        updated_cnt = 0

        for _, row in df.iterrows():
            # Pad state_fips and county_fips if necessary
            state_fips = str(row['STATE_FIPS']).strip().zfill(2)
            county_fips = str(row['COUNTY_FIPS']).strip().zfill(5)
            
            # Map columns
            state = str(row['STATE']).strip()
            county_name = str(row['COUNTY_NAME']).strip()
            municipality = str(row['MUNICIPALITY']).strip()
            domain = str(row['DOMAIN']).strip()
            contact_role = str(row['CONTACT_ROLE']).strip()
            contact_email = str(row['CONTACT_EMAIL']).strip()
            email_type = str(row['EMAIL_TYPE']).strip()
            
            # notification_enabled can be boolean or string
            enabled_raw = row['NOTIFICATION_ENABLED']
            if isinstance(enabled_raw, str):
                notification_enabled = enabled_raw.lower() == 'true'
            else:
                notification_enabled = bool(enabled_raw)

            # Insert or update
            contact, created = InterventionContact.objects.update_or_create(
                county_fips=county_fips,
                domain=domain,
                defaults={
                    'state': state,
                    'state_fips': state_fips,
                    'county_name': county_name,
                    'municipality': municipality,
                    'contact_role': contact_role,
                    'contact_email': contact_email,
                    'email_type': email_type,
                    'notification_enabled': notification_enabled
                }
            )

            if created:
                created_cnt += 1
            else:
                updated_cnt += 1

        self.stdout.write(self.style.SUCCESS(f"Finished seeding contacts. Created: {created_cnt}, Updated: {updated_cnt}"))
