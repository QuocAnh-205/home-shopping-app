import { ShipmentItem, ShipmentRequest, ShippingProvider, ShippingQuote } from './shipping.types';

type Zone = 'SAME_PROVINCE' | 'SAME_REGION' | 'CROSS_REGION';

/** Bảng phí nội bộ (tham khảo mức phí phổ biến của các hãng giao hàng nhanh): phí 1 kg đầu + mỗi 0,5 kg tiếp theo */
export const RATE_TABLE: Readonly<Record<Zone, { base: number; perHalfKg: number; eta: [number, number] }>> = {
  SAME_PROVINCE: { base: 20_000, perHalfKg: 3_000, eta: [1, 2] },
  SAME_REGION: { base: 30_000, perHalfKg: 4_000, eta: [2, 3] },
  CROSS_REGION: { base: 38_000, perHalfKg: 5_000, eta: [3, 5] },
};

/** Hệ số quy đổi khối lượng thể tích (cm³ / 6000 = kg) theo chuẩn chung của các hãng */
const VOLUMETRIC_DIVISOR = 6000;

/** Khối lượng tính cước = max(khối lượng thật, khối lượng quy đổi), làm tròn lên bội số 500 g */
export function chargeableWeight(items: ShipmentItem[]): number {
  let actual = 0;
  let volumetric = 0;
  for (const i of items) {
    actual += i.weightGrams * i.quantity;
    volumetric += Math.ceil((i.lengthCm * i.widthCm * i.heightCm * 1000) / VOLUMETRIC_DIVISOR) * i.quantity;
  }
  return Math.max(500, Math.ceil(Math.max(actual, volumetric) / 500) * 500);
}

export function zoneOf(req: Pick<ShipmentRequest, 'fromProvinceCode' | 'toProvinceCode' | 'fromRegion' | 'toRegion'>): Zone {
  if (req.fromProvinceCode === req.toProvinceCode) return 'SAME_PROVINCE';
  return req.fromRegion === req.toRegion ? 'SAME_REGION' : 'CROSS_REGION';
}

export class TableShippingProvider implements ShippingProvider {
  readonly name = 'TABLE';

  async quote(req: ShipmentRequest): Promise<ShippingQuote> {
    const rate = RATE_TABLE[zoneOf(req)];
    const weight = chargeableWeight(req.items);
    const extraHalfKgs = Math.max(0, Math.ceil((weight - 1000) / 500));
    return {
      fee: rate.base + extraHalfKgs * rate.perHalfKg,
      provider: this.name,
      etaDays: rate.eta,
      chargeableWeightGrams: weight,
    };
  }
}
