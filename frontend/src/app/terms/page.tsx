import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Điều khoản sử dụng' };

export default function TermsPage() {
  return (
    <LegalPage title="Điều khoản sử dụng" updated="11/11/2026" path="/terms">
      <p>Khi tạo tài khoản hoặc mua hàng tại Home Shopping App, bạn đồng ý với các điều khoản dưới đây.</p>

      <h2>1. Tài khoản</h2>
      <ul>
        <li>Bạn chịu trách nhiệm giữ bí mật mật khẩu và mọi hoạt động trên tài khoản của mình.</li>
        <li>Bạn có thể đăng ký bằng email hoặc bằng tài khoản Google/Facebook; hai cách có giá trị như nhau.</li>
        <li>Chúng tôi có thể tạm khóa tài khoản có dấu hiệu gian lận hoặc lạm dụng hệ thống.</li>
      </ul>

      <h2>2. Đặt hàng & thanh toán</h2>
      <ul>
        <li>Giá hiển thị đã gồm VAT. Phí vận chuyển tính theo địa chỉ nhận và khối lượng gói hàng, hiển thị trước khi đặt; đơn đạt ngưỡng được miễn phí vận chuyển.</li>
        <li>
          Hình thức thanh toán: khi nhận hàng (COD) hoặc online qua VNPay, ví MoMo, chuyển khoản VietQR (theo các phương thức đang hiển thị ở trang thanh toán).
          Đơn thanh toán online được giữ hàng 15 phút; quá hạn chưa thanh toán đơn tự hủy.
        </li>
        <li>Giá và ưu đãi được kiểm tra lại khi đặt hàng; nếu có thay đổi, bạn sẽ được thông báo trước khi đơn được tạo.</li>
        <li>Bạn có thể tự hủy đơn khi đơn còn ở trạng thái Chờ thanh toán hoặc Chờ xác nhận. Đơn đã thanh toán online khi bị hủy được hoàn tiền về phương thức đã dùng.</li>
        <li>Yêu cầu trả hàng/hoàn tiền trong 15 ngày kể từ khi nhận hàng, kèm lý do và hình ảnh; cửa hàng xem xét và phản hồi yêu cầu.</li>
        <li>Voucher: mỗi đơn dùng tối đa 1 voucher giảm giá và 1 voucher vận chuyển; voucher được trả lại lượt khi đơn bị hủy.</li>
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
