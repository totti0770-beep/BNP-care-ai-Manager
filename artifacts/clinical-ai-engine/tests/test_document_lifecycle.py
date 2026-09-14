"""
A document must be approved, in date, and current before it can be cited.

Before 0004_document_lifecycle the only thing retrieval checked was that
neither the chunk nor its document had been soft deleted. So an uploaded PDF
became clinical evidence the instant it finished processing, and a protocol
that expired last year stayed citable forever — the engine had no column that
could tell it otherwise.

The rule these tests pin has two halves, and they are enforced in two places on
purpose:

  * `sync_from_db` refuses to index anything that is not `approved`. That is the
    filter that decides what is in the corpus at all.

  * `is_currently_valid` decides, per query, whether a chunk that IS in the
    corpus may be used today. Expiry is a calendar statement, and this process
    can run for days — filtering only at index time would keep serving a
    document for as long as nobody restarted the engine.

The date tests deliberately use dates relative to `today`, not fixed strings.
A test that passes because someone hardcoded 2026 would start lying in 2027.
"""
import datetime as dt

import pytest

pytest.importorskip("langchain_community", reason="needs the retrieval extras")
pytest.importorskip("faiss", reason="needs faiss-cpu")

from langchain_core.embeddings import Embeddings  # noqa: E402

from services.embeddings import (  # noqa: E402
    HybridRetriever,
    chunk_metadata,
    is_currently_valid,
)

TODAY = dt.date.today()
YESTERDAY = TODAY - dt.timedelta(days=1)
TOMORROW = TODAY + dt.timedelta(days=1)
LAST_YEAR = TODAY - dt.timedelta(days=365)
NEXT_YEAR = TODAY + dt.timedelta(days=365)


class StubEmbeddings(Embeddings):
    """Deterministic vectors. Not langchain's FakeEmbeddings — see S4."""

    def _vector(self, text: str):
        total = sum(ord(ch) for ch in text)
        return [((total >> i) % 89) / 89.0 for i in range(8)]

    def embed_documents(self, texts):
        return [self._vector(t) for t in texts]

    def embed_query(self, text):
        return self._vector(text)


def _chunks(document_id: str, n: int = 2):
    return [
        {
            "chunk_id": f"{document_id}-chunk-{i}",
            "content": f"{document_id} vancomycin dilution guidance passage {i}",
            "page_number": i + 1,
            "chunk_index": i,
        }
        for i in range(n)
    ]


@pytest.fixture
def retriever(tmp_path, monkeypatch):
    monkeypatch.setattr("services.embeddings.FAISS_LANGCHAIN_PATH", str(tmp_path / "faiss"))
    monkeypatch.setattr("services.embeddings.META_PATH", tmp_path / "meta.pkl")
    monkeypatch.setattr("services.embeddings.FINGERPRINT_PATH", tmp_path / "fingerprint")
    monkeypatch.setattr("services.embeddings._get_embeddings", lambda: StubEmbeddings())
    return HybridRetriever()


def _document_ids(results):
    return {r["document_id"] for r in results}


# ── The validity rule on its own ─────────────────────────────────────────────


def test_an_approved_open_ended_document_is_valid():
    chunk = chunk_metadata(
        chunk_id="c1", document_id="d1", document_name="Manual.pdf",
        page_number=1, chunk_index=0,
    )
    assert is_currently_valid(chunk)


def test_a_pending_document_is_not_valid():
    chunk = chunk_metadata(
        chunk_id="c1", document_id="d1", document_name="Draft.pdf",
        page_number=1, chunk_index=0, document_status="pending",
    )
    assert not is_currently_valid(chunk)


@pytest.mark.parametrize("status", ["pending", "retired", "superseded"])
def test_only_approved_is_servable(status):
    chunk = chunk_metadata(
        chunk_id="c1", document_id="d1", document_name="Doc.pdf",
        page_number=1, chunk_index=0, document_status=status,
    )
    assert not is_currently_valid(chunk)


def test_expiry_takes_effect_on_the_day_it_states():
    """
    A document expiring today is already expired today. Guidance that says it
    is valid "until 1 March" is not valid on 1 March, and the safer reading of
    an off-by-one here is the one that withholds the source.
    """
    expiring_today = chunk_metadata(
        chunk_id="c1", document_id="d1", document_name="Protocol.pdf",
        page_number=1, chunk_index=0, expiry_date=TODAY,
    )
    expiring_tomorrow = chunk_metadata(
        chunk_id="c2", document_id="d2", document_name="Protocol.pdf",
        page_number=1, chunk_index=0, expiry_date=TOMORROW,
    )
    assert not is_currently_valid(expiring_today)
    assert is_currently_valid(expiring_tomorrow)


def test_a_document_not_yet_effective_is_withheld():
    chunk = chunk_metadata(
        chunk_id="c1", document_id="d1", document_name="Protocol 2027.pdf",
        page_number=1, chunk_index=0, effective_date=TOMORROW,
    )
    assert not is_currently_valid(chunk)
    # …and becomes valid once the date arrives, with no re-index.
    assert is_currently_valid(chunk, today=TOMORROW)


def test_dates_are_accepted_as_iso_strings():
    """
    The same value arrives as a `date` from psycopg2 and as a string from a
    form field or an index pickled by an older build. Comparing a string to a
    date raises, and inside retrieval that would be a 500 on a governance check.
    """
    chunk = chunk_metadata(
        chunk_id="c1", document_id="d1", document_name="Protocol.pdf",
        page_number=1, chunk_index=0,
        effective_date=LAST_YEAR.isoformat(), expiry_date=NEXT_YEAR.isoformat(),
    )
    assert is_currently_valid(chunk)


def test_an_unparseable_date_withholds_rather_than_ignores():
    """A typo must not read as "never expires"."""
    chunk = chunk_metadata(
        chunk_id="c1", document_id="d1", document_name="Protocol.pdf",
        page_number=1, chunk_index=0, expiry_date="not-a-date",
    )
    assert not is_currently_valid(chunk)


def test_a_chunk_from_an_older_index_is_still_served():
    """
    An index built before this migration carries none of these keys. Those
    chunks are in the index because the database said their document was live,
    so withholding them would take the corpus silent on upgrade.
    """
    legacy = {
        "chunk_id": "c1",
        "document_id": "d1",
        "document_name": "Manual.pdf",
        "page_number": 1,
        "chunk_index": 0,
    }
    assert is_currently_valid(legacy)


# ── The rule as retrieval actually applies it ────────────────────────────────


def test_an_expired_document_is_not_returned(retriever):
    retriever.add_chunks(
        _chunks("current"), "current", "Current Manual.pdf",
        effective_date=LAST_YEAR, expiry_date=NEXT_YEAR,
    )
    retriever.add_chunks(
        _chunks("expired"), "expired", "Withdrawn 2024 Protocol.pdf",
        effective_date=LAST_YEAR, expiry_date=YESTERDAY,
    )

    results = retriever.hybrid_search("vancomycin dilution guidance", top_k=5)

    assert results, "the current document should still answer"
    assert _document_ids(results) == {"current"}


def test_an_expired_document_is_withheld_even_on_a_keyword_match(retriever):
    """
    BM25 scores every position in the corpus, so suppressing only the semantic
    half would still let an expired chunk through on its keyword score. The
    query here is lifted verbatim from the expired document's text, which is the
    case that would slip past a half-applied filter.
    """
    retriever.add_chunks(
        _chunks("expired"), "expired", "Withdrawn Protocol.pdf",
        expiry_date=YESTERDAY,
    )

    results = retriever.hybrid_search(
        "expired vancomycin dilution guidance passage 0", top_k=5
    )

    assert results == []


def test_an_expired_chunk_does_not_displace_a_valid_one(retriever):
    """
    Filtering after scoring would let an expired chunk occupy a top_k slot and
    push a valid source out of the answer. With top_k=1 and the expired
    document scoring higher on the query, the valid one must still be returned.
    """
    retriever.add_chunks(
        _chunks("expired", n=3), "expired", "Withdrawn.pdf", expiry_date=YESTERDAY,
    )
    retriever.add_chunks(_chunks("current", n=1), "current", "Current.pdf")

    # Worded to match the expired document, so it outranks the valid one and
    # would take the single available slot if filtering happened after scoring.
    results = retriever.hybrid_search(
        "expired vancomycin dilution guidance passage 1", top_k=1
    )

    assert len(results) == 1
    assert results[0]["document_id"] == "current"


def test_a_pending_document_is_not_retrievable(retriever):
    retriever.add_chunks(
        _chunks("draft"), "draft", "Unreviewed Draft.pdf",
        document_status="pending",
    )

    assert retriever.hybrid_search("vancomycin dilution guidance", top_k=5) == []


def test_approval_is_what_makes_a_document_answerable(retriever):
    """The whole feature in one test: staged is silent, approved answers."""
    retriever.add_chunks(
        _chunks("doc"), "doc", "JSH Manual.pdf", document_status="pending",
    )
    assert retriever.hybrid_search("vancomycin dilution guidance", top_k=5) == []

    # Approval re-indexes the same chunks with the approved status.
    retriever.remove_document("doc")
    retriever.add_chunks(
        _chunks("doc"), "doc", "JSH Manual.pdf", document_status="approved",
    )

    results = retriever.hybrid_search("vancomycin dilution guidance", top_k=5)
    assert _document_ids(results) == {"doc"}


def test_governance_travels_with_the_chunk(retriever):
    """
    `hybrid_search` has no database at hand — it answers from `self.chunks`. If
    the governance fields did not travel into the index, the query-time check
    would have nothing to read and every chunk would look open-ended.
    """
    retriever.add_chunks(
        _chunks("doc"), "doc", "JSH Manual.pdf",
        document_version=3, effective_date=LAST_YEAR, expiry_date=NEXT_YEAR,
    )

    chunk = retriever.chunks[0]
    assert chunk["document_status"] == "approved"
    assert chunk["document_version"] == 3
    assert chunk["expiry_date"] == NEXT_YEAR


def test_a_withheld_chunk_is_still_resolvable_evidence(retriever):
    """
    Withholding is not deletion. The passage behind a past citation must survive
    so an incident review can still ask what text produced a recommendation —
    the rule `GET /documents/chunks/{id}` exists to serve.
    """
    retriever.add_chunks(
        _chunks("expired"), "expired", "Withdrawn.pdf", expiry_date=YESTERDAY,
    )

    assert retriever.hybrid_search("vancomycin", top_k=5) == []
    assert retriever.chunk_count == 2, "the chunks are withheld, not removed"
    assert {c["chunk_id"] for c in retriever.chunks} == {
        "expired-chunk-0",
        "expired-chunk-1",
    }


# ── The two index-building paths must agree ──────────────────────────────────


def test_both_index_paths_produce_the_same_metadata_keys():
    """
    The index is built in two places — a full rebuild from the database and an
    incremental add on approval. When those drifted before, a citation could not
    be joined back to its row. A governance key missing from one path is worse:
    an absent `expiry_date` reads as "never expires".

    Both now call `chunk_metadata`, and this asserts the contract that function
    holds: the key set does not depend on which fields the caller supplied.
    """
    minimal = chunk_metadata(
        chunk_id="c", document_id="d", document_name="n",
        page_number=1, chunk_index=0,
    )
    full = chunk_metadata(
        chunk_id="c", document_id="d", document_name="n",
        page_number=1, chunk_index=0,
        document_status="approved", document_version=2,
        effective_date=LAST_YEAR, expiry_date=NEXT_YEAR,
    )

    assert minimal.keys() == full.keys()
    assert "expiry_date" in minimal and minimal["expiry_date"] is None
    assert minimal["document_status"] == "approved"
    assert minimal["document_version"] == 1
