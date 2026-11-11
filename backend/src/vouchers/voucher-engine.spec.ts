import { VoucherType } from '@prisma/client';
import { VoucherRule, describeVoucher, evaluateVoucher } from './voucher-engine';

const now = new Date('2026-11-11T05:00:00Z');
const base: VoucherRule = {
  type: VoucherType.PERCENT,
  value: 10,
  maxDiscount: 50_000,
  minOrderValue: 200_000,
  startsAt: new Date('2026-11-01T00:00:00Z'),
  endsAt: new Date('2026-12-01T00:00:00Z'),
  usageLimit: 100,
  usedCount: 0,
  perUserLimit: 1,
  categoryIds: [],
  productIds: [],
  isActive: true,
};
const P1 = 'b8f3f5a2-55a1-4b8e-8f3e-0c1f2a3b4c5d';
const P2 = '0f8fad5b-d9cb-469f-a165-70867728950e';
const lines = [
  { productId: P1, categoryId: 1, lineTotal: 300_000 },
  { productId: P2, categoryId: 2, lineTotal: 150_000 },
];
const ctx = { now, lines, remainingShippingFee: 30_000, usedByUser: 0 };

describe('voucher engine', () => {
  it('percent discount is capped by maxDiscount', () => {
    expect(evaluateVoucher(base, ctx)).toEqual({ ok: true, discount: 45_000, eligibleSubtotal: 450_000 });
    expect(evaluateVoucher({ ...base, value: 20 }, ctx)).toMatchObject({ ok: true, discount: 50_000 });
  });

  it('percent discount rounds down to whole VND', () => {
    const odd = [{ productId: P1, categoryId: 1, lineTotal: 333_333 }];
    expect(evaluateVoucher({ ...base, maxDiscount: null }, { ...ctx, lines: odd })).toMatchObject({ discount: 33_333 });
  });

  it('fixed discount never exceeds the eligible amount', () => {
    expect(evaluateVoucher({ ...base, type: 'FIXED', value: 30_000 }, ctx)).toMatchObject({ ok: true, discount: 30_000 });
    expect(evaluateVoucher({ ...base, type: 'FIXED', value: 999_000, minOrderValue: 0 }, ctx)).toMatchObject({ discount: 450_000 });
  });

  it('category/product scope only counts matching lines (also for the minimum order)', () => {
    const scoped = { ...base, categoryIds: [2], minOrderValue: 100_000 };
    expect(evaluateVoucher(scoped, ctx)).toEqual({ ok: true, discount: 15_000, eligibleSubtotal: 150_000 });
    expect(evaluateVoucher({ ...base, productIds: [P2] }, ctx)).toMatchObject({ ok: false, reason: 'Mua thêm 50.000₫ để dùng voucher này' });
    expect(evaluateVoucher({ ...base, categoryIds: [9] }, ctx)).toMatchObject({ ok: false, reason: 'Voucher không áp dụng cho sản phẩm đã chọn' });
  });

  it('free-shipping voucher reduces only the remaining shipping fee', () => {
    const ship = { ...base, type: VoucherType.FREESHIP, value: 0, maxDiscount: null, minOrderValue: 0 };
    expect(evaluateVoucher(ship, ctx)).toMatchObject({ ok: true, discount: 30_000 });
    expect(evaluateVoucher({ ...ship, value: 15_000 }, ctx)).toMatchObject({ ok: true, discount: 15_000 });
    expect(evaluateVoucher(ship, { ...ctx, remainingShippingFee: 0 })).toMatchObject({ ok: false, reason: 'Đơn hàng đã được miễn phí vận chuyển' });
  });

  it.each([
    [{ isActive: false }, 'Voucher đã ngừng áp dụng'],
    [{ startsAt: new Date('2026-11-20T00:00:00Z') }, 'Voucher có hiệu lực từ 20/11/2026'],
    [{ endsAt: now }, 'Voucher đã hết hạn'],
    [{ usageLimit: 5, usedCount: 5 }, 'Voucher đã hết lượt sử dụng'],
  ])('rejects %o with reason', (patch, reason) => {
    expect(evaluateVoucher({ ...base, ...patch }, ctx)).toMatchObject({ ok: false, reason, discount: 0 });
  });

  it('enforces the per-user limit', () => {
    expect(evaluateVoucher(base, { ...ctx, usedByUser: 1 })).toMatchObject({ ok: false, reason: 'Bạn đã dùng hết lượt của voucher này' });
    expect(evaluateVoucher({ ...base, perUserLimit: 3 }, { ...ctx, usedByUser: 2 })).toMatchObject({ ok: true });
  });

  it('describes vouchers for the voucher card', () => {
    expect(describeVoucher(base)).toBe('Giảm 10% tối đa 50.000₫ · Đơn từ 200.000₫');
    expect(describeVoucher({ type: 'FIXED', value: 30_000, maxDiscount: null, minOrderValue: 0 })).toBe('Giảm 30.000₫');
    expect(describeVoucher({ type: 'FREESHIP', value: 0, maxDiscount: null, minOrderValue: 0 })).toBe('Miễn phí vận chuyển');
  });
});
