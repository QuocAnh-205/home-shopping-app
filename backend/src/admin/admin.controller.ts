import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ListOrdersQuery, UpdateOrderStatusDto } from '../orders/orders.dto';
import { AdminOrder, OrderPage, OrdersService } from '../orders/orders.service';
import { AdminService, DashboardStats } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly orders: OrdersService,
  ) {}

  @Get('stats')
  stats(): Promise<DashboardStats> {
    return this.admin.stats();
  }

  @Get('orders')
  listOrders(@Query() query: ListOrdersQuery): Promise<OrderPage> {
    return this.orders.listAll(query);
  }

  @Patch('orders/:id/status')
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<AdminOrder> {
    return this.orders.updateStatus(id, dto.status, req.user.sub);
  }
}
