#!/usr/bin/env python3
"""Seed the database with realistic dummy data for OK Beauty Space."""
import sys
import os
from datetime import datetime, timedelta
import random

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.database import SessionLocal, engine, Base
from app.models.patient import Patient
from app.models.service import Service
from app.models.appointment import Appointment

Base.metadata.create_all(bind=engine)

SERVICES = [
    ("HydraFacial", "Deep cleansing hydration facial with extraction", 185.0, 60, "Facial"),
    ("Signature Facial", "European-style custom facial for all skin types", 120.0, 50, "Facial"),
    ("Chemical Peel", "Resurfacing peel targeting pigmentation and texture", 150.0, 45, "Treatment"),
    ("Microdermabrasion", "Mechanical exfoliation for smooth, radiant skin", 130.0, 40, "Treatment"),
    ("Nano-Needling", "Micro-channeling to boost collagen and product absorption", 200.0, 60, "Advanced"),
    ("Exosome Regenerative Facial", "Cutting-edge regenerative therapy with growth factors", 350.0, 75, "Advanced"),
    ("Acne Treatment", "Targeted deep-cleansing and calming protocol", 110.0, 50, "Treatment"),
    ("Anti-Aging Facial", "Firming and lifting treatment with peptide infusion", 160.0, 60, "Facial"),
    ("Consultation", "Personalized skin analysis and treatment planning", 50.0, 30, "Consultation"),
    ("Salmon DNA Facial", "Regenerative PDRN therapy for skin renewal", 280.0, 65, "Advanced"),
]

PATIENTS = [
    ("Sofia", "Martinez", "sofia.martinez@email.com", "310-555-0101", "Normal", "None"),
    ("Emma", "Johnson", "emma.j@email.com", "310-555-0102", "Dry", "Retinol"),
    ("Olivia", "Chen", "olivia.chen@email.com", "424-555-0103", "Oily", "None"),
    ("Ava", "Williams", "ava.w@email.com", "310-555-0104", "Combination", "Fragrance"),
    ("Isabella", "Brown", "isa.brown@email.com", "424-555-0105", "Sensitive", "Sulfates"),
    ("Mia", "Davis", "mia.davis@email.com", "310-555-0106", "Normal", "None"),
    ("Charlotte", "Garcia", "char.garcia@email.com", "424-555-0107", "Dry", "None"),
    ("Amelia", "Wilson", "amelia.w@email.com", "310-555-0108", "Oily", "Benzoyl peroxide"),
    ("Harper", "Moore", "harper.m@email.com", "424-555-0109", "Combination", "None"),
    ("Evelyn", "Taylor", "evelyn.t@email.com", "310-555-0110", "Sensitive", "AHA acids"),
    ("Abigail", "Anderson", "abigail.a@email.com", "424-555-0111", "Normal", "None"),
    ("Emily", "Thomas", "emily.t@email.com", "310-555-0112", "Dry", "None"),
    ("Elizabeth", "Jackson", "liz.j@email.com", "424-555-0113", "Oily", "None"),
    ("Camila", "White", "camila.w@email.com", "310-555-0114", "Combination", "Fragrance"),
    ("Luna", "Harris", "luna.h@email.com", "424-555-0115", "Sensitive", "None"),
    ("Penelope", "Martin", "pen.m@email.com", "310-555-0116", "Normal", "Retinol"),
    ("Riley", "Thompson", "riley.t@email.com", "424-555-0117", "Dry", "None"),
    ("Zoey", "Garcia", "zoey.g@email.com", "310-555-0118", "Oily", "None"),
    ("Nora", "Martinez", "nora.m@email.com", "424-555-0119", "Combination", "None"),
    ("Lily", "Robinson", "lily.r@email.com", "310-555-0120", "Sensitive", "Sulfates"),
    ("Eleanor", "Clark", "eleanor.c@email.com", "424-555-0121", "Normal", "None"),
    ("Hannah", "Rodriguez", "hannah.r@email.com", "310-555-0122", "Dry", "None"),
    ("Lillian", "Lewis", "lillian.l@email.com", "424-555-0123", "Oily", "None"),
    ("Addison", "Lee", "addison.l@email.com", "310-555-0124", "Combination", "AHA acids"),
    ("Aubrey", "Walker", "aubrey.w@email.com", "424-555-0125", "Sensitive", "None"),
]

STATUSES = ["completed", "completed", "completed", "scheduled", "cancelled"]


def seed():
    db = SessionLocal()
    try:
        if db.query(Service).count() > 0:
            print("Database already seeded.")
            return

        services = []
        for name, desc, price, duration, category in SERVICES:
            s = Service(name=name, description=desc, price=price,
                        duration_minutes=duration, category=category)
            db.add(s)
            services.append(s)
        db.commit()
        print(f"Seeded {len(services)} services.")

        patients = []
        for first, last, email, phone, skin, allergies in PATIENTS:
            p = Patient(first_name=first, last_name=last, email=email,
                        phone=phone, skin_type=skin, allergies=allergies)
            db.add(p)
            patients.append(p)
        db.commit()
        print(f"Seeded {len(patients)} patients.")

        count = 0
        now = datetime.utcnow()
        for i in range(80):
            patient = random.choice(patients)
            service = random.choice(services)
            offset_days = random.randint(-60, 30)
            scheduled = now + timedelta(days=offset_days, hours=random.randint(9, 17))
            status = "scheduled" if offset_days > 0 else random.choice(STATUSES)
            appt = Appointment(
                patient_id=patient.id,
                service_id=service.id,
                scheduled_at=scheduled,
                status=status,
            )
            db.add(appt)
            count += 1
        db.commit()
        print(f"Seeded {count} appointments.")
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
