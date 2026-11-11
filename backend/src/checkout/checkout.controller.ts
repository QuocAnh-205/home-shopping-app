import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckoutDto } from './checkout.dto';
import { CheckoutPreview, CheckoutService } from './checkout.service';

@ApiTags('checkout')
@ApiBearerAuth()
@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /**
   * Xem trước đơn hàng: tạm tính, phí ship, ngày giao dự kiến, voucher dùng được (kèm lý do nếu chưa),
   * phương thức thanh toán, tổng tiền. Gọi lại mỗi khi khách đổi lựa chọn. Giới hạn 30 lần/phút (chống dò mã voucher).
   */
  @Post('preview')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  preview(@Req() req: AuthenticatedRequest, @Body() dto: CheckoutDto): Promise<CheckoutPreview> {
    return this.checkout.preview(req.user.sub, dto);
  }
}
