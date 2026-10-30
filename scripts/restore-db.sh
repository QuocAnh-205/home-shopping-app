#!/usr/bin/env bash
# ============================================================
# Khôi phục PostgreSQL từ bản backup trên S3 (Disaster Recovery)
#   bash scripts/restore-db.sh                 # bản mới nhất
#   bash scripts/restore-db.sh <s3_key>        # bản chỉ định
#   bash scripts/restore-db.sh --list          # liệt kê 20 bản gần nhất
# Thêm --yes để bỏ qua bước xác nhận (dùng trong diễn tập DR tự động).
# ============================================================
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
# shellcheck disable=SC1091
[ -f "$APP_DIR/.infra.env" ] && . "$APP_DIR/.infra.env"
# shellcheck disable=SC1091
. "$APP_DIR/.env"
set +a
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
PG_CONTAINER="homeshop-postgres"
PREFIX="backups/postgres/"

ASSUME_YES=0
KEY=""
for arg in "$@"; do
  case "$arg" in
    --yes) ASSUME_YES=1 ;;
    --list)
      aws s3api list-objects-v2 --region "$AWS_REGION" --bucket "$S3_BUCKET" --prefix "$PREFIX" \
        --query 'reverse(sort_by(Contents,&LastModified))[:20].[LastModified,Size,Key]' --output table
      exit 0 ;;
    *) KEY="$arg" ;;
  esac
done

if [ -z "$KEY" ]; then
  KEY="$(aws s3api list-objects-v2 --region "$AWS_REGION" --bucket "$S3_BUCKET" --prefix "$PREFIX" \
    --query 'sort_by(Contents,&LastModified)[-1].Key' --output text)"
  [ "$KEY" != "None" ] && [ -n "$KEY" ] || { echo "No backup found in s3://$S3_BUCKET/$PREFIX" >&2; exit 1; }
fi

echo "Restore source : s3://$S3_BUCKET/$KEY"
echo "Target database: $POSTGRES_DB (container $PG_CONTAINER)"
if [ "$ASSUME_YES" != 1 ]; then
  read -r -p "Dữ liệu hiện tại sẽ bị GHI ĐÈ. Gõ tên database để xác nhận: " CONFIRM
  [ "$CONFIRM" = "$POSTGRES_DB" ] || { echo "Aborted"; exit 1; }
fi

TMP="$(mktemp --suffix=.sql.gz)"
trap 'rm -f "$TMP"' EXIT

aws s3 cp "s3://$S3_BUCKET/$KEY" "$TMP" --region "$AWS_REGION" --only-show-errors
EXPECTED="$(aws s3api head-object --region "$AWS_REGION" --bucket "$S3_BUCKET" --key "$KEY" --query 'Metadata.sha256' --output text)"
ACTUAL="$(sha256sum "$TMP" | awk '{print $1}')"
if [ "$EXPECTED" != "None" ] && [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "Checksum mismatch (expected $EXPECTED, got $ACTUAL)" >&2
  exit 1
fi
gzip -t "$TMP"

# Backup an toàn trạng thái hiện tại trước khi ghi đè
SAFETY="$APP_DIR/backups/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"
docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges | gzip > "$SAFETY"
echo "Safety snapshot: $SAFETY"

# Dừng backend để không có ghi mới trong lúc restore
docker compose -p homeshop -f "$APP_DIR/docker-compose.prod.yml" --env-file "$APP_DIR/.infra.env" --env-file "$APP_DIR/.env" stop backend || true

gunzip -c "$TMP" | docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 --single-transaction -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "Database restored from $KEY"

docker compose -p homeshop -f "$APP_DIR/docker-compose.prod.yml" --env-file "$APP_DIR/.infra.env" --env-file "$APP_DIR/.env" start backend
echo "Backend restarted. Verify: curl -sk https://127.0.0.1/api/health"
