-- Trang "Tài khoản của tôi": hồ sơ (SĐT, giới tính, ngày sinh) + sổ địa chỉ giao hàng

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('HOME', 'OFFICE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "phone" VARCHAR(15);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "province" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "ward" VARCHAR(100) NOT NULL,
    "street" VARCHAR(255) NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'HOME',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "addresses_user_id_created_at_idx" ON "addresses"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tối đa 1 địa chỉ mặc định / người dùng (Prisma chưa mô tả được partial index → khai báo thủ công)
CREATE UNIQUE INDEX "addresses_one_default_per_user" ON "addresses"("user_id") WHERE "is_default";

-- Ràng buộc dữ liệu hồ sơ
ALTER TABLE "users" ADD CONSTRAINT "users_phone_format" CHECK ("phone" IS NULL OR "phone" ~ '^0[0-9]{9,10}$');
ALTER TABLE "users" ADD CONSTRAINT "users_dob_range" CHECK ("date_of_birth" IS NULL OR ("date_of_birth" >= DATE '1900-01-01'));
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_phone_format" CHECK ("phone" ~ '^0[0-9]{9,10}$');
