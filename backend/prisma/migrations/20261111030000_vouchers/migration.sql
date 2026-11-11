-- Voucher kiểu Shopee: giảm %, giảm tiền cố định, miễn phí vận chuyển; ví voucher; lượt dùng theo đơn.
-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('PERCENT', 'FIXED', 'FREESHIP');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shipping_voucher_code" VARCHAR(32),
ADD COLUMN     "voucher_code" VARCHAR(32);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "type" "VoucherType" NOT NULL,
    "value" INTEGER NOT NULL,
    "max_discount" INTEGER,
    "min_order_value" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "per_user_limit" INTEGER NOT NULL DEFAULT 1,
    "category_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "product_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vouchers" (
    "user_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_vouchers_pkey" PRIMARY KEY ("user_id","voucher_id")
);

-- CreateTable
CREATE TABLE "voucher_usages" (
    "id" BIGSERIAL NOT NULL,
    "voucher_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "discount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");

-- CreateIndex
CREATE INDEX "vouchers_is_active_ends_at_idx" ON "vouchers"("is_active", "ends_at");

-- CreateIndex
CREATE INDEX "user_vouchers_voucher_id_idx" ON "user_vouchers"("voucher_id");

-- CreateIndex
CREATE INDEX "voucher_usages_voucher_id_user_id_idx" ON "voucher_usages"("voucher_id", "user_id");

-- CreateIndex
CREATE INDEX "voucher_usages_order_id_idx" ON "voucher_usages"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_usages_voucher_id_order_id_key" ON "voucher_usages"("voucher_id", "order_id");

-- AddForeignKey
ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ràng buộc dữ liệu: không thể lưu voucher sai cấu hình hay vượt tổng lượt dùng (kể cả khi bug ở tầng ứng dụng)
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_code_format" CHECK ("code" ~ '^[A-Z0-9]{4,32}$');
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_value_valid" CHECK (
  ("type" = 'PERCENT' AND "value" BETWEEN 1 AND 100)
  OR ("type" = 'FIXED' AND "value" > 0)
  OR ("type" = 'FREESHIP' AND "value" >= 0)
);
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_limits_valid" CHECK (
  "min_order_value" >= 0 AND "per_user_limit" >= 1 AND ("max_discount" IS NULL OR "max_discount" > 0)
  AND "ends_at" > "starts_at" AND "used_count" >= 0 AND ("usage_limit" IS NULL OR "used_count" <= "usage_limit")
);
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_discount_non_negative" CHECK ("discount" >= 0);
