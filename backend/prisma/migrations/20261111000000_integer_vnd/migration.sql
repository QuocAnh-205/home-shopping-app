-- Tiền lưu bằng số nguyên VND (VND không có đơn vị lẻ). Làm tròn giá trị cũ (nếu có phần lẻ) rồi đổi kiểu.
-- Các CHECK (price >= 0, total >= 0, compare_at_price > price) được giữ nguyên và kiểm tra lại khi đổi kiểu.
ALTER TABLE "products"
  ALTER COLUMN "price" TYPE INTEGER USING ROUND("price")::integer,
  ALTER COLUMN "compare_at_price" TYPE INTEGER USING ROUND("compare_at_price")::integer;

ALTER TABLE "orders" ALTER COLUMN "total_amount" TYPE INTEGER USING ROUND("total_amount")::integer;

ALTER TABLE "order_items" ALTER COLUMN "unit_price" TYPE INTEGER USING ROUND("unit_price")::integer;
