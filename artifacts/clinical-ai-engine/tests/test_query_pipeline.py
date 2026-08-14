"""
Integration tests for the clinical query pipeline.

These cover the points where the system is supposed to REFUSE. The unit tests
elsewhere cover the pure functions; these assert that the refusals are actually
wired into the request path, because that is what makes the safety architecture
real rather than decorative.
"""
from services.embeddings import EmbeddingsUnavailable
from tests.conftest import CHUNK


QUESTION = {"question": "What is the paracetamol dose?", "top_k": 5}


# ── Retrieval unavailable → refuse, do not answer ─────────────────────────────

def test_retrieval_unavailable_returns_503(engine):
    client, audit = engine(
        retriever_raises=EmbeddingsUnavailable("OPENAI_API_KEY is not set")
    )
    res = client.post("/query/", json=QUESTION)

    assert res.status_code == 503
    # Critically: no clinical content in the body.
    assert "answer" not in res.json()


def test_retrieval_unavailable_gives_no_dose(engine):
    client, _ = engine(
        retriever_raises=EmbeddingsUnavailable("index/model mismatch")
    )
    body = client.post(
        "/query/",
        json={"question": "paracetamol dose for 70 kg", "patient_weight_kg": 70},
    ).text.lower()

    assert "mg" not in body


# ── Audit write failure → refuse, do not answer ───────────────────────────────

def test_audit_failure_refuses_the_request(engine):
    """
    An unrecorded clinical recommendation is worse than no recommendation.
    The audit write used to be best-effort: a failure was logged and the advice
    returned anyway, leaving no trace that it had been given.
    """
    client, _ = engine(audit_fails=True)
    res = client.post("/query/", json=QUESTION)

    assert res.status_code == 503


def test_audit_failure_leaks_no_clinical_content(engine):
    client, _ = engine(audit_fails=True)
    body = client.post("/query/", json=QUESTION).text

    assert "500-1000" not in body
    assert "Paracetamol 500" not in body


# ── Successful path still records everything ──────────────────────────────────

def test_successful_query_is_audited_before_responding(engine):
    client, audit = engine()
    res = client.post("/query/", json=QUESTION)

    assert res.status_code == 200
    assert len(audit.rows) == 1, "exactly one audit row per answered query"


def test_audit_row_records_the_answer_and_the_user(engine):
    client, audit = engine()
    client.post("/query/", json=QUESTION)

    row = audit.rows[0]
    # Attribution: the actual signed-in nurse, not a shared service account.
    assert row["username"] == "nurse@hospital.example"
    assert "Paracetamol" in row["answer"]


def test_audit_row_carries_traceable_citations(engine):
    """A citation must resolve to its bnp_chunks row."""
    client, audit = engine()
    client.post("/query/", json=QUESTION)

    citations = audit.rows[0]["citations"]
    assert citations, "citations must be recorded"
    assert citations[0].chunk_id == CHUNK["chunk_id"]
    assert citations[0].document_id == CHUNK["document_id"]


def test_response_citations_expose_chunk_id(engine):
    client, _ = engine()
    payload = client.post("/query/", json=QUESTION).json()

    assert payload["citations"][0]["chunk_id"] == CHUNK["chunk_id"]


# ── No sources → refuse ───────────────────────────────────────────────────────

def test_empty_corpus_does_not_produce_an_answer(engine):
    client, _ = engine(chunks=[])
    payload = client.post("/query/", json=QUESTION).json()

    assert payload["rejected"] is False or payload["rejected"] is True
    # Whatever the flag, there must be no fabricated dose and no citations.
    assert payload["citations"] == []
    assert "500-1000" not in payload["answer"]


def test_low_relevance_is_rejected(engine):
    """Below the retrieval confidence floor, the system must not answer."""
    weak = dict(CHUNK, relevance_score=0.02)
    client, _ = engine(chunks=[weak])
    payload = client.post("/query/", json=QUESTION).json()

    assert payload["rejected"] is True
    assert payload["rejection_reason"]


# ── Overdose hard block ───────────────────────────────────────────────────────

def test_overdose_is_hard_blocked_and_flagged(engine):
    """
    The deterministic rule must override the model: a dose over the maximum is
    refused before generation, not argued about afterwards.
    """
    client, audit = engine()
    res = client.post(
        "/query/",
        json={
            "question": "gentamicin dose",
            "drug_name": "gentamicin",
            "patient_weight_kg": 200,  # 1.5 mg/kg x 200 = 300 mg, max single 160
        },
    )

    payload = res.json()
    assert payload["rejected"] is True
    assert payload["safety_alert"] is True
    # And it is recorded as a block, not silently dropped.
    assert audit.rows[0]["rejected"] is True


def test_hard_block_still_writes_an_audit_row(engine):
    client, audit = engine()
    client.post(
        "/query/",
        json={
            "question": "gentamicin dose",
            "drug_name": "gentamicin",
            "patient_weight_kg": 200,
        },
    )
    assert len(audit.rows) == 1


# ── Input validation ──────────────────────────────────────────────────────────

def test_question_length_is_bounded(engine):
    client, _ = engine()
    res = client.post("/query/", json={"question": "x" * 5000})
    assert res.status_code == 422


def test_implausible_weight_is_rejected(engine):
    client, _ = engine()
    res = client.post(
        "/query/",
        json={"question": "paracetamol dose", "patient_weight_kg": 5000},
    )
    assert res.status_code == 422


def test_implausible_age_is_rejected(engine):
    client, _ = engine()
    res = client.post("/query/", json={"question": "paracetamol dose", "age": 500})
    assert res.status_code == 422


# ── Metrics ───────────────────────────────────────────────────────────────────

def test_refusals_are_counted_separately_from_answers(engine):
    """
    Refusal rate is the signal that tells an operator the knowledge base has a
    gap. Without it, a system that refuses everything looks like a quiet one.
    """
    from services.metrics import metrics

    client, _ = engine()
    before_answered = metrics._counters.get("bnp_queries_answered_total", 0)
    before_refused = metrics._counters.get("bnp_queries_refused_total", 0)

    client.post("/query/", json=QUESTION)
    client.post(
        "/query/",
        json={
            "question": "gentamicin dose",
            "drug_name": "gentamicin",
            "patient_weight_kg": 200,
        },
    )

    assert metrics._counters["bnp_queries_answered_total"] == before_answered + 1
    assert metrics._counters["bnp_queries_refused_total"] == before_refused + 1


def test_overdose_blocks_are_counted(engine):
    from services.metrics import metrics

    client, _ = engine()
    before = metrics._counters.get("bnp_overdose_blocks_total", 0)

    client.post(
        "/query/",
        json={
            "question": "gentamicin dose",
            "drug_name": "gentamicin",
            "patient_weight_kg": 200,
        },
    )

    assert metrics._counters["bnp_overdose_blocks_total"] == before + 1


def test_metrics_endpoint_exposes_no_clinical_content(engine):
    """Counters only — a scrape must never leak a question or an answer."""
    from services.metrics import metrics

    client, _ = engine()
    client.post("/query/", json=QUESTION)

    body = client.get("/metrics").text
    assert "bnp_queries_total" in body
    assert "paracetamol" not in body.lower()
    assert "500-1000" not in body
