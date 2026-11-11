/**
 * Công thức tiền của 1 đơn (hàm thuần, không I/O → test kỹ được):
 *   total = subtotal + shippingFee − discount − shippingDiscount − coinsUsed
 *   shippingDiscount = miễn phí theo ngưỡng (nếu đạt) + voucher vận chuyển (chỉ trên phần phí còn lại)
 * Mọi số đều là số nguyên VND, không âm.
 */
export interface PricingInput {
  subtotal: number;
  shippingFee: number;
  freeShipEligible: boolean;
  /** Phần phí hàng cồng kềnh trong shippingFee: miễn phí theo ngưỡng KHÔNG áp dụng cho phần này */
  bulkyFee?: number;
  /** Đã tính sẵn bởi voucher engine */
  voucherDiscount: number;
  shippingVoucherDiscount: number;
  /** Xu khách chọn dùng: tối đa maxPercent% số tiền còn phải trả, không quá số dư */
  coins?: { use: boolean; balance: number; maxPercent: number };
}

export interface PricingBreakdown {
  subtotal: number;
  shippingFee: number;
  discount: number;
  shippingDiscount: number;
  /** Xu được trừ (1 xu = 1₫) */
  coinsUsed: number;
  total: number;
  /** Tổng tiết kiệm (hiển thị "Tiết kiệm được ...") */
  saved: number;
}

/** Phí ship còn lại sau khi trừ miễn phí theo ngưỡng – voucher vận chuyển chỉ được giảm phần này */
export function remainingShipping(shippingFee: number, freeShipEligible: boolean, bulkyFee = 0): number {
  return freeShipEligible ? Math.min(shippingFee, Math.max(0, bulkyFee)) : shippingFee;
}

export function priceOrder(input: PricingInput): PricingBreakdown {
  const subtotal = Math.max(0, Math.trunc(input.subtotal));
  const shippingFee = Math.max(0, Math.trunc(input.shippingFee));
  const thresholdDiscount = input.freeShipEligible ? shippingFee - remainingShipping(shippingFee, true, input.bulkyFee ?? 0) : 0;
  const shippingDiscount = Math.min(shippingFee, thresholdDiscount + Math.max(0, input.shippingVoucherDiscount));
  const discount = Math.min(subtotal, Math.max(0, input.voucherDiscount));
  const beforeCoins = subtotal + shippingFee - discount - shippingDiscount;
  const c = input.coins;
  const coinsUsed = c?.use ? Math.max(0, Math.min(c.balance, Math.floor((beforeCoins * c.maxPercent) / 100))) : 0;
  const total = beforeCoins - coinsUsed;
  return { subtotal, shippingFee, discount, shippingDiscount, coinsUsed, total, saved: discount + shippingDiscount + coinsUsed };
}
