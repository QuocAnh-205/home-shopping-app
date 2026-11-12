# syntax=docker/dockerfile:1.7
# ============================================================
# Home Shopping App - Backend (NestJS) - Multi-stage build
# ============================================================

# ---------- Stage 0: base ----------
FROM node:20-alpine AS base
# openssl: Prisma query engine cần libssl trên Alpine (musl)
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ---------- Stage 1: deps (full, để build) ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---------- Stage 2: build ----------
FROM deps AS build
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---------- Stage 3: prod-deps (chỉ dependencies runtime) ----------
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate && npm cache clean --force

# ---------- Stage 4: runtime ----------
FROM base AS runtime
ARG APP_VERSION=dev
# Số lần chạy pipeline → phiên bản 1.0.<APP_BUILD> (hiện ở /api/health và footer website)
ARG APP_BUILD=0
ENV NODE_ENV=production \
    PORT=8080 \
    APP_VERSION=${APP_VERSION} \
    APP_BUILD=${APP_BUILD} \
    NODE_OPTIONS="--max-old-space-size=384"

LABEL org.opencontainers.image.title="home-shopping-backend" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/home-shopping-app"

# Vá các gói OS + tạo user không phải root (UID cố định để map quyền volume)
# Thư mục uploads (chế độ không có S3) là nơi DUY NHẤT user runtime được ghi; named volume kế thừa quyền này
RUN apk upgrade --no-cache \
 && addgroup -S -g 1001 nodejs \
 && adduser -S -D -u 1001 -G nodejs -h /home/nestjs nestjs \
 && mkdir -p /app/uploads && chown 1001:1001 /app/uploads && chmod 750 /app/uploads

# File thuộc root, user runtime chỉ có quyền đọc → container bị chiếm cũng không sửa được code
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY package.json ./

# UID/GID số: Kubernetes runAsNonRoot & host xác minh được user không phải root
USER 1001:1001
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]
