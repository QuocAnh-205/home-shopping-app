import { OrderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateOrderDto {
  @IsString()
  @Transform(trim)
  @MinLength(10)
  @MaxLength(500)
  @Matches(/^[^<>]*$/, { message: 'shippingAddress must not contain HTML' })
  shippingAddress: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s.-]/g, '') : value))
  @Matches(/^(\+84|0)[0-9]{9,10}$/, { message: 'phone must be a valid Vietnamese phone number' })
  phone: string;
}

export class ListOrdersQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  /** Ghi chú hiển thị trên timeline đơn (vd. lý do hủy, mã vận đơn) */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(255)
  @Matches(/^[^<>]*$/)
  note?: string;
}

export const ORDER_TAB_KEYS = ['awaiting_payment', 'to_ship', 'shipping', 'completed', 'cancelled', 'return'] as const;

export class MyOrdersQuery {
  @IsOptional()
  @IsIn(ORDER_TAB_KEYS)
  tab?: (typeof ORDER_TAB_KEYS)[number];

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

export class CancelOrderDto {
  /** Lý do hủy (frontend đưa danh sách lý do có sẵn như Shopee) */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(3)
  @MaxLength(255)
  @Matches(/^[^<>]*$/, { message: 'reason must not contain HTML' })
  reason?: string;
}
