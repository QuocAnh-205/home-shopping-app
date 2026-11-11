import { priceOrder, remainingShipping } from './pricing';

describe('order pricing', () => {
  it('total = subtotal + shipping − discount − shipping discount', () => {
    expect(priceOrder({ subtotal: 450_000, shippingFee: 30_000, freeShipEligible: false, voucherDiscount: 45_000, shippingVoucherDiscount: 15_000 })).toEqual({
      subtotal: 450_000,
      shippingFee: 30_000,
      discount: 45_000,
      shippingDiscount: 15_000,
      total: 420_000,
      saved: 60_000,
    });
  });

  it('free-shipping threshold waives the whole fee and a shipping voucher cannot push it negative', () => {
    const p = priceOrder({ subtotal: 600_000, shippingFee: 38_000, freeShipEligible: true, voucherDiscount: 0, shippingVoucherDiscount: 38_000 });
    expect(p).toMatchObject({ shippingDiscount: 38_000, total: 600_000 });
    expect(remainingShipping(38_000, true)).toBe(0);
    expect(remainingShipping(38_000, false)).toBe(38_000);
  });

  it('discount never exceeds the subtotal and amounts stay integer VND', () => {
    const p = priceOrder({ subtotal: 100_000, shippingFee: 20_000, freeShipEligible: false, voucherDiscount: 250_000, shippingVoucherDiscount: 0 });
    expect(p).toMatchObject({ discount: 100_000, total: 20_000 });
    for (const v of Object.values(p)) expect(Number.isInteger(v)).toBe(true);
  });

  it('works with no shipping yet (no address chosen)', () => {
    expect(priceOrder({ subtotal: 199_000, shippingFee: 0, freeShipEligible: false, voucherDiscount: 0, shippingVoucherDiscount: 0 }).total).toBe(199_000);
  });
});
