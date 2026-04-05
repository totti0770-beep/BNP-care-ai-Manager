"""
Hybrid Retrieval Engine
- Semantic search: FAISS + TF-IDF embeddings (sklearn)
- Keyword search: BM25 (rank_bm25)
- Hybrid: weighted combination of both scores
"""
import os
import uuid
import logging
import pickle
import numpy as np
from pathlib import Path
from typing import List, Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine
from rank_bm25 import BM25Okapi
import faiss

logger = logging.getLogger(__name__)

INDEX_DIR = Path("data/faiss_index")
INDEX_DIR.mkdir(parents=True, exist_ok=True)

FAISS_INDEX_PATH = INDEX_DIR / "index.faiss"
META_PATH = INDEX_DIR / "meta.pkl"
TF_IDF_DIM = 1024


class HybridRetriever:
    """
    Maintains a FAISS index for semantic similarity search,
    and a BM25 index for keyword search.
    Combines scores for hybrid retrieval.
    """

    def __init__(self):
        self.chunks: List[dict] = []
        self.tfidf = TfidfVectorizer(max_features=TF_IDF_DIM, ngram_range=(1, 2), sublinear_tf=True)
        self.tfidf_matrix = None
        self.bm25: Optional[BM25Okapi] = None
        self.faiss_index: Optional[faiss.Index] = None
        self._load_state()

    # ── Persistence ───────────────────────────────────────────────────────────
    def _load_state(self):
        if META_PATH.exists() and FAISS_INDEX_PATH.exists():
            try:
                with open(META_PATH, "rb") as f:
                    state = pickle.load(f)
                self.chunks = state["chunks"]
                self.tfidf = state["tfidf"]
                self.tfidf_matrix = state["tfidf_matrix"]
                self.bm25 = state["bm25"]
                self.faiss_index = faiss.read_index(str(FAISS_INDEX_PATH))
                logger.info(f"✅ Loaded retriever: {len(self.chunks)} chunks")
            except Exception as e:
                logger.warning(f"Could not load saved state: {e} — starting fresh")
                self._reset()
        else:
            self._reset()

    def _reset(self):
        self.chunks = []
        self.tfidf_matrix = None
        self.bm25 = None
        self.faiss_index = None

    def _save_state(self):
        try:
            state = {
                "chunks": self.chunks,
                "tfidf": self.tfidf,
                "tfidf_matrix": self.tfidf_matrix,
                "bm25": self.bm25,
            }
            with open(META_PATH, "wb") as f:
                pickle.dump(state, f)
            if self.faiss_index is not None:
                faiss.write_index(self.faiss_index, str(FAISS_INDEX_PATH))
        except Exception as e:
            logger.error(f"Save error: {e}")

    # ── Indexing ──────────────────────────────────────────────────────────────
    def _rebuild_indices(self):
        """Rebuild TF-IDF, FAISS, and BM25 from self.chunks."""
        if not self.chunks:
            return

        texts = [c["content"] for c in self.chunks]

        # TF-IDF + FAISS
        self.tfidf_matrix = self.tfidf.fit_transform(texts).toarray().astype("float32")
        norms = np.linalg.norm(self.tfidf_matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1
        self.tfidf_matrix = self.tfidf_matrix / norms   # L2-normalise

        dim = self.tfidf_matrix.shape[1]
        self.faiss_index = faiss.IndexFlatIP(dim)       # Inner product = cosine on normalised vecs
        self.faiss_index.add(self.tfidf_matrix)

        # BM25
        tokenized = [t.lower().split() for t in texts]
        self.bm25 = BM25Okapi(tokenized)

        logger.info(f"Rebuilt indices: {len(self.chunks)} chunks, FAISS dim={dim}")

    def add_chunks(self, chunks: List[dict], document_id: str, document_name: str):
        """Add new chunks to the index (incremental)."""
        for chunk in chunks:
            chunk_id = str(uuid.uuid4())
            self.chunks.append({
                "chunk_id": chunk_id,
                "document_id": document_id,
                "document_name": document_name,
                "content": chunk["content"],
                "page_number": chunk.get("page_number", 1),
                "chunk_index": chunk.get("chunk_index", 0),
            })

        self._rebuild_indices()
        self._save_state()
        logger.info(f"Added {len(chunks)} chunks for doc '{document_name}'")

    def remove_document(self, document_id: str):
        """Remove all chunks for a document and rebuild."""
        before = len(self.chunks)
        self.chunks = [c for c in self.chunks if c["document_id"] != document_id]
        if len(self.chunks) < before:
            self._rebuild_indices()
            self._save_state()

    # ── Search ────────────────────────────────────────────────────────────────
    def hybrid_search(self, query: str, top_k: int = 5) -> List[dict]:
        """
        Hybrid search: 60% semantic (FAISS) + 40% keyword (BM25).
        Returns top_k results with combined relevance score.
        """
        if not self.chunks or self.faiss_index is None:
            return []

        texts = [c["content"] for c in self.chunks]
        n = len(texts)
        k = min(top_k, n)

        # ── Semantic (TF-IDF + FAISS) ────────────────────────────────────────
        query_vec = self.tfidf.transform([query]).toarray().astype("float32")
        norm = np.linalg.norm(query_vec)
        if norm > 0:
            query_vec = query_vec / norm

        semantic_scores_np = np.zeros(n, dtype=float)
        if self.faiss_index.ntotal > 0:
            D, I = self.faiss_index.search(query_vec, k)
            for rank, idx in enumerate(I[0]):
                if 0 <= idx < n:
                    semantic_scores_np[idx] = float(D[0][rank])

        # Normalize to [0,1]
        sem_max = semantic_scores_np.max()
        if sem_max > 0:
            semantic_scores_np /= sem_max

        # ── Keyword (BM25) ───────────────────────────────────────────────────
        bm25_scores = np.array(self.bm25.get_scores(query.lower().split()), dtype=float)
        bm25_max = bm25_scores.max()
        if bm25_max > 0:
            bm25_scores /= bm25_max

        # ── Hybrid combination ───────────────────────────────────────────────
        combined = 0.6 * semantic_scores_np + 0.4 * bm25_scores

        top_indices = np.argsort(combined)[::-1][:top_k]

        results = []
        for idx in top_indices:
            score = float(combined[idx])
            if score < 0.01:
                continue
            chunk = self.chunks[idx].copy()
            chunk["relevance_score"] = round(score, 4)
            results.append(chunk)

        return results

    @property
    def chunk_count(self) -> int:
        return len(self.chunks)

    def get_document_chunks(self, document_id: str) -> List[dict]:
        return [c for c in self.chunks if c["document_id"] == document_id]


# Singleton
_retriever: Optional[HybridRetriever] = None


def get_retriever() -> HybridRetriever:
    global _retriever
    if _retriever is None:
        _retriever = HybridRetriever()
    return _retriever
