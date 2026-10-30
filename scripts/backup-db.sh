#!/usr/bin/env bash
# ============================================================
# Backup PostgreSQL → .sql.gz → AWS S3 (qua IAM Instance Profile, không access key)
# Lỗi ở bất kỳ bước nào → bắn cảnh báo Discord (và Telegram nếu cấu hình).
#
# Cronjob (đã được user_data.sh cài sẵn ở /etc/cron.d/homeshop-backup):
#   0 2 * * * ubuntu /opt/homeshop/scripts/backup-db.sh >> /var/log/homeshop-backup.log 2>&1
# Cài thủ công (nếu không dùng user_data):
#   (crontab -l 2>/dev/null; echo "0 2 * * * /opt/homeshop/scripts/backup-db.sh >> /var/log/homeshop-backup.log 2>&1") | crontab -
# Chạy tay để test:  bash /opt/homeshop/scripts/backup-db.sh
# ============================================================
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$APP_DIR/backups"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-3}"
PG_CONTAINER="homeshop-postgres"
TEXTFILE_DIR="/var/lib/node_exporter/textfile"
LOCK_FILE="/tmp/homeshop-backup.lock"
CURRENT_STEP="init"

log() { echo "[backup] $(date '+%F %T') $*"; }

set -a
# shellcheck disable=SC1091
[ -f "$APP_DIR/.infra.env" ] && . "$APP_DIR/.infra.env"
# shellcheck disable=SC1091
. "$APP_DIR/.env"
set +a

: "${POSTGRES_USER:?POSTGRES_USER missing}"
: "${POSTGRES_DB:?POSTGRES_DB missing}"
: "${S3_BUCKET:?S3_BUCKET missing}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
HOSTNAME_SHORT="$(hostname -s)"

notify() {
  local title="$1" body="$2" color="$3"
  if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
    jq -n --arg t "$title" --arg d "$body" --argjson c "$color" --arg h "$HOSTNAME_SHORT" \
      '{username: "Home Shopping Backup", embeds: [{title: $t, description: $d, color: $c, footer: {text: $h}, timestamp: (now | todate)}]}' \
      | curl -fsS --max-time 15 --retry 3 -H 'Content-Type: application/json' -d @- "$DISCORD_WEBHOOK_URL" >/dev/null \
      || log "WARN: Discord notification failed"
  fi
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS --max-time 15 --retry 3 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${title}
${body}" >/dev/null || log "WARN: Telegram notification failed"
  fi
}

on_error() {
  local exit_code=$? line=$1
  log "FAILED at step '$CURRENT_STEP' (line $line, exit $exit_code)"
  rm -f "${TMP_FILE:-}" 2>/dev/null || true
  notify "🔴 BACKUP DATABASE THẤT BẠI" "DB: \`$POSTGRES_DB\`
Bước lỗi: **$CURRENT_STEP** (line $line, exit $exit_code)
Thời gian: $(date '+%H:%M:%S %d/%m/%Y')
Log: /var/log/homeshop-backup.log" 15158332
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

# Không cho 2 tiến trình backup chạy chồng nhau
exec 9>"$LOCK_FILE"
flock -n 9 || { log "Another backup is running, exit"; exit 0; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

CURRENT_STEP="preflight"
[ "$(docker inspect -f '{{.State.Health.Status}}' "$PG_CONTAINER")" = "healthy" ]
AVAILABLE_KB="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
[ "$AVAILABLE_KB" -gt 1048576 ] || { log "Less than 1 GB free disk"; false; }

TS="$(date +%Y%m%d-%H%M%S)"
FILE_NAME="${POSTGRES_DB}-${TS}.sql.gz"
FINAL_FILE="$BACKUP_DIR/$FILE_NAME"
TMP_FILE="$FINAL_FILE.partial"
S3_KEY="backups/postgres/$(date +%Y)/$(date +%m)/$FILE_NAME"

CURRENT_STEP="pg_dump"
log "Dumping $POSTGRES_DB"
START=$SECONDS
# pipefail: pg_dump lỗi giữa chừng → cả pipeline lỗi, không tạo file backup hỏng
docker exec "$PG_CONTAINER" pg_dump \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --no-owner --no-privileges --clean --if-exists --quote-all-identifiers \
  | gzip -9 > "$TMP_FILE"

CURRENT_STEP="verify"
gzip -t "$TMP_FILE"
SIZE_BYTES="$(stat -c %s "$TMP_FILE")"
[ "$SIZE_BYTES" -gt 1024 ] || { log "Backup file too small ($SIZE_BYTES bytes)"; false; }
DUMP_TAIL="$(gunzip -c "$TMP_FILE" | tail -n 5)"
grep -q "PostgreSQL database dump complete" <<<"$DUMP_TAIL"
SHA256="$(sha256sum "$TMP_FILE" | awk '{print $1}')"
mv "$TMP_FILE" "$FINAL_FILE"
DUMP_SECONDS=$((SECONDS - START))
log "Dump OK: $FILE_NAME ($(numfmt --to=iec "$SIZE_BYTES"), ${DUMP_SECONDS}s, sha256=$SHA256)"

CURRENT_STEP="upload_s3"
aws s3 cp "$FINAL_FILE" "s3://$S3_BUCKET/$S3_KEY" \
  --region "$AWS_REGION" \
  --sse AES256 \
  --content-type application/gzip \
  --metadata "sha256=$SHA256,db=$POSTGRES_DB,host=$HOSTNAME_SHORT" \
  --only-show-errors

CURRENT_STEP="verify_s3"
REMOTE_SIZE="$(aws s3api head-object --region "$AWS_REGION" --bucket "$S3_BUCKET" --key "$S3_KEY" --query ContentLength --output text)"
[ "$REMOTE_SIZE" = "$SIZE_BYTES" ] || { log "S3 size mismatch: local=$SIZE_BYTES remote=$REMOTE_SIZE"; false; }
log "Uploaded to s3://$S3_BUCKET/$S3_KEY"

CURRENT_STEP="cleanup"
find "$BACKUP_DIR" -maxdepth 1 -name "*.sql.gz" -mtime +"$LOCAL_RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name "*.partial" -delete

# Metric cho Prometheus (alert DatabaseBackupMissing nếu > 26h không có backup thành công)
if [ -d "$TEXTFILE_DIR" ] && [ -w "$TEXTFILE_DIR" ]; then
  cat > "$TEXTFILE_DIR/homeshop_backup.prom.$$" <<EOF
# HELP homeshop_backup_last_success_timestamp_seconds Unix time of the last successful DB backup
# TYPE homeshop_backup_last_success_timestamp_seconds gauge
homeshop_backup_last_success_timestamp_seconds $(date +%s)
# HELP homeshop_backup_last_size_bytes Size of the last DB backup
# TYPE homeshop_backup_last_size_bytes gauge
homeshop_backup_last_size_bytes $SIZE_BYTES
# HELP homeshop_backup_last_duration_seconds Duration of the last pg_dump
# TYPE homeshop_backup_last_duration_seconds gauge
homeshop_backup_last_duration_seconds $DUMP_SECONDS
EOF
  mv "$TEXTFILE_DIR/homeshop_backup.prom.$$" "$TEXTFILE_DIR/homeshop_backup.prom"
fi

if [ "${BACKUP_NOTIFY_SUCCESS:-0}" = "1" ]; then
  notify "🟢 Backup database thành công" "File: \`$FILE_NAME\` ($(numfmt --to=iec "$SIZE_BYTES"))
S3: \`s3://$S3_BUCKET/$S3_KEY\`" 3066993
fi

log "Backup completed"
