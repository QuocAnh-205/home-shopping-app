import '@fortawesome/fontawesome-svg-core/styles.css';
import { config } from '@fortawesome/fontawesome-svg-core';
import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/MobileNav';
import './globals.css';

// CSS của Font Awesome đã import tĩnh ở trên → tắt chèn <style> lúc runtime (tránh nháy icon & hợp CSP)
config.autoAddCss = false;

// Font tự host lúc build (next/font) → không gọi Google Fonts từ trình duyệt, đúng CSP font-src 'self'
const font = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: { default: 'Home Shopping — Đồ gia dụng & nội thất chính hãng', template: '%s | Home Shopping' },
  description: 'Mua sắm đồ gia dụng, nội thất, thiết bị nhà bếp chính hãng. Giao nhanh 2 giờ, đổi trả 30 ngày, thanh toán khi nhận hàng.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f3ef' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0d0c' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Áp theme trước khi trang hiển thị → không bị nháy sáng khi người dùng chọn chế độ tối
const themeScript = `try{var t=localStorage.getItem('hs_theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={font.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Bỏ qua tới nội dung chính
        </a>
        <Header />
        <main id="main" className="container main">
          {children}
        </main>
        <Footer />
        <MobileNav />
      </body>
    </html>
  );
}
