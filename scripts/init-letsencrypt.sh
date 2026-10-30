#!/usr/bin/env bash
# ============================================================
# Cấp chứng chỉ Let's Encrypt lần đầu (giải bài toán "con gà - quả trứng":
# Nginx cần cert để khởi động, certbot cần Nginx để xác thực HTTP-01).
#   1) tạo cert self-signed tạm → 2) start Nginx → 3) xin cert thật qua webroot → 4) reload
# Yêu cầu .env có DOMAIN và LETSENCRYPT_EMAIL; DNS A record đã trỏ về Elastic IP.
# ============================================================
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${DOMAIN:?DOMAIN is required in .env}"
: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL is required in .env}"
STAGING="${LETSENCRYPT_STAGING:-0}"
CERT_NAME="homeshop"
LIVE="/etc/letsencrypt/live/$CERT_NAME"

compose() {
  local env_files=(--env-file .infra.env --env-file .env)
  [ -f .deploy/image.env ] && env_files+=(--env-file .deploy/image.env)
  docker compose -p homeshop -f docker-compose.prod.yml "${env_files[@]}" "$@"
}

echo "[tls] Creating temporary self-signed certificate"
compose run --rm --no-deps --entrypoint sh certbot -c "
  mkdir -p $LIVE &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout $LIVE/privkey.pem -out $LIVE/fullchain.pem -subj '/CN=localhost' >/dev/null 2>&1"

echo "[tls] Starting nginx with temporary certificate"
compose up -d --no-deps nginx

echo "[tls] Removing temporary certificate"
compose run --rm --no-deps --entrypoint sh certbot -c "
  rm -rf /etc/letsencrypt/live/$CERT_NAME /etc/letsencrypt/archive/$CERT_NAME /etc/letsencrypt/renewal/$CERT_NAME.conf"

STAGING_ARG=""
[ "$STAGING" = "1" ] && STAGING_ARG="--staging"

echo "[tls] Requesting Let's Encrypt certificate for $DOMAIN"
compose run --rm --no-deps --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --cert-name "$CERT_NAME" \
  -d "$DOMAIN" \
  --email "$LETSENCRYPT_EMAIL" \
  --rsa-key-size 4096 \
  --agree-tos --no-eff-email --non-interactive \
  $STAGING_ARG

echo "[tls] Reloading nginx"
docker exec homeshop-nginx nginx -s reload
echo "[tls] Done: https://$DOMAIN"
