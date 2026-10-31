#!/usr/bin/env bash
# ============================================================
# Cấp chứng chỉ Let's Encrypt lần đầu (giải bài toán "con gà - quả trứng":
# Nginx cần cert để khởi động, certbot cần Nginx để xác thực HTTP-01).
#   1) tạo cert self-signed tạm → 2) start Nginx → 3) xin cert thật qua webroot → 4) reload
# Yêu cầu .env có DOMAIN (DNS A record trỏ về Elastic IP, hoặc dùng <ip-gạch-ngang>.sslip.io).
# LETSENCRYPT_EMAIL không bắt buộc: để trống thì đăng ký không kèm email (không nhận cảnh báo hết hạn).
# ============================================================
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${DOMAIN:?DOMAIN is required in .env}"
STAGING="${LETSENCRYPT_STAGING:-0}"
CERT_NAME="homeshop"
LIVE="/etc/letsencrypt/live/$CERT_NAME"

compose() {
  local env_files=(--env-file .infra.env --env-file .env)
  [ -f .deploy/image.env ] && env_files+=(--env-file .deploy/image.env)
  docker compose -p homeshop -f docker-compose.prod.yml "${env_files[@]}" "$@"
}

self_signed() {
  compose run --rm --no-deps --entrypoint sh certbot -c "
    mkdir -p $LIVE &&
    openssl req -x509 -nodes -newkey rsa:2048 -days ${1:-1} \
      -keyout $LIVE/privkey.pem -out $LIVE/fullchain.pem -subj '/CN=$DOMAIN' >/dev/null 2>&1"
}

wait_nginx_running() {
  local _
  for _ in $(seq 1 30); do
    [ "$(docker inspect -f '{{.State.Running}}' homeshop-nginx 2>/dev/null)" = "true" ] \
      && [ "$(docker inspect -f '{{.State.Restarting}}' homeshop-nginx 2>/dev/null)" = "false" ] && return 0
    sleep 2
  done
  echo "[tls] nginx is not running"; docker logs --tail 20 homeshop-nginx || true
  return 1
}

echo "[tls] Creating temporary self-signed certificate"
self_signed 1

echo "[tls] (Re)starting nginx with temporary certificate"
# --force-recreate: nginx có thể đang kẹt vòng restart vì trước đó chưa có cert
compose up -d --no-deps --force-recreate nginx
wait_nginx_running

echo "[tls] Removing temporary certificate (nginx keeps it loaded in memory)"
compose run --rm --no-deps --entrypoint sh certbot -c "
  rm -rf /etc/letsencrypt/live/$CERT_NAME /etc/letsencrypt/archive/$CERT_NAME /etc/letsencrypt/renewal/$CERT_NAME.conf"

STAGING_ARG=""
[ "$STAGING" = "1" ] && STAGING_ARG="--staging"
if [ -n "${LETSENCRYPT_EMAIL:-}" ]; then
  EMAIL_ARGS=(--email "$LETSENCRYPT_EMAIL")
else
  EMAIL_ARGS=(--register-unsafely-without-email)
fi

echo "[tls] Requesting Let's Encrypt certificate for $DOMAIN"
# shellcheck disable=SC2086  # STAGING_ARG rỗng hoặc 1 cờ
if ! compose run --rm --no-deps --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --cert-name "$CERT_NAME" \
  -d "$DOMAIN" \
  "${EMAIL_ARGS[@]}" \
  --rsa-key-size 4096 \
  --agree-tos --no-eff-email --non-interactive \
  $STAGING_ARG; then
  # Không để nginx chết vì thiếu cert: dùng cert tự ký 30 ngày, lần deploy sau sẽ thử lại
  echo "[tls] Let's Encrypt FAILED → falling back to a self-signed certificate (browser will warn)"
  self_signed 30
  docker exec homeshop-nginx nginx -s reload
  exit 1
fi

echo "[tls] Reloading nginx"
docker exec homeshop-nginx nginx -s reload
echo "[tls] Done: https://$DOMAIN"
