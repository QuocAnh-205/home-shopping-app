import { PartialType } from '@nestjs/swagger';
import { VoucherType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const VOUCHER_CODE_RE = /^[A-Z0-9]{4,32}$/;

export class SaveVoucherDto {
  @IsString()
  @Transform(upper)
  @Matches(VOUCHER_CODE_RE, { message: 'Mã voucher gồm 4–32 chữ in hoa hoặc số' })
  code: string;
}

export class CreateVoucherDto {
  @IsString()
  @Transform(upper)
  @Matches(VOUCHER_CODE_RE, { message: 'Mã voucher gồm 4–32 chữ in hoa hoặc số' })
  code: string;

  @IsString()
  @Transform(trim)
  @MinLength(3)
  @MaxLength(120)
  @Matches(/^[^<>]*$/)
  name: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(500)
  @Matches(/^[^<>]*$/)
  description?: string;

  @IsEnum(VoucherType)
  type: VoucherType;

  /** PERCENT: 1..100 · FIXED: VND · FREESHIP: VND tối đa (0 = miễn toàn bộ phí ship) */
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  value: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  maxDiscount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderValue?: number;

  @Type(() => Date)
  @IsDate()
  startsAt: Date;

  @Type(() => Date)
  @IsDate()
  endsAt: Date;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  perUserLimit?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  categoryIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateVoucherDto extends PartialType(CreateVoucherDto) {}
