import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Home Shopping - Đồ gia dụng chính hãng', template: '%s | Home Shopping' },
  description: 'Mua sắm đồ gia dụng, nội thất, thiết bị nhà bếp giao hàng tận nơi.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#c2410c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <a href="#main" className="skip-link">
          Bỏ qua tới nội dung chính
        </a>
        <Header />
        <main id="main" className="container main">
          {children}
        </main>
        <footer className="footer">
          <div className="container footer-inner">
            <span>© {new Date().getFullYear()} Home Shopping App · Đồ án DevOps</span>
            <span className="muted small">Giao nhanh 2h · Đổi trả 30 ngày · Thanh toán khi nhận hàng</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
