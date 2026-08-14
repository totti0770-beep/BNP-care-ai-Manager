"""Baseline schema.

Every statement is idempotent, because this revision has to be applicable to
three different starting points: a brand-new database, a database created by an
older build of init_db() (which had no external_id and none of the extended
audit columns), and a database created by the current init_db(). Running it is
always safe; there is nothing to stamp by hand.

Later revisions are ordinary, non-idempotent Alembic migrations.

Revision ID: 0001_baseline
Revises:
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


BASELINE = """
CREATE TABLE IF NOT EXISTS bnp_users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name   VARCHAR(200),
    role        VARCHAR(50) DEFAULT 'user',
    external_id VARCHAR(255),
    created_at  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE bnp_users ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

-- Partial, so many rows may have a NULL external_id (local password accounts)
-- while every externally-authenticated identity stays unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external
    ON bnp_users(external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bnp_documents (
    id          VARCHAR(64) PRIMARY KEY,
    filename    TEXT NOT NULL,
    uploaded_by INTEGER REFERENCES bnp_users(id),
    upload_date TIMESTAMP DEFAULT NOW(),
    chunk_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bnp_chunks (
    id          SERIAL PRIMARY KEY,
    chunk_id    VARCHAR(128) UNIQUE NOT NULL,
    document_id VARCHAR(64) REFERENCES bnp_documents(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    page_number INTEGER DEFAULT 1,
    chunk_index INTEGER DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bnp_audit_log (
    id          SERIAL PRIMARY KEY,
    session_id  VARCHAR(128) NOT NULL,
    user_id     INTEGER REFERENCES bnp_users(id),
    username    VARCHAR(100),
    query       TEXT NOT NULL,
    query_type  VARCHAR(50),
    confidence  FLOAT DEFAULT 0,
    rejected    BOOLEAN DEFAULT FALSE,
    answer_hash TEXT,
    timestamp   TIMESTAMP DEFAULT NOW()
);

-- The audit log must answer "what did the system tell this nurse, from which
-- sources, at this time?", so the answer itself is recorded, not just the
-- question.
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS answer_text      TEXT;
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS dose_text        TEXT;
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS citations        JSONB;
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS safety_alerts    JSONB;
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS confidence_label VARCHAR(20);
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS client_ip        VARCHAR(64);
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS user_agent       TEXT;
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS model            VARCHAR(100);
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS drug_db_version  VARCHAR(50);
ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS engine_version   VARCHAR(50);

-- Re-uploading the same PDF used to create a duplicate chunk set with nothing
-- to detect it; retrieval then returned one document twice as two independent
-- sources, which inflates the confidence label.
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_index
    ON bnp_chunks(document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_audit_user      ON bnp_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_session   ON bnp_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON bnp_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chunks_doc      ON bnp_chunks(document_id);
"""


def upgrade() -> None:
    op.execute(BASELINE)


def downgrade() -> None:
    # No downgrade. Dropping these tables destroys the clinical audit trail;
    # recovery is a restore from backup, not a schema operation.
    raise NotImplementedError(
        "The baseline is not reversible: it would drop the audit trail."
    )
