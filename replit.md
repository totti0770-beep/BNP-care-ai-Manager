# BestNursingAI Workspace

## Overview

Full-stack clinical AI platform for nurses — pnpm monorepo (TypeScript + Python FastAPI). Three production artifacts: web app, mobile app, and clinical AI engine backend.

## SafetyEngine (Clinical AI Engine)

Rule-based medication safety layer integrated into query pipeline (`services/drug_calculator.py`):

| Check | Trigger | Result |
|---|---|---|
| High-risk flag | Drug in `DRUG_DB` with `high_risk: True` | 🔴 Alert in `safety_alerts` |
| Contraindications | Patient `conditions` intersect drug `contraindications` | ⚠️ Alert in `safety_alerts` |
| Drug interactions | `other_drugs` list intersect drug `interactions` | ⚠️ Alert in `safety_alerts` |
| Overdose HARD BLOCK | `dose_per_kg × weight > adult_max_dose_mg` | ❌ `rejected=True`, answer blocked |
| Nursing notes | Always generated for drug queries | Admin checklist in `nursing_notes` |

**DRUG_DB high-risk drugs:** heparin, morphine, insulin, warfarin.
**DRUG_DB fields:** `adult_max_dose_mg` (per-dose hard block), `adult_max_daily_mg`, `contraindications`, `interactions`, `high_risk`, `frequency`.

Query response extended fields: `contraindications`, `interactions`, `nursing_notes`, `safety_alerts`, `rejected`, `rejection_reason`.

## Original Workspace Notes

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── bestnursingai/      # BestNursingAI React+Vite web app
│   └── nursing-mobile/     # Expo mobile nursing AI assistant (Arabic RTL)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `artifacts/bestnursingai` (`@workspace/bestnursingai`)

BestNursingAI — a full-featured nursing AI assistant web app. React+Vite, dark purple theme.

**Features:**
- Login screen with demo credentials (admin/user roles)
- AI chat connected to the real Clinical AI Engine (with local ClosedLoopRAG fallback)
- Secure document upload with engine indexing + local verification (SHA-256 checksums)
- Document management, citations, and official sources whitelist
- Audit log with filtering and export
- RAG settings (confidence threshold slider)
- Settings page (profile, language, permissions, notifications, theme, user management)
- Bilingual: English and Arabic with RTL support (i18next)

**Backend Integration:**
- Vite proxy: `/bnp-api/*` → `http://localhost:8000/*` (Clinical AI Engine)
- `src/services/clinicalApi.ts` — typed API client with auto JWT auth and token refresh
- `src/contexts/BackendContext.tsx` — React context providing `sendQuery`, `uploadToEngine`, `engineDocuments`
- ChatPage uses the real engine when available; falls back to local ClosedLoopRAG automatically
- Upload pages index PDFs into the real FAISS engine + record locally for UI display

**Demo credentials:**
- Admin: `admin@bestnursing.ai` / `admin123`
- User: `user@bestnursing.ai` / `user123`

**Key packages:** `i18next`, `react-i18next`, `i18next-browser-languagedetector`, `crypto-js`, `lucide-react`, `sonner`, shadcn/ui

### `artifacts/nursing-mobile` (`@workspace/nursing-mobile`)

Nursing AI Mobile — an Expo React Native app for clinical nursing AI assistant. Arabic RTL, dark navy theme (`#0F172A`).

**Features:**
- Home screen with 3 clinical category tiles (Pharmaceutical Standards, Nursing Policies, Quality/SABAHI)
- AI chat per category with mock RAG responses, Arabic content, and document citations (source + page)
- Suggestion chips on empty chat state
- Admin panel with biometric authentication (`expo-local-authentication`; PIN fallback on web: `1234`)
- Admin can add/remove reference documents per category (persisted via AsyncStorage)
- Full Arabic RTL layout throughout
- Stack navigation (no tabs), inverted FlatList chat pattern

**Category colors:**
- Pharmacy: `#4CC9F0` (cyan)
- Nursing Policies: `#4361EE` (blue)
- Quality/SABAHI: `#7C3AED` (purple)

**Key packages:** `expo-local-authentication`, `@react-native-async-storage/async-storage`, `expo-haptics`, `react-native-keyboard-controller`

### `artifacts/clinical-ai-engine` (Python FastAPI)

Production-grade Clinical AI Engine — standalone Python FastAPI service running on port 8000.

**Stack:** Python 3.11 · FastAPI · LangChain Community · FAISS (LangChain wrapper) · BM25 · PostgreSQL · OpenAI GPT-4o

**Architecture:**
```
routers/
  auth.py        — JWT auth (register, login, /me, audit log)
  documents.py   — PDF upload → PyPDFLoader → RecursiveCharacterTextSplitter → FAISS index
  query.py       — Main clinical query pipeline
services/
  pdf_processor.py       — LangChain PyPDFLoader + RecursiveCharacterTextSplitter (~500 chars/chunk)
  embeddings.py          — HybridRetriever: LangChain FAISS + OpenAIEmbeddings (text-embedding-3-small)
                           + BM25Okapi; 60% semantic / 40% keyword blend; FakeEmbeddings fallback
  clinical_router.py     — Classifies query → DRUG | PROTOCOL | GENERAL
  drug_calculator.py     — Drug DB with mg/kg dose calculation and overdose thresholds
  safety_layer.py        — Rejects low-confidence answers, enforces citation requirement
  response_generator.py  — LangChain ChatOpenAI (GPT-4o) with BNP system prompt; RAG-only fallback
models/
  database.py    — psycopg2 PostgreSQL: bnp_users, bnp_documents, bnp_chunks, bnp_audit_log
  schemas.py     — Pydantic models for all request/response types
```

**Key endpoints:**
- `POST /auth/register` — create user
- `POST /auth/login` → JWT token (24h)
- `POST /documents/upload` — upload PDF (multipart), auto-indexes in FAISS
- `GET  /documents/` — list indexed documents
- `POST /query/` — hybrid RAG query → structured BNP response (Answer/Dose/Safety Warning/Sources)
- `GET  /health` — service health + indexed chunk count
- `GET  /docs` — Swagger UI (FastAPI auto-generated)

**Security:** JWT HS256 (JWT_SECRET env var), SHA-256 password hashing (passlib sha256_crypt)

**Response format (mandatory BNP format):**
```
Answer: [clinical answer sourced from indexed documents]
Dose: [calculated dose if medication question]
Safety Warning: [contraindications, overdose risks]
Sources: [citations with document name, page number, relevance %]
```

**Environment vars:**
- `DATABASE_URL` — PostgreSQL (auto-provided by Replit)
- `JWT_SECRET` — random 64-char hex (auto-generated)
- `OPENAI_API_KEY` — optional; enables GPT-4o response generation (fallback: RAG-only)

**Workflow command:** `cd artifacts/clinical-ai-engine && uvicorn main:app --host 0.0.0.0 --port 8000 --reload`

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
