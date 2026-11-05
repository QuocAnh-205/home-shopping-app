import { OrderStatus, Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);
const toBool = ({ value }: { value: unknown }) => (value === '' || value === undefined ? undefined : value === true || value === 'true' || value === '1');

class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

// ---------------- Người dùng ----------------
export const USER_SORTS = ['newest', 'oldest', 'name', 'email'] as const;

export class ListUsersQuery extends PageQuery {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @Transform(emptyToUndefined)
  /** deleted = tài khoản khách đã tự xóa (giữ lại ẩn danh để không mất lịch sử đơn) */
  @IsIn(['active', 'locked', 'deleted'])
  status?: 'active' | 'locked' | 'deleted';

  @IsOptional()
  @IsIn(USER_SORTS)
  sort: (typeof USER_SORTS)[number] = 'newest';
}

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role: Role;
}

export class LockUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  reason?: string;
}

// ---------------- Danh mục ----------------
export class CategoryDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be kebab-case (a-z, 0-9, -)' })
  @MaxLength(80)
  slug: string;
}

// ---------------- Sản phẩm ----------------
export const ADMIN_PRODUCT_SORTS = ['name', 'newest', 'price_asc', 'price_desc', 'stock_asc', 'best_selling', 'top_rated'] as const;
export type AdminProductSort = (typeof ADMIN_PRODUCT_SORTS)[number];

export class ListAdminProductsQuery extends PageQuery {
  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['active', 'hidden'])
  status?: 'active' | 'hidden';

  /** low: còn 1–10; out: hết hàng; in: còn hàng */
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['low', 'out', 'in'])
  stock?: 'low' | 'out' | 'in';

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  onSale?: boolean;

  @IsOptional()
  @IsIn(ADMIN_PRODUCT_SORTS)
  sort: AdminProductSort = 'name';
}

export class SetProductActiveDto {
  @IsBoolean()
  isActive: boolean;
}

// ---------------- Đơn hàng ----------------
export class AdminListOrdersQuery extends PageQuery {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** Ngày bắt đầu/kết thúc (YYYY-MM-DD, giờ Việt Nam, bao gồm cả 2 đầu) */
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(/^[0-9a-f-]{36}$/i)
  userId?: string;
}

// ---------------- Đánh giá ----------------
export class AdminListReviewsQuery extends PageQuery {
  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  verified?: boolean;
}

// ---------------- Bản tin & nhật ký ----------------
export class ListNewsletterQuery extends PageQuery {}

export class ListAuditQuery extends PageQuery {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['order', 'product', 'category', 'user', 'review', 'newsletter'])
  entityType?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Matches(/^[a-z]+\.[a-z_]+$/)
  action?: string;
}
