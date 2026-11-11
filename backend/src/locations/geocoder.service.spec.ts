import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GeocoderService, normalizeName } from './geocoder.service';

// Trích từ danh mục hành chính mới (prisma/data/vn-admin-units.json)
const provinces = [
  { code: 1, name: 'Thành phố Hà Nội' },
  { code: 48, name: 'Thành phố Đà Nẵng' },
  { code: 79, name: 'Thành phố Hồ Chí Minh' },
];
const wards: Record<number, { code: number; name: string }[]> = {
  1: [{ code: 70, name: 'Phường Hoàn Kiếm' }],
  48: [{ code: 20257, name: 'Phường Hòa Cường' }],
  79: [
    { code: 26743, name: 'Phường Bến Thành' },
    { code: 25747, name: 'Phường Thủ Dầu Một' },
  ],
};
const prisma = {
  province: { findMany: jest.fn(async () => provinces) },
  ward: { findMany: jest.fn(async ({ where }: { where: { provinceCode: number } }) => wards[where.provinceCode] ?? []) },
};
const redis = { getJson: jest.fn(async () => null), setJson: jest.fn() };
const config = { get: () => undefined } as unknown as ConfigService;
const photon = (properties: Record<string, string>) =>
  jest.fn(async () => ({ ok: true, json: async () => ({ features: [{ properties: { countrycode: 'VN', ...properties } }] }) })) as unknown as typeof fetch;
const make = (http: typeof fetch) => new GeocoderService(prisma as unknown as PrismaService, redis as unknown as RedisService, config, http);

describe('GeocoderService', () => {
  it('normalizes Vietnamese administrative names', () => {
    expect(normalizeName('Thành phố Hồ Chí Minh')).toBe('ho chi minh');
    expect(normalizeName('Phường Bến Thành')).toBe('ben thanh');
    expect(normalizeName('Đặc khu Phú Quốc')).toBe('phu quoc');
    expect(normalizeName('Xã Đắk Mil')).toBe('dak mil');
  });

  it.each([
    // Dữ liệu thật Photon trả về (11/2026) cho các tọa độ này
    [{ street: 'Công trường Quách Thị Trang', district: 'Bến Thành', locality: 'Khu phố 1', city: 'Thành phố Hồ Chí Minh' }, 79, 26743],
    [{ street: 'Phố Trần Nguyên Hãn', district: 'Hoàn Kiếm', city: 'Hà Nội' }, 1, 70],
    // Bình Dương cũ đã nhập vào TP.HCM: vẫn khớp đúng phường mới
    [{ district: 'Thủ Dầu Một', locality: 'Phú Cường 6', city: 'Thành phố Hồ Chí Minh' }, 79, 25747],
    [{ street: 'Đường Lối vào Ga Đến', district: 'Hòa Cường', city: 'Đà Nẵng' }, 48, 20257],
  ])('maps %o to province %s / ward %s', async (props, provinceCode, wardCode) => {
    const res = await make(photon(props as Record<string, string>)).reverse(10.77, 106.69);
    expect(res).toMatchObject({ provinceCode, wardCode });
  });

  it('keeps the province when the ward cannot be matched (customer picks the ward)', async () => {
    const res = await make(photon({ district: 'Phường không tồn tại', city: 'Thành phố Hồ Chí Minh', housenumber: '25', street: 'Nguyễn Huệ' })).reverse(10.77, 106.7);
    expect(res).toMatchObject({ provinceCode: 79, wardCode: null, street: '25 Nguyễn Huệ' });
  });

  it('rejects coordinates outside Vietnam without calling the provider', async () => {
    const http = photon({});
    await expect(make(http).reverse(1.35, 103.8)).rejects.toMatchObject({ code: 'ADDRESS_INVALID' });
    expect(http).not.toHaveBeenCalled();
  });

  it('reports a friendly 503 when the provider is down', async () => {
    const down = jest.fn(async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
    await expect(make(down).reverse(21.03, 105.85)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
