"""
Drug Calculation Module + SafetyEngine
Computes safe dose ranges for common clinical drugs.
Checks contraindications, drug-drug interactions, high-risk flags, and overdose hard blocks.
Returns structured output including warnings.

SAFETY CONTRACT — read before editing DRUG_DB:

  * `unit` is mandatory and is the unit the numeric fields are expressed in.
    Never mix mg and units within an entry. Drugs dosed in international units
    (heparin, insulin) must set `auto_calculate: False`; this module will not
    compute a number for them.
  * `pediatric_mg_per_kg` is only ever applied when an explicit age below
    PEDIATRIC_AGE_LIMIT is supplied. Weight alone never selects a pediatric
    range — an adult and a child can weigh the same.
  * `overdose_threshold_mg_per_kg` is weight-scaled; `overdose_threshold_adult_mg`
    is an absolute total. An entry must not use the former's value in the
    latter's field.
  * Every entry carries provenance. Entries marked UNVERIFIED have not been
    signed off by a pharmacist and are surfaced to the user as such.
"""
import re
from typing import Optional, List, Tuple
from models.schemas import DrugDoseResult

# Bumped whenever a dose value changes, and recorded on every audit-log row so a
# past recommendation can be reproduced.
DRUG_DB_VERSION = "2026-08-14.1"

# Entries have not been reviewed by a licensed pharmacist. Until they are, the
# API reports this to callers, which display it alongside any dose.
DRUG_DB_REVIEW_STATUS = "UNVERIFIED — pending pharmacist review"

# Below this age the pediatric range applies, and only when age is known.
PEDIATRIC_AGE_LIMIT = 18

# Drug database — extended with contraindications, interactions, high_risk flag
DRUG_DB: dict = {
    "paracetamol": {
        "aliases": ["acetaminophen", "tylenol", "calpol"],
        "unit": "mg",
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
        "aliases": ["unfractionated heparin", "ufh", "hep"],
        # Heparin is dosed in international units, not milligrams, and the
        # regimen differs by indication (prophylaxis vs weight-based infusion
        # with aPTT titration). This module does not compute a number for it.
        "unit": "unit",
        "auto_calculate": False,
        "dose_per_kg": None,
        "adult_flat_mg": None,
        "reference_regimen": (
            "Prophylaxis: 5000 units SC q8–12h. "
            "Therapeutic: weight-based IV bolus and infusion per institutional "
            "protocol, titrated to aPTT. Confirm against the physician order."
        ),
        "frequency": "q8-12h (prophylaxis) or continuous infusion",
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
        "unit": "mg",
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
        "unit": "mg",
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
        "unit": "mg",
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
        "unit": "unit",
        "auto_calculate": False,
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
        "unit": "mg",
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
        "unit": "mg",
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
        "unit": "mg",
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
        "unit": "mg",
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
        "unit": "mg",
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
        "unit": "mg",
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
        "unit": "mg",
        "dose_per_kg": 1.0,
        "adult_flat_mg": None,
        "adult_max_daily_mg": 180,
        # Weight-scaled, not an absolute total: 2 mg/kg/day. Previously stored in
        # the absolute-total field, which reported a normal 70 mg dose as a 35x
        # overdose requiring protamine.
        "overdose_threshold_mg_per_kg": 2,
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
        "unit": "mg",
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
        "unit": "mg",
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
        "unit": "mg",
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
        "unit": "mg",
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


_STOPWORDS = {"a", "an", "the", "of", "in", "with", "and", "or", "to"}


def _tokenize(text: str) -> frozenset:
    """Lowercase word set for clinical-phrase comparison, minus filler words."""
    words = re.findall(r"[a-z0-9]+", text.lower())
    return frozenset(w for w in words if w not in _STOPWORDS)


def is_covered(drug: str) -> bool:
    """Whether the safety database has an entry for this drug at all."""
    return drug in DRUG_DB


class SafetyEngine:
    """
    Rule-based medication safety checks.
    Validates overdose limits, patient contraindications, and drug-drug interactions.
    """

    @staticmethod
    def calculate_dose_kg(drug: str, weight: float) -> Tuple[Optional[float], List[str]]:
        """
        Calculate a weight-based dose and return alerts if it exceeds a maximum.

        Returns (None, []) for drugs that must not be auto-calculated, so callers
        never present a computed number for a unit-dosed medication.
        """
        if drug not in DRUG_DB:
            return None, []
        d = DRUG_DB[drug]
        if d.get("auto_calculate") is False:
            return None, []

        dose_per_kg = d.get("dose_per_kg")
        if not dose_per_kg or not weight:
            return None, []

        unit = d.get("unit", "mg")
        dose = round(dose_per_kg * weight, 1)
        alerts = []

        # Weight-scaled ceiling, where the entry defines one.
        per_kg_max = d.get("overdose_threshold_mg_per_kg")
        if per_kg_max:
            scaled = round(per_kg_max * weight, 1)
            if dose > scaled:
                alerts.append(
                    f"🚨 OVERDOSE: Calculated {dose} {unit} exceeds "
                    f"{per_kg_max} {unit}/kg ({scaled} {unit} for {weight} kg)"
                )
                return dose, alerts

        # Absolute single-dose maximum first, then the daily maximum.
        max_single = d.get("adult_max_dose_mg")
        max_daily = d.get("adult_max_daily_mg")
        if max_single and dose > max_single:
            alerts.append(
                f"🚨 OVERDOSE: Calculated {dose} {unit} exceeds maximum single dose of {max_single} {unit}"
            )
        elif max_daily and dose > max_daily:
            alerts.append(
                f"🚨 OVERDOSE: Calculated {dose} {unit} exceeds maximum daily dose of {max_daily} {unit}"
            )
        return dose, alerts

    @staticmethod
    def check_contraindications(drug: str, conditions: List[str]) -> List[str]:
        """
        Return alerts for any patient condition matching a drug contraindication.

        Matching is on whole words rather than raw substrings: the previous
        bidirectional `in` test matched any condition that happened to be a
        substring of a contraindication (and vice versa), producing both false
        alarms and silent misses.
        """
        alerts = []
        if drug not in DRUG_DB or not conditions:
            return alerts

        for condition in conditions:
            condition_tokens = _tokenize(condition)
            if not condition_tokens:
                continue
            for contra in DRUG_DB[drug].get("contraindications", []):
                contra_tokens = _tokenize(contra)
                if not contra_tokens:
                    continue
                # One is a phrase contained in the other, token-wise.
                if condition_tokens <= contra_tokens or contra_tokens <= condition_tokens:
                    alerts.append(
                        f"⚠️ Contraindication: Patient has '{condition}' — "
                        f"use of {drug.title()} is contraindicated ({contra})"
                    )
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


def _mentions(text: str, term: str) -> bool:
    """Whole-word (or whole-phrase) match, so 'hep' does not match 'hepatic'."""
    return re.search(rf"\b{re.escape(term)}\b", text) is not None


def _find_drug(query: str) -> Optional[tuple]:
    """Return (drug_name, drug_data) or None."""
    q = query.lower()
    for drug_name, data in DRUG_DB.items():
        if _mentions(q, drug_name):
            return drug_name, data
        for alias in data.get("aliases", []):
            if _mentions(q, alias):
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


def extract_age(query: str) -> Optional[int]:
    """Extract patient age in years from a query string, if stated."""
    patterns = [
        r"(\d{1,3})\s*(?:-|\s)?\s*year[s]?[\s-]*old",
        r"\bage[d]?[:\s]+(\d{1,3})\b",
        r"(?:عمر[هها]?|السن)[:\s]+(\d{1,3})",
    ]
    for pat in patterns:
        m = re.search(pat, query, re.IGNORECASE)
        if m:
            age = int(m.group(1))
            if 0 <= age <= 120:
                return age
    return None


def calculate_dose(
    query: str,
    weight_kg: Optional[float] = None,
    age_years: Optional[int] = None,
) -> Optional[DrugDoseResult]:
    """
    Returns DrugDoseResult if a known drug is detected, else None.

    The pediatric range is used only when an age below PEDIATRIC_AGE_LIMIT is
    explicitly known. Weight alone never selects it: previously any query with a
    weight took the pediatric branch, so a 70 kg adult asking about morphine was
    given the pediatric 0.05–0.1 mg/kg range (3.5–7 mg) instead of the adult
    2–4 mg in the same record.
    """
    found = _find_drug(query)
    if not found:
        return None

    drug_name, data = found
    weight = weight_kg or extract_weight(query)
    age = age_years if age_years is not None else extract_age(query)
    unit = data.get("unit", "mg")
    warnings: List[str] = list(data.get("warnings", []))

    # Drugs dosed in international units, or otherwise protocol-driven, are
    # never computed here.
    if data.get("auto_calculate") is False:
        reference = data.get("reference_regimen") or data.get(
            "adult_flat_units", "Per physician order"
        )
        return DrugDoseResult(
            drug_name=drug_name.title(),
            patient_weight_kg=weight,
            calculated_dose=f"Not calculated — {drug_name} is dosed in {unit}s per protocol",
            safe_range=reference,
            overdose_threshold=None,
            warnings=warnings,
        )

    is_pediatric = age is not None and age < PEDIATRIC_AGE_LIMIT
    pediatric_range = data.get("pediatric_mg_per_kg")

    if age is None and weight:
        warnings = warnings + [
            "Age was not provided — the ADULT dose range is shown. "
            "Supply the patient age for a pediatric calculation."
        ]

    # Adult flat dose range — guard against explicit None values in DRUG_DB
    flat_mg = data.get("adult_flat_mg")
    adult_min, adult_max = flat_mg if isinstance(flat_mg, tuple) else (None, None)

    if is_pediatric and pediatric_range and weight:
        lo, hi = pediatric_range
        safe_range = f"{lo}–{hi} {unit}/kg per dose (pediatric)"
    elif adult_min is not None and adult_max is not None:
        safe_range = f"{adult_min}–{adult_max} {unit} per dose (adult)"
    elif data.get("dose_per_kg") and weight:
        dpk = data["dose_per_kg"]
        safe_range = (
            f"{round(dpk * weight, 1)} {unit}/dose "
            f"(based on {dpk} {unit}/kg × {weight} kg, adult)"
        )
    else:
        safe_range = "Dose per physician order"
    if "route" in data:
        safe_range += f" ({data['route']})"
    if "adult_max_daily_mg" in data:
        safe_range += f"; max {data['adult_max_daily_mg']} {unit}/day"

    # Calculated dose
    calculated_dose = None
    if is_pediatric and pediatric_range and weight:
        lo, hi = pediatric_range
        calculated_dose = (
            f"{round(lo * weight, 1)}–{round(hi * weight, 1)} {unit}/dose "
            f"(pediatric {lo}–{hi} {unit}/kg × {weight} kg, age {age})"
        )
    elif weight and data.get("dose_per_kg"):
        dpk = data["dose_per_kg"]
        calculated_dose = (
            f"{round(dpk * weight, 1)} {unit}/dose "
            f"(adult {dpk} {unit}/kg × {weight} kg)"
        )
    elif adult_min and adult_max:
        calculated_dose = f"{adult_min}–{adult_max} {unit} (standard adult dose)"

    # Overdose threshold — absolute, or weight-scaled where the entry says so.
    overdose_str = None
    antidote = data.get("antidote", "supportive care")
    per_kg_max = data.get("overdose_threshold_mg_per_kg")
    absolute_max = data.get("overdose_threshold_adult_mg")

    if per_kg_max and weight:
        overdose_str = (
            f">{round(per_kg_max * weight, 1)} {unit} total "
            f"({per_kg_max} {unit}/kg × {weight} kg) — administer antidote: {antidote}"
        )
    elif per_kg_max:
        overdose_str = f">{per_kg_max} {unit}/kg — administer antidote: {antidote}"
    elif absolute_max:
        overdose_str = f">{absolute_max} {unit} total — administer antidote: {antidote}"

    return DrugDoseResult(
        drug_name=drug_name.title(),
        patient_weight_kg=weight,
        calculated_dose=calculated_dose,
        safe_range=safe_range,
        overdose_threshold=overdose_str,
        warnings=warnings,
    )
