import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrderDto } from './orders.dto';
import { OrderWithItems, OrdersService } from './orders.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // Lớp chống spam thứ 2 (sau limit_req của Nginx): tối đa 5 đơn/phút/IP
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID duy nhất cho mỗi lần đặt hàng' })
  create(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderWithItems> {
    if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key header (UUID) is required');
    }
    return this.orders.create(req.user.sub, idempotencyKey.toLowerCase(), dto);
  }

  @Get()
  listMine(@Req() req: AuthenticatedRequest): Promise<OrderWithItems[]> {
    return this.orders.listMine(req.user.sub);
  }

  @Get(':id')
  getMine(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<OrderWithItems> {
    return this.orders.getMine(req.user.sub, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<OrderWithItems> {
    return this.orders.cancelMine(req.user.sub, id);
  }
}
