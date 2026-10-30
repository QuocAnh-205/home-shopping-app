import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc', 'name'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const PRICE_RE = /^\d{1,10}(\.\d{1,2})?$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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
  @Max(50)
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
  @MaxLength(5000)
  description: string;

  @Matches(PRICE_RE, { message: 'price must be a positive decimal with at most 2 fraction digits' })
  price: string;

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
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class UpdateStockDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock: number;
}
