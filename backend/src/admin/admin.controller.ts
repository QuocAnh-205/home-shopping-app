import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UpdateOrderStatusDto } from '../orders/orders.dto';
import { AdminOrder, OrdersService } from '../orders/orders.service';
import { ProductView, ProductsService } from '../products/products.service';
import { ReviewsService } from '../reviews/reviews.service';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminUsersService, toCsv } from './admin-users.service';
import {
  AdminListOrdersQuery,
  AdminListReviewsQuery,
  CategoryDto,
  ListAdminProductsQuery,
  ListAuditQuery,
  ListNewsletterQuery,
  ListUsersQuery,
  LockUserDto,
  SetProductActiveDto,
  UpdateUserRoleDto,
} from './admin.dto';
import { STATUS_LABEL_VI } from '../orders/order-state';
import { AdminService, DashboardStats } from './admin.service';

const STATUS_VI: Record<string, string> = STATUS_LABEL_VI;
const csvName = (prefix: string) => `attachment; filename="${prefix}-${new Date().toISOString().slice(0, 10)}.csv"`;

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly orders: OrdersService,
    private readonly reviews: ReviewsService,
    private readonly products: ProductsService,
    private readonly users: AdminUsersService,
    private readonly catalog: AdminCatalogService,
    private readonly audit: AuditService,
  ) {}

  // ---------------- Tổng quan ----------------
  @Get('stats')
  stats(): Promise<DashboardStats> {
    return this.admin.stats();
  }

  // ---------------- Đơn hàng ----------------
  @Get('orders')
  listOrders(@Query() query: AdminListOrdersQuery) {
    return this.orders.listAll(query);
  }

  @Get('orders/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async exportOrders(@Res({ passthrough: true }) res: Response, @Query() query: AdminListOrdersQuery): Promise<string> {
    res.setHeader('Content-Disposition', csvName('don-hang'));
    const rows = await this.orders.adminExport(query);
    return toCsv([
      ['Mã đơn', 'Ngày đặt', 'Khách hàng', 'Email', 'SĐT nhận', 'Địa chỉ giao', 'Trạng thái', 'Số sản phẩm', 'Chi tiết', 'Tổng tiền (VND)'],
      ...rows.map((o) => [
        o.id,
        o.createdAt.toISOString(),
        o.user.fullName,
        o.user.email,
        o.phone,
        o.shippingAddress,
        STATUS_VI[o.status] ?? o.status,
        o.items.reduce((n, i) => n + i.quantity, 0),
        o.items.map((i) => `${i.product.name} x${i.quantity}`).join('; '),
        String(o.totalAmount),
      ]),
    ]);
  }

  @Get('orders/:id')
  orderDetail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminOrder> {
    return this.orders.adminDetail(id);
  }

  @Patch('orders/:id/status')
  async updateStatus(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderStatusDto): Promise<AdminOrder> {
    const before = await this.orders.adminDetail(id);
    const order = await this.orders.updateStatus(id, dto.status, req.user.sub, dto.note);
    await this.audit.log({
      actorId: req.user.sub,
      action: 'order.status',
      entityType: 'order',
      entityId: id,
      summary: `Đơn #${id.slice(0, 8)} (${order.user.email}): ${STATUS_VI[before.status]} → ${STATUS_VI[order.status]}`,
      metadata: { from: before.status, to: order.status, total: order.totalAmount, note: dto.note },
    });
    return order;
  }

  // ---------------- Sản phẩm ----------------
  @Get('products')
  listProducts(@Query() query: ListAdminProductsQuery) {
    return this.products.adminList(query);
  }

  @Get('products/:id')
  productDetail(@Param('id', ParseUUIDPipe) id: string): Promise<ProductView> {
    return this.products.adminById(id);
  }

  @Patch('products/:id/active')
  async setProductActive(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetProductActiveDto): Promise<ProductView> {
    const product = await this.products.setActive(id, dto.isActive);
    await this.audit.log({
      actorId: req.user.sub,
      action: dto.isActive ? 'product.show' : 'product.hide',
      entityType: 'product',
      entityId: id,
      summary: `${dto.isActive ? 'Hiện' : 'Ẩn'} sản phẩm "${product.name}"`,
    });
    return product;
  }

  @Delete('products/:id')
  @HttpCode(204)
  async deleteProduct(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const { name } = await this.products.remove(id);
    await this.audit.log({ actorId: req.user.sub, action: 'product.delete', entityType: 'product', entityId: id, summary: `Xóa sản phẩm "${name}"` });
  }

  // ---------------- Danh mục ----------------
  @Get('categories')
  listCategories() {
    return this.catalog.listCategories();
  }

  @Post('categories')
  createCategory(@Req() req: AuthenticatedRequest, @Body() dto: CategoryDto) {
    return this.catalog.createCategory(req.user.sub, dto);
  }

  @Patch('categories/:id')
  updateCategory(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: CategoryDto) {
    return this.catalog.updateCategory(req.user.sub, id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  deleteCategory(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.catalog.deleteCategory(req.user.sub, id);
  }

  // ---------------- Người dùng ----------------
  @Get('users')
  listUsers(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get('users/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  exportUsers(@Res({ passthrough: true }) res: Response, @Query() query: ListUsersQuery): Promise<string> {
    res.setHeader('Content-Disposition', csvName('nguoi-dung'));
    return this.users.exportCsv(query);
  }

  @Get('users/:id')
  userDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.detail(id);
  }

  @Patch('users/:id/role')
  setRole(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserRoleDto) {
    return this.users.setRole(req.user.sub, id, dto.role);
  }

  @Post('users/:id/lock')
  @HttpCode(200)
  lock(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LockUserDto) {
    return this.users.lock(req.user.sub, id, dto.reason);
  }

  @Post('users/:id/unlock')
  @HttpCode(200)
  unlock(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.unlock(req.user.sub, id);
  }

  @Post('users/:id/logout')
  @HttpCode(200)
  revokeSessions(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.revokeSessions(req.user.sub, id);
  }

  // ---------------- Đánh giá ----------------
  @Get('reviews')
  async listReviews(@Query() query: AdminListReviewsQuery) {
    const { items, total } = await this.reviews.adminList(query);
    return { items, total, page: query.page, limit: query.limit, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
  }

  @Delete('reviews/:id')
  @HttpCode(204)
  async deleteReview(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const info = await this.reviews.removeByIdWithInfo(id, req.user.sub);
    await this.audit.log({
      actorId: req.user.sub,
      action: 'review.delete',
      entityType: 'review',
      entityId: id,
      summary: `Gỡ đánh giá ${info.rating}★ của ${info.author} cho "${info.productName}"`,
    });
  }

  // ---------------- Bản tin ----------------
  @Get('newsletter')
  listNewsletter(@Query() query: ListNewsletterQuery) {
    return this.catalog.listNewsletter(query);
  }

  @Get('newsletter/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  exportNewsletter(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Disposition', csvName('ban-tin'));
    return this.catalog.exportNewsletter();
  }

  @Delete('newsletter/:id')
  @HttpCode(204)
  deleteSubscriber(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.catalog.deleteSubscriber(req.user.sub, id);
  }

  // ---------------- Nhật ký ----------------
  @Get('audit-logs')
  auditLogs(@Query() query: ListAuditQuery) {
    return this.audit.list(query);
  }
}
