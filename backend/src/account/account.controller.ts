import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { AddressDto } from './account.dto';
import { AccountService, AddressView } from './account.service';

/** Ảnh đại diện tối đa 1 MB (giống Shopee) */
export const AVATAR_MAX_BYTES = 1024 * 1024;

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

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
