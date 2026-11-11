#!/usr/bin/env bash
# ============================================================
# Zero-downtime deploy + auto-rollback (chạy trên EC2, được GitHub Actions gọi qua SSH)
#
#   Usage: scripts/deploy.sh <image_tag>        (SKIP_PULL=1: dùng image đã docker load sẵn)
#          scripts/deploy.sh --rollback [tag]   (rollback THỦ CÔNG, mặc định về bản trước – workflow rollback.yml)
#   Exit:  0 = deploy / rollback thủ công thành công
#          2 = bản mới lỗi → đã rollback về bản trước
#          1 = lỗi nghiêm trọng (migration fail / rollback fail / thiếu cấu hình)
#
# Chiến lược rolling update trên 1 host:
#   scale service lên 2 bản (cũ + mới) → chờ bản mới healthy → Nginx (resolve DNS 5s)
#   tự đưa bản mới vào upstream → dừng bản cũ (graceful SIGTERM) → không mất request.
# ============================================================
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

MODE="deploy"
if [ "${1:-}" = "--rollback" ]; then
  MODE="rollback"
  shift
fi
NEW_TAG="${1:-}"
[ "$MODE" = "rollback" ] || [ -n "$NEW_TAG" ] || { echo "Usage: deploy.sh <image_tag> | deploy.sh --rollback [tag]"; exit 1; }
PROJECT="homeshop"
STATE_DIR="$APP_DIR/.deploy"
CURRENT_FILE="$STATE_DIR/current_tag"
PREVIOUS_FILE="$STATE_DIR/previous_tag"
IMAGE_ENV="$STATE_DIR/image.env"
HEALTH_URL="https://127.0.0.1/api/health"
HEALTH_DELAY_SECONDS="${HEALTH_DELAY_SECONDS:-30}"
CONTAINER_HEALTH_TIMEOUT="${CONTAINER_HEALTH_TIMEOUT:-180}"
APP_SERVICES=(backend frontend)

mkdir -p "$STATE_DIR"
LOG_FILE="$STATE_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

log()  { echo "[deploy] $(date '+%F %T') $*"; }
fail() { log "ERROR: $*"; exit 1; }

[ -f .env ] || fail ".env not found in $APP_DIR"
[ -f .infra.env ] || touch .infra.env

compose() {
  # Thứ tự --env-file: file sau ghi đè file trước; biến IMAGE_TAG trong shell ghi đè tất cả
  local env_files=(--env-file .infra.env --env-file .env)
  [ -f "$IMAGE_ENV" ] && env_files+=(--env-file "$IMAGE_ENV")
  docker compose -p "$PROJECT" -f docker-compose.prod.yml "${env_files[@]}" "$@"
}

# Sao lưu DB ngay trước khi chạy migration (chỉ khi có migration mới). Migration là forward-only:
# nếu dữ liệu sau migrate có vấn đề, dừng backend rồi khôi phục bản local này:
#   gunzip -c backups/pre-deploy-<...>.sql.gz | docker exec -i homeshop-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
pre_migration_backup() {
  if IMAGE_TAG="$NEW_TAG" compose run --rm --no-deps -T backend npx prisma migrate status >/dev/null 2>&1; then
    log "No pending migrations → skip pre-migration backup"
    return 0
  fi
  local dir="$APP_DIR/backups" file
  mkdir -p "$dir" && chmod 700 "$dir"
  file="$dir/pre-deploy-$(date +%Y%m%d-%H%M%S)-${NEW_TAG:0:8}.sql.gz"
  log "Pending migrations → dumping database to $file"
  # shellcheck disable=SC2016 # biến được mở rộng bên trong container postgres
  compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --clean --if-exists --quote-all-identifiers' \
    | gzip -9 > "$file.partial" || fail "Pre-migration backup failed - nothing changed"
  gzip -t "$file.partial" || fail "Pre-migration backup is corrupt - nothing changed"
  gunzip -c "$file.partial" | tail -n 5 | grep -q "PostgreSQL database dump complete" || fail "Pre-migration backup incomplete - nothing changed"
  mv "$file.partial" "$file"
  # Giữ 5 bản pre-deploy gần nhất
  find "$dir" -maxdepth 1 -name 'pre-deploy-*.sql.gz' -printf '%T@ %p\n' | sort -rn | tail -n +6 | cut -d' ' -f2- | xargs -r rm -f
  log "Pre-migration backup OK ($(du -h "$file" | cut -f1))"
}

container_ids() {
  docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$1" | sort
}

wait_healthy() {
  local deadline=$((SECONDS + CONTAINER_HEALTH_TIMEOUT)) id status all_ok
  while [ "$SECONDS" -lt "$deadline" ]; do
    all_ok=1
    for id in "$@"; do
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing)"
      case "$status" in
        healthy) ;;
        unhealthy|exited|dead|missing)
          log "Container ${id:0:12} is $status"
          docker logs --tail 50 "$id" 2>&1 | sed 's/^/    /' || true
          return 1 ;;
        *) all_ok=0 ;;
      esac
    done
    [ "$all_ok" = 1 ] && return 0
    sleep 3
  done
  log "Timeout ${CONTAINER_HEALTH_TIMEOUT}s waiting for containers to become healthy"
  return 1
}

# Rolling update 1 service sang tag $2 mà không có downtime
rolling_update() {
  local svc="$1" tag="$2" old_ids new_ids old_count
  old_ids="$(container_ids "$svc")"
  old_count="$(printf '%s' "$old_ids" | grep -c . || true)"

  if [ "$old_count" -eq 0 ]; then
    log "[$svc] no running container → fresh start with tag $tag"
    IMAGE_TAG="$tag" compose up -d --no-deps "$svc"
    # shellcheck disable=SC2046
    wait_healthy $(container_ids "$svc")
    return
  fi

  log "[$svc] scaling $old_count → $((old_count * 2)) with tag $tag"
  IMAGE_TAG="$tag" compose up -d --no-deps --no-recreate --scale "$svc=$((old_count * 2))" "$svc"
  new_ids="$(comm -13 <(printf '%s\n' "$old_ids") <(container_ids "$svc"))"
  [ -n "$new_ids" ] || { log "[$svc] no new container created"; return 1; }

  # shellcheck disable=SC2086
  if ! wait_healthy $new_ids; then
    log "[$svc] new container unhealthy → removing it, old version keeps serving"
    # shellcheck disable=SC2086
    docker rm -f $new_ids >/dev/null || true
    return 1
  fi

  # Chờ Nginx re-resolve DNS (resolver valid=5s) để đưa bản mới vào upstream trước khi tắt bản cũ
  sleep 7
  log "[$svc] draining old containers: $(echo "$old_ids" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  docker stop -t 30 $old_ids >/dev/null
  # shellcheck disable=SC2086
  docker rm $old_ids >/dev/null
  log "[$svc] rolled to $tag"
}

http_health() {
  local code="000" i
  for i in 1 2 3 4 5; do
    code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)"
    [ "$code" = "200" ] && { log "Health check OK (HTTP 200)"; return 0; }
    log "Health check attempt $i → HTTP $code"
    sleep 5
  done
  return 1
}

ensure_tls_and_edge() {
  if ! compose run --rm --no-deps --entrypoint test certbot -f /etc/letsencrypt/live/homeshop/fullchain.pem; then
    log "No TLS certificate yet → running init-letsencrypt.sh"
    bash "$APP_DIR/scripts/init-letsencrypt.sh"
  fi
  # --no-deps: không để compose "tiện tay" recreate frontend/backend
  compose up -d --no-deps nginx certbot
  # nginx.conf là bind-mount: compose không phát hiện thay đổi nội dung → test & reload thủ công
  docker exec homeshop-nginx nginx -t && docker exec homeshop-nginx nginx -s reload
  ensure_certificate_covers_domain || log "WARNING: không cập nhật được chứng chỉ cho tên miền mới"
}

# Đổi tên miền (DOMAIN trong GitHub Secret PROD_ENV_FILE) → chứng chỉ "homeshop" được cấp lại cho tên miền mới
# + staging.<tên miền mới> ngay trong lần deploy kế tiếp. Không cần SSH, không cần chạy lại init-letsencrypt.sh.
ensure_certificate_covers_domain() {
  local domain email
  domain="$(grep -E '^DOMAIN=' .env | tail -n1 | cut -d= -f2- | tr -d '"'"'"' ')"
  [ -n "$domain" ] || return 0
  if docker exec homeshop-certbot certbot certificates --cert-name homeshop 2>/dev/null | grep -Eq "Domains:.*(^| )${domain//./\\.}( |$)"; then
    return 0
  fi
  log "TLS certificate does not cover $domain → requesting a new one (Let's Encrypt HTTP-01)"
  email="$(grep -E '^LETSENCRYPT_EMAIL=' .env | tail -n1 | cut -d= -f2- | tr -d '"'"'"' ')"
  local account=(--register-unsafely-without-email)
  [ -n "$email" ] && account=(-m "$email")
  # Thử cả tên miền staging; nếu DNS của staging.<domain> chưa trỏ về máy chủ thì vẫn cấp cho tên miền chính
  docker exec homeshop-certbot certbot certonly --webroot -w /var/www/certbot --cert-name homeshop \
    -d "$domain" -d "staging.$domain" --non-interactive --agree-tos --force-renewal "${account[@]}" >/dev/null \
    || docker exec homeshop-certbot certbot certonly --webroot -w /var/www/certbot --cert-name homeshop \
      -d "$domain" --non-interactive --agree-tos --force-renewal "${account[@]}" >/dev/null \
    || return 1
  docker exec homeshop-nginx nginx -s reload
  log "TLS certificate now covers $domain + staging.$domain"
}

persist_tag() {
  printf 'IMAGE_TAG=%s\n' "$1" > "$IMAGE_ENV"
}

rollback() {
  local prev="$1"
  if [ -z "$prev" ]; then
    log "No previous version recorded → cannot rollback"
    exit 1
  fi
  log "===== ROLLBACK to $prev ====="
  IMAGE_TAG="$prev" compose pull --quiet "${APP_SERVICES[@]}"
  for svc in "${APP_SERVICES[@]}"; do
    rolling_update "$svc" "$prev" || fail "Rollback of $svc failed - manual intervention required"
  done
  persist_tag "$prev"
  http_health || fail "Service still unhealthy after rollback - manual intervention required"
  log "Rollback completed, running version: $prev"
  docker image prune -af >/dev/null || true
  exit 2
}

# ============================================================
main() {
  local prev_tag=""
  [ -f "$CURRENT_FILE" ] && prev_tag="$(cat "$CURRENT_FILE")"
  log "Deploying $NEW_TAG (current: ${prev_tag:-none})"

  if [ "$prev_tag" = "$NEW_TAG" ]; then
    log "Tag $NEW_TAG is already running → re-deploying in place"
  fi

  # 1. Pull image mới (nếu lỗi → dừng, hệ thống đang chạy không bị ảnh hưởng).
  #    SKIP_PULL=1: image đã được nạp sẵn bằng `docker load` (deploy thủ công lần đầu, chưa có registry)
  if [ "${SKIP_PULL:-0}" = "1" ]; then
    local img
    for img in $(IMAGE_TAG="$NEW_TAG" compose config --images "${APP_SERVICES[@]}" | grep "/home-shopping-"); do
      docker image inspect "$img" >/dev/null 2>&1 || fail "SKIP_PULL=1 but image $img is not loaded"
    done
    log "SKIP_PULL=1 → using preloaded images"
  else
    IMAGE_TAG="$NEW_TAG" compose pull --quiet "${APP_SERVICES[@]}" || fail "Cannot pull images for $NEW_TAG"
  fi

  # 2. Data tier: chỉ recreate khi cấu hình thay đổi
  compose up -d --wait postgres redis || fail "Database/Redis failed to start"

  # 3. Sao lưu rồi migration schema (forward-only, chạy trước khi đổi code → tương thích expand/contract)
  pre_migration_backup
  log "Running prisma migrate deploy"
  IMAGE_TAG="$NEW_TAG" compose run --rm --no-deps -T backend npx prisma migrate deploy \
    || fail "Database migration failed - running version untouched"

  # Seed idempotent: danh mục + sản phẩm (giữ nguyên tồn kho/đã bán), admin đầu tiên & đánh giá mẫu nếu được cấu hình
  log "Running idempotent catalog seed"
  IMAGE_TAG="$NEW_TAG" compose run --rm --no-deps -T backend node prisma/seed.js \
    || fail "Catalog seed failed - running version untouched"

  # 4. Rolling update từng service
  for svc in "${APP_SERVICES[@]}"; do
    if ! rolling_update "$svc" "$NEW_TAG"; then
      log "Rolling update of $svc failed"
      rollback "$prev_tag"
    fi
  done
  persist_tag "$NEW_TAG"

  ensure_tls_and_edge || log "WARNING: edge (nginx/certbot) step reported an error"

  # 5. Health check sau 30 giây; khác HTTP 200 → rollback
  log "Waiting ${HEALTH_DELAY_SECONDS}s before post-deploy health check"
  sleep "$HEALTH_DELAY_SECONDS"
  if ! http_health; then
    log "Post-deploy health check FAILED"
    rollback "$prev_tag"
  fi

  # 6. Ghi nhận phiên bản
  if [ -n "$prev_tag" ] && [ "$prev_tag" != "$NEW_TAG" ]; then
    echo "$prev_tag" > "$PREVIOUS_FILE"
  fi
  echo "$NEW_TAG" > "$CURRENT_FILE"

  # 7. Monitoring stack (lỗi monitoring không làm fail deploy ứng dụng)
  if [ -f monitoring/docker-compose.monitoring.yml ]; then
    if ! { bash "$APP_DIR/scripts/render-alertmanager.sh" \
        && docker compose -p homeshop-monitoring -f monitoring/docker-compose.monitoring.yml --env-file .env up -d --remove-orphans; }; then
      log "WARNING: monitoring stack update failed"
    fi
  fi

  # 8. Dọn image cũ để EC2 không bao giờ đầy ổ cứng (rollback sẽ pull lại theo SHA từ Docker Hub)
  docker image prune -af >/dev/null || true
  docker container prune -f >/dev/null || true
  find "$STATE_DIR" -name 'deploy-*.log' -mtime +14 -delete || true
  log "Deploy $NEW_TAG completed. Disk usage: $(df -h / | awk 'NR==2{print $5}')"
}

# Rollback thủ công (bấm nút trên GitHub Actions): KHÔNG chạy migration – schema mới vẫn tương thích ngược
# vì migration chỉ thêm cột/bảng (expand); dữ liệu không bị đụng.
manual_rollback() {
  local current="" target="$NEW_TAG"
  [ -f "$CURRENT_FILE" ] && current="$(cat "$CURRENT_FILE")"
  [ -n "$target" ] || { [ -f "$PREVIOUS_FILE" ] && target="$(cat "$PREVIOUS_FILE")"; }
  [ -n "$target" ] || fail "Không có bản trước để rollback (chưa có .deploy/previous_tag)"
  [ "$target" != "$current" ] || fail "Bản $target đang chạy rồi"
  log "===== MANUAL ROLLBACK $current → $target ====="
  IMAGE_TAG="$target" compose pull --quiet "${APP_SERVICES[@]}" || fail "Cannot pull images for $target"
  for svc in "${APP_SERVICES[@]}"; do
    rolling_update "$svc" "$target" || fail "Rollback of $svc failed - bản $current vẫn đang chạy"
  done
  persist_tag "$target"
  http_health || fail "Service unhealthy after manual rollback"
  [ -n "$current" ] && echo "$current" > "$PREVIOUS_FILE"
  echo "$target" > "$CURRENT_FILE"
  log "Manual rollback completed, running version: $target"
}

if [ "$MODE" = "rollback" ]; then
  manual_rollback
else
  main
fi
