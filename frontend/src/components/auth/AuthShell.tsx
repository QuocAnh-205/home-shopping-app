import { faCircleCheck, faHouseChimney } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import type { ReactNode } from 'react';

const BENEFITS = [
  'Theo dõi đơn hàng & lịch sử mua sắm',
  'Giỏ hàng đồng bộ trên mọi thiết bị',
  'Viết đánh giá, nhận ưu đãi thành viên',
  'Đăng nhập nhanh bằng Google hoặc Facebook',
];

/** Khung 2 cột cho các trang xác thực: ảnh thương hiệu bên trái, form bên phải */
export function AuthShell({ children, image = '/images/site/cat-phong-khach.webp' }: { children: ReactNode; image?: string }) {
  return (
    <div className="auth">
      <div className="auth-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" width={800} height={800} />
        <Link href="/" className="brand brand-light">
          <span className="brand-mark">
            <FontAwesomeIcon icon={faHouseChimney} />
          </span>
          Home Shopping
        </Link>
        <div>
          <h2>Ngôi nhà đẹp hơn mỗi ngày</h2>
          <ul>
            {BENEFITS.map((b) => (
              <li key={b}>
                <FontAwesomeIcon icon={faCircleCheck} /> {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="auth-form">{children}</div>
    </div>
  );
}
