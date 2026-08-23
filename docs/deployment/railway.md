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
because only the seeding step needed one. It still holds `BNP_PASSWORD` (as a reference to the
gateway's bootstrap password) in order to exercise sign-in.

**Delete it once you no longer want that check**, from the Railway dashboard; there is no API
for removing a service. Until then it also posts a deployment status onto any open pull
request for this branch, which is noise rather than signal.

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
