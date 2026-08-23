# Rotating the engine signing secret

A JWT signing key was committed to this repository at `f899a8a` (in `.replit`) and is
still readable by anyone who can read the repository:

```bash
git show f899a8a:.replit | grep JWT_SECRET
```

Deleting it from the working tree did not hide it. **Treat that value as permanently
compromised.** Anyone holding it can mint a token for any user — including `role: admin`,
which grants the full audit log and the ability to upload documents into the corpus that
the model then answers from.

This document is the procedure for replacing it, and an honest account of what rotating
actually costs.

## What breaks when you rotate — measured, not assumed

Every claim here was verified against a running instance rather than reasoned about.

| Surface | Signed with this key? | Effect of rotation |
|---|---|---|
| Nurse web/mobile login (OIDC) | **No** | **None.** Sessions are an opaque `sid` cookie backed by `sessionsTable` in Postgres (`artifacts/api-server/src/lib/auth.ts`). Nothing JWT-shaped. Nobody is logged out. |
| Gateway → engine, per request | Yes | Self-healing. `mintEngineToken` issues a fresh token per proxied request with a **300-second** TTL (`artifacts/api-server/src/lib/engineToken.ts`). Once both services run the new value, every request signs and verifies with it. |
| Engine direct login (`POST /auth/login`) | Yes | **Tokens die immediately.** These last 24 hours (`JWT_EXPIRE_HOURS`, `routers/auth.py`). Anyone using this path — admin tooling, scripts, `scripts/apply_jsh_formulary.py` — re-authenticates. |
| Audit hash chain | No | **Unaffected.** The chain is SHA-256 over row content, not a signature. Verified `valid: true` across 3,176 rows immediately after a rotation. |
| Formulary, approvals, reviewer records | No | Unaffected. |

Verified behaviour after restarting the engine with a new secret:

```
token signed with the OLD secret  → HTTP 401
token signed with the NEW secret  → HTTP 200
GET /auth/audit-log/verify        → {"valid": true, "rows_checked": 3176}
```

**So rotation is not a "log everyone out" event.** The realistic user-visible impact is a
few seconds of `401` on the gateway path while the two services restart out of step.

## The one hard constraint

`JWT_SECRET` (engine) and `ENGINE_JWT_SECRET` (api-server) **must hold the same value**.
`docker-compose.yml` enforces that both are set and says so in its own error text; it
cannot check that they match. While they disagree, every gateway-proxied request gets a
401. There is no key-id or dual-key support in the code — a single symmetric HS256 secret,
so rotation is a coordinated swap, not an overlap window.

## Procedure

1. **Generate one value.**

   ```bash
   openssl rand -hex 32
   ```

2. **Set it as both variables, everywhere they are configured.**

   | Deployment | Where |
   |---|---|
   | Docker | `.env` — `JWT_SECRET` and `ENGINE_JWT_SECRET`, identical |
   | Replit | Secrets UI, both keys — **not** `.replit`, which is tracked in git |

3. **Restart the engine and the api-server together.** Order barely matters given the
   300-second token TTL, but keep the gap short to shrink the 401 window.

   ```bash
   docker compose up -d --force-recreate clinical-ai-engine api-server
   ```

4. **Verify.** A 200 here means the gateway and the engine agree on the new value:

   ```bash
   curl -fsS http://localhost:8080/bnp-api/health
   curl -fsS http://localhost:8080/bnp-api/auth/audit-log/verify --cookie "$SESSION"
   ```

   The audit chain must still report `valid: true`. It is not signed with this key, so a
   failure here means something other than rotation went wrong.

5. **Re-issue any long-lived engine tokens** held by admin tooling or scripts.

## The published history — a decision, not a fix

Rotating replaces the key. It does not remove the old one from git history. Two options,
with their real costs:

**Rotate and leave history alone (recommended).** The value is already public; anyone who
cloned before today keeps the blob whatever you do afterwards. Once the key is rotated,
the committed value is worthless. Document it as burned and move on.

**Rewrite history** (`git filter-repo`, BFG) and force-push. This removes the blob from a
fresh clone, but it does *not* recall existing clones, forks, or caches, and GitHub may
retain unreachable objects reachable by direct SHA. It also rewrites every commit on this
branch, invalidating open PR review state and every commit SHA referenced elsewhere. Worth
it only where a compliance regime demands provable purge — and even then, only *alongside*
rotation, never instead of it.

Either way, **rotation is mandatory and is what actually closes the exposure.**

## Open question this repository cannot answer

Is the original Replit deployment — the one whose `.replit` carried this value — still
running, still serving, and still using it? Nothing in the codebase can determine that. It
needs someone with Replit access to check and rotate there specifically.

A fresh Docker deployment is not affected: `JWT_SECRET` has no default anywhere in the
current tree, and both the engine (`routers/auth.py`) and the api-server
(`engineToken.ts`) refuse to start or mint without it. A publicly known key is worse than
a service that will not start, which is why there is no fallback.
