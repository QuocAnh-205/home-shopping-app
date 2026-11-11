-- Khách báo đã chuyển khoản (VietQR): giữ đơn thêm chờ cửa hàng đối soát.
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "transfer_claimed_at" TIMESTAMP(3);

