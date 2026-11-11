import { HttpStatus, Injectable } from '@nestjs/common';
import { Region } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface ProvinceView {
  code: number;
  name: string;
  region: Region;
}

export interface WardView {
  code: number;
  name: string;
}

export interface ResolvedLocation {
  province: ProvinceView;
  ward: WardView;
}

// Danh mục hành chính hầu như không đổi → cache dài (6 giờ)
const TTL = 6 * 3600;

/** Đơn vị hành chính 2 cấp (tỉnh → xã/phường) theo Nghị quyết sắp xếp, hiệu lực 01/07/2025 */
@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async provinces(): Promise<ProvinceView[]> {
    const key = 'cache:locations:provinces';
    const hit = await this.redis.getJson<ProvinceView[]>(key);
    if (hit) return hit;
    const rows = await this.prisma.province.findMany({ orderBy: { name: 'asc' } });
    // Sắp theo tên tiếng Việt (bỏ tiền tố "Thành phố"/"Tỉnh")
    const sorted = rows.sort((a, b) => LocationsService.sortName(a.name).localeCompare(LocationsService.sortName(b.name), 'vi'));
    await this.redis.setJson(key, sorted, TTL);
    return sorted;
  }

  async wards(provinceCode: number): Promise<WardView[]> {
    const key = `cache:locations:wards:${provinceCode}`;
    const hit = await this.redis.getJson<WardView[]>(key);
    if (hit) return hit;
    const exists = await this.prisma.province.findUnique({ where: { code: provinceCode }, select: { code: true } });
    if (!exists) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tỉnh/thành phố', HttpStatus.NOT_FOUND);
    const rows = await this.prisma.ward.findMany({ where: { provinceCode }, select: { code: true, name: true } });
    const sorted = rows.sort((a, b) => LocationsService.sortName(a.name).localeCompare(LocationsService.sortName(b.name), 'vi'));
    await this.redis.setJson(key, sorted, TTL);
    return sorted;
  }

  /** Kiểm tra xã thuộc đúng tỉnh và trả về tên chuẩn (không tin tên do client gửi) */
  async resolve(provinceCode: number, wardCode: number): Promise<ResolvedLocation> {
    const ward = await this.prisma.ward.findUnique({
      where: { code: wardCode },
      select: { code: true, name: true, province: { select: { code: true, name: true, region: true } } },
    });
    if (!ward || ward.province.code !== provinceCode) {
      throw new AppError(ErrorCode.ADDRESS_INVALID, 'Phường/xã không thuộc tỉnh/thành phố đã chọn', HttpStatus.BAD_REQUEST);
    }
    return { province: ward.province, ward: { code: ward.code, name: ward.name } };
  }

  static sortName(name: string): string {
    return name.replace(/^(Thành phố|Tỉnh|Phường|Xã|Đặc khu)\s+/i, '');
  }

  /** Vùng theo mã tỉnh (mã tăng dần từ Bắc vào Nam) – dùng cho seed */
  static regionOf(provinceCode: number): Region {
    if (provinceCode <= 37) return Region.NORTH;
    if (provinceCode <= 68) return Region.CENTRAL;
    return Region.SOUTH;
  }
}
