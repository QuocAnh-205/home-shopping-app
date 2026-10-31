import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpsertReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  /** Văn bản thuần: React tự escape khi hiển thị; loại bỏ ký tự điều khiển và khoảng trắng thừa */
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim() : value,
  )
  @MinLength(10, { message: 'comment must be at least 10 characters' })
  @MaxLength(1000)
  comment: string;
}

export class ListReviewsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  /** Lọc theo số sao */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
