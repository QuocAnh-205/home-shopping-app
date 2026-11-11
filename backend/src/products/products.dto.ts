import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { toVnd } from '../common/money';

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc', 'name', 'best_selling', 'top_rated'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class ListProductsQuery {
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
  @Max(60)
  limit = 12;

  @IsOptional()
  @Matches(/^[a-z0-9-]{1,60}$/)
  category?: string;

  /** Từ khóa tìm theo tên sản phẩm (không phân biệt hoa thường) */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  q?: string;

  /** Chỉ lấy sản phẩm đang giảm giá */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  onSale?: boolean;

  /** Khoảng giá (VND, số nguyên) – dùng cho "Mua theo mức giá" */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  maxPrice?: number;

  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = 'newest';
}

export class CreateProductDto {
  @IsString()
  @Transform(trim)
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be kebab-case (a-z, 0-9, -)' })
  @MaxLength(200)
  slug: string;

  @IsString()
  @MaxLength(8000)
  description: string;

  /** VND, số nguyên (chấp nhận cả chuỗi "199000" / "199000.00" từ form cũ) */
  @Transform(toVnd)
  @IsInt({ message: 'price must be an integer amount in VND' })
  @Min(0)
  @Max(2_000_000_000)
  price: number;

  /** Giá gốc (gạch ngang) khi khuyến mãi; null để bỏ khuyến mãi. Phải lớn hơn price */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Transform(toVnd)
  @IsInt({ message: 'compareAtPrice must be an integer amount in VND' })
  @Min(1)
  @Max(2_000_000_000)
  compareAtPrice?: number | null;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock: number;

  @IsInt()
  @Min(1)
  categoryId: number;

  @IsOptional()
  @IsBoolean()
  isHot?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  highlights?: string[];

  /** Thông số kỹ thuật { "Nhãn": "Giá trị" } */
  @IsOptional()
  @IsObject()
  specs?: Record<string, string>;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class UpdateStockDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock: number;
}
