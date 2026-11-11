import { Voucher, VoucherType } from '@prisma/client';
import { percentOf } from '../common/money';

/** Dòng hàng dùng để xét voucher (giá lấy từ DB, không phải từ client) */
export interface PricedLine {
  productId: string;
  categoryId: number;
  lineTotal: number;
}

export interface VoucherContext {
  now: Date;
  lines: PricedLine[];
  /** Phí ship còn phải trả SAU khi đã trừ miễn phí theo ngưỡng (voucher freeship chỉ giảm phần này) */
  remainingShippingFee: number;
  /** Số lần người dùng này đã dùng voucher (đơn chưa hủy) */
  usedByUser: number;
}

export type VoucherCheck =
  | { ok: true; discount: number; eligibleSubtotal: number }
  | { ok: false; reason: string; discount: 0; eligibleSubtotal: number };

export type VoucherRule = Pick<
  Voucher,
  | 'type'
  | 'value'
  | 'maxDiscount'
  | 'minOrderValue'
  | 'startsAt'
  | 'endsAt'
  | 'usageLimit'
  | 'usedCount'
  | 'perUserLimit'
  | 'categoryIds'
  | 'productIds'
  | 'isActive'
>;

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}₫`;

export function isShippingVoucher(v: Pick<Voucher, 'type'>): boolean {
  return v.type === VoucherType.FREESHIP;
}

/** Tổng tiền các dòng thuộc phạm vi voucher (rỗng = toàn shop) */
export function eligibleSubtotal(v: Pick<Voucher, 'categoryIds' | 'productIds'>, lines: PricedLine[]): number {
  const scoped = v.categoryIds.length > 0 || v.productIds.length > 0;
  return lines
    .filter((l) => !scoped || v.productIds.includes(l.productId) || v.categoryIds.includes(l.categoryId))
    .reduce((s, l) => s + l.lineTotal, 0);
}

/**
 * Xét 1 voucher với giỏ hiện tại. Trả về số tiền giảm hoặc lý do chưa dùng được (tiếng Việt, hiện ngay dưới voucher
 * giống Shopee: "Mua thêm 120.000₫ để dùng voucher").
 */
export function evaluateVoucher(v: VoucherRule, ctx: VoucherContext): VoucherCheck {
  const eligible = eligibleSubtotal(v, ctx.lines);
  const fail = (reason: string): VoucherCheck => ({ ok: false, reason, discount: 0, eligibleSubtotal: eligible });

  if (!v.isActive) return fail('Voucher đã ngừng áp dụng');
  if (ctx.now < v.startsAt) return fail(`Voucher có hiệu lực từ ${v.startsAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
  if (ctx.now >= v.endsAt) return fail('Voucher đã hết hạn');
  if (v.usageLimit !== null && v.usedCount >= v.usageLimit) return fail('Voucher đã hết lượt sử dụng');
  if (ctx.usedByUser >= v.perUserLimit) return fail('Bạn đã dùng hết lượt của voucher này');
  if (eligible === 0) return fail('Voucher không áp dụng cho sản phẩm đã chọn');
  if (eligible < v.minOrderValue) return fail(`Mua thêm ${vnd(v.minOrderValue - eligible)} để dùng voucher này`);

  let discount: number;
  switch (v.type) {
    case VoucherType.PERCENT:
      discount = percentOf(eligible, v.value);
      if (v.maxDiscount !== null) discount = Math.min(discount, v.maxDiscount);
      break;
    case VoucherType.FIXED:
      discount = Math.min(v.value, eligible);
      break;
    case VoucherType.FREESHIP:
      if (ctx.remainingShippingFee === 0) return fail('Đơn hàng đã được miễn phí vận chuyển');
      discount = v.value === 0 ? ctx.remainingShippingFee : Math.min(v.value, ctx.remainingShippingFee);
      break;
  }
  return { ok: true, discount, eligibleSubtotal: eligible };
}

/** Mô tả ngắn hiển thị trên thẻ voucher: "Giảm 10% tối đa 50.000₫ · Đơn từ 300.000₫" */
export function describeVoucher(v: Pick<Voucher, 'type' | 'value' | 'maxDiscount' | 'minOrderValue'>): string {
  const head =
    v.type === VoucherType.PERCENT
      ? `Giảm ${v.value}%${v.maxDiscount ? ` tối đa ${vnd(v.maxDiscount)}` : ''}`
      : v.type === VoucherType.FIXED
        ? `Giảm ${vnd(v.value)}`
        : v.value === 0
          ? 'Miễn phí vận chuyển'
          : `Giảm phí vận chuyển tối đa ${vnd(v.value)}`;
  return v.minOrderValue > 0 ? `${head} · Đơn từ ${vnd(v.minOrderValue)}` : head;
}
