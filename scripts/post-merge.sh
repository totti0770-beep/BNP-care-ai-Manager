#!/bin/bash
set -e
pnpm install --frozen-lockfile
# `migrate` applies reviewed, versioned SQL from lib/db/drizzle. This used to be
# `push`, which diffs against the live database and applies the result with no
# artifact and no history — and replit.md documented `push-force` (which skips
# the destructive-change prompts) as the routine fallback.
pnpm --filter db migrate
