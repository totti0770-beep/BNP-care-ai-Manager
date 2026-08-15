"""
The medication formulary, read from the database.

Replaces the dict literal that used to live in `services/drug_calculator.py`.
The data now arrives by import from the hospital formulary, each row carrying
its source and its pharmacist review status, so coverage grows without anyone
editing Python and without anyone inventing a number.

Concurrency follows the shape already used by the retriever in
`services/embeddings.py`: a reload builds into locals and publishes only on
success, every mutation happens under one lock, and readers take a snapshot.
A half-built formulary must never be visible to a clinical question.
"""
import logging
import threading
from typing import Dict, List, Optional, Tuple

from models.formulary import CoverageStatus, DrugEntry, ReviewStatus

logger = logging.getLogger(__name__)


SELECT_LIVE = """
    SELECT drug_id, generic_name, name_ar, aliases, unit, auto_calculate,
           dose_per_kg, adult_flat_min, adult_flat_max, adult_max_dose,
           adult_max_daily, adult_max_daily_elderly,
           pediatric_min_per_kg, pediatric_max_per_kg,
           pediatric_max_daily_per_kg, pediatric_max_doses_per_day,
           overdose_threshold_absolute, overdose_threshold_per_kg,
           frequency, route, antidote, reference_regimen,
           contraindications, interactions, warnings, high_risk,
           source_name, source_edition, source_ref,
           review_status, reviewed_by, reviewer_license, reviewed_at, version
    FROM bnp_drug_formulary
    WHERE retired_at IS NULL
    ORDER BY generic_name
"""


class FormularyUnavailable(RuntimeError):
    """
    The formulary could not be loaded.

    Raised rather than reporting every drug as uncovered. "Not covered" is a
    clinical statement — it tells a nurse the system checked and found nothing.
    Saying that because the database is unreachable would be a lie, and it is
    the kind of lie that reads as reassurance.
    """


class Formulary:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._entries: Tuple[DrugEntry, ...] = ()
        self._by_name: Dict[str, DrugEntry] = {}
        self._loaded = False
        self.degraded_reason: Optional[str] = None

    # ── Loading ───────────────────────────────────────────────────────────────

    def reload(self) -> int:
        """
        Rebuild the in-memory formulary from the database.

        Returns the number of live entries. On failure the previous snapshot is
        left in place; if there was none, the formulary is marked degraded and
        every lookup raises rather than answering from nothing.
        """
        try:
            from models.database import db_cursor

            with db_cursor() as (cur, _):
                cur.execute(SELECT_LIVE)
                rows = cur.fetchall()

            entries = tuple(DrugEntry.from_row(dict(r)) for r in rows)
            by_name: Dict[str, DrugEntry] = {}
            for entry in entries:
                by_name[entry.generic_name] = entry
                if entry.name_ar:
                    by_name[entry.name_ar.strip().lower()] = entry
                for alias in entry.aliases:
                    # A generic name always wins over another drug's alias.
                    by_name.setdefault(alias, entry)

            with self._lock:
                self._entries = entries
                self._by_name = by_name
                self._loaded = True
                self.degraded_reason = None

            approved = sum(1 for e in entries if e.review_status is ReviewStatus.APPROVED)
            logger.info(
                f"✅ Formulary loaded: {len(entries)} drugs, {approved} approved"
            )
            return len(entries)

        except Exception as e:
            logger.error(f"Formulary load failed: {e}")
            with self._lock:
                if not self._loaded:
                    self.degraded_reason = (
                        f"Could not load the medication formulary: {e}"
                    )
            return len(self._entries)

    # ── Reading ───────────────────────────────────────────────────────────────

    def _snapshot(self) -> Tuple[Dict[str, DrugEntry], Tuple[DrugEntry, ...]]:
        with self._lock:
            if not self._loaded:
                raise FormularyUnavailable(
                    self.degraded_reason or "The medication formulary is not loaded"
                )
            return self._by_name, self._entries

    @property
    def is_available(self) -> bool:
        with self._lock:
            return self._loaded and self.degraded_reason is None

    def all(self) -> Tuple[DrugEntry, ...]:
        _, entries = self._snapshot()
        return entries

    def get(self, term: str) -> Optional[DrugEntry]:
        """Look up by generic name, Arabic name, or alias."""
        by_name, _ = self._snapshot()
        return by_name.get((term or "").strip().lower())

    def coverage_status(self, term: str) -> CoverageStatus:
        entry = self.get(term)
        return entry.coverage if entry else CoverageStatus.NOT_IN_FORMULARY

    def find_in_text(self, text: str) -> Optional[DrugEntry]:
        """
        Find the drug a free-text question is about.

        Whole-word matching only, so "hep" does not match "hepatic". Longer
        names are tried first: "insulin glargine" must not resolve to "insulin"
        when both are in the formulary.
        """
        import re

        haystack = (text or "").lower()
        if not haystack:
            return None

        by_name, _ = self._snapshot()
        for term in sorted(by_name, key=len, reverse=True):
            if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", haystack):
                return by_name[term]
        return None

    def counts(self) -> Dict[str, int]:
        """Approval tally, for /health and the review screen."""
        try:
            _, entries = self._snapshot()
        except FormularyUnavailable:
            return {"total": 0, "approved": 0, "pending": 0, "rejected": 0}
        tally = {"total": len(entries), "approved": 0, "pending": 0, "rejected": 0}
        for entry in entries:
            tally[entry.review_status.value] += 1
        return tally

    def review_summary(self) -> str:
        """
        The line reported by /health and shown beside any dose.

        Stays UNVERIFIED while a single drug is unreviewed, because a nurse
        cannot be expected to remember which subset was signed off.
        """
        tally = self.counts()
        if not tally["total"]:
            return "EMPTY — no formulary loaded"
        if tally["approved"] == tally["total"]:
            return f"VERIFIED — {tally['approved']}/{tally['total']} pharmacist-approved"
        return (
            f"UNVERIFIED — {tally['approved']}/{tally['total']} pharmacist-approved, "
            f"{tally['pending']} pending review"
        )

    def version(self) -> str:
        """
        Recorded on every audit row so a past recommendation is reproducible.

        Derived from the data rather than hand-maintained: the old constant had
        to be remembered on every edit, and was not.
        """
        try:
            _, entries = self._snapshot()
        except FormularyUnavailable:
            return "unavailable"
        if not entries:
            return "empty"
        total_versions = sum(e.version for e in entries)
        return f"{len(entries)}d-v{total_versions}"


_formulary: Optional[Formulary] = None
_singleton_lock = threading.Lock()


def get_formulary() -> Formulary:
    global _formulary
    if _formulary is None:
        with _singleton_lock:
            if _formulary is None:
                _formulary = Formulary()
    return _formulary


def reset_formulary() -> None:
    """Test hook — drops the singleton so a fixture can install its own."""
    global _formulary
    with _singleton_lock:
        _formulary = None
