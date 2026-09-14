"""Give a clinical document a lifecycle, so "approved knowledge" is a constraint.

Until now an uploaded PDF was citable as clinical evidence the moment it landed.
`bnp_documents` recorded who uploaded it and when, and nothing else: no status,
no version, no effective or expiry date, no approver. Retrieval filtered on
exactly one thing — that neither the chunk nor its document had been soft
deleted — so the engine could not tell a P&T-approved formulary from a draft
somebody uploaded by mistake, and a protocol that expired last year stayed
citable forever.

The drug table has been governed this way since 0003: `review_status`,
`reviewed_by`, `reviewer_license`, `source_ref`, `version`. This brings the
document corpus up to the same standard, because a dose quoted from an expired
protocol is no safer than a dose nobody signed off.

Two behaviours follow, and both are deliberate:

  * A new upload lands `pending` and is NOT indexed. It cannot be retrieved,
    cited, or reach a nurse until an admin approves it. Uploading is no longer
    the same act as publishing.

  * Documents already in the corpus are backfilled to `approved` and marked
    `backfill: pre-governance upload`. They predate this rule, so grandfathering
    them is a decision rather than an oversight — and recording it in
    `approved_by` keeps them queryable as a distinct set, so they can be given
    retrospective sign-off without guessing which ones they were.

The alternative was to backfill `pending`, which is the stricter reading. It was
rejected knowingly: it would take the live corpus silent at the instant this
migration ran, and a clinical engine that answers nothing is its own hazard.

Revision ID: 0004_document_lifecycle
Revises: 0003_drug_formulary
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004_document_lifecycle"
down_revision: Union[str, None] = "0003_drug_formulary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UPGRADE = """
-- ── Lifecycle columns ─────────────────────────────────────────────────────
-- NOT NULL DEFAULT 'pending' is the fail-closed direction: a row that arrives
-- without anyone stating a status is not approved knowledge.
ALTER TABLE bnp_documents
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE bnp_documents
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- DATE, not TIMESTAMP. Clinical validity is stated by a committee in days, and
-- a timestamp would invent a precision the source document does not have.
ALTER TABLE bnp_documents ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE bnp_documents ADD COLUMN IF NOT EXISTS expiry_date    DATE;

ALTER TABLE bnp_documents ADD COLUMN IF NOT EXISTS approved_by  VARCHAR(200);
ALTER TABLE bnp_documents ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMP;

-- The document that replaced this one. Not a foreign key: the replacement may
-- be retired later, and losing the link would erase why this row was withdrawn.
ALTER TABLE bnp_documents ADD COLUMN IF NOT EXISTS superseded_by VARCHAR(64);

-- Edition, committee, page range — whatever identifies the paper original.
ALTER TABLE bnp_documents ADD COLUMN IF NOT EXISTS source_note TEXT;

-- ── Constraints ───────────────────────────────────────────────────────────
-- A status outside this set would be read as "not approved" by the retrieval
-- filter and as "fine" by a human reading the table. Reject it at the door.
ALTER TABLE bnp_documents DROP CONSTRAINT IF EXISTS ck_documents_status;
ALTER TABLE bnp_documents
    ADD CONSTRAINT ck_documents_status
    CHECK (status IN ('pending', 'approved', 'retired', 'superseded'));

-- A window that closes before it opens is a data-entry error, and it would
-- silently make the document invisible rather than loudly wrong.
ALTER TABLE bnp_documents DROP CONSTRAINT IF EXISTS ck_documents_validity_window;
ALTER TABLE bnp_documents
    ADD CONSTRAINT ck_documents_validity_window
    CHECK (
        effective_date IS NULL
        OR expiry_date IS NULL
        OR expiry_date > effective_date
    );

-- An approved document must say who approved it. Approval with no name is the
-- accountability gap this whole migration exists to close.
ALTER TABLE bnp_documents DROP CONSTRAINT IF EXISTS ck_documents_approver_present;
ALTER TABLE bnp_documents
    ADD CONSTRAINT ck_documents_approver_present
    CHECK (
        status <> 'approved'
        OR (approved_by IS NOT NULL AND length(trim(approved_by)) > 0)
    );

-- The retrieval query filters on status among live rows; this is its index.
CREATE INDEX IF NOT EXISTS idx_documents_approved
    ON bnp_documents(status) WHERE deleted_at IS NULL;

-- ── Grandfather the corpus that predates this rule ────────────────────────
-- A ONE-TIME step, run by Alembic exactly once. Every live document existing
-- at this instant predates the rule by definition — `status` did not exist a
-- few statements ago — so "live and still at the column default" identifies
-- them exactly, and a retired row is left alone rather than resurrected.
--
-- Do not execute this block by hand against a running system. After go-live a
-- live `pending` row is a legitimate upload waiting for its reviewer, and
-- re-running this would approve it in that reviewer's place. Alembic's version
-- table is what prevents that, and `alembic upgrade head` is a no-op once the
-- revision is applied.
--
-- The before/after counts are measured around the UPDATE inside one
-- transaction, so the exception can only fire if the UPDATE itself failed to
-- take — never because someone uploaded a document in the meantime. Deploying
-- an engine whose corpus silently went empty is worse than a failed deploy:
-- /health stays green while every clinical question answers "insufficient
-- data".
DO $$
DECLARE
    grandfathered INTEGER;
    stranded      INTEGER;
BEGIN
    SELECT count(*) INTO grandfathered
      FROM bnp_documents
     WHERE deleted_at IS NULL AND status = 'pending' AND approved_by IS NULL;

    UPDATE bnp_documents
       SET status      = 'approved',
           approved_by = 'backfill: pre-governance upload',
           approved_at = upload_date
     WHERE deleted_at IS NULL AND status = 'pending' AND approved_by IS NULL;

    SELECT count(*) INTO stranded
      FROM bnp_documents
     WHERE deleted_at IS NULL AND status = 'pending' AND approved_by IS NULL;

    IF stranded > 0 THEN
        RAISE EXCEPTION
            'Backfill left % live document(s) pending; the corpus would serve '
            'nothing. Refusing to complete.', stranded;
    END IF;

    RAISE NOTICE
        'Grandfathered % pre-governance document(s) as approved.', grandfathered;
END $$;
"""


def upgrade() -> None:
    op.execute(UPGRADE)


def downgrade() -> None:
    raise NotImplementedError(
        "Not reversible: dropping these columns would make every unapproved and "
        "expired document retrievable again as clinical evidence."
    )
