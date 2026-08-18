"""
Apply the JSH 2026 formulary to a deployment, through the real API.

This exists so the formulary state is reproducible rather than the residue of
one session. Point it at any freshly migrated engine and it performs the same
three steps, in order, each through the endpoint a human would use — so every
change lands on the tamper-evident audit chain with an actor attached, exactly
as it would if someone clicked through the admin screens:

  1. **Retire** the rows the conversion supersedes. These are entries whose
     *name* was wrong (`acetylcystine`, `retaplase`), which the importer cannot
     correct in place; without this the drug ends up in the formulary twice.
  2. **Import** the converted CSV — dry run first, and it stops if the report
     rejects anything.
  3. **Approve** each drug named in the pharmacist review log, with that log's
     reviewer name and licence number.

Nothing here decides anything clinical. Steps 1 and 3 do what the manifest and
the review log say, and refuse when they say nothing.

Usage:
    python scripts/apply_jsh_formulary.py \
        --base-url http://127.0.0.1:8420 --token "$ENGINE_ADMIN_TOKEN" \
        --csv data/formulary/jsh_workbooks_import.csv \
        --manifest data/formulary/jsh_workbooks_import.manifest.json \
        --review-log data/formulary/pharmacist_review_log.csv

    # See what would happen without changing anything:
    python scripts/apply_jsh_formulary.py ... --dry-run
"""
import argparse
import csv
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path


class ApiError(RuntimeError):
    pass


def request(base_url, token, method, path, *, body=None, files=None):
    """One API call. Raises with the server's own message rather than a code."""
    url = f"{base_url.rstrip('/')}{path}"
    headers = {"Authorization": f"Bearer {token}"}

    if files:
        boundary = "----bnpformularyapply"
        parts = []
        for name, value in (body or {}).items():
            parts.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\""
                f"\r\n\r\n{value}\r\n".encode()
            )
        for name, (filename, content) in files.items():
            parts.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
                f"filename=\"{filename}\"\r\nContent-Type: text/csv\r\n\r\n".encode()
                + content
                + b"\r\n"
            )
        parts.append(f"--{boundary}--\r\n".encode())
        payload = b"".join(parts)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        payload = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    else:
        payload = None

    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read() or b"null")
    except urllib.error.HTTPError as e:
        raise ApiError(f"{method} {path} -> {e.code}: {e.read().decode()[:400]}") from e
    except urllib.error.URLError as e:
        raise ApiError(f"{method} {path} -> cannot reach {base_url}: {e.reason}") from e


PAGE = 2000  # the list endpoint's maximum


def live_drug_ids(base_url, token) -> dict:
    """
    generic_name -> drug_id for every live row.

    Paginated rather than asking for one big page: this formulary is heading
    for ~700 drugs and a silently truncated list would make the script skip
    retirements and approvals without saying so.
    """
    ids, offset = {}, 0
    while True:
        payload = request(
            base_url, token, "GET", f"/formulary?limit={PAGE}&offset={offset}"
        )
        drugs = payload if isinstance(payload, list) else payload.get("drugs", [])
        ids.update({d["generic_name"]: d["drug_id"] for d in drugs})
        if len(drugs) < PAGE:
            return ids
        offset += PAGE


# ── Step 1: retire superseded rows ────────────────────────────────────────────

def read_retirement_log(path: Path) -> list:
    """
    Retirements a pharmacist decided on, in the same shape the manifest uses.

    Separate from the manifest's `supersedes` because the two are found
    differently: the manifest's are mechanical (a name the converter can see is
    a misspelling of one it is importing), while these come from a human
    reading the queue and recognising that "epinephrine" and "adrenaline
    (epinephrine)" are one drug. Both end at the same endpoint.
    """
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    missing = {"drug", "reason", "retired_by"} - set(rows[0] if rows else {})
    if missing:
        raise ApiError(
            f"retirement log is missing {sorted(missing)}. A drug leaving a "
            "clinical formulary needs a recorded reason and a named actor."
        )
    return [
        {
            "retire": (r["drug"] or "").strip().lower(),
            "superseded_by": (r.get("superseded_by") or "").strip(),
            "reason": r["reason"].strip(),
            "retired_by": r["retired_by"].strip(),
        }
        for r in rows
    ]


def retire_superseded(base_url, token, manifest, ids, dry_run, extra=()) -> int:
    supersedes = (manifest.get("supersedes") or []) + list(extra)
    if not supersedes:
        print("  nothing to retire")
        return 0

    done = 0
    for item in supersedes:
        name, replacement = item["retire"], item["superseded_by"]
        drug_id = ids.get(name)
        if drug_id is None:
            print(f"  skip {name!r} — not live (already retired, or never imported)")
            continue
        if dry_run:
            print(f"  would retire {name!r} (superseded by {replacement!r})")
            done += 1
            continue
        request(base_url, token, "POST", f"/formulary/{drug_id}/retire", body={
            "reason": item.get("reason") or (
                "Superseded by the JSH 2026 structured formulary export, which "
                "spells this drug correctly. This row came from an automated "
                "table extraction of the source PDF and its name is wrong."
            ),
            "retired_by": item.get("retired_by")
            or manifest.get("retired_by", "formulary import"),
            "superseded_by": replacement,
        })
        print(f"  retired {name!r} -> {replacement!r}")
        done += 1
    return done


# ── Step 2: import ────────────────────────────────────────────────────────────

def import_csv(base_url, token, csv_path: Path, dry_run) -> dict:
    content = csv_path.read_bytes()

    report = request(
        base_url, token, "POST", "/formulary/import",
        body={"dry_run": "true"},
        files={"file": (csv_path.name, content)},
    )
    summary = report["summary"]
    print(f"  dry run: {summary}")
    if report["missing_columns"]:
        raise ApiError(f"missing columns: {report['missing_columns']}")
    if summary["rejected"]:
        for row in report["rows"]:
            if row["action"] == "rejected":
                print(f"    REJECTED {row['drug']}: {row['reason']}")
        raise ApiError(
            f"{summary['rejected']} rows rejected — not importing. Fix the "
            "converter; do not hand-edit the CSV."
        )
    if report.get("already_imported"):
        print("  this exact file has already been imported — nothing to do")
        return summary
    if dry_run:
        return summary

    report = request(
        base_url, token, "POST", "/formulary/import",
        body={"dry_run": "false"},
        files={"file": (csv_path.name, content)},
    )
    print(f"  applied:  {report['summary']}")
    return report["summary"]


# ── Step 3: approvals ─────────────────────────────────────────────────────────

REQUIRED_LOG_COLUMNS = {"drug", "decision", "reviewed_by", "reviewer_license"}


def apply_reviews(base_url, token, log_path: Path, ids, dry_run) -> int:
    rows = list(csv.DictReader(log_path.open(encoding="utf-8")))
    if not rows:
        print("  review log is empty — nothing approved")
        return 0

    missing = REQUIRED_LOG_COLUMNS - set(rows[0])
    if missing:
        raise ApiError(
            f"review log is missing {sorted(missing)}. A decision with no named "
            "reviewer and licence number is not a sign-off and will not be applied."
        )

    done, absent = 0, []
    for row in rows:
        name = (row["drug"] or "").strip().lower()
        drug_id = ids.get(name)
        if drug_id is None:
            absent.append(name)
            continue
        if dry_run:
            done += 1
            continue
        request(base_url, token, "POST", f"/formulary/{drug_id}/review", body={
            "decision": row["decision"].strip(),
            "reviewed_by": row["reviewed_by"].strip(),
            "reviewer_license": row["reviewer_license"].strip(),
            "note": (row.get("note") or "").strip() or None,
            "source_name": (row.get("source_name") or "").strip() or None,
            "source_edition": (row.get("source_edition") or "").strip() or None,
            "source_ref": (row.get("source_ref") or "").strip() or None,
        })
        done += 1

    print(f"  {'would apply' if dry_run else 'applied'} {done} decisions")
    if absent:
        print(f"  WARNING: {len(absent)} logged drugs are not in the formulary "
              f"and were NOT reviewed: {absent[:10]}")
    return done


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--token", required=True, help="an admin engine token")
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--review-log", type=Path)
    parser.add_argument(
        "--retirement-log", type=Path,
        help="drugs a pharmacist decided to withdraw, with a reason each",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="report every step without changing anything",
    )
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))

    try:
        print("1. retiring superseded rows")
        ids = live_drug_ids(args.base_url, args.token)
        extra = (
            read_retirement_log(args.retirement_log) if args.retirement_log else []
        )
        retire_superseded(
            args.base_url, args.token, manifest, ids, args.dry_run, extra
        )

        print("2. importing the converted formulary")
        import_csv(args.base_url, args.token, args.csv, args.dry_run)

        if args.review_log:
            print("3. applying pharmacist decisions")
            # Re-read: the import has just created most of these rows.
            ids = live_drug_ids(args.base_url, args.token)
            apply_reviews(args.base_url, args.token, args.review_log, ids, args.dry_run)
        else:
            print("3. no review log given — every imported drug stays PENDING, "
                  "and no dose will be quoted from it")

        summary = request(args.base_url, args.token, "GET", "/formulary/summary")
        print(f"\nformulary now: {summary}")
        chain = request(args.base_url, args.token, "GET", "/auth/audit-log/verify")
        print(f"audit chain:   {chain}")
        if not chain.get("valid"):
            print("AUDIT CHAIN IS NOT VALID — investigate before trusting this run.")
            return 1
    except ApiError as e:
        print(f"\nFAILED: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
