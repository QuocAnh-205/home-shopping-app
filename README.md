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
| **131 sản phẩm / 7 danh mục**, ảnh chụp thật khớp từng sản phẩm, tìm kiếm (pg_trgm), lọc **đang giảm giá**, sắp xếp mới nhất / **bán chạy** / **đánh giá cao** / giá / tên | **Dashboard**: doanh thu, doanh thu 7 ngày, đơn theo trạng thái, top bán chạy, sắp hết hàng |
| Trang chi tiết: giá gốc gạch ngang & **% giảm**, điểm đánh giá, **số đã bán**, điểm nổi bật, **mô tả chi tiết**, **thông số kỹ thuật**, hướng dẫn sử dụng & bảo quản, chính sách, sản phẩm cùng danh mục | **Quản lý đơn**: lọc trạng thái, chuyển trạng thái theo state machine, hủy đơn hoàn kho |
| Trang chủ: **Ưu đãi hấp dẫn** (giảm sâu nhất), **Bán chạy nhất** (xếp hạng theo số bán thật), **Khách hàng nói gì** (đánh giá mới nhất) | **Quản lý sản phẩm**: tạo mới (bắt buộc ảnh, giá gốc/khuyến mãi, điểm nổi bật), sửa tồn kho, bật/tắt "Hot" |
| **Đánh giá sản phẩm**: mọi khách đã đăng nhập đều viết được, 1 đánh giá/sản phẩm (sửa/xóa được), lọc theo số sao, nhãn **"Đã mua hàng"** | **Kiểm duyệt đánh giá**: xem & gỡ đánh giá vi phạm |
| Giỏ hàng Redis (ảnh thumbnail, tăng/giảm), đặt hàng COD **idempotent**, chống oversell, lịch sử đơn + timeline, tự hủy đơn | Upload ảnh: S3 (production) hoặc lưu đĩa (local) – kiểm tra magic bytes |
| **Đăng ký / đăng nhập email**, **Google**, **Facebook** (OAuth 2.0 + PKCE), **quên mật khẩu qua email**, đổi/đặt mật khẩu, liên kết tài khoản mạng xã hội, đăng xuất thu hồi token, khóa khi sai 5 lần | Swagger UI `/api/docs`, metrics nghiệp vụ + alert brute-force / tỷ lệ đặt hàng lỗi |

**Giao diện:** bố cục bento, ảnh thật cho mọi sản phẩm (không dùng icon thay ảnh), icon Font Awesome 7, font Be Vietnam Pro tự host, **chế độ sáng/tối**, thanh điều hướng đáy trên mobile, footer có đăng ký nhận bản tin, skeleton loading, tôn trọng `prefers-reduced-motion`.

## 1. Chạy demo local (1 lệnh)

Yêu cầu: Docker Desktop.

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Backend tự chạy migration + seed: **131 sản phẩm, 7 danh mục, 5 tài khoản demo, ~225 đánh giá mẫu**. Mở http://localhost

> Cổng 80 đã bị chiếm? Chạy `LOCAL_HTTP_PORT=8088 docker compose -f docker-compose.local.yml up -d --build` (PowerShell: `$env:LOCAL_HTTP_PORT=8088; docker compose ...`) rồi mở http://localhost:8088

### Tài khoản test (chỉ môi trường local – production không seed tài khoản)

| Vai trò | Email | Mật khẩu | Dùng để kiểm tra |
|---|---|---|---|
| **Quản trị viên** | `admin@homeshop.local` | `Admin12345` | `/admin`: dashboard, đơn hàng, sản phẩm, kiểm duyệt đánh giá |
| Khách hàng | `khach@homeshop.local` | `Khach12345` | Giỏ hàng, đặt hàng, đánh giá, tài khoản |
| Khách hàng | `lan.nguyen@homeshop.local` | `Khach12345` | Mỗi khách chỉ thấy **giỏ hàng / đơn hàng / đánh giá của riêng mình** |
| Khách hàng | `minh.tran@homeshop.local` | `Khach12345` | Thử đặt đơn ở 2 tài khoản rồi đối chiếu trang "Đơn hàng" |
| Khách hàng | `huong.le@homeshop.local` | `Khach12345` | Khách vào `/admin` → bị chặn 403 |

**Kịch bản kiểm tra phân quyền gợi ý:** đăng nhập `lan.nguyen` → thêm giỏ & đặt hàng → đăng xuất → đăng nhập `minh.tran`: giỏ hàng trống, không thấy đơn của Lan; truy cập trực tiếp `/orders/<id đơn của Lan>` → "không tìm thấy". Đăng nhập `admin` → thấy đơn của Lan ở tab Đơn hàng.

**Quên mật khẩu:** mọi email (đặt lại mật khẩu, chào mừng bản tin) được **Mailpit** bắt lại tại http://localhost:8025 → mở thư, bấm "Đặt lại mật khẩu".

Kiểm tra: `/api/health` · Swagger: `/api/docs` · `/api/metrics` bị Nginx chặn (404) từ bên ngoài.

### Bật đăng nhập Google / Facebook

Nút Google/Facebook tự hiện khi có khóa ứng dụng (không cấu hình → nút mờ kèm giải thích, các tính năng khác vẫn chạy).

1. **Google** – [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → *Create credentials* → *OAuth client ID* → *Web application*
   → *Authorized redirect URI*: `http://localhost:8088/api/auth/oauth/google/callback` (production: `https://<domain>/api/auth/oauth/google/callback`).
2. **Facebook** – [Meta for Developers](https://developers.facebook.com/apps) → tạo app *Consumer* → thêm sản phẩm *Facebook Login*
   → *Valid OAuth Redirect URIs*: `http://localhost:8088/api/auth/oauth/facebook/callback`. Quyền cần: `email`, `public_profile`.
3. Chạy lại stack kèm biến môi trường:

```powershell
$env:LOCAL_HTTP_PORT=8088
$env:GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"; $env:GOOGLE_CLIENT_SECRET="..."
$env:FACEBOOK_APP_ID="..."; $env:FACEBOOK_APP_SECRET="..."
docker compose -f docker-compose.local.yml up -d backend
```

Production: thêm các biến trên (và `APP_URL`, `SMTP_URL`) vào secret `PROD_ENV_FILE`. Email trùng với tài khoản có sẵn (đã xác minh bởi Google/Facebook) sẽ được **liên kết** thay vì tạo tài khoản trùng; người dùng cũng có thể liên kết thêm ở trang **Tài khoản**.

### Chạy test

```bash
cd backend && npm ci && npx prisma generate
npm test                     # 77 unit test (Jest)
npm run test:cov             # kèm coverage
# 26 E2E test cần Postgres + Redis (ví dụ container tạm):
DATABASE_URL=postgresql://... REDIS_URL=redis://... JWT_SECRET=<32+ ký tự> npx prisma migrate deploy
DATABASE_URL=... REDIS_URL=... JWT_SECRET=... npm run test:e2e
cd ../frontend && npm ci && npm run lint && npm run typecheck && npm run build
```

Ảnh sản phẩm được tải sẵn trong repo; tải lại từ Unsplash theo catalog: `node scripts/fetch-product-images.mjs`.

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
