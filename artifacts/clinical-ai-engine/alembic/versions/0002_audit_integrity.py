"""Preserve audit evidence, and make the audit trail tamper-evident.

Two problems this fixes.

First, deleting a document hard-deleted it and cascaded to its chunks, so the
text a past recommendation was generated from disappeared. An audit row would
still say "file X, page 12" while the passage itself no longer existed — which
defeats the purpose of recording the citation at all. Documents and chunks are
now retired rather than removed: they stop being retrievable, and stay
resolvable.

Second, `answer_hash` was written by the same process that wrote the row, with
nothing binding a row to the one before it, so any single row could be edited
and re-hashed undetectably. Each row now carries the previous row's chain hash,
so altering or removing one breaks every hash after it.

Revision ID: 0002_audit_integrity
Revises: 0001_baseline
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002_audit_integrity"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UPGRADE = """
-- ── Soft delete ───────────────────────────────────────────────────────────
ALTER TABLE bnp_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE bnp_chunks    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Cascading a document delete removed the evidence behind past clinical
-- advice. Retiring a document must never destroy it.
ALTER TABLE bnp_chunks DROP CONSTRAINT IF EXISTS bnp_chunks_document_id_fkey;
ALTER TABLE bnp_chunks
    ADD CONSTRAINT bnp_chunks_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES bnp_documents(id) ON DELETE RESTRICT;

-- Live documents only; retired rows keep their old (document_id, chunk_index)
-- so re-uploading the same document later cannot collide with them.
DROP INDEX IF EXISTS idx_chunks_doc_index;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_index_live
    ON bnp_chunks(document_id, chunk_index) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_live
    ON bnp_documents(upload_date DESC) WHERE deleted_at IS NULL;

-- ── Tamper-evident audit chain ────────────────────────────────────────────
-- chain_hash = sha256(prev_chain_hash || row content). Verifiable end to end;
-- see GET /auth/audit-log/verify.
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS prev_hash  TEXT;
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS chain_hash TEXT;
"""


def upgrade() -> None:
    op.execute(UPGRADE)


def downgrade() -> None:
    raise NotImplementedError(
        "Not reversible: restoring ON DELETE CASCADE would allow the audit "
        "trail's source evidence to be destroyed."
    )
