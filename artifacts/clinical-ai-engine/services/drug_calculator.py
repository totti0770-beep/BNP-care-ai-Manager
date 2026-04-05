"""
Drug Calculation Module + SafetyEngine
Computes safe dose ranges for common clinical drugs.
Checks contraindications, drug-drug interactions, high-risk flags, and overdose hard blocks.
Returns structured output including warnings.
"""
import re
from typing import Optional, List, Tuple
from models.schemas import DrugDoseResult

# Drug database — extended with contraindications, interactions, high_risk flag
DRUG_DB: dict = {
    "paracetamol": {
        "aliases": ["acetaminophen", "tylenol", "calpol"],
        "dose_per_kg": 15,
        "adult_flat_mg": (500, 1000),
        "adult_max_daily_mg": 4000,
        "adult_max_daily_elderly_mg": 3000,
        "pediatric_mg_per_kg": (10, 15),
        "pediatric_max_doses_per_day": 5,
        "overdose_threshold_adult_mg": 7500,
        "frequency": "q6h",
        "antidote": "N-Acetylcysteine (NAC) — initiate immediately if >150 mg/kg or per Rumack-Matthew nomogram",
        "contraindications": ["severe liver disease", "hepatic impairment", "alcohol use disorder"],
        "interactions": ["warfarin", "isoniazid", "rifampicin", "carbamazepine"],
        "high_risk": False,
        "warnings": [
            "Hepatotoxicity risk with doses above therapeutic range.",
            "Reduce maximum dose to 3 g/day in hepatic impairment or chronic alcohol use.",
            "Monitor LFTs in prolonged therapy.",
        ],
    },
    "heparin": {
        "aliases": ["unfractionated heparin", "uuh", "hep"],
        "dose_per_kg": 0.7,
        "adult_flat_mg": None,
        "adult_max_dose_mg": 350,
        "adult_max_daily_mg": 5000,
        "overdose_threshold_adult_mg": 10000,
        "frequency": "q8-12h",
        "antidote": "Protamine sulfate 1 mg per 100 units heparin (max 50 mg IV slowly)",
        "contraindications": ["active bleeding", "severe thrombocytopenia", "heparin-induced thrombocytopenia", "intracranial hemorrhage"],
        "interactions": ["warfarin", "aspirin", "clopidogrel", "NSAIDs", "thrombolytics"],
        "high_risk": True,
        "warnings": [
            "🔴 HIGH RISK MEDICATION — requires double-check by two licensed nurses.",
            "Monitor aPTT every 6h during infusion.",
            "Watch for heparin-induced thrombocytopenia (HIT) — check platelets every 2–3 days.",
            "Antidote: Protamine sulfate — have available at bedside.",
        ],
    },
    "morphine": {
        "aliases": ["morphine sulfate", "ms contin"],
        "dose_per_kg": 0.1,
        "adult_flat_mg": (2, 4),
        "route": "IV/SC every 3–4 h (titrate to pain response)",
        "adult_max_daily_mg": 120,
        "pediatric_mg_per_kg": (0.05, 0.1),
        "overdose_threshold_adult_mg": 200,
        "frequency": "q3-4h",
        "antidote": "Naloxone 0.4–2 mg IV (repeat every 2–3 min as needed)",
        "contraindications": ["respiratory depression", "increased intracranial pressure", "severe asthma", "paralytic ileus"],
        "interactions": ["benzodiazepines", "alcohol", "MAO inhibitors", "CNS depressants", "gabapentin"],
        "high_risk": True,
        "warnings": [
            "🔴 HIGH RISK MEDICATION — RESPIRATORY DEPRESSION risk.",
            "Have naloxone available at bedside at all times.",
            "Contraindicated in: respiratory depression, increased ICP, severe asthma.",
            "Use extreme caution in renal/hepatic impairment.",
            "Monitor O2 saturation, RR, and level of consciousness.",
        ],
    },
    "ibuprofen": {
        "aliases": ["advil", "nurofen", "brufen"],
        "dose_per_kg": 10,
        "adult_flat_mg": (200, 600),
        "adult_max_daily_mg": 2400,
        "pediatric_mg_per_kg": (5, 10),
        "pediatric_max_daily_mg_per_kg": 40,
        "overdose_threshold_adult_mg": 3000,
        "frequency": "q6-8h",
        "antidote": "Supportive care; activated charcoal if ingested within 1h",
        "contraindications": ["active GI bleed", "renal failure", "pregnancy third trimester", "aspirin allergy", "severe heart failure"],
        "interactions": ["warfarin", "lithium", "methotrexate", "ACE inhibitors", "aspirin"],
        "high_risk": False,
        "warnings": [
            "Contraindicated in: active GI bleed, renal failure, pregnancy (3rd trimester).",
            "Increases GI bleed risk — use with PPI if prolonged therapy.",
            "Avoid in patients with cardiovascular disease.",
        ],
    },
    "amoxicillin": {
        "aliases": ["amoxil", "trimox"],
        "dose_per_kg": 25,
        "adult_flat_mg": (250, 500),
        "adult_max_daily_mg": 3000,
        "pediatric_mg_per_kg": (20, 40),
        "overdose_threshold_adult_mg": 5000,
        "frequency": "q8h",
        "antidote": "Supportive — crystalluria management with hydration",
        "contraindications": ["penicillin allergy", "mononucleosis", "severe renal impairment"],
        "interactions": ["warfarin", "methotrexate", "allopurinol", "oral contraceptives"],
        "high_risk": False,
        "warnings": [
            "Check penicillin allergy before administration.",
            "Cross-reactivity with cephalosporins (~1–2%).",
            "Dose adjust in renal impairment (CrCl <30).",
        ],
    },
    "insulin": {
        "aliases": ["insulin regular", "novolog", "humalog", "lantus", "glargine"],
        "adult_flat_units": "Individualized — ALWAYS per physician order",
        "frequency": "per sliding scale or physician order",
        "antidote": "Dextrose 50% (D50W) IV for severe hypoglycemia; glucagon 1 mg IM/SC if IV access unavailable",
        "contraindications": ["hypoglycemia"],
        "interactions": ["beta blockers", "corticosteroids", "thiazide diuretics", "alcohol"],
        "high_risk": True,
        "warnings": [
            "🔴 HIGH RISK MEDICATION — ALWAYS perform double-check with second licensed nurse.",
            "Use U-100 syringes only — avoid concentration errors.",
            "Monitor blood glucose 30–60 min post-administration.",
            "HYPOGLYCEMIA ALERT: If glucose <70 mg/dL → 15 g fast-acting carbs or D50W IV.",
            "Never mix long-acting insulin without physician order.",
        ],
        "overdose_threshold_adult_mg": None,
        "dose_per_kg": None,
    },
    "metformin": {
        "aliases": ["glucophage"],
        "dose_per_kg": None,
        "adult_flat_mg": (500, 1000),
        "adult_max_daily_mg": 3000,
        "overdose_threshold_adult_mg": 5000,
        "frequency": "q12h with food",
        "antidote": "Haemodialysis for severe lactic acidosis",
        "contraindications": ["eGFR less than 30", "active hepatic disease", "contrast dye procedure", "metabolic acidosis", "heart failure"],
        "interactions": ["alcohol", "iodinated contrast", "cimetidine", "furosemide"],
        "high_risk": False,
        "warnings": [
            "Contraindicated in: eGFR <30, active hepatic disease, contrast dye procedures (hold 48h).",
            "Lactic acidosis risk — rare but fatal.",
            "Hold 24–48h before any iodinated contrast study.",
        ],
    },
    "warfarin": {
        "aliases": ["coumadin"],
        "dose_per_kg": None,
        "adult_flat_mg": None,
        "adult_max_daily_mg": 10,
        "overdose_threshold_adult_mg": 20,
        "frequency": "once daily — individualized per INR",
        "antidote": "Vitamin K (phytomenadione) + Fresh Frozen Plasma for major bleeding",
        "contraindications": ["active bleeding", "pregnancy", "recent neurosurgery", "severe hypertension"],
        "interactions": ["aspirin", "NSAIDs", "amoxicillin", "metronidazole", "fluconazole", "heparin", "statins", "alcohol"],
        "high_risk": True,
        "warnings": [
            "🔴 HIGH RISK MEDICATION — Narrow therapeutic index.",
            "Monitor INR regularly (target 2.0–3.0 for most indications).",
            "Numerous drug and food interactions — counsel patient on consistent vitamin K intake.",
            "Bleeding risk: monitor for signs of haemorrhage.",
        ],
    },
    "vancomycin": {
        "aliases": ["vancocin", "vanco"],
        "dose_per_kg": 15,
        "adult_flat_mg": (500, 1000),
        "adult_max_dose_mg": 3000,
        "adult_max_daily_mg": 4500,
        "overdose_threshold_adult_mg": 6000,
        "frequency": "q6-12h (adjusted per renal function and levels)",
        "antidote": "Supportive care; haemodialysis for severe overdose",
        "contraindications": ["vancomycin allergy", "severe hearing impairment"],
        "interactions": ["aminoglycosides", "furosemide", "amphotericin B", "ciclosporin", "NSAIDs"],
        "high_risk": True,
        "warnings": [
            "🔴 HIGH RISK MEDICATION — Nephrotoxic and ototoxic.",
            "Monitor renal function (SCr, BUN) at baseline and every 48–72h.",
            "Therapeutic drug monitoring required: target trough 10–20 mg/L (or AUC/MIC 400–600).",
            "Infuse over ≥60 min to avoid Red Man Syndrome (flushing, hypotension).",
            "Dose-adjust in renal impairment — use vancomycin nomogram.",
            "Audiometry monitoring if prolonged therapy.",
        ],
    },
    "gentamicin": {
        "aliases": ["garamycin"],
        "dose_per_kg": 1.5,
        "adult_flat_mg": None,
        "adult_max_dose_mg": 160,
        "adult_max_daily_mg": 480,
        "overdose_threshold_adult_mg": 640,
        "frequency": "q8h (or once-daily extended-interval dosing)",
        "antidote": "Supportive; haemodialysis for severe toxicity",
        "contraindications": ["aminoglycoside allergy", "myasthenia gravis", "severe renal failure"],
        "interactions": ["vancomycin", "furosemide", "amphotericin B", "ciclosporin", "neuromuscular blockers"],
        "high_risk": True,
        "warnings": [
            "🔴 HIGH RISK MEDICATION — Nephrotoxic and ototoxic aminoglycoside.",
            "Monitor serum levels: peak 5–10 mg/L, trough <2 mg/L (traditional dosing).",
            "Check renal function before each dose; avoid in severe renal impairment.",
            "Monitor for vestibular and auditory toxicity.",
            "Avoid concurrent nephrotoxic agents.",
        ],
    },
    "furosemide": {
        "aliases": ["lasix", "frusemide"],
        "dose_per_kg": 0.5,
        "adult_flat_mg": (20, 80),
        "adult_max_daily_mg": 600,
        "overdose_threshold_adult_mg": 1000,
        "frequency": "q6-24h (titrated to response)",
        "antidote": "Fluid replacement; electrolyte correction",
        "contraindications": ["anuria", "sulfonamide allergy", "severe electrolyte depletion", "hepatic coma"],
        "interactions": ["gentamicin", "vancomycin", "digoxin", "lithium", "NSAIDs", "ACE inhibitors"],
        "high_risk": False,
        "warnings": [
            "Monitor electrolytes (K+, Na+, Mg2+) regularly — hypokalemia risk.",
            "Assess fluid status and urine output before and after administration.",
            "Risk of ototoxicity with high doses — avoid concurrent aminoglycosides.",
            "Monitor blood pressure for hypotension.",
            "Hold if urine output <30 mL/h — report to physician.",
        ],
    },
    "digoxin": {
        "aliases": ["lanoxin"],
        "dose_per_kg": None,
        "adult_flat_mg": None,
        "adult_max_daily_mg": 0.25,
        "overdose_threshold_adult_mg": 0.5,
        "frequency": "once daily (individualized by levels)",
        "antidote": "Digoxin-specific antibody fragments (DigiFab) for toxicity",
        "contraindications": ["ventricular fibrillation", "hypertrophic obstructive cardiomyopathy", "Wolff-Parkinson-White syndrome", "hypokalaemia"],
        "interactions": ["amiodarone", "verapamil", "diltiazem", "quinidine", "furosemide", "spironolactone"],
        "high_risk": True,
        "warnings": [
            "🔴 HIGH RISK MEDICATION — Narrow therapeutic index (target 0.5–2.0 ng/mL).",
            "Check apical pulse for 1 full minute before administration — hold if <60 bpm.",
            "Monitor serum digoxin levels, K+, Mg2+ regularly.",
            "Signs of toxicity: nausea, vomiting, visual disturbances (yellow/green halos), bradycardia.",
            "Dose-reduce significantly in renal impairment.",
            "Antidote: DigiFab — available in resuscitation trolley.",
        ],
    },
    "enoxaparin": {
        "aliases": ["clexane", "lovenox", "lmwh"],
        "dose_per_kg": 1.0,
        "adult_flat_mg": None,
        "adult_max_daily_mg": 180,
        "overdose_threshold_adult_mg": 2,  # per kg
        "frequency": "q12h (prophylaxis: once daily)",
        "antidote": "Protamine sulfate (partial reversal — 60% of anti-Xa activity)",
        "contraindications": ["active major bleeding", "heparin-induced thrombocytopenia", "severe renal failure (CrCl <15)", "prosthetic heart valve"],
        "interactions": ["warfarin", "aspirin", "NSAIDs", "thrombolytics", "clopidogrel"],
        "high_risk": True,
        "warnings": [
            "🔴 HIGH RISK MEDICATION — Low Molecular Weight Heparin.",
            "Dose-adjust in renal impairment (CrCl <30 — use UFH instead).",
            "Anti-Xa monitoring for obese patients (BMI >40) or renal impairment.",
            "Do not administer IM — subcutaneous injection only.",
            "Monitor platelet count — risk of HIT (lower than UFH).",
            "Hold 12–24h before neuraxial anaesthesia.",
        ],
    },
    "metoprolol": {
        "aliases": ["lopressor", "toprol", "betaloc"],
        "dose_per_kg": None,
        "adult_flat_mg": (25, 100),
        "adult_max_daily_mg": 400,
        "overdose_threshold_adult_mg": 1000,
        "frequency": "q12-24h (IR: q6-12h)",
        "antidote": "Atropine for bradycardia; glucagon 5–10 mg IV for haemodynamic instability",
        "contraindications": ["cardiogenic shock", "severe bradycardia", "sick sinus syndrome", "severe asthma", "second/third degree AV block"],
        "interactions": ["verapamil", "diltiazem", "digoxin", "clonidine", "insulin", "NSAIDs"],
        "high_risk": False,
        "warnings": [
            "Do NOT abruptly discontinue — taper dose over 1–2 weeks (risk of rebound hypertension/angina).",
            "Monitor heart rate and blood pressure before each dose — hold if HR <50 bpm or SBP <90 mmHg.",
            "Use with caution in asthma/COPD — may worsen bronchospasm.",
            "Masks signs of hypoglycaemia in diabetic patients.",
        ],
    },
    "omeprazole": {
        "aliases": ["losec", "prilosec"],
        "dose_per_kg": None,
        "adult_flat_mg": (20, 40),
        "adult_max_daily_mg": 120,
        "overdose_threshold_adult_mg": 360,
        "frequency": "once daily (before meals)",
        "antidote": "Supportive care",
        "contraindications": ["hypersensitivity to PPIs"],
        "interactions": ["clopidogrel", "methotrexate", "warfarin", "atazanavir", "iron salts"],
        "high_risk": False,
        "warnings": [
            "Take 30–60 minutes before first meal of the day for maximum efficacy.",
            "Long-term use (>1 year): monitor for hypomagnesaemia, B12 deficiency, bone density.",
            "Reduces clopidogrel effectiveness — avoid combination if possible.",
            "Increased risk of C. difficile infection with prolonged use.",
        ],
    },
    "amiodarone": {
        "aliases": ["cordarone", "pacerone"],
        "dose_per_kg": None,
        "adult_flat_mg": (100, 200),
        "adult_max_daily_mg": 400,
        "overdose_threshold_adult_mg": 800,
        "frequency": "once daily (maintenance); loading doses per protocol",
        "antidote": "Supportive care; ICD for VF unresponsive to therapy",
        "contraindications": ["severe sinus node dysfunction", "second/third degree AV block", "iodine allergy", "thyroid disorders", "pregnancy"],
        "interactions": ["warfarin", "digoxin", "statins", "ciclosporin", "quinolones", "beta blockers"],
        "high_risk": True,
        "warnings": [
            "🔴 HIGH RISK MEDICATION — Multiple serious toxicities.",
            "Monitor thyroid function (TFTs) every 6 months — both hypo and hyperthyroidism possible.",
            "Monitor LFTs and pulmonary function — risk of hepatotoxicity and pulmonary toxicity.",
            "Eye examinations required annually — corneal microdeposits and optic neuropathy.",
            "Photosensitivity — counsel patient to use sunscreen.",
            "Extremely long half-life (40–55 days) — effects persist long after discontinuation.",
        ],
    },
    "ceftriaxone": {
        "aliases": ["rocephin"],
        "dose_per_kg": 50,
        "adult_flat_mg": (1000, 2000),
        "adult_max_daily_mg": 4000,
        "overdose_threshold_adult_mg": 8000,
        "frequency": "once daily (q12h for severe infections)",
        "antidote": "Supportive care",
        "contraindications": ["cephalosporin allergy", "penicillin allergy (cross-reactivity ~1–2%)", "neonates with hyperbilirubinaemia", "IV calcium co-administration in neonates"],
        "interactions": ["warfarin", "calcium-containing IV solutions", "aminoglycosides"],
        "high_risk": False,
        "warnings": [
            "Do NOT co-administer with calcium-containing IV solutions (risk of precipitation — fatal in neonates).",
            "Check penicillin allergy history — cross-reactivity possible.",
            "Reconstitute with appropriate diluent — NOT calcium-containing solutions.",
            "Biliary sludge possible with prolonged use.",
        ],
    },
}


class SafetyEngine:
    """
    Rule-based medication safety checks.
    Validates overdose limits, patient contraindications, and drug-drug interactions.
    """

    @staticmethod
    def calculate_dose_kg(drug: str, weight: float) -> Tuple[Optional[float], List[str]]:
        """Calculate dose by weight and return alerts if overdose detected."""
        if drug not in DRUG_DB:
            return None, []
        d = DRUG_DB[drug]
        dose_per_kg = d.get("dose_per_kg")
        if not dose_per_kg or not weight:
            return None, []
        dose = round(dose_per_kg * weight, 1)
        alerts = []
        # Check single-dose maximum first, then fall back to daily max
        max_single = d.get("adult_max_dose_mg")
        max_daily = d.get("adult_max_daily_mg")
        if max_single and dose > max_single:
            alerts.append(
                f"🚨 OVERDOSE: Calculated {dose} mg exceeds maximum single dose of {max_single} mg"
            )
        elif max_daily and dose > max_daily:
            alerts.append(
                f"🚨 OVERDOSE: Calculated {dose} mg exceeds maximum daily dose of {max_daily} mg"
            )
        return dose, alerts

    @staticmethod
    def check_contraindications(drug: str, conditions: List[str]) -> List[str]:
        """Return alerts for any patient condition matching drug contraindications."""
        alerts = []
        if drug not in DRUG_DB or not conditions:
            return alerts
        drug_contras = [c.lower() for c in DRUG_DB[drug].get("contraindications", [])]
        for condition in conditions:
            c_lower = condition.lower()
            for contra in drug_contras:
                if c_lower in contra or contra in c_lower:
                    alerts.append(f"⚠️ Contraindication: Patient has '{condition}' — use of {drug.title()} is contraindicated")
                    break
        return alerts

    @staticmethod
    def check_interactions(drug: str, other_drugs: List[str]) -> List[str]:
        """Return alerts for drug-drug interactions."""
        alerts = []
        if drug not in DRUG_DB or not other_drugs:
            return alerts
        known_interactions = [i.lower() for i in DRUG_DB[drug].get("interactions", [])]
        for other in other_drugs:
            if other.lower() in known_interactions:
                alerts.append(f"⚠️ Drug Interaction: {drug.title()} interacts with {other.title()}")
        return alerts

    @staticmethod
    def high_risk_flag(drug: str) -> List[str]:
        """Return a high-risk flag if the drug is a high-alert medication."""
        if drug in DRUG_DB and DRUG_DB[drug].get("high_risk"):
            return [f"🔴 High Risk Medication: {drug.title()} — requires double-check protocol"]
        return []

    @staticmethod
    def get_nursing_notes(drug: str, has_interactions: bool) -> List[str]:
        """Return standard nursing administration notes."""
        notes = [
            "Verify patient identity using two identifiers before administration.",
            "Double-check dosage, route, and rate against physician order.",
        ]
        if drug in DRUG_DB and DRUG_DB[drug].get("high_risk"):
            notes.insert(0, "🔴 Obtain independent double-check from second licensed nurse before administration.")
        if has_interactions:
            notes.append("Review all concurrent medications for interactions before administering.")
        notes.append(f"Administer at prescribed frequency: {DRUG_DB.get(drug, {}).get('frequency', 'per physician order')}.")
        notes.append("Document administration in medication record immediately after giving.")
        return notes

    @staticmethod
    def get_contraindications_list(drug: str) -> List[str]:
        return DRUG_DB.get(drug, {}).get("contraindications", [])

    @staticmethod
    def get_interactions_list(drug: str) -> List[str]:
        return DRUG_DB.get(drug, {}).get("interactions", [])


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

    # Adult flat dose range — guard against explicit None values in DRUG_DB
    flat_mg = data.get("adult_flat_mg")
    adult_min, adult_max = flat_mg if isinstance(flat_mg, tuple) else (None, None)

    if adult_min is not None and adult_max is not None:
        safe_range = f"{adult_min}–{adult_max} mg per dose"
    elif data.get("dose_per_kg") and weight:
        dpk = data["dose_per_kg"]
        safe_range = f"{round(dpk * weight, 1)} mg/dose (based on {dpk} mg/kg × {weight} kg)"
    else:
        safe_range = "Dose per physician order"
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
    elif weight and data.get("dose_per_kg"):
        dpk = data["dose_per_kg"]
        calculated_dose = f"{round(dpk * weight, 1)} mg/dose (based on {dpk} mg/kg × {weight} kg)"
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
