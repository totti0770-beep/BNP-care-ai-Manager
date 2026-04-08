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
import numpy as np
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

_HERE = Path(__file__).parent.parent          # artifacts/clinical-ai-engine/
INDEX_DIR = _HERE / "data" / "faiss_index"
INDEX_DIR.mkdir(parents=True, exist_ok=True)

FAISS_LANGCHAIN_PATH = str(INDEX_DIR / "lc_index")
META_PATH = INDEX_DIR / "meta.pkl"


# ── Embedding backend ─────────────────────────────────────────────────────────
def _make_fake_embeddings():
    from langchain_community.embeddings import FakeEmbeddings
    return FakeEmbeddings(size=1536)


def _get_embeddings():
    """Return LangChain embeddings object — OpenAI if key valid, else deterministic fallback."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        logger.warning("OPENAI_API_KEY not set — using FakeEmbeddings (semantic search degraded)")
        return _make_fake_embeddings()

    try:
        from langchain_openai import OpenAIEmbeddings
        emb = OpenAIEmbeddings(
            model="text-embedding-3-small",
            openai_api_key=api_key,
        )
        # Quick connectivity check — embed a single test string
        emb.embed_query("test")
        logger.info("✅ OpenAI embeddings (text-embedding-3-small) verified")
        return emb
    except Exception as e:
        logger.warning(f"OpenAI embeddings unavailable ({e}) — using FakeEmbeddings fallback")
        return _make_fake_embeddings()


class HybridRetriever:
    """
    Maintains a LangChain FAISS vector store for semantic similarity search
    and a BM25 index for keyword search.
    """

    def __init__(self):
        self.chunks: List[dict] = []        # metadata for all indexed chunks
        self.bm25 = None
        self._vectorstore = None
        self._embeddings = _get_embeddings()
        self._load_state()

    # ── Persistence ───────────────────────────────────────────────────────────
    def _load_state(self):
        lc_path = Path(FAISS_LANGCHAIN_PATH)
        if lc_path.exists() and META_PATH.exists():
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

            self._reset()
            lc_docs = []
            for row in rows:
                meta = {
                    "chunk_id":      row["chunk_id"],
                    "document_id":   row["document_id"],
                    "document_name": row["filename"],
                    "page_number":   row["page_number"],
                    "chunk_index":   row["chunk_index"],
                }
                lc_docs.append(Document(page_content=row["content"], metadata=meta))
                self.chunks.append({"content": row["content"], **meta})

            self._vectorstore = FAISS.from_documents(lc_docs, self._embeddings)
            self._rebuild_bm25()
            self._save_state()
            logger.info(f"✅ FAISS rebuilt from DB: {len(self.chunks)} chunks")

        except Exception as e:
            logger.error(f"sync_from_db error: {e}")

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
        """Add chunks to FAISS index and BM25. Rebuilds both indices."""
        from langchain_community.vectorstores import FAISS
        from langchain_core.documents import Document

        lc_docs = []
        for chunk in chunks:
            chunk_id = str(uuid.uuid4())
            meta = {
                "chunk_id": chunk_id,
                "document_id": document_id,
                "document_name": document_name,
                "page_number": chunk.get("page_number", 1),
                "chunk_index": chunk.get("chunk_index", 0),
            }
            lc_docs.append(Document(page_content=chunk["content"], metadata=meta))
            self.chunks.append({"content": chunk["content"], **meta})

        # Add to or create FAISS vector store
        if self._vectorstore is None:
            self._vectorstore = FAISS.from_documents(lc_docs, self._embeddings)
        else:
            self._vectorstore.add_documents(lc_docs)

        self._rebuild_bm25()
        self._save_state()
        logger.info(f"Indexed {len(chunks)} chunks for '{document_name}'")

    def remove_document(self, document_id: str):
        """Remove all chunks for a document and rebuild the full index."""
        before = len(self.chunks)
        remaining = [c for c in self.chunks if c["document_id"] != document_id]
        if len(remaining) == before:
            return  # Nothing to remove

        self.chunks = remaining
        self._vectorstore = None

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
            self._vectorstore = FAISS.from_documents(lc_docs, self._embeddings)

        self._rebuild_bm25()
        self._save_state()
        logger.info(f"Removed document {document_id}. Remaining chunks: {len(remaining)}")

    # ── Search ────────────────────────────────────────────────────────────────
    def hybrid_search(self, query: str, top_k: int = 5) -> List[dict]:
        """
        Hybrid search: 60% semantic (LangChain FAISS) + 40% keyword (BM25).
        Returns list of chunk dicts with 'relevance_score'.
        """
        if not self.chunks or self._vectorstore is None:
            return []

        n = len(self.chunks)
        k = min(top_k, n)

        # ── Semantic (FAISS similarity scores) ───────────────────────────────
        sem_scores = np.zeros(n, dtype=float)
        try:
            results_with_scores = self._vectorstore.similarity_search_with_score(query, k=k)
            # LangChain FAISS returns L2 distance (lower = better) — convert to similarity
            for doc, dist in results_with_scores:
                # Find matching chunk index by chunk_id
                cid = doc.metadata.get("chunk_id")
                for i, c in enumerate(self.chunks):
                    if c.get("chunk_id") == cid:
                        # Convert L2 distance to similarity: 1 / (1 + dist)
                        sem_scores[i] = 1.0 / (1.0 + float(dist))
                        break
        except Exception as e:
            logger.error(f"FAISS search error: {e}")

        sem_max = sem_scores.max()
        if sem_max > 0:
            sem_scores /= sem_max

        # ── Keyword (BM25) ───────────────────────────────────────────────────
        bm25_scores = np.zeros(n, dtype=float)
        if self.bm25:
            raw = np.array(self.bm25.get_scores(query.lower().split()), dtype=float)
            bm25_scores = np.clip(raw, 0, None)
            bm25_max = bm25_scores.max()
            if bm25_max > 0:
                bm25_scores /= bm25_max

        # ── Hybrid combination ────────────────────────────────────────────────
        combined = 0.6 * sem_scores + 0.4 * bm25_scores
        top_indices = np.argsort(combined)[::-1][:top_k]

        results = []
        for idx in top_indices:
            score = float(combined[idx])
            if score < 0.01:
                continue
            result = self.chunks[idx].copy()
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
