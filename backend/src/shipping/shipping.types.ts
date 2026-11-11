import { Region } from '@prisma/client';

export interface ShipmentItem {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  quantity: number;
  /** Hàng cồng kềnh (sofa, tủ, nệm…): giao bằng xe tải nhỏ + lắp đặt, tính phí riêng theo kiện */
  bulky?: boolean;
}

export interface ShipmentRequest {
  fromProvinceCode: number;
  fromRegion: Region;
  toProvinceCode: number;
  toRegion: Region;
  toWardCode: number;
  items: ShipmentItem[];
}

export interface ShippingQuote {
  /** VND */
  fee: number;
  provider: string;
  /** Số ngày giao dự kiến (min/max, tính từ lúc đặt) */
  etaDays: [number, number];
  chargeableWeightGrams: number;
  /** Phần phí của hàng cồng kềnh (đã nằm trong fee) – không được miễn phí theo ngưỡng đơn hàng */
  bulkyFee?: number;
}

/**
 * Đơn vị vận chuyển. Thêm GHN/GHTK = viết 1 class implement interface này và đăng ký trong ShippingService;
 * lỗi/timeout → ShippingService tự rơi về bảng phí nội bộ (TableShippingProvider).
 */
export interface ShippingProvider {
  readonly name: string;
  quote(req: ShipmentRequest): Promise<ShippingQuote>;
}
