-- Thuộc tính kỹ thuật chuẩn hóa (bộ lọc chất liệu / công suất / dung tích / kích thước, so sánh, hàng cồng kềnh).
-- Chỉ THÊM cột có thể null / có mặc định → tương thích ngược, rollback image cũ vẫn chạy được.
ALTER TABLE "products"
  ADD COLUMN "material" TEXT,
  ADD COLUMN "power_w" INTEGER,
  ADD COLUMN "capacity_ml" INTEGER,
  ADD COLUMN "warranty_months" INTEGER,
  ADD COLUMN "dim_length_cm" INTEGER,
  ADD COLUMN "dim_width_cm" INTEGER,
  ADD COLUMN "dim_height_cm" INTEGER,
  ADD COLUMN "is_bulky" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "products"
  ADD CONSTRAINT "products_power_w_check" CHECK ("power_w" IS NULL OR "power_w" > 0),
  ADD CONSTRAINT "products_capacity_ml_check" CHECK ("capacity_ml" IS NULL OR "capacity_ml" > 0),
  ADD CONSTRAINT "products_warranty_months_check" CHECK ("warranty_months" IS NULL OR "warranty_months" BETWEEN 0 AND 600),
  ADD CONSTRAINT "products_dims_check" CHECK (
    ("dim_length_cm" IS NULL OR "dim_length_cm" > 0) AND ("dim_width_cm" IS NULL OR "dim_width_cm" > 0) AND ("dim_height_cm" IS NULL OR "dim_height_cm" > 0));

CREATE INDEX "products_material_idx" ON "products"("material");
CREATE INDEX "products_is_bulky_idx" ON "products"("is_bulky");

-- Snapshot bảo hành vào dòng đơn (tra cứu bảo hành điện tử theo mã đơn + SĐT)
ALTER TABLE "order_items" ADD COLUMN "warranty_months" INTEGER;

-- Biến thể sản phẩm (màu / kích cỡ / dung tích): mỗi lựa chọn là 1 SKU, gom theo variant_group
ALTER TABLE "products"
  ADD COLUMN "variant_group" TEXT,
  ADD COLUMN "variant_name" TEXT,
  ADD COLUMN "variant_label" TEXT;
CREATE INDEX "products_variant_group_idx" ON "products"("variant_group");
