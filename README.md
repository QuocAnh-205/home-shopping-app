# 🏠 Home Shopping App: DevOps Final Project

Hệ thống e-commerce đồ gia dụng triển khai trên AWS theo chuẩn production: **IaC 100% Terraform**, **CI/CD DevSecOps** (Gitleaks · SonarCloud · Trivy), **zero-downtime deploy + auto-rollback**, **observability đầy đủ** (Prometheus · Grafana · Loki · Alertmanager → Discord/Telegram) và **backup tự động lên S3**.

| Thành phần | Công nghệ |
|---|---|
| Frontend | Next.js 15 (App Router, standalone), port 3000 |
| Backend | NestJS 10 + Prisma 5, port 8080, `/api/health`, `/api/metrics` |
| Data | PostgreSQL 16 (orders, products, users) · Redis 7 (cart, session, hot-product cache) |
| Edge | Nginx 1.28: Let's Encrypt TLS, HTTP→HTTPS, rate limiting, gzip, static cache |
| Cloud/IaC | AWS VPC, EC2 t3.medium Ubuntu 22.04, EIP, EBS gp3 encrypted, S3, IAM, OIDC (Terraform) |
| CI/CD | GitHub Actions: Gitleaks, Jest, SonarCloud, Trivy, Docker Hub, SSH deploy, rollback, notify |
| Observability | Prometheus, Grafana, Node Exporter, cAdvisor, Postgres/Redis exporter, Loki, Promtail, Alertmanager |

📐 Sơ đồ kiến trúc, luồng CI/CD (Mermaid) và cây thư mục: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
🎓 Câu hỏi bảo vệ & cách trả lời: [docs/DEFENSE-QA.md](docs/DEFENSE-QA.md)

---

## Tính năng

| Khách hàng | Quản trị viên |
|---|---|
| Duyệt sản phẩm theo danh mục, **tìm kiếm** (pg_trgm), **sắp xếp** giá/tên, phân trang | **Dashboard**: doanh thu, doanh thu 7 ngày, đơn theo trạng thái, top bán chạy, sắp hết hàng |
| Giỏ hàng trên Redis: thêm, **tăng/giảm số lượng**, xóa, badge số lượng trên header | **Quản lý đơn**: lọc theo trạng thái, chuyển trạng thái theo state machine, hủy đơn hoàn kho |
| Đặt hàng COD **idempotent**, chống oversell khi mua đồng thời | **Quản lý sản phẩm**: tạo mới (tự sinh slug), sửa tồn kho, bật/tắt "bán chạy", upload ảnh S3 |
| **Lịch sử đơn hàng**, chi tiết + timeline, **tự hủy đơn** khi còn chờ xác nhận | Swagger UI tại `/api/docs` (bật bằng `SWAGGER_ENABLED`) |
| Đăng ký/đăng nhập, **đăng xuất thu hồi token**, khóa tài khoản khi sai mật khẩu 5 lần | Metrics nghiệp vụ + alert brute-force, tỷ lệ đặt hàng lỗi |

## 1. Chạy demo local (1 lệnh)

Yêu cầu: Docker Desktop.

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Backend tự chạy migration + seed dữ liệu mẫu (16 sản phẩm, 5 danh mục). Mở http://localhost

> Cổng 80 đã bị chiếm? Chạy `LOCAL_HTTP_PORT=8088 docker compose -f docker-compose.local.yml up -d --build` (PowerShell: `$env:LOCAL_HTTP_PORT=8088; docker compose ...`) rồi mở http://localhost:8088

| Tài khoản demo (chỉ môi trường local) | Email | Mật khẩu |
|---|---|---|
| Quản trị viên → `/admin` | `admin@homeshop.local` | `Admin12345` |
| Khách hàng | `khach@homeshop.local` | `Khach12345` |

Kiểm tra: `/api/health` · Swagger: `/api/docs` · `/api/metrics` bị Nginx chặn (404) từ bên ngoài.

### Chạy test

```bash
cd backend && npm ci && npx prisma generate
npm test                     # unit test (Jest)
npm run test:cov             # kèm coverage
# E2E cần Postgres + Redis (ví dụ dùng chính stack local hoặc container tạm):
DATABASE_URL=postgresql://... REDIS_URL=redis://... JWT_SECRET=<32+ ký tự> npx prisma migrate deploy
DATABASE_URL=... REDIS_URL=... JWT_SECRET=... npm run test:e2e
cd ../frontend && npm ci && npm run lint && npm run typecheck && npm run build
```

## 2. Triển khai production lên AWS

### 2.1. Chuẩn bị
1. Tài khoản AWS + AWS CLI đã `aws configure` (chỉ dùng trên máy cá nhân để chạy Terraform).
2. Tạo SSH key: `ssh-keygen -t ed25519 -f ~/.ssh/homeshop_ed25519 -C homeshop-deployer`
3. Domain (ví dụ `shop.example.com`), tài khoản Docker Hub, SonarCloud, Discord webhook, (tùy chọn) Telegram bot.

### 2.2. Dựng hạ tầng bằng Terraform
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # điền IP /32, public key, github_repository
terraform init
terraform plan -out=tfplan
terraform apply tfplan
terraform output
```
Trỏ **DNS A record** của domain về `elastic_ip`. EC2 tự bootstrap (swap, Docker, sysctl, UFW, fail2ban, cron backup) trong khoảng 3-5 phút, theo dõi bằng `ssh ... 'tail -f /var/log/user-data.log'`.

### 2.3. Cấu hình GitHub (Settings → Secrets and variables → Actions)

**Variables**

| Tên | Giá trị |
|---|---|
| `DOCKERHUB_USERNAME` | username Docker Hub |
| `SONAR_ORGANIZATION` / `SONAR_PROJECT_KEY` | từ SonarCloud |
| `AWS_REGION` | `ap-southeast-1` |
| `EC2_HOST` | `terraform output -raw elastic_ip` |
| `APP_URL` | `https://shop.example.com` |

**Secrets**

| Tên | Giá trị |
|---|---|
| `DOCKERHUB_TOKEN` | Docker Hub access token (Read/Write) |
| `SONAR_TOKEN` | SonarCloud token |
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |
| `AWS_SECURITY_GROUP_ID` | `terraform output -raw security_group_id` |
| `EC2_SSH_PRIVATE_KEY` | nội dung `~/.ssh/homeshop_ed25519` |
| `EC2_SSH_KNOWN_HOSTS` | (khuyến nghị) `ssh-keyscan <EIP>` để pin host key |
| `PROD_ENV_FILE` | toàn bộ nội dung `.env` production (mẫu: [.env.example](.env.example)) |
| `DISCORD_WEBHOOK_URL` | webhook Discord |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | (tùy chọn) |

Tạo **Environment `production`** (Settings → Environments) và bật *Required reviewers* để có bước duyệt thủ công trước khi deploy.

### 2.4. Deploy
```bash
git push origin main
```
Pipeline chạy: **(Security & Quality ‖ Integration Test ‖ IaC Scan) → Build/Scan/Push → Deploy (migrate, rolling update, health check 30s, auto-rollback) → Notify**. Pull request chỉ chạy 3 job kiểm tra đầu (không build/deploy). SonarCloud tự bỏ qua (kèm warning) nếu chưa cấu hình `SONAR_TOKEN`. Lần deploy đầu tự cấp chứng chỉ Let's Encrypt (`scripts/init-letsencrypt.sh`).

Nạp dữ liệu mẫu lần đầu (trên EC2):
```bash
cd /opt/homeshop && docker compose -p homeshop -f docker-compose.prod.yml --env-file .infra.env --env-file .env --env-file .deploy/image.env exec backend node prisma/seed.js
```

## 3. Vận hành

| Việc | Lệnh (trên EC2, trong `/opt/homeshop`) |
|---|---|
| Xem trạng thái | `docker compose -p homeshop -f docker-compose.prod.yml ps` |
| Grafana | `http://<EIP>:3001` (chỉ IP trong `grafana_allowed_cidrs`) |
| Prometheus / Alertmanager | `ssh -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 ubuntu@<EIP>` |
| Backup thủ công | `bash scripts/backup-db.sh` |
| Cronjob backup 02:00 | đã cài tại `/etc/cron.d/homeshop-backup`; cài tay: `(crontab -l; echo "0 2 * * * /opt/homeshop/scripts/backup-db.sh >> /var/log/homeshop-backup.log 2>&1") \| crontab -` |
| Liệt kê backup | `bash scripts/restore-db.sh --list` |
| Restore DR | `bash scripts/restore-db.sh` (bản mới nhất) |
| Rollback thủ công | `bash scripts/deploy.sh $(cat .deploy/previous_tag)` |
| Log deploy | `ls .deploy/deploy-*.log` |

### Truy vấn Loki hữu ích (Grafana → Explore)
```text
{service="backend", event="order.failed"}
{service="backend", level="error"} | json
{service="nginx", flow="checkout", status_class="5xx"}
{service="nginx"} | json | request_time > 1
```

## 4. Hủy hạ tầng (tránh phát sinh chi phí sau khi chấm)
```bash
cd terraform && terraform destroy
```
S3 bucket có `force_destroy = false` để bảo vệ backup: xóa object trong bucket trước nếu muốn destroy toàn bộ.
