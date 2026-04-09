"""
Arabic → English search query translator for the BNP Clinical AI Engine.

When a user asks in Arabic, FAISS + BM25 (which index English documents)
cannot find relevant chunks because the Arabic embedding doesn't align
with English content. This module:

  1. Detects whether a query contains Arabic text.
  2. Extracts known Arabic medical terms and replaces them with English.
  3. Returns an English (or mixed) search string for FAISS/BM25,
     while the ORIGINAL Arabic query is preserved for the LLM prompt.
"""

import re
from typing import Optional

# ── Arabic drug name → English mapping ────────────────────────────────────────
DRUG_MAP: dict[str, str] = {
    # Antibiotics
    "فانكومايسين": "Vancomycin",
    "جنتامايسين": "Gentamicin",
    "أموكسيسيلين": "Amoxicillin",
    "سيفترياكسون": "Ceftriaxone",
    "سيفازولين": "Cefazolin",
    "بيبيراسيلين": "Piperacillin",
    "مترونيدازول": "Metronidazole",
    "كليندامايسين": "Clindamycin",
    "إيرتابينيم": "Ertapenem",
    "ميروبينيم": "Meropenem",
    "إيميبينيم": "Imipenem",
    "لينيزوليد": "Linezolid",
    "دابتومايسين": "Daptomycin",
    "فلوكونازول": "Fluconazole",
    "مايكافونجين": "Micafungin",
    # Cardiovascular
    "هيبارين": "Heparin",
    "إينوكسابارين": "Enoxaparin",
    "كليكسان": "Clexane",
    "وارفارين": "Warfarin",
    "أسبرين": "Aspirin",
    "كلوبيدوجريل": "Clopidogrel",
    "أميودارون": "Amiodarone",
    "ليدوكايين": "Lidocaine",
    "دوبامين": "Dopamine",
    "دوبوتامين": "Dobutamine",
    "أدرينالين": "Adrenaline",
    "إبينفرين": "Epinephrine",
    "نورإبينفرين": "Norepinephrine",
    "نورأدرينالين": "Noradrenaline",
    "نيتروجليسرين": "Nitroglycerin",
    "نيفيديبين": "Nifedipine",
    "ديجوكسين": "Digoxin",
    "فيراباميل": "Verapamil",
    "ميتوبرولول": "Metoprolol",
    "أتينولول": "Atenolol",
    "كابتوبريل": "Captopril",
    "رامبريل": "Ramipril",
    # Diuretics
    "فيوروسيمايد": "Furosemide",
    "فيروسيمايد": "Furosemide",
    "لاسيكس": "Lasix",
    "هيدروكلوروثيازيد": "Hydrochlorothiazide",
    "سبيرونولاكتون": "Spironolactone",
    # Analgesics & sedation
    "مورفين": "Morphine",
    "ترامادول": "Tramadol",
    "باراسيتامول": "Paracetamol",
    "أسيتامينوفين": "Acetaminophen",
    "إيبوبروفين": "Ibuprofen",
    "كيتورولاك": "Ketorolac",
    "ميدازولام": "Midazolam",
    "بروبوفول": "Propofol",
    "كيتامين": "Ketamine",
    "فينتانيل": "Fentanyl",
    "نالوكسون": "Naloxone",
    # Endocrine & metabolic
    "إنسولين": "Insulin",
    "جلوكوز": "Glucose",
    "ديكستروز": "Dextrose",
    "ديكساميثازون": "Dexamethasone",
    "هيدروكورتيزون": "Hydrocortisone",
    "ميتفورمين": "Metformin",
    # GI
    "أوميبرازول": "Omeprazole",
    "رانيتيدين": "Ranitidine",
    "ميتوكلوبراميد": "Metoclopramide",
    "أوندانسيترون": "Ondansetron",
    # Other common drugs
    "فيتامين كاف": "Vitamin K",
    "فيتامين ك": "Vitamin K",
    "كالسيوم جلوكونات": "Calcium gluconate",
    "مغنيسيوم": "Magnesium",
    "بوتاسيوم": "Potassium",
    "صوديوم": "Sodium",
    "كلوريد الصوديوم": "Sodium chloride",
    "محلول ملحي": "Normal saline",
    "ماء مقطر": "Sterile water",
}

# Shared clinical term translations
TERM_MAP: dict[str, str] = {
    # Dose / route
    "جرعة": "dose",
    "جرعت": "dose",
    "جرعه": "dose",
    "جرعة التحميل": "loading dose",
    "جرعة الصيانة": "maintenance dose",
    "جرعة الطوارئ": "emergency dose",
    "جرام": "gram",
    "ملغم": "mg",
    "ملغ": "mg",
    "مكغم": "mcg",
    "مليلتر": "ml",
    "وحدة": "unit",
    "وريدي": "IV",
    "عضلي": "IM",
    "تحت الجلد": "SC",
    "فموي": "oral",
    # Preparation
    "تحضير": "preparation dilution",
    "احضر": "prepare",
    "حضّر": "prepare",
    "تخفيف": "dilution",
    "خفف": "dilute",
    "إذابة": "reconstitution",
    "ذوب": "dissolve",
    "مخفف": "diluted",
    "محلول": "solution",
    "سيروم": "serum",
    "محلول ملحي": "normal saline",
    "حقن": "injection",
    "إعطاء": "administration",
    "اعطي": "administer",
    "طريقة إعطاء": "administration method",
    "كيف تعطي": "how to administer",
    # Patient info
    "مريض": "patient",
    "وزنه": "weight",
    "وزن": "weight",
    "كجم": "kg",
    "كغم": "kg",
    # Clinical
    "جرعة زائدة": "overdose",
    "تسمم": "toxicity",
    "تفاعل دوائي": "drug interaction",
    "موانع": "contraindications",
    "آثار جانبية": "side effects",
    "حساسية": "allergy",
    "بروتوكول": "protocol",
    "إجراء": "procedure",
    "خطوات": "steps",
    "تقييم": "assessment",
    "مراقبة": "monitoring",
    "نظافة اليدين": "hand hygiene",
    "الوقاية من السقوط": "fall prevention",
    "عزل": "isolation",
}


def _is_arabic(text: str) -> bool:
    """Return True if >10% of word chars are Arabic."""
    arabic_chars = len(re.findall(r"[\u0600-\u06FF]", text))
    total_chars = len(re.findall(r"\w", text))
    return total_chars > 0 and arabic_chars / total_chars > 0.10


def translate_for_search(query: str) -> str:
    """
    Return an English search string derived from an Arabic query.
    If the query is not Arabic, return it unchanged.

    Strategy:
      1. Replace known Arabic drug names with English equivalents.
      2. Replace common clinical terms.
      3. Strip remaining Arabic characters (they won't help BM25/FAISS).
      4. Also append any matched drug names as explicit keywords.
    """
    if not _is_arabic(query):
        return query

    translated = query
    matched_drugs: list[str] = []

    # Replace Arabic drug names
    for ar, en in DRUG_MAP.items():
        if ar in translated:
            translated = translated.replace(ar, en)
            matched_drugs.append(en)

    # Replace clinical terms
    for ar, en in TERM_MAP.items():
        if ar in translated:
            translated = translated.replace(ar, en)

    # Remove remaining Arabic characters (only keep translated parts + numbers)
    translated = re.sub(r"[\u0600-\u06FF]+", " ", translated)
    translated = re.sub(r"\s+", " ", translated).strip()

    # Append drug keywords explicitly so BM25 scores them highly
    if matched_drugs:
        keywords = " ".join(matched_drugs)
        translated = f"{translated} {keywords}".strip()

    # Fallback: if nothing was translated, return the original
    # (FAISS multilingual embeddings may still help a little)
    return translated if translated.strip() else query
