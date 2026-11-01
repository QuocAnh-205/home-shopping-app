import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Chính sách bảo mật' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Chính sách bảo mật" updated="02/11/2026" path="/privacy">
      <p>
        Home Shopping App (“chúng tôi”) tôn trọng quyền riêng tư của bạn. Trang này mô tả dữ liệu chúng tôi thu thập, mục đích sử dụng và quyền của bạn
        đối với dữ liệu đó.
      </p>

      <h2>1. Dữ liệu chúng tôi thu thập</h2>
      <ul>
        <li>
          <strong>Thông tin tài khoản:</strong> họ tên, email, mật khẩu (chỉ lưu dạng băm bcrypt, không ai đọc được), số điện thoại, giới tính, ngày sinh
          và ảnh đại diện nếu bạn tự cung cấp.
        </li>
        <li>
          <strong>Khi đăng nhập bằng Google hoặc Facebook:</strong> chúng tôi chỉ nhận <em>họ tên, địa chỉ email và ảnh đại diện</em> công khai (quyền{' '}
          <code>openid email profile</code> của Google, <code>email public_profile</code> của Facebook). Chúng tôi <strong>không</strong> nhận mật khẩu,
          danh bạ, bạn bè hay bài đăng của bạn và không đăng bất cứ thứ gì thay bạn.
        </li>
        <li>
          <strong>Mua hàng:</strong> sổ địa chỉ giao hàng, đơn hàng, giỏ hàng, đánh giá sản phẩm.
        </li>
        <li>
          <strong>Kỹ thuật:</strong> nhật ký truy cập (địa chỉ IP, thời gian, đường dẫn) để bảo mật và vận hành; nhật ký được tự xóa theo chu kỳ.
        </li>
      </ul>

      <h2>2. Mục đích sử dụng</h2>
      <ul>
        <li>Tạo và đăng nhập tài khoản, xử lý và giao đơn hàng, chăm sóc khách hàng.</li>
        <li>Gửi email cần thiết (đặt lại mật khẩu, bản tin nếu bạn đăng ký).</li>
        <li>Phát hiện gian lận, chống dò mật khẩu (khóa tạm thời sau nhiều lần đăng nhập sai).</li>
      </ul>
      <p>Chúng tôi không bán, cho thuê hay chia sẻ dữ liệu cá nhân của bạn cho bên thứ ba vì mục đích quảng cáo.</p>

      <h2>3. Lưu trữ & bảo mật</h2>
      <p>
        Dữ liệu được lưu trên máy chủ Amazon Web Services tại Singapore, truyền qua HTTPS, ổ đĩa và bản sao lưu được mã hóa. Bản sao lưu cơ sở dữ liệu được
        giữ tối đa 30 ngày.
      </p>

      <h2>4. Quyền của bạn</h2>
      <ul>
        <li>
          Xem và sửa thông tin tại <Link href="/account">Tài khoản của tôi</Link>.
        </li>
        <li>Hủy liên kết Google/Facebook trong phần cài đặt bảo mật của Google/Facebook bất cứ lúc nào.</li>
        <li>
          Xóa tài khoản và dữ liệu cá nhân: xem <Link href="/data-deletion">hướng dẫn xóa dữ liệu</Link>.
        </li>
      </ul>

      <h2>5. Cookie</h2>
      <p>
        Chúng tôi chỉ dùng cookie kỹ thuật bắt buộc trong lúc đăng nhập Google/Facebook (chống giả mạo yêu cầu, hết hạn sau 10 phút) và bộ nhớ trình duyệt
        để giữ phiên đăng nhập, giao diện sáng/tối. Không dùng cookie quảng cáo hay theo dõi của bên thứ ba.
      </p>

      <h2>6. Liên hệ</h2>
      <p>Mọi thắc mắc về quyền riêng tư, vui lòng liên hệ chủ sở hữu ứng dụng: Nguyễn Quốc Anh.</p>
    </LegalPage>
  );
}
