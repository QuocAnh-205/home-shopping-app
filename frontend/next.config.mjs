/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

const nextConfig = {
  // Xuất bản build tối giản (server.js + node_modules cần thiết) để image Docker nhỏ nhất
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  compress: false, // Nginx đã gzip, tránh nén 2 lần tốn CPU
  images: { unoptimized: true },
  // Trình duyệt luôn tự gọi /favicon.ico → trỏ về icon SVG duy nhất của site
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/favicon.svg' }];
  },
  // Danh sách sản phẩm nằm ở trang chủ (lọc/tìm kiếm) → /products chuyển về đúng khu vực đó
  async redirects() {
    return [{ source: '/products', destination: '/#products', permanent: false }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
