-- Địa chỉ chuẩn hóa theo mã hành chính 2 cấp (tỉnh → xã, hiệu lực 01/07/2025), phí vận chuyển theo cân nặng,
-- snapshot sản phẩm + địa chỉ trong đơn hàng.

CREATE TYPE "Region" AS ENUM ('NORTH', 'CENTRAL', 'SOUTH');

CREATE TABLE "provinces" (
    "code" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "region" "Region" NOT NULL,
    CONSTRAINT "provinces_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "wards" (
    "code" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "province_code" INTEGER NOT NULL,
    CONSTRAINT "wards_pkey" PRIMARY KEY ("code")
);
CREATE INDEX "wards_province_code_idx" ON "wards"("province_code");
ALTER TABLE "wards" ADD CONSTRAINT "wards_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sổ địa chỉ: cấp huyện thành tùy chọn (địa chỉ cũ vẫn giữ), thêm mã tỉnh/xã
ALTER TABLE "addresses" ALTER COLUMN "district" DROP NOT NULL,
  ADD COLUMN "province_code" INTEGER,
  ADD COLUMN "ward_code" INTEGER;

-- Sản phẩm: cân nặng & kích thước đóng gói (mặc định 500 g, 20×20×15 cm)
ALTER TABLE "products"
  ADD COLUMN "weight_grams" INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "length_cm" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "width_cm" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "height_cm" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "products" ADD CONSTRAINT "products_package_positive"
  CHECK ("weight_grams" > 0 AND "length_cm" > 0 AND "width_cm" > 0 AND "height_cm" > 0);

-- Đơn hàng: chi tiết tiền + snapshot địa chỉ. Đơn cũ: subtotal = tổng tiền (chưa có phí ship / voucher)
ALTER TABLE "orders"
  ADD COLUMN "subtotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shipping_fee" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discount_amount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shipping_discount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recipient_name" VARCHAR(100),
  ADD COLUMN "province_code" INTEGER,
  ADD COLUMN "ward_code" INTEGER,
  ADD COLUMN "shipping_provider" VARCHAR(32),
  ADD COLUMN "estimated_delivery_from" DATE,
  ADD COLUMN "estimated_delivery_to" DATE,
  ADD COLUMN "note" VARCHAR(255);
UPDATE "orders" SET "subtotal" = "total_amount";
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_consistent" CHECK (
  "subtotal" >= 0 AND "shipping_fee" >= 0 AND "discount_amount" >= 0 AND "shipping_discount" >= 0
  AND "shipping_discount" <= "shipping_fee"
  AND "total_amount" = "subtotal" + "shipping_fee" - "discount_amount" - "shipping_discount"
);

-- Chi tiết đơn: snapshot tên/slug/ảnh sản phẩm
ALTER TABLE "order_items"
  ADD COLUMN "product_name" TEXT,
  ADD COLUMN "product_slug" TEXT,
  ADD COLUMN "image_key" TEXT;
UPDATE "order_items" oi SET "product_name" = p."name", "product_slug" = p."slug", "image_key" = p."image_key"
FROM "products" p WHERE p."id" = oi."product_id";
ALTER TABLE "order_items" ALTER COLUMN "product_name" SET NOT NULL, ALTER COLUMN "product_slug" SET NOT NULL;
