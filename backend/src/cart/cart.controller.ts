import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpsertCartItemDto } from './cart.dto';
import { CartService, CartView } from './cart.service';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@Req() req: AuthenticatedRequest): Promise<CartView> {
    return this.cart.get(req.user.sub);
  }

  @Put('items')
  upsert(@Req() req: AuthenticatedRequest, @Body() dto: UpsertCartItemDto): Promise<CartView> {
    return this.cart.upsertItem(req.user.sub, dto.productId, dto.quantity);
  }

  @Delete('items/:productId')
  remove(@Req() req: AuthenticatedRequest, @Param('productId', ParseUUIDPipe) productId: string): Promise<CartView> {
    return this.cart.removeItem(req.user.sub, productId);
  }

  @Delete()
  @HttpCode(204)
  async clear(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.cart.clear(req.user.sub);
  }
}
