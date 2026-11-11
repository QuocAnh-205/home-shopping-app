#!/usr/bin/env bash
# ============================================================
# Deploy STAGING (chạy trên EC2, GitHub Actions gọi qua SSH TRƯỚC khi deploy production)
#
#   bash scripts/deploy-staging.sh <image_tag>
#
# 1. Pull đúng image (tag = commit SHA) sẽ lên production
# 2. DB/Redis staging riêng → prisma migrate deploy + seed (thử migration trên DB staging trước production)
# 3. Chạy backend/frontend staging, chờ healthy
# 4. Chứng chỉ HTTPS có thêm tên miền staging.<DOMAIN> (certbot --expand, chỉ làm 1 lần)
# 5. Smoke test qua Nginx thật: /api/health phải trả 200 và đúng version, trang chủ phải 200
# Exit != 0 → pipeline DỪNG, production không bị đụng tới.
# ============================================================
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

TAG="${1:?Usage: deploy-staging.sh <image_tag>}"
STATE_DIR="$APP_DIR/.deploy"
OVERRIDE_ENV="$STATE_DIR/staging.env"
mkdir -p "$STATE_DIR"

log()  { echo "[staging] $(date '+%F %T') $*"; }
fail() { log "ERROR: $*"; exit 1; }

[ -f .env ] || fail ".env not found in $APP_DIR"
env_value() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

DOMAIN="$(env_value DOMAIN)"
[ -n "$DOMAIN" ] || fail "DOMAIN is empty in .env"
STAGING_HOST="staging.$DOMAIN"
JWT_PROD="$(env_value JWT_SECRET)"
[ -n "$JWT_PROD" ] || fail "JWT_SECRET is empty in .env"

# Biến riêng của staging (ghi đè .env): JWT khác production → token production không dùng được ở staging và ngược lại
umask 077
{
  echo "IMAGE_TAG=$TAG"
  echo "STAGING_URL=https://$STAGING_HOST"
  echo "STAGING_JWT_SECRET=$(printf '%s:staging' "$JWT_PROD" | sha256sum | cut -c1-64)"
} > "$OVERRIDE_ENV"

compose() {
  docker compose -p homeshop-staging -f docker-compose.staging.yml --env-file .env --env-file "$OVERRIDE_ENV" "$@"
}

docker network inspect homeshop-frontend-net >/dev/null 2>&1 || fail "Network homeshop-frontend-net chưa có (production chưa chạy lần nào)"

log "Deploying $TAG → https://$STAGING_HOST"
compose pull --quiet frontend backend || fail "Cannot pull images for $TAG"
compose up -d --wait postgres redis || fail "Staging DB/Redis failed to start"

log "prisma migrate deploy (staging DB)"
compose run --rm --no-deps -T backend npx prisma migrate deploy || fail "Migration failed on staging → production NOT deployed"
log "seed (staging DB)"
compose run --rm --no-deps -T backend node prisma/seed.js || fail "Seed failed on staging"

compose up -d --wait --wait-timeout 240 backend frontend || {
  docker logs --tail 60 homeshop-staging-backend 2>&1 | sed 's/^/    /' || true
  fail "Staging containers not healthy"
}

# Nginx production đọc nginx.conf mới (có định tuyến staging) – chỉ reload khi cấu hình hợp lệ
if docker ps --format '{{.Names}}' | grep -qx homeshop-nginx; then
  if docker exec homeshop-nginx nginx -t >/dev/null 2>&1; then
    docker exec homeshop-nginx nginx -s reload
  else
    log "WARNING: nginx -t failed → giữ cấu hình Nginx cũ"
  fi
fi

# Chứng chỉ HTTPS: thêm staging.<DOMAIN> vào cert "homeshop" (Let's Encrypt HTTP-01 qua webroot sẵn có)
if docker ps --format '{{.Names}}' | grep -qx homeshop-certbot; then
  if ! docker exec homeshop-certbot certbot certificates --cert-name homeshop 2>/dev/null | grep -q "$STAGING_HOST"; then
    log "Expanding TLS certificate with $STAGING_HOST"
    email="$(env_value LETSENCRYPT_EMAIL)"
    account=(--register-unsafely-without-email)
    [ -n "$email" ] && account=(-m "$email")
    if docker exec homeshop-certbot certbot certonly --webroot -w /var/www/certbot --cert-name homeshop --expand \
        -d "$DOMAIN" -d "$STAGING_HOST" --non-interactive --agree-tos "${account[@]}" >/dev/null; then
      docker exec homeshop-nginx nginx -s reload || true
      log "TLS certificate now covers $STAGING_HOST"
    else
      log "WARNING: không mở rộng được chứng chỉ (staging vẫn chạy, trình duyệt sẽ cảnh báo HTTPS)"
    fi
  fi
fi

# Smoke test đi qua Nginx thật (đúng đường đi của người dùng), không phụ thuộc DNS
smoke() {
  curl -sk --max-time 10 --resolve "$STAGING_HOST:443:127.0.0.1" "$@"
}
for i in 1 2 3 4 5 6; do
  body="$(smoke "https://$STAGING_HOST/api/health" || true)"
  if printf '%s' "$body" | grep -q '"status":"ok"' && printf '%s' "$body" | grep -q "\"version\":\"$TAG\""; then
    code="$(smoke -o /dev/null -w '%{http_code}' "https://$STAGING_HOST/")"
    [ "$code" = "200" ] || fail "Staging home page returned HTTP $code"
    log "Smoke test OK: health + version $TAG + home page 200"
    docker image prune -f >/dev/null || true
    log "Staging ready: https://$STAGING_HOST"
    exit 0
  fi
  log "Smoke attempt $i: ${body:0:120}"
  sleep 5
done
fail "Staging smoke test failed → production NOT deployed"
