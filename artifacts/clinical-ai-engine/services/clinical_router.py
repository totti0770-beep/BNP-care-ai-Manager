"""
Clinical Query Router — classifies incoming queries as:
  DRUG      → medication, dosing, pharmacology questions
  PROTOCOL  → step-by-step clinical procedures / guidelines
  GENERAL   → everything else
"""
import re
from models.schemas import QueryType

# NOTE: Arabic text does NOT work with \b (ASCII word boundaries).
# Use plain re.search (no \b) for Arabic patterns.

DRUG_PATTERNS_ASCII = [
    r"\b(dose|dosage|dosing|mg|mcg|ml|iv|im|sc|po|oral|inject)\b",
    r"\b(drug|medication|medicine|antibiotic|analgesic|sedative|antihypertensive)\b",
    r"\b(paracetamol|acetaminophen|morphine|ibuprofen|amoxicillin|metformin|insulin|heparin|warfarin)\b",
    r"\b(vancomycin|vanco|gentamicin|furosemide|lasix|digoxin|enoxaparin|clexane|lmwh)\b",
    r"\b(metoprolol|atenolol|omeprazole|amiodarone|ceftriaxone|rocephin|dopamine|dobutamine)\b",
    r"\b(overdose|toxic|antidote|naloxone|n-acetylcysteine|nac)\b",
    r"\b(contraindication|side effect|adverse|allergy|interaction)\b",
    r"\b(administer|infuse|titrate|bolus|continuous infusion|dilut|reconstitut|prepar)\b",
    r"(?:how much|what dose|safe dose|maximum dose|minimum dose)",
    r"\b(loading dose|maintenance dose|renal dose|weight.based)\b",
]

# Arabic patterns — NO \b (Arabic chars are not ASCII word chars)
DRUG_PATTERNS_ARABIC = [
    # Drug names
    r"(فانكومايسين|جنتامايسين|فيروسيمايد|ديجوكسين|إيزوكسابارين|ميتوبرولول|أميودارون|سيفترياكسون)",
    r"(باراسيتامول|مورفين|هيبارين|وارفارين|إنسولين|أموكسيسيلين|فيوروسيمايد|أتروبين)",
    r"(دوبامين|دوبوتامين|أدرينالين|نورأدرينالين|ليدوكايين|كيتامين|ميدازولام|بروبوفول)",
    r"(ريدوكساباب|اكسابارين|كلوبيدوجريل|أسبرين|نيفيديبين|كابتوبريل|رامبريل|فيراباميل)",
    # Dose / preparation keywords
    r"(جرعة|جرعت|جرعه|جرام|ملغم|مكغم|مليلتر|مل|وحدة|وحدات)",
    r"(دواء|أدوية|دوية|عقار|علاج|مضاد حيوي|مسكن|خافض)",
    r"(احضر|تحضير|حضّر|اعطي|إعطاء|حقن|تحقن|وريدي|عضلي|تحت الجلد)",
    r"(كيف أعطي|كيف اعطي|كيف تعطي|كيف نعطي|طريقة إعطاء|طريقة اعطاء)",
    r"(جرعة التحميل|جرعة الصيانة|جرعة الطوارئ|الجرعة الآمنة|الجرعة القصوى)",
    r"(تخفيف|خفف|إذابة|ذوب|مخفف|محلول|سيروم|محلول ملحي)",
    r"(تفاعل دوائي|تداخل|موانع|آثار جانبية|حساسية|جرعة زائدة|تسمم)",
]

PROTOCOL_PATTERNS_ASCII = [
    r"\b(protocol|procedure|guideline|standard|policy|checklist|flowchart)\b",
    r"\b(steps?|how to|process|workflow|pathway|algorithm)\b",
    r"\b(assess|monitor|evaluate|document|record|report|escalate)\b",
    r"\b(hand hygiene|fall prevention|infection|isolation|precaution)\b",
    r"\b(sbar|five moments|ten rights|two identifiers|morse scale)\b",
]

PROTOCOL_PATTERNS_ARABIC = [
    r"(بروتوكول|إجراء|خطوات|سياسة|تقييم|مراقبة|توثيق)",
    r"(كيف أطبق|كيف اطبق|كيف نطبق|طريقة التطبيق|إجراءات)",
    r"(نظافة اليدين|الوقاية من السقوط|عزل|احتياطات|سلامة المرضى)",
]


def classify_query(question: str) -> QueryType:
    q_lower = question.lower()

    # Score ASCII patterns (with \b)
    drug_score = sum(
        1 for pat in DRUG_PATTERNS_ASCII if re.search(pat, q_lower, re.IGNORECASE)
    )
    protocol_score = sum(
        1 for pat in PROTOCOL_PATTERNS_ASCII if re.search(pat, q_lower, re.IGNORECASE)
    )

    # Score Arabic patterns (without \b — plain search)
    drug_score += sum(
        1 for pat in DRUG_PATTERNS_ARABIC if re.search(pat, question, re.IGNORECASE)
    )
    protocol_score += sum(
        1 for pat in PROTOCOL_PATTERNS_ARABIC if re.search(pat, question, re.IGNORECASE)
    )

    if drug_score >= 1 and drug_score >= protocol_score:
        return QueryType.DRUG
    if protocol_score >= 1:
        return QueryType.PROTOCOL
    return QueryType.GENERAL
