#!/usr/bin/env python3
"""
Seed the database with realistic dummy data for OK Beauty Space.

Run modes:
  python seed.py          — skip if already seeded
  python seed.py --force  — drop all data and re-seed
"""
import sys
import os
import argparse
import random
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.database import SessionLocal, engine, Base
from app.models.patient import Patient
from app.models.service import Service
from app.models.appointment import Appointment

Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

SERVICES = [
    ("HydraFacial",               "Deep cleansing hydration facial with extraction",         185.0, 60, "Facial"),
    ("Signature Facial",          "European-style custom facial for all skin types",          120.0, 50, "Facial"),
    ("Chemical Peel",             "Resurfacing peel targeting pigmentation and texture",      150.0, 45, "Treatment"),
    ("Microdermabrasion",         "Mechanical exfoliation for smooth, radiant skin",          130.0, 40, "Treatment"),
    ("Nano-Needling",             "Micro-channeling to boost collagen and product absorption",200.0, 60, "Advanced"),
    ("Exosome Regenerative Facial","Cutting-edge regenerative therapy with growth factors",   350.0, 75, "Advanced"),
    ("Acne Treatment",            "Targeted deep-cleansing and calming protocol",             110.0, 50, "Treatment"),
    ("Anti-Aging Facial",         "Firming and lifting treatment with peptide infusion",      160.0, 60, "Facial"),
    ("Consultation",              "Personalized skin analysis and treatment planning",         50.0, 30, "Consultation"),
    ("Salmon DNA Facial",         "Regenerative PDRN therapy for skin renewal",              280.0, 65, "Advanced"),
]

PATIENTS = [
    # (first, last, email, phone, skin_type, allergies)
    ("Sofia",      "Martinez",  "sofia.martinez@email.com",  "310-555-0101", "Normal",      "None"),
    ("Emma",       "Johnson",   "emma.j@email.com",          "310-555-0102", "Dry",         "Retinol"),
    ("Olivia",     "Chen",      "olivia.chen@email.com",     "424-555-0103", "Oily",        "None"),
    ("Ava",        "Williams",  "ava.w@email.com",           "310-555-0104", "Combination", "Fragrance"),
    ("Isabella",   "Brown",     "isa.brown@email.com",       "424-555-0105", "Sensitive",   "Sulfates"),
    ("Mia",        "Davis",     "mia.davis@email.com",       "310-555-0106", "Normal",      "None"),
    ("Charlotte",  "Garcia",    "char.garcia@email.com",     "424-555-0107", "Dry",         "None"),
    ("Amelia",     "Wilson",    "amelia.w@email.com",        "310-555-0108", "Oily",        "Benzoyl peroxide"),
    ("Harper",     "Moore",     "harper.m@email.com",        "424-555-0109", "Combination", "None"),
    ("Evelyn",     "Taylor",    "evelyn.t@email.com",        "310-555-0110", "Sensitive",   "AHA acids"),
    ("Abigail",    "Anderson",  "abigail.a@email.com",       "424-555-0111", "Normal",      "None"),
    ("Emily",      "Thomas",    "emily.t@email.com",         "310-555-0112", "Dry",         "None"),
    ("Elizabeth",  "Jackson",   "liz.j@email.com",           "424-555-0113", "Oily",        "None"),
    ("Camila",     "White",     "camila.w@email.com",        "310-555-0114", "Combination", "Fragrance"),
    ("Luna",       "Harris",    "luna.h@email.com",          "424-555-0115", "Sensitive",   "None"),
    ("Penelope",   "Martin",    "pen.m@email.com",           "310-555-0116", "Normal",      "Retinol"),
    ("Riley",      "Thompson",  "riley.t@email.com",         "424-555-0117", "Dry",         "None"),
    ("Zoey",       "Garcia",    "zoey.g@email.com",          "310-555-0118", "Oily",        "None"),
    ("Nora",       "Martinez",  "nora.m@email.com",          "424-555-0119", "Combination", "None"),
    ("Lily",       "Robinson",  "lily.r@email.com",          "310-555-0120", "Sensitive",   "Sulfates"),
    ("Eleanor",    "Clark",     "eleanor.c@email.com",       "424-555-0121", "Normal",      "None"),
    ("Hannah",     "Rodriguez", "hannah.r@email.com",        "310-555-0122", "Dry",         "None"),
    ("Lillian",    "Lewis",     "lillian.l@email.com",       "424-555-0123", "Oily",        "None"),
    ("Addison",    "Lee",       "addison.l@email.com",       "310-555-0124", "Combination", "AHA acids"),
    ("Aubrey",     "Walker",    "aubrey.w@email.com",        "424-555-0125", "Sensitive",   "None"),
    ("Scarlett",   "Hall",      "scarlett.h@email.com",      "310-555-0126", "Normal",      "None"),
    ("Victoria",   "Allen",     "victoria.a@email.com",      "424-555-0127", "Dry",         "None"),
    ("Madison",    "Young",     "madison.y@email.com",       "310-555-0128", "Oily",        "Fragrance"),
    ("Grace",      "Hernandez", "grace.h@email.com",         "424-555-0129", "Combination", "None"),
    ("Chloe",      "King",      "chloe.k@email.com",         "310-555-0130", "Sensitive",   "Benzoyl peroxide"),
    ("Layla",      "Wright",    "layla.w@email.com",         "424-555-0131", "Normal",      "None"),
    ("Hannah",     "Lopez",     "hannah.l2@email.com",       "310-555-0132", "Dry",         "None"),
    ("Samantha",   "Hill",      "sam.h@email.com",           "424-555-0133", "Oily",        "None"),
    ("Natalie",    "Scott",     "natalie.s@email.com",       "310-555-0134", "Combination", "Sulfates"),
    ("Zoe",        "Green",     "zoe.g@email.com",           "424-555-0135", "Sensitive",   "None"),
    ("Audrey",     "Adams",     "audrey.a@email.com",        "310-555-0136", "Normal",      "Retinol"),
    ("Leah",       "Baker",     "leah.b@email.com",          "424-555-0137", "Dry",         "None"),
    ("Ariana",     "Gonzalez",  "ariana.g@email.com",        "310-555-0138", "Oily",        "None"),
    ("Allison",    "Nelson",    "allison.n@email.com",       "424-555-0139", "Combination", "AHA acids"),
    ("Gabriella",  "Carter",    "gabby.c@email.com",         "310-555-0140", "Sensitive",   "None"),
    ("Anna",       "Mitchell",  "anna.m@email.com",          "424-555-0141", "Normal",      "None"),
    ("Savannah",   "Perez",     "savannah.p@email.com",      "310-555-0142", "Dry",         "None"),
    ("Audrey",     "Roberts",   "audrey.r@email.com",        "424-555-0143", "Oily",        "Fragrance"),
    ("Brooklyn",   "Turner",    "brooklyn.t@email.com",      "310-555-0144", "Combination", "None"),
    ("Bella",      "Phillips",  "bella.p@email.com",         "424-555-0145", "Sensitive",   "Sulfates"),
    ("Claire",     "Campbell",  "claire.c@email.com",        "310-555-0146", "Normal",      "None"),
    ("Skylar",     "Parker",    "skylar.p@email.com",        "424-555-0147", "Dry",         "None"),
    ("Lucy",       "Evans",     "lucy.e@email.com",          "310-555-0148", "Oily",        "None"),
    ("Paisley",    "Edwards",   "paisley.e@email.com",       "424-555-0149", "Combination", "None"),
    ("Everly",     "Collins",   "everly.c@email.com",        "310-555-0150", "Sensitive",   "Benzoyl peroxide"),
    ("Aurora",     "Stewart",   "aurora.s@email.com",        "424-555-0151", "Normal",      "None"),
    ("Naomi",      "Sanchez",   "naomi.s@email.com",         "310-555-0152", "Dry",         "AHA acids"),
    ("Elena",      "Morris",    "elena.m@email.com",         "424-555-0153", "Oily",        "None"),
    ("Stella",     "Rogers",    "stella.r@email.com",        "310-555-0154", "Combination", "None"),
    ("Violet",     "Reed",      "violet.r@email.com",        "424-555-0155", "Sensitive",   "Fragrance"),
    ("Nova",       "Cook",      "nova.c@email.com",          "310-555-0156", "Normal",      "None"),
    ("Hazel",      "Morgan",    "hazel.m@email.com",         "424-555-0157", "Dry",         "None"),
    ("Caroline",   "Bell",      "caroline.b@email.com",      "310-555-0158", "Oily",        "Retinol"),
    ("Genesis",    "Murphy",    "genesis.m@email.com",       "424-555-0159", "Combination", "None"),
    ("Serenity",   "Bailey",    "serenity.b@email.com",      "310-555-0160", "Sensitive",   "None"),
    ("Willow",     "Rivera",    "willow.r@email.com",        "424-555-0161", "Normal",      "Sulfates"),
]

# ---------------------------------------------------------------------------
# Scheduling helpers
# ---------------------------------------------------------------------------

# Oksana works Tuesday–Saturday, 9am–7pm
WORK_DAYS = {1, 2, 3, 4, 5}  # Mon=0 … Sat=5 in Python weekday()
HOURS_START = 9
HOURS_END   = 19  # last slot can start at 6pm for a 60-min service

TODAY = date(2026, 5, 13)


def appointments_per_day(d: date) -> int:
    """Return how many appointments to generate for a given working day."""
    m = d.month
    if m <= 4:
        # Jan–Apr: growing practice, 5–10 appointments on work days
        return random.randint(5, 10)
    if m == 5:
        # May: peak season — 15–20 per day
        return random.randint(15, 20)
    if m == 6:
        # June: mild — 5–8 per day
        return random.randint(5, 8)
    # July: sporadic — 0–3, many days off
    return random.choices([0, 1, 2, 3], weights=[30, 30, 25, 15])[0]


def status_for(scheduled: datetime) -> str:
    """Assign a realistic status based on whether the appointment is past/future."""
    appt_date = scheduled.date()
    if appt_date < TODAY:
        return random.choices(["completed", "cancelled"], weights=[82, 18])[0]
    return "scheduled"


def random_time_on(d: date) -> datetime:
    """Pick a random working-hours time on the given date."""
    hour   = random.randint(HOURS_START, HOURS_END - 1)
    minute = random.choice([0, 15, 30, 45])
    return datetime(d.year, d.month, d.day, hour, minute)


def all_work_days(start: date, end: date):
    """Yield every working day between start and end (inclusive)."""
    current = start
    while current <= end:
        if current.weekday() in WORK_DAYS:
            yield current
        current += timedelta(days=1)


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

def seed(force: bool = False):
    db = SessionLocal()
    try:
        if not force and db.query(Service).count() > 0:
            print("Database already seeded. Run with --force to reseed.")
            return

        if force:
            db.query(Appointment).delete()
            db.query(Patient).delete()
            db.query(Service).delete()
            db.commit()
            print("Cleared existing data.")

        # Services
        services = []
        for name, desc, price, duration, category in SERVICES:
            s = Service(name=name, description=desc, price=price,
                        duration_minutes=duration, category=category)
            db.add(s)
            services.append(s)
        db.commit()
        print(f"Seeded {len(services)} services.")

        # Patients
        patients = []
        for first, last, email, phone, skin, allergies in PATIENTS:
            p = Patient(first_name=first, last_name=last, email=email,
                        phone=phone, skin_type=skin, allergies=allergies)
            db.add(p)
            patients.append(p)
        db.commit()
        print(f"Seeded {len(patients)} patients.")

        # Appointments — Jan 1 through July 31 2026
        start_date = date(2026, 1, 1)
        end_date   = date(2026, 7, 31)

        count = 0
        batch_size = 200

        for work_day in all_work_days(start_date, end_date):
            n = appointments_per_day(work_day)
            used_slots = set()
            for _ in range(n):
                # avoid exact duplicate times on the same day
                for _attempt in range(10):
                    scheduled = random_time_on(work_day)
                    slot_key  = (scheduled.hour, scheduled.minute)
                    if slot_key not in used_slots:
                        used_slots.add(slot_key)
                        break

                appt = Appointment(
                    patient_id=random.choice(patients).id,
                    service_id=random.choice(services).id,
                    scheduled_at=scheduled,
                    status=status_for(scheduled),
                    notes=None,
                )
                db.add(appt)
                count += 1

                if count % batch_size == 0:
                    db.commit()
                    print(f"  {count} appointments committed…")

        db.commit()
        print(f"Seeded {count} appointments across Jan–Jul 2026.")
        print("Done.")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true",
                        help="Drop all existing data and re-seed")
    args = parser.parse_args()
    seed(force=args.force)
