'use client';

import { faFacebookF, faInstagram, faTiktok, faYoutube } from '@fortawesome/free-brands-svg-icons';
import {
  faClock,
  faEnvelope,
  faEnvelopeOpenText,
  faHandHoldingDollar,
  faHeadset,
  faHouseChimney,
  faLocationDot,
  faMoneyBillWave,
  faRotateLeft,
  faShieldHalved,
  faTruckFast,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NewsletterForm } from './NewsletterForm';
import { POLICY, SITE } from '@/lib/site';

const SHOP_LINKS = [
  ['Nhà bếp', 'nha-bep'],
  ['Bàn ăn', 'ban-an'],
  ['Phòng khách', 'phong-khach'],
  ['Phòng ngủ', 'phong-ngu'],
  ['Điện gia dụng', 'dien-gia-dung'],
  ['Phòng tắm', 'phong-tam'],
  ['Trang trí', 'trang-tri'],
] as const;

const SOCIAL = [
  { icon: faFacebookF, label: 'Facebook', href: 'https://www.facebook.com' },
  { icon: faInstagram, label: 'Instagram', href: 'https://www.instagram.com' },
  { icon: faTiktok, label: 'TikTok', href: 'https://www.tiktok.com' },
  { icon: faYoutube, label: 'YouTube', href: 'https://www.youtube.com' },
];

export function Footer() {
  // Điện thoại: footer đầy đủ chỉ ở trang chủ; các trang mua hàng / tài khoản chỉ giữ dòng bản quyền cho gọn
  const pathname = usePathname();
  return (
    <footer className={pathname === '/' ? 'footer' : 'footer footer-compact'}>
      <div className="container">
        <section className="newsletter">
          <span className="newsletter-ico" aria-hidden>
            <FontAwesomeIcon icon={faEnvelopeOpenText} />
          </span>
          <div>
            <h3>Nhận ưu đãi độc quyền mỗi tuần</h3>
            <p>Sản phẩm mới, mã giảm giá và mẹo trang trí nhà cửa – không spam, hủy bất cứ lúc nào.</p>
          </div>
          <NewsletterForm />
        </section>

        <div className="footer-grid">
          <div className="footer-about">
            <Link href="/" className="brand">
              <span className="brand-mark">
                <FontAwesomeIcon icon={faHouseChimney} />
              </span>
              Home Shopping
            </Link>
            <p>Đồ gia dụng, nội thất và thiết bị nhà bếp được tuyển chọn cho tổ ấm hiện đại. Chính hãng – giao nhanh – đổi trả dễ dàng.</p>
            <div className="social-links">
              {SOCIAL.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label}>
                  <FontAwesomeIcon icon={s.icon} />
                </a>
              ))}
            </div>
          </div>
          <div>
            <h4>Danh mục</h4>
            <ul>
              {SHOP_LINKS.map(([label, slug]) => (
                <li key={slug}>
                  <Link href={`/?category=${slug}#products`}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Hỗ trợ khách hàng</h4>
            <ul>
              <li>
                <Link href="/orders">Tra cứu đơn hàng</Link>
              </li>
              <li>
                <Link href="/warranty">Tra cứu bảo hành điện tử</Link>
              </li>
              <li>
                <Link href="/compare">So sánh sản phẩm</Link>
              </li>
              <li>
                <Link href="/account">Tài khoản của tôi</Link>
              </li>
              <li>
                <Link href="/forgot-password">Quên mật khẩu</Link>
              </li>
              <li>
                <Link href="/?sale=1#products">Sản phẩm khuyến mãi</Link>
              </li>
              <li>
                <Link href="/?sort=best_selling#products">Sản phẩm bán chạy</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Liên hệ</h4>
            <ul>
              <li>
                <FontAwesomeIcon icon={faHeadset} fixedWidth /> <a href={SITE.hotlineHref}>Tổng đài {SITE.hotline}</a>
              </li>
              <li>
                <FontAwesomeIcon icon={faEnvelope} fixedWidth /> <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </li>
              <li>
                <FontAwesomeIcon icon={faClock} fixedWidth /> {SITE.supportHours}
              </li>
              <li>
                <FontAwesomeIcon icon={faLocationDot} fixedWidth /> Giao hàng toàn quốc
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-policies">
          <span>
            <FontAwesomeIcon icon={faTruckFast} /> {POLICY.freeShip}
          </span>
          <span>
            <FontAwesomeIcon icon={faRotateLeft} /> {POLICY.returns}
          </span>
          <span>
            <FontAwesomeIcon icon={faShieldHalved} /> Hàng chính hãng 100%
          </span>
          <span>
            <FontAwesomeIcon icon={faMoneyBillWave} /> COD, VNPay, MoMo
          </span>
          <span>
            <FontAwesomeIcon icon={faHandHoldingDollar} /> Hoàn tiền tự động khi hủy đơn
          </span>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Home Shopping App bản quyền của Nguyễn Quốc Anh & Tâm.</span>
          <nav className="footer-legal" aria-label="Chính sách">
            <Link href="/privacy">Chính sách bảo mật</Link>
            <Link href="/terms">Điều khoản sử dụng</Link>
            <Link href="/data-deletion">Xóa dữ liệu</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
