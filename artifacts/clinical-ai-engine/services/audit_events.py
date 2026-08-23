"""
Record formulary governance events on the same audit chain as clinical answers.

An import that changed a dose, and a pharmacist's approval of one, are exactly
the events an accreditation review asks to see. They belong on the tamper-evident
chain rather than in a log file, and on the *same* chain as the answers they
govern — one continuous record is verifiable end to end, two parallel ones are
not.

`bnp_audit_log` is shaped around clinical queries, so a governance event borrows
that shape: `query` states what was requested, `answer_text` states what
happened, `formulary_drug_id` names the drug where there is one.
"""
import json
import logging
import uuid
from typing import Optional

from models.database import db_cursor

logger = logging.getLogger(__name__)


INSERT_SQL = """
    INSERT INTO bnp_audit_log
      (session_id, user_id, username, query, query_type, confidence, rejected,
       answer_text, answer_hash, citations, safety_alerts, client_ip,
       user_agent, model, drug_db_version, engine_version,
       formulary_drug_id, prev_hash, chain_hash)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s)
"""


def record_formulary_event(
    *,
    user_id: int,
    username: str,
    action: str,
    detail: str,
    drug_id: Optional[str] = None,
    rejected: bool = False,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> str:
    """
    Append one governance event and return its session id.

    Raises on failure, like the clinical audit write: an unrecorded approval is
    an approval that cannot be evidenced, which is the same as not having one.
    """
    import hashlib

    from routers.query import (
        ENGINE_VERSION,
        GENESIS_HASH,
        compute_chain_hash,
    )
    from services.formulary import get_formulary

    session_id = f"bnp-formulary-{uuid.uuid4().hex[:12]}"
    answer_hash = hashlib.sha256(detail.encode("utf-8")).hexdigest()

    with db_cursor() as (cur, _):
        cur.execute(
            "SELECT chain_hash FROM bnp_audit_log ORDER BY id DESC LIMIT 1 FOR UPDATE"
        )
        row = cur.fetchone()
        prev_hash = (row["chain_hash"] if row else None) or GENESIS_HASH

        chain_hash = compute_chain_hash(
            prev_hash=prev_hash,
            session_id=session_id,
            username=username,
            query=action,
            answer=detail,
            rejected=rejected,
            citations="[]",
        )

        cur.execute(
            INSERT_SQL,
            (
                session_id, user_id, username, action, "formulary", 0.0, rejected,
                detail, answer_hash, "[]", json.dumps([]), client_ip, user_agent,
                None, get_formulary().version(), ENGINE_VERSION,
                drug_id, prev_hash, chain_hash,
            ),
        )

    logger.info("Formulary event recorded: %s by %s", action, username)
    return session_id
