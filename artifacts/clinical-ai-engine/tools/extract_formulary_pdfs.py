"""
Extract formulary rows from the hospital's pharmacy PDFs, mechanically.

Reads the Adult Parenteral Dilution Manual and the Adult IV Drip Chart and
emits one CSV in the formulary importer's canonical columns, ready for
`POST /formulary/import`.

Ground rules, in order of importance:

  * **Nothing is authored.** Every value in the output is text lifted from a
    table cell or a labelled assembly of such text. A field the document does
    not provide stays blank. A row that cannot be parsed cleanly is reported
    and dropped, never repaired.
  * **`auto_calculate` is False on every row.** These are administration and
    dilution references, not dosing references — they carry concentrations,
    rates and monitoring, not per-dose ranges. No number must ever be computed
    from them. What a nurse gets is the regimen text, verbatim, plus coverage
    visibility.
  * **Every row cites its page.** `source_ref` is the PDF page the row came
    from, so the reviewing pharmacist opens the same document to the same page.
  * **Rows that collide with an existing formulary entry are skipped** and
    listed at the end. An import would otherwise overwrite that entry's dose
    fields with blanks (this manual has none), which silently discards data a
    pharmacist could have reviewed. Which source wins for those drugs is a
    pharmacist's call, made in the review screen, not here.
  * **A near-miss spelling is not a new drug.** A name one short edit away
    from an existing one (e.g. the manual's "digoxine" vs. the formulary's
    "digoxin") is excluded from the CSV and reported in the manifest as a
    `possible_duplicate`, unresolved — never silently imported as a second
    row for the same drug under a different name.

Usage:
    pip install pymupdf   # extraction-time only; not a runtime dependency
    python tools/extract_formulary_pdfs.py <dilution_manual.pdf> <iv_drip.pdf> \
        --out data/formulary/jsh_formulary_import.csv

The importer then enforces the safety contract on the result — this script
deliberately does NOT pre-validate beyond structure, so the import report
remains the single place rejections are explained.
"""
import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

# The engine root, so `models.database` resolves when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _pymupdf():
    """
    Imported lazily, not at module load. pymupdf is extraction-time only —
    deliberately absent from requirements.txt and CI — so importing this
    module (e.g. to reuse the pure name-matching helpers below) must not
    require it; only actually parsing a PDF does.
    """
    try:
        import pymupdf
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("pymupdf is required: pip install pymupdf") from exc
    return pymupdf


# The formulary's canonical headers — no mapping file needed at import time.
HEADERS = [
    "generic_name", "unit", "auto_calculate", "route", "reference_regimen",
    "warnings", "source_name", "source_edition", "source_ref",
]

UNIT_RE = re.compile(r"\b(?:I\.?\s?U|units?)\b", re.IGNORECASE)
# Broad on purpose: the manual writes "Y-Site Injection Compatibility",
# "Y-site stability", "Y- sitecompatability" (sic) and bare "Y-site". Everything
# from this marker onward is compatibility text, never part of the name.
COMPAT_RE = re.compile(r"Y[\s-]*site", re.IGNORECASE)
COMPAT_LABEL_RE = re.compile(
    r"^[\s-]*(?:injection|stability|compat[ai]bility)?\s*:?\s*", re.IGNORECASE
)
NA_RE = re.compile(r"^\s*(?:NA|N/A|-|—)?\s*$")


def clean(cell) -> str:
    """One line of collapsed whitespace out of a table cell."""
    if cell is None:
        return ""
    text = re.sub(r"[\uE000-\uF8FF]", " ", str(cell))  # private-use glyphs (arrows)
    return re.sub(r"\s+", " ", text).strip()


def present(text: str) -> bool:
    return not NA_RE.match(text or "")


def detect_unit(*texts: str) -> str:
    """'unit' when the source expresses the drug in international units."""
    return "unit" if any(UNIT_RE.search(t or "") for t in texts) else "mg"


# ── Adult Parenteral Dilution Manual ──────────────────────────────────────────
# Body tables are 18 columns:
#  0 name+compatibility · 1 initial strength · 2 diluents · 3 reconstitution
#  4 final conc IVP · 5 final conc IVPB · 6 standard prep · 7 max conc
#  8 max prep · 9-10 vial stability RT/Ref · 11-12 premixed stability RT/Ref
#  13 route · 14 rate IVP · 15 rate IVPB · 16 special conditions · 17 monitoring

MANUAL_COLS = 18


def _starts_new_monograph(col0: str) -> bool:
    """
    Whether a table line begins a new drug, rather than continuing the previous
    monograph's wrapped compatibility list.

    Names in the manual are Title Case. List continuations start lowercase
    ("caspofungin"), end mid-list ("Propofol," / "Compatibility:"), or trail
    off ("meropenem…etc"). A wrong guess here is visible: a false split lands
    in the manifest's dropped list, and a false merge leaves the fragment
    inside the previous row's compatibility warning.
    """
    # The compatibility list usually lives in the same cell as the name and
    # can end with "," or "…etc" — strip it first, then judge the name alone.
    match = COMPAT_RE.search(col0)
    text = (col0[: match.start()] if match else col0).strip()
    if not text or not text[0].isupper():
        return False
    if text.endswith((",", ":", ";")) or "…" in text:
        return False
    return True


def parse_manual(path: Path, source_name: str, edition: str):
    doc = _pymupdf().open(path)
    rows, dropped = [], []
    current = None  # (page, cells) — a drug row accumulating continuations

    def flush():
        nonlocal current
        if current is None:
            return
        page, cells = current
        current = None
        row = build_manual_row(page, cells, source_name, edition)
        if row:
            rows.append(row)
        else:
            dropped.append(f"p.{page}: {cells[0][:60]!r}")

    for index in range(len(doc)):
        page_number = index + 1
        for table in doc[index].find_tables().tables:
            if table.col_count != MANUAL_COLS:
                continue
            for raw in table.extract():
                cells = [clean(c) for c in raw]
                if cells[0] in ("", "Generic Name") and not any(cells[1:]):
                    continue  # header or blank spacer
                if cells[0] == "Generic Name":
                    continue
                # Rate-chart fragments (rows of bare numbers) are neither a new
                # drug nor monograph text — merging them would pollute the
                # previous drug's cells with chart figures.
                if not any(re.search(r"[A-Za-z]", c) for c in cells):
                    continue
                if cells[0] and _starts_new_monograph(cells[0]):
                    flush()
                    current = (page_number, cells)
                elif current is not None:
                    # Continuation: append cell text column-wise.
                    cpage, ccells = current
                    current = (
                        cpage,
                        [f"{a} {b}".strip() if b else a for a, b in zip(ccells, cells)],
                    )
    flush()
    doc.close()
    return rows, dropped


def build_manual_row(page: int, cells, source_name: str, edition: str):
    name_cell = cells[0]
    match = COMPAT_RE.search(name_cell)
    name = clean(name_cell[: match.start()] if match else name_cell)
    compatibility = clean(
        COMPAT_LABEL_RE.sub("", name_cell[match.end():], count=1) if match else ""
    )

    # A name must look like a name: letters, and not a fragment of a dose.
    if not re.search(r"[A-Za-z]{3}", name) or re.match(r"^[\d/.]", name):
        return None

    # Some monographs wrap the strength into the name cell ("Ampicillin 500 mg
    # 1000 mg"). Cut the name at the first numeric token; the remainder is kept
    # verbatim in the regimen so no source text is lost.
    tokens = name.split(" ")
    cut = next(
        (i for i, t in enumerate(tokens) if re.search(r"[0-9]|%", t)), len(tokens)
    )
    strength_from_name = " ".join(tokens[cut:])
    name = " ".join(tokens[:cut]).rstrip("(").strip().lower()
    if not re.search(r"[A-Za-z]{3}", name):
        return None

    regimen_parts = []
    if strength_from_name:
        regimen_parts.append(f"Strength (name column): {strength_from_name}")
    if present(cells[1]):
        regimen_parts.append(f"Initial strength: {cells[1]}")
    if present(cells[2]):
        regimen_parts.append(f"Diluents: {cells[2]}")
    if present(cells[3]):
        regimen_parts.append(f"Reconstitution volume: {cells[3]}")
    conc = " / ".join(c for c in (cells[4], cells[5]) if present(c))
    if conc:
        regimen_parts.append(f"Final concentration (IVP/IVPB): {conc}")
    if present(cells[6]):
        regimen_parts.append(f"Standard preparation: {cells[6]}")
    if present(cells[7]):
        regimen_parts.append(f"Maximum concentration: {cells[7]}")
    if present(cells[8]):
        regimen_parts.append(f"Preparation at maximum concentration: {cells[8]}")
    stability_vials = " / ".join(c for c in (cells[9], cells[10]) if present(c))
    if stability_vials:
        regimen_parts.append(f"Vial stability (RT/Ref): {stability_vials}")
    stability_premix = " / ".join(c for c in (cells[11], cells[12]) if present(c))
    if stability_premix:
        regimen_parts.append(f"Premixed stability (RT/Ref): {stability_premix}")
    rate = " / ".join(
        f"{label} {c}" for label, c in (("IVP:", cells[14]), ("IVPB:", cells[15]))
        if present(c)
    )
    if rate:
        regimen_parts.append(f"Rate of administration: {rate}")

    if not regimen_parts:
        return None  # a row with no content tells a nurse nothing

    warnings = []
    if present(cells[16]):
        warnings.append(f"Special conditions: {cells[16]}")
    if present(cells[17]):
        warnings.append(f"Monitoring: {cells[17]}")
    if compatibility and present(compatibility):
        warnings.append(f"Y-site compatibility: {compatibility}")

    return {
        "generic_name": name,
        "unit": detect_unit(cells[1], cells[4], cells[5], name_cell),
        "auto_calculate": "no",
        "route": cells[13] if present(cells[13]) else "",
        "reference_regimen": ". ".join(regimen_parts) + ".",
        "warnings": " | ".join(warnings),
        "source_name": source_name,
        "source_edition": edition,
        "source_ref": f"p.{page}",
    }


# ── Adult IV Drip Chart ───────────────────────────────────────────────────────

DRIP_DRUG_RE = re.compile(r"^Drug\n(.+?)\n", re.MULTILINE)
DRIP_CONC_RE = re.compile(r"Concentration\n(.+?)\n")
DRIP_DOSE_RE = re.compile(
    r"\(([^()]{1,40})\)\s*(mcg/kg/min|mg/kg/min|mcg/min|mg/min|mg/hr?|units?/(?:kg/)?hr?)",
    re.IGNORECASE,
)


def parse_drip_chart(path: Path, source_name: str, edition: str):
    doc = _pymupdf().open(path)
    by_drug = {}
    for index in range(len(doc)):
        text = doc[index].get_text()
        m = DRIP_DRUG_RE.search(text)
        if not m:
            continue
        name = clean(m.group(1)).lower()
        page = index + 1
        conc = DRIP_CONC_RE.search(text)
        dose = DRIP_DOSE_RE.search(text)
        central = "CENTRAL LINE" in text.upper()

        entry = by_drug.setdefault(
            name,
            {"pages": [], "concs": [], "dose": None, "central": False},
        )
        entry["pages"].append(page)
        if conc:
            c = clean(conc.group(1))
            if c not in entry["concs"]:
                entry["concs"].append(c)
        if dose and not entry["dose"]:
            entry["dose"] = clean(dose.group(0))
        entry["central"] = entry["central"] or central
    doc.close()

    rows = []
    for name, e in by_drug.items():
        parts = []
        if e["concs"]:
            parts.append(f"Standard concentration: {'; '.join(e['concs'])}")
        if e["dose"]:
            parts.append(f"Maintenance dose: {e['dose']}")
        parts.append(
            f"Infusion rate per weight: see chart, p.{'-'.join(str(p) for p in (e['pages'][0], e['pages'][-1])[:2])}"
            if len(e["pages"]) > 1
            else f"Infusion rate per weight: see chart, p.{e['pages'][0]}"
        )
        warnings = ["Requires a central line."] if e["central"] else []
        rows.append({
            "generic_name": name,
            "unit": detect_unit(" ".join(e["concs"]), e["dose"] or ""),
            "auto_calculate": "no",
            "route": "IV infusion",
            "reference_regimen": ". ".join(parts) + ".",
            "warnings": " | ".join(warnings),
            "source_name": source_name,
            "source_edition": edition,
            "source_ref": f"p.{e['pages'][0]}",
        })
    return rows


# ── Assembly ──────────────────────────────────────────────────────────────────

def existing_formulary_names() -> set:
    """Live names and aliases, so a collision is skipped rather than blanked."""
    try:
        from models.database import db_cursor
        with db_cursor() as (cur, _):
            cur.execute(
                "SELECT generic_name, aliases FROM bnp_drug_formulary "
                "WHERE retired_at IS NULL"
            )
            names = set()
            for row in cur.fetchall():
                names.add(row["generic_name"])
                names.update(a.lower() for a in (row["aliases"] or []))
            return names
    except Exception as e:
        print(
            f"WARNING: could not read the existing formulary ({e}) — "
            "collision skipping is OFF; do not apply this CSV blindly.",
            file=sys.stderr,
        )
        return set()


def _normalize(name: str) -> str:
    """Alnum-lowercase collapse, so punctuation/spacing differences don't matter."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            curr[j] = min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + (ca != cb),
            )
        prev = curr
    return prev[-1]


def find_near_duplicate(name: str, candidates) -> tuple:
    """
    A name that is one short edit away from an existing one — the
    digoxin/digoxine shape — without being an exact match (exact matches are
    handled separately, before this is ever called). Deliberately
    conservative: only names of at least 5 characters are compared, and only
    a distance of 1 is flagged, so unrelated short names never collide by
    chance. Returns (existing_name, similarity) or None; never picks a
    winner among several candidates — that judgement is a pharmacist's, not
    this script's, so ties keep the closest edit distance only.
    """
    norm = _normalize(name)
    if len(norm) < 5:
        return None
    best = None
    for candidate in candidates:
        cand_norm = _normalize(candidate)
        if len(cand_norm) < 5 or cand_norm == norm:
            continue
        distance = _levenshtein(norm, cand_norm)
        if distance <= 1:
            similarity = 1 - distance / max(len(norm), len(cand_norm))
            if best is None or distance < best[2]:
                best = (candidate, round(similarity, 3), distance)
    return (best[0], best[1]) if best else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dilution_manual", type=Path)
    parser.add_argument("iv_drip", type=Path, nargs="?")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--edition", default="JSH 2026")
    args = parser.parse_args()

    manual_rows, dropped = parse_manual(
        args.dilution_manual,
        "Adult Parenteral Dilution Manual, Jazan Specialist Hospital",
        args.edition,
    )
    drip_rows = (
        parse_drip_chart(
            args.iv_drip,
            "Adult IV Drip Chart (MOH standard concentration), JSH",
            args.edition,
        )
        if args.iv_drip
        else []
    )

    existing = existing_formulary_names()
    merged, skipped_dupe, skipped_existing, possible_duplicates = [], [], [], []
    seen = set()
    for row in manual_rows + drip_rows:
        name = row["generic_name"]
        if name in existing:
            skipped_existing.append(name)
            continue
        if name in seen:
            skipped_dupe.append(name)
            continue
        near = find_near_duplicate(name, existing | seen)
        if near:
            existing_name, similarity = near
            possible_duplicates.append(
                {"new_name": name, "existing_name": existing_name, "similarity": similarity}
            )
            continue
        seen.add(name)
        merged.append(row)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(merged)

    manifest = {
        "sources": {
            str(p.name): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (args.dilution_manual, args.iv_drip)
            if p
        },
        "rows_written": len(merged),
        "rows_dropped_unparseable": dropped,
        "skipped_existing_formulary_entries": sorted(set(skipped_existing)),
        "skipped_duplicate_names": sorted(set(skipped_dupe)),
        "possible_duplicates": sorted(
            possible_duplicates, key=lambda d: d["new_name"]
        ),
    }
    manifest_path = args.out.with_suffix(".manifest.json")
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))

    print(f"wrote {len(merged)} rows to {args.out}")
    print(f"  dropped (unparseable): {len(dropped)}")
    print(f"  skipped (already in formulary): {sorted(set(skipped_existing))}")
    if possible_duplicates:
        print(
            "  possible duplicates (excluded, needs a pharmacist's call): "
            + ", ".join(f"{d['new_name']!r}~{d['existing_name']!r}" for d in possible_duplicates)
        )
    print(f"  manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
