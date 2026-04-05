"""
Response Generator — LangChain ChatOpenAI with BNP Clinical AI Engine system prompt.

Produces fully structured clinical output across 6 mandatory sections:
  Answer | Dose | Indication | Contraindications | Nursing Notes | Sources

Falls back to structured RAG-only response if OPENAI_API_KEY is not set.
Multi-document reasoning: when multiple sources are retrieved, GPT is instructed
to compare protocols and recommend the best approach for the clinical context.
"""
import os
import logging
from typing import List, Optional
from models.schemas import QueryType, Citation

logger = logging.getLogger(__name__)

BNP_SYSTEM_PROMPT = """You are BNP Clinical AI Engine, a hospital-grade clinical decision support system for nurses.

══════════════════════════════════════════════════
 STRICT CLINICAL RULES
══════════════════════════════════════════════════
• Answer ONLY from the RAG context provided. NEVER use outside knowledge.
• If the answer is NOT in the context, respond exactly: "Not found in provided medical sources."
• NEVER hallucinate, speculate, or fabricate clinical data.
• Cite every factual claim with its source document and page number.
• Be precise, evidence-based, and concise.
• If MULTIPLE sources are provided, compare them explicitly and state which protocol or value is preferred and why.

══════════════════════════════════════════════════
 MANDATORY OUTPUT — 6 SECTIONS (always include all)
══════════════════════════════════════════════════

Answer:
[Direct clinical answer sourced exclusively from the RAG context. If multiple sources agree, state the consensus. If they differ, state both values and recommend the clinically safer option.]

Dose (if applicable):
[Safe dose range from context. Calculate weight-based dose if patient weight is provided. If not a medication question, write "N/A".]

Indication:
[Clinical condition(s) this medication or protocol is indicated for, per the source. If not applicable, write "N/A".]

Contraindications:
[Absolute and relative contraindications listed as bullet points from the source. If none in context, write "None documented in current sources".]

Nursing Notes:
[Critical administration notes, monitoring requirements, patient education points, and safety checks — as bullet points. Always include at least 2 points.]

Sources:
[List each source used: document name — Page X. Mark with ★ the most relevant source.]

══════════════════════════════════════════════════
 MULTI-SOURCE REASONING RULES
══════════════════════════════════════════════════
• If two sources give different values → state both and note which is more conservative/safer.
• If one source is dated and another newer → prefer the newer if both are in context.
• If sources agree → state "Consistent across [N] sources".
• Never silently pick one source; always justify your selection."""


def _build_context(chunks: List[dict]) -> str:
    """
    Build a rich context block with source metadata.
    When multiple documents exist, adds a comparison preamble.
    """
    if not chunks:
        return "No relevant context found in the knowledge base."

    doc_names = list(dict.fromkeys(c["document_name"] for c in chunks))
    multi = len(doc_names) > 1

    header = ""
    if multi:
        header = (
            f"NOTE: {len(doc_names)} different source documents are provided below. "
            "Compare them carefully and synthesise the most clinically appropriate answer.\n"
            f"Sources: {', '.join(doc_names)}\n\n"
        )

    parts = []
    for i, chunk in enumerate(chunks, 1):
        parts.append(
            f"[Source {i}] {chunk['document_name']} — Page {chunk['page_number']} "
            f"(relevance: {chunk['relevance_score']:.0%})\n"
            f"{chunk['content']}"
        )

    return header + "\n\n---\n\n".join(parts)


def _rag_only_response(chunks: List[dict]) -> str:
    """Structured fallback without GPT — pure RAG extraction, all 6 sections."""
    if not chunks:
        return (
            "Answer:\nNot found in provided medical sources.\n\n"
            "Dose:\nN/A\n\nIndication:\nN/A\n\n"
            "Contraindications:\nNone documented in current sources.\n\n"
            "Nursing Notes:\n• Consult clinical pharmacist or physician.\n• Review institutional protocol.\n\n"
            "Sources:\nNo sources retrieved."
        )

    top = chunks[0]
    lines = [
        "Answer:", top["content"], "",
        "Dose:\nN/A", "",
        "Indication:\nN/A", "",
        "Contraindications:\nNone documented in current sources.", "",
        "Nursing Notes:\n• Verify with attending physician before administration.\n• Document all observations.", "",
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
    Generate fully structured 6-section clinical response via GPT-4o.
    Prefers Replit AI Integration proxy; falls back to user OPENAI_API_KEY; then RAG-only.
    """
    # Prefer Replit AI Integration (no scope restrictions)
    ai_base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", "").strip()
    ai_api_key  = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", "").strip()

    # Fall back to user-provided key (direct OpenAI)
    if not (ai_base_url and ai_api_key):
        direct_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not direct_key:
            logger.info("No OpenAI credentials — using RAG-only fallback")
            return _rag_only_response(chunks)
        ai_api_key = direct_key
        ai_base_url = None  # use default OpenAI endpoint

    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage

        init_kwargs = dict(
            model="gpt-4o",
            openai_api_key=ai_api_key,
            temperature=0,
            max_tokens=1400,
        )
        if ai_base_url:
            init_kwargs["openai_api_base"] = ai_base_url
            logger.info("Using Replit AI Integration proxy for GPT-4o")
        else:
            logger.info("Using direct OPENAI_API_KEY for GPT-4o")

        llm = ChatOpenAI(**init_kwargs)

        context_block = _build_context(chunks)
        doc_count = len(set(c["document_name"] for c in chunks))
        multi_note = (
            f"\n\nNOTE: {doc_count} source documents provided — apply multi-source reasoning rules."
            if doc_count > 1 else ""
        )

        user_content = (
            f"RAG CONTEXT:\n{context_block}\n\n"
            f"CLINICAL QUESTION: {question}\n"
            f"Query Type: {query_type.value.upper()}{multi_note}\n\n"
            "Produce the complete 6-section BNP Clinical Output. "
            "Do not skip any section. If a section is not applicable, write N/A."
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
    Parse BNP-formatted GPT response into all 6 structured sections.
    Returns dict with keys:
      answer, dose, indication, contraindications_text,
      nursing_notes_text, safety_warning, sources_text
    """
    import re

    SECTION_LABELS = [
        "Answer",
        r"Dose(?:\s+\(if applicable\))?",
        "Indication",
        "Contraindications",
        "Nursing Notes",
        "Safety Warning",
        "Sources",
    ]

    all_labels_re = "|".join(SECTION_LABELS)
    boundary = rf"(?=\n(?:{all_labels_re}):)"

    def extract(label: str) -> Optional[str]:
        pattern = rf"(?:{label}):\s*([\s\S]+?)(?:{boundary}|$)"
        m = re.search(pattern, response_text, re.IGNORECASE)
        return m.group(1).strip() if m else None

    def parse_bullets(text: Optional[str]) -> Optional[str]:
        """Clean up bullet lists."""
        if not text:
            return None
        if text.strip().lower() in ("n/a", "none", "none documented in current sources",
                                     "none documented", "not applicable"):
            return None
        return text.strip()

    answer = extract("Answer") or response_text
    dose = extract(r"Dose(?:\s+\(if applicable\))?")
    indication = parse_bullets(extract("Indication"))
    contraindications_text = parse_bullets(extract("Contraindications"))
    nursing_notes_text = parse_bullets(extract("Nursing Notes"))
    safety_warning = extract("Safety Warning")
    sources_text = extract("Sources")

    # If dose is explicitly N/A, treat as None
    if dose and dose.strip().lower() in ("n/a", "none", "not applicable"):
        dose = None

    return {
        "answer": answer,
        "dose": dose,
        "indication": indication,
        "contraindications_text": contraindications_text,
        "nursing_notes_text": nursing_notes_text,
        "safety_warning": safety_warning,
        "sources_text": sources_text,
    }


def parse_nursing_notes_list(text: Optional[str]) -> List[str]:
    """Convert bullet-point nursing notes text into a list."""
    if not text:
        return []
    import re
    lines = re.split(r"\n+", text)
    notes = []
    for line in lines:
        clean = re.sub(r"^[\s•\-\*\d\.]+", "", line).strip()
        if clean and len(clean) > 5:
            notes.append(clean)
    return notes


def parse_contraindications_list(text: Optional[str]) -> List[str]:
    """Convert contraindications text into a list."""
    return parse_nursing_notes_list(text)
