import { PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { VOUCHER_CODE_RE } from '../vouchers/vouchers.dto';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

export class CheckoutItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}

/**
 * Thông tin trang thanh toán. Chọn hàng theo 1 trong 2 cách:
 * - cartProductIds: các sản phẩm được tick trong giỏ (bỏ trống = cả giỏ)
 * - items: "Mua ngay" – mua thẳng, không qua giỏ (giỏ hàng giữ nguyên)
 * Client KHÔNG gửi giá: mọi con số đều tính lại ở server từ database.
 */
export class CheckoutDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  cartProductIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items?: CheckoutItemDto[];

  /** Bỏ trống = địa chỉ mặc định trong sổ địa chỉ */
  @IsOptional()
  @IsUUID()
  addressId?: string;

  /** Voucher giảm giá (PERCENT / FIXED) */
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Matches(VOUCHER_CODE_RE, { message: 'Mã voucher không hợp lệ' })
  voucherCode?: string;

  /** Voucher vận chuyển (FREESHIP) – dùng cùng lúc với 1 voucher giảm giá như Shopee */
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Matches(VOUCHER_CODE_RE, { message: 'Mã voucher không hợp lệ' })
  shippingVoucherCode?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  /** Dùng xu trong ví để trừ tiền */
  @IsOptional()
  @IsBoolean()
  useCoins?: boolean;

  /** Lời nhắn cho shop */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  @Matches(/^[^<>]*$/, { message: 'note must not contain HTML' })
  note?: string;
}

export class PlaceOrderDto extends CheckoutDto {
  /**
   * Tổng tiền khách đang thấy trên màn hình. Khác với tổng server tính lại (giá đổi, voucher hết lượt...)
   * → 409 PRICE_CHANGED kèm bảng giá mới, không tạo đơn.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedTotal?: number;
}
