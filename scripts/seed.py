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
# Services
# ---------------------------------------------------------------------------

SERVICES = [
    ("HydraFacial",                "Deep cleansing hydration facial with extraction",          185.0, 60, "Facial"),
    ("Signature Facial",           "European-style custom facial for all skin types",           120.0, 50, "Facial"),
    ("Chemical Peel",              "Resurfacing peel targeting pigmentation and texture",       150.0, 45, "Treatment"),
    ("Microdermabrasion",          "Mechanical exfoliation for smooth, radiant skin",           130.0, 40, "Treatment"),
    ("Nano-Needling",              "Micro-channeling to boost collagen and product absorption", 200.0, 60, "Advanced"),
    ("Exosome Regenerative Facial","Cutting-edge regenerative therapy with growth factors",     350.0, 75, "Advanced"),
    ("Acne Treatment",             "Targeted deep-cleansing and calming protocol",              110.0, 50, "Treatment"),
    ("Anti-Aging Facial",          "Firming and lifting treatment with peptide infusion",       160.0, 60, "Facial"),
    ("Consultation",               "Personalized skin analysis and treatment planning",          50.0, 30, "Consultation"),
    ("Salmon DNA Facial",          "Regenerative PDRN therapy for skin renewal",               280.0, 65, "Advanced"),
]

# ---------------------------------------------------------------------------
# Patient name pool — 50 first names × 10 last names = 500 unique combos
# ---------------------------------------------------------------------------

FIRST_NAMES = [
    "Sofia", "Emma", "Olivia", "Ava", "Isabella", "Mia", "Charlotte", "Amelia",
    "Harper", "Evelyn", "Abigail", "Emily", "Elizabeth", "Camila", "Luna",
    "Penelope", "Riley", "Zoey", "Nora", "Lily", "Eleanor", "Hannah", "Lillian",
    "Addison", "Aubrey", "Scarlett", "Victoria", "Madison", "Grace", "Chloe",
    "Layla", "Samantha", "Natalie", "Zoe", "Audrey", "Leah", "Ariana", "Allison",
    "Gabriella", "Anna", "Savannah", "Brooklyn", "Bella", "Claire", "Skylar",
    "Lucy", "Paisley", "Aurora", "Naomi", "Elena", "Stella", "Violet", "Nova",
    "Hazel", "Caroline", "Genesis", "Serenity", "Willow", "Everly", "Jasmine",
    "Katherine", "Maya", "Alyssa", "Vanessa", "Diana", "Rachel", "Jessica",
    "Amanda", "Nicole", "Stephanie", "Michelle", "Lauren", "Kimberly", "Sarah",
    "Ashley", "Brittany", "Amber", "Alexis", "Kayla", "Taylor", "Morgan",
    "Destiny", "Chelsea", "Alexandria", "Valentina", "Natalia", "Miriam",
    "Patricia", "Daniela", "Catalina", "Priya", "Mei", "Yuki", "Aisha",
    "Fatima", "Nina", "Bianca", "Vivian", "Iris", "Celeste", "Daphne",
]

LAST_NAMES = [
    "Martinez", "Johnson", "Chen", "Williams", "Brown", "Davis", "Garcia",
    "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White",
    "Harris", "Martin", "Thompson", "Robinson", "Clark", "Rodriguez",
    "Lewis", "Lee", "Walker", "Hall", "Allen", "Young", "Hernandez",
    "King", "Wright", "Lopez", "Hill", "Scott", "Green", "Adams", "Baker",
    "Gonzalez", "Nelson", "Carter", "Mitchell", "Perez", "Roberts", "Turner",
    "Phillips", "Campbell", "Parker", "Evans", "Edwards", "Collins", "Stewart",
    "Sanchez", "Morris", "Rogers", "Reed", "Cook", "Morgan", "Bell", "Murphy",
    "Bailey", "Rivera", "Cooper", "Richardson", "Cox", "Howard", "Ward", "Torres",
    "Peterson", "Gray", "Ramirez", "James", "Watson", "Brooks", "Kelly",
    "Sanders", "Price", "Bennett", "Wood", "Barnes", "Ross", "Henderson",
    "Coleman", "Jenkins", "Perry", "Powell", "Long", "Patterson", "Hughes",
    "Flores", "Washington", "Butler", "Simmons", "Foster", "Gonzales", "Bryant",
    "Alexander", "Russell", "Griffin", "Diaz", "Hayes", "Myers", "Ford",
]

SKIN_TYPES  = ["Normal", "Dry", "Oily", "Combination", "Sensitive"]
ALLERGIES   = ["None", "None", "None", "Retinol", "Fragrance", "Sulfates",
               "AHA acids", "Benzoyl peroxide", "Parabens", "Salicylic acid"]

# ---------------------------------------------------------------------------
# Scheduling helpers
# ---------------------------------------------------------------------------

# Tue–Sat work week (Mon=0, Sat=5)
WORK_DAYS      = {1, 2, 3, 4, 5}
HOURS_START    = 9
HOURS_END      = 19
BUFFER_MINUTES = 10   # cleanup/turnover time between appointments

TODAY = date(2026, 5, 13)


def appointments_per_day(d: date) -> int:
    """
    Returns a realistic target count for a solo esthetician.
    Hard ceiling ~9: avg service 54 min + 10 min buffer = 64 min/slot in 600 min day.
    """
    m = d.month
    if m <= 4:
        return random.randint(5, 8)   # Jan–Apr: growing practice
    if m == 5:
        return random.randint(7, 9)   # May: peak season
    if m == 6:
        return random.randint(5, 8)   # June: mild
    # July: sporadic summer slowdown
    return random.choices([0, 1, 2, 3, 4], weights=[20, 25, 25, 18, 12])[0]


def status_for(scheduled: datetime) -> str:
    if scheduled.date() < TODAY:
        return random.choices(["completed", "cancelled", "no-show"],
                              weights=[78, 15, 7])[0]
    return "scheduled"


def schedule_day(work_day: date, n_target: int, services: list) -> list:
    """
    Schedule up to n_target non-overlapping appointments on work_day.
    Picks service first (to know duration), then finds a free slot via
    interval collision detection. Returns list of (start_datetime, service).
    """
    booked = []   # [(start_dt, end_dt), ...]
    result = []
    work_end = datetime(work_day.year, work_day.month, work_day.day, HOURS_END, 0)

    for _ in range(n_target * 12):   # generous attempts to fill the target
        if len(result) >= n_target:
            break

        service = random.choice(services)
        hour    = random.randint(HOURS_START, HOURS_END - 1)
        minute  = random.choice([0, 15, 30, 45])
        start   = datetime(work_day.year, work_day.month, work_day.day, hour, minute)
        end     = start + timedelta(minutes=service.duration_minutes + BUFFER_MINUTES)

        if end > work_end:
            continue
        if any(start < b_end and end > b_start for b_start, b_end in booked):
            continue

        booked.append((start, end))
        result.append((start, service))

    return result


def all_work_days(start: date, end: date):
    current = start
    while current <= end:
        if current.weekday() in WORK_DAYS:
            yield current
        current += timedelta(days=1)


def generate_patients(n: int) -> list:
    """Generate n unique (first, last) patient records."""
    seen_emails = set()
    patients = []
    first_pool = FIRST_NAMES * (n // len(FIRST_NAMES) + 2)
    last_pool  = LAST_NAMES  * (n // len(LAST_NAMES)  + 2)
    random.shuffle(first_pool)
    random.shuffle(last_pool)

    i = 0
    while len(patients) < n:
        first = first_pool[i % len(first_pool)]
        last  = last_pool[i % len(last_pool)]
        # Make email unique by appending a counter when needed
        base_email = f"{first.lower()}.{last.lower()}@email.com"
        email = base_email
        suffix = 2
        while email in seen_emails:
            email = f"{first.lower()}.{last.lower()}{suffix}@email.com"
            suffix += 1
        seen_emails.add(email)
        area = random.choice(["310", "424", "323", "213", "818"])
        phone = f"{area}-555-{1000 + len(patients):04d}"
        patients.append((first, last, email, phone,
                         random.choice(SKIN_TYPES),
                         random.choice(ALLERGIES)))
        i += 1
    return patients


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

        # Patients — 500 generated records
        patient_rows = generate_patients(500)
        patients = []
        for first, last, email, phone, skin, allergies in patient_rows:
            p = Patient(first_name=first, last_name=last, email=email,
                        phone=phone, skin_type=skin, allergies=allergies)
            db.add(p)
            patients.append(p)
        db.commit()
        print(f"Seeded {len(patients)} patients.")

        # Appointments — Jan 1 through Jul 31 2026
        start_date = date(2026, 1, 1)
        end_date   = date(2026, 7, 31)

        count = 0
        batch_size = 250

        for work_day in all_work_days(start_date, end_date):
            n = appointments_per_day(work_day)
            day_slots = schedule_day(work_day, n, services)

            for start, service in day_slots:
                appt = Appointment(
                    patient_id=random.choice(patients).id,
                    service_id=service.id,
                    scheduled_at=start,
                    status=status_for(start),
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
