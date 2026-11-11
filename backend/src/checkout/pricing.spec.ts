import { priceOrder, remainingShipping } from './pricing';

describe('order pricing', () => {
  it('total = subtotal + shipping − discount − shipping discount', () => {
    expect(priceOrder({ subtotal: 450_000, shippingFee: 30_000, freeShipEligible: false, voucherDiscount: 45_000, shippingVoucherDiscount: 15_000 })).toEqual({
      subtotal: 450_000,
      shippingFee: 30_000,
      discount: 45_000,
      shippingDiscount: 15_000,
      coinsUsed: 0,
      total: 420_000,
      saved: 60_000,
    });
  });

  it('coins cover at most the configured share of the amount and never more than the balance', () => {
    const base = { subtotal: 450_000, shippingFee: 30_000, freeShipEligible: false, voucherDiscount: 45_000, shippingVoucherDiscount: 15_000 };
    // Còn phải trả 420.000 → tối đa 50% = 210.000 xu
    expect(priceOrder({ ...base, coins: { use: true, balance: 1_000_000, maxPercent: 50 } })).toMatchObject({ coinsUsed: 210_000, total: 210_000, saved: 270_000 });
    expect(priceOrder({ ...base, coins: { use: true, balance: 12_345, maxPercent: 50 } })).toMatchObject({ coinsUsed: 12_345, total: 407_655 });
    expect(priceOrder({ ...base, coins: { use: false, balance: 12_345, maxPercent: 50 } })).toMatchObject({ coinsUsed: 0, total: 420_000 });
  });

  it('free-shipping threshold waives the whole fee and a shipping voucher cannot push it negative', () => {
    const p = priceOrder({ subtotal: 600_000, shippingFee: 38_000, freeShipEligible: true, voucherDiscount: 0, shippingVoucherDiscount: 38_000 });
    expect(p).toMatchObject({ shippingDiscount: 38_000, total: 600_000 });
    expect(remainingShipping(38_000, true)).toBe(0);
    expect(remainingShipping(38_000, false)).toBe(38_000);
  });

  it('free shipping (order ≥ threshold) never waives the bulky-item surcharge', () => {
    const p = priceOrder({ subtotal: 9_890_000, shippingFee: 170_000, bulkyFee: 150_000, freeShipEligible: true, voucherDiscount: 0, shippingVoucherDiscount: 0 });
    expect(p).toMatchObject({ shippingFee: 170_000, shippingDiscount: 20_000, total: 9_890_000 + 150_000 });
    expect(remainingShipping(170_000, true, 150_000)).toBe(150_000);
    expect(remainingShipping(170_000, false, 150_000)).toBe(170_000);
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
