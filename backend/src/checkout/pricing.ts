/**
 * Công thức tiền của 1 đơn (hàm thuần, không I/O → test kỹ được):
 *   total = subtotal + shippingFee − discount − shippingDiscount
 *   shippingDiscount = miễn phí theo ngưỡng (nếu đạt) + voucher vận chuyển (chỉ trên phần phí còn lại)
 * Mọi số đều là số nguyên VND, không âm.
 */
export interface PricingInput {
  subtotal: number;
  shippingFee: number;
  freeShipEligible: boolean;
  /** Đã tính sẵn bởi voucher engine */
  voucherDiscount: number;
  shippingVoucherDiscount: number;
}

export interface PricingBreakdown {
  subtotal: number;
  shippingFee: number;
  discount: number;
  shippingDiscount: number;
  total: number;
  /** Tổng tiết kiệm (hiển thị "Tiết kiệm được ...") */
  saved: number;
}

/** Phí ship còn lại sau khi trừ miễn phí theo ngưỡng – voucher vận chuyển chỉ được giảm phần này */
export function remainingShipping(shippingFee: number, freeShipEligible: boolean): number {
  return freeShipEligible ? 0 : shippingFee;
}

export function priceOrder(input: PricingInput): PricingBreakdown {
  const subtotal = Math.max(0, Math.trunc(input.subtotal));
  const shippingFee = Math.max(0, Math.trunc(input.shippingFee));
  const thresholdDiscount = input.freeShipEligible ? shippingFee : 0;
  const shippingDiscount = Math.min(shippingFee, thresholdDiscount + Math.max(0, input.shippingVoucherDiscount));
  const discount = Math.min(subtotal, Math.max(0, input.voucherDiscount));
  const total = subtotal + shippingFee - discount - shippingDiscount;
  return { subtotal, shippingFee, discount, shippingDiscount, total, saved: discount + shippingDiscount };
}
