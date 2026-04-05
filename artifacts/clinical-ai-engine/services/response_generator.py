"""
Response Generator — uses OpenAI GPT with the BNP Clinical AI Engine system prompt.
Falls back to structured RAG-only response if no API key is set.
"""
import os
import logging
from typing import List, Optional
from models.schemas import QueryType, Citation

logger = logging.getLogger(__name__)

BNP_SYSTEM_PROMPT = """You are BNP Clinical AI Engine, a hospital-grade nursing assistant.

STRICT RULES:
- You MUST answer ONLY from the provided RAG context below. Do NOT use any outside knowledge.
- If the answer is NOT in the context, say exactly: "Not found in provided medical sources."
- Always include citations referencing the source documents.
- NEVER hallucinate, speculate, or add information not present in the context.
- Always be precise, clinically accurate, and concise.

CLINICAL BEHAVIOR:
- Medication questions → provide safe dosage range, calculate dose if weight provided, add overdose warnings.
- Protocol questions → summarize step-by-step, highlight critical actions with emphasis.
- Risk questions → add a SAFETY WARNING section.

OUTPUT FORMAT (MANDATORY — use this exact structure):

Answer:
[clear, direct clinical answer sourced from context]

Dose (if applicable):
[dose calculation or safe range — only if medication question]

Safety Warning:
[contraindications, overdose risks, critical precautions — only if relevant]

Sources:
[cite each source document with name and page number]"""


def _build_context_block(chunks: List[dict]) -> str:
    if not chunks:
        return "No relevant context found in the knowledge base."
    parts = []
    for i, chunk in enumerate(chunks, 1):
        parts.append(
            f"[Source {i}] {chunk['document_name']} — Page {chunk['page_number']}\n"
            f"{chunk['content']}"
        )
    return "\n\n---\n\n".join(parts)


def _fallback_response(chunks: List[dict], query_type: QueryType, question: str) -> str:
    """Structured response without GPT — pure RAG extraction."""
    if not chunks:
        return "Not found in provided medical sources."

    top = chunks[0]
    answer = f"Answer:\n{top['content']}"

    if len(chunks) > 1:
        answer += f"\n\nSources:\n"
        for i, c in enumerate(chunks, 1):
            answer += f"[{i}] {c['document_name']} — Page {c['page_number']}\n"

    return answer


def generate_response(
    question: str,
    chunks: List[dict],
    query_type: QueryType,
    citations: List[Citation],
) -> str:
    """
    Generate a structured clinical response.
    Uses OpenAI if OPENAI_API_KEY is set, otherwise returns structured RAG-only response.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()

    if not api_key:
        logger.info("OPENAI_API_KEY not set — using fallback RAG-only response")
        return _fallback_response(chunks, query_type, question)

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        context_block = _build_context_block(chunks)

        user_message = (
            f"RAG CONTEXT:\n{context_block}\n\n"
            f"CLINICAL QUESTION: {question}\n\n"
            f"Query Type: {query_type.value.upper()}\n\n"
            "Answer following the mandatory output format."
        )

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": BNP_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            max_tokens=1024,
            temperature=0.1,    # Low temperature for clinical accuracy
        )

        return response.choices[0].message.content or _fallback_response(chunks, query_type, question)

    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        return _fallback_response(chunks, query_type, question)


def parse_bnp_sections(response_text: str) -> dict:
    """
    Parse BNP-formatted response text into structured sections.
    Returns dict with keys: answer, dose, safety_warning
    """
    import re

    def extract(label: str) -> Optional[str]:
        pattern = rf"(?:{label}):\s*([\s\S]+?)(?=\n(?:Answer|Dose|Safety Warning|Sources):|$)"
        m = re.search(pattern, response_text, re.IGNORECASE)
        return m.group(1).strip() if m else None

    return {
        "answer": extract("Answer") or response_text,
        "dose": extract("Dose(?:\\s+\\(if applicable\\))?"),
        "safety_warning": extract("Safety Warning"),
    }
