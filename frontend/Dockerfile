# syntax=docker/dockerfile:1.7
# ============================================================
# Home Shopping App - Frontend (Next.js 14 standalone) - Multi-stage build
# ============================================================

# ---------- Stage 0: base ----------
FROM node:25-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- Stage 1: deps ----------
# Chỉ copy manifest → layer npm ci được cache cho tới khi dependency thay đổi
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---------- Stage 2: build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:25-alpine AS runtime
ARG APP_VERSION=dev
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title="home-shopping-frontend" \
      org.opencontainers.image.version="${APP_VERSION}"

# Vá OS, gỡ npm/npx/yarn khỏi runtime (Next standalone chỉ cần node) → giảm attack surface & CVE
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn* \
 && addgroup -S -g 1001 nodejs \
 && adduser -S -D -u 1001 -G nodejs nextjs \
 && mkdir -p .next/cache && chown nextjs:nodejs .next/cache

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# UID/GID số: Kubernetes runAsNonRoot & host xác minh được user không phải root
USER 1001:1001
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
