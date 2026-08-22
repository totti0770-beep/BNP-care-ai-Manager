# API server — Replit OIDC auth plus the /bnp-api gateway to the clinical engine.
# Build from the repository root:
#   docker build -f artifacts/api-server/Dockerfile -t bnp-api .
FROM node:22-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo

# Manifests first so the dependency layer caches independently of source.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/bestnursingai/package.json ./artifacts/bestnursingai/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY lib/replit-auth-web/package.json ./lib/replit-auth-web/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY lib/ ./lib/
COPY attached_assets/ ./attached_assets/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/bestnursingai/ ./artifacts/bestnursingai/

# The SPA is built into this image as well as the api-server, so a
# single-service deployment can serve both from one origin (see WEB_ROOT in
# src/app.ts). docker compose ignores it and uses the nginx image instead.
RUN pnpm run typecheck:libs \
    && pnpm --filter @workspace/api-server run build \
    && pnpm --filter @workspace/bestnursingai run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# The build bundles its dependencies, so only the output is needed here.
COPY --from=build /repo/artifacts/api-server/dist ./dist
COPY --from=build /repo/artifacts/bestnursingai/dist/public ./public

RUN useradd --create-home --uid 10001 api
USER api

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8080/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
