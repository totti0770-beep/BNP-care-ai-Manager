# BestNursingAI web app — static SPA fronted by nginx, which also proxies /api
# and /bnp-api to the API server so the browser stays same-origin.
# Build from the repository root:
#   docker build -f artifacts/bestnursingai/Dockerfile -t bnp-web .
FROM node:22-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY artifacts/bestnursingai/package.json ./artifacts/bestnursingai/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY lib/replit-auth-web/package.json ./lib/replit-auth-web/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY lib/ ./lib/
COPY attached_assets/ ./attached_assets/
COPY artifacts/bestnursingai/ ./artifacts/bestnursingai/

RUN pnpm run typecheck:libs \
    && pnpm --filter @workspace/bestnursingai run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=build /repo/artifacts/bestnursingai/dist/public /usr/share/nginx/html
COPY artifacts/bestnursingai/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
