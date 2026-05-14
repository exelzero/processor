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
from app.models.product import Product
from app.models.promotion import Promotion
from app.models.sale import Sale, SaleItem, SaleReturn
from app.models.expense import Expense
from app.models.stock_movement import StockMovement

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
    """
    Generator that yields each work day in [start, end] one at a time.

    Using `yield` makes this a generator function — a form of cooperative
    concurrency.  Each call to next() resumes execution from the yield point
    rather than running the whole function to completion.  The caller and the
    generator take turns: the generator produces one value and suspends; the
    caller consumes it and resumes the generator for the next.

    Compared to returning a list:
    - Memory: O(1) — only the current date is held; a list would be O(n).
    - Laziness: dates beyond what the caller consumes are never computed.
    - Composability: can be passed directly to a for-loop or any iterator
      consumer without materialising the full sequence first.

    This cooperative yield-and-resume pattern is the foundation that Python's
    async/await coroutines are built on — `async def` functions are syntactic
    sugar over the same generator protocol.
    """
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
            db.query(StockMovement).delete()
            db.query(SaleReturn).delete()
            db.query(SaleItem).delete()
            db.query(Sale).delete()
            db.query(Appointment).delete()
            db.query(Patient).delete()
            db.query(Service).delete()
            db.query(Product).delete()
            db.query(Promotion).delete()
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

        # ---------------------------------------------------------------
        # Products — 32 retail skincare items
        # ---------------------------------------------------------------
        PRODUCTS = [
            # (name, brand, description, category, price, cost, sku)
            ("Gentle Foaming Cleanser",      "iS Clinical",    "Soothing daily cleanser for all skin types",            "Cleanser",    38.0,  16.0, "ISC-GFC-001"),
            ("Purifying Gel Cleanser",        "PCA Skin",       "Deep-pore cleansing gel for oily skin",                 "Cleanser",    34.0,  14.0, "PCA-PGC-002"),
            ("Balancing Face Wash",           "Dermalogica",    "pH-balanced cleanser for combination skin",             "Cleanser",    42.0,  18.0, "DRM-BFW-003"),
            ("Hydrating Toner Mist",          "Eminence",       "Rosewater-infused toning mist",                         "Toner",       44.0,  19.0, "EMN-HTM-004"),
            ("Balancing Toner",               "PCA Skin",       "Antioxidant-rich toner to restore skin balance",        "Toner",       38.0,  16.0, "PCA-BT-005"),
            ("C E Ferulic Vitamin C Serum",   "SkinCeuticals",  "Dual antioxidant vitamin C serum — best seller",        "Serum",      182.0,  72.0, "SKC-CEF-006"),
            ("Super Serum Advance+",          "iS Clinical",    "Potent multi-correctional anti-aging serum",            "Serum",      145.0,  58.0, "ISC-SSA-007"),
            ("Active Serum",                  "iS Clinical",    "Brightening and smoothing treatment serum",             "Serum",      128.0,  51.0, "ISC-AS-008"),
            ("Radiance Renewal Serum",        "Jan Marini",     "Brightening serum with niacinamide & peptides",         "Serum",      148.0,  59.0, "JM-RRS-009"),
            ("Hyaluronic Acid B5",            "SkinCeuticals",  "Hydrating concentrate with pure hyaluronic acid",       "Serum",       92.0,  37.0, "SKC-HAB-010"),
            ("Redness Relief Creme",          "Eminence",       "Calming moisturizer for sensitive & reactive skin",     "Moisturizer", 64.0,  26.0, "EMN-RRC-011"),
            ("Ultra Rich Moisturizer",        "Jan Marini",     "Intense hydration for dry & mature skin",               "Moisturizer", 86.0,  34.0, "JM-URM-012"),
            ("Age Intervention Face Cream",   "Jan Marini",     "Advanced anti-aging moisturizer with growth factors",   "Moisturizer",180.0,  72.0, "JM-AIF-013"),
            ("Daily Microfoliant SPF 30",     "Dermalogica",    "Exfoliating moisturizer with broad-spectrum SPF",       "Moisturizer", 58.0,  23.0, "DRM-DMS-014"),
            ("Skin Matrix Support",           "PCA Skin",       "Firming moisturizer with ceramides & peptides",         "Moisturizer", 94.0,  38.0, "PCA-SMS-015"),
            ("Physical Fusion UV Defense",    "SkinCeuticals",  "Tinted SPF 50 physical sunscreen",                      "SPF",         42.0,  17.0, "SKC-PFU-016"),
            ("Sheer Physical UV Defense",     "SkinCeuticals",  "Weightless SPF 50 mineral sunscreen",                   "SPF",         38.0,  15.0, "SKC-SPU-017"),
            ("Smart SPF 45 Sunscreen",        "Jan Marini",     "Antioxidant-enriched daily SPF",                        "SPF",         58.0,  23.0, "JM-SS45-018"),
            ("Colorsetting SPF 30",           "PCA Skin",       "Setting powder with built-in sun protection",           "SPF",         44.0,  18.0, "PCA-CS30-019"),
            ("AOX+ Eye Gel",                  "SkinCeuticals",  "Antioxidant eye gel targeting dark circles & puffiness","Eye Care",   108.0,  43.0, "SKC-AOX-020"),
            ("Eye Contour Gel",               "Dermalogica",    "Cooling eye gel for tired, puffy eyes",                 "Eye Care",    64.0,  26.0, "DRM-ECG-021"),
            ("Eye Lift Gel",                  "iS Clinical",    "Lifting & firming eye treatment",                       "Eye Care",    96.0,  38.0, "ISC-ELG-022"),
            ("Kaolin Clay Mask",              "Eminence",       "Deep-cleansing clay mask for congested skin",           "Mask",        56.0,  22.0, "EMN-KCM-023"),
            ("Sulfur Masque",                 "Jan Marini",     "Purifying acne treatment mask",                         "Mask",        68.0,  27.0, "JM-SM-024"),
            ("Pore Refining Treatment Mask",  "SkinCeuticals",  "Clay-based mask to minimize pore appearance",           "Mask",        72.0,  29.0, "SKC-PRT-025"),
            ("Micro-Exfoliating Scrub",       "Dermalogica",    "Gentle physical exfoliant with rice bran enzymes",      "Exfoliator",  48.0,  19.0, "DRM-MES-026"),
            ("Micro Exfoliating Cleanser",    "iS Clinical",    "Dual-action enzymatic exfoliating cleanser",            "Exfoliator",  56.0,  22.0, "ISC-MEC-027"),
            ("Smoothing Toner",               "PCA Skin",       "AHA/BHA liquid exfoliant for smooth texture",           "Exfoliator",  44.0,  18.0, "PCA-ST-028"),
            ("Replenishing Body Butter",      "Eminence",       "Rich shea & mango butter for dry body skin",            "Body",        38.0,  15.0, "EMN-RBB-029"),
            ("Triple Lipid Restore Body",     "SkinCeuticals",  "Barrier-repairing body lotion with ceramides",          "Body",        72.0,  29.0, "SKC-TLR-030"),
            ("Rose Quartz Gua Sha",           "OK Beauty",      "Hand-carved rose quartz gua sha tool",                  "Tool",        28.0,  10.0, "OKB-RQG-031"),
            ("Jade Facial Roller",            "OK Beauty",      "Dual-ended jade roller for lymphatic drainage",         "Tool",        22.0,   8.0, "OKB-JFR-032"),
        ]

        products = []
        for name, brand, desc, cat, price, cost, sku in PRODUCTS:
            qty = random.randint(3, 18)
            on_order = random.choice([0, 0, 0, random.randint(3, 10)])
            p = Product(name=name, brand=brand, description=desc, category=cat,
                        price=price, cost=cost, sku=sku, active=True,
                        stock_qty=qty, stock_on_order=on_order)
            db.add(p)
            products.append(p)
        db.flush()
        # Log opening stock and any on-order positions as movements
        for p in products:
            db.add(StockMovement(
                product_id=p.id,
                movement_type="adjustment",
                qty_delta=p.stock_qty,
                on_order_delta=0,
                notes="Opening stock",
            ))
            if p.stock_on_order > 0:
                db.add(StockMovement(
                    product_id=p.id,
                    movement_type="order_placed",
                    qty_delta=0,
                    on_order_delta=p.stock_on_order,
                    notes="Order placed with supplier",
                ))
        db.commit()
        print(f"Seeded {len(products)} products.")

        # ---------------------------------------------------------------
        # Promotions — 10 campaigns
        # ---------------------------------------------------------------
        PROMOTIONS = [
            # (name, code, type, value, min_purchase, start, end, max_uses)
            ("Welcome Offer",       "WELCOME25",  "percentage", 25.0, None,   "2026-01-01", "2026-12-31", 500),
            ("Valentine's Day",     "VALENTINE",  "fixed",      20.0, 100.0,  "2026-02-10", "2026-02-17", None),
            ("Spring Sale",         "SPRING20",   "percentage", 20.0, None,   "2026-03-01", "2026-03-31", None),
            ("Loyalty Club",        "LOYALCLUB",  "percentage", 10.0, None,   "2026-01-01", "2026-12-31", None),
            ("May Day Sale",        "MAYDAY15",   "percentage", 15.0, None,   "2026-05-01", "2026-05-31", None),
            ("Bundle & Save",       "BUNDLE15",   "percentage", 15.0, 80.0,   "2026-01-01", "2026-12-31", None),
            ("Summer Vibes",        "SUMMERVIB",  "percentage", 10.0, None,   "2026-06-01", "2026-08-31", None),
            ("Birthday Special",    "BIRTHDAY15", "percentage", 15.0, None,   "2026-01-01", "2026-12-31", None),
            ("Flash Sale",          "FLASH30",    "percentage", 30.0, None,   "2026-04-15", "2026-04-16", 100),
            ("Independence Day",    "JULY4TH",    "fixed",      25.0, 150.0,  "2026-07-01", "2026-07-07", None),
        ]

        def promo_dt(s):
            return datetime.strptime(s, "%Y-%m-%d")

        promotions_map = {}  # code → Promotion object
        for name, code, dtype, val, min_p, start_s, end_s, max_u in PROMOTIONS:
            pr = Promotion(
                name=name, code=code, discount_type=dtype, discount_value=val,
                min_purchase=min_p, start_date=promo_dt(start_s), end_date=promo_dt(end_s),
                active=True, max_uses=max_u, uses_count=0,
            )
            db.add(pr)
            promotions_map[code] = pr
        db.commit()
        print(f"Seeded {len(PROMOTIONS)} promotions.")

        # ---------------------------------------------------------------
        # Sales — 2–5/workday Jan–Jul 2026, matching appointment density
        # ---------------------------------------------------------------
        # Product weights: serums & SPF most popular at a spa
        PRODUCT_WEIGHTS = [
            1, 1, 1, 1, 1,          # cleansers / toners
            4, 4, 3, 3, 3,          # serums (higher weight)
            2, 2, 2, 2, 2,          # moisturizers
            3, 3, 2, 2,             # SPF (popular)
            2, 2, 2,                # eye care
            1, 1, 1,                # masks
            1, 1, 1,                # exfoliators
            1, 1,                   # body
            1, 1,                   # tools
        ]

        # Promos eligible by date range
        def active_promos_for(d: date):
            dt = datetime(d.year, d.month, d.day, 12, 0)
            return [pr for pr in promotions_map.values()
                    if pr.start_date <= dt <= pr.end_date]

        def sales_per_day(d: date) -> int:
            m = d.month
            if m <= 4:   return random.randint(2, 4)
            if m == 5:   return random.randint(4, 6)
            if m == 6:   return random.randint(2, 4)
            return random.choices([0, 1, 2, 3], weights=[25, 35, 28, 12])[0]

        sale_count = 0
        all_sales = []

        for work_day in all_work_days(date(2026, 1, 1), date(2026, 7, 31)):
            n_sales = sales_per_day(work_day)
            eligible_promos = active_promos_for(work_day)

            for _ in range(n_sales):
                # 1–3 items per sale, weighted toward 1
                n_items = random.choices([1, 2, 3], weights=[55, 32, 13])[0]
                chosen = random.choices(products, weights=PRODUCT_WEIGHTS, k=n_items)
                # deduplicate (same product twice → just increase qty)
                item_map = {}
                for prod in chosen:
                    item_map[prod.id] = item_map.get(prod.id, 0) + 1

                subtotal = round(sum(p.price * qty for p, qty in
                                     [(db.get(Product, pid), qty) for pid, qty in item_map.items()]), 2)

                # 18 % chance of promo; pick one that's valid for the subtotal
                discount = 0.0
                promo_obj = None
                if eligible_promos and random.random() < 0.18:
                    eligible = [pr for pr in eligible_promos
                                if pr.min_purchase is None or subtotal >= pr.min_purchase]
                    if eligible:
                        promo_obj = random.choice(eligible)
                        if promo_obj.discount_type == 'percentage':
                            discount = round(subtotal * promo_obj.discount_value / 100, 2)
                        else:
                            discount = min(promo_obj.discount_value, subtotal)
                        promo_obj.uses_count += 1

                sale_hour = random.randint(9, 18)
                sale_time = datetime(work_day.year, work_day.month, work_day.day,
                                     sale_hour, random.choice([0, 15, 30, 45]))

                sale_obj = Sale(
                    patient_id=random.choice(patients).id,
                    promotion_id=promo_obj.id if promo_obj else None,
                    sale_date=sale_time,
                    subtotal=subtotal,
                    discount_amount=round(discount, 2),
                    total=round(subtotal - discount, 2),
                    status='completed',
                )
                db.add(sale_obj)
                db.flush()

                for pid, qty in item_map.items():
                    prod = db.get(Product, pid)
                    db.add(SaleItem(
                        sale_id=sale_obj.id,
                        product_id=pid,
                        quantity=qty,
                        unit_price=prod.price,
                        total=round(prod.price * qty, 2),
                    ))

                all_sales.append(sale_obj)
                sale_count += 1

                if sale_count % 250 == 0:
                    db.commit()
                    print(f"  {sale_count} sales committed…")

        db.commit()

        # Returns — ~6% of completed sales
        return_reasons = [
            "Product caused irritation",
            "Wrong product purchased",
            "Duplicate purchase",
            "Not suitable for skin type",
            "Received as gift — already have it",
            "Allergic reaction",
            "Product not as expected",
        ]
        return_count = 0
        returnable = [s for s in all_sales if s.sale_date.date() < TODAY]
        n_returns = int(len(returnable) * 0.06)
        for sale_obj in random.sample(returnable, n_returns):
            db.refresh(sale_obj)
            # Partial return (60%) or full return (40%)
            if random.random() < 0.6 and sale_obj.total > 20:
                amount = round(sale_obj.total * random.uniform(0.3, 0.7), 2)
                status = 'partially_refunded'
            else:
                amount = sale_obj.total
                status = 'refunded'
            ret_date = sale_obj.sale_date + timedelta(days=random.randint(1, 14))
            db.add(SaleReturn(
                sale_id=sale_obj.id,
                return_date=ret_date,
                amount=amount,
                reason=random.choice(return_reasons),
            ))
            sale_obj.status = status
            return_count += 1

        db.commit()
        print(f"Seeded {sale_count} sales with {return_count} returns.")

        # -------------------------------------------------------------------
        # Expenses
        # -------------------------------------------------------------------
        # Cover the same ~8-month window as appointments (roughly Sep–Apr)
        expense_count = 0
        FIRST_MONTH = date(TODAY.year - 1, 9, 1) if TODAY.month < 9 else date(TODAY.year, 9, 1)

        # Fixed monthly recurring expenses (same amount, 1st of each month)
        fixed_monthly = [
            ("Rent",                    "Studio lease — monthly rent",              3500.00),
            ("Insurance",               "Business liability insurance premium",       210.00),
            ("Software & Subscriptions","Square POS monthly subscription",             60.00),
            ("Software & Subscriptions","Booking platform (Vagaro) monthly fee",       90.00),
        ]

        # Variable monthly expenses (amount varies ±20%)
        variable_monthly = [
            ("Utilities",           "Electricity & water",                  380.0),
            ("Utilities",           "Internet & phone",                     120.0),
            ("Cleaning",            "Studio deep-clean service",            180.0),
            ("Marketing",           "Instagram/Facebook ad spend",          250.0),
        ]

        # Irregular supply orders (placed ~2–3x per month, varying amounts)
        supply_items = [
            ("Products & Supplies", "HydraFacial serums & tips restock",    320.0),
            ("Products & Supplies", "Chemical peel solution restock",        180.0),
            ("Products & Supplies", "Retail skincare inventory (Environ)",   540.0),
            ("Products & Supplies", "Disposables: gloves, masks, linens",    95.0),
            ("Products & Supplies", "Exosome growth factor vials",          420.0),
            ("Products & Supplies", "Towels & spa accessories",              75.0),
        ]

        # One-off equipment purchases (sprinkled across months)
        equipment_events = [
            (2,  "Equipment",  "Nano-needling pen replacement cartridges",  260.0),
            (4,  "Equipment",  "LED light therapy panel",                   850.0),
            (6,  "Equipment",  "Autoclave steriliser service",              190.0),
        ]

        month_cursor = FIRST_MONTH
        months_seeded = 0
        while month_cursor <= TODAY.replace(day=1):
            # Fixed expenses on the 1st
            for cat, desc, amt in fixed_monthly:
                db.add(Expense(
                    category=cat,
                    description=desc,
                    amount=round(amt, 2),
                    expense_date=month_cursor,
                ))
                expense_count += 1

            # Variable expenses — random day in first 10 days
            for cat, desc, base in variable_monthly:
                day = random.randint(1, 10)
                exp_date = month_cursor.replace(day=day)
                variance = random.uniform(0.85, 1.15)
                db.add(Expense(
                    category=cat,
                    description=desc,
                    amount=round(base * variance, 2),
                    expense_date=exp_date,
                ))
                expense_count += 1

            # Supply orders: 2–3 random orders per month
            orders = random.sample(supply_items, k=random.randint(2, 3))
            for cat, desc, base in orders:
                day = random.randint(1, 28)
                exp_date = month_cursor.replace(day=day)
                variance = random.uniform(0.80, 1.20)
                db.add(Expense(
                    category=cat,
                    description=desc,
                    amount=round(base * variance, 2),
                    expense_date=exp_date,
                ))
                expense_count += 1

            # Equipment one-offs (month index based)
            for mo_idx, cat, desc, amt in equipment_events:
                if months_seeded == mo_idx:
                    day = random.randint(5, 25)
                    db.add(Expense(
                        category=cat,
                        description=desc,
                        amount=round(amt, 2),
                        expense_date=month_cursor.replace(day=day),
                    ))
                    expense_count += 1

            # Next month
            if month_cursor.month == 12:
                month_cursor = month_cursor.replace(year=month_cursor.year + 1, month=1)
            else:
                month_cursor = month_cursor.replace(month=month_cursor.month + 1)
            months_seeded += 1

        db.commit()
        print(f"Seeded {expense_count} expenses.")
        print("Done.")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true",
                        help="Drop all existing data and re-seed")
    args = parser.parse_args()
    seed(force=args.force)
