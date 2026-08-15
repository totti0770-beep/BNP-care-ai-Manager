# BNP Care AI Manager

A bilingual (Arabic/English) clinical decision-support platform. It answers nurses'
medication and protocol questions **only** from a corpus of indexed hospital clinical
guidelines, with a deterministic medication-safety layer that can override the language
model and refuse to answer.

> ## ⚠️ Not for clinical use
>
> This system is **not cleared for use in patient care.** The formulary ships seeded with
> 17 entries — roughly 1–2% of a hospital formulary — and **not one of them has been
> reviewed or signed off by a licensed pharmacist.** Until a drug is approved, the system
> shows no dose for it at all. `/health` reports the tally, and the review screen shows
> which drugs are waiting.
>
> Before any pilot with real patients, see [Before a pilot](#before-a-pilot).

## Architecture

```
Browser / Mobile
      │  session cookie (web) or bearer session token (mobile)
      ▼
┌──────────────────────────────────────────────┐
│ api-server (Express)                         │
│  • /api/*      Replit OIDC auth, sessions    │
│  • /bnp-api/*  gateway → clinical engine     │
│                mints a per-user engine token │
└──────────────────────────────────────────────┘
      │  Authorization: Bearer <per-user token>
      ▼
┌──────────────────────────────────────────────┐
│ clinical-ai-engine (FastAPI)                 │
│  • hybrid retrieval: FAISS + BM25            │
│  • deterministic drug safety / overdose block│
│  • GPT-4o generation, citations required     │
│  • audit write BEFORE any answer is returned │
└──────────────────────────────────────────────┘
      │
      ▼  PostgreSQL — users, documents, chunks, audit log
```

**The engine is never exposed directly.** All traffic reaches it through the gateway, which
authenticates each request as the individual signed-in nurse. This is what makes the audit
log attributable: every clinical answer is recorded against a real person, not a shared
service account.

### Packages

| Path | What it is |
|---|---|
| `artifacts/clinical-ai-engine` | Python FastAPI RAG engine, formulary, and safety layer |
| `artifacts/api-server` | Express OIDC auth + `/bnp-api` gateway |
| `artifacts/bestnursingai` | React + Vite web app |
| `artifacts/nursing-mobile` | Expo React Native app (Arabic RTL) |
| `lib/api-spec` | OpenAPI spec; `orval` generates `lib/api-zod` and `lib/api-client-react` |
| `lib/db` | Drizzle schema for `sessions` and `users` |

## Running it

### Docker (recommended)

```bash
cp .env.example .env
# Fill in JWT_SECRET, ENGINE_JWT_SECRET (same value), OPENAI_API_KEY, REPL_ID, ADMIN_EMAILS
openssl rand -hex 32   # for each secret

docker compose up --build
```

The web app is published on `http://localhost:8080`. Postgres and the engine are not
published to the host.

### Local development

```bash
pnpm install
cp .env.example .env && set -a && . ./.env && set +a

# Terminal 1 — clinical engine
cd artifacts/clinical-ai-engine
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — API server (gateway)
pnpm --filter @workspace/api-server run dev

# Terminal 3 — web app
pnpm --filter @workspace/bestnursingai run dev
```

### Monitoring

`GET /metrics` exposes Prometheus counters — query volume, refusals, overdose blocks, audit
write failures, latency, and retriever state. Refusal rate is the number worth alerting on: it
is how a knowledge-base gap shows up, and a system refusing everything otherwise looks quiet.
It exposes counters only, never questions or answers.

### Checks

```bash
pnpm run typecheck                              # whole workspace
pnpm run build                                  # all artifacts
cd artifacts/clinical-ai-engine && pytest       # safety-layer regression tests
pnpm run test                                   # TypeScript unit tests
```

### Schema changes

```bash
# TypeScript — after editing lib/db/src/schema/
pnpm --filter @workspace/db run generate        # writes SQL to lib/db/drizzle/
pnpm --filter @workspace/db run migrate         # applies pending migrations

# Clinical engine
cd artifacts/clinical-ai-engine
alembic revision -m "what changed"              # then write the SQL by hand
alembic upgrade head
```

### Loading the formulary

Medication data is imported, not coded. Export your formulary as CSV or Excel, copy
`artifacts/clinical-ai-engine/config/formulary_mapping.example.txt` and point its
right-hand side at your column headers, then use the Formulary screen (admin only) or:

```bash
curl -F file=@formulary.xlsx -F mapping=@mapping.txt -F dry_run=true \
     --cookie "$SESSION" http://localhost:8080/bnp-api/formulary/import
```

Dry run is the default and reports what would change, including every rejected row and
why. Rows are refused rather than repaired: a missing source, an undeclared unit, or a
per-kg value in an absolute threshold field stops that row and nothing else.

Imported drugs arrive `pending` and quote no dose until a pharmacist approves them.

The engine applies migrations itself on startup (`AUTO_MIGRATE=1`, the default) for
single-instance and Replit deployments. Docker sets `AUTO_MIGRATE=0` and runs a dedicated
`engine-migrate` job first, so the engine refuses to start against an unmigrated database
rather than several replicas racing on DDL.

## Configuration

Every variable is documented in [`.env.example`](.env.example). The ones that change
behaviour rather than just wiring:

| Variable | Effect if unset |
|---|---|
| `DATABASE_URL` | Engine **refuses to start** — it cannot audit, so it must not answer. |
| `JWT_SECRET` | Engine **refuses to start**. There is no default; a publicly known key is worse than an outage. |
| `ENGINE_JWT_SECRET` | Gateway cannot mint tokens; `/bnp-api` returns 503. Must equal `JWT_SECRET`. |
| `OPENAI_API_KEY` | `/health` reports **degraded** and queries return 503. The engine does **not** fall back to synthetic embeddings. |
| `ADMIN_EMAILS` | Nobody is an admin. Admin gates reading the audit log and uploading or deleting corpus documents. |

## Design rules

These are deliberate and should survive refactoring:

1. **Fail closed.** When retrieval, the database, or the audit log is unavailable, the system
   refuses to answer. There is no client-side or offline path that produces clinical guidance.
2. **The audit write precedes the answer.** If it fails, the request fails. An unrecorded
   clinical recommendation is worse than no recommendation. Rows are hash-chained, so an
   edited or deleted entry is detectable — `GET /auth/audit-log/verify`.
3. **Deletion is retirement.** Retiring a document stops it being retrieved but preserves its
   text, so the passage behind a past recommendation stays recoverable via
   `GET /documents/chunks/{chunk_id}`.
4. **Deterministic rules override the model.** An overdose detected by `SafetyEngine` blocks
   the answer before generation; the model cannot talk its way past it.
5. **Roles never come from the client.** They are derived server-side from `ADMIN_EMAILS`,
   never from request bodies or OIDC claims.
6. **Units are explicit.** Every formulary row declares `mg` or `unit`; a drug dosed in
   international units sets `auto_calculate = false` and no number is computed for it.
   The import refuses a unit-dosed row that carries milligram figures.
7. **Age gates the pediatric range.** Weight alone never selects it — an adult and a child can
   weigh the same.
8. **A dose is only quoted for an approved drug.** Medication data lives in
   `bnp_drug_formulary`, one row per drug, each carrying its source and its pharmacist
   sign-off. A drug that is present but unreviewed produces no number — and changing any
   clinical value by import returns it to pending, so a revised dose never inherits an old
   approval.

## Before a pilot

Engineering work is not the remaining blocker. These are:

- [ ] **Pharmacist sign-off** on every formulary row, through the review screen or the
      exported packet (`GET /bnp-api/formulary/review-packet.xlsx`, one line per clinical
      value). Each decision records the reviewer's name and licence number on the audit
      chain. Nothing else is needed to make it stick: approval is per drug, and the version
      recorded on every audit row moves on its own.
- [ ] **Rotate the JWT secret.** A signing key was committed to this repository's history
      (`.replit`, commit `f899a8a`) and must be treated as compromised. Rotating the value is
      not enough on its own if the history remains published.
- [ ] **Import the hospital formulary** (`POST /bnp-api/formulary/import`) so coverage is
      the real one rather than the seeded 17. Out-of-formulary drugs are reported as not
      covered, but they are still not checked.
- [ ] **Compliance package**: CBAHI/PDPL mapping, an intended-use statement, a clinical
      validation protocol, data retention and residency, and incident response.
- [ ] **Clinical validation** against a held-out question set, reviewed by clinicians.

## Known limitations

- The engine runs single-worker. The retriever is a process-global singleton with no
  cross-process locking, so `--workers > 1` will diverge.
- Both schemas have versioned migrations, applied by one-shot jobs before their services start
  (`lib/db/drizzle/` via drizzle-kit, `artifacts/clinical-ai-engine/alembic/` via Alembic).
  The engine still lacks a tenant/facility column, so a multi-hospital deployment needs a
  migration with an explicit backfill.
- The FAISS index is rebuilt in full on every document upload, and re-embedded from the
  database when it and the `bnp_chunks` table disagree on count.
- Rate limiting and metrics are per-process and in-memory; a multi-instance deployment needs
  a shared store for both.
- The audit hash chain is computed by the application, so it detects tampering by anyone
  without database write access at the moment of writing. A fully independent guarantee needs
  append-only storage or external anchoring.
- Document "verification" in the web app records a checksum but does **not** validate any
  signature. Uploads are marked unverified, and no document is attributed to an official source.
- Retrieved source text is fenced and the model is told to treat it as data, but that is a
  mitigation, not a guarantee. Upload is admin-only for this reason.
- `license` is set to UNLICENSED pending a decision; it previously claimed MIT.
