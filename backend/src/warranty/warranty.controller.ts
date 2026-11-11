import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { WarrantyLookupDto } from './warranty.dto';
import { WarrantyLookup, WarrantyService } from './warranty.service';

@ApiTags('warranty')
@Controller('warranty')
export class WarrantyController {
  constructor(private readonly warranty: WarrantyService) {}

  /** Công khai (không cần đăng nhập) nhưng giới hạn 10 lần/phút/IP để không dò được mã đơn */
  @Post('lookup')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  lookup(@Body() dto: WarrantyLookupDto): Promise<WarrantyLookup> {
    return this.warranty.lookup(dto.orderCode, dto.phone);
  }
}
