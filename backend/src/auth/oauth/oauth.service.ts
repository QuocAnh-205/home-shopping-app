import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProvider, User } from '@prisma/client';
import { MetricsService } from '../../metrics/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export type ProviderSlug = 'google' | 'facebook';

export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
}

interface ProviderConfig {
  enum: OAuthProvider;
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  pkce: boolean;
}

interface PendingState {
  provider: ProviderSlug;
  verifier: string;
  next: string;
  linkUserId: string | null;
}

/** Lỗi nghiệp vụ OAuth → mã ngắn gọn để frontend hiển thị thông báo tiếng Việt phù hợp */
export class OAuthError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const GRAPH = 'https://graph.facebook.com/v21.0';
const STATE_TTL = 600;
const LOGIN_CODE_TTL = 120;

/**
 * OAuth 2.0 Authorization Code flow cho Google (kèm PKCE S256) và Facebook.
 * - state ngẫu nhiên lưu Redis + cookie httpOnly → chống CSRF / login CSRF.
 * - Sau callback chỉ trả về "mã đăng nhập" dùng 1 lần (Redis, 2 phút) → access token không bao giờ nằm trên URL.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly providers: Record<ProviderSlug, ProviderConfig>;
  readonly appUrl: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost').replace(/\/+$/, '');
    this.providers = {
      google: {
        enum: OAuthProvider.GOOGLE,
        clientId: config.get<string>('GOOGLE_CLIENT_ID'),
        clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET'),
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'openid email profile',
        pkce: true,
      },
      facebook: {
        enum: OAuthProvider.FACEBOOK,
        clientId: config.get<string>('FACEBOOK_APP_ID'),
        clientSecret: config.get<string>('FACEBOOK_APP_SECRET'),
        authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        tokenUrl: `${GRAPH}/oauth/access_token`,
        scope: 'email,public_profile',
        pkce: false,
      },
    };
  }

  static isProvider(value: string): value is ProviderSlug {
    return value === 'google' || value === 'facebook';
  }

  isEnabled(provider: ProviderSlug): boolean {
    const p = this.providers[provider];
    return Boolean(p.clientId && p.clientSecret);
  }

  enabledProviders(): Record<ProviderSlug, boolean> {
    return { google: this.isEnabled('google'), facebook: this.isEnabled('facebook') };
  }

  redirectUri(provider: ProviderSlug): string {
    return `${this.appUrl}/api/auth/oauth/${provider}/callback`;
  }

  /** Bắt đầu flow: tạo state + PKCE verifier, trả về URL trang đồng ý của nhà cung cấp */
  async start(provider: ProviderSlug, next: string, linkUserId: string | null): Promise<{ state: string; url: string }> {
    if (!this.isEnabled(provider)) throw new OAuthError('not_configured');
    const cfg = this.providers[provider];
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const pending: PendingState = { provider, verifier, next: OAuthService.safeNext(next), linkUserId };
    await this.redis.client.set(`oauth:state:${state}`, JSON.stringify(pending), 'EX', STATE_TTL);

    const params = new URLSearchParams({
      client_id: cfg.clientId!,
      redirect_uri: this.redirectUri(provider),
      response_type: 'code',
      scope: cfg.scope,
      state,
    });
    if (cfg.pkce) {
      params.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
      params.set('code_challenge_method', 'S256');
      params.set('prompt', 'select_account');
    }
    return { state, url: `${cfg.authorizeUrl}?${params.toString()}` };
  }

  /** Xử lý callback: kiểm tra state, đổi code lấy token, lấy hồ sơ, tìm/liên kết/tạo user */
  async complete(provider: ProviderSlug, code: string, state: string, cookieState: string | undefined): Promise<{ user: User; next: string }> {
    if (!cookieState || cookieState !== state) throw new OAuthError('invalid_state');
    const raw = await this.redis.client.getdel(`oauth:state:${state}`);
    if (!raw) throw new OAuthError('invalid_state');
    const pending = JSON.parse(raw) as PendingState;
    if (pending.provider !== provider) throw new OAuthError('invalid_state');

    const accessToken = await this.exchangeCode(provider, code, pending.verifier);
    const profile = await this.fetchProfile(provider, accessToken);
    const user = await this.resolveUser(provider, profile, pending.linkUserId);
    return { user, next: pending.next };
  }

  async createLoginCode(userId: string): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.redis.client.set(`oauth:login:${code}`, userId, 'EX', LOGIN_CODE_TTL);
    return code;
  }

  /** GETDEL: mã chỉ đổi được đúng 1 lần */
  consumeLoginCode(code: string): Promise<string | null> {
    return this.redis.client.getdel(`oauth:login:${code}`);
  }

  /** Vé liên kết tài khoản: trình duyệt điều hướng tới /oauth/:provider không gửi được header Authorization */
  async createLinkTicket(userId: string): Promise<string> {
    const ticket = randomBytes(24).toString('base64url');
    await this.redis.client.set(`oauth:link:${ticket}`, userId, 'EX', LOGIN_CODE_TTL);
    return ticket;
  }

  consumeLinkTicket(ticket: string): Promise<string | null> {
    return this.redis.client.getdel(`oauth:link:${ticket}`);
  }

  static safeNext(next: string | undefined): string {
    return next && /^\/(?![/\\])[\w\-./?=&#%]*$/.test(next) ? next : '/';
  }

  private async exchangeCode(provider: ProviderSlug, code: string, verifier: string): Promise<string> {
    const cfg = this.providers[provider];
    const body = new URLSearchParams({
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      code,
      redirect_uri: this.redirectUri(provider),
      grant_type: 'authorization_code',
    });
    if (cfg.pkce) body.set('code_verifier', verifier);

    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!res.ok || !json.access_token) {
      this.logger.warn({ event: 'oauth.token_failed', provider, status: res.status, error: json.error });
      throw new OAuthError('token_exchange_failed');
    }
    return json.access_token;
  }

  private async fetchProfile(provider: ProviderSlug, accessToken: string): Promise<OAuthProfile> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    if (provider === 'google') {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new OAuthError('profile_failed');
      const p = (await res.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
      return {
        providerUserId: p.sub,
        email: p.email?.toLowerCase() ?? null,
        emailVerified: p.email_verified === true,
        name: p.name ?? p.email ?? 'Google user',
        avatarUrl: p.picture ?? null,
      };
    }
    const res = await fetch(`${GRAPH}/me?fields=id,name,email,picture.type(large)`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new OAuthError('profile_failed');
    const p = (await res.json()) as { id: string; name?: string; email?: string; picture?: { data?: { url?: string } } };
    return {
      providerUserId: p.id,
      email: p.email?.toLowerCase() ?? null,
      // Facebook chỉ trả email đã được người dùng xác minh
      emailVerified: Boolean(p.email),
      name: p.name ?? 'Facebook user',
      avatarUrl: p.picture?.data?.url ?? null,
    };
  }

  /**
   * Quy tắc liên kết:
   * 1. Đã có liên kết (provider, id) → đăng nhập user đó.
   * 2. Đang liên kết từ trang tài khoản → gắn vào user hiện tại.
   * 3. Email đã xác minh trùng tài khoản có sẵn → tự liên kết (không tạo tài khoản trùng).
   * 4. Còn lại → tạo tài khoản mới không mật khẩu (có thể đặt mật khẩu sau).
   */
  async resolveUser(provider: ProviderSlug, profile: OAuthProfile, linkUserId: string | null): Promise<User> {
    const providerEnum = this.providers[provider].enum;
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: providerEnum, providerUserId: profile.providerUserId } },
      include: { user: true },
    });
    if (existing) {
      if (linkUserId && existing.userId !== linkUserId) throw new OAuthError('already_linked');
      this.metrics.authEvents.inc({ event: `oauth_login_${provider}` });
      return existing.user;
    }

    if (linkUserId) {
      const user = await this.prisma.user.update({
        where: { id: linkUserId },
        data: { oauthAccounts: { create: { provider: providerEnum, providerUserId: profile.providerUserId } } },
      });
      this.logger.log({ event: 'oauth.linked', provider, userId: user.id });
      return user;
    }

    if (!profile.email) throw new OAuthError('email_required');
    if (!profile.emailVerified) throw new OAuthError('email_unverified');

    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      const user = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
          oauthAccounts: { create: { provider: providerEnum, providerUserId: profile.providerUserId } },
        },
      });
      this.logger.log({ event: 'oauth.linked_by_email', provider, userId: user.id });
      this.metrics.authEvents.inc({ event: `oauth_login_${provider}` });
      return user;
    }

    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        fullName: profile.name.slice(0, 100),
        avatarUrl: profile.avatarUrl,
        passwordHash: null,
        oauthAccounts: { create: { provider: providerEnum, providerUserId: profile.providerUserId } },
      },
    });
    this.metrics.authEvents.inc({ event: `register_${provider}` });
    this.logger.log({ event: 'user.registered', userId: user.id, method: provider });
    return user;
  }
}
