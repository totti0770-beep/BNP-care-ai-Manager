# REPO-DISCOVERY.md

Forensic discovery of an unknown repository. Read-only investigation.
Every substantive statement below carries repository evidence. Where a fact could not be
established, it is written as `NOT DETERMINED` with the exact search performed.

**Audit target:** working tree at `/home/user/BNP-care-ai-Manager`, branch `main`,
commit `d73a87ba1c21048a7da0d8bab95296531ff62563`.
**Investigation date:** 2026-08-31.

**Scope note on vendored content.** `.agents/skills/` holds 345 tracked files
(`git ls-files .agents | wc -l` → `345`) belonging to 21 third-party skill packs listed in
`skills-lock.json`. They are excluded from every source metric below and are not part of the
runtime. They are counted only in the total tracked-file figure.

---

## 1. Repository Identity

| Field | Value | Evidence |
|---|---|---|
| Name | `BNP-care-ai-Manager` | GitHub API `full_name` = `totti0770-beep/BNP-care-ai-Manager` |
| Owner | `totti0770-beep` (user account, id `266131148`) | GitHub API `owner.login` |
| Visibility | **public** | GitHub API `"private": false`, `"visibility": "public"` |
| Description | `Clinical assistant` | GitHub API `description` |
| Homepage | `https://replit.com/@awn000333/BNP-care-ai-Manager` | GitHub API `homepage` |
| Default branch | `main` | GitHub API `default_branch`; `git branch -a` |
| Current branch | `main` | `git rev-parse --abbrev-ref HEAD` → `main` |
| Current commit | `d73a87ba1c21048a7da0d8bab95296531ff62563` | `git rev-parse HEAD` |
| Working tree | clean before this report was written | `git status --porcelain` → empty |
| Tags | **0** | `git tag \| wc -l` → `0` |
| Branches | `main`, `claude/healthcare-audit-readiness-u7p1hz` (local and remote) | `git branch -a` |
| Commit count | **89** | `git log --oneline \| wc -l` → `89` |
| First commit | `81cbf91`, 2026-03-30, author `agent <agent@replit.com>`, "Initial commit" | `git log --format='%h %ad %an %s' --date=short \| tail -1` |
| Latest commit | `d73a87b`, 2026-08-27, author `totti0770-beep`, "web: apply the BNP DecisionGuard design system from Figma (#3)" | `git log -1 --format='%h %ad %an %s'` |
| Repo created | 2026-08-14T17:45:50Z | GitHub API `created_at` |
| Last push | 2026-08-27T19:28:01Z | GitHub API `pushed_at` |
| Forks / stars / open issues | 0 / 0 / 0 | GitHub API |
| Archived | false | GitHub API `archived` |

**Contributors** (`git shortlog -sne --all`):

| Commits | Identity |
|---:|---|
| 43 | `Claude <noreply@anthropic.com>` |
| 42 | `awn000333 <56957371-awn000333@users.noreply.replit.com>` |
| 3 | `totti0770-beep <totti0770@gmail.com>` |
| 1 | `agent <agent@replit.com>` |

**Pull requests** (GitHub API `list_pull_requests`, state `all`): three, all closed, all from
head branch `claude/healthcare-audit-readiness-u7p1hz` into `main`.

| # | Title | `merged_at` |
|---:|---|---|
| 1 | Clinical safety, identity, and audit remediation; govern the medication formulary | 2026-08-23T08:30:31Z |
| 2 | engine: let the container own its mounted index volume | 2026-08-27T08:17:25Z |
| 3 | web: apply the BNP DecisionGuard design system from Figma | 2026-08-27T19:28:02Z |

The `main` history contains merge commits `791ba89`, `e03c4d1`, `d73a87b` whose subjects end
`(#1)`, `(#2)`, `(#3)` (`git log --format='%h %s'`).

**Commit date range.** The recorded author dates span 2026-03-30 (`81cbf91`) to 2026-08-27
(`d73a87b`), while the GitHub repository record was created 2026-08-14. The commits dated
before 2026-08-14 were therefore pushed into this repository after they were authored
elsewhere. Where they were authored: `NOT DETERMINED — searched: git log --format='%h %ae %s',
git remote -v (single remote, origin=github.com/totti0770-beep/BNP-care-ai-Manager),
.replit, replit.md; the earlier author addresses are @users.noreply.replit.com and
agent@replit.com, which names an authoring platform but not a source repository.`

---

## 2. Complete Repository Tree

Tracked files only (`git ls-files`), `.agents/skills/**` collapsed. 716 tracked files total.

```
/
├── .env.example                     documented environment contract (94 lines)
├── .github/workflows/ci.yml         the only CI workflow
├── .gitignore                       excludes engine runtime data; see §11
├── .npmrc
├── .replit                          Replit runtime + artifact registration
├── .replitignore
├── .agents/
│   ├── agent_assets_metadata.toml
│   └── skills/                      345 tracked files — vendored third-party skill packs
├── README.md                        318 lines
├── replit.md                        270 lines
├── docker-compose.yml               5 services + 2 volumes
├── docs/
│   ├── deployment/railway.md        151 lines
│   └── security/jwt-rotation.md     110 lines
├── main.py                          5 lines; prints a string; imported by nothing
├── package.json                     workspace root, name "workspace"
├── pnpm-workspace.yaml              packages, catalog, overrides, minimumReleaseAge
├── pnpm-lock.yaml
├── pyproject.toml
├── uv.lock
├── skills-lock.json                 lockfile for .agents/skills
├── tsconfig.json / tsconfig.base.json
├── scripts/                         @workspace/scripts — one file, src/hello.ts
├── lib/
│   ├── api-spec/                    OpenAPI source + orval codegen config
│   ├── api-zod/                     GENERATED zod/types from api-spec
│   ├── api-client-react/            GENERATED react-query client from api-spec
│   ├── db/                          drizzle schema + 2 SQL migrations
│   └── replit-auth-web/             useAuth() hook for the web app
├── artifacts/
│   ├── api-server/                  Express gateway (TypeScript)
│   ├── bestnursingai/               React + Vite web app
│   ├── clinical-ai-engine/          FastAPI engine (Python)
│   ├── nursing-mobile/              Expo / React Native app
│   └── mockup-sandbox/              69 tracked files; excluded from the pnpm workspace
└── attached_assets/                 15 entries: pasted text, images, a .zip, branding json
```

Role of each important directory, and whether it is part of the runtime:

| Directory | Contains | Referenced by | In runtime |
|---|---|---|---|
| `artifacts/api-server` | Express app, routes, lib, middlewares, `Dockerfile` | `docker-compose.yml:77`, `.replit:4`, `artifact.toml` | yes |
| `artifacts/clinical-ai-engine` | FastAPI app, routers, services, models, alembic, tools, scripts, tests | `docker-compose.yml:39`, `.replit:10`, `artifact.toml` | yes |
| `artifacts/bestnursingai` | React SPA, 68 components, contexts, i18n, `Dockerfile`, `nginx.conf` | `docker-compose.yml:98`, `.replit:7`, `artifact.toml` | yes |
| `artifacts/nursing-mobile` | Expo Router app, 5 route files, services, i18n, `server/serve.js` | `artifact.toml` present; **absent from `.replit` `[[artifacts]]` and from `docker-compose.yml`** | see §7 |
| `artifacts/mockup-sandbox` | `App.tsx` + 55 shadcn `ui/` components + generated module map | excluded at `pnpm-workspace.yaml:8` (`'!artifacts/mockup-sandbox'`) | no |
| `lib/api-spec` | `openapi.yaml`, `orval.config.ts` | invoked by `.github/workflows/ci.yml:37` | build-time only |
| `lib/api-zod` | generated zod schemas + types | imported by `artifacts/api-server` | yes |
| `lib/api-client-react` | generated react-query client (637 lines) | see §23 | see §23 |
| `lib/db` | drizzle schema (2 tables), `drizzle/*.sql` | imported by `artifacts/api-server` | yes |
| `lib/replit-auth-web` | `useAuth()` fetch hook | `bestnursingai/src/contexts/AuthContext.tsx:2` | yes |
| `scripts` | `src/hello.ts` — `console.log("Hello from @workspace/scripts")` | typechecked by root `typecheck` script | no |
| `attached_assets` | pasted source text, a Flutter sample, PNGs, a `.zip`, `branding-*.json` | `NOT DETERMINED — searched: grep -rn "attached_assets" over artifacts/ lib/ scripts/ *.json *.yaml *.yml *.toml` → no hit outside the directory itself | no |
| `.agents/skills` | 21 vendored skill packs | `skills-lock.json` | no |

Category classification:

* **frontend** — `artifacts/bestnursingai`
* **mobile** — `artifacts/nursing-mobile`
* **backend / API gateway** — `artifacts/api-server`
* **AI/RAG backend** — `artifacts/clinical-ai-engine`
* **internal libraries** — `lib/*`
* **database** — `lib/db/drizzle/*.sql` (TypeScript side), `artifacts/clinical-ai-engine/alembic/versions/*` (Python side)
* **infrastructure / deployment** — `docker-compose.yml`, 3 `Dockerfile`s, `nginx.conf`, `.replit`, 5 `artifact.toml`
* **CI** — `.github/workflows/ci.yml`
* **documentation** — `README.md`, `replit.md`, `docs/**`
* **tests** — `artifacts/clinical-ai-engine/tests/` (13 files), 8 `*.test.ts(x)` across three packages
* **assets** — `attached_assets/`, `artifacts/*/assets`
* **design scaffold, not runtime** — `artifacts/mockup-sandbox`

---

## 3. Technology DNA

Line counts over tracked, first-party files (`git ls-files "*.<ext>" | grep -v '^.agents/' | xargs wc -l`):

| Language / type | Files | Lines |
|---|---:|---:|
| `.tsx` | 150 | 19,892 |
| `.py` | 51 | 10,076 |
| `.ts` | 66 | 6,029 |
| `.yaml` | 3 | 12,606 (dominated by `pnpm-workspace.yaml`'s catalog/overrides) |
| `.json` | 33 | 1,724 |
| `.md` | 5 | 875 |
| `.js` | 4 | 727 |
| `.css` | 2 | 645 |
| `.yml` | 2 | 207 |
| `.mjs` | 1 | 136 |
| `.sql` | 2 | 35 |
| `.sh` | 2 | 31 |

Source directories: `artifacts/*/src`, `artifacts/nursing-mobile/app`,
`artifacts/clinical-ai-engine/{routers,services,models,middleware,alembic,tools,scripts,tests}`,
`lib/*/src`.

**Files ≥ 500 lines** (tracked, first-party, excluding lockfiles and binaries):

| Lines | Path |
|---:|---|
| 740 | `attached_assets/y5MJLc7geDQoue9Z4YzQL_1775071691937.txt` (pasted text, not source) |
| 727 | `artifacts/bestnursingai/src/components/ui/sidebar.tsx` |
| 717 | `artifacts/bestnursingai/src/components/ChatPage.tsx` |
| 714 | `artifacts/mockup-sandbox/src/components/ui/sidebar.tsx` |
| 678 | `artifacts/nursing-mobile/app/drug-assistant.tsx` |
| 671 | `artifacts/nursing-mobile/components/MessageBubble.tsx` |
| 638 | `artifacts/clinical-ai-engine/data/formulary/pharmacist_review_log.csv` (data) |
| 637 | `lib/api-client-react/src/generated/api.ts` |
| 635 | `artifacts/clinical-ai-engine/alembic/versions/0003_drug_formulary.py` |
| 629 | `artifacts/bestnursingai/src/i18n.ts` |
| 621 | `artifacts/clinical-ai-engine/data/formulary/jsh_workbooks_import.csv` (data) |
| 613 | `artifacts/clinical-ai-engine/routers/query.py` |
| 585 | `artifacts/nursing-mobile/app/admin.tsx` |
| 583 | `artifacts/nursing-mobile/scripts/build.js` |
| 573 | `artifacts/clinical-ai-engine/services/formulary_import.py` |
| 521 | `artifacts/clinical-ai-engine/tests/test_formulary_db.py` |
| 520 | `artifacts/bestnursingai/src/components/FormularyPage.tsx` |

**Files ≥ 1000 lines:** none among first-party source.

Frameworks verified from imports and configuration, not from documentation:

| Framework | Evidence |
|---|---|
| React 19.1.0 | `pnpm-workspace.yaml` catalog pins `react`/`react-dom` at `19.1.0`; `artifacts/bestnursingai/src/main.tsx:1` `createRoot` from `react-dom/client` |
| Vite 7 | build output `vite v7.3.1` (executed, §27); `artifacts/bestnursingai/vite.config.ts` |
| Express | `artifacts/api-server/src/app.ts:1` `import express` |
| FastAPI | `artifacts/clinical-ai-engine/main.py:19` `from fastapi import FastAPI` |
| Expo / expo-router | `artifacts/nursing-mobile/package.json` `"main": "expo-router/entry"`; `app/_layout.tsx:9` `import { Stack } from "expo-router"` |
| LangChain (community + openai) | `services/embeddings.py:60,132`; `services/response_generator.py:193` |
| FAISS (via LangChain) | `services/embeddings.py:133` `FAISS.load_local` |
| rank_bm25 | `services/embeddings.py:240` `from rank_bm25 import BM25Okapi` |
| Drizzle ORM | `lib/db/src/schema/auth.ts:5` `pgTable` from `drizzle-orm/pg-core` |
| Alembic | `artifacts/clinical-ai-engine/alembic.ini`, `alembic/versions/*` |
| psycopg2 pooling | `models/database.py:22` `pg_pool.ThreadedConnectionPool` |
| Tailwind CSS v4 | `pnpm-workspace.yaml` catalog `@tailwindcss/vite: ^4.1.14` |
| i18next / react-i18next | `artifacts/bestnursingai/src/i18n.ts`; `src/components/*.tsx` `useTranslation` |
| vitest 4 | executed output `RUN v4.1.10` (§27) |
| pytest | `artifacts/clinical-ai-engine/pytest.ini`; executed (§27) |

**Flutter is not part of this system.** Two `attached_assets/Pasted-import-package-flutter-*.txt`
files contain Dart source. `git grep -l "flutter"` outside `attached_assets/` returns nothing,
and no `pubspec.yaml` is tracked. Classification: 📋 pasted material only.

---

## 4. Package / Workspace Inventory

**Package manager:** pnpm, pinned to `10.33.0` (`package.json` `"packageManager"`).
Root `preinstall` refuses any other agent: `case "$npm_config_user_agent" in pnpm/*) ;; *)
echo "Use pnpm instead" >&2; exit 1 ;; esac`.

**Lockfiles:** `pnpm-lock.yaml` (JS), `uv.lock` (Python), plus `artifacts/clinical-ai-engine/requirements.txt`.

**Workspace globs** (`pnpm-workspace.yaml:2-12`):

```
artifacts/*
!artifacts/mockup-sandbox
lib/*
lib/integrations/*
scripts
```

`lib/integrations/*` matches nothing: `git ls-files lib/integrations` → **0 files**;
`ls lib/` → `api-client-react api-spec api-zod db replit-auth-web`. ❌ NOT FOUND.

`pnpm-workspace.yaml` also sets `minimumReleaseAge: 1440` with `@replit/*` excluded, and a
large `overrides` block; `autoInstallPeers: false`.

Root `package.json` scripts:

| Script | Command |
|---|---|
| `build` | `pnpm run typecheck && pnpm -r --if-present run build` |
| `typecheck:libs` | `tsc --build` |
| `typecheck` | `pnpm run typecheck:libs && pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck` |
| `test` | `pnpm -r --if-present run test` |
| `preinstall` | pnpm guard (above) |

Root `"license": "UNLICENSED"`, `"private": true`.

Eleven workspace projects resolve (`pnpm run test` reported `Scope: 10 of 11 workspace projects`;
`pnpm run typecheck` reported `Scope: 5 of 11`). Twelve `package.json` files are tracked —
the twelfth is `artifacts/mockup-sandbox/package.json`, excluded from the workspace.

| Package | Version | Role | Entry point | build | start / dev | test | typecheck | Internal deps |
|---|---|---|---|---|---|---|---|---|
| `workspace` (root) | 0.0.0 | workspace root | — | ✔ | — | ✔ | ✔ | — |
| `@workspace/api-server` | — | Express gateway | `src/index.ts` → `dist/index.mjs` | `node ./build.mjs` | `node --enable-source-maps ./dist/index.mjs` | `vitest run` | ✔ | `@workspace/api-zod`, `@workspace/db` |
| `@workspace/clinical-ai-engine` | — | FastAPI engine | `main.py` | — | `dev`: uvicorn | — (pytest, outside pnpm) | — | none (0 JS deps) |
| `@workspace/bestnursingai` | — | React SPA | `src/main.tsx` | `vite build` | `vite` | `vitest run` | ✔ | `@workspace/replit-auth-web`, `@workspace/api-client-react` |
| `@workspace/nursing-mobile` | 0.0.0 | Expo app | `expo-router/entry` | `node scripts/build.js` | `expo start` / `node server/serve.js` | `vitest run` | ✔ | `@workspace/api-client-react` |
| `@workspace/api-spec` | — | OpenAPI source | `openapi.yaml` | — | `codegen: orval` | — | — | — |
| `@workspace/api-zod` | — | generated schemas | `src/index.ts` | — | — | — | ✔ | — |
| `@workspace/api-client-react` | — | generated client | `src/index.ts` | — | — | — | ✔ | — |
| `@workspace/db` | — | drizzle schema | `src/index.ts` | — | `generate`/`migrate`/`push` (drizzle-kit) | — | ✔ | — |
| `@workspace/replit-auth-web` | — | auth hook | `src/use-auth.ts` | — | — | — | ✔ | `@workspace/api-client-react` |
| `@workspace/scripts` | 0.0.0 | placeholder | `src/hello.ts` | — | `hello: tsx ./src/hello.ts` | — | ✔ | — |
| `@workspace/mockup-sandbox` | 2.0.0 | design scaffold | `src/main.tsx` | (workspace-excluded) | — | — | — | — |

**Internal dependency graph** (from `package.json` `dependencies`, verified by import in
source where noted):

```
api-server  ──> api-zod          (imported: middlewares/authMiddleware.ts:3, lib/auth.ts:6,
            ──> db                lib/engineToken.ts:2, routes/health.ts:2)
                                 (imported: lib/bootstrapAdmin.ts:2, lib/auth.ts:4,
                                  migrate.ts:12, routes/auth.ts:10)
bestnursingai ──> replit-auth-web (imported: src/contexts/AuthContext.tsx:2)
              ──> api-client-react (declared at package.json:52; NOT imported — see §23)
nursing-mobile ──> api-client-react (declared at package.json:26; NOT imported — see §23)
replit-auth-web ──> api-client-react (type-only: src/use-auth.ts:2)
```

No circular internal dependency was found. Search: the graph above is acyclic by inspection
of all five `workspace:*` edges in the twelve `package.json` files.

---

## 5. Entry Points

### 5.1 `artifacts/api-server/src/index.ts` — Express process

```
index.ts
 ├─ imports ./app, ./lib/logger, ./lib/bootstrapAdmin
 ├─ requires process.env.PORT; throws when absent (index.ts:8) or non-numeric (:17)
 ├─ bootstrapAdmin(logger) runs BEFORE listen; on rejection → logger.error + process.exit(1)
 └─ app.listen(port)
app.ts initialization order (app.ts:16-83)
 ├─ app.set("trust proxy", 1)
 ├─ pinoHttp(logger)                     structured request logging
 ├─ cors({ credentials: true, origin: true })
 ├─ cookieParser()
 ├─ authMiddleware                        loads session user from Postgres
 ├─ "/bnp-api" → gatewayRouter            mounted BEFORE body parsers (streams uploads)
 ├─ express.json(), express.urlencoded()
 ├─ "/api" → router (health + auth)
 ├─ "/api" → 404 JSON handler
 ├─ mountWebApp(app, process.env.WEB_ROOT ?? "public")   serves the SPA when present
 └─ JSON error handler (500)
External connections started: PostgreSQL (via @workspace/db pool, lib/db/src/index.ts:13),
outbound HTTP to ENGINE_URL (routes/gateway.ts:73 fetch), outbound OIDC discovery
(lib/auth.ts:24, only when getOidcConfig() is called).
```

### 5.2 `artifacts/clinical-ai-engine/main.py` — FastAPI process

```
main.py
 ├─ configure_logging(as_json = LOG_FORMAT == "json")         main.py:31
 ├─ lifespan (main.py:38-68)
 │   ├─ init_db()                                             models/database.py:95
 │   ├─ get_retriever(); if available → sync_from_db()         services/embeddings.py
 │   │    else logger.error("Retriever unavailable …")
 │   └─ get_formulary().reload()                               services/formulary.py:61
 ├─ CORSMiddleware added ONLY when CORS_ORIGINS is non-empty and not "*"  main.py:94-107
 ├─ RateLimitMiddleware                                        middleware/rate_limit.py
 ├─ RequestLoggingMiddleware                                   middleware/logging.py:56
 └─ routers: /auth /documents /query /formulary + /health /livez /metrics /
External connections: PostgreSQL (psycopg2 ThreadedConnectionPool), OpenAI
(embeddings + chat), local filesystem FAISS index at data/faiss_index/lc_index.
Module-level fail-fast: routers/auth.py:24 raises RuntimeError when JWT_SECRET is empty,
which aborts import of main.py.
```

### 5.3 `artifacts/bestnursingai/src/main.tsx` — browser SPA

```
main.tsx
 └─ createRoot(#root).render(<AuthProvider><App/></AuthProvider>)
App.tsx
 └─ <AuthProvider><ThemeProvider><LanguageProvider><AuditLogProvider>
      <DocumentVerificationProvider><BackendProvider><AppContent/>…
AppContent gates on useAuth(): isLoading → spinner; !isAuthenticated → <LoginScreen/>;
otherwise <Sidebar/> + a switch over activeTab (App.tsx:48-71).
```

`AuthProvider` is mounted twice — `main.tsx:8` and `App.tsx:94`. Both instances call
`useReplitAuth()`, whose effect issues `fetch("/api/auth/user")`
(`lib/replit-auth-web/src/use-auth.ts:20`). Consumers resolve to the inner provider.

### 5.4 `artifacts/nursing-mobile` — Expo Router

`package.json` `"main": "expo-router/entry"`. `app/_layout.tsx:36` declares a `Stack` with
four screens: `index`, `chat/[category]`, `admin`, `drug-assistant`. Providers:
`QueryClientProvider`, `SafeAreaProvider`, `GestureHandlerRootView`, `KeyboardProvider`,
`AppProvider`, `AuthGate`, `ErrorBoundary`.

### 5.5 Root `main.py`

```python
def main():
    print("Hello from repl-nix-workspace!")
if __name__ == "__main__":
    main()
```
Referenced by nothing. Search: `grep -rn "repl-nix-workspace"` and `grep -rn "^main.py\|/main.py"`
over `pyproject.toml`, `.replit`, `docker-compose.yml`, `artifacts/**` → the only `main:app`
references target `artifacts/clinical-ai-engine/main.py`. 💀

### 5.6 CLI entry points (Python `__main__` guards)

`tools/convert_jsh_workbooks.py`, `tools/extract_formulary_pdfs.py`,
`scripts/apply_jsh_formulary.py`, `scripts/mint_operator_token.py`,
`scripts/verify_deployment.py` — all five carry `if __name__ == "__main__"`. None is imported
by `main.py`, any router, or any service (`grep -rn` over `*.py` excluding `tests/`, `tools/`,
`scripts/` → no hit).

### 5.7 Build entry points

`artifacts/api-server/build.mjs` (esbuild bundle → `dist/index.mjs`),
`artifacts/nursing-mobile/scripts/build.js` (583 lines, Expo static export),
`artifacts/nursing-mobile/server/serve.js`.

---

## 6. Runtime Architecture

Connections drawn only where a file and line prove them.

```
                    ┌──────────────────────────────────┐
  Browser ─────────►│  api-server (Express, PORT)      │
   session cookie   │  artifacts/api-server            │
                    │                                  │
                    │  /api/*        routes/index.ts   │
                    │  /bnp-api/*    routes/gateway.ts │
                    │  /*            lib/webApp.ts     │──► built SPA files (WEB_ROOT)
                    └───────┬───────────────┬──────────┘
                            │               │
        sessions + users    │               │  Bearer <HS256, iss=bnp-gateway, ttl 300s>
        (drizzle)           │               │  routes/gateway.ts:52 → mintEngineToken
                            ▼               ▼
                   ┌────────────────┐   ┌──────────────────────────────────┐
                   │  PostgreSQL    │◄──│  clinical-ai-engine (FastAPI)    │
                   │  sessions      │   │  ENGINE_URL, default :8000       │
                   │  users         │   │  bnp_users bnp_documents         │
                   │  bnp_*         │   │  bnp_chunks bnp_audit_log        │
                   └────────────────┘   │  bnp_drug_formulary              │
                                        └───┬──────────────┬───────────────┘
                                            │              │
                    services/embeddings.py  │              │  services/response_generator.py
                                            ▼              ▼
                              ┌─────────────────────┐  ┌──────────────────────┐
                              │ OpenAI embeddings   │  │ OpenAI chat          │
                              │ text-embedding-3-   │  │ gpt-4o, temperature=0│
                              │ small (:32)         │  │ (:197,:199)          │
                              └──────────┬──────────┘  └──────────────────────┘
                                         ▼
                              ┌─────────────────────────────┐
                              │ FAISS index on local disk   │
                              │ data/faiss_index/lc_index   │
                              │ + in-process BM25Okapi      │
                              └─────────────────────────────┘

  Expo app ──► API_ORIGIN (`https://${EXPO_PUBLIC_DOMAIN}`) /api/*, /bnp-api/*
               artifacts/nursing-mobile/services/session.ts:18, services/clinicalApi.ts:4
```

Evidence for each edge:

| Edge | Evidence |
|---|---|
| Browser → api-server `/api` | `app.ts:60` `app.use("/api", router)` |
| Browser → api-server SPA | `app.ts:69` `mountWebApp(app, process.env["WEB_ROOT"] ?? "public")`; `lib/webApp.ts` serves `index.html` for any unmatched path |
| api-server → PostgreSQL | `lib/db/src/index.ts:13` `new Pool({ connectionString: process.env.DATABASE_URL })`; used at `lib/auth.ts:4`, `lib/bootstrapAdmin.ts:2`, `routes/auth.ts:10` |
| api-server → engine | `routes/gateway.ts:73` `await fetch(target, …)` with `target = ENGINE_URL + originalUrl.slice("/bnp-api".length)` (`:70`) |
| engine → PostgreSQL | `models/database.py:22` `ThreadedConnectionPool`; `db_cursor()` used by all four routers |
| engine → OpenAI embeddings | `services/embeddings.py:60-61` `OpenAIEmbeddings`, model `text-embedding-3-small` (`:32`) |
| engine → OpenAI chat | `services/response_generator.py:193,197` `ChatOpenAI(model="gpt-4o", temperature=0)` |
| engine → FAISS on disk | `services/embeddings.py:23` `FAISS_LANGCHAIN_PATH = str(INDEX_DIR / "lc_index")`, `:133` `FAISS.load_local(..., allow_dangerous_deserialization=True)` |
| engine → BM25 | `services/embeddings.py:240-242` `BM25Okapi(tokenized)` held in process memory |
| mobile → api-server | `artifacts/nursing-mobile/services/session.ts:18` `API_ORIGIN = https://${EXPO_PUBLIC_DOMAIN ?? "localhost"}`; `services/clinicalApi.ts` paths `/bnp-api/...` |
| nginx → api-server (compose only) | `artifacts/bestnursingai/nginx.conf:19,28` `proxy_pass http://api_server` |

**Not present anywhere:** message queue, cache server, object storage, external vector
database. Search: `grep -rniE "redis|rabbit|kafka|celery|sqs|bullmq|s3|minio|pinecone|weaviate|qdrant|chroma|pgvector"`
over `artifacts/`, `lib/`, `docker-compose.yml`, `requirements.txt`, all `package.json` →
no runtime hit. ❌ NOT FOUND.

---

## 7. Frontend Inventory

### 7.1 Web app — `artifacts/bestnursingai`

There is **no router library in use**. `wouter` is declared at
`artifacts/bestnursingai/package.json:76` and `grep -rn "wouter" src` returns nothing.
Navigation is a `useState` string `activeTab` and a `switch` (`App.tsx:27`, `:48-71`).

| Screen | `activeTab` value | Source | Auth required | Admin gate in UI | Network calls | Status |
|---|---|---|---|---|---|---|
| Login | — (rendered when `!isAuthenticated`) | `components/LoginScreen.tsx` | no | — | `POST /api/auth/login` via `AuthContext.loginWithPassword` (`AuthContext.tsx:79`), `GET /api/auth/methods` (`:57`) | ✅ |
| Home | `home`, `new-chat` | `components/HomePage.tsx` | yes | — | none found (`grep -n "fetch(\|clinicalApi\|useBackend"` → no hit) | 🟡 |
| Chat | `chat` | `components/ChatPage.tsx` (717 lines) | yes | — | `useBackend()` → `sendQuery` (`ChatPage.tsx:435`) | ✅ |
| Secure upload | `upload` | `components/SecureUploadPage.tsx` | yes | `hasPermission` (`:26`) | `useBackend().uploadToEngine` (`:27`) | ✅ |
| Documents | `documents` | `components/DocumentsPage.tsx` | yes | — | `useBackend()` (`:30`) | ✅ |
| Citations | `citations` | `components/CitationsPage.tsx` | yes | — | `useBackend()` (`:27`), `listAuditLog` (`:6`) | ✅ |
| Settings | `settings` | `components/SettingsPage.tsx` | yes | `hasPermission` (`:32`) | **none** — `grep -n "fetch(\|clinicalApi\|useBackend"` → no hit | 🟡 |
| Official sources | `official-sources` | `components/OfficialSourcesPage.tsx` | yes | `hasPermission` (`:25`) | **none** — state comes from `DocumentVerificationContext` | 🟡 |
| Audit log | `audit-log` | `components/AuditLogPage.tsx` | yes | — | via `useAuditLog()` → `fetchAllAuditLog`, `verifyAuditChain` (`AuditLogContext.tsx:9,131`) | ✅ |
| Formulary | `formulary` | `components/FormularyPage.tsx` (520 lines) | yes | — | `@/services/clinicalApi` (`:26`) | ✅ |
| RAG settings | `rag-settings` | `components/RAGSettingsPage.tsx` | yes | — | `useBackend()` (`:54`) | ✅ |
| Sidebar | — | `components/Sidebar.tsx` | yes | — | none | ✅ |
| DgLogo | — | `components/DgLogo.tsx` | — | — | none | ✅ |

`src/pages/not-found.tsx` — reference search: `grep -rl "not-found\|NotFound" src --include=*.tsx --include=*.ts`
excluding `src/pages/` returns **0 files**. 💀 DEAD-CODE CANDIDATE.

`src/components/ui/` holds 55 shadcn-style primitives. Individual reachability of each was not
traced: `NOT DETERMINED — searched: per-file import grep was not run for all 55; only
sidebar.tsx (727 lines) and sonner.tsx were inspected.`

**Contexts and where their data comes from:**

| Context | File | Data source | Persistence |
|---|---|---|---|
| `AuthContext` | `contexts/AuthContext.tsx` | `useReplitAuth()` → `GET /api/auth/user`; `GET /api/auth/methods`; `POST /api/auth/login` | server session cookie |
| `BackendContext` | `contexts/BackendContext.tsx` | `@/services/clinicalApi` (`:21`) | server |
| `AuditLogContext` | `contexts/AuditLogContext.tsx` | `fetchAllAuditLog()`, `verifyAuditChain()` (`:9`) | server |
| `LanguageContext` | `contexts/LanguageContext.tsx` | i18next; sets `document.documentElement.dir`/`lang` | — |
| `ThemeContext` | `contexts/ThemeContext.tsx` | local | — |
| `DocumentVerificationContext` | `contexts/DocumentVerificationContext.tsx` | `DEMO_SOURCES` — defined at `:47` as `[]`; `useState` at `:57,58` | **none** — in memory only; no `fetch`, no `localStorage` (`grep -n "fetch\|localStorage"` → no hit) |

`SettingsPage.tsx:55` `notifications` and `:62` `theme` are local `useState` with no write path;
the file's own comment at `:37` states the permission toggles are "local state with a
'Permission updated' toast attached". These two screens are 🟡 IMPLEMENTED BUT PARTIALLY
CONNECTED: they render and accept input, and the input reaches no server.

### 7.2 Mobile app — `artifacts/nursing-mobile`

| Route | File | Registered in `_layout.tsx` |
|---|---|---|
| `index` | `app/index.tsx` | yes (`:37`) |
| `chat/[category]` | `app/chat/[category].tsx` | yes (`:38`) |
| `admin` | `app/admin.tsx` (585 lines) | yes (`:39`) |
| `drug-assistant` | `app/drug-assistant.tsx` (678 lines) | yes (`:40`) |
| `+not-found` | `app/+not-found.tsx` | expo-router convention, not listed in the `Stack` |

Deployment reachability: the mobile app has a manifest
(`artifacts/nursing-mobile/.replit-artifact/artifact.toml`, `kind = "mobile"`,
`paths = ["/mobile/"]`), and it **builds** — `pnpm run build` executed it successfully (§27,
`artifacts/nursing-mobile build: Build complete!`). It is **not** registered in `.replit`'s
`[[artifacts]]` list (which names `artifacts/api-server`, `artifacts/bestnursingai`,
`artifacts/clinical-ai-engine` only) and has **no** service in `docker-compose.yml`.
Status: 🔵 IMPLEMENTED BUT REACHABILITY NOT PROVEN — no deployment target in this repository
mounts it.

### 7.3 `artifacts/mockup-sandbox`

`src/App.tsx:3` imports `./.generated/mockup-components`. That module exists
(`src/.generated/mockup-components.ts`, 171 bytes) and `App.tsx:41` resolves keys of the form
`./components/mockups/<path>.tsx`. `find src/components -maxdepth 2` lists only
`src/components/ui/*` — there is no `components/mockups/` directory. The package is excluded
from the workspace at `pnpm-workspace.yaml:8`. 💀

---

## 8. API Inventory

### 8.1 api-server (Express), mounted under `/api` and `/bnp-api`

| Method | Path | Handler file:line | Auth | Middleware | Notes |
|---|---|---|---|---|---|
| GET | `/api/healthz` | `routes/health.ts:6` | none | `authMiddleware` (non-blocking) | returns `HealthCheckResponse` from `@workspace/api-zod` |
| GET | `/api/auth/user` | `routes/auth.ts:92` | none required to call | `authMiddleware` | returns `{user}` or `{user:null}` |
| GET | `/api/login` | `routes/auth.ts:100` | none | — | OIDC authorization redirect |
| GET | `/api/callback` | `routes/auth.ts:131` | none | — | OIDC code exchange, session creation |
| GET | `/api/logout` | `routes/auth.ts:191` | none | — | clears session; `:354` sets `iss` on the callback URL |
| GET | `/api/auth/methods` | `routes/auth.ts:218` | none | — | reports whether OIDC is configured |
| POST | `/api/auth/login` | `routes/auth.ts:223` | none | **`loginRateLimit`** | password sign-in |
| POST | `/api/auth/password` | `routes/auth.ts:273` | session required | — | change password |
| POST | `/api/auth/logout` | `routes/auth.ts:330` | — | — | |
| POST | `/api/mobile-auth/token-exchange` | `routes/auth.ts:337` | none | — | mobile PKCE code → session token |
| POST | `/api/mobile-auth/logout` | `routes/auth.ts:390` | — | — | |
| ALL | `/api/*` (unmatched) | `app.ts:62` | — | — | JSON 404 |
| ALL | `/bnp-api/*` | `routes/gateway.ts:46` | **`req.isAuthenticated()` or 401** (`:47`) | mounted before body parsers | reverse proxy |
| GET | `/*` (unmatched, non-`/api`) | `lib/webApp.ts` via `app.ts:69` | none | — | SPA `index.html` |

Gateway behaviour worth recording precisely (`routes/gateway.ts`):
`DROPPED_REQUEST_HEADERS` (`:14-26`) removes `authorization` and `cookie` before forwarding;
`headers.set("authorization", "Bearer " + token)` (`:65`) replaces them;
`x-forwarded-for` is preserved (`:67`); upstream timeout `120_000` ms (`:9`); on `fetch`
rejection it returns `502` (`:88`); on a missing `ENGINE_JWT_SECRET` it returns `503` (`:58`).

### 8.2 clinical-ai-engine (FastAPI)

| Method | Path | Handler | Dependency (authz) |
|---|---|---|---|
| GET | `/` | `main.py:201` | none |
| GET | `/health` | `main.py:122` | none |
| GET | `/livez` | `main.py:163` | none |
| GET | `/metrics` | `main.py:183` | none — comment at `:186` states it is unauthenticated deliberately |
| POST | `/auth/register` | `routers/auth.py:130` | see §10 |
| POST | `/auth/login` | `routers/auth.py:155` | none |
| GET | `/auth/me` | `routers/auth.py:175` | `get_current_user` |
| GET | `/auth/audit-log` | `routers/auth.py:180` | admin |
| GET | `/auth/audit-log/verify` | `routers/auth.py:198` | `require_admin` (`:202`) |
| POST | `/documents/upload` | `routers/documents.py:18` | `require_admin` (`:21`) |
| GET | `/documents/` | `routers/documents.py:103` | `get_current_user` (`:104`) |
| DELETE | `/documents/{document_id}` | `routers/documents.py:120` | `require_admin` (`:123`) |
| GET | `/documents/chunks/{chunk_id}` | `routers/documents.py:156` | `require_admin` (`:159`) |
| POST | `/query/` | `routers/query.py:112` | `get_current_user` (`:116`) |
| GET | `/formulary` and `/formulary/` | `routers/formulary.py:67,68` | `require_admin` (`:75`) |
| GET | `/formulary/summary` | `routers/formulary.py:84` | `require_admin` (`:85`) |
| POST | `/formulary/import` | `routers/formulary.py:112` | `require_admin` (`:118`) |
| POST | `/formulary/{drug_id}/review` | `routers/formulary.py:209` | `require_admin` (`:214`) |
| POST | `/formulary/{drug_id}/retire` | `routers/formulary.py:278` | `require_admin` (`:283`) |
| GET | `/formulary/review-packet.xlsx` | `routers/formulary.py:363` | `require_admin` (`:368`) |

**Request validation.** `POST /query/` takes a `QueryRequest` pydantic model
(`models/schemas.py`); `POST /documents/upload` validates the extension
(`documents.py:32`), enforces `MAX_FILE_SIZE` incrementally (`:44`, HTTP 413), and checks the
`%PDF-` magic bytes (`:50`).

**Endpoints with no caller in either client.** Search: every path literal in
`artifacts/bestnursingai/src/services/clinicalApi.ts` and
`artifacts/nursing-mobile/services/clinicalApi.ts`.

| Engine endpoint | Called by web client | Called by mobile client |
|---|---|---|
| `/formulary/summary` | no | no |
| `/formulary/{id}/retire` | no | no |
| `/documents/chunks/{id}` | no | no |
| `/metrics` | no | no |
| `/auth/register`, `/auth/login`, `/auth/me` | no | no |
| `/livez`, `/` | no | no |

These are 🔵 — reachable over HTTP through the gateway by any signed-in caller, with no
in-repository client that invokes them.

**GraphQL / RPC / WebSocket / webhook:** none. Search:
`grep -rniE "graphql|apollo|trpc|grpc|websocket|socket\.io|new WebSocket|webhook"` over
`artifacts/`, `lib/` → no runtime hit. ❌ NOT FOUND.

---

## 9. Authentication

Two independent mechanisms exist, and they meet at the gateway.

### 9.1 Browser / mobile session — api-server

| Element | Evidence |
|---|---|
| OIDC discovery + client | `lib/auth.ts:8` `ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc"`; `:24-25` `new URL(ISSUER_URL)`, `process.env.REPL_ID!` |
| Login redirect | `routes/auth.ts:100` |
| Callback | `routes/auth.ts:131` |
| Refresh-token grant | `middlewares/authMiddleware.ts:39` `oidc.refreshTokenGrant` |
| Session storage | PostgreSQL `sessions` table — `lib/db/src/schema/auth.ts:12` |
| Session cookie → user | `middlewares/authMiddleware.ts:62-84`: `getSessionId(req)` → `getSession(sid)` → `refreshIfExpired` → `req.user` |
| Password sign-in | `routes/auth.ts:223` `POST /auth/login` with `loginRateLimit` |
| Password change | `routes/auth.ts:273` `POST /auth/password` |
| Password hash | `lib/password.ts` — **scrypt** from node `crypto` (`:31`), stored as `scrypt$N$r$p$<salt-hex>$<hash-hex>` (`:45`); `rejectWeakPassword` at `:103` |
| Password column | `lib/db/src/schema/auth.ts` `passwordHash: varchar("password_hash")` |
| First account | `lib/bootstrapAdmin.ts`, called at `index.ts:26` before `listen` |
| Mobile token exchange | `routes/auth.ts:337` `POST /mobile-auth/token-exchange` |
| Mobile token storage | `artifacts/nursing-mobile/services/session.ts:12` `expo-secure-store`, key `bnp_session_token` (`:14`) |

`bcrypt` and `argon2` are absent from the TypeScript side. Search: `grep -rn "bcrypt\|argon2"`
over `artifacts/api-server/src`, `lib/` → no hit. `lib/password.ts:6-10` states scrypt was
chosen instead.

### 9.2 Engine tokens

| Element | Evidence |
|---|---|
| Gateway-minted token | `lib/engineToken.ts:35-54` — HS256, `iss: "bnp-gateway"` (`:13`), `exp = now + 300` (`:16`), signed with `ENGINE_JWT_SECRET` (`:22`) |
| Engine verification | `routers/auth.py:64` `jwt.decode(token, JWT_SECRET, algorithms=["HS256"])` |
| Gateway-issuer branch | `routers/auth.py:114-117` `get_current_user`: when `payload["iss"] == GATEWAY_ISSUER` → `_resolve_gateway_user` |
| Identity materialisation | `routers/auth.py:86-108` — selects or inserts a `bnp_users` row keyed on `external_id`, with `password_hash = EXTERNAL_ACCOUNT_SENTINEL` (`:37`) so it can never be password-authenticated |
| Engine's own tokens | `routers/auth.py:52-60` `create_token`, `JWT_EXPIRE_HOURS = 24` (`:38`) |
| Engine password hashing | `routers/auth.py:35` `CryptContext(schemes=["bcrypt","sha256_crypt"], deprecated=["sha256_crypt"])` |
| Fail-fast | `routers/auth.py:22-27` — empty `JWT_SECRET` raises `RuntimeError` at import |

`JWT_SECRET` (engine) and `ENGINE_JWT_SECRET` (api-server) must hold the same value;
`docker-compose.yml:83` encodes that with `${ENGINE_JWT_SECRET:?ENGINE_JWT_SECRET is required
and must equal JWT_SECRET}`.

**No key id / rotation support.** Search: `grep -rn "kid\|keyid\|jwks"` over
`artifacts/api-server/src/lib/engineToken.ts`, `artifacts/clinical-ai-engine/routers/auth.py`
→ no hit. Single symmetric secret.

**Absent mechanisms.** MFA, magic links, email verification, password reset by email, API keys
for third parties, service accounts. Search: `grep -rniE "\bmfa\b|totp|otp|magic.?link|verify.?email|reset.?password|api.?key"`
over `artifacts/api-server/src`, `artifacts/clinical-ai-engine/routers` → the only matches are
`OPENAI_API_KEY` reads. ❌ NOT FOUND.

---

## 10. Authorization

```
sign-in (OIDC or password)
   └─► grantRolesFor()  routes/auth.ts   roles derived from ADMIN_EMAILS, never from input
         └─► users.roles (text[] NOT NULL DEFAULT ARRAY['user'])
               lib/db/src/schema/auth.ts:34-38
                 └─► session.user.roles  → req.user.roles
                       └─► mintEngineToken: role = roles.includes("admin") ? "admin" : "user"
                             lib/engineToken.ts:44
                             └─► engine _resolve_gateway_user: role taken from the token,
                                 written to bnp_users.role, never re-derived
                                 routers/auth.py:80-83, :104-107
                                   └─► require_admin  routers/auth.py:119-122
```

| Layer | Roles | Enforcement point |
|---|---|---|
| Database | `users.roles text[]`, default `['user']` | `lib/db/src/schema/auth.ts:34` |
| Web UI | `permissions` array derived from `roles` | `contexts/AuthContext.tsx:38-46`; `hasPermission` at `:48` |
| Gateway | authenticated-or-401 only; **no role check** | `routes/gateway.ts:47` |
| Engine | `admin` / `user` | `routers/auth.py:119` `require_admin` |

**Engine resources by required role:**

| Role | Resource / action |
|---|---|
| any authenticated | `GET /documents/`, `POST /query/`, `GET /auth/me` |
| admin | document upload, document delete, chunk read, the entire `/formulary` surface, audit-log read, audit-chain verify |
| unauthenticated | `/`, `/health`, `/livez`, `/metrics` |

**Authorization not proven for:**

* `/metrics` — unauthenticated by construction (`main.py:183`, comment at `:186-190`). Whether
  the deployment prevents public reach: `NOT DETERMINED — searched: docker-compose.yml (engine
  publishes no ports, comment at :63 "No published ports: gateway-only access"),
  artifacts/clinical-ai-engine/.replit-artifact/artifact.toml (paths = []); no runtime network
  policy is verifiable from this repository.`
* `POST /auth/register` (`routers/auth.py:130`) — the decorator line was read; the dependency
  list of that specific handler was not: `NOT DETERMINED — searched: grep -n "Depends(" over
  routers/auth.py returned dependency lines for :159 (audit-log), :202 (verify) and the
  helper definitions at :113,:119; the register handler's signature body at :130-155 was not
  individually read.`
* No ownership checks, ACL, ABAC or policy engine exists. Search:
  `grep -rniE "\bacl\b|\babac\b|casbin|oso|policy|can\(|ability"` over `artifacts/`, `lib/`
  → no runtime hit. ❌ NOT FOUND.

---

## 11. Database / Data

**One data store: PostgreSQL**, addressed by two independent clients against the same
`DATABASE_URL`.

| Client | Library | Entry |
|---|---|---|
| api-server | drizzle-orm + `pg.Pool` | `lib/db/src/index.ts:13` |
| engine | psycopg2 `ThreadedConnectionPool` | `models/database.py:22`, bounds `DB_POOL_MIN`/`DB_POOL_MAX` |

### 11.1 TypeScript-side tables (`lib/db/src/schema/auth.ts`)

`sessions` (`:12`)

| Column | Type | Constraints |
|---|---|---|
| `sid` | varchar | PRIMARY KEY |
| `sess` | jsonb | NOT NULL |
| `expire` | timestamp | NOT NULL, index `IDX_session_expire` |

`users` (`:23`)

| Column | Type | Constraints |
|---|---|---|
| `id` | varchar | PK, default `gen_random_uuid()` |
| `email` | varchar | UNIQUE |
| `first_name`, `last_name`, `profile_image_url` | varchar | |
| `password_hash` | varchar | nullable — comment at `:29-32` states a null hash fails `verifyPassword()` |
| `roles` | text[] | NOT NULL, default `ARRAY['user']::text[]` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, `defaultNow()`; `updated_at` has `$onUpdate` |

`lib/db/src/schema/index.ts:11` contains a commented example (`// export const postsTable = …`)
and no further tables.

### 11.2 Engine-side tables (`alembic/versions/0001_baseline.py`, `0002`, `0003`)

`bnp_users` — `id SERIAL PK`, `username VARCHAR(100) UNIQUE NOT NULL`, `password_hash TEXT NOT NULL`,
`full_name VARCHAR(200)`, `role VARCHAR(50) DEFAULT 'user'`, `external_id VARCHAR(255)`,
`created_at TIMESTAMP DEFAULT NOW()`; partial unique index `idx_users_external ON (external_id)
WHERE external_id IS NOT NULL` (`0001:39-40`).

`bnp_documents` — `id VARCHAR(64) PK`, `filename TEXT NOT NULL`,
`uploaded_by INTEGER REFERENCES bnp_users(id)`, `upload_date TIMESTAMP DEFAULT NOW()`,
`chunk_count INTEGER DEFAULT 0`; `deleted_at TIMESTAMP` added by `0002:32`.

`bnp_chunks` — `id SERIAL PK`, `chunk_id VARCHAR(128) UNIQUE NOT NULL`,
`document_id VARCHAR(64) REFERENCES bnp_documents(id)`, `content TEXT NOT NULL`,
`page_number INTEGER DEFAULT 1`, `chunk_index INTEGER DEFAULT 0`, `created_at`;
`deleted_at` added by `0002:33`; the cascade FK is dropped and replaced at `0002:37-38`;
unique index `idx_chunks_doc_index_live` (`0002:45`).

`bnp_audit_log` — base columns `id`, `session_id`, `user_id`, `username`, `query`, `query_type`,
`confidence`, `rejected`, `answer_hash`, `timestamp`; extended in `0001:76-87` with
`answer_text`, `dose_text`, `citations JSONB`, `safety_alerts JSONB`, `confidence_label`,
`rejection_reason`, `client_ip`, `user_agent`, `model`, `drug_db_version`, `engine_version`;
extended again in `0002:54-55` with `prev_hash TEXT`, `chain_hash TEXT`.
Indexes: `idx_audit_user`, `idx_audit_session`, `idx_audit_timestamp (timestamp DESC)`.

`bnp_drug_formulary` (`0003:42-118`) — `drug_id UUID PK DEFAULT gen_random_uuid()` plus 44
columns in three groups (identity, clinical, provenance, governance) and six CHECK constraints:

| Constraint | Rule |
|---|---|
| `ck_formulary_review_status` | `review_status IN ('pending','approved','rejected')` |
| `ck_formulary_source_present` | `length(trim(source_name)) > 0` |
| `ck_formulary_unit_autocalc` | `unit = 'mg' OR auto_calculate = FALSE` |
| `ck_formulary_overdose_absolute_sane` | `overdose_threshold_absolute >= adult_max_daily` when both present |
| `ck_formulary_pediatric_pair` | pediatric min/max both null or both set |
| `ck_formulary_adult_flat_pair` | adult flat min/max both null or both set |

Soft delete via `retired_at`; `version INTEGER NOT NULL DEFAULT 1`.

**No enums, triggers, views or stored functions** are created by any migration. Search:
`grep -rn "CREATE TYPE\|CREATE TRIGGER\|CREATE VIEW\|CREATE FUNCTION\|CREATE OR REPLACE"` over
`alembic/versions/` and `lib/db/drizzle/` → no hit.

### 11.3 The vector index is not in this tree

`git ls-tree -r main --name-only artifacts/clinical-ai-engine/data/` returns exactly nine
files: seven formulary CSV/JSON files and two `.xlsx` workbooks under `data/formulary/source/`.
There is **no FAISS index in the `main` tree.** `.gitignore` excludes
`artifacts/clinical-ai-engine/data/*` with an exemption for `data/formulary/`, and the
exclusion comment states the index is regenerated from `bnp_chunks` on startup.
`git log --diff-filter=D -1 -- artifacts/clinical-ai-engine/data/faiss_index/lc_index/index.faiss`
→ `96fa826 Add Docker deployment, environment docs, and a README`.

A 33,970,221-byte `index.faiss` and a 6,081,168-byte `meta.pkl` exist in this container's
working directory as **ignored, untracked** files (`git status --porcelain --ignored
artifacts/clinical-ai-engine/data` → `!! artifacts/clinical-ai-engine/data/faiss_index/`).
They are local state, not repository content.

### 11.4 Client-side storage

* Web: no `localStorage`/`IndexedDB` writes were found in the contexts inspected
  (`grep -n "localStorage"` over `src/contexts/*.tsx` → no hit in
  `AuditLogContext`, `DocumentVerificationContext`, `BackendContext`).
  Complete coverage of all 68 components: `NOT DETERMINED — searched: contexts only.`
* Mobile: `expo-secure-store` for the session token (`services/session.ts:12`).
  `@react-native-async-storage/async-storage` is listed in `replit.md:215` as a key package;
  its use in current source: `NOT DETERMINED — searched: replit.md only; no grep over
  artifacts/nursing-mobile source was run for AsyncStorage.`

---

## 12. Migrations / Seeds

**Two independent migration systems**, one per language side. Neither manages the other's
tables.

| Order | File | Effect |
|---|---|---|
| 1 | `alembic/versions/0001_baseline.py` | creates `bnp_users`, `bnp_documents`, `bnp_chunks`, `bnp_audit_log`; adds the extended audit columns; four indexes |
| 2 | `alembic/versions/0002_audit_integrity.py` | `deleted_at` on documents and chunks; replaces the cascade FK; live-row partial indexes; `prev_hash`/`chain_hash` on the audit log |
| 3 | `alembic/versions/0003_drug_formulary.py` (635 lines) | creates `bnp_drug_formulary` with six CHECK constraints; seeds rows |

All three are written as idempotent SQL (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, `CREATE … INDEX IF NOT EXISTS`). `downgrade()` in `0001` raises
`NotImplementedError` with the reason "it would drop the audit trail".

| Order | File | Effect |
|---|---|---|
| 1 | `lib/db/drizzle/0000_oval_the_executioner.sql` | initial |
| 2 | `lib/db/drizzle/0001_massive_gateway.sql` | subsequent |

Journal at `lib/db/drizzle/meta/_journal.json`, snapshots at `meta/0000_snapshot.json`,
`meta/0001_snapshot.json`.

**Application.** Engine: `models/database.py:76` `run_migrations()`, `:83` `current_revision()`,
`:95` `init_db()`; gated by `AUTO_MIGRATE` (`.env.example:20-22`).
api-server: `src/migrate.ts`, run as `node ./dist/migrate.mjs` (`docker-compose.yml:70`).
Under compose both run as one-shot jobs (`engine-migrate` at `:26`, `migrate` at `:65`) with
`condition: service_completed_successfully` gating the servers (`:60`, `:96`).

**Seeds and fixtures.**

| Path | Kind |
|---|---|
| `alembic/versions/0003_drug_formulary.py` | data migration seeding formulary rows |
| `data/formulary/jsh_formulary_import.csv` + `.manifest.json` | import input, PDF-extracted |
| `data/formulary/jsh_workbooks_import.csv` (621 lines) + `.manifest.json` | import input, workbook-converted |
| `data/formulary/corrections_import.csv` | import input |
| `data/formulary/pharmacist_review_log.csv` (638 lines) | recorded review decisions |
| `data/formulary/retirement_log.csv` | recorded retirements |
| `data/formulary/source/*.xlsx` | two source workbooks |
| `scripts/apply_jsh_formulary.py` | replays the logs through the HTTP API |
| `tests/formulary_fixture.py` | test fixture |

Whether the migration chain is complete, divergent or has pending revisions **against a live
database**: `NOT DETERMINED — no database was available in this session; TEST_DATABASE_URL and
DATABASE_URL are both unset (checked with echo), and 40 of 214 pytest cases skipped for that
reason (§27).`

---

## 13. External Services

Only services contacted by runtime code, traced to a caller.

| Service | File → function | API | Auth | Caller |
|---|---|---|---|---|
| **OpenAI embeddings** | `services/embeddings.py:45 _get_embeddings()` → `OpenAIEmbeddings(...)` (`:61`), model `text-embedding-3-small` (`:32`) | embeddings | `OPENAI_API_KEY` env; raises `EmbeddingsUnavailable("OPENAI_API_KEY is not set")` at `:57` when absent | `_load_state` (`:125`), `sync_from_db` (`:154`), `add_chunks` (`:245`), `remove_document` (`:289`), `hybrid_search` (`:320`) — all reached from `routers/query.py:158` and `routers/documents.py` |
| **OpenAI chat** | `services/response_generator.py:193` `from langchain_openai import ChatOpenAI`, `:197` `model="gpt-4o"`, `:199` `temperature=0` | chat completions | `OPENAI_API_KEY`, or `AI_INTEGRATIONS_OPENAI_API_KEY` + `AI_INTEGRATIONS_OPENAI_BASE_URL` (`:180-181`) | `generate_response` (`:169`), called from `routers/query.py` |
| **OIDC issuer** | `artifacts/api-server/src/lib/auth.ts:24` `new URL(ISSUER_URL)`, default `https://replit.com/oidc` (`:8`) | OpenID Connect discovery, PKCE, refresh grant | `REPL_ID` as `client_id` (`:25`, `routes/auth.ts:199`) | `GET /api/login`, `GET /api/callback`, `authMiddleware.refreshIfExpired` |
| **PostgreSQL** | see §11 | — | `DATABASE_URL` | both servers |

**Installed but not contacted at runtime, by search:** no Stripe, Twilio, SendGrid, Sentry,
AWS, Azure, GCP, Firebase, Supabase, Pinecone or Hugging Face client appears in any runtime
import. Search: `grep -rniE "stripe|twilio|sendgrid|sentry|aws-sdk|@azure|@google-cloud|firebase|supabase|pinecone|huggingface"`
over `artifacts/*/src`, `artifacts/clinical-ai-engine/**/*.py`, `lib/*/src`,
`requirements.txt` → no hit. ❌ NOT FOUND.

`AI_INTEGRATIONS_OPENAI_BASE_URL` / `AI_INTEGRATIONS_OPENAI_API_KEY` are read at
`services/response_generator.py:180-181` and are defined in **no** configuration file in this
repository (absent from `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml`, all
five `artifact.toml`). 🟡

---

## 14. AI / ML / RAG

```
INPUT            POST /query/ body.question              routers/query.py:112
  │
CLASSIFY         classify_query(question)                services/clinical_router.py:58
  │                                                       called at query.py:135
TRANSLATE        translate_for_search(question)          services/arabic_translator.py
  │              Arabic→English for retrieval only;      called at query.py:157
  │              the original question goes to the model
RETRIEVE         retriever.hybrid_search(search_query,   services/embeddings.py:320
  │              top_k=body.top_k)                        called at query.py:163
  │              60% FAISS semantic + 40% BM25 (:322)
  │              BM25 saturation x/(x+8.0) (:27-30)
  │              EmbeddingsUnavailable → HTTP 503 (query.py:167-177)
CITATIONS        Citation(document_name, page_number,    query.py:180-190
  │              relevance_score, excerpt[:200],
  │              chunk_id, document_id)
VALIDATE         validate_context(chunks, question,      services/context_validator.py
  │              top_confidence)                          called at query.py:231
  │              invalid → refusal, audit(rejected=True), returns (query.py:245-273)
SAFETY (pre)     check_retrieval(citations, confidence)  services/safety_layer.py:34
  │              not safe → refusal + audit (query.py:280-311)
FORMULARY        formulary.get / find_in_text            services/formulary.py:126,135
  │              entry.coverage (CoverageStatus)          query.py:343
  │              SafetyEngine.calculate_dose_kg           query.py:399 → hard_blocked
  │              calculate_dose(entry, question, w, age)  query.py:408
GENERATE         ChatOpenAI(gpt-4o, temperature=0)       services/response_generator.py:197
  │              SystemMessage(BNP_SYSTEM_PROMPT)         :226; prompt defined at :18
  │              context fenced so a document cannot      :98 (comment)
  │              close the fence
PARSE            parse_bnp_sections / parse_bullets /    :238, :265, :297, :311
  │              parse_nursing_notes_list /
  │              parse_contraindications_list
SAFETY (post)    check_answer(answer, confidence)        services/safety_layer.py:63
  │              is_high_risk(question, answer)          :83, used at query.py:484
AUDIT            _log_query(...) with answer_hash,       query.py:558 sha256 of the answer
  │              prev_hash, chain_hash                    :580-586
  │              failure → HTTP 503, answer withheld      query.py:219-229
OUTPUT           QueryResponse
```

**Ingestion.** `POST /documents/upload` (`routers/documents.py:18`) → `process_pdf(content)`
(`:60`, defined in `services/pdf_processor.py`, imported at `documents.py:7`) → chunk rows in
`bnp_chunks` → `retriever.add_chunks` (`services/embeddings.py:245`).

**Index persistence.** `_save_state` (`services/embeddings.py:230`) calls
`self._vectorstore.save_local(FAISS_LANGCHAIN_PATH)`. Load path: `_load_state` (`:125`) with
`allow_dangerous_deserialization=True` (`:136`). Recovery: `sync_from_db` (`:154`) rebuilds
from `bnp_chunks` when the DB holds more chunks than the in-memory index (`:186`), building
into locals and publishing on success.

**Refusal paths, in order of precedence:**

| Condition | Result | Evidence |
|---|---|---|
| formulary unavailable | HTTP 503 | `query.py:131-146` |
| retrieval unavailable | HTTP 503 | `query.py:165-177` |
| context invalid | 200 with `rejected=True`, empty citations | `query.py:245-273` |
| retrieval-safety fail | 200 with `rejected=True`, empty citations | `query.py:280-311` |
| overdose hard block | `rejected=True`, `rejection_reason="Overdose detected — dose exceeds maximum safe limit"` | `query.py:399-402`, `:522` |
| audit write failure | HTTP 503, answer withheld | `query.py:219-229` |

**Confidence.** `top_confidence = chunks[0]["relevance_score"]` (`query.py:194`);
`confidence_label` comes from `validate_context` (`query.py:232`).

**No local/offline model, no reranker, no OCR, no evaluation harness.** Search:
`grep -rniE "rerank|cross-encoder|sentence-transformers|llama\.cpp|onnx|tesseract|ocr|ragas|deepeval"`
over `artifacts/clinical-ai-engine` → no hit. ❌ NOT FOUND.

---

## 15. Security Mechanisms

| Mechanism | Definition | Caller / runtime path | Status |
|---|---|---|---|
| Password hashing (gateway) | `lib/password.ts` — node `crypto.scrypt` (`:31`), parameterised format (`:45`), constant-length compare path (`:86`) | `routes/auth.ts:223` login, `:273` change | ✅ |
| Weak-password rejection | `lib/password.ts:103 rejectWeakPassword` | `routes/auth.ts:273`; `lib/bootstrapAdmin.ts` (fatal at `index.ts:26-31`) | ✅ |
| Password hashing (engine) | `routers/auth.py:35` passlib `bcrypt` primary, `sha256_crypt` deprecated; `hash_password` (`:40`), `verify_password` (`:44`) | `POST /auth/login`, `POST /auth/register` | ✅ |
| External-account sentinel | `routers/auth.py:37` `EXTERNAL_ACCOUNT_SENTINEL` | written by `_resolve_gateway_user` (`:100`); `verify_password` returns `False` on `ValueError` (`:47`) | ✅ |
| HMAC-SHA256 token signing | `lib/engineToken.ts:46-49` `crypto.createHmac("sha256", requireSecret())` | every `/bnp-api` request (`gateway.ts:52`) | ✅ |
| Token verification | `routers/auth.py:63-69` `jwt.decode` with explicit `algorithms=["HS256"]` | `get_current_user` on every protected engine route | ✅ |
| Login rate limiting | `lib/loginRateLimit.ts` — 10 attempts / 5 min (`:17-18`), in-process `Map` (`:21`), sweep every 10 min (`:19`) | `routes/auth.ts:223` | ✅ (per process) |
| Engine rate limiting | `middleware/rate_limit.py:19-24` — `/auth/login` 10/300s, `/auth/register` 5/3600s, `/documents/upload` 20/3600s, `/query` 60/60s | `main.py:109` `app.add_middleware(RateLimitMiddleware)` | ✅ (per process) |
| Proxy-hop trust | `app.ts:22` `app.set("trust proxy", 1)` with a comment explaining why not `true` | affects `req.ip` used by the limiter | ✅ |
| CORS (gateway) | `app.ts:56` `cors({ credentials: true, origin: true })` | every request | ✅ |
| CORS (engine) | `main.py:99-107` — allowlist from `CORS_ORIGINS`, `"*"` filtered out at `:92`; middleware not added when the list is empty | conditional | ✅ |
| Credential stripping at the proxy | `routes/gateway.ts:14-26` drops `authorization` and `cookie` | every `/bnp-api` request | ✅ |
| Upload restrictions | `documents.py:32` extension, `:44` size (413), `:50` `%PDF-` magic bytes | `POST /documents/upload` | ✅ |
| Audit hash chain | `query.py:74 compute_chain_hash`, `:99` sha256; genesis + `FOR UPDATE` row lock (`:580`); mirrored in `services/audit_events.py:52-87` | every query (`query.py:585`) and every formulary governance event (`routers/formulary.py:32`) | ✅ |
| Chain verification endpoint | `routers/auth.py:198` `GET /auth/audit-log/verify` | web audit page (`AuditLogContext.tsx:9` `verifyAuditChain`) | ✅ |
| Prompt-injection fencing | `services/response_generator.py:98` (fence comment), `_build_context` (`:102`) | `generate_response` | 🔵 — the fence is constructed; its effectiveness is not testable from source |
| Soft delete of evidence | `0002_audit_integrity.py:32-33` `deleted_at`; `routers/formulary.py:278` retire | document delete, formulary retire | ✅ |
| Structured logging without PHI | `query.py:135` logs `query_type` and `chars=len(question)`, with a comment stating the question is not logged | every query | ✅ |

**Absent.** No CSP, no `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
or `Referrer-Policy` header is set anywhere. Search: `grep -n "add_header"` over
`artifacts/bestnursingai/nginx.conf` → only `Cache-Control` at `:43` and `:48`;
`grep -rn "helmet\|Content-Security-Policy\|X-Frame-Options\|X-Content-Type-Options\|Strict-Transport-Security"`
over `artifacts/api-server/src`, `artifacts/clinical-ai-engine` → no hit. ❌ NOT FOUND.

No CSRF token mechanism. Search: `grep -rniE "csrf|xsrf|samesite"` over
`artifacts/api-server/src` → no hit in the files inspected;
`NOT DETERMINED — searched: grep over artifacts/api-server/src; lib/auth.ts cookie options
were not individually read, so the session cookie's SameSite attribute is unverified here.`

No encryption at rest in application code: no AES, RSA, Ed25519, SQLCipher or WebCrypto usage.
Search: `grep -rniE "\baes\b|createCipher|RSA|ed25519|sqlcipher|SubtleCrypto|crypto\.subtle"`
over `artifacts/`, `lib/` → the only hits are `crypto-js/sha256` in
`bestnursingai/src/contexts/DocumentVerificationContext.tsx:4` (a checksum, not encryption)
and node `crypto` in `lib/password.ts` / `lib/engineToken.ts`. ❌ NOT FOUND.

Biometric authentication: `expo-local-authentication` is named in `replit.md:215`.
`NOT DETERMINED — searched: replit.md only; no grep for LocalAuthentication over
artifacts/nursing-mobile source was performed.`

---

## 16. Configuration / Environment Variables

Every name below is read by code at the cited location. **No value is reproduced.**

### 16.1 Read by the clinical engine

| Variable | Read at | Required | Documented in `.env.example` |
|---|---|---|---|
| `DATABASE_URL` | `models/database.py`; `main.py:126` | yes | yes |
| `DB_POOL_MIN`, `DB_POOL_MAX` | `models/database.py` | no | yes |
| `AUTO_MIGRATE` | `models/database.py` | no | yes |
| `JWT_SECRET` | `routers/auth.py:22` | **yes — import fails without it** (`:24`) | yes |
| `ENGINE_JWT_SECRET` | referenced in engine sources | see §9.2 | yes |
| `OPENAI_API_KEY` | `services/embeddings.py:57`; `main.py:134` | for query serving | yes |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | `services/response_generator.py:180` | no | **no** |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | `services/response_generator.py:181` | no | **no** |
| `CORS_ORIGINS` | `main.py:90` | no | yes |
| `LOG_FORMAT` | `main.py:32` | no | yes |
| `BNP_EMAIL`, `BNP_PASSWORD` | engine `scripts/` | CLI only | **no** |
| `TEST_DATABASE_URL` | `tests/` | tests only | **no** |

### 16.2 Read by the api-server

| Variable | Read at | Required |
|---|---|---|
| `PORT` | `src/index.ts:5` | **yes — throws at `:8`** |
| `ENGINE_URL` | `routes/gateway.ts:4` | no (default `http://127.0.0.1:8000`) |
| `ENGINE_JWT_SECRET` | `lib/engineToken.ts:22` | yes for `/bnp-api` (503 otherwise) |
| `ADMIN_EMAILS` | `routes/auth.ts` (`grantRolesFor`) | no |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | `lib/bootstrapAdmin.ts` | first boot only |
| `WEB_ROOT` | `app.ts:69` | no (default `public`) |
| `REPL_ID` | `lib/auth.ts:25`, `routes/auth.ts:199` | for OIDC |
| `ISSUER_URL` | `lib/auth.ts:8` | no (default `https://replit.com/oidc`) |
| `DATABASE_URL` | `lib/db/src/index.ts:7` | **yes — throws at import (`:9`)** |
| `NODE_ENV` | `lib/logger.ts:3` | no |
| `LOG_LEVEL` | `lib/logger.ts:6` | no |

### 16.3 Documented but not found in code

`BASE_PATH`, `API_SERVER_URL`, `EXPO_PUBLIC_DOMAIN`, `EXPO_PUBLIC_REPL_ID`,
`EXPO_PUBLIC_ISSUER_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `WEB_PORT`
appear in `.env.example` and/or `docker-compose.yml`. `EXPO_PUBLIC_*` are confirmed read at
`artifacts/nursing-mobile/services/session.ts:15-18`. `BASE_PATH` and `API_SERVER_URL`:
`NOT DETERMINED — searched: grep for "process.env" over artifacts/api-server/src, lib/db/src,
lib/replit-auth-web/src; artifacts/bestnursingai/vite.config.ts was not read.`

### 16.4 Configuration sources

`.env.example` (94 lines, the documented contract) · `docker-compose.yml` (per-service
`environment` blocks) · `.github/workflows/ci.yml` (job `env`) · `.replit` (Replit runtime) ·
five `artifacts/*/.replit-artifact/artifact.toml` · `pnpm-workspace.yaml` (catalog, overrides,
`minimumReleaseAge`) · `tsconfig.json`, `tsconfig.base.json` · `pyproject.toml`, `alembic.ini`,
`pytest.ini` · `lib/db/drizzle.config.ts` · `lib/api-spec/orval.config.ts`.

**No `.env` file is tracked.** `.gitignore` excludes `.env` and `.env.*` with
`!.env.example`.

---

## 17. Testing

Frameworks: **pytest** (`artifacts/clinical-ai-engine/pytest.ini`) and **vitest 4.1.10**
(observed in the executed run).

### 17.1 Python — 13 files, 179 `def test_` definitions

| File | `def test_` | Subject |
|---|---:|---|
| `test_drug_calculator.py` | 28 | dose calculation, unit handling, pediatric/adult separation |
| `test_formulary_db.py` | 29 | formulary against a database (skipped without one) |
| `test_formulary_import.py` | 28 | import validation and rejection rules |
| `test_formulary_coverage.py` | 18 | `CoverageStatus` per review state |
| `test_convert_jsh_workbooks.py` | 18 | workbook→CSV converter |
| `test_query_pipeline.py` | 18 | end-to-end query behaviour via `TestClient` |
| `test_safety_layer.py` | 9 | retrieval/answer safety checks |
| `test_audit_integrity.py` | 8 | hash chain |
| `test_extract_formulary_pdfs.py` | 7 | PDF extractor, near-duplicate matcher |
| `test_mint_operator_token.py` | 4 | operator token CLI |
| `test_liveness.py` | 3 | `/livez` vs `/health` |
| `test_migrations.py` | 3 | migration application |
| `test_clinical_router.py` | 6 | query classification |

### 17.2 TypeScript — 8 files, 57 `it(`/`test(` occurrences; 54 cases executed

| File | Cases (executed) | Subject |
|---|---:|---|
| `artifacts/api-server/src/lib/password.test.ts` | — | scrypt hashing, weak-password rejection |
| `artifacts/api-server/src/lib/authUser.test.ts` | — | `AuthUser` mapping |
| `artifacts/api-server/src/lib/engineToken.test.ts` | — | token minting |
| `artifacts/api-server/src/lib/loginRateLimit.test.ts` | — | limiter windows |
| `artifacts/api-server/src/lib/webApp.test.ts` | — | SPA mounting |
| (api-server total) | **44** | |
| `artifacts/bestnursingai/src/__tests__/i18n.test.ts` | — | EN/AR key parity |
| `artifacts/bestnursingai/src/__tests__/rtl.test.ts` | — | no physical direction utilities; no runtime-built Tailwind classes |
| (bestnursingai total) | **6** | |
| `artifacts/nursing-mobile/__tests__/i18n.test.ts` | **4** | EN/AR key parity |

### 17.3 Coverage by capability

| Capability | Covered | Evidence |
|---|---|---|
| AUTH (gateway) | yes | `password.test.ts`, `authUser.test.ts`, `engineToken.test.ts` |
| AUTH (engine) | partial | `test_mint_operator_token.py`; no test of `require_admin` on each route was identified |
| AUTHORIZATION | partial | role derivation covered in `authUser.test.ts`; per-route admin enforcement: `NOT DETERMINED — searched: test file names and def-counts only, not individual test bodies` |
| API (engine) | yes | `test_query_pipeline.py` uses FastAPI `TestClient` |
| API (gateway HTTP) | no | no supertest/HTTP-level test file exists among the 8 vitest files |
| DATABASE | yes, skipped here | `test_formulary_db.py`, `test_migrations.py` — 40 cases skipped without a database |
| AI / RETRIEVAL | partial | `test_query_pipeline.py`; no test of `hybrid_search` scoring was identified by name |
| REFUSAL | yes | `test_query_pipeline.py`, `test_safety_layer.py` |
| CITATIONS | partial | citations are constructed in `query.py:180`; a dedicated citation test file does not exist |
| UI | minimal | 2 files, source-scanning assertions only; no component render test |
| MOBILE | minimal | 1 file, i18n parity only |
| SECURITY | partial | rate limiting, hashing, token minting; no test of CORS, upload limits or injection fencing was identified |
| AUDIT LOG | yes | `test_audit_integrity.py` |
| DEPLOYMENT | no | no test exercises `docker-compose.yml` or any `artifact.toml` |

---

## 18. CI/CD

`.github/workflows/ci.yml` is the only workflow (`ls .github/workflows` → one file).

**Triggers:** `push` on `[main, master]`, and `pull_request`.
**Concurrency:** `${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`.

| Job | Steps |
|---|---|
| `typescript` | checkout → `pnpm/action-setup@v4` → `setup-node@v4` (node 22, pnpm cache) → `pnpm install --frozen-lockfile --ignore-scripts` → `pnpm run typecheck` → `pnpm run test` → `pnpm run build` → regenerate `@workspace/api-spec` codegen and `git diff --exit-code -- lib/api-zod lib/api-client-react` |
| `python` | service container `postgres:16-alpine` with a `pg_isready` healthcheck on port 5432; env `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET: ci-only-not-a-real-secret`; `setup-python@v5` (3.11, pip cache) → `pip install -r requirements.txt pytest httpx` → `pytest -q`, working directory `artifacts/clinical-ai-engine` |
| `secrets` | checkout with `fetch-depth: 0` → `gitleaks/gitleaks-action@v2` with `GITHUB_TOKEN` |

All three jobs are gates: each runs a command whose non-zero exit fails the job. No job is
report-only. **No job deploys anything** — no `deploy`, `release`, `publish`, or environment
step exists in the file.

**Artifacts uploaded:** none (`actions/upload-artifact` does not appear).

**Secrets used:** `secrets.GITHUB_TOKEN` only.

---

## 19. Deployment

Three deployment substrates are described by files in the repository.

### 19.1 Docker Compose — `docker-compose.yml`

| Service | Image / build | Ports | Depends on |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | none published | — |
| `engine-migrate` | `artifacts/clinical-ai-engine/Dockerfile`, command `alembic upgrade head` | — | postgres healthy |
| `clinical-ai-engine` | same Dockerfile, `AUTO_MIGRATE: "0"` | **none published** (comment at `:63` "No published ports: gateway-only access") | postgres healthy + engine-migrate completed |
| `migrate` | `artifacts/api-server/Dockerfile`, command `node ./dist/migrate.mjs` | — | postgres healthy |
| `api-server` | same Dockerfile, `ENGINE_URL: http://clinical-ai-engine:8000`, `PORT: "8080"` | none published | postgres healthy + migrate completed |
| `web` | `artifacts/bestnursingai/Dockerfile` (nginx) | `${WEB_PORT:-8080}:80` | api-server |

Volumes: `postgres-data`, `engine-index` (mounted at `/app/data` on the engine, `:56-58`).
Both `JWT_SECRET` and `ENGINE_JWT_SECRET` use the `${VAR:?message}` form, so compose refuses
to resolve without them — confirmed by execution (§27).

`nginx.conf` proxies `/api` and `/bnp-api` to the `api_server` upstream (`:19`, `:28`) and
serves static assets with the two `Cache-Control` headers at `:43`, `:48`.

### 19.2 Replit — `.replit` + five `artifact.toml`

`.replit` `[[artifacts]]` registers three ids: `artifacts/api-server`,
`artifacts/bestnursingai`, `artifacts/clinical-ai-engine`. `nursing-mobile` and
`mockup-sandbox` have manifests but are not registered.
`[deployment] deploymentTarget = "autoscale"`, `router = "application"`.
`[postMerge] path = "scripts/post-merge.sh"` — that file exists (375 bytes).
`[nix] packages` includes `mupdf`, `harfbuzz`, `jbig2dec`, `openjpeg`, `freetype`, `gumbo`
(PDF toolchain) and `cargo`, `rustc`, `swig`, `xcbuild`.

Per-artifact manifests:

| Artifact | `kind` | `paths` | Production run |
|---|---|---|---|
| api-server | `api` | `["/api","/bnp-api"]` | `node --enable-source-maps artifacts/api-server/dist/index.mjs`, `PORT=8080`, `ENGINE_URL=http://127.0.0.1:8000`, startup health `/api/healthz` |
| clinical-ai-engine | `api` | `[]` — comment states it is not exposed publicly | `uv run uvicorn main:app --host 127.0.0.1 --port 8000`, startup health `/health` |
| bestnursingai | `web` | `["/"]` | static from `artifacts/bestnursingai/dist/public`, rewrite `/*` → `/index.html` |
| nursing-mobile | `mobile` | `["/mobile/"]` | `pnpm --filter @workspace/nursing-mobile run serve` |
| mockup-sandbox | `design` | `["/__mockup"]` | development `run` only; no `[services.production]` |

The engine's Replit production health check points at `/health`, which returns 503 whenever the
engine cannot answer clinically (`main.py:122`, `:155`). The consequence of pairing a readiness
endpoint with a platform startup gate is stated in `main.py:165-177`, which documents `/livez`
as the liveness alternative. 🟡 — the manifest and the docstring disagree about which endpoint a
platform check should use.

### 19.3 Railway

`docs/deployment/railway.md` (151 lines) describes a three-service topology (`postgres`,
`engine` private, `gateway` public) with per-service variable tables.
**No Railway configuration file is tracked**: `git ls-files | grep -iE "railway|vercel|render|procfile|k8s|kubernetes|terraform|pulumi"`
returns only `docs/deployment/railway.md` and unrelated `.agents/skills/vercel-*` documents.
Railway configuration therefore lives outside this repository. 📋 as far as this repository is
concerned.

**Live deployment state** — whether any of these substrates is currently running this code:
`NOT DETERMINED — no deployment was queried; the repository contains no deployment record,
and this report's scope is the repository.`

---

## 20. Observability

| Capability | Implementation | Runtime caller |
|---|---|---|
| Structured logging (gateway) | `lib/logger.ts` — pino, level from `LOG_LEVEL`, `isProduction` from `NODE_ENV` (`:3,:6`) | `app.ts:26` `pinoHttp({logger, serializers:{req,res}})`; per-request `req.log` used at `gateway.ts:56,87` and `app.ts:79` |
| Structured logging (engine) | `middleware/logging.py:43 configure_logging(as_json)`, JSON at `:40` | `main.py:31`; `RequestLoggingMiddleware` (`:56`) added at `main.py:110` |
| Metrics | `services/metrics.py` — counters, `metrics.render(...)` | `main.py:183` `GET /metrics` (Prometheus text); incremented in `routers/query.py` (`:122`, `:137`, `:501`) and `routers/documents.py:9` |
| Liveness | `main.py:163` `GET /livez` | platform healthchecks |
| Readiness | `main.py:122` `GET /health` — 503 with a `problems` array when `DATABASE_URL` is unset, the retriever is unavailable, `chunk_count == 0`, or the formulary is unavailable | `docker`/Replit health config; web `BackendContext` |
| Gateway health | `routes/health.ts:6` `GET /api/healthz` | `artifact.toml` `[services.production.health.startup]` |
| Audit trail | see §15 | every query and governance event |

**No error-tracking or tracing integration exists.** Search:
`grep -rn "sentry\|opentelemetry\|Sentry\|otel"` over `artifacts/`, `lib/`, all `package.json`,
`requirements.txt` → **no hit**. ❌ NOT FOUND.

Metric counter names observed in source: `bnp_queries_total`, `bnp_queries_answered_total`,
`bnp_queries_refused_total`, `bnp_formulary_unavailable_total`,
`bnp_retrieval_unavailable_total`, `bnp_audit_write_failures_total`
(`routers/query.py:122,137,171,224,501`).

---

## 21. Documentation

| Path | Lines | Purpose |
|---|---:|---|
| `README.md` | 318 | project overview, architecture diagram, running instructions, a "Not for clinical use" notice, a "Before a pilot" checklist, known-limitations list |
| `replit.md` | 270 | workspace notes: auth, SafetyEngine, mobile connection, stack, structure, packages |
| `docs/deployment/railway.md` | 151 | Railway topology, variable tables, healthcheck rationale, seeding |
| `docs/security/jwt-rotation.md` | 110 | JWT secret rotation procedure |
| `.env.example` | 94 | environment contract with inline rationale |

Substantive technical claims extracted (assessed in §22):

**README.md** — engine never exposed directly (`:61`); 638 drugs / 637 approved from
`data/formulary/` (`:15`); 627 all-approved from the two P&T workbooks (`:21`); no approved row
carries a computed dose (`:26-31`); `pytest` and `pnpm run test` are the test commands
(`:136-137`); single-worker engine, process-global retriever (`:301`); versioned migrations
applied by one-shot jobs (`:303`); full FAISS rebuild on upload (`:307`); per-process
in-memory rate limiting and metrics (`:309`); application-computed hash chain (`:311`);
document "verification" records a checksum and validates no signature (`:314`); retrieved text
is fenced (`:316`); `license` is `UNLICENSED`, previously MIT (`:318`); JWT secret in history
needs rotation (`:285`).

**replit.md** — Replit OIDC flow and key files (`:7-24`); DB tables `sessions`, `users` (`:20`);
API server on 8080 with a Vite proxy (`:22`); user shape `{id, name, profileImage, roles}`
(`:24`); `DRUG_DB` high-risk list and field names (`:38-39`); "Replit OIDC only. The demo
credential login was removed" (`:190`); engine stack line (`:221`); "JWT HS256 (JWT_SECRET env
var), SHA-256 password hashing (passlib sha256_crypt)" (`:251`).

**docs/deployment/railway.md** — three-service topology (`:12-14`); per-service variable
tables (`:37-57`); healthchecks are liveness not readiness (`:68`); degraded by design (`:83`);
seeding the formulary (`:96`).

---

## 22. Documentation vs Code

| # | Documented claim | Code evidence | Status |
|---:|---|---|---|
| 1 | README `:61` "The engine is never exposed directly. All traffic reaches it through the gateway" | `docker-compose.yml` engine has no `ports:` (comment `:63`); `clinical-ai-engine/.replit-artifact/artifact.toml` `paths = []`; `routes/gateway.ts:47` 401s an unauthenticated caller | **VERIFIED** for the two deployment descriptors in this repository |
| 2 | README `:136` "`cd artifacts/clinical-ai-engine && pytest`" | executed: 174 passed, 40 skipped (§27) | **VERIFIED** |
| 3 | README `:137` "`pnpm run test`" | executed: 54 tests passed (§27) | **VERIFIED** |
| 4 | README `:303` "Both schemas have versioned migrations, applied by one-shot jobs before their services start" | `alembic/versions/0001–0003`; `lib/db/drizzle/0000,0001`; `docker-compose.yml:26` `engine-migrate`, `:65` `migrate`, both gated by `service_completed_successfully` | **VERIFIED** |
| 5 | README `:309` "Rate limiting and metrics are per-process and in-memory" | `lib/loginRateLimit.ts:21` `new Map()`; `middleware/rate_limit.py:29` `defaultdict(deque)`; `services/metrics.py` in-process | **VERIFIED** |
| 6 | README `:311` "The audit hash chain is computed by the application" | `routers/query.py:74-99`, `:585`; `services/audit_events.py:52-87` | **VERIFIED** |
| 7 | README `:314` document "verification" records a checksum and validates no signature | `contexts/DocumentVerificationContext.tsx:4` imports `crypto-js/sha256`; `:60-66` `calculateChecksum`; no signature verification call found | **VERIFIED** |
| 8 | README `:318` `license` is `UNLICENSED` | root `package.json` `"license": "UNLICENSED"` | **VERIFIED** |
| 9 | README `:285` a signing key is in this repository's history | `git show f899a8a:.replit` line 56 assigns `JWT_SECRET` a literal value | **VERIFIED** |
| 10 | README `:15` "638 drugs, of which 637 carry a pharmacist's recorded approval" | `data/formulary/pharmacist_review_log.csv` has 638 lines; the resulting database state cannot be inspected without a database | **NOT DETERMINED — searched: data/formulary/*.csv line counts only; no database was available to query bnp_drug_formulary** |
| 11 | README `:21` "627 drugs, all approved" for a workbook-only deployment | same limitation | **NOT DETERMINED — searched: as above** |
| 12 | replit.md `:190` "Replit OIDC only. The demo credential login was removed" | `routes/auth.ts:223` `router.post("/auth/login", loginRateLimit, …)`; `lib/password.ts`; `usersTable.passwordHash` | **CONTRADICTED** — a password sign-in path exists |
| 13 | replit.md `:251` "SHA-256 password hashing (passlib sha256_crypt)" | `routers/auth.py:35` `CryptContext(schemes=["bcrypt","sha256_crypt"], deprecated=["sha256_crypt"])` — bcrypt is primary, sha256_crypt is deprecated | **CONTRADICTED** |
| 14 | replit.md `:38-39` "DRUG_DB high-risk drugs …", "DRUG_DB fields: `adult_max_dose_mg` …" | `grep -rn "DRUG_DB"` over `artifacts/`, `lib/` → **no hit**. Drug data lives in `bnp_drug_formulary` (`0003`) and is read through `services/formulary.py` | **CONTRADICTED** — the symbol does not exist |
| 15 | replit.md `:24` user shape `{ id, name, profileImage, roles }` | `lib/api-spec/openapi.yaml:168-185` — `AuthUser` requires `[id, name, roles]` with optional `email` and **`profileImageUrl`** | **CONTRADICTED** on the field name |
| 16 | replit.md `:20` "DB tables (PostgreSQL): `sessions`, `users`" | `lib/db/src/schema/auth.ts:12,23` | **VERIFIED** (for the TypeScript side only; five `bnp_*` tables also exist) |
| 17 | replit.md `:22` "Vite proxy forwards `/api` → `http://localhost:8080`" | `artifacts/bestnursingai/vite.config.ts` was not read | **NOT DETERMINED — searched: replit.md; vite.config.ts not opened** |
| 18 | README `:26-31` "No approved row carries a computed dose" | requires database state | **NOT DETERMINED — searched: as #10** |
| 19 | `docs/deployment/railway.md:39` `DATABASE_URL` = `${{postgres.DATABASE_URL}}` | no Railway config file is tracked; the claim is unverifiable from this repository | **NOT DETERMINED — searched: git ls-files for railway* → only the doc itself** |
| 20 | `main.py:5-16` module docstring endpoint list | the docstring lists `/auth/*`, `/documents/*`, `/query/`, `/health`; the app also serves `/livez` (`:163`), `/metrics` (`:183`), `/` (`:201`) and seven `/formulary/*` routes | **CONTRADICTED** — the docstring is a subset of the real surface |
| 21 | `pnpm-workspace.yaml:11` workspace glob `lib/integrations/*` | `git ls-files lib/integrations` → 0 files; `ls lib/` → five directories, none named `integrations` | **CONTRADICTED** — the glob matches nothing |
| 22 | `.env.example` documents `ISSUER_URL`, `REPL_ID`, `WEB_ROOT`, `AUTO_MIGRATE` etc. | all read in code (§16) | **VERIFIED** |
| 23 | `.env.example` omits `AI_INTEGRATIONS_OPENAI_BASE_URL` / `_API_KEY` | read at `services/response_generator.py:180-181` | **CONTRADICTED** as a documentation gap — code reads two variables the contract does not list |

---

## 23. Dead-Code Candidates

Each entry states the symbol, its definition, the search performed, and the result.

| # | File → symbol | Definition | Reference search | Result |
|---:|---|---|---|---|
| 1 | `main.py` (repository root) → `main()` | `:1-5`, prints `"Hello from repl-nix-workspace!"` | `grep -rn "repl-nix-workspace"` over the tree; inspection of `pyproject.toml`, `.replit`, `docker-compose.yml`, all `artifact.toml` | no importer, no runner | 💀 |
| 2 | `artifacts/bestnursingai/src/pages/not-found.tsx` | whole file | `grep -rl "not-found\|NotFound" src --include=*.tsx --include=*.ts` excluding `src/pages/` | 0 files | 💀 |
| 3 | `wouter` (dependency) | `artifacts/bestnursingai/package.json:76` | `grep -rn "wouter" src` | 0 hits | 💀 unused dependency |
| 4 | `lib/api-client-react/src/generated/api.ts` → the 2 exported `use*` hooks | `grep -c "export const use"` → 2 | `grep -rn "api-client-react" artifacts/bestnursingai/src artifacts/nursing-mobile --include=*.ts --include=*.tsx` | 0 hits in application source; the only source-level import is a **type-only** `import type { AuthUser }` at `lib/replit-auth-web/src/use-auth.ts:2` | 💀 for the hooks; the package's type export is live |
| 5 | `@workspace/scripts` → `src/hello.ts` | `console.log("Hello from @workspace/scripts")` | invoked only by the package's own `hello` script; typechecked by the root `typecheck` | no runtime caller | 💀 |
| 6 | `artifacts/mockup-sandbox` (whole package) | 69 tracked files | excluded at `pnpm-workspace.yaml:8`; `src/App.tsx:3` resolves `./components/mockups/*` which does not exist | not built, not served in production by any manifest | 💀 |
| 7 | `services/formulary.py:131` → `Formulary.coverage_status()` | method | `grep -rn "coverage_status" --include=*.py` | callers are 13 assertions across `tests/`; the production path reads `entry.coverage` directly (`routers/query.py:343`, `services/drug_calculator.py:298`) | 💀 for the wrapper; the underlying capability is ✅ |
| 8 | `routers/formulary.py:278` `POST /{drug_id}/retire`; `:84` `GET /summary`; `routers/documents.py:156` `GET /chunks/{chunk_id}`; `main.py:183` `/metrics`; `routers/auth.py:130,155,175` | route handlers | path-literal search over both `clinicalApi.ts` files | no in-repository client calls them | 🔵 — HTTP-reachable, no caller shipped here |
| 9 | `attached_assets/` (15 entries) | pasted text, images, a `.zip` | `grep -rn "attached_assets"` over `artifacts/`, `lib/`, `scripts/`, root configs | 0 hits outside the directory | 💀 |
| 10 | `artifacts/clinical-ai-engine/config/formulary_mapping.example.txt` | example mapping | `NOT DETERMINED — searched: file listing only; no grep for "formulary_mapping" was run` | — | ❓ |

**Not dead, despite appearances:** `services/pdf_processor.py` (imported at
`routers/documents.py:7`), `services/audit_events.py` (`routers/formulary.py:32`),
`services/context_validator.py` (`routers/query.py:36`), `services/arabic_translator.py`
(`routers/query.py:44`), `services/metrics.py` (`main.py:192`, `routers/query.py:35`,
`routers/documents.py:9`), `services/formulary_import.py` (`routers/formulary.py:34`).

---

## 24. Duplicate / Competing Implementations

| # | Capability | Implementation A | Implementation B | Which is connected | Evidence |
|---:|---|---|---|---|---|
| 1 | Sign-in | OIDC (`routes/auth.ts:100,131`) | password (`routes/auth.ts:223`) | **both**, selected at runtime by `GET /api/auth/methods` (`:218`) which the client reads at `AuthContext.tsx:57` | coexisting by design; `lib/auth.ts:25` uses `REPL_ID!` so OIDC requires that variable |
| 2 | Password hashing | gateway: node `scrypt` (`lib/password.ts:31`) | engine: passlib bcrypt (`routers/auth.py:35`) | **both**, on different user tables (`users` vs `bnp_users`) | two independent user stores |
| 3 | User identity store | `users` (drizzle, uuid PK, `roles text[]`) | `bnp_users` (SERIAL PK, `role VARCHAR`) | **both**; joined by `bnp_users.external_id` = the gateway's `user.id` (`routers/auth.py:88`) | one person has two rows, one per side |
| 4 | Database client | drizzle + `pg.Pool` (`lib/db/src/index.ts:13`) | psycopg2 `ThreadedConnectionPool` (`models/database.py:22`) | **both**, same `DATABASE_URL`, disjoint tables | by language |
| 5 | Migration system | Alembic (3 revisions) | drizzle-kit (2 SQL files) | **both**, disjoint tables | §12 |
| 6 | API client | `lib/api-client-react/src/generated/api.ts` (637 lines, orval-generated) | hand-written `src/services/clinicalApi.ts` in **each** app | the hand-written ones | §23 #4 |
| 7 | shadcn `ui/` component set | `artifacts/bestnursingai/src/components/ui/` (55 files, `sidebar.tsx` 727 lines) | `artifacts/mockup-sandbox/src/components/ui/` (`sidebar.tsx` 714 lines) | bestnursingai | mockup-sandbox is workspace-excluded |
| 8 | `clinicalApi` module | `artifacts/bestnursingai/src/services/clinicalApi.ts` (13 exported functions) | `artifacts/nursing-mobile/services/clinicalApi.ts` | **both**, one per app; overlapping paths (`/query/`, `/health`, `/documents/`) | duplicated, not shared through `lib/` |
| 9 | i18n dictionaries | `artifacts/bestnursingai/src/i18n.ts` (629 lines) | `artifacts/nursing-mobile/i18n.ts` | **both**, one per app | separate parity tests exist for each |
| 10 | Front-end apps | web SPA (deployed by `.replit` and compose) | Expo app (manifest only) | web | §7.2 |
| 11 | Health semantics | `/health` readiness (`main.py:122`) | `/livez` liveness (`main.py:163`) | both exist; `clinical-ai-engine/.replit-artifact/artifact.toml` points its startup check at `/health` while `main.py:165-177` documents `/livez` as the endpoint for that role | 🟡 |
| 12 | Arabic drug naming | `services/arabic_translator.py` `DRUG_MAP` (search aid) | `bnp_drug_formulary.name_ar` + `aliases` (`0003:47-48`) | **both**, different purposes — translation for BM25/FAISS vs formulary lookup (`services/formulary.py:135 find_in_text`) | `routers/query.py:157` and `:352` respectively |
| 13 | `AuthProvider` mounting | `main.tsx:8` | `App.tsx:94` | the inner one serves consumers; both run `useReplitAuth()`, so `GET /api/auth/user` is requested twice on load | `lib/replit-auth-web/src/use-auth.ts:20` |

---

## 25. Git Archaeology

Every claim below carries a SHA.

| Change | Evidence |
|---|---|
| Repository begins as Replit-generated scaffolding | `81cbf91` (2026-03-30, `agent@replit.com`) "Initial commit" |
| The web application arrives | `2ec5697` (2026-04-01, `awn000333`) "Add BestNursingAI application with full features and UI" |
| First publish | `423d04c` (2026-04-01) "Published your App"; a later `a59c601` "Published your App" also touches the FAISS index path |
| **A JWT signing key is committed** | `f899a8a` "Build a production-grade clinical AI engine" — `git show f899a8a:.replit` line 56 assigns `JWT_SECRET` a literal value. The current `.replit` contains no such assignment; its `:60-61` instead say secrets are not stored there |
| Visible demo login credentials removed | `ddd94f7` "Remove visible demo login credentials from the welcome page" |
| Document persistence across restarts | `516a188` "Ensure documents are not lost after system restarts" |
| Arabic retrieval added | `66796fa` "Improve Arabic search accuracy by translating queries for retrieval"; `cb1703c` "Improve Arabic language support and query classification" |
| Docker + docs introduced, and the FAISS index removed from tracking | `96fa826` "Add Docker deployment, environment docs, and a README" — `git log --diff-filter=D -1 -- artifacts/clinical-ai-engine/data/faiss_index/lc_index/index.faiss` returns this SHA |
| `.gitignore` gains the engine-data exclusion | `7e74ac0` "Extract the hospital's own formulary from its pharmacy PDFs" — `git log -S'artifacts/clinical-ai-engine/data/*' -- .gitignore` |
| Remediation branch merged | `791ba89` (2026-08-23) `(#1)` |
| Volume ownership fix merged | `e03c4d1` (2026-08-27) `(#2)` |
| Design system applied | `d73a87b` (2026-08-27) `(#3)` |

**Historical capability that no longer exists in the tree:** a `DRUG_DB` Python literal.
`replit.md:38-39` describes its fields; `grep -rn "DRUG_DB"` over the current tree returns
nothing, and `bnp_drug_formulary` (`0003_drug_formulary.py`) holds that data instead. The
commit that removed it: `NOT DETERMINED — searched: git log -S"DRUG_DB" was not run.`

**Removed services, replaced frameworks, abandoned databases:** `NOT DETERMINED — searched:
git log --oneline --all subject lines and the specific -S searches listed above; no exhaustive
pickaxe search across frameworks, vector databases, biometrics or offline mode was performed.`

---

## 26. Sensitive Data Findings

Values are redacted throughout. Locations only.

| # | Location | Type | Classification | Note |
|---:|---|---|---|---|
| 1 | `.replit:56` **at commit `f899a8a`** (not in the current tree) | JWT signing secret, literal value | **source configuration, in published history** | The repository is public (GitHub API `"private": false`), so the historical blob is publicly readable. `README.md:285` and `docs/security/jwt-rotation.md` both flag it. Value not reproduced. |
| 2 | `attached_assets/y5MJLc7geDQoue9Z4YzQL_1775071691937.txt:6` | a hardcoded database password string inside a pasted SQLite/SQLCipher code sample | **pasted documentation/sample**, tracked in a public repository | The same line contains a comment stating the value would come from a KeyStore in production. Value not reproduced. |
| 3 | `.github/workflows/ci.yml:71` | `JWT_SECRET: ci-only-not-a-real-secret` | **CI fixture**, self-describing placeholder | Not a live credential. |
| 4 | `docker-compose.yml:14-16` | `POSTGRES_USER/PASSWORD/DB` defaults `bnp` | **local development defaults** in `${VAR:-default}` form | Overridable; used for the compose-local database only. |
| 5 | `.env.example` | variable **names** only, all values empty | **documentation** | No value present. |
| 6 | `git log` author addresses, and `userEmail` context | personal email address of the repository owner | **git metadata** | Inherent to commit authorship. |
| 7 | `data/formulary/*.csv`, `data/formulary/source/*.xlsx`, `pharmacist_review_log.csv` | hospital medication data, source-document page references, reviewer name and licence fields | **clinical reference data and governance records**, tracked in a public repository | Whether any row contains a real licence number: `NOT DETERMINED — searched: file listing and line counts only; the CSV contents were not read, deliberately, to avoid handling identity data.` |
| 8 | `docs/deployment/railway.md` | hostnames and variable names | **documentation** | No secret values. |

**Scans performed, with results:**

* `git grep -nIE "(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)"` over all tracked files → **no match**. No OpenAI key, AWS key, private-key block, or literal JWT is present in the current tree.
* `git grep -nIE "(password|passwd|secret|api_key|apikey|token)\s*[:=]\s*[\"'][^\"']{8,}[\"']"` excluding lockfiles and `.agents/` → three hits: `artifacts/bestnursingai/src/i18n.ts:15` and `:318`, and finding #2 above. The two i18n hits were opened and are **UI labels** — `password: 'Password'` and `password: 'كلمة المرور'` — not credentials.
* Patient data: `NOT DETERMINED — searched: the pattern scans above and the file inventory; no targeted scan for patient identifiers, MRNs, dates of birth or phone numbers was run across the 638-row review log and the two workbooks.`

---

## 27. Executed Validation Commands

All commands were taken from `package.json` scripts, `pytest.ini`, or `docker-compose.yml`.
No source file was modified. Exact commands and exact results:

### 27.1 `pnpm run typecheck` — **PASS**

```
> workspace@0.0.0 typecheck
> pnpm run typecheck:libs && pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck
> tsc --build
Scope: 5 of 11 workspace projects
artifacts/api-server typecheck$ tsc -p tsconfig.json --noEmit          Done
artifacts/bestnursingai typecheck$ tsc -p tsconfig.json --noEmit       Done
artifacts/nursing-mobile typecheck$ tsc -p tsconfig.json --noEmit      Done
scripts typecheck$ tsc -p tsconfig.json --noEmit                       Done
EXIT=0
```

### 27.2 `pnpm run test` — **PASS, 54 tests**

```
Scope: 10 of 11 workspace projects
artifacts/api-server     vitest v4.1.10   Test Files 5 passed (5)   Tests 44 passed (44)
artifacts/bestnursingai  vitest v4.1.10   Test Files 2 passed (2)   Tests  6 passed (6)
artifacts/nursing-mobile vitest v4.1.10   Test Files 1 passed (1)   Tests  4 passed (4)
EXIT=0
```

### 27.3 `pnpm run build` — **PASS**

```
artifacts/nursing-mobile build: Build complete! Deploy to: https://localhost:8080
artifacts/bestnursingai build: vite v7.3.1 building client environment for production...
artifacts/bestnursingai build: ✓ 1809 modules transformed.
artifacts/bestnursingai build: dist/public/index.html                   0.80 kB │ gzip:   0.43 kB
artifacts/bestnursingai build: dist/public/assets/index-CAOBSt9Y.css  127.52 kB │ gzip:  20.54 kB
artifacts/bestnursingai build: dist/public/assets/index-PnnjvHj-.js   492.43 kB │ gzip: 149.72 kB
artifacts/bestnursingai build: ✓ built in 3.12s
EXIT=0
```
Two non-fatal rollup notices were emitted:
`src/components/ui/sonner.tsx (2:0): Error when using sourcemap for reporting an error: Can't
resolve original location of error.` and the same for `src/components/ui/label.tsx`. The build
completed with exit code 0.

### 27.4 `pytest` (engine) — **PASS with skips**

Command: `cd artifacts/clinical-ai-engine && JWT_SECRET=<placeholder> python3 -m pytest --no-header -p no:warnings`

```
174 passed, 40 skipped in 0.49s
```

`JWT_SECRET` had to be supplied because `routers/auth.py:24` raises at import without it. The
40 skips are the database-backed cases: `DATABASE_URL` and `TEST_DATABASE_URL` were both unset
(verified with `echo`). The 179 `def test_` definitions collect as 214 cases through
parametrisation.

### 27.5 `docker compose config` — **FAIL, by design**

```
error while interpolating services.clinical-ai-engine.environment.JWT_SECRET:
required variable JWT_SECRET is missing a value:
JWT_SECRET is required - generate with openssl rand -hex 32
EXIT=1
```
This is the `${JWT_SECRET:?…}` guard at `docker-compose.yml:36` refusing to resolve without a
secret. The file's syntax was not validated beyond this point.

### 27.6 Not executed

* `docker compose up` — `NOT DETERMINED — command not executed because it requires pulling `postgres:16-alpine` and starting long-running services with real secrets; neither is a read-only action.`
* `pnpm --filter @workspace/api-spec run codegen` (the CI drift gate) — `NOT DETERMINED — command not executed because it writes into lib/api-zod and lib/api-client-react, which would modify the repository.`
* `drizzle-kit migrate` / `alembic upgrade head` — `NOT DETERMINED — command not executed because no database is reachable in this session and both mutate a schema.`
* Lint — `NOT DETERMINED — searched: root package.json, all twelve package.json script blocks; no "lint" script and no eslint/biome/ruff configuration file is tracked.`

---

## 28. Capability Status Matrix

| Capability | Exists | Implemented | Referenced | Called | Runtime Reachable | Tested | Documented | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| Express gateway HTTP server | yes | yes | yes | yes | yes | partial | yes | `src/index.ts`, `app.ts:16` | ✅ |
| FastAPI clinical engine | yes | yes | yes | yes | yes | yes | yes | `main.py:70`, `test_query_pipeline.py` | ✅ |
| React SPA | yes | yes | yes | yes | yes | minimal | yes | `main.tsx`, `App.tsx`; build §27.3 | ✅ |
| Expo mobile app | yes | yes | yes | yes | not proven | minimal | yes | `app/_layout.tsx:36`; absent from `.replit` and compose | 🔵 |
| SPA served same-origin | yes | yes | yes | yes | yes | yes | yes | `lib/webApp.ts`, `app.ts:69`, `webApp.test.ts` | ✅ |
| OIDC sign-in | yes | yes | yes | yes | requires `REPL_ID` | no | yes | `routes/auth.ts:100,131`; `lib/auth.ts:25` | 🔵 |
| Password sign-in | yes | yes | yes | yes | yes | yes | contradicted by `replit.md:190` | `routes/auth.ts:223`, `password.test.ts` | ✅ |
| Password change | yes | yes | yes | yes | yes | partial | no | `routes/auth.ts:273` | 🔵 |
| Admin bootstrap | yes | yes | yes | yes | yes | no | yes | `lib/bootstrapAdmin.ts`, `index.ts:26` | ✅ |
| Mobile token exchange | yes | yes | yes | yes | not proven | no | yes | `routes/auth.ts:337`; `services/session.ts` | 🔵 |
| Server-side sessions | yes | yes | yes | yes | yes | no | yes | `schema/auth.ts:12`, `authMiddleware.ts:70` | ✅ |
| Role derivation from `ADMIN_EMAILS` | yes | yes | yes | yes | yes | yes | yes | `routes/auth.ts` `grantRolesFor`, `authUser.test.ts` | ✅ |
| Gateway reverse proxy `/bnp-api` | yes | yes | yes | yes | yes | no | yes | `routes/gateway.ts:46-92` | ✅ |
| Per-request engine token (300 s) | yes | yes | yes | yes | yes | yes | yes | `lib/engineToken.ts:16,35`, `engineToken.test.ts` | ✅ |
| Engine identity materialisation | yes | yes | yes | yes | yes | no | no | `routers/auth.py:70-108` | ✅ |
| `require_admin` gating | yes | yes | yes | yes | yes | partial | yes | `routers/auth.py:119`; used on 11 routes | ✅ |
| Hybrid retrieval (FAISS + BM25) | yes | yes | yes | yes | needs `OPENAI_API_KEY` | partial | yes | `services/embeddings.py:320-322` | 🔵 |
| OpenAI embeddings | yes | yes | yes | yes | needs key | no | yes | `embeddings.py:57,61` | 🔵 |
| GPT-4o generation | yes | yes | yes | yes | needs key | no | yes | `response_generator.py:197` | 🔵 |
| Arabic query translation | yes | yes | yes | yes | yes | no | yes | `arabic_translator.py`, `query.py:157` | ✅ |
| Query classification | yes | yes | yes | yes | yes | yes | yes | `clinical_router.py:58`, `test_clinical_router.py` | ✅ |
| Context validation | yes | yes | yes | yes | yes | yes | yes | `context_validator.py`, `query.py:231` | ✅ |
| Safety layer (pre/post) | yes | yes | yes | yes | yes | yes | yes | `safety_layer.py:34,63,83`; `test_safety_layer.py` | ✅ |
| Overdose hard block | yes | yes | yes | yes | yes | yes | yes | `query.py:399-402,:522`; `test_drug_calculator.py` | ✅ |
| Refusal on unavailable retrieval | yes | yes | yes | yes | yes | yes | yes | `query.py:165-177`; `test_query_pipeline.py` | ✅ |
| Refusal on audit-write failure | yes | yes | yes | yes | yes | yes | yes | `query.py:219-229` | ✅ |
| PDF ingest → chunk → index | yes | yes | yes | yes | needs key + admin | partial | yes | `documents.py:18-60`, `pdf_processor.py` | 🔵 |
| FAISS index persistence | yes | yes | yes | yes | yes | no | yes | `embeddings.py:230-233` | ✅ |
| Index rebuild from DB | yes | yes | yes | yes | yes | no | yes | `embeddings.py:154-218`, `main.py:46` | ✅ |
| Governed formulary table | yes | yes | yes | yes | yes | yes | yes | `0003_drug_formulary.py`, `services/formulary.py` | ✅ |
| Formulary import pipeline | yes | yes | yes | yes | admin only | yes | yes | `formulary_import.py`, `test_formulary_import.py` | ✅ |
| Formulary review workflow | yes | yes | yes | yes | admin only | yes | yes | `routers/formulary.py:209` | ✅ |
| Formulary retire endpoint | yes | yes | yes | not by any shipped client | HTTP-reachable | partial | yes | `routers/formulary.py:278` | 🔵 |
| `Formulary.coverage_status()` wrapper | yes | yes | yes | tests only | — | yes | no | `services/formulary.py:131` | 💀 |
| Review packet `.xlsx` export | yes | yes | yes | yes | admin only | no | yes | `routers/formulary.py:363`, `clinicalApi.ts:424` | ✅ |
| Audit log write | yes | yes | yes | yes | yes | yes | yes | `query.py:558-586` | ✅ |
| Audit hash chain | yes | yes | yes | yes | yes | yes | yes | `query.py:74-99`, `test_audit_integrity.py` | ✅ |
| Audit chain verification API | yes | yes | yes | yes | admin only | yes | yes | `routers/auth.py:198`; `AuditLogContext.tsx:9` | ✅ |
| Soft delete of documents/chunks | yes | yes | yes | yes | yes | partial | yes | `0002:32-33`, `documents.py:120` | ✅ |
| Chunk-by-id retrieval | yes | yes | yes | not by any shipped client | HTTP-reachable | no | yes | `documents.py:156` | 🔵 |
| Login rate limiting | yes | yes | yes | yes | yes | yes | yes | `loginRateLimit.ts`, `loginRateLimit.test.ts` | ✅ |
| Engine rate limiting | yes | yes | yes | yes | yes | no | yes | `rate_limit.py:19`, `main.py:109` | ✅ |
| CORS control | yes | yes | yes | yes | yes | no | yes | `app.ts:56`; `main.py:94-107` | ✅ |
| Prompt-injection fencing | yes | yes | yes | yes | yes | no | yes | `response_generator.py:98,102` | 🔵 |
| Upload size/type/magic checks | yes | yes | yes | yes | yes | no | no | `documents.py:32,44,50` | ✅ |
| Prometheus `/metrics` | yes | yes | yes | no shipped client | unauthenticated | no | yes | `main.py:183` | 🔵 |
| Liveness `/livez` | yes | yes | yes | yes | yes | yes | yes | `main.py:163`, `test_liveness.py` | ✅ |
| Readiness `/health` | yes | yes | yes | yes | yes | yes | yes | `main.py:122` | ✅ |
| Structured logging | yes | yes | yes | yes | yes | no | yes | `lib/logger.ts`; `middleware/logging.py:43` | ✅ |
| Error tracking / tracing | no | — | — | — | — | — | — | grep for sentry/otel → 0 | ❌ |
| Alembic migrations | yes | yes | yes | yes | yes | yes | yes | `alembic/versions/0001-0003`; `test_migrations.py` | ✅ |
| Drizzle migrations | yes | yes | yes | yes | yes | no | yes | `lib/db/drizzle/*.sql`, `src/migrate.ts` | ✅ |
| Connection pooling (both sides) | yes | yes | yes | yes | yes | no | yes | `lib/db/src/index.ts:13`; `models/database.py:22` | ✅ |
| i18n EN/AR (web) | yes | yes | yes | yes | yes | yes | yes | `i18n.ts` (629 lines), `i18n.test.ts` | ✅ |
| i18n EN/AR (mobile) | yes | yes | yes | yes | not proven | yes | yes | `nursing-mobile/i18n.ts`, `__tests__/i18n.test.ts` | 🔵 |
| RTL direction handling | yes | yes | yes | yes | yes | yes | yes | `LanguageContext.tsx`; `rtl.test.ts` | ✅ |
| Theme switching | yes | yes | yes | yes | yes | no | no | `ThemeContext.tsx`, `Sidebar.tsx:42` | ✅ |
| Settings screen persistence | yes | partial | yes | yes | renders only | no | no | `SettingsPage.tsx:55,62` — local `useState`, no write path | 🟡 |
| Official-sources management | yes | partial | yes | yes | in-memory only | no | no | `DocumentVerificationContext.tsx:47,57` — `DEMO_SOURCES = []`, no persistence | 🟡 |
| Document checksum "verification" | yes | yes | yes | yes | yes | no | yes, with the gap stated (README `:314`) | `DocumentVerificationContext.tsx:4,60-66`; no signature check found | 🟡 |
| Generated react-query API client | yes | yes | declared as a dependency | no | — | no | no | `lib/api-client-react`; 0 imports in app source | 💀 |
| `wouter` routing | dependency only | no | no | no | — | no | no | `package.json:76`; 0 imports | 💀 |
| `src/pages/not-found.tsx` | yes | yes | no | no | — | no | no | 0 references outside `pages/` | 💀 |
| `mockup-sandbox` | yes | partial | no | no | — | no | yes (`pnpm-workspace.yaml:4-9`) | workspace-excluded; missing `components/mockups/` | 💀 |
| Root `main.py` | yes | yes | no | no | — | no | no | 0 references | 💀 |
| `@workspace/scripts` | yes | yes | typecheck only | no | — | no | yes (`replit.md:112`) | `src/hello.ts` | 💀 |
| `lib/integrations/*` workspace glob | no | — | — | — | — | — | yes (`pnpm-workspace.yaml:11`) | `git ls-files lib/integrations` → 0 | ❌ |
| CI: typecheck/test/build/codegen-drift | yes | yes | yes | yes | on push + PR | — | no | `ci.yml:12-40` | ✅ |
| CI: pytest against real Postgres | yes | yes | yes | yes | on push + PR | — | no | `ci.yml:42-84` | ✅ |
| CI: gitleaks secret scan | yes | yes | yes | yes | on push + PR | — | yes (`ci.yml:93` comment) | `ci.yml:86-97` | ✅ |
| CD (any automated deploy) | no | — | — | — | — | — | — | no deploy step in the only workflow | ❌ |
| Docker Compose stack | yes | yes | yes | — | not executed here | no | yes | `docker-compose.yml`; §27.5 | 🔵 |
| Replit deployment manifests | yes | yes | yes | — | not executed here | no | yes | `.replit`, 5 `artifact.toml` | 🔵 |
| Railway deployment | documented | — | — | — | — | — | yes | `docs/deployment/railway.md`; no config file tracked | 📋 |
| Kubernetes / Terraform / Vercel | no | — | — | — | — | — | — | `git ls-files` → none | ❌ |
| Security headers (CSP/HSTS/XFO) | no | — | — | — | — | — | — | grep → none | ❌ |
| Encryption at rest / SQLCipher / biometrics | no in this tree | — | — | — | — | — | `replit.md:215` names packages | grep for AES/SQLCipher/LocalAuthentication → 0 in inspected source | ❌ / ❓ |
| Message queue / cache / object storage | no | — | — | — | — | — | — | grep → none | ❌ |
| Lint tooling | no | — | — | — | — | — | — | no lint script, no eslint/biome/ruff config | ❌ |

---

## 29. Unknowns / NOT DETERMINED

Each with the exact search that failed to settle it.

1. **Live database contents** (drug counts, approval counts, audit rows). Searched:
   `data/formulary/*.csv` line counts; `git ls-files`. No `DATABASE_URL` or
   `TEST_DATABASE_URL` was set in this session (verified with `echo`), and 40 pytest cases
   skipped for that reason.
2. **Whether any deployment is currently running this code.** Searched: `git ls-files` for
   deployment config (only `docs/deployment/railway.md`); no runtime was queried.
3. **`POST /auth/register` authorization.** Searched: `grep -n "Depends(" routers/auth.py`
   returned lines `:159`, `:202` and the helper definitions at `:113`, `:119`; the register
   handler's own signature at `:130-155` was not individually read.
4. **Session cookie attributes (`httpOnly`, `secure`, `sameSite`).** Searched:
   `grep -rniE "csrf|xsrf|samesite"` over `artifacts/api-server/src`; `lib/auth.ts` cookie
   options were not read.
5. **Vite dev-proxy configuration**, and the `BASE_PATH` / `API_SERVER_URL` consumers.
   Searched: `grep` for `process.env` over `artifacts/api-server/src`, `lib/db/src`,
   `lib/replit-auth-web/src`; `artifacts/bestnursingai/vite.config.ts` was not opened.
6. **Reachability of each of the 55 `components/ui/*.tsx` primitives.** Searched: directory
   listing and two files (`sidebar.tsx`, `sonner.tsx`); no per-file import grep was run.
7. **AsyncStorage and biometric usage in the mobile app.** Searched: `replit.md:215` only; no
   grep for `AsyncStorage` or `LocalAuthentication` over `artifacts/nursing-mobile` source.
8. **Whether the formulary CSVs contain real personal identifiers** (reviewer names, licence
   numbers). Searched: file listing and line counts; contents deliberately not read.
9. **Where the pre-2026-08-14 commits were originally authored.** Searched:
   `git log --format='%h %ae %s'`, `git remote -v` (single remote), `.replit`, `replit.md`.
10. **The commit that removed `DRUG_DB`.** Searched: `grep -rn "DRUG_DB"` over the current tree
    (0 hits) and `replit.md:38-39`; `git log -S"DRUG_DB"` was not run.
11. **Exhaustive history of removed frameworks, vector databases, biometrics or offline mode.**
    Searched: `git log --oneline --all` subject lines, and the three targeted `-S` searches in
    §25; no full pickaxe sweep was performed.
12. **`config/formulary_mapping.example.txt` consumers.** Searched: directory listing only.
13. **Whether `docker compose up` produces a working stack.** Searched: `docker compose config`
    was executed and failed on the deliberate `${JWT_SECRET:?…}` guard (§27.5); the stack was
    not started.
14. **Effectiveness of the prompt-injection fence.** Searched:
    `services/response_generator.py:98,102`; effectiveness is a runtime property that source
    inspection cannot settle, and no test targets it.
15. **`/metrics` public exposure in any real deployment.** Searched: `docker-compose.yml`
    (engine publishes no ports), `clinical-ai-engine/.replit-artifact/artifact.toml`
    (`paths = []`); no network policy is verifiable from this repository.

---

## 30. Final Factual System Map

### WHAT DEFINITELY EXISTS

* A pnpm 10.33.0 monorepo of 716 tracked files, 89 commits, 0 tags, on a **public** GitHub repository, whose first-party source is ~19,900 lines of `.tsx`, ~10,100 lines of `.py` and ~6,000 lines of `.ts`.
* An **Express gateway** (`artifacts/api-server`) with 11 `/api` routes, a `/bnp-api` catch-all reverse proxy, an SPA mount, JSON 404 and 500 handlers, and a fatal-on-failure admin bootstrap before `listen`.
* A **FastAPI clinical engine** (`artifacts/clinical-ai-engine`) with 4 system routes and 17 router routes across auth, documents, query and formulary.
* A **React 19 + Vite 7 SPA** (`artifacts/bestnursingai`) with 13 first-party screens, 55 UI primitives, 6 contexts, and a 629-line EN/AR i18n dictionary — no router library; navigation is a `useState` switch.
* An **Expo Router mobile app** (`artifacts/nursing-mobile`) with 4 registered screens that builds successfully.
* **Two migration systems**: Alembic (3 revisions creating `bnp_users`, `bnp_documents`, `bnp_chunks`, `bnp_audit_log`, `bnp_drug_formulary` with six CHECK constraints) and drizzle-kit (2 SQL files creating `sessions`, `users`).
* A **hybrid RAG pipeline**: classification → Arabic translation → 60/40 FAISS+BM25 retrieval → context validation → safety checks → formulary lookup → GPT-4o generation → section parsing → post-answer safety → hash-chained audit write.
* A **tamper-evident audit chain** (`prev_hash`/`chain_hash`, sha256, `FOR UPDATE` row lock) with a verification endpoint.
* A **governed formulary**: schema, import pipeline with validation, per-drug review workflow, retirement, and an `.xlsx` review-packet export — all admin-gated.
* **Six explicit refusal paths** in the query handler, including one that withholds a clinical answer when the audit write fails.
* **Rate limiting** on both sides, in-process.
* **CI**: three gating jobs — typecheck + test + build + codegen-drift; pytest against a real Postgres service container; gitleaks.
* **Deployment descriptors**: `docker-compose.yml` (5 services, 2 volumes), 3 Dockerfiles, `nginx.conf`, `.replit`, 5 `artifact.toml`.
* **Documentation**: `README.md` (318), `replit.md` (270), `docs/deployment/railway.md` (151), `docs/security/jwt-rotation.md` (110), `.env.example` (94).

### WHAT IS ACTUALLY CONNECTED

* Browser → gateway `/api` (`app.ts:60`) and `/bnp-api` (`:52`); the gateway also serves the built SPA (`:69`).
* Gateway → PostgreSQL through drizzle (`lib/db/src/index.ts:13`) for `sessions` and `users`.
* Gateway → engine: authenticated-or-401 (`gateway.ts:47`), credentials stripped (`:14-26`), a fresh 300-second HS256 token minted per request (`:65`, `engineToken.ts:16`), 120 s timeout, 502 on failure.
* Engine → PostgreSQL through psycopg2 pooling for the five `bnp_*` tables.
* Engine → OpenAI embeddings (`text-embedding-3-small`) and OpenAI chat (`gpt-4o`, `temperature=0`).
* Engine → a local FAISS index plus an in-process BM25 index, rebuildable from `bnp_chunks`.
* Gateway → an OIDC issuer, when `REPL_ID` is set.
* Roles flow one way and never from client input: `ADMIN_EMAILS` → `users.roles` → session → token `role` claim → `bnp_users.role` → `require_admin`.
* SPA screens genuinely reaching the server: Login, Chat, Secure upload, Documents, Citations, Audit log, Formulary, RAG settings.
* Mobile app → `https://${EXPO_PUBLIC_DOMAIN}` for `/api` and `/bnp-api`, with the session token in `expo-secure-store`.
* CI → the repository on every push to `main`/`master` and every pull request.

### WHAT EXISTS BUT IS NOT CONNECTED

* `lib/api-client-react`'s two generated hooks — declared as a dependency by both apps, imported by neither; each app hand-writes its own `clinicalApi.ts` instead.
* `wouter` — declared at `package.json:76`, imported nowhere.
* `artifacts/bestnursingai/src/pages/not-found.tsx` — zero references.
* Root `main.py` — a five-line placeholder no runner invokes.
* `@workspace/scripts/src/hello.ts` — typechecked, never run.
* `artifacts/mockup-sandbox` — 69 tracked files, excluded from the workspace, importing a `components/mockups/` directory that does not exist.
* `attached_assets/` — 15 entries, referenced by no source file.
* `Formulary.coverage_status()` — called by 13 test assertions; the production path reads `entry.coverage` directly.
* Six engine endpoints with no shipped client: `/formulary/summary`, `/formulary/{id}/retire`, `/documents/chunks/{id}`, `/metrics`, and the engine's own `/auth/register|login|me`.
* `SettingsPage` notification and permission toggles, and the entire official-sources list — they render, accept input, and write to nothing (`SettingsPage.tsx:55,62`; `DocumentVerificationContext.tsx:47` `DEMO_SOURCES = []`).
* `AI_INTEGRATIONS_OPENAI_BASE_URL` / `_API_KEY` — read at `response_generator.py:180-181`, defined in no configuration file here.
* The `lib/integrations/*` workspace glob — matches zero files.
* The Expo mobile app — it builds and has a manifest, and no deployment descriptor in this repository mounts it.

### WHAT IS CLAIMED BUT NOT VERIFIED

* `replit.md:190` "Replit OIDC only. The demo credential login was removed" — **CONTRADICTED**: `POST /api/auth/login` with scrypt password verification exists.
* `replit.md:251` "SHA-256 password hashing (passlib sha256_crypt)" — **CONTRADICTED**: bcrypt is the primary scheme and `sha256_crypt` is marked deprecated (`routers/auth.py:35`); the gateway uses node scrypt.
* `replit.md:38-39` the `DRUG_DB` dictionary and its `adult_max_dose_mg` field set — **CONTRADICTED**: the symbol does not exist anywhere in the tree.
* `replit.md:24` user shape `{id, name, profileImage, roles}` — **CONTRADICTED**: the contract field is `profileImageUrl` (`openapi.yaml:179`).
* `main.py:5-16` module docstring endpoint list — **CONTRADICTED**: it omits `/livez`, `/metrics`, `/` and all seven `/formulary` routes.
* `pnpm-workspace.yaml:11` `lib/integrations/*` — **CONTRADICTED**: no such directory.
* README `:15,:21,:26` drug counts (638/637, 627, "no approved row carries a computed dose") — **NOT DETERMINED**: these are database-state claims and no database was reachable.
* `docs/deployment/railway.md` variable tables — **NOT DETERMINED**: no Railway configuration file is tracked; the document describes a platform this repository does not configure.
* The engine's Replit startup healthcheck points at `/health` (`artifact.toml`), which `main.py:122` implements as readiness and `main.py:165-177` argues against using for that role — the two files disagree, and which one a platform honours was not observed.

### WHAT CANNOT BE DETERMINED

The fifteen items enumerated in §29, in summary: all database-state claims; whether any
deployment is live; the `POST /auth/register` dependency list; session-cookie attributes;
the Vite proxy configuration and two documented-but-untraced variables; per-file reachability
of the 55 UI primitives; mobile AsyncStorage and biometric usage; whether the formulary CSVs
carry real personal identifiers; the pre-2026-08-14 provenance of the earliest commits; the
commit that removed `DRUG_DB`; an exhaustive history of removed capabilities; the consumer of
`config/formulary_mapping.example.txt`; whether `docker compose up` yields a working stack;
the effectiveness of the prompt-injection fence; and whether `/metrics` is publicly reachable
in any real deployment.

---

*End of report. No file in this repository was modified in producing it; `REPO-DISCOVERY.md`
is the only file created.*
