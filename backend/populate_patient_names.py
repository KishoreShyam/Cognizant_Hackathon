import os
import sys
import django

backend_dir = r"c:\Users\kavin\Cognizant_Hackathon\backend"
sys.path.insert(0, backend_dir)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sdoh_backend.settings')
django.setup()

from sdoh.models import Patient

# Curated list of 100 realistic California names representing California's diverse demographics
CALIFORNIA_PATIENT_NAMES = [
    "Mateo Garcia", "Sophia Hernandez", "Liam Chen", "Isabella Rodriguez", "Ethan Martinez",
    "Emma Nguyen", "Lucas Patel", "Mia Gonzalez", "Alexander Kim", "Olivia Davis",
    "Daniel Perez", "Camila Johnson", "Benjamin Lee", "Harper Lopez", "Sebastian Torres",
    "Amelia Jackson", "Henry Tran", "Aria Sanchez", "Jackson Wong", "Evelyn Ramirez",
    "Oliver Flores", "Charlotte Rivera", "Noah Cruz", "Abigail Morales", "Elijah Reyes",
    "Emily Gomez", "William Ortiz", "Scarlett Gutierrez", "James Chavez", "Madison Ruiz",
    "Julian Alvarez", "Chloe Castillo", "David Silva", "Penelope Vasquez", "Logan Aguilar",
    "Layla Soto", "Gabriel Mendoza", "Riley Vargas", "Carter Jimenez", "Zoey Castro",
    "Luke Guzman", "Nora Salazar", "Anthony Herrera", "Lily Medina", "Isaac Delgado",
    "Hannah Pena", "Dylan Vega", "Lillian Ramos", "Wyatt Guerrero", "Ellie Estrada",
    "Andrew Moreno", "Aubrey Rojas", "Joshua Munoz", "Stella Padilla", "Christopher Navarro",
    "Maya Robles", "Samuel Campos", "Leah Cabrera", "Ryan Figueroa", "Hazel Corona",
    "Nathaniel Pacheco", "Violet Dominguez", "Christian Valenzuela", "Aurora Rangel", "Jonathan Cardenas",
    "Savannah Miranda", "Caleb Cervantes", "Brooklyn Solis", "Adrian Mejia", "Bella Trevino",
    "Thomas Sandoval", "Claire Ibarra", "Robert Zuniga", "Skylar Orozco", "Miles Calderon",
    "Paisley Espinoza", "Aaron Macias", "Everly Beltran", "Josiah Zamora", "Anna Villalobos",
    "Eli Ponce", "Caroline Duarte", "Charles Barraza", "Genesis Arreola", "Connor Carrillo",
    "Aaliyah Quintero", "Asher Franco", "Kennedy Leyva", "Cameron Salgado", "Kinsley Cisneros",
    "Colton Montalvo", "Allison Benitez", "Dominic Tellez", "Samantha Barajas", "Austin Quezada",
    "Aaliyah Olivas", "Jeremiah Rivas", "Nevaeh Becerra", "Jason Pineda", "Gabriella Escamilla"
]

patients = list(Patient.objects.all().order_by('patient_id'))
print(f"Total patients in database: {len(patients)}")

for idx, p in enumerate(patients):
    assigned_name = CALIFORNIA_PATIENT_NAMES[idx % len(CALIFORNIA_PATIENT_NAMES)]
    p.name = assigned_name
    p.save(update_fields=['name'])
    print(f"Updated {p.patient_id} -> {p.name}")

print("\nSuccessfully updated all 100 patient names in PostgreSQL!")
