-- Trung tâm tài khoản kiểu Shopee: tên đăng nhập, cài đặt, tài khoản ngân hàng, thông báo, xu thưởng.
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER', 'PAYMENT', 'COINS', 'PROMOTION', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "CoinTxType" AS ENUM ('EARN_ORDER', 'EARN_REVIEW', 'SPEND_ORDER', 'REFUND_ORDER', 'REVOKE_ORDER');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "coins_used" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "coin_balance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "username" VARCHAR(30),
ADD COLUMN     "username_changed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bank_bin" VARCHAR(6) NOT NULL,
    "bank_name" VARCHAR(100) NOT NULL,
    "account_no" VARCHAR(30) NOT NULL,
    "holder_name" VARCHAR(100) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "link" VARCHAR(255),
    "dedupe_key" VARCHAR(120),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "CoinTxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "order_id" UUID,
    "ref_key" VARCHAR(120) NOT NULL,
    "note" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_accounts_user_id_idx" ON "bank_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_user_id_bank_bin_account_no_key" ON "bank_accounts"("user_id", "bank_bin", "account_no");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "coin_transactions_ref_key_key" ON "coin_transactions"("ref_key");

-- CreateIndex
CREATE INDEX "coin_transactions_user_id_created_at_idx" ON "coin_transactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Xu không bao giờ âm; tổng tiền đơn trừ cả xu đã dùng
ALTER TABLE "users" ADD CONSTRAINT "users_coin_balance_non_negative" CHECK ("coin_balance" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "users_username_format" CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9._]{4,30}$');
ALTER TABLE "orders" ADD CONSTRAINT "orders_coins_used_non_negative" CHECK ("coins_used" >= 0);
ALTER TABLE "orders" DROP CONSTRAINT "orders_amounts_consistent";
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_consistent" CHECK (
  "subtotal" >= 0 AND "shipping_fee" >= 0 AND "discount_amount" >= 0 AND "shipping_discount" >= 0
  AND "shipping_discount" <= "shipping_fee"
  AND "total_amount" = "subtotal" + "shipping_fee" - "discount_amount" - "shipping_discount" - "coins_used"
);

-- Mỗi người tối đa 1 tài khoản ngân hàng mặc định
CREATE UNIQUE INDEX "bank_accounts_one_default_per_user" ON "bank_accounts"("user_id") WHERE "is_default";

-- Tên đăng nhập cho tài khoản đã có: phần trước @ của email (chỉ a-z0-9._) + 4 ký tự từ id → không trùng
UPDATE "users" SET "username" = left(
    coalesce(nullif(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._]', '', 'g'), ''), 'user'),
    24
  ) || substr(md5("id"::text), 1, 4)
WHERE "username" IS NULL;
