.PHONY: help local-up local-seed local-down local-logs test test-frontend tf-init tf-plan tf-apply tf-destroy lint-iac

help: ## Liệt kê các lệnh
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

local-up: ## Chạy toàn bộ app local tại http://localhost
	docker compose -f docker-compose.local.yml up -d --build

local-seed: ## Nạp dữ liệu mẫu (sản phẩm + admin)
	docker compose -f docker-compose.local.yml exec backend node prisma/seed.js

local-logs: ## Xem log backend
	docker compose -f docker-compose.local.yml logs -f backend

local-down: ## Dừng & xóa môi trường local
	docker compose -f docker-compose.local.yml down -v

test: ## Chạy unit test backend
	cd backend && npm ci && npx prisma generate && npm test

test-frontend: ## ESLint + type check + build frontend
	cd frontend && npm ci && npm run lint && npm run typecheck && npm run build

tf-init: ## terraform init
	cd terraform && terraform init

tf-plan: ## terraform plan
	cd terraform && terraform fmt -check && terraform validate && terraform plan -out=tfplan

tf-apply: ## terraform apply theo plan đã review
	cd terraform && terraform apply tfplan

tf-destroy: ## Hủy toàn bộ hạ tầng AWS
	cd terraform && terraform destroy

lint-iac: ## Kiểm tra nginx, compose, prometheus, shell scripts
	docker compose -f docker-compose.local.yml config -q
	docker run --rm -v "$(CURDIR)/monitoring/prometheus:/p:ro" --entrypoint promtool prom/prometheus:v2.54.1 check config /p/prometheus.yml || true
	docker run --rm -v "$(CURDIR)/monitoring/prometheus:/p:ro" --entrypoint promtool prom/prometheus:v2.54.1 check rules /p/alert.rules.yml
	docker run --rm -v "$(CURDIR):/src:ro" -w /src koalaman/shellcheck:stable -x scripts/deploy.sh scripts/backup-db.sh scripts/restore-db.sh scripts/init-letsencrypt.sh scripts/render-alertmanager.sh scripts/user_data.sh
	docker run --rm -i hadolint/hadolint < backend/Dockerfile
	docker run --rm -i hadolint/hadolint < frontend/Dockerfile
	docker run --rm -v "$(CURDIR):/repo:ro" -w /repo aquasec/trivy:0.57.1 config --config trivy.yaml --severity CRITICAL,HIGH --exit-code 1 .
