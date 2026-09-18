# BNP DecisionGuard — Web Production Audit and Completion Report

Date: 2026-09-18 · Repository: `totti0770-beep/BNP-care-ai-Manager` · Baseline: `main@78990e7` (after Web Phase 1) · Final: `main@dbfce66`

Every figure in this report is taken from the repository, its CI, its test output, or the Railway deployment record. Nothing is estimated. Where something could not be verified from this session, the report says so.

---

## 1. Executive summary and verdict

Fourteen phases were executed as one continuous programme across eight pull requests (#19–#26), each merged only after all three CI checks passed, each deployed by Railway from `main`, and each verified to have produced a tree byte-identical to its reviewed commit.

The web product went from exposing 13 of 18 engine capabilities to 18 of 19, from 86 to 406 web tests, from no router to deep-linkable screens with permission gating that mirrors the engine, and from three unbacked claims in its chrome to none. Two read-only engine endpoints were added, both under the same RBAC discipline as the rest of the engine; no dose, refusal or safety rule was touched.

**Verdict: PRODUCTION READY WITH DOCUMENTED LIMITATIONS.** The limitations (§13) are all disclosed in the interface itself or in this report; none affects clinical safety controls.

## 2. Scope and method

- Scope: the web application in `artifacts/bestnursingai`; the two engine read endpoints the mandate permitted; no gateway change.
- Method per phase: read the engine contract, implement against existing endpoints only, write source-scanning or unit tests in the repository's convention, prove each new test file fails against the previous tree, run `typecheck` / `vitest` / `build` (and `pytest` when the engine was touched), commit, push, wait for CI, squash-merge pinned to the reviewed head SHA, fast-forward `main`, verify `git diff <merge> <commit>` is empty, confirm the Railway deployment.
- Git policy honoured throughout: no force-push, no history rewrite, no merge of a red head. Because every PR squash-merged the same designated branch, the already-merged history was carried forward each time with an `ours` merge rather than a force-push.
- Stop conditions (dose/refusal rule change, unsupported clinical claim, weakened authorization, patient persistence, contract break, destructive migration, unsafe deploy attribution): none occurred.

## 3. Baseline versus final state

| Measure | Baseline `78990e7` | Final |
|---|---|---|
| Web vitest (bestnursingai) | 86 tests, 8 files | 406 tests, 19 files |
| Workspace vitest | 139 | 459 (406 + 49 api-server + 4 mobile) |
| Engine pytest (no Postgres locally) | 289 passed / 40 skipped | 319 passed / 40 skipped (CI runs the 40 with Postgres) |
| EN translation keys (AR at parity, enforced by test) | 389 | 567 |
| Engine capabilities with a truthful web surface (§6) | 13 of 18 | 18 of 19 |
| Client router | none (component state) | hash router, no dependency |
| Files changed since baseline | — | 38 files, +4045 / −163 (engine: 5 files, +549 / −7) |

## 4. Phase-by-phase delivery

| Phase | PR | Merge SHA | Delivered |
|---|---|---|---|
| 0 Deployment | — | — | Verified per merge: gateway and engine deployments `SUCCESS`; engine boot log clean (schema `0004_document_lifecycle`, 3765 chunks, 627/627 formulary approved, `/livez` 200) |
| 1 Clinical console | #18 | `78990e7` | Preserved |
| 2 Medication Safety | #19 | `f1e61fd` | `GET /formulary/lookup` (nurse projection; clinical fields only for approved rows) + Medication Safety screen; no dose arithmetic in the browser |
| 3 Clinical Evidence Explorer | #20 | `443fba7` | `GET /documents/chunks/{id}` opened to nurses under the retriever's own validity rule (admin keeps unrestricted read); passage dialog from every citation; evidence explorer with status badges and filter |
| 4 Clinical Assistant UX | #21 | `94f242f` | Intent chip (every engine value mapped, unknown never shown raw); missing-values card as alert with "Add patient values"; safety banner as alert; no folded safety; hardcoded English removed |
| 5 Information architecture | #22 | `96ab181` | CLINICAL / KNOWLEDGE / GOVERNANCE / ACCOUNT exactly as specified; upload folded into governance |
| 6 Governance UX | #22 | `96ab181` | Knowledge Governance screen (approve, supersede, retire, lifecycle record); formulary search, high-alert filter and the previously unexposed retire action |
| 7 Audit | #23 | `0f0f012` | Date / user / type filters over the loaded window, captioned as such; CSV export as a full projection of the same complete fetch (BOM, RFC 4180, formula-injection guard) |
| 8 Engine Health | #24 | `12770c4` | Every `/health` field including the engine's `problems[]`; `/metrics` counters read as text, captioned as per-process tallies, described in the engine's own HELP lines; no derived rates |
| 11 Routing | #25 | `2e597e5` | Hash router; `ROUTE_PERMISSION` as the one gating table for App and sidebar; hash survives OIDC sign-in; `#/citations?chunk=<id>` deep link; no patient value can reach a URL |
| 9 Responsive · 10 A11y/RTL · 12 Polish | #26 | `dbfce66` | Settings strip on phones; viewport tracking; skip link; every icon-only control named, every input labelled, one `h1` per screen; logical offsets in rendered primitives; bilingual patient editor; "No Hallucination" footer removed; scroll-offset defect found by the sweep and fixed |
| 13 Verification | — | — | §12 |
| 14 Final audit | — | — | This report |

## 5. Engine changes and why they were permitted

Two additions, both read-only, both under existing dependencies:

1. `GET /formulary/lookup?q=` (`routers/formulary.py`, Phase 2). Any signed-in user. Returns names, status and provenance for every match; route, frequency, thresholds, antidote, regimen sections and safety lists **only when `review_status == "approved"`**, with `clinical_data_withheld` saying when they were withheld. The admin review listing (`GET /formulary`) is unchanged and still refuses a nurse (pinned by test). This is the "minimum backend read-only endpoint" the mandate allowed when none existed.
2. `GET /documents/chunks/{id}` (`routers/documents.py`, Phase 3). Was admin-only. Now any signed-in user, with one rule applied on the server: a nurse may read a passage only if `is_currently_valid` — the same function the retriever uses — says the document is approved, in date and not retired; otherwise 403 with the reason (not 404, because the nurse holds a citation to it). Administrators keep the unrestricted read incident review needs. The response now also carries the document's status, version, dates and approver.

Neither touches `calculate_dose`, the overdose gate, refusal logic, the audit chain, or any write path. 30 engine tests pin these rules (13 + 17); 20 of them fail against the previous tree.

## 6. Feature Exposure Ratio

Denominator: every engine route except `login`, `me`, `livez` and `/`. "Exposed" means a truthful, permission-correct web surface exists for the users the engine serves it to.

| Capability | Auth | Before | After |
|---|---|---|---|
| `POST /auth/register` | admin | no (Settings says user management is external) | no (unchanged, disclosed) |
| `GET /auth/audit-log` | admin | yes | yes + filters, CSV |
| `GET /auth/audit-log/verify` | admin | yes | yes |
| `POST /query/` | any | yes | yes + intent, missing-values action |
| `GET /documents/` | any | yes | yes + status, lifecycle record |
| `POST /documents/upload` | admin | yes | yes (from governance and Documents) |
| `POST /documents/{id}/approve` | admin | yes | yes |
| `POST /documents/{id}/supersede` | admin | **no** | yes |
| `DELETE /documents/{id}` | admin | yes | yes |
| `GET /documents/chunks/{id}` | admin → rule-gated any | **no** | yes |
| `GET /formulary` | admin | yes | yes + search, high-alert filter |
| `GET /formulary/summary` | admin | yes (via /health tally) | yes |
| `POST /formulary/import` | admin | yes | yes |
| `POST /formulary/{id}/review` | admin | yes | yes |
| `POST /formulary/{id}/retire` | admin | **no** | yes |
| `GET /formulary/review-packet.xlsx` | admin | yes | yes |
| `GET /formulary/lookup` | any (new) | — | yes |
| `GET /health` | public | partial (4 fields) | all fields incl. `problems[]` |
| `GET /metrics` | engine-internal | **no** | yes (admin screen, as counters) |
| **Ratio** | | **13 / 18 = 72 %** | **18 / 19 = 95 %** |

The one remaining gap, `/auth/register`, is deliberate: the Settings screen states that user management is external rather than rendering a roster it cannot back.

## 7. Weighted Web Product Score

Weights as set in the plan. Scores are this audit's judgement, each tied to evidence in the repository; they are not measurements.

| Dimension | Weight | Before | After | Evidence for the movement |
|---|---|---|---|---|
| Clinical safety exposure | 30 | 18 | 27 | Medication lookup, passage viewer, intent and missing-values surfaced; refusal/dose logic untouched; remaining: no per-user history endpoint |
| Truthfulness | 20 | 14 | 19 | "No Hallucination" footer, "indexed" upload toast, hardcoded labels removed; every figure traced to an engine response; remaining: offset-paginated export race disclosed, not fixed |
| Governance | 15 | 6 | 14 | Supersede, retire (documents and formulary), lifecycle record, formulary search; remaining: approve error detail not surfaced (boolean client) |
| Accessibility / RTL | 10 | 5 | 9 | Labels, headings, skip link, logical offsets in rendered primitives; remaining: no screen-reader session, other `ui/` primitives unscanned until mounted |
| Responsiveness | 10 | 6 | 9 | 110-combination sweep clean; scroll defect fixed; remaining: no physical device |
| Navigation / IA | 10 | 4 | 9 | Mandated four groups; hash router; deep links; gating from one table; remaining: OIDC hash relies on `sessionStorage` |
| Polish | 5 | 3 | 4 | Consistent states on new screens; language autonyms kept |
| **Total** | **100** | **56** | **91** | |

## 8. Truthfulness and claims audit

Removed since baseline: the assistant footer's "RAG-Only · No Hallucination · Sources Always Cited"; the upload screen's "indexed" success toast (uploads stage pending approval since #17); hardcoded English in the clinical-flags block, confidence label, Engine Health labels and the patient-context editor; a hardcoded Arabic listening placeholder.

Claims that remain and their backing: "Tamper-evident audit trail" — `bnp_audit_log` hash chain and `GET /auth/audit-log/verify`; "627 of 627 drugs pharmacist-approved" — `/health.formulary`; the Engine Health counters — the engine's own `/metrics` text, captioned as per-process tallies. No HIPAA, CBAHI, PDPL, clinical-validation or regulatory claim exists anywhere in `src/`; `navigation-truthfulness.test.ts` asserts the absence of claim pills.

## 9. Safety controls unchanged

- No change to `services/drug_calculator.py`, `services/clinical_intent.py`, `routers/query.py`, the overdose block, refusal behaviour or the audit write path (`git diff 78990e7 origin/main -- artifacts/clinical-ai-engine` touches only `routers/formulary.py`, `routers/documents.py`, `models/schemas.py` and two test files).
- The engine suite grew from 289 to 319 passing tests with no test skipped, disabled or quarantined.
- The web performs no dose arithmetic (pinned by `medication-safety.test.ts`) and computes no document validity (pinned by `clinical-evidence.test.ts`).

## 10. Authorization and privacy

- Client gating is a mirror, never a substitute: `ROUTE_PERMISSION` uses the same permission strings the engine's `require_admin` routes imply, App renders `NotPermitted` before a gated page, the sidebar derives from the same table, and the engine refuses regardless (`routing.test.ts`).
- The two engine changes widen read access only, with server-side rules and tests for the boundary (nurse vs admin, approved vs withheld, current vs withdrawn).
- Patient context remains memory-only (`PatientProvider`), never in storage; no navigation call carries parameters, so no patient value can reach the address bar or history (`routing.test.ts`). The only stored navigation state is a hash (screen id, at most a chunk id) in `sessionStorage` around OIDC sign-in.
- CSV export neutralises spreadsheet formula injection in nurse-typed text.

## 11. Accessibility, RTL and responsive evidence

- Source tests (`a11y-responsive.test.ts`, 90): every icon-only `<button>`/`<Button>` has a name; every text input a label; each screen exactly one `h1`; no hardcoded multi-word copy outside `t()`; `rtl.test.ts` now covers the two shadcn primitives the app renders.
- Viewport sweep (built bundle, pre-installed Chromium via `playwright-core` in the session scratchpad, admin sign-in against stubbed routes): 11 screens × 375/390/430/820/1280 px × EN/AR = 110 combinations, all signed in; 0 horizontal overflow; 0 screens with other than one `h1`; 0 page errors; 0 titles under the sidebar toggle; `dir` = `ltr`/`rtl` as expected. The sweep found one real defect (chat `scrollIntoView` offsetting the page container for every later screen on phones) which was fixed before merge.
- Not done: no assistive-technology session; no physical device.

## 12. Verification record

Per PR: `pnpm run typecheck`, `pnpm run test`, `pnpm run build` clean; `pytest` when the engine was touched; each new test file proven to fail (or error on load) against the previous tree; CI green on Secret scan, TypeScript and Clinical engine before marking ready; squash-merge pinned to the head SHA; `git diff <merge> <commit>` empty after fast-forwarding `main`.

| PR | Web tests after | New tests | Engine tests | Deploy |
|---|---|---|---|---|
| #19 | 96 | 10 web + 13 engine | 302 | engine `c1917891`, gateway `3f7f0521` SUCCESS |
| #20 | 138 | 42 web + 17 engine | 319 | engine `2e26fe92`, gateway `d1e1342e` SUCCESS |
| #21 | 162 | 24 | — | gateway `74fc9826` SUCCESS |
| #22 | 231 | 69 | — | gateway `e7fcd007` SUCCESS |
| #23 | 257 | 26 | — | gateway SUCCESS |
| #24 | 295 | 38 | — | gateway SUCCESS |
| #25 | 316 | 21 | — | gateway `cf9c9b5c` SUCCESS |
| #26 | 406 | 90 | — | gateway `cad792ff` SUCCESS |

Live evidence: the engine deployed from #20 served real `GET /formulary/lookup` and `GET /formulary` traffic from the gateway on 17 September (Medication Safety and Formulary Review in use), all 200.

## 13. Known limitations and deferred items

1. No per-user history endpoint: "recent activity" remains admin-only (audit trail). Not faked.
2. `/auth/register` has no web surface; Settings states user management is external.
3. Audit export pages by offset over `timestamp DESC`; rows inserted mid-export can shift a page. Disclosed; fix is an engine cursor parameter.
4. `approveDocument` returns a boolean, so the engine's 409 detail ("no live chunks to index") reaches the user as a generic failure.
5. Retired documents are kept for audit but not listed anywhere: the engine's list excludes soft-deleted rows and has no endpoint that returns them. The governance screen says so.
6. `/metrics` counters are per-process, reset on restart, and nothing scrapes them. Shown as tallies, never as rates.
7. OIDC sign-in preserves the requested screen via `sessionStorage`; if storage is unavailable the user lands on Home (the pre-router behaviour).
8. The live UI on the Railway host could not be exercised from this session (the proxy refuses `*.up.railway.app`); UI verification is from the built bundle against stubbed routes, and from the engine's access log.
9. shadcn primitives other than dialog and select keep physical offsets; they join the RTL scan when something mounts them.

## 14. Operational notes

- Railway redeploys `gateway` and `engine` from `main` on merge; each deployment above was confirmed `SUCCESS` and the engine boot log read after every engine change.
- A `redeploy` reuses the old build; a fresh build needs a new commit or `set-variables` with `skipDeploys:false`.
- The 40 DB-backed engine tests need `TEST_DATABASE_URL`; CI provides Postgres 16 and runs them.

## 15. Verdict

**PRODUCTION READY WITH DOCUMENTED LIMITATIONS.**

Conditions for continued readiness: keep the three CI checks required; keep `ROUTE_PERMISSION` and the engine's `require_admin` routes in step (the routing test enforces the client half); keep AR/EN key parity (enforced); do not reintroduce claims the repository cannot evidence (enforced for pills and the footer).
