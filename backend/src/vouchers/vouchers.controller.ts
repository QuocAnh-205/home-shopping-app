import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, Voucher } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CreateVoucherDto, SaveVoucherDto, UpdateVoucherDto } from './vouchers.dto';
import { VoucherView, VouchersService } from './vouchers.service';

@ApiTags('vouchers')
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  /** Kho voucher công khai */
  @Get()
  list(): Promise<VoucherView[]> {
    return this.vouchers.listPublic();
  }

  /** Kho voucher kèm cờ "đã lưu" của tôi */
  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  listMine(@Req() req: AuthenticatedRequest): Promise<VoucherView[]> {
    return this.vouchers.listPublic(req.user.sub);
  }

  /** Ví voucher: các voucher đã lưu còn hạn */
  @Get('wallet')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  wallet(@Req() req: AuthenticatedRequest): Promise<VoucherView[]> {
    return this.vouchers.wallet(req.user.sub);
  }

  /** Lưu voucher vào ví (kể cả mã riêng nhập tay). Giới hạn tần suất để chống dò mã */
  @Post('save')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  save(@Req() req: AuthenticatedRequest, @Body() dto: SaveVoucherDto): Promise<VoucherView> {
    return this.vouchers.save(req.user.sub, dto.code);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/vouchers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminVouchersController {
  constructor(
    private readonly vouchers: VouchersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(): Promise<Voucher[]> {
    return this.vouchers.adminList();
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateVoucherDto): Promise<Voucher> {
    const v = await this.vouchers.create(dto);
    await this.audit.log({
      actorId: req.user.sub,
      action: 'voucher.create',
      entityType: 'voucher',
      entityId: v.id,
      summary: `Tạo voucher ${v.code}`,
      metadata: { after: dto },
    });
    return v;
  }

  @Patch(':id')
  async update(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVoucherDto): Promise<Voucher> {
    const v = await this.vouchers.update(id, dto);
    await this.audit.log({
      actorId: req.user.sub,
      action: 'voucher.update',
      entityType: 'voucher',
      entityId: v.id,
      summary: `Cập nhật voucher ${v.code}`,
      metadata: { changes: dto },
    });
    return v;
  }
}
