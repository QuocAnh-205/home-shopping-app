import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ReturnStatus, Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { memoryStorage } from 'multer';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AppError, ErrorCode } from '../common/errors';
import { StorageService } from '../storage/storage.service';
import { RETURN_REASONS, ReturnView, ReturnsService } from './returns.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export class CreateReturnDto {
  @IsIn(RETURN_REASONS, { message: 'Vui lòng chọn lý do trả hàng' })
  reason: string;

  @IsString()
  @Transform(trim)
  @MinLength(10, { message: 'Mô tả cần ít nhất 10 ký tự' })
  @MaxLength(1000)
  @Matches(/^[^<>]*$/, { message: 'description must not contain HTML' })
  description: string;
}

export class ResolveReturnDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(500)
  @Matches(/^[^<>]*$/)
  note?: string;
}

export class ListReturnsQuery {
  @IsOptional()
  @IsIn(Object.values(ReturnStatus))
  status?: ReturnStatus;
}

@ApiTags('returns')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get('returns/reasons')
  reasons(): readonly string[] {
    return RETURN_REASONS;
  }

  /** Gửi yêu cầu trả hàng/hoàn tiền: multipart (reason, description, images[] ≤ 5 ảnh, mỗi ảnh ≤ 2 MB) */
  @Post('orders/:id/return')
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseInterceptors(
    FilesInterceptor('images', MAX_IMAGES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES },
      fileFilter: (_req, file, cb) =>
        StorageService.isImageUpload(file.mimetype) ? cb(null, true) : cb(new AppError(ErrorCode.BAD_REQUEST, 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WEBP'), false),
    }),
  )
  create(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReturnDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ): Promise<ReturnView> {
    return this.returns.request(req.user.sub, id, dto, files);
  }

  @Get('orders/:id/return')
  mine(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<ReturnView | null> {
    return this.returns.mine(req.user.sub, id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/returns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() q: ListReturnsQuery) {
    return this.returns.list(q.status);
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveReturnDto): Promise<ReturnView> {
    const r = await this.returns.approve(id, req.user.sub, dto.note);
    await this.audit.log({ actorId: req.user.sub, action: 'return.approve', entityType: 'return', entityId: id, summary: `Duyệt trả hàng đơn #${r.orderId.slice(0, 8)}`, metadata: { note: dto.note } });
    return r;
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveReturnDto): Promise<ReturnView> {
    if (!dto.note || dto.note.length < 5) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Vui lòng ghi lý do từ chối (ít nhất 5 ký tự)');
    const r = await this.returns.reject(id, req.user.sub, dto.note);
    await this.audit.log({ actorId: req.user.sub, action: 'return.reject', entityType: 'return', entityId: id, summary: `Từ chối trả hàng đơn #${r.orderId.slice(0, 8)}`, metadata: { note: dto.note } });
    return r;
  }
}
