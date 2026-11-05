# 🏠 Home Shopping App: DevOps Final Project

> **Sinh viên:** Nguyễn Quốc Anh · **Repo:** [QuocAnh-205/home-shopping-app](https://github.com/QuocAnh-205/home-shopping-app)
> **Bản production đang chạy:** **https://13-214-14-196.sslip.io** (AWS EC2 Singapore, HTTPS Let's Encrypt)

Hệ thống e-commerce đồ gia dụng triển khai trên AWS theo chuẩn production: **IaC 100% Terraform**, **CI/CD DevSecOps** (Gitleaks · SonarCloud · Trivy · Hadolint · ShellCheck), **zero-downtime deploy + auto-rollback**, **observability đầy đủ** (Prometheus · Grafana · Loki · Alertmanager → Discord/Telegram) và **backup tự động lên S3**.

| Thành phần | Công nghệ |
|---|---|
| Frontend | Next.js 15.5 + React 19 (App Router, standalone), Font Awesome 7, font Be Vietnam Pro, port 3000 |
| Backend | NestJS 10 + Prisma 5.22, port 8080, `/api/health`, `/api/metrics`, Swagger `/api/docs` |
| Data | PostgreSQL 16 (pg_trgm) · Redis 7 (giỏ hàng, cache, thu hồi token, chống brute-force) · S3 (ảnh upload, backup) |
| Edge | Nginx 1.28: Let's Encrypt TLS, HTTP→HTTPS, rate limiting, CSP, gzip, cache tĩnh |
| Cloud/IaC | AWS VPC riêng, EC2 t3.small Ubuntu 22.04, Elastic IP, EBS gp3 mã hóa, S3, IAM role, GitHub OIDC (Terraform) |
| CI/CD | GitHub Actions: Gitleaks, Jest (unit + e2e trên Postgres/Redis thật), ESLint, npm audit, SonarCloud, Hadolint, Trivy, Terraform validate, ShellCheck, Docker Hub, SSH deploy, rollback, notify |
| Observability | Prometheus, Grafana, Node Exporter, cAdvisor, Postgres/Redis exporter, Loki, Promtail, Alertmanager |
| Email | Nodemailer: Mailpit khi chạy local, SMTP (Amazon SES…) khi chạy production |

📐 Sơ đồ kiến trúc, luồng CI/CD (Mermaid) và cây thư mục: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
🎓 Câu hỏi bảo vệ & cách trả lời: [docs/DEFENSE-QA.md](docs/DEFENSE-QA.md)

**Mục lục:** [Tính năng](#tính-năng) · [Dữ liệu lưu ở đâu](#dữ-liệu-được-lưu-ở-đâu) · [1. Chạy local](#1-chạy-demo-local-1-lệnh) · [2. Production trên AWS](#2-triển-khai-production-lên-aws) · [3. Vận hành](#3-vận-hành) · [4. Nhật ký cập nhật](#4-nhật-ký-cập-nhật) · [5. Hủy hạ tầng](#5-hủy-hạ-tầng-tránh-phát-sinh-chi-phí-sau-khi-chấm)

---

## Tính năng

| Khách hàng | Quản trị viên (`/admin`) |
|---|---|
| **200 sản phẩm / 7 danh mục**, ảnh chụp thật khớp từng sản phẩm, tìm kiếm (pg_trgm), lọc **đang giảm giá** & **theo mức giá**, sắp xếp mới nhất / **bán chạy** / **đánh giá cao** / giá / tên | **Dashboard**: doanh thu hôm nay / 30 ngày (so với kỳ trước), biểu đồ doanh thu 30 ngày (tooltip + xem dạng bảng), cơ cấu đơn theo trạng thái, doanh thu theo danh mục, top bán chạy, đơn gần đây, thống kê đánh giá, sắp hết hàng |
| **Trang chủ**: bento hero, **Mua theo không gian**, **Mua theo mức giá**, **Ưu đãi hấp dẫn**, **Bộ sưu tập**, **Bán chạy nhất**, dải **con số thật của cửa hàng**, **Hàng mới về**, **Đánh giá cao nhất**, **Mua sắm trong 4 bước**, tất cả sản phẩm, **Khách hàng nói gì** (mỗi đánh giá 1 hàng), **Câu hỏi thường gặp** | **Quản lý đơn**: lọc trạng thái, chuyển trạng thái theo state machine, hủy đơn hoàn kho |
| **Trang chi tiết**: giá gốc gạch ngang & **% giảm**, điểm đánh giá, **số đã bán**, điểm nổi bật, mô tả chi tiết, **thông số kỹ thuật**, hướng dẫn sử dụng & bảo quản, chính sách, sản phẩm cùng danh mục | **Quản lý sản phẩm**: tạo mới (bắt buộc ảnh, giá gốc/khuyến mãi, điểm nổi bật), sửa tồn kho, bật/tắt "Hot" |
| **Đánh giá sản phẩm**: mọi khách đã đăng nhập đều viết được, 1 đánh giá/sản phẩm (sửa/xóa được), lọc theo số sao, nhãn **"Đã mua hàng"**; mọi sản phẩm có sẵn 3–6 đánh giá | **Kiểm duyệt đánh giá**: xem & gỡ đánh giá vi phạm |
| **Tài khoản của tôi** (bố cục kiểu Shopee): menu trái; **Hồ sơ** (tên, email che bớt, SĐT, giới tính, ngày sinh), **ảnh đại diện ≤ 1 MB**; **Địa chỉ** (tối đa 10, đúng 1 mặc định, Nhà riêng/Văn phòng); **Đổi mật khẩu**; **Liên kết Google/Facebook**; Đơn mua | Upload ảnh: S3 (production) hoặc lưu đĩa (local), kiểm tra magic bytes |
| **Giỏ hàng** Redis (ảnh, tăng/giảm), **tự điền địa chỉ mặc định** từ sổ địa chỉ, đặt hàng COD **idempotent**, chống oversell, lịch sử đơn + timeline, tự hủy đơn | Swagger UI `/api/docs`, metrics nghiệp vụ + cảnh báo brute-force / tỷ lệ đặt hàng lỗi |
| **Đăng ký / đăng nhập email**, **Google**, **Facebook** (OAuth 2.0 + PKCE), **quên mật khẩu qua email**, đăng xuất thu hồi token, khóa 15 phút khi sai 5 lần | |

**Giao diện:** thiết kế 2026, ảnh thật cho mọi sản phẩm (**không dùng icon thay ảnh**), **chế độ sáng/tối**, thanh điều hướng đáy trên mobile, footer có đăng ký nhận bản tin, skeleton loading, tôn trọng `prefers-reduced-motion`. Footer: *© 2026 Home Shopping App bản quyền của Nguyễn Quốc Anh.*

---

## Dữ liệu được lưu ở đâu?

### A. Dữ liệu nguồn trong repo (sửa ở đây rồi seed lại)

| Dữ liệu | File | Ghi chú |
|---|---|---|
| **Danh mục + 200 sản phẩm** (tên, giá, giá gốc, tồn kho, đã bán, mô tả, điểm nổi bật, thông số, id ảnh) | [`backend/prisma/data/catalog.js`](backend/prisma/data/catalog.js) | Seed **upsert theo slug**: sửa nội dung/giá sẽ được cập nhật; **tồn kho & số đã bán giữ nguyên** (dữ liệu vận hành thật) |
| **Tài khoản demo** (admin + 4 khách, chỉ chạy local) | [`backend/prisma/data/demo-accounts.js`](backend/prisma/data/demo-accounts.js) | Chỉ tạo khi `SEED_DEMO_DATA=true` |
| **Người viết đánh giá mẫu** (20 người, **không đăng nhập được**) + **nội dung đánh giá theo danh mục** | [`backend/prisma/data/reviews.js`](backend/prisma/data/reviews.js) | Mỗi sản phẩm 3–6 đánh giá (1–5 sao) |
| Đoạn giới thiệu theo danh mục, logic seed, 140 đơn hàng lịch sử | [`backend/prisma/seed.js`](backend/prisma/seed.js) | Idempotent: chạy nhiều lần không tạo trùng |
| **Cấu trúc database** (bảng, quan hệ, index) | [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) + [`backend/prisma/migrations/`](backend/prisma/migrations) | 4 migration, kèm CHECK constraint & partial unique index |
| **Ảnh sản phẩm / danh mục / hero** (WebP) | `frontend/public/images/products/<slug>.webp`, `frontend/public/images/site/` | Đóng gói cùng image frontend; nguồn ghi ở [`CREDITS.md`](frontend/public/images/CREDITS.md); tải lại: `node scripts/fetch-product-images.mjs` |

### B. Dữ liệu lúc chạy (người dùng tạo ra)

| Dữ liệu | Nơi lưu | Local (`docker-compose.local.yml`) | Production (EC2) |
|---|---|---|---|
| Người dùng, hồ sơ, **sổ địa chỉ**, sản phẩm, đơn hàng, **đánh giá**, liên kết OAuth, token đặt lại mật khẩu, người đăng ký bản tin | **PostgreSQL**, bảng `users`, `addresses`, `products`, `categories`, `orders`, `order_items`, `reviews`, `oauth_accounts`, `password_reset_tokens`, `newsletter_subscribers` | Docker volume `homeshop-local_pgdata` | Docker volume `homeshop-pgdata` |
| **Giỏ hàng** (`cart:<userId>`, hết hạn 7 ngày), cache sản phẩm (`cache:products:*`), token đã đăng xuất (`auth:revoked:*`), đếm đăng nhập sai (`auth:failed:*`), state OAuth | **Redis** | Trong bộ nhớ container (mất khi xóa container) | Docker volume `homeshop-redisdata` (AOF) |
| **Ảnh đại diện** người dùng, ảnh sản phẩm admin upload | Local: thư mục `/app/uploads` · Production: **S3** prefix `avatars/`, `products/` | Docker volume `homeshop-local_uploads` | Bucket `homeshop-prod-assets-906457821730` |
| **Backup database** (pg_dump nén, mã hóa SSE) | **S3** `backups/postgres/<năm>/<tháng>/` | – | Cron 02:00 hằng ngày, giữ 30 ngày |
| Chứng chỉ HTTPS | Volume `homeshop-letsencrypt` | – | Certbot tự gia hạn |
| Metrics / log / dashboard | Volume `homeshop-monitoring_prometheus-data`, `_loki-data`, `_grafana-data` | – | Prometheus, Loki, Grafana |
| Email (quên mật khẩu, bản tin) | Local: **Mailpit** http://localhost:8025 | Không gửi ra Internet | Qua `SMTP_URL` (chưa cấu hình) |
| Phiên đăng nhập phía trình duyệt | `localStorage` key `hs_session` (JWT) | | |

Xem dữ liệu trực tiếp:
```bash
# Local
docker exec -it homeshop-local-postgres-1 psql -U homeshop -d homeshop -c "select email, full_name, role from users;"
docker exec -it homeshop-local-redis-1 redis-cli --scan --pattern 'cart:*'
# Production (sau khi ssh vào EC2)
docker exec -it homeshop-postgres psql -U homeshop -d homeshop -c "select count(*) from products;"
```

### C. File bí mật (KHÔNG nằm trong Git)

| File | Nội dung |
|---|---|
| `~/.homeshop/prod.env` (máy cá nhân) | Biến môi trường production: mật khẩu DB/Redis, JWT secret, mật khẩu Grafana, **tài khoản admin production** (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) |
| `~/.homeshop/known_hosts` | Host key của EC2 (cho secret `EC2_SSH_KNOWN_HOSTS`) |
| `~/.ssh/homeshop_ed25519` | SSH key đăng nhập EC2 |
| `terraform/terraform.tfvars`, `terraform/terraform.tfstate` | Cấu hình & trạng thái hạ tầng. **Không xóa tfstate**: cần nó để `terraform destroy` |
| `/opt/homeshop/.env` (trên EC2, chmod 600) | Bản `.env` production do pipeline/deploy ghi |

---

## 1. Chạy demo local (1 lệnh)

Yêu cầu: Docker Desktop.

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Backend tự chạy migration + seed: **200 sản phẩm, 7 danh mục, 5 tài khoản demo, ~930 đánh giá mẫu, 140 đơn hàng lịch sử 60 ngày** (để dashboard có số liệu). Mở http://localhost

> Cổng 80 đã bị chiếm (ví dụ bởi dự án khác)? Chạy `LOCAL_HTTP_PORT=8088 docker compose -f docker-compose.local.yml up -d --build` (PowerShell: `$env:LOCAL_HTTP_PORT=8088; docker compose ...`) rồi mở http://localhost:8088

### Tài khoản test (chỉ môi trường local)

> **Sửa tài khoản demo tại một chỗ duy nhất:** [`backend/prisma/data/demo-accounts.js`](backend/prisma/data/demo-accounts.js)
> (email, họ tên, mật khẩu, vai trò). Sau khi sửa: `docker compose -f docker-compose.local.yml up -d --build backend`.
> Đổi email sẽ tạo tài khoản mới; muốn làm sạch DB local: `docker compose -f docker-compose.local.yml down -v` rồi `up` lại.
> Cờ bật dữ liệu demo: `SEED_DEMO_DATA: "true"` trong [`docker-compose.local.yml`](docker-compose.local.yml).

| Vai trò | Email | Mật khẩu | Dùng để kiểm tra |
|---|---|---|---|
| **Quản trị viên** | `admin@homeshop.local` | `Admin12345` | `/admin`: dashboard, đơn hàng, sản phẩm, kiểm duyệt đánh giá |
| Khách hàng | `khach@homeshop.local` | `Khach12345` | Giỏ hàng, đặt hàng, đánh giá, tài khoản |
| Khách hàng | `lan.nguyen@homeshop.local` | `Khach12345` | Mỗi khách chỉ thấy **giỏ hàng / đơn hàng / đánh giá / địa chỉ của riêng mình** |
| Khách hàng | `minh.tran@homeshop.local` | `Khach12345` | Thử đặt đơn ở 2 tài khoản rồi đối chiếu trang "Đơn hàng" |
| Khách hàng | `huong.le@homeshop.local` | `Khach12345` | Khách vào `/admin` → bị chặn 403 |

**Kịch bản kiểm tra phân quyền:** đăng nhập `lan.nguyen` → thêm giỏ & đặt hàng → đăng xuất → đăng nhập `minh.tran`: giỏ hàng trống, không thấy đơn của Lan; truy cập trực tiếp `/orders/<id đơn của Lan>` → "không tìm thấy". Đăng nhập `admin` → thấy đơn của Lan ở tab Đơn hàng.

**Kịch bản Tài khoản của tôi:** `/account` → sửa SĐT/giới tính/ngày sinh → Lưu → tải ảnh đại diện (> 1 MB bị từ chối) → tab **Địa chỉ** thêm 2 địa chỉ, đặt mặc định → vào **Giỏ hàng**: địa chỉ mặc định được điền sẵn, đổi nhanh bằng ô "Chọn từ sổ địa chỉ".

**Quên mật khẩu:** mọi email được **Mailpit** bắt lại tại http://localhost:8025 → mở thư, bấm "Đặt lại mật khẩu".

Kiểm tra: `/api/health` · Swagger: `/api/docs` · `/api/products/summary` · `/api/metrics` bị Nginx chặn (404) từ bên ngoài.

### Bật đăng nhập / đăng ký bằng Google & Facebook (cho MỌI tài khoản, giống Shopee)

**Cách hoạt động:** bấm nút → chuyển sang trang của Google/Facebook → **Google luôn hiện màn hình "Chọn tài khoản"** (`prompt=select_account`) với mọi tài khoản Google đã đăng nhập trên trình duyệt, kèm "Sử dụng một tài khoản khác"; Facebook hiện "Tiếp tục dưới tên …" hoặc form đăng nhập Facebook → quay về web. Lần đầu sẽ **tự tạo tài khoản** (đăng ký); email trùng tài khoản có sẵn (đã xác minh) thì **liên kết** thay vì tạo trùng.

> Nếu bấm nút mà chỉ hiện dòng nhắc *"Đăng nhập bằng Google/Facebook sẽ sớm được hỗ trợ…"* (không chuyển trang) → server **chưa có Client ID/Secret** (lỗi `not_configured`). Google/Facebook chỉ cho phép ứng dụng đã đăng ký → chủ dự án phải tạo 1 lần theo các bước dưới. Không phải lỗi code.

**URL cần khai báo** (thay domain nếu khác):

| Mục | Production | Local |
|---|---|---|
| Trang chủ | `https://13-214-14-196.sslip.io` | `http://localhost:8088` |
| Redirect URI Google | `https://13-214-14-196.sslip.io/api/auth/oauth/google/callback` | `http://localhost:8088/api/auth/oauth/google/callback` |
| Redirect URI Facebook | `https://13-214-14-196.sslip.io/api/auth/oauth/facebook/callback` | (Facebook bắt buộc HTTPS → test trên production) |
| Chính sách bảo mật | `https://13-214-14-196.sslip.io/privacy` | |
| Điều khoản | `https://13-214-14-196.sslip.io/terms` | |
| Hướng dẫn xóa dữ liệu | `https://13-214-14-196.sslip.io/data-deletion` | |

**1. Google** ([Google Cloud Console](https://console.cloud.google.com/))
1. Tạo project → *APIs & Services* → **OAuth consent screen** (Google Auth Platform): User type **External**, tên app *Home Shopping*, email hỗ trợ, logo (tùy chọn), *App domain*: điền 3 URL Trang chủ / Chính sách bảo mật / Điều khoản ở bảng trên. Scopes: chỉ `openid`, `email`, `profile` (không cần Google xét duyệt).
2. **Audience → Publish app** (chuyển *Testing* → *In production*). ⚠️ Ở chế độ *Testing* chỉ các email trong danh sách *Test users* đăng nhập được → đây là lý do "không phải tài khoản Google nào cũng vào được".
3. **Credentials → Create credentials → OAuth client ID → Web application** → *Authorized redirect URIs*: thêm 2 Redirect URI Google ở bảng trên → lấy **Client ID** và **Client secret**.

**2. Facebook** ([Meta for Developers](https://developers.facebook.com/apps))
1. *Create app* → use case **Authenticate and request data from users with Facebook Login** → loại *Consumer*.
2. *Facebook Login → Settings* → **Valid OAuth Redirect URIs**: Redirect URI Facebook ở bảng trên (bật *Client OAuth login*, *Web OAuth login*, *Enforce HTTPS*).
3. *App settings → Basic*: điền **Privacy Policy URL**, **Terms of Service URL**, **User data deletion → Data deletion instructions URL** (bảng trên), App domain `13-214-14-196.sslip.io`, chọn category, icon 1024×1024 → lấy **App ID** và **App secret**.
4. Quyền `email` và `public_profile`: mặc định có sẵn (Standard access).
5. Chuyển app sang **Live** (công tắc *App Mode* / *Publish*). ⚠️ Ở chế độ *Development* chỉ tài khoản có vai trò trong app (admin/developer/tester) đăng nhập được.

**3. Nạp vào server** (giá trị bí mật: tự dán, không commit Git)
- **Production:** thêm 4 dòng vào `~/.homeshop/prod.env`
  ```
  GOOGLE_CLIENT_ID=...apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=...
  FACEBOOK_APP_ID=...
  FACEBOOK_APP_SECRET=...
  ```
  rồi cập nhật secret `PROD_ENV_FILE` và deploy lại (hoặc chép `.env` lên `/opt/homeshop/.env` rồi chạy `bash scripts/deploy.sh $(cat .deploy/current_tag)`).
- **Local:**
  ```powershell
  $env:LOCAL_HTTP_PORT=8088
  $env:GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"; $env:GOOGLE_CLIENT_SECRET="..."
  docker compose -f docker-compose.local.yml up -d backend
  ```
- Kiểm tra: `curl https://13-214-14-196.sslip.io/api/auth/oauth/providers` → `{"google":true,"facebook":true}`.

**Quyền riêng tư:** web có sẵn trang [Chính sách bảo mật](frontend/src/app/privacy/page.tsx), [Điều khoản](frontend/src/app/terms/page.tsx), [Xóa dữ liệu](frontend/src/app/data-deletion/page.tsx) và chức năng **tự xóa tài khoản** (Tài khoản của tôi → Đổi mật khẩu → Xóa tài khoản; API `DELETE /api/account`): xóa hồ sơ, địa chỉ, đánh giá, liên kết Google/Facebook, thu hồi mọi phiên; đơn hàng giữ lại ở dạng ẩn danh.

### Chạy test

```bash
cd backend && npm ci && npx prisma generate
npm test                     # 90 unit test (Jest)
npm run test:cov             # kèm coverage
# 31 E2E test cần Postgres + Redis thật (ví dụ container tạm):
docker run -d --rm --name e2e-pg -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2epass -e POSTGRES_DB=e2e -p 127.0.0.1:55432:5432 postgres:16-alpine
docker run -d --rm --name e2e-redis -p 127.0.0.1:56379:6379 redis:7-alpine
export DATABASE_URL="postgresql://e2e:e2epass@127.0.0.1:55432/e2e?schema=public" REDIS_URL="redis://127.0.0.1:56379/0" JWT_SECRET="ci-only-secret-ci-only-secret-0123456789"
npx prisma migrate deploy && npm run test:e2e
cd ../frontend && npm ci && npm run lint && npm run typecheck && npm run build
```

E2E bao phủ: mua đồng thời món cuối (không oversell), idempotency, RBAC, thu hồi token, khóa tài khoản, đánh giá, quên/đổi mật khẩu, OAuth, **hồ sơ, ảnh đại diện, sổ địa chỉ (cách ly giữa người dùng), tự xóa tài khoản**, **lọc theo giá & thống kê cửa hàng**, metrics.

---

## 2. Triển khai production lên AWS

### 2.0. Hiện trạng (đã triển khai 01/11/2026)

| Hạng mục | Giá trị |
|---|---|
| Website | **https://13-214-14-196.sslip.io** (tên miền miễn phí `sslip.io` trỏ về Elastic IP, chứng chỉ Let's Encrypt hết hạn 29/01/2027, tự gia hạn) |
| EC2 | `homeshop-prod-app` · `i-0ba0bed3ce64454ef` · t3.small (2 vCPU, 2 GB RAM + swap 4 GB) · ổ 30 GB gp3 mã hóa · Ubuntu 22.04 |
| Elastic IP | `13.214.14.196` |
| SSH | `ssh -i ~/.ssh/homeshop_ed25519 ubuntu@13.214.14.196` (chỉ IP trong `ssh_allowed_cidrs`) |
| S3 | `homeshop-prod-assets-906457821730` (ảnh upload + backup) |
| IAM | `homeshop-prod-ec2-role` (EC2 → S3, không access key) · `homeshop-prod-github-deploy` (GitHub OIDC) |
| Grafana | http://13.214.14.196:3001 (user `admin`, mật khẩu `GRAFANA_ADMIN_PASSWORD` trong `~/.homeshop/prod.env`) |
| Admin web | email `SEED_ADMIN_EMAIL` / mật khẩu `SEED_ADMIN_PASSWORD` trong `~/.homeshop/prod.env` |
| Dữ liệu | 200 sản phẩm + ~900 đánh giá mẫu (người viết không đăng nhập được); **không có** tài khoản demo mật khẩu công khai |
| Container | 6 ứng dụng (nginx, frontend, backend, postgres, redis, certbot) + 9 giám sát |
| Chi phí ước tính | ~25–28 USD/tháng (EC2, EBS, IPv4 công khai, CloudWatch) |

Máy `luxe-server` (dự án khác) trong cùng tài khoản **không bị ảnh hưởng**: Home Shopping chạy trong VPC riêng.

### 2.1. Chuẩn bị
1. AWS CLI: `aws configure set region ap-southeast-1` rồi `aws login` (khuyến nghị dùng IAM user thay vì root).
2. SSH key: `ssh-keygen -t ed25519 -f ~/.ssh/homeshop_ed25519 -C homeshop-deployer`
3. Tài khoản Docker Hub (bắt buộc cho pipeline); SonarCloud, Discord webhook, Telegram bot (tùy chọn).
4. Domain: có thể dùng tên miền riêng, hoặc miễn phí `<ip-nối-bằng-gạch-ngang>.sslip.io`.

### 2.2. Dựng hạ tầng bằng Terraform
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # IP /32 của bạn, public key, github_repository
terraform init
terraform plan -out=tfplan                     # 30 tài nguyên: VPC, subnet, IGW, SG, EC2, EIP, S3, IAM, OIDC role, alarm
terraform apply tfplan
terraform output
```
- Tài khoản đã có GitHub OIDC provider → đặt `create_github_oidc_provider = false`.
- Không cài Terraform? Chạy bằng Docker: `docker run --rm --env-file aws.env -v "$PWD:/w" -w /w/terraform hashicorp/terraform:1.9.8 plan` (với `aws.env` sinh từ `aws configure export-credentials --format env-no-export`, xóa ngay sau khi dùng).
- EC2 tự bootstrap (swap, Docker, sysctl, UFW, fail2ban, unattended-upgrades, cron backup) trong ~5 phút: `ssh ... 'tail -f /var/log/user-data.log'`.

### 2.3. File `.env` production
Tạo từ [.env.example](.env.example) (khuyến nghị lưu ở `~/.homeshop/prod.env`), sinh mật khẩu bằng `openssl rand -hex 32`. Các biến quan trọng:

| Biến | Ý nghĩa |
|---|---|
| `DOMAIN`, `APP_URL`, `CORS_ORIGINS` | Tên miền / URL công khai |
| `LETSENCRYPT_EMAIL` | Không bắt buộc (để trống = đăng ký không kèm email) |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET` | Bắt buộc |
| `S3_BUCKET` | `terraform output -raw s3_bucket_name` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Admin đầu tiên (chỉ tạo nếu chưa có, không ghi đè mật khẩu) |
| `SEED_SAMPLE_REVIEWS=true` | Thêm đánh giá mẫu (không tạo tài khoản đăng nhập được) |
| `MAIL_FROM` | **Đặt trong ngoặc kép**, ví dụ `MAIL_FROM="Home Shopping <no-reply@domain>"` |
| `SMTP_URL`, `GOOGLE_*`, `FACEBOOK_*`, `DISCORD_WEBHOOK_URL`, `TELEGRAM_*` | Tùy chọn (để trống thì tính năng tương ứng tắt) |

### 2.4. Cấu hình GitHub (Settings → Secrets and variables → Actions)

| Loại | Tên | Giá trị | Trạng thái |
|---|---|---|---|
| Variable | `AWS_REGION` | `ap-southeast-1` | ✅ đã đặt |
| Variable | `EC2_HOST` | `13.214.14.196` | ✅ đã đặt |
| Variable | `APP_URL` | `https://13-214-14-196.sslip.io` | ✅ đã đặt |
| Secret | `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` | ✅ đã đặt |
| Secret | `AWS_SECURITY_GROUP_ID` | `terraform output -raw security_group_id` | ✅ đã đặt |
| Environment | `production` | (nên bật *Required reviewers*) | ✅ đã tạo |
| Variable | `DOCKERHUB_USERNAME` | username Docker Hub | ⏳ cần làm |
| Secret | `DOCKERHUB_TOKEN` | Docker Hub access token (Read & Write) | ⏳ cần làm |
| Secret | `EC2_SSH_PRIVATE_KEY` | `gh secret set EC2_SSH_PRIVATE_KEY < ~/.ssh/homeshop_ed25519` | ⏳ cần làm |
| Secret | `EC2_SSH_KNOWN_HOSTS` | `gh secret set EC2_SSH_KNOWN_HOSTS < ~/.homeshop/known_hosts` | ⏳ cần làm |
| Secret | `PROD_ENV_FILE` | `gh secret set PROD_ENV_FILE < ~/.homeshop/prod.env` | ⏳ cần làm |
| Secret/Variable | `SONAR_TOKEN`, `SONAR_ORGANIZATION`, `SONAR_PROJECT_KEY` | SonarCloud | tùy chọn |
| Secret | `DISCORD_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Thông báo | tùy chọn |

> Thêm `-R QuocAnh-205/home-shopping-app` vào các lệnh `gh` nếu chạy ngoài thư mục repo.

**Nạp 5 mục "cần làm" bằng 1 lệnh** (Git Bash, tại thư mục repo):

```bash
DOCKERHUB_USERNAME=<user> DOCKERHUB_TOKEN=<token> bash scripts/setup-github-secrets.sh
```

Thiếu mục nào thì pipeline dừng ngay ở bước *"Kiểm tra cấu hình Docker Hub"* / *"Kiểm tra secrets deploy"* kèm tên mục còn thiếu.

### 2.5. Deploy

**Tự động (sau khi đủ secrets):**
```bash
git push origin main
```
Pipeline: **(1a Security & Quality ‖ 1b Integration Test ‖ 1c IaC Scan) → 2 Build/Scan/Push → 3 Deploy → 4 Notify**.
Deploy trên EC2 (`scripts/deploy.sh`): pull image → migrate → **seed idempotent** → rolling update từng service (không gián đoạn) → cấp/gia hạn TLS → health check sau 30s → **tự rollback** nếu lỗi. Pull request chỉ chạy 3 job kiểm tra.

**Thủ công (khi chưa có Docker Hub, cách đã dùng cho lần deploy đầu):**
```bash
T=$(git rev-parse HEAD)
docker build -t homeshop/home-shopping-backend:$T backend
docker build -t homeshop/home-shopping-frontend:$T frontend
tar -czf - docker-compose.prod.yml nginx monitoring scripts | ssh ubuntu@<EIP> 'cd /opt/homeshop && tar -xzf -'
{ cat ~/.homeshop/prod.env; echo DOCKERHUB_USERNAME=homeshop; } | ssh ubuntu@<EIP> 'umask 077 && cat > /opt/homeshop/.env'
docker save homeshop/home-shopping-backend:$T homeshop/home-shopping-frontend:$T | gzip -1 | ssh ubuntu@<EIP> 'gunzip | docker load'
ssh ubuntu@<EIP> "cd /opt/homeshop && SKIP_PULL=1 bash scripts/deploy.sh $T"
```

---

## 3. Vận hành

| Việc | Lệnh (trên EC2, trong `/opt/homeshop`) |
|---|---|
| Xem trạng thái | `docker ps` · `docker compose -p homeshop -f docker-compose.prod.yml --env-file .infra.env --env-file .env --env-file .deploy/image.env ps` |
| Phiên bản đang chạy | `cat .deploy/current_tag` · `curl -s https://<domain>/api/health` |
| Grafana | `http://<EIP>:3001` (chỉ IP trong `grafana_allowed_cidrs`) |
| Prometheus / Alertmanager | `ssh -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 ubuntu@<EIP>` |
| Backup thủ công | `bash scripts/backup-db.sh` |
| Cron backup 02:00 | `/etc/cron.d/homeshop-backup` |
| Liệt kê / khôi phục backup | `bash scripts/restore-db.sh --list` · `bash scripts/restore-db.sh` |
| Rollback thủ công | `bash scripts/deploy.sh $(cat .deploy/previous_tag)` |
| Cấp lại chứng chỉ TLS | `bash scripts/init-letsencrypt.sh` |
| Bật thông báo Discord | thêm `DISCORD_WEBHOOK_URL` vào `.env` → `bash scripts/render-alertmanager.sh` |
| Log deploy | `ls .deploy/deploy-*.log` |
| Log bootstrap EC2 | `/var/log/user-data.log` |

### Truy vấn Loki hữu ích (Grafana → Explore)
```text
{service="backend", event="order.failed"}
{service="backend", level="error"} | json
{service="nginx", flow="checkout", status_class="5xx"}
{service="nginx"} | json | request_time > 1
```

### Sự cố đã gặp & cách xử lý

| Triệu chứng | Nguyên nhân | Đã sửa |
|---|---|---|
| Terraform báo `InvalidParameterValue: Invalid rule description`, EC2 không cài được gói | Mô tả egress rule có dấu nháy `'` | Bỏ dấu nháy trong `terraform/main.tf` |
| Shop production trống | Pipeline chỉ migrate, không seed | `deploy.sh` chạy `node prisma/seed.js` sau migrate |
| `init-letsencrypt.sh`: `.env: syntax error near unexpected token newline` | `MAIL_FROM=… <…>` không có ngoặc kép | Đặt giá trị trong `"…"` |
| Nginx restart liên tục, xin cert thất bại | Nginx kẹt vòng restart khi chưa có cert | Ép recreate + chờ chạy; lỗi thì fallback cert tự ký |
| Monitoring không lên | Alertmanager bắt buộc Discord & không đọc được file 640 | Discord tùy chọn, file 644 (thư mục vẫn 750) |
| `aws login` lỗi `expecting a Windows console` | Chưa đặt region nên CLI hỏi tương tác | `aws configure set region ap-southeast-1` |
| Job Build đỏ ở "Login Docker Hub" | Chưa có `DOCKERHUB_USERNAME/TOKEN` | Thêm secrets (mục 2.4) |

---

## 4. Nhật ký cập nhật

| Commit | Nội dung |
|---|---|
| `5efc76f` | Khởi tạo: NestJS + Next.js + PostgreSQL + Redis, Docker multi-stage, docker-compose local/prod, Nginx, Terraform, pipeline DevSecOps, Prometheus/Grafana/Loki, backup S3 |
| `045f273` | Vá lỗ hổng dependency (Next.js 15.5 + React 19, multer, overrides), sửa job IaC (Hadolint, Trivy, ShellCheck) |
| `2431505` | Thiết kế lại toàn bộ giao diện 2026, Font Awesome 7, chế độ sáng/tối, ảnh sản phẩm thật |
| `d8f698e` | 131 sản phẩm ảnh thật; đánh giá sản phẩm; giá gốc/% giảm; bán chạy; đăng nhập Google/Facebook (OAuth + PKCE); quên/đổi mật khẩu qua email (Mailpit); trang đăng nhập/đăng ký mới; footer mới; nhiều tài khoản demo |
| `681e55e` | Dashboard quản trị chi tiết (KPI, biểu đồ, cơ cấu trạng thái, top sản phẩm…); nút Google/Facebook luôn bật và nằm cuối form; đánh giá trang chủ xuống cuối, mỗi đánh giá 1 hàng; file tài khoản demo riêng |
| `5850766` | **Tài khoản của tôi kiểu Shopee** (hồ sơ, ảnh đại diện, sổ địa chỉ, đổi mật khẩu, liên kết); **200 sản phẩm**; mọi sản phẩm có 3–6 đánh giá; trang chủ thêm 7 khối mới; lọc theo giá, API `/products/summary`; footer bản quyền Nguyễn Quốc Anh; +10 unit test, +4 e2e |
| `54a7415` | Production tự seed; email Let's Encrypt tùy chọn; sửa mô tả rule Security Group |
| `98b0bf4` | `SKIP_PULL=1` cho deploy thủ công bằng image nạp sẵn |
| `3584c1e` | Gia cố lần deploy đầu: TLS bootstrap, Alertmanager không bắt buộc Discord, `.env` có ngoặc kép |
| `ed167d0` | Sửa lỗi ảnh sản phẩm "dính" che nội dung trên mobile/tablet |
| (mới) | Logo Google 4 màu & Facebook chính thức; Google luôn hiện màn hình chọn tài khoản, Facebook hỏi lại quyền email; trang Chính sách bảo mật / Điều khoản / Xóa dữ liệu; chức năng tự xóa tài khoản; hướng dẫn công khai ứng dụng Google/Facebook |
| (hạ tầng) | Terraform tạo EC2 riêng, **deploy production thành công** tại https://13-214-14-196.sslip.io; cấu hình biến/secret không nhạy cảm trên GitHub |

**Database migrations:** `20261001000000_init` → `20261101000000_search_admin_indexes` → `20261102000000_reviews_oauth_sale` → `20261103000000_account_profile_addresses` (SĐT, giới tính, ngày sinh, bảng `addresses`, 1 địa chỉ mặc định/người dùng).

**API mới gần đây:** `DELETE /api/account` · `PATCH /api/account/profile` · `POST /api/account/avatar` · `GET/POST /api/account/addresses` · `PUT/DELETE /api/account/addresses/:id` · `POST /api/account/addresses/:id/default` · `GET /api/products?minPrice=&maxPrice=` · `GET /api/products/summary` · `GET /api/media/avatars/:userId/:file`.

**Việc còn lại (tùy chọn):** thêm secrets Docker Hub/SSH/`PROD_ENV_FILE` để CD tự động; cấu hình `SMTP_URL` (Amazon SES) để gửi email thật; Google/Facebook OAuth cho production; Discord/Telegram để nhận cảnh báo; dùng tên miền riêng; chuyển Terraform state lên S3 backend.

---

## 5. Hủy hạ tầng (tránh phát sinh chi phí sau khi chấm)
```bash
cd terraform && terraform destroy
```
S3 bucket có `force_destroy = false` để bảo vệ backup: xóa object trong bucket trước (`aws s3 rm s3://homeshop-prod-assets-906457821730 --recursive`) nếu muốn destroy toàn bộ. Lệnh destroy chỉ xóa tài nguyên do Terraform tạo, **không đụng tới `luxe-server`**.
