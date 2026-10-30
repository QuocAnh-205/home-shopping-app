# Kiến trúc hệ thống - Home Shopping App

## 1. Sơ đồ kiến trúc trên AWS

```mermaid
flowchart TB
    user(["👤 Khách hàng<br/>Trình duyệt / Mobile"])
    admin(["🧑‍💻 Admin / DevOps<br/>IP whitelist"])
    gha(["⚙️ GitHub Actions<br/>Runner"])
    dockerhub[("🐳 Docker Hub<br/>image :sha / :latest")]
    le(["🔒 Let's Encrypt"])
    chat(["💬 Discord / Telegram"])

    subgraph AWS["☁️ AWS Region ap-southeast-1 (Terraform)"]
        iam["IAM Role + Instance Profile<br/>(S3 least-privilege, SSM)"]
        oidc["IAM OIDC Role<br/>(GitHub → mở port 22 tạm thời)"]
        s3[("🪣 S3 Bucket (SSE, Versioning, Block Public)<br/>products/ · backups/ (Lifecycle 30 ngày)")]
        cw["CloudWatch Alarm<br/>EC2 auto-recover"]

        subgraph VPC["VPC 10.20.0.0/16"]
            igw["Internet Gateway"]
            subgraph PUB["Public Subnet 10.20.1.0/24"]
                sg{{"Security Group<br/>80/443: 0.0.0.0/0<br/>22, 3001: whitelist"}}
                subgraph EC2["EC2 t3.medium · Ubuntu 22.04 · EBS gp3 30GB encrypted · 4GB swap · UFW · Elastic IP"]
                    subgraph FNET["frontend-net"]
                        nginx["Nginx 1.28<br/>TLS · Rate limit · Gzip · Cache"]
                        certbot["Certbot<br/>auto-renew"]
                        fe["Next.js 14<br/>:3000 (standalone)"]
                        be["NestJS API<br/>:8080 /api/health /api/metrics"]
                    end
                    subgraph BNET["backend-net (internal: true - không ra Internet)"]
                        pg[("PostgreSQL 16<br/>orders · products · users")]
                        redis[("Redis 7<br/>cart · cache hot products")]
                    end
                    subgraph MON["monitoring-net"]
                        prom["Prometheus"]
                        am["Alertmanager"]
                        graf["Grafana :3001"]
                        loki["Loki"]
                        promtail["Promtail"]
                        exp["Node Exporter · cAdvisor<br/>Postgres/Redis Exporter"]
                    end
                    cron["⏰ Cron 02:00<br/>backup-db.sh"]
                end
            end
        end
    end

    user -->|HTTPS 443| igw --> sg --> nginx
    admin -->|SSH 22 / Grafana 3001| sg
    nginx -->|/| fe
    nginx -->|/api/*| be
    fe -->|SSR fetch| be
    be --> pg
    be --> redis
    be -->|ảnh sản phẩm<br/>credentials tạm từ IMDSv2| s3
    certbot <-->|HTTP-01| le
    cron -->|pg_dump .sql.gz| pg
    cron -->|aws s3 cp| s3
    cron -.->|lỗi| chat
    iam -.-> EC2
    prom -->|scrape| be
    prom --> exp
    exp -.-> pg
    exp -.-> redis
    promtail -->|docker logs| loki
    graf --> prom
    graf --> loki
    prom --> am -->|webhook| chat
    gha -->|OIDC| oidc -.->|authorize/revoke :22| sg
    gha -->|push| dockerhub
    gha -->|SSH deploy.sh| EC2
    EC2 -->|pull| dockerhub
    cw -.-> EC2
```

## 2. Luồng CI/CD DevSecOps

```mermaid
flowchart LR
    dev(["👨‍💻 git push main / PR"]) --> j1a & j1b & j1c

    subgraph j1a["Job 1a · Security & Code Quality"]
        direction TB
        gl["🔑 Gitleaks<br/>quét secret toàn lịch sử"] --> ut["🧪 Unit Test + Coverage<br/>(Jest, 40+ test)"]
        ut --> tc["📘 ESLint + Type check FE/BE"]
        tc --> au["📦 npm audit critical"]
        au --> sc["🔍 SonarCloud SAST<br/>+ Quality Gate"]
    end

    subgraph j1b["Job 1b · Integration Test"]
        direction TB
        svc["🐘 Postgres 16 + Redis 7<br/>service containers"] --> mg["🗄️ prisma migrate deploy"]
        mg --> dr["🧬 Schema drift check<br/>migrate diff --exit-code"]
        dr --> e2e["🧪 E2E: mua đồng thời,<br/>idempotency, RBAC, lockout"]
    end

    subgraph j1c["Job 1c · IaC & Config Scan"]
        direction TB
        hd["🐳 Hadolint"] --> tf["🏗️ terraform fmt/validate"]
        tf --> tvc["🛡️ Trivy config<br/>(Terraform, Dockerfile)"]
        tvc --> shc["🐚 ShellCheck · promtool<br/>· compose config"]
    end

    j1a & j1b & j1c -->|pass| j2

    subgraph j2["Job 2 · Build, Scan & Push (matrix FE ∥ BE)"]
        direction TB
        b["🐳 Docker Buildx<br/>multi-stage + GHA cache"] --> tv{"🛡️ Trivy<br/>CRITICAL có bản vá?"}
        tv -->|có| stop(["⛔ Chặn pipeline"])
        tv -->|không| sarif["📄 SARIF → GitHub Security"]
        sarif --> push["⬆️ Push Docker Hub<br/>:sha + :latest"]
    end

    j2 --> j3

    subgraph j3["Job 3 · Deploy EC2 (environment: production)"]
        direction TB
        o["🔐 OIDC → AWS<br/>mở port 22 cho IP runner"] --> rs["📤 rsync config + .env (stdin, chmod 600)"]
        rs --> pull["⬇️ docker compose pull :sha"]
        pull --> mig["🗄️ npx prisma migrate deploy"]
        mig --> roll["🔄 Rolling update<br/>scale 2 → healthy → stop bản cũ"]
        roll --> wait["⏱️ Chờ 30s"]
        wait --> hc{"❤️ GET /api/health<br/>= 200?"}
        hc -->|có| ok["✅ Ghi current_tag<br/>update monitoring<br/>docker image prune -af"]
        hc -->|không| rb["⏪ Auto-Rollback<br/>về SHA trước"]
        ok --> close["🔒 Revoke port 22"]
        rb --> close
    end

    j3 --> j4

    subgraph j4["Job 4 · Notification (always)"]
        n["📣 Discord embed + Telegram<br/>người commit · SHA · thời gian · trạng thái"]
    end

    stop -.-> j4
```

## 3. Luồng đặt hàng & chống oversell

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant N as Nginx
    participant API as NestJS
    participant R as Redis
    participant DB as PostgreSQL
    B->>N: POST /api/orders (Idempotency-Key: uuid)
    N->>N: limit_req zone=orders 6r/m
    N->>API: proxy (X-Request-Id)
    API->>API: JwtAuthGuard + Throttler 5/phút
    API->>DB: SELECT order WHERE idempotency_key
    alt Đã tồn tại
        API-->>B: 201 trả lại đơn cũ (không tạo trùng)
    else Mới
        API->>R: HGETALL cart:{userId}
        API->>DB: BEGIN
        loop mỗi sản phẩm
            API->>DB: UPDATE products SET stock=stock-qty WHERE id=? AND stock>=qty
        end
        API->>DB: INSERT order + order_items (giá lấy từ DB)
        API->>DB: COMMIT
        API->>R: DEL cart + invalidate cache:products:*
        API-->>B: 201 Created
    end
```

## 4. Cây thư mục Monorepo

```text
home-shopping-app/
├── .github/
│   └── workflows/
│   ├── workflows/production-cicd.yml  # Security ‖ Integration ‖ IaC → Build/Scan/Push → Deploy/Rollback → Notify
│   ├── dependabot.yml                 # Cập nhật dependency/bản vá hằng tuần
│   └── pull_request_template.md
├── backend/                           # NestJS 10 REST API (port 8080)
│   ├── prisma/
│   │   ├── migrations/
│   │   │   ├── 20261001000000_init/migration.sql
│   │   │   ├── 20261101000000_search_admin_indexes/migration.sql   # pg_trgm GIN, index admin, CHECK
│   │   │   └── migration_lock.toml
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── admin/                     # Dashboard thống kê, quản lý đơn (state machine)
│   │   ├── auth/                      # JWT (jti), logout/revoke, lockout brute-force, RolesGuard (+ spec)
│   │   ├── categories/                # Danh mục + số sản phẩm (cache Redis)
│   │   ├── cart/                      # Giỏ hàng trên Redis Hash (+ spec)
│   │   ├── common/filters/            # Global exception filter
│   │   ├── config/                    # Validate biến môi trường lúc khởi động
│   │   ├── health/                    # /api/health (DB + Redis, timeout 2s) (+ spec)
│   │   ├── metrics/                   # prom-client: http_requests_total, latency, orders
│   │   ├── orders/                    # Đặt hàng idempotent, trừ kho atomic, hủy + hoàn kho (+ spec)
│   │   ├── prisma/  redis/  storage/  # PrismaService, RedisService, S3 (IAM role)
│   │   ├── products/                  # Tìm kiếm/sắp xếp, CRUD, cache Redis, upload S3 (magic bytes)
│   │   ├── app.module.ts
│   │   ├── app.setup.ts               # Helmet, CORS, ValidationPipe, Swagger (dùng chung main + e2e)
│   │   └── main.ts
│   ├── test/app.e2e-spec.ts           # Integration test trên Postgres + Redis thật
│   ├── Dockerfile                     # multi-stage, non-root, HEALTHCHECK
│   ├── .dockerignore
│   ├── nest-cli.json  package.json  package-lock.json  tsconfig*.json
├── frontend/                          # Next.js 14 App Router (port 3000, output standalone)
│   ├── public/robots.txt
│   ├── src/
│   │   ├── app/                       # /, /products/[slug], /cart, /login, /orders, /orders/[id], /admin, /healthz
│   │   ├── components/                # Header, ProductCard, AddToCartButton, RequireAuth, admin/*
│   │   └── lib/                       # server-api (SSR), client-api (browser), types
│   ├── Dockerfile                     # multi-stage, non-root, gỡ npm khỏi runtime
│   ├── .dockerignore
│   ├── next.config.mjs  package.json  package-lock.json  tsconfig.json
├── nginx/
│   ├── nginx.conf                     # Production: TLS, rate limit, gzip, cache, upstream resolve
│   ├── local.conf                     # Demo local HTTP
│   └── snippets/
│       ├── proxy-params.conf
│       └── security-headers.conf
├── terraform/
│   ├── versions.tf                    # provider + (tùy chọn) remote state S3
│   ├── main.tf                        # VPC, Subnet, IGW, RT, SG, S3, IAM, OIDC, EC2, EIP, Alarm
│   ├── variables.tf                   # có validation (cấm 0.0.0.0/0 cho SSH/Grafana)
│   ├── outputs.tf
│   └── terraform.tfvars.example
├── monitoring/
│   ├── docker-compose.monitoring.yml
│   ├── prometheus/{prometheus.yml, alert.rules.yml}
│   ├── alertmanager/alertmanager.yml.tmpl
│   ├── loki/loki-config.yaml
│   ├── promtail/promtail-config.yaml
│   └── grafana/
│       ├── provisioning/{datasources,dashboards}/
│       └── dashboards/home-shopping-overview.json
├── scripts/
│   ├── user_data.sh                   # Bootstrap EC2: swap, Docker, sysctl, UFW, fail2ban, cron
│   ├── deploy.sh                      # Zero-downtime rolling update + auto-rollback
│   ├── init-letsencrypt.sh            # Cấp cert lần đầu
│   ├── backup-db.sh                   # pg_dump → gzip → S3, cảnh báo Discord khi lỗi
│   ├── restore-db.sh                  # Disaster recovery từ S3
│   └── render-alertmanager.sh         # Sinh alertmanager.yml từ secret
├── docs/
│   ├── ARCHITECTURE.md
│   └── DEFENSE-QA.md
├── docker-compose.prod.yml            # frontend-net / backend-net(internal), limits, log rotation
├── docker-compose.local.yml           # Demo local 1 lệnh
├── sonar-project.properties
├── .hadolint.yaml  trivy.yaml  .trivyignore   # Cấu hình quét IaC (ngoại lệ có ghi lý do)
├── .gitleaks.toml  .gitignore  .gitattributes  .env.example
├── Makefile
└── README.md
```
