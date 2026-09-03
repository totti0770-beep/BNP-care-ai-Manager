# Deploying on Railway

This is the topology the project was actually deployed with, and why each piece is
shaped the way it is. It assumes a Railway account and nothing else.

## Topology

Three services in one Railway project, one environment:

| Service | Public? | Source | Why |
|---|---|---|---|
| `postgres` | no | `postgres:16` image | Shared by the engine (Alembic) and the gateway (drizzle) |
| `engine` | **no** | `artifacts/clinical-ai-engine/Dockerfile` | Answers clinical questions. Never internet-reachable — every request must arrive through the gateway so it is attributable to a signed-in nurse |
| `gateway` | yes | `artifacts/api-server/Dockerfile` | Express: sessions, `/api`, the `/bnp-api` proxy to the engine, and the built web app |

The gateway image contains the built SPA and serves it from the same origin as the API
(`src/lib/webApp.ts`). That is deliberate: Railway gives one public URL per service, and a
separate web service would need either a second public hostname (cross-site cookies) or an
nginx upstream over Railway's IPv6-only private network. One origin avoids both. Under
`docker compose` nginx still fronts the SPA and this code path is never reached.

**Do not generate a public domain for `engine`.** The gateway reaches it at
`http://engine.railway.internal:8000` over the private network. A public engine domain
re-opens exactly the hole the gateway exists to close.

It also publishes `/metrics`, which the engine serves unauthenticated by design — a scraper
generally cannot present a user credential, and the body is counters only, never questions or
answers. With no public domain the only route to it is `/bnp-api/metrics` through the
gateway, which refuses an unauthenticated caller. That is the invariant the endpoint's design
assumes; generating a domain removes it.

## Configuration

Set on **`postgres`** — the `postgres` image does not provide a `DATABASE_URL` of its own,
so the reference other services use has to be built here:

```
DATABASE_URL = postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{POSTGRES_DB}}
```

Set on **`engine`**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{postgres.DATABASE_URL}}` |
| `JWT_SECRET` | `openssl rand -hex 32` — see the rotation note below |
| `AUTO_MIGRATE` | `1` (single instance: the engine applies Alembic migrations on boot) |
| `ADMIN_EMAILS` | comma-separated; these accounts get the admin role |
| `LOG_FORMAT` | `json` |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `1` / `10` |
| `OPENAI_API_KEY` | required before the engine can answer anything — see *Degraded by design* |

Set on **`gateway`**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{postgres.DATABASE_URL}}` |
| `ENGINE_JWT_SECRET` | **the same value as the engine's `JWT_SECRET`** |
| `ENGINE_URL` | `http://engine.railway.internal:8000` |
| `PORT` | `8080` |
| `NODE_ENV` | `production` |
| `ADMIN_EMAILS` | same list as the engine |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | the first sign-in account; **clear both after the first boot** |

Secrets live in Railway's per-service variables and nowhere else. None of them is in this
repository, and none should be pasted into an issue, a PR, or a commit message. The signing
key committed at `f899a8a` is in this repository's **public** history and must never be
reused — see [`../security/jwt-rotation.md`](../security/jwt-rotation.md).

`BOOTSTRAP_ADMIN_PASSWORD` is read only when the account does not already exist. Leaving it
set would mean anyone who can read the deploy config owns the admin account, which is why the
runbook says to clear it.

## Healthchecks — liveness, not readiness

`engine`'s Railway healthcheck points at **`/livez`**, not `/health`.

`/health` is a readiness gate and reports 503 whenever the engine cannot actually answer a
clinical question. That is correct and unchanged. But Railway uses the healthcheck to decide
whether a deployment may be promoted at all, so pointing it at `/health` restart-loops an
engine that is merely waiting for an API key or a corpus — and a restarting engine cannot
serve `/health` to say why. `/livez` reports that the process is up and nothing more.

`gateway`'s healthcheck points at `/api/healthz`.

**Read `/health` to find out whether the engine is usable.** A green Railway deployment does
not mean the engine can answer anything.

## Degraded by design

A freshly deployed engine has no corpus and, without `OPENAI_API_KEY`, no embeddings. In that
state it deliberately refuses every clinical question rather than answering ungrounded, and
`/health` reports `degraded` with the reasons listed. Everything that does not depend on
retrieval — sign-in, the formulary and its review workflow, the audit chain, the admin
screens — works.

To make it answer: set `OPENAI_API_KEY` on the engine, then upload the clinical PDFs through
the admin document screen (which goes through the gateway, so the upload is attributable).
The index is rebuilt from the `bnp_chunks` table on boot; attach a Railway volume at
`/app/data` to keep it across restarts and avoid re-embedding the whole corpus every time.

## Seeding the formulary

The 638 reviewed drugs are not in the schema — they are replayed through the real API so that
every import and every approval lands on the tamper-evident audit chain:

```bash
python artifacts/clinical-ai-engine/scripts/apply_jsh_formulary.py \
  --base-url https://<gateway-domain>/bnp-api \
  --token "$ENGINE_TOKEN" \
  --csv artifacts/clinical-ai-engine/data/formulary/jsh_workbooks_import.csv \
  --csv artifacts/clinical-ai-engine/data/formulary/corrections_import.csv \
  --reviews artifacts/clinical-ai-engine/data/formulary/pharmacist_review_log.csv
```

Then confirm `GET /auth/audit-log/verify` still returns `valid: true`.

## The `seed` service

A fourth, one-shot service exists in the project. It runs the formulary replay and the
post-deployment verification from *inside* Railway, which is how a deployment gets checked
when the machine holding this repository cannot reach `*.up.railway.app`.

It is now reduced to verification only — it runs `scripts/verify_deployment.py` against the
public gateway on every deploy and exits — and its copy of `JWT_SECRET` has been cleared,
because only the seeding step needed one.

#### Six of its checks stopped running on 2026-09-02

`BNP_EMAIL` and `BNP_PASSWORD` are references to the gateway's `BOOTSTRAP_ADMIN_*` variables,
and those were deliberately blanked once the admin account existed. The references now resolve
to empty, so the verifier skips everything behind a session. It does not pretend otherwise —
it prints

```
[INFO] sign-in — skipped — set BNP_EMAIL and BNP_PASSWORD to exercise it
```

and exits 0. But "all checks passed" now asserts less than it did before that date, so read a
green run accordingly:

| Still runs | No longer runs |
|---|---|
| gateway `/api/healthz` | sign-in with a password |
| the SPA being served | roles derived from `ADMIN_EMAILS` |
| advertised sign-in methods | the session surviving the response |
| **the engine refusing an unauthenticated caller** | **the gateway actually reaching the engine** |
| no session existing before sign-in | **the audit chain verifying** |
| | the approved-drug count |

That loss is the price of not keeping an admin password in the deploy config, and it is the
right trade — but it is a real reduction in coverage, not a no-op. Restoring those checks
properly means a dedicated verification account with its own credentials; it does **not** mean
pointing these two variables back at the bootstrap ones.

#### It was retired on 2026-09-02, without being deleted

Deleting it needs two-factor verification from the dashboard (see below), which no API or MCP
token can supply. So it was made inert instead, from a session, in three changes that need no
second factor:

| Change | Effect |
|---|---|
| `watchPatterns` set to `.railway/seed-is-retired-never-matches/**` | no push to `main` matches, so merging no longer rebuilds it |
| start command replaced with an `echo` and `exit 0` | a deploy prints why it is retired and stops; it runs no verification and signs in as nobody |
| all eight of its variables blanked | it holds no `JWT_SECRET`, no bootstrap password, no operator identity |

The service still exists, and its config still names this repository as its source. What it no
longer does is rebuild on every merge, hold a secret, or write audit rows. **Deleting it
outright is still worth doing** when someone is at the dashboard; nothing depends on it.

To bring the check back, restore the start command below **and** clear `watchPatterns`, then
set the variables again. Restoring the variables alone does nothing, because the watch pattern
stops the build.

### Deleting a service or a project cannot be automated — this is deliberate

Nothing in an agent session can delete a Railway service, and repeated attempts only look like
they worked. There is no `delete-service` MCP tool. The Railway agent has `removeServiceTool`,
which returns

```
{"status":"applied","message":"Service has been marked for removal."}
```

— language that reads like success and is not. It stages the removal into a patch; applying it
needs `commitStagedChangesTool`, and that step answers, verbatim:

```
{"status":"awaiting_user_action","message":"These staged changes require two-factor
verification, which isn't available over an API/MCP token. Apply them from the Railway
dashboard."}
```

The block is Railway's two-factor gate on destructive changes, and an API or MCP token cannot
satisfy it — granting the token a wider role does not change that (verified 2026-09-02 with
the project owner's own account: same refusal). Three separate attempts (this service twice,
and the superseded `bnp-clinical-ai-engine` project) all ended with the target still online
and still serving.

So: deletion is a dashboard action, always. Either apply the staged change the agent left
behind (the environment shows pending changes; applying them prompts for the second factor),
or go direct: **Settings → Danger → Delete.** The confirmation box requires typing the service
or project name exactly, and the second-factor prompt has to be completed — dismissing either
leaves everything in place. Verify afterwards with `list-services` or `list-projects` rather
than trusting any report of success — including one from an agent.

To run the seeding again — against a fresh database, say — restore its start command to:

```
sh -c 'set -e; TOKEN=$(python scripts/mint_operator_token.py --subject "$OPERATOR_SUBJECT" --username "$OPERATOR_USERNAME" --ttl 5400); python scripts/apply_jsh_formulary.py --base-url "$ENGINE_BASE" --token "$TOKEN" --csv data/formulary/jsh_workbooks_import.csv --csv data/formulary/corrections_import.csv --manifest data/formulary/jsh_workbooks_import.manifest.json --review-log data/formulary/pharmacist_review_log.csv --retirement-log data/formulary/retirement_log.csv; python scripts/verify_deployment.py --base-url "$GATEWAY_BASE"'
```

and set `ENGINE_BASE`, `OPERATOR_SUBJECT`, `OPERATOR_USERNAME` and `JWT_SECRET` again. Note
that a *redeploy* reuses the previous build; a config change of this kind needs a fresh build,
which a variable change (without `skipDeploys`) or a push will trigger.

## First things to do on a new deployment

1. **Sign in and change the password** (`POST /api/auth/password`, or the account screen), then
   clear `BOOTSTRAP_ADMIN_PASSWORD` from the gateway's variables. It is read only when the
   account does not yet exist, so clearing it changes nothing except who can read the
   credential out of the deploy configuration.
2. **Set `OPENAI_API_KEY`** on the engine and upload the clinical PDFs through the admin
   document screen. Until then the engine is degraded by design and answers nothing.
3. **Attach a volume at `/app/data`** on the engine so the index survives a restart.

## Deploying a change

Both services are attached to the branch and rebuild on push. Nothing here needs a manual
deploy step; `mcp__Railway__get-status` (or the dashboard) shows the result, and the build and
deploy logs are the evidence that a change actually took effect.
