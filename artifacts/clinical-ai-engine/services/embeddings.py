"""
Hybrid Retrieval Engine — LangChain FAISS + OpenAI Embeddings
- Semantic search: FAISS via LangChain + text-embedding-3-small
- Keyword search:  BM25 (rank_bm25)
- Hybrid:          60% semantic + 40% keyword
Falls back to TF-IDF embeddings when OPENAI_API_KEY is not set.
"""
import os
import uuid
import logging
import pickle
import threading
import numpy as np
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

_HERE = Path(__file__).parent.parent          # artifacts/clinical-ai-engine/
INDEX_DIR = _HERE / "data" / "faiss_index"
INDEX_DIR.mkdir(parents=True, exist_ok=True)

FAISS_LANGCHAIN_PATH = str(INDEX_DIR / "lc_index")
META_PATH = INDEX_DIR / "meta.pkl"


# BM25 scores are unbounded; x/(x+k) maps them to (0, 1] with a stable meaning
# across queries. k is the score at which a chunk is considered a 50% keyword
# match.
BM25_SATURATION = 8.0

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536

# Written next to the index so a mismatch is detectable. Vectors embedded by one
# model are meaningless against another of the same width.
FINGERPRINT_PATH = INDEX_DIR / "embedding_model.txt"


class EmbeddingsUnavailable(RuntimeError):
    """Raised when no usable embedding backend exists."""


# ── Embedding backend ─────────────────────────────────────────────────────────
def _get_embeddings():
    """
    Return the OpenAI embeddings client, or raise.

    There is deliberately no fallback. The previous FakeEmbeddings fallback
    produced random vectors of the same width as the real index, so it loaded
    cleanly and then answered clinical questions from arbitrary chunks — with
    citations and a confidence score attached. A service that refuses to answer
    is recoverable; one that answers wrongly and looks right is not.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise EmbeddingsUnavailable("OPENAI_API_KEY is not set")

    try:
        from langchain_openai import OpenAIEmbeddings
        emb = OpenAIEmbeddings(
            model=EMBEDDING_MODEL,
            openai_api_key=api_key,
        )
        # Connectivity check — a key that cannot embed is not a usable key.
        emb.embed_query("test")
        logger.info(f"✅ OpenAI embeddings ({EMBEDDING_MODEL}) verified")
        return emb
    except EmbeddingsUnavailable:
        raise
    except Exception as e:
        raise EmbeddingsUnavailable(f"OpenAI embeddings unavailable: {e}") from e


class HybridRetriever:
    """
    Maintains a LangChain FAISS vector store for semantic similarity search
    and a BM25 index for keyword search.
    """

    def __init__(self):
        self.chunks: List[dict] = []        # metadata for all indexed chunks
        self.bm25 = None
        self._vectorstore = None
        self._embeddings = None
        self.degraded_reason: Optional[str] = None
        # Guards every mutation of (chunks, bm25, _vectorstore) as one unit.
        # Without it, a rebuild could renumber the corpus midway through a
        # search and BM25 scores would be attributed to the wrong chunks —
        # wrong citations on a clinical answer, not merely a crash.
        self._lock = threading.RLock()

        try:
            self._embeddings = _get_embeddings()
        except EmbeddingsUnavailable as e:
            # Stay up so /health can report why, but answer nothing.
            self.degraded_reason = str(e)
            logger.error(f"❌ Retriever degraded — {e}")
            return

        self._load_state()

    @property
    def is_available(self) -> bool:
        return self._embeddings is not None and self.degraded_reason is None

    # ── Persistence ───────────────────────────────────────────────────────────
    def _check_fingerprint(self) -> bool:
        """Refuse an index built by a different embedding model."""
        if not FINGERPRINT_PATH.exists():
            # Pre-dates fingerprinting; adopt the current model and record it.
            FINGERPRINT_PATH.write_text(EMBEDDING_MODEL, encoding="utf-8")
            return True

        stored = FINGERPRINT_PATH.read_text(encoding="utf-8").strip()
        if stored != EMBEDDING_MODEL:
            self.degraded_reason = (
                f"Index was built with '{stored}' but the service is configured "
                f"for '{EMBEDDING_MODEL}'. Re-index before serving queries."
            )
            logger.error(f"❌ {self.degraded_reason}")
            return False
        return True

    def _load_state(self):
        lc_path = Path(FAISS_LANGCHAIN_PATH)
        if lc_path.exists() and META_PATH.exists():
            if not self._check_fingerprint():
                self._reset()
                return
            try:
                from langchain_community.vectorstores import FAISS
                self._vectorstore = FAISS.load_local(
                    FAISS_LANGCHAIN_PATH,
                    self._embeddings,
                    allow_dangerous_deserialization=True,
                )
                with open(META_PATH, "rb") as f:
                    state = pickle.load(f)
                self.chunks = state["chunks"]
                self.bm25 = state["bm25"]
                logger.info(f"✅ Loaded LangChain FAISS index: {len(self.chunks)} chunks")
            except Exception as e:
                logger.warning(f"Could not load saved state: {e} — starting fresh")
                self._reset()
        else:
            self._reset()

    def _reset(self):
        self.chunks = []
        self.bm25 = None
        self._vectorstore = None

    def sync_from_db(self):
        """
        Rebuild FAISS from PostgreSQL if the DB has more chunks than in-memory index.
        Called on startup to recover from filesystem resets.
        """
        try:
            from models.database import db_cursor, DATABASE_URL
            if not DATABASE_URL:
                return

            with db_cursor() as (cur, _):
                cur.execute("""
                    SELECT c.chunk_id, c.content, c.page_number, c.chunk_index,
                           c.document_id, d.filename
                    FROM bnp_chunks c
                    JOIN bnp_documents d ON c.document_id = d.id
                    ORDER BY d.upload_date ASC, c.chunk_index ASC
                """)
                rows = cur.fetchall()

            if not rows:
                return

            db_chunk_count = len(rows)
            if db_chunk_count == self.chunk_count:
                logger.info(f"✅ FAISS in sync with DB ({db_chunk_count} chunks)")
                return

            logger.warning(
                f"⚠️  FAISS has {self.chunk_count} chunks but DB has {db_chunk_count} — rebuilding index…"
            )

            from langchain_community.vectorstores import FAISS
            from langchain_core.documents import Document

            # Build into locals first and only publish on success. Mutating
            # self.chunks before the embedding call meant that a transient
            # OpenAI error left chunks populated with no vectorstore: every
            # search then returned [] (so every clinical question answered
            # "insufficient data"), while /health still reported ok because
            # chunk_count was non-zero. A degraded engine must look degraded.
            lc_docs = []
            new_chunks = []
            for row in rows:
                meta = {
                    "chunk_id":      row["chunk_id"],
                    "document_id":   row["document_id"],
                    "document_name": row["filename"],
                    "page_number":   row["page_number"],
                    "chunk_index":   row["chunk_index"],
                }
                lc_docs.append(Document(page_content=row["content"], metadata=meta))
                new_chunks.append({"content": row["content"], **meta})

            vectorstore = FAISS.from_documents(lc_docs, self._embeddings)

            with self._lock:
                self.chunks = new_chunks
                self._vectorstore = vectorstore
                self._rebuild_bm25()
                self._save_state()
            logger.info(f"✅ FAISS rebuilt from DB: {len(self.chunks)} chunks")

        except Exception as e:
            # Leave the previously loaded index in place if there was one; if
            # there wasn't, mark the retriever degraded so /health fails and
            # queries are refused rather than silently answered from nothing.
            logger.error(f"sync_from_db error: {e}")
            if self._vectorstore is None:
                self.degraded_reason = (
                    f"Could not build the search index from the database: {e}"
                )

    def _save_state(self):
        try:
            if self._vectorstore:
                self._vectorstore.save_local(FAISS_LANGCHAIN_PATH)
            with open(META_PATH, "wb") as f:
                pickle.dump({"chunks": self.chunks, "bm25": self.bm25}, f)
        except Exception as e:
            logger.error(f"Save error: {e}")

    def _rebuild_bm25(self):
        from rank_bm25 import BM25Okapi
        tokenized = [c["content"].lower().split() for c in self.chunks]
        self.bm25 = BM25Okapi(tokenized) if tokenized else None

    # ── Indexing ──────────────────────────────────────────────────────────────
    def add_chunks(self, chunks: List[dict], document_id: str, document_name: str):
        """
        Add chunks to the FAISS and BM25 indexes.

        Each chunk must carry the `chunk_id` that was stored in bnp_chunks. The
        index used to mint its own uuid4 here, so the same physical chunk had two
        different identifiers and a citation could never be traced back to its
        database row.
        """
        from langchain_community.vectorstores import FAISS
        from langchain_core.documents import Document

        lc_docs = []
        new_chunks = []
        for chunk in chunks:
            chunk_id = chunk.get("chunk_id")
            if not chunk_id:
                raise ValueError(
                    "add_chunks requires a chunk_id matching the bnp_chunks row"
                )
            meta = {
                "chunk_id": chunk_id,
                "document_id": document_id,
                "document_name": document_name,
                "page_number": chunk.get("page_number", 1),
                "chunk_index": chunk.get("chunk_index", 0),
            }
            lc_docs.append(Document(page_content=chunk["content"], metadata=meta))
            new_chunks.append({"content": chunk["content"], **meta})

        # Embed outside the lock — it is a network call — then publish atomically.
        if self._vectorstore is None:
            vectorstore = FAISS.from_documents(lc_docs, self._embeddings)
        else:
            self._vectorstore.add_documents(lc_docs)
            vectorstore = self._vectorstore

        with self._lock:
            self._vectorstore = vectorstore
            self.chunks.extend(new_chunks)
            self._rebuild_bm25()
            self._save_state()
        logger.info(f"Indexed {len(chunks)} chunks for '{document_name}'")

    def remove_document(self, document_id: str):
        """Remove all chunks for a document and rebuild the full index."""
        before = len(self.chunks)
        remaining = [c for c in self.chunks if c["document_id"] != document_id]
        if len(remaining) == before:
            return  # Nothing to remove

        vectorstore = None
        if remaining:
            from langchain_community.vectorstores import FAISS
            from langchain_core.documents import Document
            lc_docs = [
                Document(
                    page_content=c["content"],
                    metadata={k: v for k, v in c.items() if k != "content"},
                )
                for c in remaining
            ]
            # NOTE: this re-embeds every remaining chunk, so deleting one
            # document costs a full-corpus embedding pass. Acceptable while
            # corpora are small; externalising the index (pgvector) is the fix.
            vectorstore = FAISS.from_documents(lc_docs, self._embeddings)

        with self._lock:
            self.chunks = remaining
            self._vectorstore = vectorstore
            self._rebuild_bm25()
            self._save_state()
        logger.info(f"Removed document {document_id}. Remaining chunks: {len(remaining)}")

    # ── Search ────────────────────────────────────────────────────────────────
    def hybrid_search(self, query: str, top_k: int = 5) -> List[dict]:
        """
        Hybrid search: 60% semantic (LangChain FAISS) + 40% keyword (BM25).
        Returns list of chunk dicts with 'relevance_score'.
        """
        if not self.is_available:
            raise EmbeddingsUnavailable(
                self.degraded_reason or "Retrieval backend unavailable"
            )

        # Take one consistent snapshot of (chunks, vectorstore, bm25). An upload
        # or delete running concurrently renumbers the corpus, and scoring
        # against a half-updated view attributes keyword scores to the wrong
        # chunks — i.e. wrong citations on a clinical answer.
        with self._lock:
            chunks = self.chunks
            vectorstore = self._vectorstore
            bm25 = self.bm25

        if not chunks or vectorstore is None:
            return []

        n = len(chunks)
        k = min(top_k, n)

        # chunk_id -> position, so scoring is O(k) rather than a linear scan per hit.
        index_of = {c.get("chunk_id"): i for i, c in enumerate(chunks)}

        # ── Semantic (FAISS similarity scores) ───────────────────────────────
        sem_scores = np.zeros(n, dtype=float)
        try:
            results_with_scores = vectorstore.similarity_search_with_score(query, k=k)
            # LangChain FAISS returns L2 distance (lower = better) — convert to similarity
            for doc, dist in results_with_scores:
                i = index_of.get(doc.metadata.get("chunk_id"))
                if i is not None:
                    # Convert L2 distance to similarity: 1 / (1 + dist)
                    sem_scores[i] = 1.0 / (1.0 + float(dist))
        except Exception as e:
            logger.error(f"FAISS search error: {e}")

        # Scores are deliberately NOT normalised by the best result in this
        # query. Dividing by the maximum makes the top chunk score ~1.0 for
        # every query, however irrelevant, which silently disabled the
        # confidence thresholds and made every answer read as "High confidence".
        # sem_scores are already an absolute 1/(1+L2) similarity in (0, 1].

        # ── Keyword (BM25) ───────────────────────────────────────────────────
        bm25_scores = np.zeros(n, dtype=float)
        if bm25 is not None:
            raw = np.array(bm25.get_scores(query.lower().split()), dtype=float)
            if raw.shape[0] != n:
                # Should be impossible now that chunks and bm25 are snapshotted
                # together, but scoring a mismatched vector would silently pair
                # each score with the wrong chunk. Drop the keyword signal
                # rather than cite the wrong source.
                logger.error(
                    f"BM25 length {raw.shape[0]} != corpus size {n}; "
                    "ignoring keyword scores for this query"
                )
            else:
                # BM25 is unbounded; map to (0, 1] with a fixed saturation
                # constant so the value means the same thing across queries.
                bm25_scores = np.clip(raw, 0, None)
                bm25_scores = bm25_scores / (bm25_scores + BM25_SATURATION)

        # ── Hybrid combination ────────────────────────────────────────────────
        combined = 0.6 * sem_scores + 0.4 * bm25_scores
        top_indices = np.argsort(combined)[::-1][:top_k]

        results = []
        for idx in top_indices:
            score = float(combined[idx])
            if score < 0.01:
                continue
            result = chunks[idx].copy()
            result["relevance_score"] = round(score, 4)
            results.append(result)

        return results

    @property
    def chunk_count(self) -> int:
        return len(self.chunks)


# ── Singleton ─────────────────────────────────────────────────────────────────
_retriever: Optional[HybridRetriever] = None


def get_retriever() -> HybridRetriever:
    global _retriever
    if _retriever is None:
        _retriever = HybridRetriever()
    return _retriever
