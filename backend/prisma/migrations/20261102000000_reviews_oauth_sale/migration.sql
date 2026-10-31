-- Đánh giá sản phẩm, giá khuyến mãi, số đã bán, đăng nhập Google/Facebook, quên mật khẩu, nhận bản tin

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'FACEBOOK');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "compare_at_price" DECIMAL(12,2),
ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sold_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "specs" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_url" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" SERIAL NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "verified_purchase" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_user_id_key" ON "oauth_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "reviews_product_id_created_at_idx" ON "reviews"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_created_at_idx" ON "reviews"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_product_id_user_id_key" ON "reviews"("product_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE INDEX "products_sold_count_idx" ON "products"("sold_count");

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ràng buộc nghiệp vụ ở tầng DB (phòng thủ khi có code path bỏ qua validation)
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "products" ADD CONSTRAINT "products_compare_at_price_gt_price" CHECK ("compare_at_price" IS NULL OR "compare_at_price" > "price");
ALTER TABLE "products" ADD CONSTRAINT "products_sold_count_non_negative" CHECK ("sold_count" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_rating_range" CHECK ("rating_avg" BETWEEN 0 AND 5 AND "rating_count" >= 0);
