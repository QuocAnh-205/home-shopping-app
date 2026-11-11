import { HttpStatus, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export type WarrantyState = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NOT_DELIVERED' | 'NO_WARRANTY';

export interface WarrantyItem {
  productName: string;
  productSlug: string;
  quantity: number;
  warrantyMonths: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  state: WarrantyState;
}

export interface WarrantyLookup {
  orderCode: string;
  orderedAt: string;
  deliveredAt: string | null;
  status: OrderStatus;
  items: WarrantyItem[];
}

/** Còn ≤ 30 ngày → nhắc khách sắp hết hạn */
const EXPIRING_DAYS = 30;

/** Cộng tháng theo lịch (31/01 + 1 tháng = 28|29/02, không tràn sang tháng 3) */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export function warrantyOf(deliveredAt: Date | null, months: number | null, now = new Date()): Pick<WarrantyItem, 'startsAt' | 'expiresAt' | 'daysLeft' | 'state'> {
  if (!months) return { startsAt: deliveredAt?.toISOString() ?? null, expiresAt: null, daysLeft: null, state: 'NO_WARRANTY' };
  if (!deliveredAt) return { startsAt: null, expiresAt: null, daysLeft: null, state: 'NOT_DELIVERED' };
  const expires = addMonths(deliveredAt, months);
  const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / 86_400_000);
  return {
    startsAt: deliveredAt.toISOString(),
    expiresAt: expires.toISOString(),
    daysLeft: Math.max(0, daysLeft),
    state: daysLeft <= 0 ? 'EXPIRED' : daysLeft <= EXPIRING_DAYS ? 'EXPIRING' : 'ACTIVE',
  };
}

/**
 * Tra cứu bảo hành điện tử: không cần đăng nhập, xác minh bằng MÃ ĐƠN + SĐT nhận hàng.
 * Bảo hành tính từ ngày giao thành công; thời hạn lấy theo snapshot lúc mua (đơn cũ: theo sản phẩm hiện tại).
 */
@Injectable()
export class WarrantyService {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(orderCode: string, phone: string, now = new Date()): Promise<WarrantyLookup> {
    // id là UUID → so tiền tố trên dạng text; điều kiện SĐT nằm ngay trong câu truy vấn
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM orders
      WHERE id::text LIKE ${orderCode + '%'} AND regexp_replace(phone, '[^0-9]', '', 'g') = ${phone}
      LIMIT 2`;
    // Không phân biệt "sai mã" với "sai SĐT" → không lộ mã đơn nào tồn tại
    if (rows.length !== 1) {
      throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng khớp mã đơn và số điện thoại', HttpStatus.NOT_FOUND);
    }
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: rows[0].id },
      select: {
        id: true,
        status: true,
        createdAt: true,
        deliveredAt: true,
        items: {
          orderBy: { id: 'asc' },
          select: { productName: true, productSlug: true, quantity: true, warrantyMonths: true, product: { select: { warrantyMonths: true } } },
        },
      },
    });
    const delivered = order.status === OrderStatus.CANCELLED ? null : order.deliveredAt;
    return {
      orderCode: order.id.slice(0, 8).toUpperCase(),
      orderedAt: order.createdAt.toISOString(),
      deliveredAt: delivered?.toISOString() ?? null,
      status: order.status,
      items: order.items.map((i) => {
        const months = i.warrantyMonths ?? i.product.warrantyMonths ?? null;
        return {
          productName: i.productName,
          productSlug: i.productSlug,
          quantity: i.quantity,
          warrantyMonths: months,
          ...(order.status === OrderStatus.RETURNED ? { startsAt: null, expiresAt: null, daysLeft: null, state: 'EXPIRED' as const } : warrantyOf(delivered, months, now)),
        };
      }),
    };
  }
}
