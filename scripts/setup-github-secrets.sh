#!/usr/bin/env bash
# Nạp toàn bộ biến/secret mà pipeline Production CI/CD cần vào GitHub Actions (chạy 1 lần trên máy cá nhân).
#
# Cách dùng (Git Bash):
#   DOCKERHUB_USERNAME=<user> DOCKERHUB_TOKEN=<token> bash scripts/setup-github-secrets.sh
#
# Đọc file bí mật tại máy (không bao giờ commit):
#   ~/.ssh/homeshop_ed25519      → EC2_SSH_PRIVATE_KEY
#   ~/.homeshop/known_hosts      → EC2_SSH_KNOWN_HOSTS
#   ~/.homeshop/prod.env         → PROD_ENV_FILE
# Có thể đổi đường dẫn bằng biến SSH_KEY_FILE, KNOWN_HOSTS_FILE, PROD_ENV_PATH.
set -euo pipefail

SSH_KEY_FILE="${SSH_KEY_FILE:-$HOME/.ssh/homeshop_ed25519}"
KNOWN_HOSTS_FILE="${KNOWN_HOSTS_FILE:-$HOME/.homeshop/known_hosts}"
PROD_ENV_PATH="${PROD_ENV_PATH:-$HOME/.homeshop/prod.env}"

die() { echo "❌ $*" >&2; exit 1; }

command -v gh >/dev/null || die "Cần GitHub CLI (gh)"
gh auth status >/dev/null 2>&1 || die "Chưa đăng nhập gh → chạy: gh auth login"
: "${DOCKERHUB_USERNAME:?Đặt DOCKERHUB_USERNAME=<username Docker Hub>}"
: "${DOCKERHUB_TOKEN:?Đặt DOCKERHUB_TOKEN=<access token Read & Write từ hub.docker.com → Account settings → Personal access tokens>}"
for f in "$SSH_KEY_FILE" "$KNOWN_HOSTS_FILE" "$PROD_ENV_PATH"; do
  [ -s "$f" ] || die "Không tìm thấy file $f"
done

echo "→ Variable DOCKERHUB_USERNAME"
gh variable set DOCKERHUB_USERNAME --body "$DOCKERHUB_USERNAME"
echo "→ Secret DOCKERHUB_TOKEN"
printf '%s' "$DOCKERHUB_TOKEN" | gh secret set DOCKERHUB_TOKEN
echo "→ Secret EC2_SSH_PRIVATE_KEY"
gh secret set EC2_SSH_PRIVATE_KEY < "$SSH_KEY_FILE"
echo "→ Secret EC2_SSH_KNOWN_HOSTS"
gh secret set EC2_SSH_KNOWN_HOSTS < "$KNOWN_HOSTS_FILE"
echo "→ Secret PROD_ENV_FILE"
gh secret set PROD_ENV_FILE < "$PROD_ENV_PATH"

echo
echo "✅ Xong. Danh sách hiện có:"
gh variable list
gh secret list
echo
echo "Chạy lại pipeline: gh workflow run production-cicd.yml --ref main"
