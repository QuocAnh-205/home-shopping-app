#!/usr/bin/env bash
# Render monitoring/alertmanager/alertmanager.yml từ template + secret trong .env
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$APP_DIR/monitoring/alertmanager/alertmanager.yml.tmpl"
OUTPUT="$APP_DIR/monitoring/alertmanager/alertmanager.yml"

set -a
# shellcheck disable=SC1091
. "$APP_DIR/.env"
set +a

: "${DISCORD_WEBHOOK_URL:?DISCORD_WEBHOOK_URL is required in .env}"
[[ "$DISCORD_WEBHOOK_URL" =~ ^https://(discord\.com|discordapp\.com)/api/webhooks/ ]] \
  || { echo "DISCORD_WEBHOOK_URL is not a Discord webhook URL" >&2; exit 1; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  [[ "$TELEGRAM_CHAT_ID" =~ ^-?[0-9]+$ ]] || { echo "TELEGRAM_CHAT_ID must be numeric" >&2; exit 1; }
  sed -e '/#TELEGRAM_START/d' -e '/#TELEGRAM_END/d' "$TEMPLATE" > "$TMP"
else
  echo "Telegram not configured → Discord only"
  sed -e '/#TELEGRAM_START/,/#TELEGRAM_END/d' "$TEMPLATE" > "$TMP"
fi

# Chỉ thay đúng 3 biến, giữ nguyên cú pháp Go template {{ }} của Alertmanager
export DISCORD_WEBHOOK_URL TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}" TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
# shellcheck disable=SC2016
envsubst '${DISCORD_WEBHOOK_URL} ${TELEGRAM_BOT_TOKEN} ${TELEGRAM_CHAT_ID}' < "$TMP" > "$OUTPUT"
chmod 640 "$OUTPUT"

# Validate trước khi Alertmanager load
docker run --rm -v "$OUTPUT:/tmp/alertmanager.yml:ro" --entrypoint amtool prom/alertmanager:v0.27.0 \
  check-config /tmp/alertmanager.yml >/dev/null
echo "Rendered and validated $OUTPUT"

# Nếu Alertmanager đang chạy → hot reload
if docker ps --format '{{.Names}}' | grep -qx monitoring-alertmanager; then
  docker exec monitoring-alertmanager wget -q -O- --post-data='' http://127.0.0.1:9093/-/reload >/dev/null || true
fi
