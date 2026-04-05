"""
Drug Calculation Module
Computes safe dose ranges for common clinical drugs.
Returns structured output including warnings.
"""
import re
from typing import Optional, List
from models.schemas import DrugDoseResult

# Drug database — (mg/kg/dose or flat mg, min, max, max_daily, overdose_threshold, warnings)
DRUG_DB: dict = {
    "paracetamol": {
        "aliases": ["acetaminophen", "tylenol", "calpol"],
        "adult_flat_mg": (500, 1000),
        "adult_max_daily_mg": 4000,
        "adult_max_daily_elderly_mg": 3000,
        "pediatric_mg_per_kg": (10, 15),
        "pediatric_max_doses_per_day": 5,
        "overdose_threshold_adult_mg": 7500,
        "antidote": "N-Acetylcysteine (NAC) — initiate immediately if >150 mg/kg or per Rumack-Matthew nomogram",
        "warnings": [
            "Hepatotoxicity risk with doses above therapeutic range.",
            "Reduce maximum dose to 3 g/day in hepatic impairment or chronic alcohol use.",
            "Monitor LFTs in prolonged therapy.",
        ],
    },
    "morphine": {
        "aliases": ["morphine sulfate", "ms contin"],
        "adult_flat_mg": (2, 4),
        "route": "IV/SC every 3–4 h (titrate to pain response)",
        "adult_max_daily_mg": 120,
        "pediatric_mg_per_kg": (0.05, 0.1),
        "overdose_threshold_adult_mg": 200,
        "antidote": "Naloxone 0.4–2 mg IV (repeat every 2–3 min as needed)",
        "warnings": [
            "RESPIRATORY DEPRESSION risk — have naloxone available at bedside.",
            "Contraindicated in: respiratory depression, increased ICP, severe asthma.",
            "Use extreme caution in renal/hepatic impairment.",
            "Monitor O2 saturation, RR, and level of consciousness.",
        ],
    },
    "ibuprofen": {
        "aliases": ["advil", "nurofen", "brufen"],
        "adult_flat_mg": (200, 600),
        "adult_max_daily_mg": 2400,
        "pediatric_mg_per_kg": (5, 10),
        "pediatric_max_daily_mg_per_kg": 40,
        "overdose_threshold_adult_mg": 3000,
        "antidote": "Supportive care; activated charcoal if ingested within 1h",
        "warnings": [
            "Contraindicated in: active GI bleed, renal failure, pregnancy (3rd trimester).",
            "Increases GI bleed risk — use with PPI if prolonged therapy.",
            "Avoid in patients with cardiovascular disease.",
        ],
    },
    "amoxicillin": {
        "aliases": ["amoxil", "trimox"],
        "adult_flat_mg": (250, 500),
        "adult_max_daily_mg": 3000,
        "pediatric_mg_per_kg": (20, 40),
        "overdose_threshold_adult_mg": 5000,
        "antidote": "Supportive — crystalluria management with hydration",
        "warnings": [
            "Check penicillin allergy before administration.",
            "Cross-reactivity with cephalosporins (~1–2%).",
            "Dose adjust in renal impairment (CrCl <30).",
        ],
    },
    "insulin": {
        "aliases": ["insulin regular", "novolog", "humalog", "lantus", "glargine"],
        "adult_flat_units": "Individualized — ALWAYS per physician order",
        "warnings": [
            "ALWAYS perform double-check with second licensed nurse.",
            "Use U-100 syringes only — avoid concentration errors.",
            "Monitor blood glucose 30–60 min post-administration.",
            "HYPOGLYCEMIA ALERT: If glucose <70 mg/dL → 15 g fast-acting carbs or D50W IV.",
            "Never mix long-acting insulin without physician order.",
        ],
        "overdose_threshold_adult_mg": None,
        "antidote": "Dextrose 50% (D50W) IV for severe hypoglycemia; glucagon 1 mg IM/SC if IV access unavailable",
    },
    "metformin": {
        "aliases": ["glucophage"],
        "adult_flat_mg": (500, 1000),
        "adult_max_daily_mg": 3000,
        "overdose_threshold_adult_mg": 5000,
        "antidote": "Haemodialysis for severe lactic acidosis",
        "warnings": [
            "Contraindicated in: eGFR <30, active hepatic disease, contrast dye procedures (hold 48h).",
            "Lactic acidosis risk — rare but fatal.",
            "Hold 24–48h before any iodinated contrast study.",
        ],
    },
}


def _find_drug(query: str) -> Optional[tuple]:
    """Return (drug_name, drug_data) or None."""
    q = query.lower()
    for drug_name, data in DRUG_DB.items():
        if drug_name in q:
            return drug_name, data
        for alias in data.get("aliases", []):
            if alias in q:
                return drug_name, data
    return None


def extract_weight(query: str) -> Optional[float]:
    """Extract patient weight in kg from query string."""
    patterns = [
        r"(\d+(?:\.\d+)?)\s*kg",
        r"weight\s+(?:of\s+)?(\d+(?:\.\d+)?)",
        r"(?:weighs?|wt)[:\s]+(\d+(?:\.\d+)?)",
        r"(?:وزن[:\s]+)(\d+(?:\.\d+)?)",
    ]
    for pat in patterns:
        m = re.search(pat, query, re.IGNORECASE)
        if m:
            return float(m.group(1))
    return None


def calculate_dose(query: str, weight_kg: Optional[float] = None) -> Optional[DrugDoseResult]:
    """
    Returns DrugDoseResult if a known drug is detected, else None.
    """
    found = _find_drug(query)
    if not found:
        return None

    drug_name, data = found
    weight = weight_kg or extract_weight(query)
    warnings: List[str] = data.get("warnings", [])

    # Special case: insulin — no mg/kg calculation
    if drug_name == "insulin":
        return DrugDoseResult(
            drug_name="Insulin",
            patient_weight_kg=weight,
            calculated_dose="Per physician order — individualized",
            safe_range=data.get("adult_flat_units", "Per physician order"),
            overdose_threshold=None,
            warnings=warnings,
        )

    # Adult flat dose range
    adult_min, adult_max = data.get("adult_flat_mg", (None, None))
    safe_range = f"{adult_min}–{adult_max} mg per dose"
    if "route" in data:
        safe_range += f" ({data['route']})"
    if "adult_max_daily_mg" in data:
        safe_range += f"; max {data['adult_max_daily_mg']} mg/day"

    # Calculated dose
    calculated_dose = None
    if weight and "pediatric_mg_per_kg" in data:
        lo, hi = data["pediatric_mg_per_kg"]
        calc_lo = round(lo * weight, 1)
        calc_hi = round(hi * weight, 1)
        calculated_dose = f"{calc_lo}–{calc_hi} mg/dose (based on {lo}–{hi} mg/kg × {weight} kg)"
    elif adult_min and adult_max:
        calculated_dose = f"{adult_min}–{adult_max} mg (standard adult dose)"

    # Overdose threshold
    overdose = data.get("overdose_threshold_adult_mg")
    overdose_str = None
    if overdose:
        overdose_str = f">{overdose} mg total — administer antidote: {data.get('antidote', 'supportive care')}"

    return DrugDoseResult(
        drug_name=drug_name.title(),
        patient_weight_kg=weight,
        calculated_dose=calculated_dose,
        safe_range=safe_range,
        overdose_threshold=overdose_str,
        warnings=warnings,
    )
