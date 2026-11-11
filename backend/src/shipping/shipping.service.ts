import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Region } from '@prisma/client';
import { LocationsService } from '../locations/locations.service';
import { ShipmentItem, ShippingProvider, ShippingQuote } from './shipping.types';
import { TableShippingProvider } from './table-shipping.provider';

export interface ShippingResult {
  /** Phí vận chuyển gốc (VND) */
  fee: number;
  provider: string;
  /** Ngày giao dự kiến (YYYY-MM-DD, giờ Việt Nam) */
  estimatedDelivery: { from: string; to: string };
  chargeableWeightGrams: number;
  /** Ngưỡng miễn phí vận chuyển (0 = tắt) và đơn này có đạt không */
  freeShipThreshold: number;
  freeShipEligible: boolean;
}

const PROVIDER_TIMEOUT_MS = 3000;

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  private readonly fallback = new TableShippingProvider();
  /** Đơn vị vận chuyển ngoài (GHN/GHTK) đăng ký ở đây; rỗng = chỉ dùng bảng phí nội bộ */
  private readonly providers: ShippingProvider[] = [];
  readonly fromProvinceCode: number;
  readonly freeShipThreshold: number;

  constructor(config: ConfigService) {
    this.fromProvinceCode = Number(config.get<string>('SHOP_PROVINCE_CODE') ?? 79);
    this.freeShipThreshold = Number(config.get<string>('SHIPPING_FREE_THRESHOLD') ?? 500_000);
  }

  registerProvider(provider: ShippingProvider): void {
    this.providers.push(provider);
  }

  async quote(dest: { provinceCode: number; wardCode: number }, items: ShipmentItem[], subtotal: number, now = new Date()): Promise<ShippingResult> {
    const req = {
      fromProvinceCode: this.fromProvinceCode,
      fromRegion: LocationsService.regionOf(this.fromProvinceCode),
      toProvinceCode: dest.provinceCode,
      toRegion: LocationsService.regionOf(dest.provinceCode) as Region,
      toWardCode: dest.wardCode,
      items,
    };

    let quote: ShippingQuote | null = null;
    for (const provider of this.providers) {
      try {
        quote = await withTimeout(provider.quote(req), PROVIDER_TIMEOUT_MS);
        break;
      } catch (err) {
        // API hãng vận chuyển lỗi/chậm → dùng bảng phí dự phòng, đơn hàng vẫn đặt được
        this.logger.warn({ event: 'shipping.provider_failed', provider: provider.name, err: (err as Error).message });
      }
    }
    quote ??= await this.fallback.quote(req);

    return {
      fee: quote.fee,
      provider: quote.provider,
      estimatedDelivery: { from: vnDate(now, quote.etaDays[0]), to: vnDate(now, quote.etaDays[1]) },
      chargeableWeightGrams: quote.chargeableWeightGrams,
      freeShipThreshold: this.freeShipThreshold,
      freeShipEligible: this.freeShipThreshold > 0 && subtotal >= this.freeShipThreshold,
    };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** now + N ngày theo lịch Việt Nam → YYYY-MM-DD */
export function vnDate(now: Date, addDays: number): string {
  return new Date(now.getTime() + 7 * 3600_000 + addDays * 86_400_000).toISOString().slice(0, 10);
}
