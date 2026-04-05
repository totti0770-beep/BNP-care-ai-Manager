"""
Clinical Query Router — classifies incoming queries as:
  DRUG      → medication, dosing, pharmacology questions
  PROTOCOL  → step-by-step clinical procedures / guidelines
  GENERAL   → everything else
"""
import re
from models.schemas import QueryType

DRUG_PATTERNS = [
    r"\b(dose|dosage|dosing|mg|mcg|ml|iv|im|sc|po|oral|inject)\b",
    r"\b(drug|medication|medicine|antibiotic|analgesic|sedative|antihypertensive)\b",
    r"\b(paracetamol|acetaminophen|morphine|ibuprofen|amoxicillin|metformin|insulin|heparin|warfarin)\b",
    r"\b(vancomycin|vanco|gentamicin|furosemide|lasix|digoxin|enoxaparin|clexane|lmwh)\b",
    r"\b(metoprolol|atenolol|omeprazole|amiodarone|ceftriaxone|rocephin)\b",
    r"\b(فانكومايسين|جنتامايسين|فيروسيمايد|ديجوكسين|إيزوكسابارين|ميتوبرولول|أميودارون)\b",
    r"\b(overdose|toxic|antidote|naloxone|n-acetylcysteine|nac)\b",
    r"\b(contraindication|side effect|adverse|allergy|interaction)\b",
    r"\b(administer|infuse|titrate|bolus|continuous infusion)\b",
    r"(?:how much|what dose|safe dose|maximum dose|minimum dose)",
    r"\b(جرعة|دواء|مضاد حيوي|أنسولين|مورفين|باراسيتامول|حقن)\b",
]

PROTOCOL_PATTERNS = [
    r"\b(protocol|procedure|guideline|standard|policy|checklist|flowchart)\b",
    r"\b(steps?|how to|process|workflow|pathway|algorithm)\b",
    r"\b(assess|monitor|evaluate|document|record|report|escalate)\b",
    r"\b(hand hygiene|fall prevention|infection|isolation|precaution)\b",
    r"\b(sbar|five moments|ten rights|two identifiers|morse scale)\b",
    r"\b(بروتوكول|إجراء|خطوات|سياسة|تقييم|مراقبة|توثيق)\b",
]


def classify_query(question: str) -> QueryType:
    q_lower = question.lower()

    drug_score = sum(
        1 for pat in DRUG_PATTERNS if re.search(pat, q_lower, re.IGNORECASE)
    )
    protocol_score = sum(
        1 for pat in PROTOCOL_PATTERNS if re.search(pat, q_lower, re.IGNORECASE)
    )

    if drug_score >= 2 or (drug_score == 1 and protocol_score == 0):
        return QueryType.DRUG
    if protocol_score >= 1:
        return QueryType.PROTOCOL
    return QueryType.GENERAL
