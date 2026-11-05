# Báo cáo DevOps toàn tập – Home Shopping App

> Tài liệu ôn tập để báo cáo đồ án môn DevOps. Đọc theo thứ tự:
> **Phần 1–2** để nắm tổng thể → **Phần 3** để biết đã làm gì, theo thứ tự nào → **Phần 4** để hiểu sâu từng thành phần → **Phần 5** để tập demo → **Phần 6** (100+ câu hỏi) để luyện vấn đáp → **Phần 7–8** để chủ động nói điểm yếu và checklist trước giờ báo cáo.
>
> Tài liệu liên quan: [README.md](../README.md) (hướng dẫn chạy/triển khai) · [ARCHITECTURE.md](ARCHITECTURE.md) (sơ đồ Mermaid) · [DEFENSE-QA.md](DEFENSE-QA.md) (10 câu hỏi hóc búa, trả lời rất chi tiết).

---

## Mục lục

1. [Tóm tắt 1 phút (câu mở đầu khi báo cáo)](#1-tóm-tắt-1-phút)
2. [Tổng quan dự án & bản đồ công nghệ](#2-tổng-quan-dự-án--bản-đồ-công-nghệ)
3. [Nhật ký triển khai: đã làm những gì](#3-nhật-ký-triển-khai-đã-làm-những-gì)
4. [Giải thích từng thành phần DevOps](#4-giải-thích-từng-thành-phần-devops)
5. [Kịch bản demo 10 phút](#5-kịch-bản-demo-10-phút)
6. [Bộ câu hỏi vấn đáp & cách trả lời](#6-bộ-câu-hỏi-vấn-đáp--cách-trả-lời)
7. [Điểm yếu đã biết & hướng phát triển](#7-điểm-yếu-đã-biết--hướng-phát-triển)
8. [Checklist trước buổi báo cáo](#8-checklist-trước-buổi-báo-cáo)
9. [Bảng thuật ngữ](#9-bảng-thuật-ngữ)

---

## 1. Tóm tắt 1 phút

> "Đồ án của em là **web bán đồ gia dụng** (NestJS + Next.js + PostgreSQL + Redis), nhưng trọng tâm là **quy trình DevSecOps hoàn chỉnh** đưa code từ máy em lên production trên AWS **hoàn toàn tự động**:
>
> - **Hạ tầng là code (IaC):** toàn bộ VPC, EC2, S3, IAM, Security Group, CloudWatch được dựng bằng **Terraform**, dựng lại từ đầu trong khoảng 10 phút.
> - **CI/CD bằng GitHub Actions:** mỗi lần `git push` lên `main`, pipeline 4 tầng chạy: **kiểm tra bảo mật + test (3 job song song) → build image + quét lỗ hổng → deploy không gián đoạn có tự rollback → gửi thông báo**. Toàn bộ mất khoảng 6 phút.
> - **Bảo mật "shift-left":** Gitleaks quét secret, npm audit, Trivy quét image và IaC, Hadolint, ShellCheck; không lưu AWS access key nào trên GitHub nhờ **OIDC**.
> - **Container hóa:** Docker multi-stage, chạy non-root, filesystem read-only, image lưu trên **Docker Hub** (repo backend để private), gắn tag theo commit SHA để rollback chính xác.
> - **Vận hành:** Prometheus + Grafana + Loki + Alertmanager giám sát metrics, logs và cảnh báo; backup database hằng ngày lên S3 có kiểm tra toàn vẹn.
>
> Production đang chạy tại **https://13-214-14-196.sslip.io**, phiên bản đang chạy được trả về ở `/api/health` khớp với commit mới nhất trên GitHub."

---

## 2. Tổng quan dự án & bản đồ công nghệ

### 2.1. Ứng dụng

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Frontend | Next.js 15 (React 19), chạy `standalone` | Giao diện cửa hàng, trang quản trị, SSR |
| Backend | NestJS 10 (Node 20), Prisma ORM | REST API `/api/*`: sản phẩm, giỏ hàng, đơn hàng, xác thực JWT, OAuth, đánh giá |
| Database | PostgreSQL 16 | Dữ liệu chính (users, products, orders…) |
| Cache | Redis 7 | Giỏ hàng, cache sản phẩm, denylist token, khóa đăng nhập |
| Reverse proxy | Nginx 1.28 | TLS, rate limit, security headers, gzip, định tuyến `/` → frontend, `/api` → backend |
| TLS | Let's Encrypt + Certbot | Chứng chỉ HTTPS miễn phí, tự gia hạn |

### 2.2. Bản đồ công cụ DevOps theo vòng đời

```
 PLAN/CODE        BUILD            TEST              RELEASE           DEPLOY            OPERATE / MONITOR
 ─────────        ─────            ────              ───────           ──────            ─────────────────
 Git, GitHub      Docker           Jest unit (90)    Docker Hub        GitHub Actions    Prometheus, Grafana
 PR template      multi-stage      Jest e2e (31)     tag = SHA         OIDC → AWS        Loki + Promtail
 Dependabot       Buildx + cache   Postgres/Redis    + latest          SSH + deploy.sh   Alertmanager
 ESLint, tsc                       thật (service)                      rolling update    node/cAdvisor/pg/redis exporter
                                   Gitleaks, audit                     auto-rollback     CloudWatch auto-recover
                                   Trivy, Hadolint                                       Backup S3 (cron 02:00)
                                   ShellCheck, tf validate                               Discord/Telegram (tùy chọn)
 ─────────────────────────────────── IaC: Terraform (VPC, EC2, S3, IAM, SG, CloudWatch) ────────────────────────────
```

### 2.3. Sơ đồ luồng tổng thể

```
 Lập trình viên ──git push──▶ GitHub (repo QuocAnh-205/home-shopping-app)
                                  │
                                  ▼
                       GitHub Actions (runner Ubuntu)
   ┌──────────────────────────────┼───────────────────────────────┐
   │ 1a Security & Quality   1b Integration Test   1c IaC Scan    │  (song song)
   └──────────────────────────────┼───────────────────────────────┘
                                  ▼
                 2 Build image ─▶ Trivy quét ─▶ push Docker Hub (:sha, :latest)
                                  ▼
          3 Deploy: OIDC → AWS mở tạm port 22 cho IP runner ─▶ SSH vào EC2
                    ─▶ deploy.sh: pull image → migrate DB → seed → rolling update
                    ─▶ health check 30s → (lỗi thì rollback) ─▶ đóng port 22
                                  ▼
                 4 Notification (Discord/Telegram + tóm tắt trên GitHub)

 Người dùng ──HTTPS──▶ Elastic IP 13.214.14.196 ─▶ Security Group ─▶ EC2
                         └─ Nginx ─▶ frontend (Next.js) / backend (NestJS) ─▶ PostgreSQL, Redis
```

Sơ đồ chi tiết (Mermaid, hiển thị đẹp trên GitHub): [ARCHITECTURE.md](ARCHITECTURE.md).

### 2.4. Hạ tầng production hiện tại

| Hạng mục | Giá trị |
|---|---|
| Region | `ap-southeast-1` (Singapore, gần Việt Nam → độ trễ thấp) |
| Mạng | VPC riêng `10.20.0.0/16`, 1 public subnet, Internet Gateway |
| Máy chủ | EC2 `t3.small` (2 vCPU, 2 GB RAM + 4 GB swap), Ubuntu 22.04, ổ 30 GB gp3 mã hóa |
| IP | Elastic IP `13.214.14.196`, tên miền miễn phí `13-214-14-196.sslip.io` |
| Lưu trữ | S3 `homeshop-prod-assets-…`: ảnh upload + backup DB, mã hóa, bật versioning, chặn public |
| Container | 6 ứng dụng (nginx, frontend, backend, postgres, redis, certbot) + 9 giám sát |
| Chi phí | khoảng 25–28 USD/tháng |

---

## 3. Nhật ký triển khai: đã làm những gì

> Phần này kể lại **thứ tự công việc thực tế**. Khi thầy hỏi "em làm thế nào để có được kết quả này", trả lời theo đúng trình tự dưới đây.

### Giai đoạn 1 – Xây dựng ứng dụng & đóng gói (tháng 10/2026)
1. Khởi tạo monorepo: `backend/` (NestJS), `frontend/` (Next.js), `nginx/`, `terraform/`, `monitoring/`, `scripts/`.
2. Viết **Dockerfile multi-stage** cho backend và frontend (chạy user 1001, có `HEALTHCHECK`).
3. Viết `docker-compose.local.yml` để chạy toàn bộ stack trên máy (cổng 8088 do cổng 80 bị dự án khác chiếm) và `docker-compose.prod.yml` cho production (tách mạng `frontend-net`/`backend-net`, `read_only`, `cap_drop`).
4. Viết test: **90 unit test** (10 test suite) và **31 test e2e** chạy trên Postgres + Redis thật.

### Giai đoạn 2 – Hạ tầng bằng Terraform (01/11/2026)
1. Viết `terraform/main.tf` khoảng 30 tài nguyên: VPC, subnet, route table, Security Group, EC2, Elastic IP, S3 (+ mã hóa, versioning, lifecycle), IAM role cho EC2, IAM role cho GitHub OIDC, CloudWatch alarm tự phục hồi.
2. `terraform plan` → kiểm tra → `terraform apply`. EC2 tự cài đặt qua `scripts/user_data.sh`: swap, Docker, UFW, fail2ban, tự cập nhật bảo mật, cron backup 02:00.
3. Sự cố gặp phải: mô tả rule Security Group có dấu nháy `'` → AWS báo `Invalid rule description` → sửa.

### Giai đoạn 3 – Deploy thủ công lần đầu (01/11/2026)
Lúc đó chưa có Docker Hub nên build image trên máy, `docker save | ssh … docker load`, chạy `deploy.sh` với `SKIP_PULL=1`. Xin chứng chỉ Let's Encrypt, sửa vài lỗi (`.env` thiếu ngoặc kép, Nginx kẹt vòng restart khi chưa có cert, Alertmanager bắt buộc Discord).

### Giai đoạn 4 – Hoàn thiện CI/CD tự động (05–06/11/2026)
Pipeline đã viết sẵn nhưng 4 lần push liên tiếp đều đỏ. Cách điều tra: `gh run list` → `gh run view --log-failed` để đọc đúng dòng lỗi.

| # | Triệu chứng | Nguyên nhân gốc | Cách sửa |
|---|---|---|---|
| 1 | Job Build đỏ, lỗi `trivy: command not found` (exit 127) | **Lỗi gây nhiễu**: bước SARIF có `if: always()` nên vẫn chạy khi bước login Docker Hub đã lỗi → che mất lỗi thật | Chỉ chạy SARIF khi `steps.build.outcome == 'success'` |
| 2 | Lỗi thật: `Username and password required` | Repo chưa có `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `EC2_SSH_PRIVATE_KEY`, `EC2_SSH_KNOWN_HOSTS`, `PROD_ENV_FILE` | Viết `scripts/setup-github-secrets.sh` nạp cả 5 mục bằng `gh secret set`; thêm bước **preflight** kiểm tra secret, thiếu thì báo rõ tên |
| 3 | E2E test xóa tài khoản đỏ | Test dùng email trùng với test khác | Dùng tên người dùng riêng cho test (commit `58b5b0a`) |
| 4 | Sau khi có secret: Build ✅ nhưng Deploy đỏ: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Repo mới của GitHub bật **OIDC immutable subject**: token gửi `sub = repo:QuocAnh-205@189313150/home-shopping-app@1440229410:environment:production`, trust policy chỉ chấp nhận dạng cũ `repo:QuocAnh-205/home-shopping-app:...` | Thêm biến Terraform `github_oidc_sub_prefix`, chạy `terraform plan` (1 thay đổi) → `apply -target=aws_iam_role.github_deploy` (commit `958f141`) |
| 5 | PR Dependabot nâng `react-dom` đỏ (`ERESOLVE`) | Chỉ nâng `react-dom`, không nâng `react` → xung đột peer dependency | Pipeline chặn đúng → không merge PR này; phải nâng cả 2 cùng lúc |

Kết quả: run **#42001069726** xanh cả 7 job, `/api/health` trả `version: 958f141…`, tức **CD tự động chạy thành công lần đầu**.

### Giai đoạn 5 – Củng cố bảo mật & vận hành (05–06/11/2026)
1. **Vá dependency:** `qs` 6.14.3 → 6.17.1 (4 lỗ hổng DoS) và `postcss` 8.4.31 → 8.5.32 (lỗ hổng mức HIGH) bằng `overrides` trong `package.json`, tránh phải nâng major Next/Nest. Chạy lại unit test, lint, typecheck, `next build` và smoke test local trước khi push (commit `301e265`). Push xong pipeline **tự chạy** (event `push`) và deploy thành công.
2. **Docker Hub private:** chuyển repo `home-shopping-backend` sang **private**. Gói miễn phí chỉ có 1 repo private nên frontend để public: code JS frontend vốn được trình duyệt tải về công khai. Chạy lại pipeline (#42078341186) để chứng minh EC2 vẫn pull được image private nhờ `docker login` bằng token. Gọi API Docker Hub khi chưa đăng nhập trả **404**, tức người ngoài không thấy repo.
3. **UX:** nút Google/Facebook khi server chưa có Client ID/Secret chỉ hiện một dòng nhắc nhẹ thay cho khung lỗi đỏ (đọc trạng thái từ `GET /api/auth/oauth/providers`).

### Bằng chứng nên mở khi báo cáo
- GitHub → tab **Actions**: các run xanh `#42001069726`, `#42075996582` (push tự động), `#42078341186`.
- `curl https://13-214-14-196.sslip.io/api/health` → trường `version` = SHA commit mới nhất.
- Docker Hub: các tag `301e265`, `958f141`, `latest`; repo backend có nhãn Private.
- `git log --oneline`: các commit theo chuẩn Conventional Commits (`feat:`, `fix:`, `ci:`, `docs:`).

---

## 4. Giải thích từng thành phần DevOps

### 4.1. Git & GitHub (quản lý mã nguồn)
- **Monorepo:** frontend, backend, IaC, monitoring, scripts chung 1 repo → 1 commit thể hiện trọn vẹn một thay đổi (code + hạ tầng + cấu hình), dễ truy vết.
- **Conventional Commits:** `feat(auth): …`, `fix(iac): …`, `ci: …`, `docs: …` → lịch sử đọc được, có thể sinh changelog tự động.
- **Nhánh:** đang dùng **trunk-based** (push thẳng `main`), phù hợp dự án 1–2 người. Pull request chỉ chạy 3 job kiểm tra, không deploy (`if: github.event_name != 'pull_request'`).
- **Dependabot** (`.github/dependabot.yml`): hằng tuần mở PR cập nhật npm (backend, frontend), base image Docker, GitHub Actions; hằng tháng cho Terraform. Bỏ qua major version (cần review tay); PR vẫn phải qua toàn bộ CI.
- **PR template** (`.github/pull_request_template.md`): checklist khi review.
- `.gitignore` chặn `.env`, `*.tfvars`, state Terraform → secret không bao giờ vào Git.

### 4.2. Docker (đóng gói)
- **Multi-stage build:** `base → deps → build → prod-deps → runtime`. Image cuối chỉ chứa code đã biên dịch và dependency production, không có TypeScript compiler hay devDependencies → nhỏ hơn, ít CVE hơn, build nhanh nhờ cache layer `npm ci`.
- **Bảo mật container:**
  - chạy `USER 1001:1001` (không phải root);
  - compose đặt `read_only: true`, `cap_drop: [ALL]`, `security_opt: no-new-privileges`;
  - file code thuộc root nên app không tự sửa được code của chính nó.
- **HEALTHCHECK:** backend gọi `/api/health` (kiểm tra cả DB và Redis) mỗi 15 giây. Docker biết container "healthy" thật hay chỉ "đang chạy"; `deploy.sh` dựa vào trạng thái này để quyết định chuyển traffic.
- **Hadolint** lint Dockerfile trong CI (cấu hình `.hadolint.yaml`).

### 4.3. Docker Compose (điều phối trên 1 máy)
- `docker-compose.local.yml`: dev trên máy, có Mailpit bắt email, seed dữ liệu demo.
- `docker-compose.prod.yml`: production.
  - `backend-net` là mạng `internal: true`: Postgres và Redis không có cổng ra ngoài, không ra được Internet;
  - chỉ Nginx publish 80/443;
  - `restart: unless-stopped`, giới hạn log, healthcheck.
- `monitoring/docker-compose.monitoring.yml`: 9 container giám sát, chạy project riêng `homeshop-monitoring`. Lỗi monitoring không làm hỏng ứng dụng.
- **Vì sao không dùng Kubernetes?** Với 1 máy 2 GB RAM, chạy K8s (control plane, etcd…) tốn tài nguyên hơn chính ứng dụng. Compose đủ đáp ứng rolling update, healthcheck, network isolation. Khi cần scale nhiều máy thì chuyển sang ECS/EKS (image đã chuẩn OCI nên không phải sửa).

### 4.4. Docker Hub (container registry)
- **Vai trò:** kho trung gian giữa CI và server. CI build một lần, server chỉ `pull` và chạy.
  1. EC2 2 GB RAM không phải build Next.js (rất tốn RAM, chậm).
  2. **"Build once, deploy many":** image chạy trên production chính là image đã qua test + Trivy, không build lại nên không lệch.
  3. **Rollback nhanh:** mỗi image gắn tag commit SHA (bất biến), muốn quay lại chỉ cần pull tag cũ (vài giây).
- **Tag:** `:<sha>` dùng để deploy; `:latest` chỉ để tham chiếu cho tiện.
- **Private:** repo backend private, chỉ ai có token mới pull được. Token Docker Hub lưu ở GitHub Secret `DOCKERHUB_TOKEN`, được truyền qua `stdin` sang EC2 (`docker login --password-stdin`), không xuất hiện trong log hay process list.
- **Image không chứa secret:** cấu hình nhạy cảm nằm ở `.env` trên EC2 (theo nguyên tắc 12-factor: config tách khỏi code).

### 4.5. CI – Continuous Integration (`.github/workflows/production-cicd.yml`)

Kích hoạt khi: `push` lên `main` (bỏ qua nếu chỉ sửa `*.md`/`docs/`), `pull_request` vào `main`, hoặc chạy tay `workflow_dispatch`.

| Job | Chạy gì | Mục đích |
|---|---|---|
| **1a · Security & Code Quality** | Gitleaks (quét secret toàn bộ lịch sử) → `npm ci` → `prisma generate` → typecheck → **unit test + coverage** → ESLint + typecheck frontend → `npm audit --omit=dev --audit-level=critical` → upload coverage → SonarCloud (nếu có token) | Phát hiện lỗi code, lộ secret, thư viện có lỗ hổng nghiêm trọng |
| **1b · Integration Test** | Service containers **Postgres 16 + Redis 7 thật** → `prisma migrate deploy` (giống production) → **kiểm tra schema drift** → seed chạy 2 lần (kiểm tra idempotent) → **31 test e2e** | Chứng minh code chạy đúng trên DB thật: mua đồng thời, idempotency, RBAC, thu hồi token, khóa tài khoản |
| **1c · IaC & Config Scan** | Hadolint, `terraform fmt -check` + `validate`, **Trivy config** (Terraform + Dockerfile), ShellCheck, `promtool check`, `docker compose config` | "Hạ tầng là code thì cũng phải được test" |

- 3 job chạy **song song** để rút ngắn thời gian; job 2 chỉ chạy khi cả 3 đều pass (`needs:`).
- **Cache:** `actions/setup-node` cache npm; Docker Buildx cache `type=gha`.
- **`concurrency: production-${{ github.ref }}`** với `cancel-in-progress: false`: không bao giờ có 2 lần deploy chồng nhau, và không hủy giữa chừng một lần đang deploy dở.
- **`permissions: contents: read`** mặc định, mỗi job chỉ xin thêm đúng quyền cần (least privilege cho `GITHUB_TOKEN`).

### 4.6. Build, Scan & Push (job 2)
- **Matrix** `[backend, frontend]` chạy song song, `fail-fast: true`.
- Thứ tự: **preflight kiểm tra secret** → Buildx → login Docker Hub → build (`load: true`, chưa push) → **Trivy quét image**: có lỗ hổng CRITICAL *đã có bản vá* thì **chặn pipeline** (`exit-code: 1`, `ignore-unfixed: true`) → xuất báo cáo SARIF (HIGH + CRITICAL) lên tab Security → **push** tag SHA + latest (thử lại 3 lần nếu mạng lỗi).
- **Quét trước khi push** → image có lỗ hổng không bao giờ lên registry.
- Gắn label OCI `org.opencontainers.image.revision` = SHA để truy vết image về đúng commit.

### 4.7. CD – Continuous Deployment (job 3 + `scripts/deploy.sh`)

**Job 3 trên GitHub Actions:**
1. Preflight kiểm tra đủ 6 secret/biến deploy.
2. **OIDC → AWS:** GitHub cấp token ngắn hạn, AWS STS đổi lấy credentials tạm thời (tối đa 1 giờ) của role `homeshop-prod-github-deploy`. **Không có access key nào lưu trên GitHub.**
3. Mở port 22 trên Security Group **chỉ cho IP của runner** (`/32`).
4. Cài SSH key + `known_hosts` (chống man-in-the-middle, `StrictHostKeyChecking yes`).
5. `rsync` file cấu hình lên `/opt/homeshop`; ghi `.env` qua **stdin** với `umask 077`; `docker login` bằng stdin.
6. SSH chạy `deploy.sh <sha>`, đọc mã thoát: `0` = thành công, `2` = đã rollback, khác = lỗi.
7. Smoke test `https://…/api/health` qua Internet.
8. **Luôn đóng port 22** (`if: always()`) và xóa SSH key, kể cả khi deploy lỗi.

**`deploy.sh` trên EC2:**
1. Pull image theo SHA (lỗi → dừng, bản đang chạy không bị ảnh hưởng).
2. Đảm bảo Postgres + Redis chạy (`--wait`).
3. **Migration** `prisma migrate deploy` **trước** khi đổi code (forward-only, expand/contract).
4. Seed idempotent (sản phẩm, admin đầu tiên).
5. **Rolling update** từng service: scale 1 → 2 (bản cũ + bản mới) → chờ bản mới `healthy` → chờ 7 giây để Nginx nhận IP mới qua Docker DNS → `docker stop -t 30` bản cũ (graceful shutdown) → **không mất request**.
6. Kiểm tra TLS, reload Nginx (`nginx -t` trước).
7. Chờ 30 giây → health check 5 lần; không đạt HTTP 200 → **tự rollback** về `previous_tag`.
8. Lưu `current_tag`/`previous_tag`, cập nhật monitoring, `docker image prune` để không đầy ổ cứng.
9. Ghi log từng lần deploy vào `.deploy/deploy-*.log` (giữ 14 ngày).

**Phân biệt thuật ngữ:** dự án này là **Continuous Deployment** (push là lên production, không cần bấm). Nếu bật *Required reviewers* cho environment `production` thì sẽ thành **Continuous Delivery** (có bước duyệt tay).

### 4.8. Terraform (Infrastructure as Code)
- **Khai báo (declarative):** mô tả trạng thái mong muốn; Terraform tự tính phải tạo, sửa, xóa gì (`plan`) rồi mới thực hiện (`apply`).
- **Tài nguyên:** VPC, subnet, IGW, route table, SG (rule tách riêng từng cổng), EC2 (IMDSv2 bắt buộc, ổ mã hóa), EIP, S3 (block public, versioning, SSE, lifecycle xóa backup cũ), IAM role EC2 (least privilege, có SSM), IAM role GitHub (chỉ được thêm/xóa rule của đúng 1 SG), CloudWatch alarm `ec2:recover`.
- **`validation`:** cấm `ssh_allowed_cidrs`/`grafana_allowed_cidrs` là `0.0.0.0/0`; kiểm tra định dạng `github_repository`, `github_oidc_sub_prefix`, dung lượng ổ.
- **State:** đang lưu **local** (`terraform.tfstate`, đã `.gitignore`). Đây là điểm yếu đã biết (xem Phần 7); hướng sửa là S3 backend + khóa state.
- **Ví dụ thực tế:** sửa trust policy OIDC thì `plan` báo đúng `1 to change, 0 to destroy`, dùng `-target` để chỉ áp dụng cho role đó, không đụng EC2.

### 4.9. AWS & bảo mật mạng
- **Security Group** (tường lửa stateful của AWS, ngoài máy ảo): 80/443 mở cho mọi người; 22 và 3001 (Grafana) chỉ cho IP whitelist; 22 mở thêm *tạm thời* cho runner GitHub khi deploy.
- **UFW + fail2ban** trên máy: lớp thứ 2. Docker publish port sẽ bypass UFW, nên lớp chặn chính là SG (xem DEFENSE-QA câu 3).
- **IAM Instance Profile + IMDSv2:** EC2 truy cập S3 bằng credentials tạm thời, không có access key trên máy; IMDSv2 chống tấn công SSRF đánh cắp credentials.
- **S3 least privilege:** EC2 chỉ Put/Get vào `backups/*`, không xóa được. Nếu máy bị ransomware thì kẻ tấn công cũng không xóa được backup; bucket có versioning.
- **CloudWatch auto-recover:** phần cứng AWS hỏng thì EC2 tự khôi phục, giữ nguyên IP và ổ đĩa.

### 4.10. Quản lý secret
| Secret | Lưu ở đâu | Dùng để |
|---|---|---|
| `DOCKERHUB_TOKEN` (+ biến `DOCKERHUB_USERNAME`) | GitHub Secrets | CI push image; EC2 pull image |
| `EC2_SSH_PRIVATE_KEY`, `EC2_SSH_KNOWN_HOSTS` | GitHub Secrets | SSH vào EC2 an toàn |
| `PROD_ENV_FILE` | GitHub Secrets (bản gốc `~/.homeshop/prod.env` trên máy cá nhân) | Ghi `.env` production: mật khẩu DB/Redis, JWT secret, Grafana… |
| `AWS_DEPLOY_ROLE_ARN`, `AWS_SECURITY_GROUP_ID` | GitHub Secrets | OIDC assume role, mở/đóng port 22 |
| AWS credentials | **Không lưu**: OIDC cấp tạm thời | — |

- Commit message được truyền vào script qua `env:` chứ không chèn `${{ }}` trực tiếp → chống **script injection**.
- Gitleaks chặn commit chứa secret; cấu hình ngoại lệ ở `.gitleaks.toml`.

### 4.11. DevSecOps – bảo mật tích hợp vào pipeline
| Loại | Công cụ | Ở đâu |
|---|---|---|
| Secret scanning | Gitleaks; Trivy `scanners: secret` | Job 1a; job 2 |
| SCA (thư viện bên thứ 3) | `npm audit`, Trivy image (OS + library), Dependabot | Job 1a; job 2; hằng tuần |
| SAST (phân tích mã nguồn) | ESLint, TypeScript strict, SonarCloud (khi có `SONAR_TOKEN`) | Job 1a |
| IaC scanning | Trivy config, Hadolint, ShellCheck, `terraform validate` | Job 1c |
| Container hardening | non-root, read-only, cap_drop, no-new-privileges | Dockerfile, compose |
| Runtime | Nginx rate limit, security headers (HSTS, CSP, X-Frame-Options…), TLS 1.2/1.3 | `nginx/` |

### 4.12. Giám sát, log & cảnh báo (Observability)
- **Metrics – Prometheus:**
  - node-exporter cho máy, cAdvisor cho container, postgres-exporter, redis-exporter;
  - backend tự xuất `/api/metrics` (prom-client): `http_requests_total`, `http_request_duration_seconds`, `shop_orders_total`…
  - Áp dụng phương pháp **USE** cho hạ tầng (Utilization, Saturation, Errors) và **RED** cho ứng dụng (Rate, Errors, Duration).
- **Logs – Loki + Promtail:** log JSON có cấu trúc (pino), có `request_id` xuyên suốt Nginx → backend; đã che `authorization`/`password`.
- **Dashboard – Grafana** (cổng 3001, chỉ IP whitelist).
- **Cảnh báo – Alertmanager:**
  - các ngưỡng: CPU > 85%, ổ đĩa < 15%, tỉ lệ 5xx > 5%, p95 > 1s, Postgres/Redis down, backup quá 26 giờ, nghi ngờ brute-force;
  - critical gửi Discord + Telegram (khi cấu hình webhook);
  - **inhibit rule:** DB down thì không spam cảnh báo 5xx, chỉ báo nguyên nhân gốc.

### 4.13. Backup & khôi phục (DR)
- Cron **02:00 hằng ngày** chạy `backup-db.sh`:
  - `pg_dump | gzip` với `pipefail`, rồi `gzip -t` kiểm tra file;
  - kiểm tra dòng kết thúc của dump, tính SHA256;
  - upload S3 (mã hóa) và so lại dung lượng;
  - ghi metric cho Prometheus; `flock` chống chạy chồng; lỗi thì báo Discord.
- `restore-db.sh`: kiểm tra checksum, chụp snapshot trước khi ghi đè, restore trong `--single-transaction`.
- **RPO 24 giờ** (mất tối đa 1 ngày dữ liệu), **RTO khoảng 15 phút** (`terraform apply` + deploy + restore).

### 4.14. Thông báo
Job 4 luôn chạy (`if: always()`). Nó tổng hợp kết quả từng job thành trạng thái (✅ thành công / ⚠️ đã rollback / ❌ lỗi ở job nào / 🔍 PR passed) và gửi Discord embed + Telegram nếu có webhook, đồng thời ghi tóm tắt lên trang run của GitHub.

---

## 5. Kịch bản demo 10 phút

> Chuẩn bị trước: mở sẵn các tab (GitHub Actions, Docker Hub, website, Grafana), terminal ở thư mục repo. Nên quay video dự phòng phòng khi mạng chậm.

| Phút | Làm gì | Nói gì |
|---|---|---|
| 0–1 | Mở website production, đăng nhập admin, mở `/api/health` | "Hệ thống đang chạy trên AWS; `version` chính là commit SHA đang chạy" |
| 1–2 | Mở `terraform/main.tf` lướt các resource; chạy `terraform output` | "Toàn bộ hạ tầng là code, không bấm tay trên console" |
| 2–3 | Sửa một dòng nhỏ dễ thấy (ví dụ text footer) → `git commit` → `git push` | "Em chỉ push, mọi thứ còn lại tự động" |
| 3–7 | Mở tab Actions, giải thích từng job khi đang chạy: 3 job song song → build + Trivy → deploy | Giải thích preflight, OIDC, mở/đóng port 22, rolling update |
| 7–8 | Docker Hub: tag mới vừa xuất hiện; repo backend có nhãn Private | "Image gắn tag theo SHA để rollback chính xác" |
| 8–9 | Refresh website thấy thay đổi; `/api/health` hiện SHA mới | "Không có downtime trong lúc deploy" |
| 9–10 | Grafana: dashboard CPU/RAM/request; hoặc mở log Loki lọc `service="backend"` | "Giám sát và cảnh báo khi có sự cố" |

**Demo nâng cao (nếu thầy yêu cầu):**
- **Rollback:**
  - Cách 1: cố tình làm health check lỗi trên một nhánh thử nghiệm, chỉ khi đã chuẩn bị kỹ. Không làm trực tiếp trên production trong giờ báo cáo nếu chưa tập.
  - Cách 2 (an toàn hơn): mở `scripts/deploy.sh` giải thích hàm `rollback()` và chỉ log rollback (nếu có).
- **Pipeline chặn lỗi:** mở run cũ có job đỏ (ví dụ PR Dependabot `react-dom` bị `ERESOLVE`, hoặc run thiếu secret báo `Thiếu cấu hình GitHub Actions: ...`) để chứng minh pipeline biết dừng.
- **Bảo mật:** `curl` API Docker Hub repo backend trả 404 khi chưa đăng nhập; trong AWS Console, port 22 không mở cho `0.0.0.0/0`.

---

## 6. Bộ câu hỏi vấn đáp & cách trả lời

> Khung trả lời ghi điểm: **Định nghĩa ngắn → Trong đồ án em làm thế nào (chỉ file) → Vì sao chọn cách đó (trade-off) → Nếu mở rộng thì làm gì.**
> ⭐ = câu rất hay được hỏi. Câu trả lời dài hơn cho một số câu khó có trong [DEFENSE-QA.md](DEFENSE-QA.md).

### A. Khái niệm DevOps chung

**A1 ⭐. DevOps là gì? Khác gì Agile?**
DevOps là văn hóa + thực hành + công cụ giúp Dev và Ops cùng chịu trách nhiệm đưa phần mềm tới người dùng nhanh và ổn định, nhờ tự động hóa (CI/CD, IaC), đo lường (monitoring) và phản hồi liên tục. Agile tối ưu cách *phát triển* (sprint, backlog); DevOps nối dài Agile tới *triển khai và vận hành*. Trong đồ án: 1 lệnh `git push` đưa code từ máy em lên production trong khoảng 6 phút, có kiểm tra và giám sát.

**A2 ⭐. CI, Continuous Delivery, Continuous Deployment khác nhau thế nào? Đồ án em là loại nào?**
- CI: mỗi lần push đều tự build + test.
- Continuous Delivery: luôn có bản sẵn sàng deploy, nhưng có bước bấm duyệt tay.
- Continuous Deployment: qua hết kiểm tra là tự lên production.
Đồ án là **Continuous Deployment**. Bật *Required reviewers* cho environment `production` sẽ chuyển thành Delivery.

**A3. Vòng đời DevOps gồm những giai đoạn nào? Đồ án dùng công cụ gì ở mỗi giai đoạn?**
Plan – Code – Build – Test – Release – Deploy – Operate – Monitor. Công cụ tương ứng ở bảng mục 2.2.

**A4. "Shift-left" là gì?**
Đưa kiểm tra (test, bảo mật) về sớm nhất có thể trong quy trình, vì lỗi phát hiện càng sớm càng rẻ. Ví dụ: Gitleaks, npm audit, Trivy config chạy ngay ở job 1, trước khi build.

**A5. DevSecOps khác DevOps thế nào?**
DevSecOps tích hợp bảo mật vào từng bước của pipeline thay vì kiểm tra bảo mật một lần cuối. Bảng mục 4.11 liệt kê các công cụ: secret scanning, SCA, SAST, IaC scan, container hardening.

**A6. 4 chỉ số DORA là gì? Đồ án đạt mức nào?**
- Deployment Frequency: deploy bất cứ khi nào push, có thể nhiều lần/ngày.
- Lead Time for Changes: khoảng 6 phút từ push tới production.
- Change Failure Rate: có health check + rollback để giảm thiểu.
- MTTR: rollback tự động trong vài phút; mất cả máy thì RTO khoảng 15 phút.
Lead time và tần suất deploy thuộc nhóm "elite".

**A7. 12-Factor App là gì? Đồ án tuân theo những yếu tố nào?**
- Config qua biến môi trường (`.env`, không hard-code).
- Backing services (DB, Redis) gắn qua URL.
- Build/release/run tách bạch (image SHA).
- Process stateless (state ở DB/Redis).
- Log ra stdout dạng JSON.
- Dev/prod parity (cùng Docker image).
- Disposability (graceful shutdown 30s).

**A8. Pets vs Cattle? Immutable infrastructure?**
Server/container nên "thay thế được" thay vì sửa tay. Đồ án không SSH vào sửa code: mỗi lần deploy tạo container mới từ image bất biến, xóa container cũ; EC2 dựng lại được bằng Terraform + `user_data.sh`.

### B. Git & quản lý mã nguồn

**B1. Em dùng chiến lược phân nhánh nào? Vì sao?**
Trunk-based (làm việc trực tiếp trên `main`, commit nhỏ, CI chạy mỗi commit), phù hợp nhóm nhỏ. PR vẫn chạy 3 job kiểm tra. Hướng mở rộng: bật branch protection bắt buộc PR + CI xanh trước khi merge.

**B2. Conventional Commits là gì, lợi ích?**
Format `type(scope): mô tả` (`feat`, `fix`, `ci`, `docs`, `chore`…): lịch sử dễ đọc, sinh changelog/semver tự động, review nhanh.

**B3. Làm sao đảm bảo không commit secret lên Git?**
`.gitignore` (`.env`, `*.tfvars`, state); Gitleaks quét **toàn bộ lịch sử** trong CI, phát hiện là pipeline đỏ; secret thật nằm ở GitHub Secrets.

**B4. Lỡ commit secret rồi thì làm gì?**
Coi như secret đã lộ: **thu hồi/đổi secret ngay** (quan trọng nhất), sau đó mới xóa khỏi lịch sử (`git filter-repo`/BFG) và force-push. Xóa lịch sử mà không đổi secret là vô ích vì có thể đã bị sao chép.

**B5. Dependabot làm gì?**
Tự mở PR cập nhật dependency hằng tuần (npm, Docker base image, GitHub Actions, Terraform), gom nhóm (`@nestjs/*`, `prisma`…), bỏ qua major. PR phải qua CI. Ví dụ thực tế: PR `react-dom 19.3.1` bị CI chặn vì xung đột với `react 19.2.0`.

### C. Docker & container

**C1 ⭐. Container khác máy ảo (VM) thế nào?**
VM ảo hóa phần cứng, mỗi VM có kernel riêng (nặng, khởi động chậm). Container chia sẻ kernel host, cô lập bằng namespaces + cgroups (nhẹ, khởi động vài giây). Đồ án dùng cả hai: EC2 là VM, bên trong chạy 15 container.

**C2 ⭐. Multi-stage build là gì? Lợi ích?**
Nhiều `FROM` trong 1 Dockerfile; stage build có compiler/devDependencies, stage cuối chỉ copy kết quả. Image nhỏ hơn, ít lỗ hổng hơn, không lộ source TypeScript. Xem `backend/Dockerfile` (5 stage).

**C3. Image và container khác nhau thế nào? Layer là gì?**
Image là template chỉ đọc gồm nhiều layer (mỗi lệnh Dockerfile một layer, có cache); container là instance đang chạy của image, có thêm lớp ghi. Đặt `COPY package*.json` + `npm ci` trước `COPY src` để tận dụng cache.

**C4. Vì sao chạy container bằng user non-root?**
Nếu app bị chiếm quyền, kẻ tấn công chỉ có quyền user 1001, khó thoát ra host. Kết hợp `read_only`, `cap_drop: ALL`, `no-new-privileges`.

**C5. HEALTHCHECK để làm gì? Khác gì "container đang chạy"?**
Container "running" chưa chắc app phục vụ được (ví dụ chưa kết nối DB). HEALTHCHECK gọi `/api/health` kiểm tra DB + Redis; `deploy.sh` chỉ chuyển traffic khi bản mới **healthy**.

**C6. Docker Compose dùng để làm gì? Vì sao tách nhiều network?**
Khai báo và chạy nhiều container liên quan bằng 1 file. Tách `frontend-net` / `backend-net` (internal) để DB/Redis không ai từ ngoài chạm tới được, chỉ backend nối được cả 2 mạng (phân vùng mạng, defense in depth).

**C7. Volume là gì? Dữ liệu DB lưu ở đâu?**
Named volume Docker cho Postgres/Redis, nên xóa/tạo lại container không mất dữ liệu. Ngoài ra có backup hằng ngày lên S3.

**C8 ⭐. Vì sao không dùng Kubernetes?**
Quy mô 1 máy 2 GB RAM: K8s tốn tài nguyên, phức tạp hơn nhu cầu. Compose + `deploy.sh` vẫn có rolling update, healthcheck, rollback. Khi cần HA/autoscale thì chuyển sang ECS Fargate hoặc EKS, image OCI dùng lại được nguyên vẹn.

**C9. `.dockerignore` để làm gì?**
Loại `node_modules`, `.git`, `.env`… khỏi build context: build nhanh hơn, không vô tình đưa secret vào image.

**C10. Hadolint kiểm tra gì?**
Lỗi và best practice Dockerfile: pin version, gộp `RUN`, không dùng `latest`, dùng `COPY` thay `ADD`…

### D. Docker Hub & registry

**D1 ⭐. Docker Hub dùng để làm gì trong đồ án?**
Kho chứa image giữa CI và server: CI build + quét + push; EC2 chỉ pull và chạy. Lợi ích: server yếu không phải build, chạy đúng image đã test, rollback nhanh bằng tag SHA (mục 4.4).

**D2 ⭐. Vì sao tag image bằng commit SHA thay vì chỉ `latest`?**
`latest` thay đổi liên tục nên không biết đang chạy bản nào và không rollback chính xác được. SHA **bất biến**, truy vết từ container về đúng commit; `/api/health` trả về SHA đó.

**D3. Vì sao chuyển repo backend sang private? Frontend sao vẫn public?**
Backend chứa logic nghiệp vụ, xác thực, schema DB nên không muốn người ngoài tải về phân tích. Gói Docker Hub miễn phí chỉ có 1 repo private; frontend JS vốn được trình duyệt tải công khai khi người dùng vào web nên public không lộ thêm gì. Muốn private cả 2 thì dùng Docker Pro hoặc chuyển sang Amazon ECR / GitHub Container Registry.

**D4. Repo private thì EC2 pull kiểu gì?**
Job deploy chạy `printf token | ssh prod "docker login --password-stdin"` (token đi qua stdin, không lộ ở log/process list), sau đó `deploy.sh` pull bình thường. Đã kiểm chứng ở run #42078341186.

**D5. Image có chứa mật khẩu không?**
Không. Mật khẩu nằm ở `.env` trên EC2 (nạp từ secret `PROD_ENV_FILE`). Trivy `scanners: secret` và Gitleaks kiểm tra mỗi lần build.

**D6. Vì sao không dùng Amazon ECR?**
Docker Hub miễn phí, đơn giản, không cần cấu hình IAM thêm. ECR tích hợp IAM tốt hơn (EC2 pull bằng instance role, không cần token), quét ảnh sẵn; đây là hướng nâng cấp hợp lý.

**D7. Token Docker Hub bị lộ thì sao?**
Tạo token mới → `gh secret set DOCKERHUB_TOKEN` → chạy lại pipeline → **xóa token cũ** trên Docker Hub. Token chỉ có quyền Read & Write repo, không đổi được mật khẩu tài khoản.

### E. CI/CD với GitHub Actions

**E1 ⭐. Mô tả pipeline của em.**
4 tầng: (1a Security & Quality ‖ 1b Integration Test ‖ 1c IaC Scan) → 2 Build, Trivy, Push (matrix FE/BE) → 3 Deploy EC2 (OIDC, rolling update, health check, rollback) → 4 Notification. Chi tiết mục 4.5–4.7.

**E2. Pipeline được kích hoạt khi nào?**
Push vào `main` (trừ khi chỉ sửa `*.md`/`docs/`), pull request vào `main` (chỉ chạy job kiểm tra), và chạy tay (`workflow_dispatch`).

**E3. Vì sao 3 job đầu chạy song song?**
Chúng độc lập nhau nên chạy song song rút ngắn thời gian; job build dùng `needs:` chờ cả 3 pass.

**E4. `needs`, `if`, `matrix`, `concurrency` dùng để làm gì?**
- `needs`: thứ tự phụ thuộc giữa các job.
- `if`: điều kiện (không deploy khi là PR; luôn chạy notify/đóng port).
- `matrix`: build backend và frontend song song bằng 1 định nghĩa job.
- `concurrency`: không cho 2 lần deploy chạy chồng nhau.

**E5. Secret trong GitHub Actions được bảo vệ thế nào?**
Mã hóa, tự che (`***`) trong log, không truyền cho workflow từ fork. Em dùng thêm `::add-mask::` cho IP runner, truyền secret qua `env:`/stdin, không echo ra log.

**E6. Script injection trong GitHub Actions là gì? Em phòng thế nào?**
Nếu chèn `${{ github.event.head_commit.message }}` thẳng vào `run:`, kẻ xấu có thể đặt commit message chứa lệnh shell. Em truyền qua biến môi trường `COMMIT_MSG` rồi dùng `"$COMMIT_MSG"`.

**E7. Cache trong pipeline?**
`setup-node` cache thư mục npm theo `package-lock.json`; Docker Buildx cache layer bằng `type=gha` → build lại nhanh khi dependency không đổi.

**E8. Artifact là gì? Em lưu artifact gì?**
File sinh ra trong job, lưu lại để tải về: báo cáo coverage backend (giữ 7 ngày), báo cáo Gitleaks; báo cáo Trivy dạng SARIF hiển thị ở tab Security.

**E9 ⭐. Nếu test fail thì sao?**
Job 1 đỏ → job 2, 3 không chạy (`needs`) → production **không bị đụng tới**; job 4 báo "FAILED tại …". Ví dụ thật: run fail ở e2e xóa tài khoản, production vẫn chạy bản cũ.

**E10. Bước "preflight" em thêm vào để làm gì?**
Kiểm tra đủ secret/biến trước khi build/deploy; thiếu thì dừng ngay với thông báo rõ tên mục thiếu, thay vì lỗi khó hiểu ở bước sau. Bài học từ lỗi `trivy: command not found` từng che mất lỗi thật `Username and password required`.

**E11. Kể một lần pipeline lỗi và cách em debug.**
Kể lỗi OIDC: deploy báo `Not authorized to perform sts:AssumeRoleWithWebIdentity`.
1. Đọc log bằng `gh run view --log-failed`.
2. Đối chiếu trust policy trong Terraform state: thấy đúng.
3. Kiểm tra cấu hình OIDC của repo bằng `gh api repos/.../actions/oidc/customization/sub`: repo dùng immutable subject có ID.
4. Thêm prefix vào trust policy, `terraform plan` (1 change) → apply → pipeline xanh.

**E12. Environment `production` trên GitHub dùng làm gì?**
Gom secret/quy tắc riêng cho production, hiện URL app trên trang run, và có thể bật *Required reviewers* / *wait timer* để duyệt tay trước khi deploy. Claim `sub` của OIDC cũng mang tên environment, nên trust policy giới hạn được đúng environment này.

**E13. Self-hosted runner hay GitHub-hosted runner?**
GitHub-hosted (`ubuntu-latest`): sạch mỗi lần chạy, không phải bảo trì. Đổi lại IP runner thay đổi liên tục, nên phải mở port 22 động theo IP runner.

**E14. Pipeline chạy mất bao lâu? Tối ưu thế nào?**
Khoảng 6 phút. Đã tối ưu bằng job song song, matrix, cache npm + Docker layer, `paths-ignore` cho tài liệu.

### F. Deploy, rollback, chiến lược triển khai

**F1 ⭐. Zero-downtime deploy trên 1 máy làm thế nào?**
Rolling update bằng Compose: scale lên 2 bản → bản mới healthy → Nginx nhận IP mới qua Docker DNS (resolver 5s) → dừng bản cũ graceful (30s) → không rớt request. Chi tiết: DEFENSE-QA câu 1.

**F2 ⭐. Rolling, Blue-Green, Canary khác nhau thế nào? Vì sao chọn rolling?**
- Rolling: thay dần từng instance.
- Blue-Green: chạy song song 2 môi trường đầy đủ rồi chuyển toàn bộ traffic.
- Canary: chuyển một phần nhỏ traffic sang bản mới để theo dõi.
Với 1 máy 2 GB RAM, blue-green cần gấp đôi tài nguyên cho toàn hệ thống, còn canary cần load balancer chia traffic theo tỉ lệ. Rolling từng service là phù hợp nhất.

**F3 ⭐. Auto-rollback hoạt động thế nào?**
Sau deploy chờ 30 giây, health check 5 lần; không đạt 200 thì `rollback()` pull lại `previous_tag` (SHA cũ trên Docker Hub) và rolling update về bản đó, `exit 2`. Pipeline báo "ĐÃ ROLLBACK về …". Bản mới không healthy ngay từ lúc scale thì bị xóa, bản cũ vẫn phục vụ.

**F4 ⭐. Rollback có rollback database không?**
Không, đây là chủ đích. Migration **forward-only** theo pattern expand/contract: bản mới chỉ thêm cột/bảng nên bản cũ vẫn chạy được; xóa cột để ở release sau. Migration chạy **trước** khi đổi code; migration lỗi thì dừng, bản cũ còn nguyên.

**F5. Vì sao deploy bằng SSH mà không dùng AWS SSM / CodeDeploy?**
SSH đơn giản, dễ demo. Rủi ro được giảm bằng cách chỉ mở port 22 trong vài phút cho đúng 1 IP `/32`, rồi luôn đóng lại. Nâng cấp: AWS SSM Run Command (role EC2 đã gắn SSM), không cần mở port 22.

**F6. Làm sao biết production đang chạy phiên bản nào?**
`/api/health` trả `version` = commit SHA (truyền vào image qua `build-args APP_VERSION`); trên EC2 có `.deploy/current_tag`, `.deploy/previous_tag`.

**F7. Deploy lỗi giữa chừng thì hệ thống ở trạng thái nào?**
Pull lỗi hoặc migrate lỗi: chưa đổi gì, bản cũ chạy. Bản mới không healthy: xóa bản mới, rollback. Rollback cũng lỗi: `exit 1`, pipeline đỏ, cần can thiệp tay (có log tại `.deploy/deploy-*.log`).

**F8. Có môi trường staging không?**
Hiện chưa có (để tiết kiệm chi phí): PR chạy toàn bộ test trên Postgres/Redis thật thay cho staging. Mở rộng: thêm workspace Terraform `staging`, deploy từ nhánh `develop`, rồi promote cùng image SHA lên production.

### G. Infrastructure as Code – Terraform

**G1 ⭐. IaC là gì? Lợi ích?**
Quản lý hạ tầng bằng file code: tái tạo được, version trong Git, review được, không lệch cấu hình do bấm tay, tự tài liệu hóa. Đồ án dựng khoảng 30 tài nguyên AWS bằng `terraform apply`.

**G2. Terraform khác Ansible thế nào?**
Terraform là *provisioning* (tạo hạ tầng: VPC, EC2…), mô hình declarative có state. Ansible thiên về *configuration management* (cài đặt bên trong máy). Đồ án dùng Terraform + `user_data.sh` (cloud-init) cho phần cấu hình máy.

**G3 ⭐. Terraform state là gì? Lưu ở đâu? Rủi ro?**
File ánh xạ code ↔ tài nguyên thật để Terraform biết cần tạo/sửa/xóa gì. Hiện lưu **local** (gitignore vì chứa thông tin nhạy cảm). Rủi ro: mất máy là mất state; 2 người apply cùng lúc thì hỏng state. Hướng sửa: backend S3 (versioning, mã hóa) + khóa state (DynamoDB hoặc `use_lockfile` của S3 backend).

**G4. `plan` và `apply` khác nhau? `-target` dùng khi nào?**
`plan` chỉ tính toán và hiển thị thay đổi; `apply` thực hiện. `-target` giới hạn vào 1 tài nguyên, chỉ dùng trường hợp đặc biệt. Em dùng khi sửa trust policy OIDC để chắc chắn không đụng EC2 (plan: 1 to change, 0 to destroy).

**G5. Drift là gì?**
Hạ tầng thật bị sửa tay khác với code. `terraform plan` sẽ phát hiện. Nguyên tắc của em: không sửa tay trên console.

**G6. `validation` trong biến Terraform để làm gì?**
Chặn cấu hình nguy hiểm từ đầu: không cho `ssh_allowed_cidrs` là `0.0.0.0/0`, kiểm tra định dạng repo, prefix OIDC, dung lượng ổ 20–200 GB.

**G7. Hủy hạ tầng sau khi chấm thế nào?**
`terraform destroy` (README mục 5), tránh phát sinh chi phí.

**G8. Vì sao đặt `create_github_oidc_provider = false`?**
Mỗi tài khoản AWS chỉ có 1 OIDC provider cho `token.actions.githubusercontent.com`, mà tài khoản đã có sẵn (dùng chung với dự án khác) nên tham chiếu bằng ARN thay vì tạo mới.

### H. AWS & bảo mật

**H1 ⭐. OIDC là gì? Vì sao không dùng AWS access key trong GitHub?**
GitHub cấp token JWT ngắn hạn cho mỗi lần chạy; AWS kiểm tra chữ ký + điều kiện (`aud`, `sub`) rồi cấp credentials tạm (tối đa 1 giờ). Không có key dài hạn để lộ, không phải xoay vòng key. Role chỉ có quyền thêm/xóa rule của đúng 1 Security Group.

**H2 ⭐. Trust policy giới hạn những gì?**
`aud = sts.amazonaws.com`, `sub` chỉ thuộc repo này, nhánh `main` hoặc environment `production` (cả dạng thường và dạng immutable có ID). Fork hay repo khác không assume được.

**H3. Immutable subject của GitHub OIDC là gì?**
`sub` chứa thêm ID số của owner/repo (`repo:QuocAnh-205@189313150/home-shopping-app@1440229410:...`). Nếu đổi tên/xóa repo rồi ai đó tạo repo trùng tên, họ cũng không giả mạo được. Repo mới bật mặc định, đây chính là nguyên nhân lỗi deploy em đã sửa.

**H4. Security Group khác UFW thế nào? Vì sao cần cả hai?**
SG là tường lửa của AWS, nằm ngoài máy ảo, stateful, Docker không can thiệp được: đây là lớp chính. UFW trên máy bảo vệ dịch vụ không phải Docker (sshd) và là lớp dự phòng. Docker publish port sẽ bypass UFW (DEFENSE-QA câu 3).

**H5. Vì sao port 22 không mở thường xuyên?**
Giảm bề mặt tấn công: chỉ IP admin (whitelist) được SSH; runner GitHub được mở tạm `/32` trong lúc deploy rồi revoke trong bước `if: always()`.

**H6. IMDSv2 là gì?**
Metadata service bắt buộc token (PUT trước GET), chống tấn công SSRF lấy trộm credentials của instance role. Terraform đặt `http_tokens = "required"`.

**H7. Least privilege thể hiện ở đâu?**
- Role GitHub: chỉ thêm/xóa rule SG của 1 SG.
- Role EC2: chỉ thao tác S3 trong prefix cần thiết, không xóa được backup.
- `GITHUB_TOKEN` chỉ `contents: read`.
- Container non-root, `cap_drop: ALL`.

**H8. HTTPS cấu hình thế nào?**
Let's Encrypt qua Certbot (challenge HTTP-01), tự gia hạn; Nginx chỉ TLS 1.2/1.3, có HSTS. Tên miền miễn phí `sslip.io` trỏ về Elastic IP.

**H9. Security headers gồm những gì?**
HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, Content-Security-Policy (`default-src 'self'`, `frame-ancestors 'none'`…). Lưu ý trung thực: `script-src` còn `'unsafe-inline'` do Next.js chèn inline script; hướng cải thiện là dùng nonce.

**H10. Rate limit đặt ở đâu?**
Nginx: chung 30 req/s, API 15 req/s, đăng nhập 10 req/phút, đặt hàng 6 req/phút/IP; thêm Throttler của NestJS làm lớp 2.

**H11. Nếu hacker chiếm được container backend thì sao?**
Không ghi được filesystem (read-only), không leo quyền (non-root, no-new-privileges, cap_drop), không ra Internet từ mạng DB, không xóa được backup S3. Xem DEFENSE-QA câu 2.

**H12. Vì sao đăng nhập `admin@homeshop.local` trên production không được?**
Đó là tài khoản demo chỉ seed ở local (`SEED_DEMO_DATA=true`); mật khẩu của nó công khai trong README. Production cố ý không có tài khoản demo; admin thật tạo từ `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (bí mật trong `prod.env`).

### I. DevSecOps – quét bảo mật

**I1 ⭐. Trivy quét những gì? Vì sao `ignore-unfixed`?**
Quét image (lỗ hổng OS + thư viện + secret) và quét cấu hình (Terraform, Dockerfile). Chỉ **chặn** CRITICAL đã có bản vá (vì có hành động sửa được), còn lỗ hổng chưa có bản vá vẫn được báo trong SARIF để theo dõi.

**I2. SAST, DAST, SCA khác nhau thế nào? Đồ án có những gì?**
- SAST: phân tích mã nguồn tĩnh (ESLint, TypeScript, SonarCloud khi cấu hình).
- SCA: quét thư viện bên thứ 3 (npm audit, Trivy, Dependabot).
- DAST: tấn công thử ứng dụng đang chạy, **chưa có**; hướng mở rộng là OWASP ZAP baseline scan sau deploy.

**I3. `npm audit` chỉ chặn critical, vậy lỗ hổng high/moderate thì sao?**
Vẫn được báo trong log và Dependabot mở PR. Ví dụ: em đã chủ động vá `postcss` (high) và `qs` (moderate) bằng `overrides`, test lại rồi deploy. Còn 5 lỗ hổng moderate ở `@nestjs/core`/`file-type` cần nâng major nên để làm riêng có kiểm thử kỹ.

**I4. `overrides` trong package.json là gì? Rủi ro?**
Ép phiên bản dependency gián tiếp (ví dụ `express` ghim `qs ~6.14`). Rủi ro: thư viện cha có thể không tương thích bản mới, nên em chạy unit test (90), build và smoke test API trước khi push.

**I5. `.trivyignore` có phải "giấu lỗi" không?**
Không: mỗi ngoại lệ ghi rõ lý do và biện pháp bù, nằm trong Git nên phải qua review, minh bạch.

**I6. Gitleaks khác Trivy secret scan thế nào?**
Gitleaks quét **lịch sử Git** (cả commit cũ); Trivy secret quét **nội dung image** sắp đẩy lên registry. Hai lớp ở 2 điểm khác nhau.

### J. Testing trong pipeline

**J1 ⭐. Em có những loại test nào?**
90 unit test (Jest, mock DB) cho logic thuần; 31 e2e test trên Postgres 16 + Redis 7 thật trong CI; kiểm tra schema drift; seed idempotent; lint + typecheck.

**J2. Vì sao cần e2e trên DB thật khi đã có unit test?**
Unit test mock DB không phát hiện được lỗi transaction, khóa dòng, ràng buộc. Test quan trọng: 2 người mua cùng lúc món cuối cùng → đúng 1 người thành công (201), người kia 409, tồn kho = 0.

**J3. Schema drift check là gì?**
`prisma migrate diff --from-migrations --to-schema-datamodel --exit-code`: nếu sửa `schema.prisma` mà quên tạo migration thì pipeline đỏ ngay, không đợi tới lúc deploy production mới vỡ.

**J4. Coverage bao nhiêu? Có đặt ngưỡng không?**
Báo cáo coverage được upload làm artifact mỗi lần chạy (mở được để xem số liệu). Hướng mở rộng: đặt `coverageThreshold` trong Jest để chặn khi coverage giảm. *(Mở artifact `backend-coverage` của run gần nhất để nêu con số cụ thể khi báo cáo.)*

### K. Giám sát, log, cảnh báo

**K1 ⭐. Monitoring gồm những gì?**
Prometheus (metrics) + Grafana (dashboard) + Loki/Promtail (logs) + Alertmanager (cảnh báo) + exporters (node, cAdvisor, Postgres, Redis). 9 container, project riêng.

**K2. Monitoring và Observability khác nhau thế nào?**
Monitoring: theo dõi những chỉ số đã biết trước (CPU, lỗi). Observability: khả năng hiểu *vì sao* hệ thống lỗi từ 3 trụ cột metrics, logs, traces. Đồ án có metrics + logs (kèm `request_id` để truy vết); traces (OpenTelemetry) là hướng mở rộng.

**K3. USE và RED là gì?**
USE (Utilization, Saturation, Errors) cho tài nguyên hạ tầng; RED (Rate, Errors, Duration) cho dịch vụ. Backend xuất `http_requests_total`, `http_request_duration_seconds`.

**K4. SLI, SLO, SLA?**
- SLI: chỉ số đo được (tỉ lệ request thành công, p95 latency).
- SLO: mục tiêu nội bộ (ví dụ 99.5% request thành công, p95 < 1s).
- SLA: cam kết với khách hàng, có phạt.
Alert 5xx > 5% và p95 > 1s chính là ngưỡng bảo vệ SLO.

**K5. Làm sao tránh "alert fatigue" (cảnh báo quá nhiều)?**
Cảnh báo theo khoảng thời gian (`for: 5m`), có điều kiện traffic tối thiểu, phân mức critical/warning, nhắc lại 1 giờ/lần, inhibit rule (DB down thì tắt cảnh báo 5xx phụ thuộc).

**K6. Vì sao log dạng JSON?**
Máy đọc được, lọc theo trường (`level`, `event`, `request_id`) trong Loki; che dữ liệu nhạy cảm (`password`, `authorization`).

**K7. Grafana có public không?**
Không: cổng 3001 chỉ mở cho IP whitelist trong Security Group; Prometheus/Alertmanager chỉ bind `127.0.0.1` (xem qua SSH tunnel).

### L. Backup & Disaster Recovery

**L1 ⭐. RPO và RTO của hệ thống?**
RPO 24 giờ (backup 02:00 hằng ngày); RTO khoảng 15 phút (Terraform dựng máy, deploy image, restore dump từ S3).

**L2. Làm sao chắc backup dùng được?**
Kiểm tra `gzip -t`, dòng kết thúc dump, SHA256, so dung lượng trên S3; metric "tuổi backup" + alert khi quá 26 giờ; `restore-db.sh` restore trong 1 transaction. Nên diễn tập restore định kỳ.

**L3. Nếu EC2 chết hẳn thì sao?**
CloudWatch auto-recover xử lý lỗi phần cứng (giữ IP/ổ). Mất hẳn thì `terraform apply` tạo máy mới → pipeline deploy → restore DB từ S3.

**L4. Giảm RPO thế nào?**
WAL archiving (pgBackRest/WAL-G) hoặc chuyển sang RDS có Point-in-Time Recovery.

### M. Câu hỏi về quá trình làm & tình huống

**M1 ⭐. Khó khăn lớn nhất khi làm CI/CD là gì?**
Lỗi OIDC immutable subject: thông báo `Not authorized` không nói rõ lý do; phải so sánh claim `sub` thực tế với trust policy. Bài học: đọc log gốc, kiểm chứng từng giả thuyết (state, ARN, cấu hình OIDC của repo), sửa bằng IaC chứ không sửa tay.

**M2. Nếu thầy yêu cầu thêm một bước duyệt trước khi deploy?**
GitHub → Settings → Environments → `production` → bật *Required reviewers*. Job deploy sẽ dừng chờ người duyệt bấm Approve (không cần sửa YAML).

**M3. Muốn thêm thông báo Discord thì làm gì?**
Tạo webhook trong kênh Discord → `gh secret set DISCORD_WEBHOOK_URL` → job 4 tự gửi (code đã có sẵn, bỏ qua nếu chưa có secret).

**M4. Muốn đổi cấu hình production (ví dụ thêm Google OAuth)?**
Sửa `~/.homeshop/prod.env` → chạy lại `scripts/setup-github-secrets.sh` (cập nhật `PROD_ENV_FILE`) → chạy lại pipeline; job deploy ghi `.env` mới và rolling update.

**M5. Hai người cùng push gần nhau thì sao?**
`concurrency` xếp hàng: lần sau đợi lần trước deploy xong, không chạy chồng, không hủy giữa chừng.

**M6. Ổ đĩa EC2 có bị đầy vì image cũ không?**
Không: `deploy.sh` chạy `docker image prune -af` sau mỗi lần deploy; rollback cần bản cũ thì pull lại theo SHA từ Docker Hub. Log deploy cũ hơn 14 ngày tự xóa; có alert ổ < 15%.

**M7. Em tự làm hay copy? Giải thích một đoạn YAML bất kỳ.**
Chuẩn bị giải thích được các đoạn: bước "Mở tạm port 22" (lấy IP runner → `authorize-security-group-ingress` `/32`), bước Deploy đọc mã thoát `0/2/khác`, bước notify dùng `jq` để tạo JSON an toàn.

**M8. Chi phí hệ thống? Tối ưu thế nào?**
Khoảng 25–28 USD/tháng. Tối ưu: t3.small + swap thay vì máy lớn, lifecycle S3 xóa backup cũ, `paths-ignore` để sửa tài liệu không tốn phút CI, `terraform destroy` sau khi chấm.

**M9. Nếu lượng truy cập tăng 100 lần?**
Tách DB sang RDS Multi-AZ, Redis sang ElastiCache, chạy app trên ECS/EKS sau ALB + Auto Scaling nhiều AZ, ảnh tĩnh qua CloudFront. Pipeline giữ nguyên ý tưởng: build image một lần, thay bước deploy bằng `aws ecs update-service`/Helm.

**M10. Điểm nào em tâm đắc nhất?**
Gợi ý chọn 1 trong 3: (1) rolling update + auto-rollback trên 1 máy; (2) không có AWS key nào trên GitHub nhờ OIDC, port 22 mở theo phút; (3) test e2e mua đồng thời chạy trên DB thật trong CI.

### N. Câu hỏi nhanh (trả lời 1 câu)

| Câu hỏi | Trả lời |
|---|---|
| YAML là gì? | Định dạng cấu hình dựa trên thụt lề, dùng cho GitHub Actions, Compose, Prometheus |
| `runs-on: ubuntu-latest`? | Job chạy trên máy ảo Ubuntu do GitHub cung cấp, mỗi lần một máy sạch |
| `actions/checkout`? | Tải mã nguồn repo vào runner |
| `fetch-depth: 0`? | Tải toàn bộ lịch sử để Gitleaks quét mọi commit |
| `npm ci` khác `npm install`? | `ci` cài đúng theo lock file, xóa `node_modules` cũ: tái lập được, dùng cho CI |
| `set -euo pipefail`? | Script dừng khi có lệnh lỗi, biến chưa khai báo, hoặc lỗi giữa pipe |
| `known_hosts` để làm gì? | Xác minh đúng máy chủ, chống tấn công man-in-the-middle khi SSH |
| `umask 077`? | File tạo ra chỉ chủ sở hữu đọc/ghi được (bảo vệ `.env`) |
| Elastic IP? | IP tĩnh không đổi khi dừng/khôi phục EC2 |
| `sslip.io`? | DNS miễn phí: `13-214-14-196.sslip.io` tự phân giải về `13.214.14.196`, đủ để xin cert Let's Encrypt |
| Graceful shutdown? | Nhận SIGTERM thì xử lý xong request đang dở rồi mới thoát (30s) |
| Idempotent? | Chạy nhiều lần cho cùng kết quả (seed, `terraform apply`, Idempotency-Key đặt hàng) |
| Reverse proxy? | Nginx đứng trước app, nhận request từ Internet rồi chuyển vào trong; lo TLS, rate limit, header |
| Swap để làm gì? | Lưới an toàn chống hết RAM (OOM) trên máy 2 GB |
| SARIF? | Định dạng chuẩn cho kết quả quét bảo mật, hiển thị ở tab Security của GitHub |
| `paths-ignore`? | Push chỉ sửa tài liệu thì không chạy pipeline (tiết kiệm phút CI) |

---

## 7. Điểm yếu đã biết & hướng phát triển

> Thầy đánh giá cao sinh viên **tự nhận ra hạn chế**. Chủ động nói trước, kèm hướng giải quyết.

| Hạn chế hiện tại | Ảnh hưởng | Hướng cải thiện |
|---|---|---|
| 1 EC2 duy nhất (SPOF) | Máy hỏng là gián đoạn (giảm nhẹ bằng auto-recover, backup) | ALB + Auto Scaling 2 AZ, RDS Multi-AZ, ElastiCache |
| Terraform state lưu local | Mất máy là mất state; không làm nhóm được | S3 backend + versioning + khóa state |
| Push thẳng `main`, chưa có branch protection | Dễ lỡ đẩy code chưa review | Bắt buộc PR + CI xanh + 1 reviewer |
| Chưa có staging | Thay đổi lớn chỉ được kiểm tra bằng CI | Workspace `staging`, promote cùng image SHA |
| Continuous Deployment không có duyệt tay | Push là lên production | Bật *Required reviewers* cho environment |
| Deploy qua SSH (mở port 22 tạm) | Có cửa sổ vài phút | AWS SSM Run Command |
| SonarCloud, Discord/Telegram chưa cấu hình | Thiếu báo cáo SAST và kênh nhận cảnh báo | Thêm `SONAR_TOKEN`, webhook |
| Chưa có DAST, SBOM, ký image | Thiếu một phần supply-chain security | OWASP ZAP; Syft SBOM; Cosign ký image |
| Frontend image public (giới hạn gói free) | Ai cũng tải được image frontend | Docker Pro hoặc chuyển ECR/GHCR |
| CSP còn `'unsafe-inline'` cho script | Giảm hiệu quả chống XSS | Next.js nonce-based CSP |
| 5 lỗ hổng moderate (`@nestjs/core`, `file-type`) | Rủi ro thấp, chưa bị chặn | Nâng Nest 11/12 có kế hoạch kiểm thử |
| Chưa có tracing | Khó truy vết độ trễ giữa các tầng | OpenTelemetry + Tempo/Jaeger |
| RPO 24 giờ | Có thể mất tối đa 1 ngày dữ liệu | WAL archiving / RDS PITR |
| Đăng nhập Google/Facebook, gửi email thật chưa bật trên production | Tính năng chờ cấu hình | Tạo OAuth client, cấu hình SES |

---

## 8. Checklist trước buổi báo cáo

**Một ngày trước:**
- [ ] `curl https://13-214-14-196.sslip.io/api/health` trả `ok`, version = commit mới nhất.
- [ ] Tab Actions: run gần nhất xanh cả 7 job.
- [ ] Đăng nhập được admin production (tài khoản trong `~/.homeshop/prod.env`), không thử sai nhiều lần vì có khóa tài khoản.
- [ ] Grafana mở được từ IP hiện tại. Đổi mạng (Wi-Fi trường) thì IP thay đổi, phải thêm IP vào `ssh_allowed_cidrs`/`grafana_allowed_cidrs` và `terraform apply` trước.
- [ ] Chuẩn bị sẵn một thay đổi nhỏ để demo push.
- [ ] Quay video demo dự phòng.
- [ ] `aws login` còn hạn nếu cần chạy Terraform (khuyến nghị dùng IAM user, không dùng root).

**Bảo mật trước khi nộp:**
- [ ] Đổi `DOCKERHUB_TOKEN` (token cũ từng xuất hiện trong lịch sử chat), xóa token cũ trên Docker Hub.
- [ ] Không chiếu màn hình file `prod.env`, `terraform.tfvars`, `~/.ssh/*`.

**Sau khi chấm:**
- [ ] `terraform destroy` (README mục 5) để dừng chi phí; xóa repo private Docker Hub nếu không dùng.

---

## 9. Bảng thuật ngữ

| Thuật ngữ | Nghĩa ngắn |
|---|---|
| CI | Tích hợp liên tục: mỗi lần push đều build + test tự động |
| CD | Delivery (sẵn sàng deploy, duyệt tay) / Deployment (tự deploy) |
| Pipeline | Chuỗi bước tự động từ code tới production |
| Runner | Máy chạy các job của GitHub Actions |
| Registry | Kho lưu image container (Docker Hub, ECR, GHCR) |
| IaC | Hạ tầng dưới dạng code (Terraform) |
| OIDC | Giao thức xác thực bằng token ngắn hạn; GitHub ↔ AWS không cần access key |
| STS | Dịch vụ AWS cấp credentials tạm thời |
| SG | Security Group, tường lửa của AWS |
| IMDSv2 | Metadata service EC2 phiên bản bắt buộc token |
| SAST / SCA / DAST | Quét mã nguồn / quét thư viện / quét ứng dụng đang chạy |
| CVE | Mã định danh lỗ hổng bảo mật công khai |
| SBOM | Danh sách thành phần phần mềm trong image |
| Rolling update | Thay dần bản cũ bằng bản mới, không gián đoạn |
| Rollback | Quay về phiên bản trước khi bản mới lỗi |
| Health check | Kiểm tra dịch vụ còn phục vụ đúng hay không |
| RPO / RTO | Lượng dữ liệu tối đa chấp nhận mất / thời gian khôi phục tối đa |
| SLI / SLO / SLA | Chỉ số đo / mục tiêu nội bộ / cam kết với khách |
| SPOF | Điểm lỗi đơn: hỏng là cả hệ thống ngừng |
| Drift | Hạ tầng thật lệch khỏi code IaC |
| Idempotent | Chạy lặp lại nhiều lần vẫn cho cùng kết quả |
