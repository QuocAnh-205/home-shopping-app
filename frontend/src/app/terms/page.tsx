import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Điều khoản sử dụng' };

export default function TermsPage() {
  return (
    <LegalPage title="Điều khoản sử dụng" updated="02/11/2026" path="/terms">
      <p>Khi tạo tài khoản hoặc mua hàng tại Home Shopping App, bạn đồng ý với các điều khoản dưới đây.</p>

      <h2>1. Tài khoản</h2>
      <ul>
        <li>Bạn chịu trách nhiệm giữ bí mật mật khẩu và mọi hoạt động trên tài khoản của mình.</li>
        <li>Bạn có thể đăng ký bằng email hoặc bằng tài khoản Google/Facebook; hai cách có giá trị như nhau.</li>
        <li>Chúng tôi có thể tạm khóa tài khoản có dấu hiệu gian lận hoặc lạm dụng hệ thống.</li>
      </ul>

      <h2>2. Đặt hàng & thanh toán</h2>
      <ul>
        <li>Giá hiển thị đã gồm VAT. Đơn hàng thanh toán khi nhận hàng (COD).</li>
        <li>Bạn có thể tự hủy đơn khi đơn còn ở trạng thái Chờ xác nhận hoặc Đã thanh toán (chưa giao).</li>
        <li>Đổi trả miễn phí trong 30 ngày với sản phẩm lỗi do nhà sản xuất hoặc giao sai mẫu.</li>
      </ul>

      <h2>3. Đánh giá sản phẩm</h2>
      <p>
        Nội dung đánh giá phải trung thực, không xúc phạm, không quảng cáo. Quản trị viên có quyền gỡ đánh giá vi phạm. Mỗi tài khoản có một đánh giá cho
        mỗi sản phẩm và có thể sửa hoặc xóa bất cứ lúc nào.
      </p>

      <h2>4. Quyền riêng tư</h2>
      <p>
        Việc thu thập và sử dụng dữ liệu cá nhân tuân theo <Link href="/privacy">Chính sách bảo mật</Link>. Bạn có thể{' '}
        <Link href="/data-deletion">xóa tài khoản</Link> bất cứ lúc nào.
      </p>

      <h2>5. Thay đổi điều khoản</h2>
      <p>Điều khoản có thể được cập nhật; ngày cập nhật gần nhất luôn được ghi ở đầu trang.</p>
    </LegalPage>
  );
}
