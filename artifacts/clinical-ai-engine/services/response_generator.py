"""
Response Generator — LangChain ChatOpenAI with BNP Clinical AI Engine system prompt.
Falls back to structured RAG-only response if OPENAI_API_KEY is not set.
"""
import os
import logging
from typing import List, Optional
from models.schemas import QueryType, Citation

logger = logging.getLogger(__name__)

# ── BNP System Prompt (injected into every GPT call) ─────────────────────────
BNP_SYSTEM_PROMPT = """You are BNP Clinical AI Engine, a hospital-grade nursing assistant.

STRICT RULES:
- Answer ONLY from the RAG context provided below. Do NOT use outside knowledge.
- If the answer is NOT in the context, respond exactly: "Not found in provided medical sources."
- Always cite the source document name and page number.
- NEVER hallucinate, speculate, or add information absent from the context.
- Be precise, clinically accurate, and concise.

CLINICAL BEHAVIOR:
- Medication questions → provide safe dosage range, calculate dose if weight is given, add overdose warnings.
- Protocol questions → summarize step-by-step, highlight critical actions.
- Risk / emergency questions → add a clearly labeled SAFETY WARNING section.

MANDATORY OUTPUT FORMAT — always use this exact structure:

Answer:
[direct clinical answer sourced exclusively from context]

Dose (if applicable):
[dose calculation or safe range — medication questions only]

Safety Warning:
[contraindications, overdose risks, critical precautions — if relevant]

Sources:
[list each source: document name — Page X]"""


def _build_context(chunks: List[dict]) -> str:
    if not chunks:
        return "No relevant context found in the knowledge base."
    parts = []
    for i, chunk in enumerate(chunks, 1):
        parts.append(
            f"[Source {i}] {chunk['document_name']} — Page {chunk['page_number']}\n"
            f"{chunk['content']}"
        )
    return "\n\n---\n\n".join(parts)


def _rag_only_response(chunks: List[dict]) -> str:
    """Structured response without GPT — pure RAG extraction."""
    if not chunks:
        return "Not found in provided medical sources."

    top = chunks[0]
    lines = [
        "Answer:",
        top["content"],
        "",
        "Sources:",
    ]
    for i, c in enumerate(chunks, 1):
        lines.append(f"[{i}] {c['document_name']} — Page {c['page_number']}")
    return "\n".join(lines)


def generate_response(
    question: str,
    chunks: List[dict],
    query_type: QueryType,
    citations: List[Citation],
) -> str:
    """
    Generate structured clinical response via LangChain ChatOpenAI.
    Falls back to RAG-only if no API key is available.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()

    if not api_key:
        logger.info("OPENAI_API_KEY not set — using RAG-only fallback")
        return _rag_only_response(chunks)

    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage

        llm = ChatOpenAI(
            model="gpt-4o",
            openai_api_key=api_key,
            temperature=0,              # Maximum determinism for clinical accuracy
            max_tokens=1024,
        )

        context_block = _build_context(chunks)

        user_content = (
            f"RAG CONTEXT:\n{context_block}\n\n"
            f"CLINICAL QUESTION: {question}\n\n"
            f"Query Type: {query_type.value.upper()}\n\n"
            "Answer using the mandatory BNP output format."
        )

        messages = [
            SystemMessage(content=BNP_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ]

        response = llm.invoke(messages)
        return response.content or _rag_only_response(chunks)

    except Exception as e:
        logger.error(f"ChatOpenAI error: {e}")
        return _rag_only_response(chunks)


def parse_bnp_sections(response_text: str) -> dict:
    """
    Parse BNP-formatted GPT response into structured sections.
    Returns dict with keys: answer, dose, safety_warning
    """
    import re

    def extract(label: str) -> Optional[str]:
        pattern = rf"(?:{label}):\s*([\s\S]+?)(?=\n(?:Answer|Dose|Safety Warning|Sources):|$)"
        m = re.search(pattern, response_text, re.IGNORECASE)
        return m.group(1).strip() if m else None

    return {
        "answer": extract("Answer") or response_text,
        "dose": extract(r"Dose(?:\s+\(if applicable\))?"),
        "safety_warning": extract("Safety Warning"),
    }
