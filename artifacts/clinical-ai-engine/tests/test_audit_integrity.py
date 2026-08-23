"""
Audit-trail integrity.

Two properties a clinical audit trail has to have: you can still retrieve the
source text behind a past recommendation, and you can tell whether the record
has been altered since it was written.

The chain tests need a database; they skip without TEST_DATABASE_URL. The
hashing tests are pure and always run.
"""
import json
import os

import pytest

from routers.query import GENESIS_HASH, canonical_json, compute_chain_hash

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()

CITATIONS = [{"document_name": "Adult IV Drip.pdf", "page_number": 12, "chunk_id": "c1"}]


def _hash(**overrides):
    args = dict(
        prev_hash=GENESIS_HASH,
        session_id="bnp-1",
        username="nurse@hospital.example",
        query="paracetamol dose",
        answer="500-1000 mg every 6 hours",
        rejected=False,
        citations=CITATIONS,
    )
    args.update(overrides)
    return compute_chain_hash(**args)


# ── Canonicalisation ──────────────────────────────────────────────────────────

def test_citation_hashing_survives_a_jsonb_round_trip():
    """
    JSONB preserves neither key order nor whitespace, so hashing the raw string
    would make every row fail verification after being read back.
    """
    as_written = json.dumps(CITATIONS)
    as_read_back = [{"chunk_id": "c1", "page_number": 12, "document_name": "Adult IV Drip.pdf"}]

    assert canonical_json(as_written) == canonical_json(as_read_back)
    assert _hash(citations=as_written) == _hash(citations=as_read_back)


# ── What the hash must cover ──────────────────────────────────────────────────

@pytest.mark.parametrize(
    "field,value",
    [
        ("answer", "a different dose"),
        ("query", "a different question"),
        ("username", "someone-else"),
        ("rejected", True),
        ("session_id", "bnp-2"),
        ("citations", [{"document_name": "other.pdf", "page_number": 1}]),
        ("prev_hash", "a-different-predecessor"),
    ],
)
def test_changing_any_covered_field_changes_the_hash(field, value):
    assert _hash(**{field: value}) != _hash()


def test_the_same_content_hashes_identically():
    assert _hash() == _hash()


# ── Chain behaviour against a real database ───────────────────────────────────

@pytest.mark.skipif(not TEST_DATABASE_URL, reason="needs TEST_DATABASE_URL")
class TestChain:
    @staticmethod
    def _write(query, answer):
        from models.database import db_cursor

        with db_cursor() as (cur, _):
            cur.execute(
                "SELECT chain_hash FROM bnp_audit_log ORDER BY id DESC LIMIT 1 FOR UPDATE"
            )
            row = cur.fetchone()
            prev = (row["chain_hash"] if row else None) or GENESIS_HASH
            citations = json.dumps(CITATIONS)
            chain = compute_chain_hash(
                prev_hash=prev,
                session_id="bnp-test",
                username="nurse",
                query=query,
                answer=answer,
                rejected=False,
                citations=citations,
            )
            cur.execute(
                """
                INSERT INTO bnp_audit_log
                  (session_id, user_id, username, query, query_type, confidence,
                   rejected, answer_text, citations, prev_hash, chain_hash)
                VALUES (%s, NULL, %s, %s, 'drug', 0.8, false, %s, %s, %s, %s)
                """,
                ("bnp-test", "nurse", query, answer, citations, prev, chain),
            )

    @pytest.fixture(autouse=True)
    def _clean(self):
        from models.database import db_cursor, init_db

        init_db()
        with db_cursor() as (cur, _):
            cur.execute("TRUNCATE bnp_audit_log")
        yield

    def test_an_untouched_chain_verifies(self):
        from routers.auth import verify_audit_chain

        for i in range(3):
            self._write(f"question {i}", f"answer {i}")

        result = verify_audit_chain(limit=100, _admin={"role": "admin"})
        assert result["valid"] is True
        assert result["rows_checked"] == 3

    def test_editing_a_past_answer_is_detected(self):
        """The case that matters: someone quietly changes what was recommended."""
        from models.database import db_cursor
        from routers.auth import verify_audit_chain

        for i in range(3):
            self._write(f"question {i}", f"answer {i}")

        with db_cursor() as (cur, _):
            cur.execute(
                "UPDATE bnp_audit_log SET answer_text = 'ALTERED' "
                "WHERE id = (SELECT MIN(id) FROM bnp_audit_log)"
            )

        result = verify_audit_chain(limit=100, _admin={"role": "admin"})
        assert result["valid"] is False
        assert "does not match" in result["reason"]

    def test_deleting_a_row_is_detected(self):
        """Removing an inconvenient entry breaks continuity for everything after."""
        from models.database import db_cursor
        from routers.auth import verify_audit_chain

        for i in range(4):
            self._write(f"question {i}", f"answer {i}")

        with db_cursor() as (cur, _):
            cur.execute(
                "DELETE FROM bnp_audit_log "
                "WHERE id = (SELECT MIN(id) + 1 FROM bnp_audit_log)"
            )

        result = verify_audit_chain(limit=100, _admin={"role": "admin"})
        assert result["valid"] is False
        assert "discontinuous" in result["reason"]

    def test_legacy_rows_without_a_hash_are_reported_not_failed(self):
        from models.database import db_cursor
        from routers.auth import verify_audit_chain

        with db_cursor() as (cur, _):
            cur.execute(
                "INSERT INTO bnp_audit_log (session_id, username, query, query_type) "
                "VALUES ('old', 'nurse', 'q', 'drug')"
            )

        result = verify_audit_chain(limit=100, _admin={"role": "admin"})
        assert result["valid"] is True
        assert result["unchained_legacy_rows"] == 1


# ── Source text survives retirement ───────────────────────────────────────────

@pytest.mark.skipif(not TEST_DATABASE_URL, reason="needs TEST_DATABASE_URL")
def test_retiring_a_document_preserves_the_text_behind_past_citations():
    """
    Deletion used to cascade to bnp_chunks, so the passage a recommendation was
    generated from vanished while the audit row still cited it by name and page.
    """
    from models.database import db_cursor, init_db

    init_db()
    with db_cursor() as (cur, _):
        cur.execute("DELETE FROM bnp_chunks WHERE document_id = 'doc-retire'")
        cur.execute("DELETE FROM bnp_documents WHERE id = 'doc-retire'")
        cur.execute(
            "INSERT INTO bnp_documents (id, filename, chunk_count) VALUES "
            "('doc-retire', 'retired.pdf', 1)"
        )
        cur.execute(
            "INSERT INTO bnp_chunks (chunk_id, document_id, content, page_number, chunk_index) "
            "VALUES ('chunk-retire', 'doc-retire', 'The cited passage.', 3, 0)"
        )
        # Retire it, the way DELETE /documents/{id} now does.
        cur.execute("UPDATE bnp_documents SET deleted_at = NOW() WHERE id = 'doc-retire'")
        cur.execute("UPDATE bnp_chunks SET deleted_at = NOW() WHERE document_id = 'doc-retire'")

        cur.execute("SELECT content FROM bnp_chunks WHERE chunk_id = 'chunk-retire'")
        row = cur.fetchone()

    assert row is not None, "retiring a document must not destroy its text"
    assert row["content"] == "The cited passage."
