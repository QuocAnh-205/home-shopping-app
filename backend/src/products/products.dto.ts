import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
import { MATERIAL_OPTIONS } from './product-attributes';
import { toVnd } from '../common/money';

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc', 'name', 'best_selling', 'top_rated'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

/** Khoảng công suất (W) / dung tích (ml): [gte, lt) – null = không giới hạn */
export const POWER_BUCKETS = { lt500: [null, 500], '500to1500': [500, 1500], gt1500: [1500, null] } as const;
export type PowerBucket = keyof typeof POWER_BUCKETS;
export const CAPACITY_BUCKETS = { lt2: [null, 2000], '2to5': [2000, 5000], gt5: [5000, null] } as const;
export type CapacityBucket = keyof typeof CAPACITY_BUCKETS;

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

  // ---------- Bộ lọc kỹ thuật (đồ gia dụng / nội thất) ----------
  /** Nhóm chất liệu: Inox, Gang, Gỗ, Nhung… (MATERIAL_OPTIONS) */
  @IsOptional()
  @IsIn(MATERIAL_OPTIONS)
  material?: string;

  /** Công suất (W): lt500 | 500to1500 | gt1500 */
  @IsOptional()
  @IsIn(Object.keys(POWER_BUCKETS))
  power?: PowerBucket;

  /** Dung tích (lít): lt2 | 2to5 | gt5 */
  @IsOptional()
  @IsIn(Object.keys(CAPACITY_BUCKETS))
  capacity?: CapacityBucket;

  /** Chiều dài tối đa (cm) – khách "ướm" sofa / bàn ăn vào khoảng trống trong nhà */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(500)
  maxLength?: number;

  /** Chỉ hàng cồng kềnh (giao + lắp đặt tận nơi) */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  bulky?: boolean;
}

/** So sánh sản phẩm: "a,b,c" → ['a','b','c'] (2–4 slug, không trùng) */
export class CompareProductsQuery {
  @Transform(({ value }) => (typeof value === 'string' ? [...new Set(value.split(',').map((v) => v.trim()).filter(Boolean))] : value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @Matches(/^[a-z0-9-]{1,200}$/, { each: true })
  slugs: string[];
}

export class ProductFacetsQuery {
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,60}$/)
  category?: string;
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

  /** Cân nặng đóng gói (gram) & kích thước (cm): dùng tính phí vận chuyển */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  lengthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  widthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  heightCm?: number;

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

  /** Biến thể: cùng mã nhóm → hiện chung bộ chọn; null để tách khỏi nhóm */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'variantGroup must be kebab-case' })
  @MaxLength(60)
  variantGroup?: string | null;

  /** Tên thuộc tính khách chọn, vd "Màu sắc", "Dung tích" */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Transform(trim)
  @MaxLength(40)
  variantName?: string | null;

  /** Nhãn của SKU này trong bộ chọn, vd "Xanh rêu", "4 lít" */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Transform(trim)
  @MaxLength(60)
  variantLabel?: string | null;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class UpdateStockDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock: number;
}
