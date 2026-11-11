# 🏠 Home Shopping App: DevOps Final Project

> **Sinh viên:** Nguyễn Quốc Anh · **Repo:** [QuocAnh-205/home-shopping-app](https://github.com/QuocAnh-205/home-shopping-app)
> **Bản production đang chạy:** **https://13-214-14-196.sslip.io** (AWS EC2 Singapore, HTTPS Let's Encrypt) · **Staging:** https://staging.13-214-14-196.sslip.io

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
📘 **Báo cáo DevOps toàn tập** (giải thích mọi thành phần, nhật ký triển khai, kịch bản demo, 100+ câu hỏi vấn đáp): [docs/BAO-CAO-DEVOPS.md](docs/BAO-CAO-DEVOPS.md)

**Mục lục:** [0. Quy trình DevOps](#0-quy-trình-devops-đối-chiếu-tiêu-chí-chấm) · [Tính năng](#tính-năng) · [Dữ liệu lưu ở đâu](#dữ-liệu-được-lưu-ở-đâu) · [1. Chạy local](#1-chạy-demo-local-1-lệnh) · [2. Production trên AWS](#2-triển-khai-production-lên-aws) · [3. Vận hành](#3-vận-hành) · [4. Nhật ký cập nhật](#4-nhật-ký-cập-nhật) · [5. Hủy hạ tầng](#5-hủy-hạ-tầng-tránh-phát-sinh-chi-phí-sau-khi-chấm)

---

## 0. Quy trình DevOps (đối chiếu tiêu chí chấm)

**Dự án này có quy trình DevOps tự động hoàn toàn.** Từ lúc sửa code tới lúc web thật đổi theo, không ai phải SSH vào máy chủ hay bấm tay trên AWS Console:

```
nhánh tính năng ──► Pull Request ──► CI: lint · test · build image · quét bảo mật ──► (xanh mới được) merge vào main
       ──► CI chạy lại ──► đẩy image lên Docker Hub ──► deploy STAGING + smoke test ──► deploy PRODUCTION (không downtime)
       ──► health check thất bại thì TỰ ROLLBACK ──► báo kết quả qua Discord/Telegram
```

### 0.1. Bảng đối chiếu từng tiêu chí

| Tiêu chí | Trạng thái | Làm thế nào / ở đâu |
|---|---|---|
| **Git**: nhánh riêng cho từng tính năng, pull request, commit rõ nghĩa, chặn push thẳng vào main | ✅ | Mỗi thay đổi đi qua nhánh `feat/…`, `fix/…`, `docs/…` rồi mở PR (mẫu PR: [`.github/pull_request_template.md`](.github/pull_request_template.md)). Commit theo Conventional Commits (`feat(ui): …`, `fix(admin): …`). **Branch protection** trên `main`: bắt buộc PR, bắt buộc 5 check CI xanh, cấm force-push/xóa nhánh, áp dụng cả với admin |
| **CI**: mỗi lần push tự chạy lint, test, build Docker image; fail thì không cho merge | ✅ | [`.github/workflows/production-cicd.yml`](.github/workflows/production-cicd.yml), job 1a–2. Với **mọi PR**: ESLint + typecheck + 177 unit test, 66 e2e test trên Postgres/Redis thật, kiểm tra schema drift, diễn tập backup/restore, Hadolint, Terraform validate, ShellCheck, **build 2 Docker image + Trivy**. Đây là các *required status check*: một check đỏ là nút Merge bị khóa |
| **CD**: merge vào main là tự deploy; có rollback | ✅ | Job **3a** deploy *staging* + smoke test → job **3b** deploy *production*: rolling update 2 bản song song, health check 30 giây, **tự rollback** nếu lỗi ([`scripts/deploy.sh`](scripts/deploy.sh)). **Rollback thủ công 1 nút:** Actions → *Rollback Production* → Run workflow ([`rollback.yml`](.github/workflows/rollback.yml)), để trống ô tag = quay về bản trước |
| **Docker**: multi-stage, image nhỏ, user không phải root, compose cho cả hệ thống, image lên registry có tag phiên bản | ✅ | [`backend/Dockerfile`](backend/Dockerfile), [`frontend/Dockerfile`](frontend/Dockerfile): 4–5 stage, `node:20-alpine`, chỉ copy production deps / Next.js standalone, `USER 1001`, `read_only`, `cap_drop: ALL`, `no-new-privileges`. Compose: [`local`](docker-compose.local.yml) · [`prod`](docker-compose.prod.yml) · [`staging`](docker-compose.staging.yml) · [`monitoring`](monitoring/docker-compose.monitoring.yml). Docker Hub: mỗi bản có 3 tag **`<commit SHA>`**, **`1.0.<số lần chạy>`**, `latest` |
| **Hạ tầng bằng code**: Terraform dựng EC2, security group, mạng | ✅ | [`terraform/`](terraform/): VPC, subnet, Internet Gateway, route table, Security Group, EC2 + Elastic IP, EBS mã hóa, S3 (backup + ảnh), IAM role, **GitHub OIDC** (CI không giữ AWS access key), CloudWatch auto-recover. Cài đặt máy lần đầu: [`scripts/user_data.sh`](scripts/user_data.sh) |
| **Bí mật**: khóa VNPay/MoMo, mật khẩu DB không nằm trong repo | ✅ | Toàn bộ `.env` production là **GitHub Secret `PROD_ENV_FILE`**. Lúc deploy, nội dung được ghi lên EC2 qua stdin với `umask 077`, không lộ ra log. Gitleaks quét **toàn bộ lịch sử commit** ở mỗi lần chạy. Repo để public được vì không chứa bí mật nào |
| **Giám sát**: Prometheus + Grafana, `/health`, cảnh báo khi web sập | ✅ | `GET /api/health` kiểm tra DB + Redis và trả về version đang chạy. Prometheus thu metric từ Node Exporter, cAdvisor, Postgres/Redis exporter và `/api/metrics` của backend. Grafana có dashboard dựng sẵn. **17 luật cảnh báo** ([`alert.rules.yml`](monitoring/prometheus/alert.rules.yml)), ví dụ `BackendDown`, `PostgresDown`, `BackendHigh5xxRate`, `DatabaseBackupMissing`, gửi qua Alertmanager tới **Discord**. Hỏng phần cứng thì CloudWatch tự khôi phục máy |
| **Log tập trung, tìm kiếm được** | ✅ | Promtail tự phát hiện mọi container (cả staging) → **Loki** → tìm trong Grafana *Explore* bằng LogQL. Log backend là JSON, có `request_id` xuyên suốt Nginx → backend (xem [mục 3](#truy-vấn-loki-hữu-ích-grafana--explore)) |
| **Sao lưu**: backup DB theo lịch, đã thử khôi phục | ✅ | Cron **02:00 hằng ngày**: [`backup-db.sh`](scripts/backup-db.sh) chạy `pg_dump`, kiểm tra gzip + checksum, đẩy lên **S3** (mã hóa, có lifecycle). Ngoài ra luôn dump DB trước mỗi lần deploy có migration. Khôi phục bằng [`restore-db.sh`](scripts/restore-db.sh). **Diễn tập restore tự động ở mỗi lần CI**: dump → restore sang DB mới → so khớp số dòng của users / products / orders / order_items / migrations |
| **Bảo mật**: Trivy, quét thư viện, SG chỉ mở 80/443, SSH giới hạn IP | ✅ | **Trivy** quét image (chặn khi có lỗi CRITICAL đã có bản vá) và quét cấu hình IaC. `npm audit` + **Dependabot** (npm, Docker, Actions, Terraform). SonarCloud, Gitleaks. Security Group chỉ mở 80/443 cho Internet. Port 22 và Grafana (3001) chỉ cho **1 IP quản trị**. CI mở port 22 **tạm thời đúng IP runner** rồi đóng lại ngay sau deploy |
| **Môi trường staging tách khỏi production** | ✅ | [`docker-compose.staging.yml`](docker-compose.staging.yml) + [`scripts/deploy-staging.sh`](scripts/deploy-staging.sh): chạy chung EC2 (tiết kiệm chi phí) nhưng **container, PostgreSQL, Redis, volume, mạng, JWT đều riêng**. Staging dùng cổng thanh toán giả lập, không S3, không email. Địa chỉ **https://staging.13-214-14-196.sslip.io**. Migration chạy thử trên DB staging trước; staging fail thì **production không bị đụng tới** |
| **Tài liệu**: README, sơ đồ kiến trúc, sơ đồ pipeline, hướng dẫn chạy lại từ đầu | ✅ | Chính README này (sơ đồ ở [0.2](#02-sơ-đồ-kiến-trúc) và [0.3](#03-sơ-đồ-pipeline-cicd)). Chạy lại từ đầu: [mục 0.6](#06-dựng-lại-toàn-bộ-từ-đầu-máy-mới-tài-khoản-aws-mới). Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/BAO-CAO-DEVOPS.md](docs/BAO-CAO-DEVOPS.md) |

**Giới hạn cần nói thật khi bảo vệ:**
- Staging chạy chung máy với production. Nó tách ở tầng container và dữ liệu, chưa tách ở tầng máy chủ. Muốn tách hẳn thì nhân bản module Terraform ra một EC2 thứ hai (tốn thêm khoảng 10 USD/tháng).
- Chỉ có 1 máy EC2 nên không chịu được việc mất cả vùng AWS. Bù lại có RPO 24 giờ, RTO khoảng 15 phút (xem báo cáo).
- Tên miền đang dùng `sslip.io` (miễn phí, tự trỏ về Elastic IP). Khi có tên miền riêng chỉ cần đổi `DOMAIN` / `APP_URL`.

### 0.2. Sơ đồ kiến trúc

```mermaid
flowchart LR
  user([Người dùng]) -->|HTTPS 443| nginx
  subgraph AWS["AWS ap-southeast-1 · VPC 10.0.0.0/16 (Terraform)"]
    subgraph EC2["EC2 t3.small · Security Group: 80/443 public, 22 + 3001 chỉ IP quản trị"]
      nginx["Nginx 1.28<br/>TLS Let's Encrypt · rate limit · CSP<br/>định tuyến theo tên miền"]
      subgraph PROD["Production (homeshop)"]
        fe[Frontend Next.js] --> be[Backend NestJS]
        be --> pg[(PostgreSQL 16)]
        be --> rd[(Redis 7)]
      end
      subgraph STG["Staging (homeshop-staging)"]
        sfe[Frontend] --> sbe[Backend]
        sbe --> spg[(PostgreSQL riêng)]
        sbe --> srd[(Redis riêng)]
      end
      subgraph MON["Monitoring"]
        prom[Prometheus] --> am[Alertmanager]
        graf[Grafana]
        loki[Loki] --- pt[Promtail]
      end
      nginx -->|13-214-14-196.sslip.io| fe
      nginx -->|staging.13-214-14-196.sslip.io| sfe
      cron[[cron 02:00 backup-db.sh]]
    end
    s3[(S3: backup DB + ảnh)]
  end
  be --> s3
  cron --> s3
  am -->|cảnh báo| discord([Discord])
  prom -.scrape.-> be & pg & rd
  pt -.log mọi container.-> loki
```

### 0.3. Sơ đồ pipeline CI/CD

```mermaid
flowchart LR
  dev([Dev: nhánh feat/*]) -->|git push + mở PR| pr{{Pull Request}}
  subgraph CI["CI: chạy cho MỌI PR và mọi lần push main (required checks)"]
    a["1a · Security & Code Quality<br/>Gitleaks · ESLint · tsc · unit test<br/>npm audit · SonarCloud"]
    b["1b · Integration Test<br/>migrate · drift · seed ×2 · e2e<br/>diễn tập backup/restore"]
    c["1c · IaC & Config Scan<br/>Hadolint · Terraform · Trivy config<br/>ShellCheck · promtool · compose"]
    d["2 · Build + Trivy image<br/>(backend ‖ frontend)"]
    a & b & c --> d
  end
  pr --> CI
  d -->|"tất cả xanh → nút Merge mở"| merge[[Merge vào main]]
  merge --> CI2["CI chạy lại trên main"] --> push["Push Docker Hub<br/>tag SHA · 1.0.N · latest"]
  push --> stg["3a · Deploy STAGING<br/>migrate DB staging · smoke test qua Nginx"]
  stg -->|xanh| prod["3b · Deploy PRODUCTION<br/>backup trước migrate → rolling update<br/>health check 30s"]
  prod -->|lỗi| rb["Tự rollback về bản trước"]
  prod --> notify["4 · Báo Discord / Telegram"]
  rb --> notify
  manual([Bấm 'Rollback Production']) -.-> rbm["rollback.yml → deploy.sh --rollback"]
```

### 0.4. Quy trình làm việc hằng ngày (Git flow)

```bash
git checkout main && git pull
git checkout -b feat/ten-tinh-nang          # 1 nhánh cho 1 tính năng / 1 lỗi
# ... sửa code, chạy test local (mục 1) ...
git commit -m "feat(cart): thêm nút xóa nhiều sản phẩm"   # Conventional Commits
git push -u origin feat/ten-tinh-nang
gh pr create --fill                          # hoặc mở PR trên giao diện GitHub
# Chờ 5 check xanh → người còn lại trong nhóm review → Merge (squash)
# → pipeline tự deploy staging rồi production, không làm gì thêm
```

Bật luật bảo vệ nhánh `main` (đã bật cho repo này; repo mới thì chạy 1 lần):

```bash
gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": [
    "1a · Security & Code Quality", "1b · Integration Test (Postgres + Redis)", "1c · IaC & Config Scan",
    "2 · Build, Scan & Push (backend)", "2 · Build, Scan & Push (frontend)" ] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null, "allow_force_pushes": false, "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF
```

> Branch protection trên repo **private** cần GitHub Pro. Repo này để **public**, an toàn vì không có bí mật nào trong code (Gitleaks kiểm tra mỗi lần chạy).
> `required_approving_review_count` đặt 0 để một người vẫn merge được khi bạn cùng nhóm vắng. Muốn bắt buộc review chéo thì đổi thành 1.

### 0.5. Kịch bản demo 5 phút cho buổi bảo vệ

| # | Làm gì | Cho thầy cô thấy |
|---|---|---|
| 1 | Mở Grafana `http://<EC2_IP>:3001` (dashboard *Home Shopping - Production Overview*) và web production | Hệ thống đang chạy, có metric và log |
| 2 | `git checkout -b feat/demo-doi-chu`, sửa một dòng chữ, ví dụ tiêu đề trong `frontend/src/app/page.tsx`, rồi commit và push, `gh pr create --fill` | Làm việc trên nhánh riêng và PR |
| 3 | Thử `git push origin main` thẳng | GitHub **từ chối** (`protected branch`) |
| 4 | Tab *Checks* của PR | Lint, test, build image, Trivy tự chạy. Nút Merge bị khóa tới khi tất cả xanh |
| 5 | Merge PR, mở tab *Actions* | Pipeline đẩy image (tag SHA + `1.0.N`), deploy **staging** rồi **production** |
| 6 | Mở `https://staging.…` rồi tới web production | Dòng chữ mới xuất hiện ở staging trước, production sau. `/api/health` trả về đúng commit SHA mới |
| 7 | Discord | Tin nhắn "✅ DEPLOY THÀNH CÔNG" kèm commit và người push |
| 8 | Actions → *Rollback Production* → Run (để trống tag) | Production quay về bản trước trong khoảng 2 phút, không downtime |
| 9 | Grafana → Explore → Loki: `{container=~"homeshop.*backend.*"} \|= "order"` | Log tập trung, tìm kiếm được |
| 10 | Trên EC2 chạy `docker stop homeshop-postgres` (rồi `docker start` lại) | Khoảng 1 phút sau Discord báo `PostgresDown` |

### 0.6. Dựng lại toàn bộ từ đầu (máy mới, tài khoản AWS mới)

1. Cài: Git, Docker Desktop, Node 20, Terraform ≥ 1.6, AWS CLI v2, GitHub CLI (`gh`). Chạy `aws configure` và `gh auth login`.
2. `git clone https://github.com/QuocAnh-205/home-shopping-app && cd home-shopping-app`
3. **Chạy thử local:** `docker compose -f docker-compose.local.yml up -d --build` → http://localhost (chi tiết [mục 1](#1-chạy-demo-local-1-lệnh)).
4. **Dựng hạ tầng:** `cd terraform && cp terraform.tfvars.example terraform.tfvars` (điền IP quản trị, SSH public key, tên repo) → `terraform init && terraform apply` → ghi lại output `public_ip`, `security_group_id`, `github_deploy_role_arn` ([mục 2.2](#22-dựng-hạ-tầng-bằng-terraform)).
5. **Bí mật:** tạo file `.env` production theo [`.env.example`](.env.example) (mật khẩu DB, JWT, khóa thanh toán…), **không commit**. Rồi `bash scripts/setup-github-secrets.sh` để đẩy toàn bộ lên GitHub Secrets/Variables ([mục 2.4](#24-cấu-hình-github-settings--secrets-and-variables--actions)).
6. **Bảo vệ nhánh main:** chạy lệnh ở [mục 0.4](#04-quy-trình-làm-việc-hằng-ngày-git-flow).
7. **Deploy lần đầu:** Actions → *Production CI/CD* → Run workflow (hoặc merge một PR bất kỳ). Pipeline tự xin chứng chỉ HTTPS, chạy migration, seed, staging rồi production.
8. **Kiểm tra:** `curl https://<ip-gạch-ngang>.sslip.io/api/health` trả về version = commit mới nhất; mở Grafana `http://<ip>:3001`.
9. **Hủy sau khi chấm:** [mục 5](#5-hủy-hạ-tầng-tránh-phát-sinh-chi-phí-sau-khi-chấm) (`terraform destroy`).

---

## Tính năng

| Khách hàng | Quản trị viên (`/admin`) |
|---|---|
| **200 sản phẩm / 7 danh mục**, ảnh chụp thật khớp từng sản phẩm, tìm kiếm (pg_trgm), lọc **đang giảm giá** & **theo mức giá**, sắp xếp mới nhất / **bán chạy** / **đánh giá cao** / giá / tên | **Dashboard**: doanh thu hôm nay / 30 ngày (so với kỳ trước), biểu đồ doanh thu 30 ngày (tooltip + xem dạng bảng), cơ cấu đơn theo trạng thái, doanh thu theo danh mục, top bán chạy, đơn gần đây, thống kê đánh giá, sắp hết hàng |
| **Trang chủ**: bento hero, **Mua theo không gian**, **Mua theo mức giá**, **Ưu đãi hấp dẫn**, **Bộ sưu tập**, **Bán chạy nhất**, dải **con số thật của cửa hàng**, **Hàng mới về**, **Đánh giá cao nhất**, **Mua sắm trong 4 bước**, tất cả sản phẩm, **Khách hàng nói gì** (mỗi đánh giá 1 hàng), **Câu hỏi thường gặp** | **Đơn hàng**: lọc trạng thái, **tìm theo mã đơn rút gọn / email / tên / SĐT / địa chỉ**, **lọc khoảng ngày**, tổng giá trị theo bộ lọc, chi tiết đơn, chuyển trạng thái theo state machine, hủy đơn hoàn kho, **xuất CSV** |
| **Trang chi tiết**: giá gốc gạch ngang & **% giảm**, điểm đánh giá, **số đã bán**, điểm nổi bật, mô tả chi tiết, **thông số kỹ thuật**, hướng dẫn sử dụng & bảo quản, chính sách, sản phẩm cùng danh mục | **Sản phẩm**: lọc danh mục / tồn kho (sắp hết, hết hàng) / đang giảm giá / đang ẩn, 7 kiểu sắp xếp; **thêm & sửa đầy đủ** (giá, giá gốc, danh mục, mô tả, điểm nổi bật, **thông số kỹ thuật**, **đổi ảnh**), sửa tồn kho tại chỗ, bật/tắt "Bán chạy", **ẩn/hiện** khỏi cửa hàng, **xóa** (chỉ khi chưa có đơn) · **Danh mục**: thêm/sửa/xóa, thống kê sản phẩm, tồn kho, đã bán |
| **Đánh giá sản phẩm**: mọi khách đã đăng nhập đều viết được, 1 đánh giá/sản phẩm (sửa/xóa được), lọc theo số sao, nhãn **"Đã mua hàng"**; mọi sản phẩm có sẵn 3–6 đánh giá | **Người dùng**: tìm/lọc theo vai trò, trạng thái; chi tiết (hồ sơ, sổ địa chỉ, tổng chi tiêu, đơn & đánh giá gần đây); **cấp/hạ quyền admin**, **khóa/mở khóa** (kèm lý do, thu hồi mọi phiên, chặn cả đăng nhập Google/Facebook), **đăng xuất mọi thiết bị**, xuất CSV; luôn giữ ≥ 1 admin, không tự khóa/tự hạ quyền · **Đánh giá**: tìm, lọc số sao / đã mua, gỡ vi phạm |
| **Tài khoản của tôi** (bố cục kiểu Shopee): menu trái; **Hồ sơ** (tên, email che bớt, SĐT, giới tính, ngày sinh), **ảnh đại diện ≤ 1 MB**; **Địa chỉ** (tối đa 10, đúng 1 mặc định, Nhà riêng/Văn phòng); **Đổi mật khẩu**; **Liên kết Google/Facebook**; Đơn mua | **Bản tin**: danh sách email đăng ký, tìm, xóa, xuất CSV · **Nhật ký thao tác**: mọi thay đổi của admin (ai, làm gì, lúc nào, dữ liệu trước/sau) · Upload ảnh: S3 (production) hoặc lưu đĩa (local), kiểm tra magic bytes |
| **Giỏ hàng** Redis có **tick chọn** từng sản phẩm, **Mua ngay** không qua giỏ, trang **Thanh toán** (xem trước tạm tính / phí ship / voucher / tổng tiền), **COD, VNPay, MoMo, VietQR**, đặt hàng **idempotent**, chống oversell, **Đơn mua** theo tab kiểu Shopee, timeline lịch sử, hủy có lý do, **Đã nhận hàng**, **Mua lại**, **Trả hàng/Hoàn tiền** kèm ảnh | **Voucher** (tạo, bật/tắt, lượt dùng) · **Trả hàng/Hoàn tiền** (duyệt/từ chối, thử lại hoặc đánh dấu hoàn tay) · lịch sử thanh toán + nhật ký IPN của từng đơn, **xác nhận chuyển khoản VietQR** · Swagger UI `/api/docs`, metrics nghiệp vụ + cảnh báo |
| **Trung tâm tài khoản** (bố cục quen thuộc của sàn TMĐT): **Thông báo** (chuông + số chưa đọc, theo loại), Hồ sơ (**tên đăng nhập đổi 1 lần**, **đổi email bằng mã 6 số**), **Ngân hàng** nhận tiền hoàn, Địa chỉ (GPS + bản đồ), Đổi mật khẩu, **Cài đặt thông báo**, **Thiết lập riêng tư** (ẩn tên khi đánh giá, xóa tài khoản), **Thông tin cá nhân** (tải dữ liệu JSON), **Kho voucher**, **Xu** (+1% đơn hoàn thành, +100 xu đánh giá, dùng tối đa 50% khi thanh toán) | |
| **Đăng ký / đăng nhập email**, **Google**, **Facebook** (OAuth 2.0 + PKCE), **quên mật khẩu qua email**, đăng xuất thu hồi token, khóa 15 phút khi sai 5 lần | |

### Mua hàng & thanh toán kiểu Shopee (nâng cấp 11/11/2026)

| Mảng | Cách làm | Ở đâu trong code |
|---|---|---|
| **Tiền** | Số nguyên VND (`INTEGER`), không dùng số thực; `total = subtotal + shippingFee − discount − shippingDiscount` (CHECK trong DB) | `backend/src/checkout/pricing.ts` |
| **Trang thanh toán** | `POST /api/checkout/preview` tính lại mọi con số từ DB (không tin giá client): tạm tính, phí ship + ngày giao dự kiến, voucher dùng được kèm lý do, phương thức thanh toán | `backend/src/checkout/` |
| **Đặt hàng** | `POST /api/orders` (header `Idempotency-Key`): 1 transaction trừ kho `UPDATE … WHERE stock >= qty AND price = giá đã tính`, snapshot sản phẩm/địa chỉ, trừ lượt voucher; lệch `expectedTotal` → `409 PRICE_CHANGED` | `backend/src/orders/orders.service.ts` |
| **Vòng đời đơn** | Chờ thanh toán → Chờ xác nhận → Đang chuẩn bị → Đang giao → Đã giao → Hoàn thành; Đã hủy; Yêu cầu trả hàng → Đã trả hàng. State machine theo vai (khách/admin/hệ thống), bảng `order_status_history`, job tự hoàn thành sau 3 ngày | `backend/src/orders/order-state.ts`, `order-lifecycle.service.ts` |
| **Thanh toán online** | Interface `PaymentGateway` chung; VNPay (HMAC-SHA512), MoMo (HMAC-SHA256), VietQR (admin xác nhận). **Chỉ IPN có chữ ký mới đổi trạng thái** (khóa dòng, idempotent, đối chiếu số tiền); trang return chỉ hiển thị. Giữ hàng 15 phút, quá hạn job tự hủy + hoàn kho + trả voucher; IPN đến muộn → tự hoàn tiền | `backend/src/payments/` |
| **Cổng giả lập** | Chưa có khóa VNPay/MoMo + `PAYMENT_MOCK_ENABLED=true` → trang `/payment/mock` (link ký HMAC, đi qua đúng luồng IPN). Có khóa sandbox thật thì tự dùng cổng thật | `payments/gateways/mock.gateway.ts` |
| **Hoàn tiền** | Đơn đã trả tiền bị hủy / trả hàng → gọi API refund của cổng; lỗi → admin thử lại; VietQR/COD → hoàn tay rồi đánh dấu | `payments/refunds.service.ts` |
| **Phí vận chuyển** | Địa chỉ theo **mã hành chính 2 cấp (34 tỉnh, 3.321 xã – từ 01/07/2025)**; phí theo vùng (nội tỉnh / nội miền / liên miền) × khối lượng tính cước (max thật & D×R×C/6000); miễn phí đơn từ 500.000₫. Interface `ShippingProvider` để cắm GHN/GHTK, lỗi API → bảng phí dự phòng | `backend/src/shipping/`, `backend/src/locations/` |
| **Voucher** | Giảm %, giảm tiền, miễn phí ship; đơn tối thiểu, giảm tối đa, thời hạn, tổng lượt, lượt/người, theo danh mục/sản phẩm; ví voucher; 1 voucher giảm giá + 1 voucher ship mỗi đơn; trừ lượt bằng `UPDATE … WHERE used_count < usage_limit` | `backend/src/vouchers/` |
| **Lỗi** | Mọi lỗi có `code` ổn định (`OUT_OF_STOCK`, `PRICE_CHANGED`, `VOUCHER_EXHAUSTED`, `INVALID_TRANSITION`…) + thông báo tiếng Việt + `details` | `backend/src/common/errors.ts` |

Voucher demo: `HOMESHOP10` (−10%, đơn từ 300K), `GIAM50K` (đơn từ 500K), `FREESHIP` (đơn từ 150K), `SHIP15K`, `BEPXINH15` (nhà bếp −15%). Biến môi trường mới: xem mục *Thanh toán online* và *Vận chuyển & đơn hàng* trong [`.env.example`](.env.example).

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
| **Cấu trúc database** (bảng, quan hệ, index) | [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) + [`backend/prisma/migrations/`](backend/prisma/migrations) | 11 migration, kèm CHECK constraint & partial unique index |
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

| Vai trò | Email | Mật khẩu | Local (`localhost:8088`) | Production (`13-214-14-196.sslip.io`) | Dùng để kiểm tra |
|---|---|---|---|---|---|
| **Quản trị viên (local)** | `admin@homeshop.local` | `Admin12345` | ✅ | ❌ **không có** (mật khẩu công khai trên GitHub → không bao giờ đưa lên web thật) | `/admin` ở bản local |
| **Quản trị viên (production)** | `quanly@homeshop.vn` | `SEED_ADMIN_PASSWORD` trong `~/.homeshop/prod.env` (bí mật) | ❌ | ✅ | `/admin`: tổng quan, đơn hàng, sản phẩm, danh mục, người dùng, đánh giá, bản tin, nhật ký |
| Khách hàng | `khach@homeshop.local` | `Khach12345` | ✅ | ✅ (`SEED_DEMO_CUSTOMERS=true`) | Giỏ hàng, đặt hàng, đánh giá, tài khoản |
| Khách hàng | `lan.nguyen@homeshop.local` | `Khach12345` | ✅ | ✅ | Mỗi khách chỉ thấy **giỏ hàng / đơn hàng / đánh giá / địa chỉ của riêng mình** |
| Khách hàng | `minh.tran@homeshop.local` | `Khach12345` | ✅ | ✅ | Thử đặt đơn ở 2 tài khoản rồi đối chiếu trang "Đơn hàng" |
| Khách hàng | `huong.le@homeshop.local` | `Khach12345` | ✅ | ✅ | Khách vào `/admin` → bị chặn 403 |

> Nhập `admin@homeshop.local` trên production sẽ báo *"Email hoặc mật khẩu không đúng"* – đúng thiết kế, vì tài khoản đó không tồn tại ở production.

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
# 58 E2E test cần Postgres + Redis thật (ví dụ container tạm):
docker run -d --rm --name e2e-pg -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2epass -e POSTGRES_DB=e2e -p 127.0.0.1:55432:5432 postgres:16-alpine
docker run -d --rm --name e2e-redis -p 127.0.0.1:56379:6379 redis:7-alpine
export DATABASE_URL="postgresql://e2e:e2epass@127.0.0.1:55432/e2e?schema=public" REDIS_URL="redis://127.0.0.1:56379/0" JWT_SECRET="ci-only-secret-ci-only-secret-0123456789"
npx prisma migrate deploy && npm run test:e2e
cd ../frontend && npm ci && npm run lint && npm run typecheck && npm run build
```

E2E bao phủ: mua đồng thời món cuối (không oversell), idempotency, RBAC, thu hồi token, khóa tài khoản, đánh giá, quên/đổi mật khẩu, OAuth, **hồ sơ, ảnh đại diện, sổ địa chỉ (cách ly giữa người dùng), tự xóa tài khoản**, **lọc theo giá & thống kê cửa hàng**, metrics.

---

## 2. Triển khai production lên AWS

### 2.0. Hiện trạng (triển khai lần đầu 01/11/2026 · CI/CD tự động từ 05/11/2026)

| Hạng mục | Giá trị |
|---|---|
| Website | **https://13-214-14-196.sslip.io** (tên miền miễn phí `sslip.io` trỏ về Elastic IP, chứng chỉ Let's Encrypt hết hạn 29/01/2027, tự gia hạn) |
| EC2 | `homeshop-prod-app` · `i-0ba0bed3ce64454ef` · t3.small (2 vCPU, 2 GB RAM + swap 4 GB) · ổ 30 GB gp3 mã hóa · Ubuntu 22.04 |
| Elastic IP | `13.214.14.196` |
| SSH | `ssh -i ~/.ssh/homeshop_ed25519 ubuntu@13.214.14.196` (chỉ IP trong `ssh_allowed_cidrs`) |
| S3 | `homeshop-prod-assets-906457821730` (ảnh upload + backup) |
| IAM | `homeshop-prod-ec2-role` (EC2 → S3, không access key) · `homeshop-prod-github-deploy` (GitHub OIDC) |
| Grafana | http://13.214.14.196:3001 (user `admin`, mật khẩu `GRAFANA_ADMIN_PASSWORD` trong `~/.homeshop/prod.env`) |
| Admin web | `/admin` (8 tab: Tổng quan, Đơn hàng, Sản phẩm, Danh mục, Người dùng, Đánh giá, Bản tin, Nhật ký) · đăng nhập `quanly@homeshop.vn` / mật khẩu `SEED_ADMIN_PASSWORD` trong `~/.homeshop/prod.env` (bí mật) |
| Tài khoản khách demo | `khach@`, `lan.nguyen@`, `minh.tran@`, `huong.le@homeshop.local` / `Khach12345` (bật bằng `SEED_DEMO_CUSTOMERS=true`; **không** có admin demo trên production) |
| Dữ liệu | 200 sản phẩm + ~900 đánh giá mẫu (người viết không đăng nhập được); chỉ 4 tài khoản **khách** demo, không có admin mật khẩu công khai |
| Container | 6 ứng dụng (nginx, frontend, backend, postgres, redis, certbot) + 9 giám sát |
| CI/CD | **Tự động hoàn toàn**: push `main` → test → build → quét → deploy (~6 phút). Lần chạy xanh gần nhất: [#42095022662](https://github.com/QuocAnh-205/home-shopping-app/actions/runs/42095022662) (06/11/2026, cả 7 job ✅, tự chạy khi push), production chạy commit `a07fa0c` (trang admin v2 + tài khoản khách demo) |
| Docker Hub | 🔒 `anhquocnguyen2005/home-shopping-backend` (**private**) · `anhquocnguyen2005/home-shopping-frontend` (public) · tag = commit SHA + `latest` · gói Personal miễn phí chỉ có 1 repo private (xem mục 2.6) |
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
- Repo bật **immutable subject** (mặc định với repo mới) → đặt `github_oidc_sub_prefix` bằng `sub_claim_prefix` lấy từ `gh api repos/<owner>/<repo>/actions/oidc/customization/sub` (repo này: `repo:QuocAnh-205@189313150/home-shopping-app@1440229410`). Thiếu dòng này thì job Deploy báo `Not authorized to perform sts:AssumeRoleWithWebIdentity`.
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
| Variable | `DOCKERHUB_USERNAME` | username Docker Hub | ✅ đã đặt (05/11) |
| Secret | `DOCKERHUB_TOKEN` | Docker Hub access token (Read & Write) | ✅ đã đặt (05/11) |
| Secret | `EC2_SSH_PRIVATE_KEY` | `gh secret set EC2_SSH_PRIVATE_KEY < ~/.ssh/homeshop_ed25519` | ✅ đã đặt (05/11) |
| Secret | `EC2_SSH_KNOWN_HOSTS` | `gh secret set EC2_SSH_KNOWN_HOSTS < ~/.homeshop/known_hosts` | ✅ đã đặt (05/11) |
| Secret | `PROD_ENV_FILE` | `gh secret set PROD_ENV_FILE < ~/.homeshop/prod.env` | ✅ đã đặt (05/11) |
| Secret/Variable | `SONAR_TOKEN`, `SONAR_ORGANIZATION`, `SONAR_PROJECT_KEY` | SonarCloud | tùy chọn |
| Secret | `DISCORD_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Thông báo | tùy chọn |

> Thêm `-R QuocAnh-205/home-shopping-app` vào các lệnh `gh` nếu chạy ngoài thư mục repo.

**Nạp (hoặc nạp lại) 5 secret Docker Hub/SSH/env bằng 1 lệnh** (Git Bash, tại thư mục repo):

```bash
DOCKERHUB_USERNAME=<user> DOCKERHUB_TOKEN=<token> bash scripts/setup-github-secrets.sh
```

Sửa `~/.homeshop/prod.env` (vd. thêm Google/Facebook OAuth) → chạy lại lệnh trên để cập nhật `PROD_ENV_FILE` rồi push/chạy lại pipeline. Đổi token Docker Hub: `gh secret set DOCKERHUB_TOKEN` (lệnh tự hỏi giá trị).

Thiếu mục nào thì pipeline dừng ngay ở bước *"Kiểm tra cấu hình Docker Hub"* / *"Kiểm tra secrets deploy"* kèm tên mục còn thiếu.

### 2.5. Deploy

**Tự động (đang dùng):**
```bash
git push origin main                              # hoặc chạy tay: gh workflow run production-cicd.yml --ref main
```
Pipeline: **(1a Security & Quality ‖ 1b Integration Test ‖ 1c IaC Scan) → 2 Build/Scan/Push → 3 Deploy → 4 Notify**.
Deploy trên EC2 (`scripts/deploy.sh`): pull image → migrate → **seed idempotent** → rolling update từng service (không gián đoạn) → cấp/gia hạn TLS → health check sau 30s → **tự rollback** nếu lỗi. Pull request chỉ chạy 3 job kiểm tra.

**Thủ công (dự phòng khi GitHub Actions/Docker Hub gặp sự cố; cách đã dùng cho lần deploy đầu):**
```bash
T=$(git rev-parse HEAD)
docker build -t homeshop/home-shopping-backend:$T backend
docker build -t homeshop/home-shopping-frontend:$T frontend
tar -czf - docker-compose.prod.yml nginx monitoring scripts | ssh ubuntu@<EIP> 'cd /opt/homeshop && tar -xzf -'
{ cat ~/.homeshop/prod.env; echo DOCKERHUB_USERNAME=homeshop; } | ssh ubuntu@<EIP> 'umask 077 && cat > /opt/homeshop/.env'
docker save homeshop/home-shopping-backend:$T homeshop/home-shopping-frontend:$T | gzip -1 | ssh ubuntu@<EIP> 'gunzip | docker load'
ssh ubuntu@<EIP> "cd /opt/homeshop && SKIP_PULL=1 bash scripts/deploy.sh $T"
```

### 2.6. Docker Hub (registry image)

**Vai trò:** kho trung gian giữa CI và server: `GitHub Actions --build+push--> Docker Hub --pull--> EC2`. EC2 (2 GB RAM) không phải tự build; chỉ chạy đúng image đã qua test + Trivy; rollback = pull lại tag SHA cũ trong vài giây.

| Repo | Visibility | Lý do |
|---|---|---|
| `home-shopping-backend` | 🔒 **Private** (từ 06/11/2026) | Chứa logic nghiệp vụ, API, xác thực, Prisma schema → không cho người ngoài tải về |
| `home-shopping-frontend` | Public | Gói Personal chỉ có **1 repo private**; JS frontend vốn được trình duyệt tải công khai nên để public không lộ thêm gì. Muốn private cả 2 → Docker Pro |

- Image **không chứa secret** (mật khẩu DB, JWT… nằm ở `.env` trên EC2, nạp qua secret `PROD_ENV_FILE`); Gitleaks + Trivy `scanners: secret` kiểm tra mỗi lần build.
- Repo private vẫn deploy được vì job Deploy chạy `docker login --password-stdin` trên EC2 bằng `DOCKERHUB_TOKEN` trước khi `deploy.sh` pull (đã kiểm chứng ở run #42078341186).
- Kiểm tra từ bên ngoài: `curl -s -o /dev/null -w '%{http_code}' https://hub.docker.com/v2/repositories/anhquocnguyen2005/home-shopping-backend/` → `404` (người ngoài không thấy).
- Đổi token: tạo token mới (Read & Write) trên Docker Hub → `gh secret set DOCKERHUB_TOKEN` → chạy lại pipeline → xóa token cũ.

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
| Job Build đỏ ở "Login Docker Hub" (`Username and password required`) | Chưa có `DOCKERHUB_USERNAME/TOKEN` | Thêm secrets (mục 2.4); pipeline giờ có bước kiểm tra báo rõ mục thiếu |
| Job Build báo `trivy: command not found` (exit 127) | Bước SARIF chạy `if: always()` dù build chưa xong → che mất lỗi thật | Chỉ chạy khi `steps.build.outcome == 'success'` |
| Job Deploy: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Repo dùng OIDC immutable subject (`repo:owner@id/repo@id:...`), trust policy chỉ có dạng cũ | Biến Terraform `github_oidc_sub_prefix`, apply role `homeshop-prod-github-deploy` |
| Người ngoài đăng nhập `admin@homeshop.local` trên production báo sai mật khẩu | Đó là tài khoản demo, chỉ seed khi `SEED_DEMO_DATA=true` (local) | Đúng thiết kế: production dùng `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` |

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
| `0f0f6f8` | Logo Google 4 màu & Facebook chính thức; Google luôn hiện màn hình chọn tài khoản, Facebook hỏi lại quyền email; trang Chính sách bảo mật / Điều khoản / Xóa dữ liệu; chức năng tự xóa tài khoản; hướng dẫn công khai ứng dụng Google/Facebook |
| `58b5b0a` | E2E: tên người dùng riêng cho test xóa tài khoản (tránh trùng email) |
| (hạ tầng) | Terraform tạo EC2 riêng, **deploy production thành công** tại https://13-214-14-196.sslip.io; cấu hình biến/secret không nhạy cảm trên GitHub |
| `3a3b932` | Google/Facebook chưa cấu hình: nút chỉ hiện dòng nhắc nhẹ, bỏ khung lỗi đỏ |
| `af2f79c` | CI: bước kiểm tra secrets trước build/deploy, `scripts/setup-github-secrets.sh`, bỏ lỗi trivy 127 gây nhiễu |
| `958f141` | IaC: OIDC trust policy chấp nhận sub dạng immutable → **CD tự động chạy thành công lần đầu** (05/11/2026) |
| `301e265` | Nâng `qs` 6.17.1 (backend) và `postcss` 8.5.32 (frontend) qua `overrides` → frontend 0 lỗ hổng |
| `6368107` | **Trang quản trị đầy đủ**: 8 tab (thêm Danh mục, Người dùng, Bản tin, Nhật ký), khóa tài khoản, ẩn/xóa sản phẩm, tìm kiếm & xuất CSV đơn hàng; bảng `admin_audit_logs`; +10 unit test, +8 e2e; `/products` chuyển về trang chủ; tài khoản khách đã tự xóa không còn tính là người dùng hoạt động |
| `a07fa0c` | `SEED_DEMO_CUSTOMERS`: production có sẵn 4 tài khoản khách demo để giảng viên đăng nhập thử; admin demo không bao giờ lên production |
| (Docker Hub) | Repo image backend chuyển **private** (06/11/2026), pipeline deploy vẫn xanh |
| `d298f9f` | Tiền số nguyên VND; mọi lỗi có `code` + `details`; dữ liệu 34 tỉnh / 3.321 xã |
| `a16a16d` | Vòng đời đơn 9 trạng thái kiểu Shopee, `order_status_history`, hủy có lý do, Đã nhận hàng, Mua lại, job tự hoàn thành |
| `e4c0a00` | Địa chỉ theo mã hành chính 2 cấp, phí ship theo vùng + cân nặng, snapshot sản phẩm/địa chỉ trong đơn |
| `605ab6a` | Voucher %, tiền, freeship; ví voucher; trừ lượt an toàn khi dùng đồng thời |
| `75ae45a` | Trang thanh toán: xem trước đơn, mua một phần giỏ, Mua ngay, `PRICE_CHANGED` / `OUT_OF_STOCK` |
| `1b80f3b` | Thanh toán VNPay / MoMo / VietQR: IPN có chữ ký, idempotent, giữ hàng 15 phút, thanh toán lại, đổi phương thức, hoàn tiền |
| `6fccdcb` | Trả hàng/hoàn tiền có ảnh, admin duyệt/từ chối; tab quản trị Voucher, Trả hàng/Hoàn tiền |

**Database migrations:** `20261001000000_init` → `20261101000000_search_admin_indexes` → `20261102000000_reviews_oauth_sale` → `20261103000000_account_profile_addresses` (SĐT, giới tính, ngày sinh, bảng `addresses`, 1 địa chỉ mặc định/người dùng) → `20261106000000_admin_management` (`users.locked_at/locked_reason`, `products.is_active`, bảng `admin_audit_logs`; chỉ thêm cột/bảng nên bản cũ vẫn chạy được) → `20261111000000_integer_vnd` → `20261111010000_order_lifecycle` (đơn `PAID` cũ → `PROCESSING`) → `20261111020000_address_shipping_snapshot` → `20261111030000_vouchers` → `20261111040000_payments` → `20261111050000_return_requests`.

**API quản trị** (đều yêu cầu role ADMIN): `GET /api/admin/users[/export|/:id]` · `PATCH /api/admin/users/:id/role` · `POST /api/admin/users/:id/{lock,unlock,logout}` · `GET/POST /api/admin/categories` · `PATCH/DELETE /api/admin/categories/:id` · `GET /api/admin/products[/:id]` · `PATCH /api/admin/products/:id/active` · `DELETE /api/admin/products/:id` · `GET /api/admin/orders[/export|/:id]?q=&status=&from=&to=` · `GET /api/admin/reviews?q=&rating=&verified=` · `GET /api/admin/newsletter[/export]` · `DELETE /api/admin/newsletter/:id` · `GET /api/admin/audit-logs?q=&entityType=`.

**API mới gần đây:** `DELETE /api/account` · `PATCH /api/account/profile` · `POST /api/account/avatar` · `GET/POST /api/account/addresses` · `PUT/DELETE /api/account/addresses/:id` · `POST /api/account/addresses/:id/default` · `GET /api/products?minPrice=&maxPrice=` · `GET /api/products/summary` · `GET /api/media/avatars/:userId/:file`.

**API mua hàng & thanh toán (11/11/2026):** `POST /api/checkout/preview` · `POST /api/orders` (`cartProductIds` | `items`, `addressId`, `voucherCode`, `shippingVoucherCode`, `paymentMethod`, `note`, `expectedTotal`) · `GET /api/orders?tab=awaiting_payment|to_ship|shipping|completed|cancelled|return` · `POST /api/orders/:id/{cancel,received,buy-again}` · `GET/POST /api/orders/:id/payments` · `GET/POST /api/orders/:id/return` · `GET /api/payments/methods` · `GET /api/payments/ipn/vnpay` · `POST /api/payments/ipn/momo` · `POST /api/payments/mock/notify` · `GET /api/vouchers[/mine|/wallet]` · `POST /api/vouchers/save` · `GET /api/locations/provinces[/:code/wards]` · Admin: `GET/POST/PATCH /api/admin/vouchers` · `GET /api/admin/orders/:id/payments` · `POST /api/admin/payments/:id/confirm` · `GET /api/admin/refunds` · `POST /api/admin/refunds/:id/{retry,complete}` · `GET /api/admin/returns` · `POST /api/admin/returns/:id/{approve,reject}`.

**Bật thanh toán online thật (sandbox):** điền `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET` (đăng ký tại sandbox.vnpayment.vn) và/hoặc `MOMO_PARTNER_CODE` + `MOMO_ACCESS_KEY` + `MOMO_SECRET_KEY` vào `~/.homeshop/prod.env`, khai báo IPN URL `https://<domain>/api/payments/ipn/vnpay` trong cổng merchant VNPay, rồi nạp lại secret `PROD_ENV_FILE` và deploy. Chưa có khóa mà muốn demo luồng online: đặt `PAYMENT_MOCK_ENABLED=true`.

**Việc còn lại (tùy chọn):** đổi token Docker Hub định kỳ; bật *Required reviewers* cho environment `production`; nâng `@nestjs/core` lên 12 và `file-type` (5 lỗ hổng moderate còn lại); cấu hình `SMTP_URL` (Amazon SES) để gửi email thật; Google/Facebook OAuth cho production; Discord/Telegram để nhận cảnh báo; dùng tên miền riêng; chuyển Terraform state lên S3 backend.

---

## 5. Hủy hạ tầng (tránh phát sinh chi phí sau khi chấm)
```bash
cd terraform && terraform destroy
```
S3 bucket có `force_destroy = false` để bảo vệ backup: xóa object trong bucket trước (`aws s3 rm s3://homeshop-prod-assets-906457821730 --recursive`) nếu muốn destroy toàn bộ. Lệnh destroy chỉ xóa tài nguyên do Terraform tạo, **không đụng tới `luxe-server`**.
