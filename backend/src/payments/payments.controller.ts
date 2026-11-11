import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentMethod, RefundStatus, Role } from '@prisma/client';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { PaymentMethodOption } from '../checkout/checkout.service';
import { PaymentGatewayRegistry } from './gateway.registry';
import { PaymentView, PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';

export class StartPaymentDto {
  /** Bỏ trống = phương thức đang chọn của đơn; khác = đổi phương thức (COD → chuyển sang Chờ xác nhận) */
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}

export class AdminNoteDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(255)
  note?: string;
}

export class ListRefundsQuery {
  @IsOptional()
  @IsIn(Object.values(RefundStatus))
  status?: RefundStatus;
}

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly registry: PaymentGatewayRegistry,
  ) {}

  @Get('payments/methods')
  methods(): PaymentMethodOption[] {
    return this.payments.methods();
  }

  /** Thanh toán / thanh toán lại / đổi phương thức cho đơn đang Chờ thanh toán → link cổng hoặc mã VietQR */
  @Post('orders/:id/payments')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  start(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartPaymentDto): Promise<PaymentView | null> {
    return this.payments.start(req.user.sub, id, dto.method, (req as unknown as Request).ip ?? '127.0.0.1');
  }

  @Get('orders/:id/payments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  list(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<PaymentView[]> {
    return this.payments.listForOrder(req.user.sub, id);
  }

  // ---------------- IPN / webhook (server cổng gọi; không cần đăng nhập, xác thực bằng chữ ký) ----------------

  /** VNPay IPN (GET, cấu hình URL này trong cổng merchant VNPay) */
  @Get('payments/ipn/vnpay')
  @SkipThrottle()
  async vnpayIpn(@Query() query: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const ack = await this.payments.handleNotification(PaymentMethod.VNPAY, query);
    res.status(ack.status).json(ack.body);
  }

  /** MoMo IPN (POST JSON) */
  @Post('payments/ipn/momo')
  @SkipThrottle()
  async momoIpn(@Body() body: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const ack = await this.payments.handleNotification(PaymentMethod.MOMO, body);
    if (ack.body === undefined) res.status(ack.status).end();
    else res.status(ack.status).json(ack.body);
  }

  /** Cổng giả lập (chỉ khi PAYMENT_MOCK_ENABLED và chưa có khóa thật): trang /payment/mock gọi vào đây */
  @Post('payments/mock/notify')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async mockNotify(@Req() req: Request, @Res() res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const method = body.method;
    if ((method !== PaymentMethod.VNPAY && method !== PaymentMethod.MOMO) || !this.registry.mock(method)) throw new NotFoundException();
    const ack = await this.payments.handleNotification(method, body, { mock: true });
    res.status(ack.status).json(ack.body);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly audit: AuditService,
  ) {}

  /** Các lần thử thanh toán, nhật ký IPN thô và lệnh hoàn của 1 đơn */
  @Get('orders/:id/payments')
  orderPayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.adminForOrder(id);
  }

  /** Xác nhận đã nhận tiền chuyển khoản (VietQR) sau khi đối soát sao kê */
  @Post('payments/:id/confirm')
  @HttpCode(200)
  async confirm(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminNoteDto): Promise<PaymentView> {
    const p = await this.payments.confirmManually(id, req.user.sub, dto.note);
    await this.audit.log({ actorId: req.user.sub, action: 'payment.confirm', entityType: 'payment', entityId: id, summary: `Xác nhận đã nhận ${p.amount}₫ (${p.method})`, metadata: { note: dto.note } });
    return p;
  }

  @Get('refunds')
  listRefunds(@Query() q: ListRefundsQuery) {
    return this.refunds.list(q.status);
  }

  @Post('refunds/:id/retry')
  @HttpCode(200)
  async retry(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.refunds.retry(id);
    await this.audit.log({ actorId: req.user.sub, action: 'refund.retry', entityType: 'payment', entityId: id, summary: `Thử lại hoàn tiền ${r.amount}₫ → ${r.status}` });
    return r;
  }

  /** Đánh dấu đã hoàn tay (chuyển khoản lại cho khách) */
  @Post('refunds/:id/complete')
  @HttpCode(200)
  async complete(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminNoteDto) {
    const r = await this.refunds.completeManually(id, req.user.sub, dto.note);
    await this.audit.log({ actorId: req.user.sub, action: 'refund.complete', entityType: 'payment', entityId: id, summary: `Đã hoàn tay ${r.amount}₫ cho đơn #${r.orderId.slice(0, 8)}`, metadata: { note: dto.note } });
    return r;
  }
}
