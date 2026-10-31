# Câu hỏi hóc búa của hội đồng & cách trả lời

> Mẹo chung: trả lời theo khung **Vấn đề → Giải pháp trong đồ án → File/dòng cụ thể → Đánh đổi (trade-off) → Hướng mở rộng**. Mở đúng file khi trả lời, hội đồng đánh giá rất cao việc "chỉ được tận tay".

---

## Câu 1. "Chỉ có 1 EC2 thì zero-downtime kiểu gì? Rollback có rollback được database không?"

**Trả lời:**
- Zero-downtime trên 1 host dùng **rolling update bằng Docker Compose** (`scripts/deploy.sh`, hàm `rolling_update`):
  1. `docker compose up --scale backend=2 --no-recreate` → container mới chạy song song container cũ.
  2. Chờ container mới **healthy** (HEALTHCHECK gọi `/api/health`, kiểm tra cả DB lẫn Redis).
  3. Nginx dùng `upstream ... server backend:8080 resolve` + `resolver 127.0.0.11 valid=5s` → tự nhận IP container mới qua Docker DNS, không cần reload.
  4. `docker stop -t 30` container cũ → NestJS `enableShutdownHooks()` xử lý xong request đang dở. Trong khoảnh khắc chuyển, `proxy_next_upstream error timeout http_502 http_503` tự retry sang container mới.
- Sau 30 giây gọi `https://127.0.0.1/api/health`, khác 200 → `rollback()` về `previous_tag` (image tag = commit SHA, bất biến, pull lại được từ Docker Hub dù đã prune).
- **Database không rollback**, đây là chủ đích: migration là *forward-only* theo pattern **Expand/Contract**: bản N+1 chỉ *thêm* cột/bảng (expand) để bản N vẫn chạy được; bước xóa cột (contract) để ở release sau khi chắc chắn. Vì vậy rollback code luôn an toàn với schema mới. Migration chạy **trước** khi đổi code; nếu migration lỗi thì pipeline dừng, bản cũ vẫn chạy nguyên vẹn.
- **Trade-off:** 1 EC2 vẫn là SPOF ở tầng hạ tầng. Giảm thiểu bằng CloudWatch alarm `ec2:recover` (giữ nguyên EIP + EBS), backup S3 hằng ngày, IaC dựng lại toàn bộ trong ~10 phút. Mở rộng: ALB + Auto Scaling Group 2 AZ + RDS Multi-AZ + ElastiCache.

---

## Câu 2. "Em bảo mật secret thế nào? Nếu hacker chiếm được container/EC2 thì sao?"

**Trả lời theo lớp (Defense in Depth):**
| Lớp | Biện pháp | Ở đâu |
|---|---|---|
| Source code | Gitleaks quét toàn bộ lịch sử commit, chặn pipeline; `.gitignore` chặn `.env`, `*.tfvars` | `.gitleaks.toml`, Job 1 |
| CI/CD | Không có AWS access key: GitHub **OIDC** assume role chỉ có quyền thêm/xóa rule SG của đúng 1 SG; trust policy giới hạn `repo:<owner>/<repo>:ref:refs/heads/main` | `terraform/main.tf` (github_deploy) |
| Truyền secret | `.env` đẩy qua **stdin** SSH với `umask 077`, không xuất hiện trong process list/log; commit message truyền qua `env:` để chống **script injection** | `production-cicd.yml` |
| Runtime AWS | EC2 dùng **Instance Profile**, credentials tạm thời tự xoay vòng qua **IMDSv2** (`http_tokens=required` chống SSRF đánh cắp credentials) | `aws_instance.app.metadata_options` |
| IAM | Least privilege: chỉ `products/*` được xóa; `backups/*` chỉ Put/Get → **ransomware trên EC2 không xóa được backup**; bucket bật versioning | `ec2_s3` policy |
| Container | non-root (UID 1001), `read_only: true`, `cap_drop: ALL`, `no-new-privileges`, file thuộc root (app không tự sửa code), gỡ npm khỏi image frontend | Dockerfile, compose |
| Mạng | `backend-net` **internal: true**: DB/Redis không có port ra host, không có route ra Internet; chỉ backend nằm ở cả 2 mạng | `docker-compose.prod.yml` |
| Host | SG (lớp 1) + UFW (lớp 2) + fail2ban + SSH chỉ key, cấm root; unattended-upgrades | `user_data.sh` |

Nếu container backend bị chiếm: không ghi được filesystem, không leo thang quyền, không xóa được backup, không chạm được dịch vụ ngoài backend-net. Port 22 cho GitHub Actions chỉ mở **trong vài phút** cho đúng 1 IP `/32` rồi revoke trong bước `if: always()`.

---

## Câu 3. "Docker publish port thì bypass UFW, em biết không? Vậy UFW có tác dụng gì?"

**Trả lời:** Biết. Docker ghi rule iptables trong chain `DOCKER`/`DOCKER-USER` đứng **trước** chain của UFW, nên port publish `0.0.0.0:X` không bị UFW chặn. Đồ án xử lý:
1. **Chỉ publish đúng 3 port cần thiết**: 80, 443 (Nginx) và 3001 (Grafana). Prometheus/Alertmanager bind `127.0.0.1:9090/9093` (xem qua SSH tunnel `ssh -L 9090:127.0.0.1:9090`). PostgreSQL/Redis **không publish** gì cả.
2. **Lớp chặn thật sự là AWS Security Group** (stateful, ngoài máy ảo, Docker không can thiệp được): 3001 và 22 chỉ mở cho `grafana_allowed_cidrs` / `ssh_allowed_cidrs`, Terraform `validation` cấm `0.0.0.0/0`.
3. UFW vẫn bảo vệ các dịch vụ **không phải Docker** trên host (sshd có `ufw limit` chống brute-force), và là lớp dự phòng nếu ai đó lỡ sửa SG.
Hướng mở rộng: thêm rule vào chain `DOCKER-USER` hoặc đưa Grafana ra sau Nginx + SSO.

---

## Câu 4. "Nếu 2 người cùng mua món hàng cuối cùng, hoặc khách bấm 'Đặt hàng' 2 lần, hệ thống xử lý ra sao? Rate limit đặt ở đâu?"

**Trả lời:** (`backend/src/orders/orders.service.ts`)
- **Race condition / oversell:** không dùng kiểu "đọc stock rồi trừ" (read-modify-write). Dùng **conditional atomic update** trong transaction:
  `UPDATE products SET stock = stock - qty WHERE id = ? AND stock >= qty`. PostgreSQL khóa dòng (row lock), người thứ 2 thấy `count = 0` → transaction rollback → HTTP 409. Thêm `CHECK (stock >= 0)` ở schema làm chốt chặn cuối.
- **Double-click / retry mạng:** header **Idempotency-Key** (UUID sinh ở client, `useRef` trong `cart/page.tsx`) + cột `idempotency_key UNIQUE`. Request trùng trả lại đúng đơn cũ; nếu 2 request trùng chạy song song, request thua bắt lỗi `P2002` và trả về đơn của request thắng.
- **Giá tiền** lấy từ DB, không tin client; tính bằng `Prisma.Decimal` tránh lỗi số thực.
- **Rate limit 2 tầng:** Nginx `limit_req zone=orders` 6 request/phút/IP chỉ cho **POST** (map `$request_method`), trả 429 ngay ở edge (không tốn CPU Node); NestJS Throttler 5/phút là lớp thứ 2. Nginx ghi đè `X-Forwarded-For` bằng `$remote_addr` để kẻ tấn công không giả IP qua header.
- Truy vết: mỗi request có `X-Request-Id` đi từ Nginx → backend log → Loki (structured metadata), lọc `{service="backend", event="order.failed"}`.

---

## Câu 5. "Làm sao em biết hệ thống đang lỗi trước khi khách hàng phàn nàn? Backup có chắc restore được không?"

**Trả lời:**
- **Metrics (Prometheus):** phương pháp **USE** cho hạ tầng (node-exporter, cAdvisor) và **RED** cho ứng dụng (`http_requests_total`, `http_request_duration_seconds`, `shop_orders_total` tự viết bằng prom-client). Backend scale 2 bản khi deploy nên dùng `dns_sd_configs` để scrape mọi replica.
- **Alert có ngữ cảnh** (`alert.rules.yml`): CPU > 85% trong 5 phút, Disk < 15%, backend restart > 2 lần/15 phút, 5xx > 5% (kèm điều kiện traffic > 0.1 req/s để tránh báo ảo lúc ít người dùng), p95 > 1s, Postgres/Redis down, **backup quá 26h**.
- **Alertmanager:** critical → Discord + Telegram, nhắc lại mỗi 1h; warning → Discord; **inhibit rule**: Postgres down thì không spam cảnh báo 5xx (chỉ báo nguyên nhân gốc).
- **Logs (Loki):** Nginx log JSON, NestJS log JSON (pino, đã redact `authorization`/`password`); Promtail gắn label ít giá trị (`service`, `level`, `event`, `flow`) và đưa `request_id`, `order_id` vào structured metadata để tránh bùng nổ cardinality.
- **Backup (`backup-db.sh`):** `set -o pipefail` (pg_dump lỗi giữa chừng thì không ra file hỏng) → `gzip -t` → kiểm tra dòng `PostgreSQL database dump complete` → SHA256 → upload S3 SSE → `head-object` so dung lượng → ghi metric textfile cho node-exporter → alert nếu quá 26h không có backup. `flock` chống chạy chồng; `trap ERR` bắn Discord kèm bước lỗi.
- **Restore được không?** `restore-db.sh` kiểm tra checksum, chụp snapshot an toàn trước khi ghi đè, restore trong `--single-transaction` (lỗi thì không nửa vời). **RPO = 24h, RTO ≈ 15 phút** (terraform apply + deploy + restore). Có thể chứng minh trực tiếp trước hội đồng bằng diễn tập DR.
- Mở rộng: giảm RPO bằng WAL archiving (pgBackRest/WAL-G) hoặc RDS Point-in-Time Recovery.

---

## Câu 6. "Em test thế nào? Unit test mock hết thì sao biết chạy thật trên Postgres?"

**Trả lời:** Kim tự tháp 3 tầng, tất cả chạy tự động trong pipeline trước khi build image:
- **Unit test** (Jest, mock Prisma/Redis): logic thuần — tính tiền bằng Decimal, state machine đơn hàng, lockout đăng nhập, magic bytes ảnh, validate env.
- **Integration/E2E** (`backend/test/app.e2e-spec.ts`): job `1b` dựng **PostgreSQL 16 + Redis 7 thật** bằng service containers, chạy `prisma migrate deploy` giống production rồi bắn HTTP thật qua toàn bộ pipeline Nest (Helmet, ValidationPipe, Guard). Test quan trọng nhất: **2 khách mua cùng lúc món cuối cùng → đúng 1 người được 201, người kia 409, tồn kho = 0**. Ngoài ra: replay Idempotency-Key, khách không đọc được đơn người khác (404 chứ không 403 để không lộ sự tồn tại), logout thu hồi token ngay, khóa tài khoản sau 5 lần sai.
- **Schema drift check:** `prisma migrate diff --from-migrations --to-schema-datamodel --exit-code` — nếu ai sửa `schema.prisma` mà quên tạo migration, pipeline đỏ ngay, không đợi tới lúc deploy production mới vỡ.
- **IaC/config là code nên cũng được test:** Hadolint, `terraform validate`, Trivy config, ShellCheck, `promtool check rules`, `docker compose config`.

---

## Câu 7. "JWT là stateless, vậy đăng xuất xong token bị lộ vẫn dùng được à? Chống dò mật khẩu thế nào?"

**Trả lời:** (`backend/src/auth/`)
- Mỗi token có **`jti` (UUID)**. Logout ghi `auth:revoked:{jti}` vào Redis với **TTL = thời gian sống còn lại của token** → denylist tự dọn, không phình bộ nhớ. `JwtAuthGuard` kiểm tra denylist mỗi request; nếu Redis lỗi thì **fail-closed** (503) chứ không cho qua.
- **Brute-force 3 lớp:** Nginx `zone=auth` 10 req/phút/IP → Throttler 10/phút → **khóa theo tài khoản**: sai 5 lần/15 phút thì khóa email đó 15 phút (chặn cả tấn công phân tán nhiều IP). Metric `shop_auth_events_total` + alert `LoginBruteForceSuspected`.
- **Chống dò email:** email không tồn tại vẫn chạy `bcrypt.compare` với hash giả (thời gian phản hồi như nhau) và trả cùng thông điệp lỗi.
- Mật khẩu bcrypt cost 12, policy hoa/thường/số, tối đa 72 ký tự (giới hạn của bcrypt); payload thừa như `role: "ADMIN"` khi đăng ký bị `forbidNonWhitelisted` trả 400 (chống mass assignment).

---

## Câu 8. "Admin đổi trạng thái đơn lung tung được không? 2 admin bấm cùng lúc thì sao?"

**Trả lời:** (`ORDER_TRANSITIONS` trong `orders.service.ts`)
- Vòng đời là **state machine**: `PENDING → PAID → SHIPPING → COMPLETED`, chỉ `PENDING`/`PAID` được hủy. Mọi chuyển khác trả 400, kể cả với admin. Khách chỉ tự hủy được khi `PENDING`.
- **Optimistic concurrency:** `UPDATE orders SET status = :to WHERE id = :id AND status = :from` — 2 admin bấm cùng lúc thì chỉ 1 người có `count = 1`, người kia nhận 409 "vừa được người khác cập nhật".
- **Hủy đơn hoàn kho trong cùng transaction** với đổi trạng thái → không bao giờ có trạng thái "đã hủy nhưng chưa trả hàng về kho". Mỗi lần chuyển được đếm bằng `shop_order_status_transitions_total{from,to}` và log `order.status_changed` kèm người thực hiện (audit).

---

## Câu 9. "Đăng nhập Google/Facebook của em có an toàn không? Quên mật khẩu làm thế nào để không bị lợi dụng?"

**Trả lời:** (`backend/src/auth/oauth/`, `auth.service.ts`)
- **OAuth 2.0 Authorization Code** (không dùng Implicit), Google thêm **PKCE S256**. Trình duyệt điều hướng toàn trang tới backend → không nhúng SDK/JS của bên thứ 3, CSP giữ nguyên `script-src 'self'`.
- **Chống CSRF/login-CSRF:** `state` ngẫu nhiên 192-bit lưu Redis (10 phút, GETDEL dùng 1 lần) **và** cookie `httpOnly; SameSite=Lax; path=/api/auth/oauth` – callback phải khớp cả hai.
- **Token không bao giờ nằm trên URL:** callback chỉ trả về *mã đăng nhập 1 lần* (Redis 2 phút) → trang `/auth/callback` đổi mã lấy JWT bằng POST. Nginx và pino **không ghi query** của `/api/auth/oauth/*` vào log.
- **Chống chiếm tài khoản:** chỉ tự liên kết theo email khi nhà cung cấp xác nhận `email_verified`; tài khoản mạng xã hội đã gắn với người khác thì từ chối (`already_linked`). Tham số `next` được lọc chống open-redirect (`//evil.com`, `/\evil.com` → `/`).
- **Quên mật khẩu:** luôn trả `200 {ok:true}` dù email có tồn tại hay không (chống dò tài khoản); giới hạn 3 yêu cầu/giờ/email + Throttler theo IP. Token 256-bit, DB **chỉ lưu SHA-256**, hết hạn 30 phút, đánh dấu đã dùng bằng `UPDATE … WHERE used_at IS NULL` (2 request song song chỉ 1 thành công).
- **Đổi/đặt lại mật khẩu → đăng xuất mọi thiết bị:** ghi mốc `auth:pwd_changed:{userId}` vào Redis; guard từ chối mọi JWT có `iat` trước mốc đó; gửi email thông báo "mật khẩu vừa được thay đổi".
- Local dùng **Mailpit** để bắt email (không gửi ra Internet); production cấu hình `SMTP_URL` (Amazon SES…). Toàn bộ luồng có e2e test.

---

## Câu 10. "Điểm đánh giá trung bình và 'bán chạy' có đúng khi nhiều người thao tác cùng lúc không?"

**Trả lời:**
- `rating_avg`, `rating_count`, `sold_count` là **cột phi chuẩn hóa** để trang danh sách sắp xếp/hiển thị nhanh (có index), nhưng luôn được cập nhật **trong cùng transaction** với thao tác gốc:
  - Đặt hàng: `UPDATE products SET stock = stock - qty, sold_count = sold_count + qty WHERE stock >= qty`; hủy đơn hoàn lại cả hai.
  - Đánh giá: `SELECT … FOR UPDATE` khóa dòng sản phẩm → upsert review → tính lại AVG/COUNT bằng 1 câu SQL. Hai người đánh giá cùng lúc sẽ chạy tuần tự nên không bị mất cập nhật (lost update).
- Ràng buộc DB: `rating BETWEEN 1 AND 5`, `UNIQUE(product_id, user_id)` (mỗi người 1 đánh giá), `compare_at_price > price`, `sold_count >= 0`.
- "Ưu đãi" sắp theo **% giảm** (biểu thức) bằng SQL thô đã tham số hóa; "Bán chạy" theo `sold_count` thật – e2e test kiểm chứng số đã bán sau chuỗi đặt/hủy đơn.

---

## Câu hỏi phụ hay gặp (trả lời nhanh)

- **Vì sao multi-stage build?** Image runtime không chứa compiler/devDependencies/source TS → backend nhỏ hơn nhiều so với single-stage, ít CVE hơn; layer `npm ci` được cache cho tới khi `package-lock.json` đổi.
- **Vì sao tag commit SHA mà vẫn có `latest`?** SHA bất biến → rollback/traceability chính xác; `latest` chỉ để tiện tham chiếu, deploy luôn dùng SHA.
- **Trivy `ignore-unfixed`?** Chỉ chặn lỗ hổng CRITICAL **đã có bản vá** (có hành động được); lỗ hổng chưa có bản vá vẫn được báo trong SARIF ở tab Security.
- **Vì sao Redis `volatile-lru` + AOF?** Chỉ evict key có TTL (cache, cart 7 ngày), AOF `everysec` để restart không mất giỏ hàng (mất tối đa 1 giây dữ liệu).
- **Vì sao swap 4GB, `vm.swappiness=10`?** t3.medium chỉ 4GB; swap là lưới an toàn chống OOM-kill khi đỉnh tải/pull image, swappiness thấp để kernel chỉ dùng swap khi thật cần.
- **Không bật OCSP stapling?** Let's Encrypt đã ngừng dịch vụ OCSP (2025), cert mới không còn OCSP URL; bật sẽ chỉ sinh warning.
- **Vì sao Trivy có `.trivyignore`?** Mỗi ngoại lệ ghi rõ lý do và kiểm soát bù (egress chỉ còn TCP 80/443; S3 dùng SSE-S3 thay vì KMS CMK vì chi phí). Ngoại lệ nằm trong Git nên phải qua review PR, không ai tắt cảnh báo âm thầm được.
- **Tìm kiếm `ILIKE '%từ%'` có chậm không?** Có index **GIN pg_trgm** trên `products.name` (migration `20261101…`), Postgres dùng được index cho LIKE có `%` ở đầu.
- **Swagger có lộ ở production không?** Mặc định tắt (`SWAGGER_ENABLED=false`); local bật sẵn tại `/api/docs`.
- **Promtail?** Grafana đã chuyển hướng sang Grafana Alloy; cấu hình Promtail hiện tại chuyển đổi được bằng `alloy convert --source-format=promtail`.
