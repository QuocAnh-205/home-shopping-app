import { ConfigService } from '@nestjs/config';
import { ShippingService, vnDate } from './shipping.service';
import { chargeableWeight, zoneOf } from './table-shipping.provider';

const config = (env: Record<string, string> = {}) => ({ get: (k: string) => env[k] }) as unknown as ConfigService;
const item = (weightGrams: number, quantity = 1, dims: [number, number, number] = [10, 10, 10]) => ({
  weightGrams,
  lengthCm: dims[0],
  widthCm: dims[1],
  heightCm: dims[2],
  quantity,
});

describe('shipping fee', () => {
  // Kho mặc định: TP. Hồ Chí Minh (79, miền Nam)
  const service = new ShippingService(config());
  const HCM = { provinceCode: 79, wardCode: 26743 };
  const CAN_THO = { provinceCode: 92, wardCode: 31135 };
  const HA_NOI = { provinceCode: 1, wardCode: 4 };

  it('chargeable weight = max(actual, volumetric) rounded up to 500 g', () => {
    expect(chargeableWeight([item(300)])).toBe(500);
    expect(chargeableWeight([item(1200)])).toBe(1500);
    expect(chargeableWeight([item(700, 3)])).toBe(2500);
    // Hộp to nhẹ: 50×40×30 cm = 10 kg quy đổi
    expect(chargeableWeight([item(2000, 1, [50, 40, 30])])).toBe(10000);
  });

  it('classifies zones by province and region', () => {
    expect(zoneOf({ fromProvinceCode: 79, toProvinceCode: 79, fromRegion: 'SOUTH', toRegion: 'SOUTH' })).toBe('SAME_PROVINCE');
    expect(zoneOf({ fromProvinceCode: 79, toProvinceCode: 92, fromRegion: 'SOUTH', toRegion: 'SOUTH' })).toBe('SAME_REGION');
    expect(zoneOf({ fromProvinceCode: 79, toProvinceCode: 1, fromRegion: 'SOUTH', toRegion: 'NORTH' })).toBe('CROSS_REGION');
  });

  it.each([
    ['same province, 1 kg', HCM, [item(800)], 20_000, ['2026-11-12', '2026-11-13']],
    ['same province, 2 kg', HCM, [item(2000)], 26_000, ['2026-11-12', '2026-11-13']],
    ['same region, 1 kg', CAN_THO, [item(1000)], 30_000, ['2026-11-13', '2026-11-14']],
    ['cross region, 3 kg', HA_NOI, [item(1500, 2)], 58_000, ['2026-11-14', '2026-11-16']],
  ])('%s', async (_name, dest, items, fee, eta) => {
    const now = new Date('2026-11-11T03:00:00Z');
    const res = await service.quote(dest, items, 100_000, now);
    expect(res.fee).toBe(fee);
    expect(res.provider).toBe('TABLE');
    expect([res.estimatedDelivery.from, res.estimatedDelivery.to]).toEqual(eta);
  });

  it('bulky furniture: flat per-item fee by zone (not volumetric weight), +2–3 days, reported separately', async () => {
    const now = new Date('2026-11-11T03:00:00Z');
    // Sofa 205×90×85 cm – quy đổi thể tích ra ~260 kg, nhưng tính phí trọn gói xe tải nhỏ + lắp đặt
    const sofa = { ...item(55_000, 1, [205, 90, 85]), bulky: true };
    const fan = item(800);
    const same = await service.quote(HCM, [sofa, fan], 10_000_000, now);
    expect(same).toMatchObject({ fee: 150_000 + 20_000, bulkyFee: 150_000, chargeableWeightGrams: 1000 });
    expect([same.estimatedDelivery.from, same.estimatedDelivery.to]).toEqual(['2026-11-14', '2026-11-15']);
    const far = await service.quote(HA_NOI, [{ ...sofa, quantity: 2 }], 0, now);
    expect(far).toMatchObject({ fee: 700_000, bulkyFee: 700_000 });
  });

  it('free-ship threshold is configurable (0 disables it)', async () => {
    expect((await service.quote(HCM, [item(500)], 500_000)).freeShipEligible).toBe(true);
    expect((await service.quote(HCM, [item(500)], 499_999)).freeShipEligible).toBe(false);
    const off = new ShippingService(config({ SHIPPING_FREE_THRESHOLD: '0' }));
    expect((await off.quote(HCM, [item(500)], 10_000_000)).freeShipEligible).toBe(false);
  });

  it('falls back to the rate table when an external carrier fails', async () => {
    const s = new ShippingService(config());
    s.registerProvider({ name: 'GHN', quote: () => Promise.reject(new Error('502 Bad Gateway')) });
    const res = await s.quote(HCM, [item(800)], 100_000);
    expect(res).toMatchObject({ provider: 'TABLE', fee: 20_000 });
  });

  it('uses the external carrier quote when it answers', async () => {
    const s = new ShippingService(config());
    s.registerProvider({ name: 'GHN', quote: async () => ({ fee: 25_500, provider: 'GHN', etaDays: [1, 3], chargeableWeightGrams: 1000 }) });
    expect((await s.quote(HCM, [item(800)], 100_000)).fee).toBe(25_500);
  });

  it('computes Vietnam calendar dates (UTC+7)', () => {
    // 20:00 UTC = 03:00 sáng hôm sau ở Việt Nam
    expect(vnDate(new Date('2026-11-11T20:00:00Z'), 0)).toBe('2026-11-12');
  });
});
