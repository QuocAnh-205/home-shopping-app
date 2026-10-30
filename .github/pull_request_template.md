## Mô tả thay đổi

<!-- Thay đổi gì, vì sao -->

## Loại thay đổi

- [ ] Tính năng mới
- [ ] Sửa lỗi
- [ ] Hạ tầng / CI/CD / IaC
- [ ] Migration database

## Checklist

- [ ] Unit test / e2e test đã cập nhật và pass local (`npm test`, `npm run test:e2e`)
- [ ] Migration (nếu có) tương thích ngược: bản cũ vẫn chạy được trên schema mới (expand → contract)
- [ ] Không commit secret (`.env`, key, token) — Gitleaks sẽ chặn
- [ ] Đã cập nhật tài liệu (README / docs) nếu thay đổi cách vận hành
