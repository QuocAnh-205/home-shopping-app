import type { ExecutionContext } from '@nestjs/common';
import { isIP } from 'node:net';

interface MinimalRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

/** IP trong mạng nội bộ (Docker bridge, VPC) hoặc loopback; hỗ trợ dạng IPv4-mapped "::ffff:172.18.0.5" */
export function isPrivateAddress(raw: string | undefined): boolean {
  if (!raw) return false;
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd');
  }
  return false;
}

/**
 * Request ĐỌC dữ liệu do chính hệ thống gọi từ mạng nội bộ – chủ yếu frontend Next.js render trang trên server (SSR).
 *
 * Vì sao cần: SSR gọi thẳng backend nên mọi khách truy cập cùng mang IP của container frontend. Nếu đếm chung,
 * vài chục lượt xem/phút đã hết hạn mức 120 request/phút → backend trả 429 → MỌI trang sản phẩm sập thành lỗi 500.
 *
 * Vì sao an toàn: backend không mở cổng ra Internet; mọi request từ bên ngoài đều qua Nginx, và Nginx luôn GHI ĐÈ
 * X-Forwarded-For bằng IP thật (khách không tự gắn header này để lách được). Request từ khách vì vậy luôn có header
 * → vẫn bị giới hạn theo IP thật của họ ở Nginx lẫn backend. Chỉ GET/HEAD được miễn: đăng nhập, đặt hàng… (POST) luôn bị đếm.
 */
export function isInternalReadRequest(req: MinimalRequest): boolean {
  const method = (req.method ?? '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (req.headers?.['x-forwarded-for'] !== undefined || req.headers?.['x-real-ip'] !== undefined) return false;
  return isPrivateAddress(req.socket?.remoteAddress);
}

export function isInternalReadContext(context: ExecutionContext): boolean {
  if (context.getType() !== 'http') return false;
  return isInternalReadRequest(context.switchToHttp().getRequest<MinimalRequest>());
}
