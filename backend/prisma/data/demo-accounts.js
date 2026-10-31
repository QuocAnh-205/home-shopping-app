'use strict';

/**
 * ============================================================
 *  TÀI KHOẢN DEMO — SỬA TẠI ĐÂY
 * ============================================================
 * Chỉ được tạo khi biến môi trường SEED_DEMO_DATA=true (đã bật sẵn trong docker-compose.local.yml).
 * Production KHÔNG bật cờ này → không có tài khoản mặc định nào.
 *
 * - Đổi email / họ tên / mật khẩu / vai trò tùy ý rồi khởi động lại backend:
 *     docker compose -f docker-compose.local.yml up -d --build backend
 *   Seed sẽ cập nhật họ tên, vai trò và mật khẩu theo file này mỗi lần khởi động.
 * - Đổi EMAIL nghĩa là tạo tài khoản mới (email cũ vẫn còn trong DB). Muốn xóa sạch dữ liệu cũ:
 *     docker compose -f docker-compose.local.yml down -v   (xóa cả database local!)
 * - Mật khẩu phải đúng chính sách: ≥ 8 ký tự, có chữ hoa, chữ thường và chữ số.
 * - role: 'ADMIN' (vào được /admin) hoặc 'CUSTOMER'.
 * - Đánh giá mẫu và lịch sử đơn hàng mẫu được gán ngẫu nhiên (cố định) cho các tài khoản CUSTOMER bên dưới.
 */
const demoAccounts = [
  { email: 'admin@homeshop.local', fullName: 'Quản trị viên', password: 'Admin12345', role: 'ADMIN' },
  { email: 'khach@homeshop.local', fullName: 'Phạm Quốc Bảo', password: 'Khach12345', role: 'CUSTOMER' },
  { email: 'lan.nguyen@homeshop.local', fullName: 'Nguyễn Thị Lan', password: 'Khach12345', role: 'CUSTOMER' },
  { email: 'minh.tran@homeshop.local', fullName: 'Trần Văn Minh', password: 'Khach12345', role: 'CUSTOMER' },
  { email: 'huong.le@homeshop.local', fullName: 'Lê Thu Hương', password: 'Khach12345', role: 'CUSTOMER' },
];

module.exports = { demoAccounts };
