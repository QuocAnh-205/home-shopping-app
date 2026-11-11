-- Vòng đời đơn hàng kiểu Shopee: 9 trạng thái + lịch sử trạng thái + phương thức/trạng thái thanh toán.
-- Dữ liệu cũ: PAID (admin đã xác nhận) → PROCESSING (Đang chuẩn bị); các trạng thái khác giữ nguyên.

CREATE TYPE "ActorType" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'VNPAY', 'MOMO', 'VIETQR');
CREATE TYPE "OrderPaymentStatus" AS ENUM ('UNPAID', 'PAID', 'REFUND_PENDING', 'REFUNDED');

CREATE TYPE "OrderStatus_new" AS ENUM (
  'AWAITING_PAYMENT', 'PENDING', 'PROCESSING', 'SHIPPING', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED'
);
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new"
  USING (CASE "status"::text WHEN 'PAID' THEN 'PROCESSING' ELSE "status"::text END)::"OrderStatus_new";
DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "orders"
  ADD COLUMN "payment_method" "PaymentMethod" NOT NULL DEFAULT 'COD',
  ADD COLUMN "payment_status" "OrderPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN "paid_at" TIMESTAMP(3),
  ADD COLUMN "payment_expires_at" TIMESTAMP(3),
  ADD COLUMN "cancel_reason" VARCHAR(255),
  ADD COLUMN "cancelled_by" "ActorType",
  ADD COLUMN "confirmed_at" TIMESTAMP(3),
  ADD COLUMN "shipped_at" TIMESTAMP(3),
  ADD COLUMN "delivered_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_at" TIMESTAMP(3);

-- Đơn COD đã hoàn thành = đã thu tiền khi giao
UPDATE "orders" SET
  "payment_status" = 'PAID', "paid_at" = "updated_at", "delivered_at" = "updated_at", "completed_at" = "updated_at",
  "shipped_at" = "updated_at", "confirmed_at" = "created_at"
WHERE "status" = 'COMPLETED';
UPDATE "orders" SET "confirmed_at" = "created_at" WHERE "status" IN ('PROCESSING', 'SHIPPING');
UPDATE "orders" SET "shipped_at" = "updated_at" WHERE "status" = 'SHIPPING';
UPDATE "orders" SET "cancelled_at" = "updated_at", "cancelled_by" = 'CUSTOMER' WHERE "status" = 'CANCELLED';

CREATE TABLE "order_status_history" (
    "id" BIGSERIAL NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Đơn cũ: 1 mốc "đặt hàng" + 1 mốc trạng thái hiện tại (nếu khác)
INSERT INTO "order_status_history" ("order_id", "from_status", "to_status", "actor_type", "note", "created_at")
SELECT "id", NULL, 'PENDING', 'CUSTOMER', 'Đặt hàng', "created_at" FROM "orders";
INSERT INTO "order_status_history" ("order_id", "from_status", "to_status", "actor_type", "note", "created_at")
SELECT "id", 'PENDING', "status", 'SYSTEM', 'Chuyển đổi dữ liệu từ phiên bản cũ', "updated_at" FROM "orders" WHERE "status" <> 'PENDING';

CREATE INDEX "orders_user_id_status_created_at_idx" ON "orders"("user_id", "status", "created_at");
CREATE INDEX "orders_status_payment_expires_at_idx" ON "orders"("status", "payment_expires_at");
CREATE INDEX "orders_status_delivered_at_idx" ON "orders"("status", "delivered_at");
