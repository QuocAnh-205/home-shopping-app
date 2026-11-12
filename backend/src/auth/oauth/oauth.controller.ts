import { Body, Controller, Get, HttpCode, Logger, Param, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { GoogleOneTapDto, OAuthExchangeDto } from '../auth.dto';
import { AuthService } from '../auth.service';
import { AuthResponse, AuthenticatedRequest } from '../auth.types';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { OAuthError, OAuthService } from './oauth.service';

const STATE_COOKIE = 'hs_oauth_state';
const COOKIE_PATH = '/api/auth/oauth';

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

@ApiTags('auth')
@Controller('auth/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly auth: AuthService,
  ) {}

  @Get('providers')
  providers(): Record<'google' | 'facebook', boolean> {
    return this.oauth.enabledProviders();
  }

  /** Cấu hình Google One Tap (client ID công khai; null = chưa cấu hình Google → frontend không hiện) */
  @Get('one-tap-config')
  oneTapConfig(): { googleClientId: string | null } {
    return { googleClientId: this.oauth.googleClientId() };
  }

  /**
   * Google One Tap: khách đã đăng nhập Google trên trình duyệt bấm "Tiếp tục với tư cách …" → frontend gửi ID token.
   * Dùng đúng quy tắc liên kết tài khoản như luồng OAuth thường (trùng email đã xác minh → vào đúng tài khoản cũ).
   */
  @Post('google/one-tap')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async googleOneTap(@Body() dto: GoogleOneTapDto): Promise<AuthResponse> {
    try {
      const profile = await this.oauth.verifyGoogleIdToken(dto.credential);
      const user = await this.oauth.resolveUser('google', profile, null);
      return this.auth.issue(await this.auth.profile(user.id));
    } catch (err) {
      if (err instanceof OAuthError) {
        this.logger.warn({ event: 'oauth.one_tap_failed', code: err.code });
        throw new UnauthorizedException(err.code === 'provider_disabled' ? 'Google sign-in is not configured' : 'Google sign-in failed');
      }
      throw err;
    }
  }

  /** Lấy vé để liên kết thêm Google/Facebook vào tài khoản đang đăng nhập */
  @Post('link-ticket')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async linkTicket(@Req() req: AuthenticatedRequest): Promise<{ ticket: string }> {
    return { ticket: await this.oauth.createLinkTicket(req.user.sub) };
  }

  /** Đổi mã đăng nhập 1 lần (nhận ở /auth/callback) lấy access token */
  @Post('exchange')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async exchange(@Body() dto: OAuthExchangeDto): Promise<AuthResponse> {
    const userId = await this.oauth.consumeLoginCode(dto.code);
    if (!userId) throw new UnauthorizedException('Login code is invalid or expired');
    const profile = await this.auth.profile(userId);
    return this.auth.issue(profile);
  }

  @Get(':provider')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async start(
    @Param('provider') provider: string,
    @Query('next') next: string | undefined,
    @Query('link') link: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!OAuthService.isProvider(provider)) return this.fail(res, 'unknown_provider');
    try {
      const linkUserId = link ? await this.oauth.consumeLinkTicket(link) : null;
      if (link && !linkUserId) return this.fail(res, 'link_expired');
      const { state, url } = await this.oauth.start(provider, next ?? '/', linkUserId);
      res.cookie(STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: 'lax', // phải là lax: callback là điều hướng top-level từ domain của Google/Facebook
        secure: this.oauth.appUrl.startsWith('https://'),
        path: COOKIE_PATH,
        maxAge: 10 * 60_000,
      });
      res.redirect(302, url);
    } catch (err) {
      this.fail(res, err instanceof OAuthError ? err.code : 'server_error', err);
    }
  }

  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.clearCookie(STATE_COOKIE, { path: COOKIE_PATH });
    if (!OAuthService.isProvider(provider)) return this.fail(res, 'unknown_provider');
    if (error) return this.fail(res, 'access_denied');
    if (!code || !state) return this.fail(res, 'invalid_request');

    try {
      const { user, next } = await this.oauth.complete(provider, code, state, readCookie(req, STATE_COOKIE));
      if (user.lockedAt) return this.fail(res, 'account_locked');
      const loginCode = await this.oauth.createLoginCode(user.id);
      res.redirect(302, `${this.oauth.appUrl}/auth/callback?code=${loginCode}&next=${encodeURIComponent(next)}`);
    } catch (err) {
      this.fail(res, err instanceof OAuthError ? err.code : 'server_error', err);
    }
  }

  private fail(res: Response, code: string, err?: unknown): void {
    if (err && !(err instanceof OAuthError)) this.logger.error({ event: 'oauth.failed', err: (err as Error).message });
    else this.logger.warn({ event: 'oauth.failed', code });
    res.redirect(302, `${this.oauth.appUrl}/login?oauth_error=${encodeURIComponent(code)}`);
  }
}
