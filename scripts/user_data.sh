#!/bin/bash
# shellcheck disable=SC2154  # project_dir, s3_bucket, aws_region, swap_size_gb do Terraform templatefile() render
# ============================================================
# EC2 bootstrap - Home Shopping App (Ubuntu 22.04)
# Được Terraform render qua templatefile(): các biến dạng ${project_dir},
# ${s3_bucket}, ${aws_region}, ${swap_size_gb} được thay khi apply.
# Log: /var/log/user-data.log
# ============================================================
set -Eeuo pipefail
exec > >(tee -a /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

PROJECT_DIR="${project_dir}"
S3_BUCKET="${s3_bucket}"
AWS_REGION="${aws_region}"
SWAP_SIZE_GB="${swap_size_gb}"
APP_USER="ubuntu"
MARKER="/var/lib/homeshop/bootstrap.done"
export DEBIAN_FRONTEND=noninteractive

trap 'echo "[user-data] FAILED at line $LINENO (exit $?)"' ERR

log() { echo "[user-data] $(date -Is) $*"; }

if [ -f "$MARKER" ]; then
  log "Bootstrap already completed, skipping"
  exit 0
fi

# ------------------------------------------------------------
# 1. Timezone (cron backup chạy 2h sáng giờ Việt Nam)
# ------------------------------------------------------------
timedatectl set-timezone Asia/Ho_Chi_Minh

# ------------------------------------------------------------
# 2. Swap memory - chống OOM/treo máy khi build/deploy (t3.medium chỉ 4 GB RAM)
# ------------------------------------------------------------
if ! swapon --show | grep -q '/swapfile'; then
  log "Creating $SWAP_SIZE_GB GB swap"
  fallocate -l "$SWAP_SIZE_GB"G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_SIZE_GB * 1024)) status=none
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ------------------------------------------------------------
# 3. Gói hệ thống + vá bảo mật
# ------------------------------------------------------------
apt_retry() {
  for i in 1 2 3 4 5; do
    if apt-get -o DPkg::Lock::Timeout=120 "$@"; then return 0; fi
    log "apt-get $* failed (attempt $i), retrying..."
    sleep $((i * 10))
  done
  return 1
}

apt_retry update -y
apt_retry -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade
apt_retry install -y --no-install-recommends \
  ca-certificates curl gnupg lsb-release jq unzip git rsync gettext-base \
  ufw fail2ban unattended-upgrades apt-listchanges \
  htop iotop sysstat logrotate

# ------------------------------------------------------------
# 4. Docker Engine + Docker Compose plugin (repo chính thức của Docker)
# ------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  # shellcheck source=/dev/null
  CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt_retry update -y
  apt_retry install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true,
  "default-ulimits": { "nofile": { "Name": "nofile", "Soft": 65535, "Hard": 65535 } },
  "features": { "buildkit": true }
}
JSON
systemctl enable docker containerd
systemctl restart docker
usermod -aG docker "$APP_USER"
docker compose version

# ------------------------------------------------------------
# 5. AWS CLI v2 (dùng IAM Instance Profile, không có access key trên máy)
# ------------------------------------------------------------
if ! command -v aws >/dev/null 2>&1; then
  log "Installing AWS CLI v2"
  TMP_DIR="$(mktemp -d)"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "$TMP_DIR/awscliv2.zip"
  unzip -q "$TMP_DIR/awscliv2.zip" -d "$TMP_DIR"
  "$TMP_DIR/aws/install" --update
  rm -rf "$TMP_DIR"
fi

# ------------------------------------------------------------
# 6. Kernel tuning (sysctl) cho web server tải cao
# ------------------------------------------------------------
cat > /etc/sysctl.d/99-homeshop.conf <<'SYSCTL'
# --- Memory ---
vm.swappiness = 10
vm.vfs_cache_pressure = 50
# Redis khuyến nghị để BGSAVE/AOF rewrite không fail khi fork
vm.overcommit_memory = 1

# --- File descriptors ---
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288

# --- Network performance ---
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 16384
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.ip_local_port_range = 10240 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_mtu_probing = 1
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr

# --- Network security ---
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_synack_retries = 2
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.conf.all.log_martians = 1
# Docker cần ip_forward để NAT cho container
net.ipv4.ip_forward = 1
SYSCTL
modprobe tcp_bbr || true
sysctl --system >/dev/null

# Tắt Transparent Huge Pages (khuyến nghị của Redis & PostgreSQL)
cat > /etc/systemd/system/disable-thp.service <<'UNIT'
[Unit]
Description=Disable Transparent Huge Pages
Before=docker.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'echo never > /sys/kernel/mm/transparent_hugepage/enabled; echo never > /sys/kernel/mm/transparent_hugepage/defrag'

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now disable-thp.service

# ------------------------------------------------------------
# 7. Firewall UFW (lớp 2, sau AWS Security Group)
# ------------------------------------------------------------
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp comment 'SSH (rate limited)'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 3001/tcp comment 'Grafana (SG restricts source IP)'
ufw --force enable

# ------------------------------------------------------------
# 8. SSH hardening + Fail2ban
# ------------------------------------------------------------
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'SSHD'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowAgentForwarding no
SSHD
sshd -t && systemctl reload ssh

cat > /etc/fail2ban/jail.d/sshd.local <<'F2B'
[sshd]
enabled  = true
port     = 22
maxretry = 5
findtime = 10m
bantime  = 1h
F2B
systemctl enable --now fail2ban
systemctl restart fail2ban

# Tự động cài bản vá bảo mật
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
APT
systemctl enable --now unattended-upgrades

# ------------------------------------------------------------
# 9. Thư mục dự án + cấu hình hạ tầng cho script backup/deploy
# ------------------------------------------------------------
mkdir -p "$PROJECT_DIR" "$PROJECT_DIR/backups" "$PROJECT_DIR/.deploy" /var/lib/homeshop
# Thư mục textfile collector của node-exporter: script backup ghi metric thời điểm backup thành công
install -d -m 755 -o "$APP_USER" -g "$APP_USER" /var/lib/node_exporter/textfile
cat > "$PROJECT_DIR/.infra.env" <<EOF
S3_BUCKET=$S3_BUCKET
AWS_REGION=$AWS_REGION
AWS_DEFAULT_REGION=$AWS_REGION
EOF
chown -R "$APP_USER:$APP_USER" "$PROJECT_DIR"
chmod 750 "$PROJECT_DIR"

# ------------------------------------------------------------
# 10. Cronjob backup DB lúc 02:00 hằng ngày + logrotate
# ------------------------------------------------------------
touch /var/log/homeshop-backup.log
chown "$APP_USER:$APP_USER" /var/log/homeshop-backup.log
cat > /etc/cron.d/homeshop-backup <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 2 * * * $APP_USER $PROJECT_DIR/scripts/backup-db.sh >> /var/log/homeshop-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/homeshop-backup

cat > /etc/logrotate.d/homeshop <<'ROTATE'
/var/log/homeshop-*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    copytruncate
}
ROTATE

touch "$MARKER"
log "Bootstrap completed successfully"
