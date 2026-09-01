"""
Retiring a document must not re-embed the corpus.

`remove_document` used to rebuild the index with `FAISS.from_documents`, which
embeds every *remaining* chunk. Deleting one document therefore cost a
full-corpus embedding pass, and on 2026-09-01 that asked OpenAI for 220,906
tokens at once, hit the tokens-per-minute limit, and returned a 500 to the
operator — from the deployed engine's own log:

    File "/app/services/embeddings.py", line 310, in remove_document
        vectorstore = FAISS.from_documents(lc_docs, self._embeddings)
    openai.RateLimitError: Error code: 429 - Rate limit reached for
      text-embedding-3-small ... Requested 220906

A delete that did succeed took 16,002 ms.

The embedder here counts its calls, because "does not re-embed" is the whole
point and an assertion on the resulting chunk list would not show it. It is a
local stub rather than langchain's FakeEmbeddings: a fake embedder reaching
production was audit finding S4, and that class should not appear anywhere in
this repository, tests included.

These run against the real FAISS and the real LangChain wrapper (CI installs
requirements.txt), so they also pin the third-party behaviour the fix relies on.
"""

import pytest

pytest.importorskip("langchain_community", reason="needs the retrieval extras")
pytest.importorskip("faiss", reason="needs faiss-cpu")

from langchain_core.embeddings import Embeddings  # noqa: E402

from services.embeddings import HybridRetriever  # noqa: E402


class CountingEmbeddings(Embeddings):
    """Deterministic vectors, and a tally of how often they were computed."""

    def __init__(self):
        self.calls = 0
        self.texts = 0

    def _vector(self, text: str):
        # Deterministic across processes — hash() is salted per interpreter.
        total = sum(ord(ch) for ch in text)
        return [((total >> i) % 89) / 89.0 for i in range(8)]

    def embed_documents(self, texts):
        self.calls += 1
        self.texts += len(texts)
        return [self._vector(t) for t in texts]

    def embed_query(self, text):
        self.calls += 1
        self.texts += 1
        return self._vector(text)


def _chunks(document_id: str, n: int, offset: int = 0):
    return [
        {
            "chunk_id": f"{document_id}-chunk-{i}",
            "content": f"{document_id} passage {i} vancomycin dilution guidance",
            "page_number": i + 1,
            "chunk_index": i,
        }
        for i in range(offset, offset + n)
    ]


@pytest.fixture
def retriever(tmp_path, monkeypatch):
    """A retriever wired to a counting embedder and a scratch state directory."""
    monkeypatch.setattr("services.embeddings.FAISS_LANGCHAIN_PATH", str(tmp_path / "faiss"))
    monkeypatch.setattr("services.embeddings.META_PATH", tmp_path / "meta.pkl")
    monkeypatch.setattr("services.embeddings.FINGERPRINT_PATH", tmp_path / "fingerprint")

    embeddings = CountingEmbeddings()
    monkeypatch.setattr("services.embeddings._get_embeddings", lambda: embeddings)

    r = HybridRetriever()
    r.add_chunks(_chunks("alpha", 3), "alpha", "Adult Dilution Manual.pdf")
    r.add_chunks(_chunks("beta", 2), "beta", "Neonate Dilution Manual.pdf")
    assert r.chunk_count == 5
    return r, embeddings


def test_delete_performs_no_embedding_calls(retriever):
    """The defect, stated as a number: deleting must cost zero embeddings."""
    r, embeddings = retriever
    before = embeddings.calls

    r.remove_document("alpha")

    assert embeddings.calls == before, (
        "remove_document embedded something; it must delete vectors by id, "
        "never rebuild the index"
    )


def test_delete_removes_only_that_document(retriever):
    r, _ = retriever

    r.remove_document("alpha")

    assert r.chunk_count == 2
    assert {c["document_id"] for c in r.chunks} == {"beta"}
    assert r._vectorstore.index.ntotal == 2


def test_retired_chunks_are_unreachable_and_the_rest_are_not(retriever):
    r, _ = retriever

    r.remove_document("alpha")

    hits = r.hybrid_search("vancomycin dilution guidance", top_k=5)
    assert hits, "the surviving document must still be retrievable"
    assert all(h["document_id"] == "beta" for h in hits)


def test_deleting_everything_clears_the_index(retriever):
    r, _ = retriever

    r.remove_document("alpha")
    r.remove_document("beta")

    assert r.chunk_count == 0
    assert r._vectorstore is None
    assert r.hybrid_search("anything", top_k=5) == []


def test_deleting_an_unknown_document_is_a_no_op(retriever):
    r, embeddings = retriever
    before = embeddings.calls

    r.remove_document("never-indexed")

    assert r.chunk_count == 5
    assert embeddings.calls == before


def test_an_unusable_embedder_does_not_block_a_retirement(retriever, monkeypatch):
    """
    The second half of the incident, reproduced at its real cause.

    The embedding provider is what failed on 2026-09-01 — a 429. The database
    retirement had already been committed by the caller
    (`routers/documents.py` commits before calling this), but the old rebuild
    raised before reaching the assignment to `self.chunks`, so a document the
    database recorded as retired stayed in the served corpus for the next three
    hours, until the restart.

    Making the embedder raise reproduces exactly that: against the old
    implementation this fails, because retirement depended on a network call
    that was down. Against the fix it passes, because retirement no longer
    embeds anything at all.
    """
    r, embeddings = retriever

    def unavailable(*_args, **_kwargs):
        raise RuntimeError("429 Rate limit reached for text-embedding-3-small")

    monkeypatch.setattr(embeddings, "embed_documents", unavailable)

    r.remove_document("alpha")  # must not raise

    assert r.chunk_count == 2
    assert all(c["document_id"] == "beta" for c in r.chunks)
    hits = r.hybrid_search("vancomycin dilution guidance", top_k=5)
    assert all(h["document_id"] == "beta" for h in hits), (
        "a retired document was still returned by search"
    )


def test_a_failed_vector_removal_still_retires_the_document(retriever, monkeypatch):
    """
    Belt and braces: even if FAISS itself refuses, the corpus is updated.

    Orphaned vectors are inert — `hybrid_search` drops any hit whose chunk_id is
    no longer in `self.chunks` — and `sync_from_db` reconciles the count on the
    next start. What must never happen is a retired document still being served.
    """
    r, _ = retriever

    def boom(*_args, **_kwargs):
        raise RuntimeError("faiss unavailable")

    monkeypatch.setattr(r._vectorstore, "delete", boom)

    r.remove_document("alpha")  # must not raise

    assert r.chunk_count == 2
    hits = r.hybrid_search("vancomycin dilution guidance", top_k=5)
    assert all(h["document_id"] == "beta" for h in hits)


def test_the_saved_index_survives_a_restart(retriever, monkeypatch, tmp_path):
    """The on-disk index is what a restart loads, so delete must persist."""
    r, embeddings = retriever

    r.remove_document("alpha")

    reloaded = HybridRetriever()
    assert reloaded.chunk_count == 2
    assert {c["document_id"] for c in reloaded.chunks} == {"beta"}
    assert reloaded._vectorstore.index.ntotal == 2
