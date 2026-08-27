# Clinical AI Engine — FastAPI + FAISS/BM25 hybrid retrieval.
# Build from the repository root:
#   docker build -f artifacts/clinical-ai-engine/Dockerfile -t bnp-engine .
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# psycopg2-binary ships wheels, but faiss and pypdf builds want a toolchain on
# some architectures.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl gosu \
    && rm -rf /var/lib/apt/lists/*

COPY artifacts/clinical-ai-engine/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY artifacts/clinical-ai-engine/ ./

# The index is runtime state, rebuilt from the bnp_chunks table on startup.
# Mount a volume here to persist it across restarts and avoid re-embedding the
# whole corpus (which costs both minutes and money) on every cold start.
RUN mkdir -p /app/data && \
    useradd --create-home --uid 10001 engine && \
    chown -R engine:engine /app

# Starts as root so the entrypoint can chown the mounted volume, then drops to
# `engine` with gosu before exec'ing the server. Deliberately not `USER engine`:
# a volume is attached root-owned and covers the build-time chown above, so a
# non-root process cannot create the index directory inside it.
ENTRYPOINT ["/app/entrypoint.sh"]

EXPOSE 8000

# Reports healthy only when the database, embeddings and index are all usable —
# so an unusable engine fails its deploy instead of silently serving nothing.
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# No --reload: it watches the filesystem, re-imports on every index write, and
# forces a single worker. Workers stay at 1 regardless — the retriever is a
# process-global singleton with no cross-process locking.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
