import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CoinSummary, CoinsService } from './coins.service';

export class CoinsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page = 1;
}

@ApiTags('coins')
@ApiBearerAuth()
@Controller('coins')
@UseGuards(JwtAuthGuard)
export class CoinsController {
  constructor(private readonly coins: CoinsService) {}

  /** Số dư + lịch sử giao dịch xu + quy tắc tích/dùng xu */
  @Get()
  summary(@Req() req: AuthenticatedRequest, @Query() q: CoinsQuery): Promise<CoinSummary> {
    return this.coins.summary(req.user.sub, q.page);
  }
}
