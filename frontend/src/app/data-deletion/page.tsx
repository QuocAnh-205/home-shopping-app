import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Xóa dữ liệu người dùng' };

export default function DataDeletionPage() {
  return (
    <LegalPage title="Hướng dẫn xóa dữ liệu người dùng" updated="02/11/2026" path="/data-deletion">
      <p>
        Bạn có quyền xóa tài khoản và dữ liệu cá nhân của mình bất cứ lúc nào, kể cả tài khoản được tạo bằng Google hoặc Facebook. Việc xóa được thực hiện
        ngay lập tức, không cần chờ duyệt.
      </p>

      <h2>Cách xóa tài khoản</h2>
      <ol>
        <li>
          <Link href="/login?next=%2Faccount%3Ftab%3Dpassword">Đăng nhập</Link> bằng cách bạn đã dùng để đăng ký (email, Google hoặc Facebook).
        </li>
        <li>
          Vào <Link href="/account?tab=password">Tài khoản của tôi → Đổi mật khẩu</Link>, kéo xuống mục <strong>Xóa tài khoản</strong>.
        </li>
        <li>Nhập lại email của bạn (và mật khẩu nếu tài khoản có mật khẩu), bấm <strong>Xóa vĩnh viễn tài khoản</strong>.</li>
      </ol>

      <h2>Dữ liệu bị xóa</h2>
      <ul>
        <li>Họ tên, email, số điện thoại, giới tính, ngày sinh, ảnh đại diện, mật khẩu.</li>
        <li>Toàn bộ sổ địa chỉ, giỏ hàng, đánh giá sản phẩm, đăng ký nhận bản tin.</li>
        <li>Liên kết với tài khoản Google/Facebook (chúng tôi không còn lưu mã định danh Google/Facebook của bạn).</li>
        <li>Mọi phiên đăng nhập trên các thiết bị bị đăng xuất ngay.</li>
      </ul>

      <h2>Dữ liệu được giữ lại</h2>
      <p>
        Lịch sử đơn hàng được giữ lại để phục vụ nghĩa vụ kế toán, thuế và bảo hành, nhưng được <strong>ẩn danh hóa</strong>: không còn gắn với họ tên,
        email hay tài khoản Google/Facebook của bạn. Bản sao lưu cơ sở dữ liệu tự động hết hạn sau tối đa 30 ngày.
      </p>

      <h2>Gỡ quyền truy cập ở phía Google/Facebook</h2>
      <ul>
        <li>
          Google: <em>myaccount.google.com → Bảo mật → Ứng dụng và dịch vụ của bên thứ ba</em> → chọn Home Shopping → Xóa quyền truy cập.
        </li>
        <li>
          Facebook: <em>Cài đặt → Ứng dụng và trang web</em> → chọn Home Shopping → Gỡ.
        </li>
      </ul>
    </LegalPage>
  );
}
