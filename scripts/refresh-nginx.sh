#!/usr/bin/env bash
# ============================================================
# Đảm bảo container homeshop-nginx chạy ĐÚNG nginx.conf mới nhất trên máy chủ.
# - Bản cũ mount file lẻ ./nginx/nginx.conf → rsync thay file bằng inode mới, container vẫn thấy bản cũ (kể cả reload)
# - Cấu hình trong container khác file trên máy → tạo lại container Nginx (gián đoạn ~1–2 giây, chỉ khi cần)
# - Giống nhau → chỉ test + reload (không gián đoạn)
# Gọi từ deploy-staging.sh và deploy.sh.
# ============================================================
set -Eeuo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

log() { echo "[nginx] $(date '+%F %T') $*"; }

if ! docker ps --format '{{.Names}}' | grep -qx homeshop-nginx; then
  log "homeshop-nginx chưa chạy → bỏ qua"
  exit 0
fi

host_sum="$(sha256sum nginx/nginx.conf | cut -d' ' -f1)"
live_sum="$(docker exec homeshop-nginx sh -c 'sha256sum /etc/nginx/nginx.conf' 2>/dev/null | cut -d' ' -f1 || true)"

if [ "$host_sum" != "$live_sum" ]; then
  log "nginx.conf trong container đã cũ → tạo lại container Nginx"
  [ -f .infra.env ] || touch .infra.env
  env_files=(--env-file .infra.env --env-file .env)
  [ -f .deploy/image.env ] && env_files+=(--env-file .deploy/image.env)
  docker compose -p homeshop -f docker-compose.prod.yml "${env_files[@]}" up -d --no-deps --force-recreate nginx
  for _ in $(seq 1 20); do
    docker exec homeshop-nginx nginx -t >/dev/null 2>&1 && break
    sleep 1
  done
fi

if ! docker exec homeshop-nginx nginx -t >/dev/null 2>&1; then
  log "ERROR: nginx -t failed"
  exit 1
fi
docker exec homeshop-nginx nginx -s reload
log "Nginx đang chạy cấu hình $(docker exec homeshop-nginx sh -c 'sha256sum /etc/nginx/nginx.conf' | cut -c1-12)"
