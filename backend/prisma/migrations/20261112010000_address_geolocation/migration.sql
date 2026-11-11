-- Vị trí trên bản đồ (GPS / ghim) cho sổ địa chỉ và snapshot trong đơn hàng.
-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;


ALTER TABLE "addresses" ADD CONSTRAINT "addresses_coordinates_pair" CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
