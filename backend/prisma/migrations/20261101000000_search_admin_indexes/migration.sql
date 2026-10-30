-- Tìm kiếm sản phẩm theo tên (ILIKE '%q%') dùng GIN trigram index thay vì full scan
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex: trang quản trị lọc đơn theo trạng thái, sắp xếp mới nhất
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- Ràng buộc nghiệp vụ ở tầng DB (phòng thủ khi có code path bỏ qua validation)
ALTER TABLE "products" ADD CONSTRAINT "products_price_non_negative" CHECK ("price" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_non_negative" CHECK ("total_amount" >= 0);
