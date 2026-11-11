import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface ReverseResult {
  lat: number;
  lng: number;
  provinceCode: number | null;
  provinceName: string | null;
  wardCode: number | null;
  wardName: string | null;
  /** Số nhà + tên đường (gợi ý điền ô "Địa chỉ cụ thể") */
  street: string | null;
  /** Địa chỉ đầy đủ đọc được từ bản đồ (để khách đối chiếu) */
  display: string;
}

interface PhotonProps {
  name?: string;
  housenumber?: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
}

/** Lãnh thổ Việt Nam (hộp bao, gồm Hoàng Sa / Trường Sa) – chặn tọa độ ngoài nước sớm */
export const VN_BOUNDS = { minLat: 7, maxLat: 24, minLng: 101, maxLng: 118 };

/**
 * Chuẩn hóa tên đơn vị hành chính để so khớp: bỏ dấu, chữ thường, bỏ tiền tố cấp hành chính.
 * "Thành phố Hồ Chí Minh" → "ho chi minh"; "Phường Bến Thành" → "ben thanh"; "Đặc khu Phú Quốc" → "phu quoc"
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/^(thanh pho|tinh|phuong|xa|dac khu|thi tran|thi xa|quan|huyen|tp\.?)\s+/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Đổi tọa độ GPS → tỉnh/xã theo đơn vị hành chính 2 cấp (34 tỉnh, 3.321 xã từ 01/07/2025).
 * Dùng Photon (geocoder dữ liệu OpenStreetMap, đã cập nhật địa giới mới); gọi từ server để: cache Redis, giới hạn tần suất,
 * không lộ IP khách cho bên thứ ba, đổi nhà cung cấp mà không sửa frontend (GEOCODER_URL).
 * Kết quả chỉ là GỢI Ý: khách luôn kiểm tra/chọn lại được tỉnh/xã trước khi lưu.
 */
@Injectable()
export class GeocoderService {
  private readonly logger = new Logger(GeocoderService.name);
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    config: ConfigService,
    private readonly http: typeof fetch = fetch,
  ) {
    this.baseUrl = (config.get<string>('GEOCODER_URL') || 'https://photon.komoot.io').replace(/\/+$/, '');
    this.userAgent = `HomeShopping/1.0 (+${config.get<string>('APP_URL') || 'http://localhost'})`;
  }

  async reverse(lat: number, lng: number): Promise<ReverseResult> {
    if (lat < VN_BOUNDS.minLat || lat > VN_BOUNDS.maxLat || lng < VN_BOUNDS.minLng || lng > VN_BOUNDS.maxLng) {
      throw new AppError(ErrorCode.ADDRESS_INVALID, 'Vị trí nằm ngoài Việt Nam, vui lòng chọn lại trên bản đồ', HttpStatus.BAD_REQUEST);
    }
    // Làm tròn ~11 m: cache theo ô lưới, đủ chính xác để xác định phường/xã
    const key = `cache:geo:rev:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    const hit = await this.redis.getJson<ReverseResult>(key);
    if (hit) return hit;

    let props: PhotonProps | undefined;
    try {
      const res = await this.http(`${this.baseUrl}/reverse?lat=${lat}&lon=${lng}&limit=1`, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { features?: { properties?: PhotonProps }[] };
      props = json.features?.[0]?.properties;
    } catch (err) {
      this.logger.warn({ event: 'geocoder.failed', provider: this.baseUrl, err: (err as Error).message });
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Chưa đọc được địa chỉ từ bản đồ, vui lòng chọn tỉnh/xã thủ công', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!props || (props.countrycode && props.countrycode.toUpperCase() !== 'VN')) {
      throw new AppError(ErrorCode.ADDRESS_INVALID, 'Không tìm thấy địa chỉ tại vị trí này, vui lòng chọn lại', HttpStatus.BAD_REQUEST);
    }

    const result = await this.match(lat, lng, props);
    await this.redis.setJson(key, result, 86_400);
    return result;
  }

  /** So khớp tên Photon với danh mục hành chính trong DB (không tin tên gửi từ bên ngoài) */
  async match(lat: number, lng: number, p: PhotonProps): Promise<ReverseResult> {
    const provinces = await this.prisma.province.findMany({ select: { code: true, name: true } });
    const provinceCandidates = [p.state, p.city, p.county].filter((x): x is string => Boolean(x)).map(normalizeName);
    const province = provinces.find((pr) => provinceCandidates.includes(normalizeName(pr.name))) ?? null;

    let ward: { code: number; name: string } | null = null;
    if (province) {
      const wards = await this.prisma.ward.findMany({ where: { provinceCode: province.code }, select: { code: true, name: true } });
      const byName = new Map(wards.map((w) => [normalizeName(w.name), w]));
      for (const c of [p.district, p.locality, p.city, p.name]) {
        const w = c ? byName.get(normalizeName(c)) : undefined;
        if (w) {
          ward = w;
          break;
        }
      }
    }

    const street = [p.housenumber, p.street].filter(Boolean).join(' ') || null;
    const display = [street, p.locality, p.district, p.city ?? p.state].filter(Boolean).join(', ');
    return {
      lat,
      lng,
      provinceCode: province?.code ?? null,
      provinceName: province?.name ?? null,
      wardCode: ward?.code ?? null,
      wardName: ward?.name ?? null,
      street,
      display,
    };
  }
}
