import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AppError, ErrorCode } from '../common/errors';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlaceOrderDto } from '../checkout/checkout.dto';
import { CancelOrderDto, MyOrdersQuery } from './orders.dto';
import { StorageService } from '../storage/storage.service';
import { BuyAgainResult, OrderWithItems, OrdersService } from './orders.service';

/** Đơn trả cho khách: mỗi dòng hàng kèm URL ảnh hiển thị được (ảnh tĩnh / media local / presigned S3) */
export type PresentedOrder = OrderWithItems & { items: (OrderWithItems['items'][number] & { imageUrl: string | null })[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly storage: StorageService,
  ) {}

  private async present(order: OrderWithItems): Promise<PresentedOrder> {
    const items = await Promise.all(
      order.items.map(async (i) => ({ ...i, imageUrl: await this.storage.getSignedImageUrl(i.imageKey ?? i.product.imageKey) })),
    );
    return { ...order, items };
  }

  // Lớp chống spam thứ 2 (sau limit_req của Nginx): tối đa 5 đơn/phút/IP
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID duy nhất cho mỗi lần đặt hàng' })
  async create(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: PlaceOrderDto,
  ): Promise<PresentedOrder> {
    if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
      throw new AppError(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Thiếu header Idempotency-Key (UUID) cho mỗi lần đặt hàng');
    }
    return this.present(await this.orders.create(req.user.sub, idempotencyKey.toLowerCase(), dto));
  }

  /** ?tab=awaiting_payment|to_ship|shipping|completed|cancelled|return (tab "Đơn mua" kiểu Shopee) */
  @Get()
  async listMine(@Req() req: AuthenticatedRequest, @Query() query: MyOrdersQuery): Promise<PresentedOrder[]> {
    return Promise.all((await this.orders.listMine(req.user.sub, query)).map((o) => this.present(o)));
  }

  @Get(':id')
  async getMine(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<PresentedOrder> {
    return this.present(await this.orders.getMine(req.user.sub, id));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto): Promise<PresentedOrder> {
    return this.present(await this.orders.cancelMine(req.user.sub, id, dto.reason));
  }

  /** Nút "Đã nhận hàng" */
  @Post(':id/received')
  @HttpCode(200)
  async received(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<PresentedOrder> {
    return this.present(await this.orders.confirmReceived(req.user.sub, id));
  }

  /** Nút "Mua lại": thêm sản phẩm của đơn vào giỏ */
  @Post(':id/buy-again')
  @HttpCode(200)
  buyAgain(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<BuyAgainResult> {
    return this.orders.buyAgain(req.user.sub, id);
  }
}
