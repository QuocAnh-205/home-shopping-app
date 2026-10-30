import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class UpsertCartItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}
