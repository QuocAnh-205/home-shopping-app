/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  // Xuất bản build tối giản (server.js + node_modules cần thiết) để image Docker nhỏ nhất
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  compress: false, // Nginx đã gzip, tránh nén 2 lần tốn CPU
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
