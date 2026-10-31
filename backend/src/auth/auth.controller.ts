import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';
import { AuthService } from './auth.service';
import { AccountProfile, AuthResponse, AuthenticatedRequest } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  /** Luôn trả 200 với cùng nội dung dù email có tồn tại hay không (chống dò tài khoản) */
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.auth.resetPassword(dto);
    return { ok: true };
  }

  @Post('change-password')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto): Promise<AuthResponse> {
    return this.auth.changePassword(req.user.sub, dto);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.auth.logout(req.user);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest): Promise<AccountProfile> {
    return this.auth.profile(req.user.sub);
  }
}
