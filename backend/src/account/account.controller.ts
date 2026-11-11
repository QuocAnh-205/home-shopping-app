import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { UpdateProfileDto } from '../auth/auth.dto';
import { AccountProfile, AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from '../storage/storage.service';
import { AccountCenterService } from './account-center.service';
import {
  AddressDto,
  BankAccountDto,
  ChangeUsernameDto,
  DeleteAccountDto,
  EmailChangeConfirmDto,
  EmailChangeRequestDto,
  UpdateSettingsDto,
} from './account.dto';
import { BANK_CATALOG, BankAccountView, BanksService } from './banks.service';
import { UserSettings } from './settings';
import { AccountService, AddressView } from './account.service';

/** Ảnh đại diện tối đa 1 MB (giống Shopee) */
export const AVATAR_MAX_BYTES = 1024 * 1024;

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly center: AccountCenterService,
    private readonly banks: BanksService,
  ) {}

  /** Tên đăng nhập: chỉ đổi được 1 lần */
  @Patch('username')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  changeUsername(@Req() req: AuthenticatedRequest, @Body() dto: ChangeUsernameDto): Promise<AccountProfile> {
    return this.center.changeUsername(req.user.sub, dto.username);
  }

  /** Đổi email bước 1: xác minh mật khẩu, gửi mã 6 số tới email mới */
  @Post('email/request')
  @HttpCode(200)
  @Throttle({ default: { ttl: 300_000, limit: 3 } })
  requestEmailChange(@Req() req: AuthenticatedRequest, @Body() dto: EmailChangeRequestDto) {
    return this.center.requestEmailChange(req.user.sub, dto.newEmail, dto.password);
  }

  /** Đổi email bước 2: nhập mã xác nhận */
  @Post('email/confirm')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  confirmEmailChange(@Req() req: AuthenticatedRequest, @Body() dto: EmailChangeConfirmDto): Promise<AccountProfile> {
    return this.center.confirmEmailChange(req.user.sub, dto.code);
  }

  /** Cài đặt thông báo & quyền riêng tư */
  @Patch('settings')
  updateSettings(@Req() req: AuthenticatedRequest, @Body() dto: UpdateSettingsDto): Promise<UserSettings> {
    return this.center.updateSettings(req.user.sub, dto);
  }

  /** Tải toàn bộ dữ liệu cá nhân (JSON) */
  @Get('export')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  exportData(@Req() req: AuthenticatedRequest) {
    return this.center.exportData(req.user.sub);
  }

  // ---------------- Ngân hàng ----------------
  @Get('banks/catalog')
  bankCatalog() {
    return BANK_CATALOG;
  }

  @Get('banks')
  listBanks(@Req() req: AuthenticatedRequest): Promise<BankAccountView[]> {
    return this.banks.list(req.user.sub);
  }

  @Post('banks')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  addBank(@Req() req: AuthenticatedRequest, @Body() dto: BankAccountDto): Promise<BankAccountView[]> {
    return this.banks.add(req.user.sub, dto);
  }

  @Post('banks/:id/default')
  @HttpCode(200)
  setDefaultBank(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<BankAccountView[]> {
    return this.banks.setDefault(req.user.sub, id);
  }

  @Delete('banks/:id')
  removeBank(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<BankAccountView[]> {
    return this.banks.remove(req.user.sub, id);
  }

  /** Xóa tài khoản của chính mình (ẩn danh hóa, thu hồi mọi phiên đăng nhập) */
  @Delete()
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  deleteAccount(@Req() req: AuthenticatedRequest, @Body() dto: DeleteAccountDto): Promise<void> {
    return this.account.deleteAccount(req.user.sub, dto);
  }

  @Patch('profile')
  updateProfile(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto): Promise<AccountProfile> {
    return this.account.updateProfile(req.user.sub, dto);
  }

  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
      fileFilter: (_req, file, cb) =>
        StorageService.isAllowedMime(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException('Only JPEG, PNG or WEBP images are allowed'), false),
    }),
  )
  uploadAvatar(@Req() req: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File): Promise<AccountProfile> {
    if (!file) throw new BadRequestException('File is required');
    if (!StorageService.matchesSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('File content does not match its declared image type');
    }
    return this.account.setAvatar(req.user.sub, file.buffer, file.mimetype);
  }

  @Get('addresses')
  addresses(@Req() req: AuthenticatedRequest): Promise<AddressView[]> {
    return this.account.listAddresses(req.user.sub);
  }

  @Post('addresses')
  createAddress(@Req() req: AuthenticatedRequest, @Body() dto: AddressDto): Promise<AddressView> {
    return this.account.createAddress(req.user.sub, dto);
  }

  @Put('addresses/:id')
  updateAddress(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddressDto): Promise<AddressView> {
    return this.account.updateAddress(req.user.sub, id, dto);
  }

  @Post('addresses/:id/default')
  setDefault(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<AddressView[]> {
    return this.account.setDefaultAddress(req.user.sub, id);
  }

  @Delete('addresses/:id')
  deleteAddress(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<AddressView[]> {
    return this.account.deleteAddress(req.user.sub, id);
  }
}
