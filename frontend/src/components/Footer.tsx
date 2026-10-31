import {
  faClock,
  faEnvelope,
  faHouseChimney,
  faLocationDot,
  faPhone,
  faRotateLeft,
  faShieldHalved,
  faTruckFast,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-about">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <FontAwesomeIcon icon={faHouseChimney} />
            </span>
            Home Shopping
          </Link>
          <p>Đồ gia dụng, nội thất và thiết bị nhà bếp được tuyển chọn cho tổ ấm hiện đại của bạn.</p>
        </div>
        <div>
          <h4>Mua sắm</h4>
          <ul>
            <li>
              <Link href="/?category=nha-bep#products">Nhà bếp</Link>
            </li>
            <li>
              <Link href="/?category=phong-khach#products">Phòng khách</Link>
            </li>
            <li>
              <Link href="/?category=phong-ngu#products">Phòng ngủ</Link>
            </li>
            <li>
              <Link href="/?category=dien-gia-dung#products">Điện gia dụng</Link>
            </li>
          </ul>
        </div>
        <div>
          <h4>Chính sách</h4>
          <ul>
            <li>
              <FontAwesomeIcon icon={faTruckFast} fixedWidth /> Giao nhanh 2 giờ nội thành
            </li>
            <li>
              <FontAwesomeIcon icon={faRotateLeft} fixedWidth /> Đổi trả miễn phí 30 ngày
            </li>
            <li>
              <FontAwesomeIcon icon={faShieldHalved} fixedWidth /> Bảo hành chính hãng
            </li>
          </ul>
        </div>
        <div>
          <h4>Liên hệ</h4>
          <ul>
            <li>
              <FontAwesomeIcon icon={faLocationDot} fixedWidth /> Giao hàng toàn quốc
            </li>
            <li>
              <FontAwesomeIcon icon={faPhone} fixedWidth /> 1900 0000
            </li>
            <li>
              <FontAwesomeIcon icon={faEnvelope} fixedWidth /> hotro@homeshop.local
            </li>
            <li>
              <FontAwesomeIcon icon={faClock} fixedWidth /> 8:00 – 21:00 mỗi ngày
            </li>
          </ul>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Home Shopping App · Đồ án DevOps</span>
        <span>Ảnh sản phẩm: Unsplash (Unsplash License)</span>
      </div>
    </footer>
  );
}
