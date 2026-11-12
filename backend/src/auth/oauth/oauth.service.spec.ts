import { ConfigService } from '@nestjs/config';
import { OAuthProvider } from '@prisma/client';
import { MetricsService } from '../../metrics/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { OAuthError, OAuthProfile, OAuthService } from './oauth.service';

describe('OAuthService', () => {
  const redisClient = { set: jest.fn(), getdel: jest.fn() };
  const prisma = {
    oAuthAccount: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  };
  const config = new ConfigService({
    APP_URL: 'https://shop.test',
    GOOGLE_CLIENT_ID: 'gid',
    GOOGLE_CLIENT_SECRET: 'gsecret',
  });
  const service = new OAuthService(
    config,
    prisma as unknown as PrismaService,
    { client: redisClient } as unknown as RedisService,
    new MetricsService(),
  );
  const profile: OAuthProfile = { providerUserId: 'g-123', email: 'lan@gmail.com', emailVerified: true, name: 'Lan', avatarUrl: 'https://x/a.png' };
  const user = { id: 'u-1', email: 'lan@gmail.com', avatarUrl: null };

  beforeEach(() => jest.clearAllMocks());

  describe('Google One Tap (ID token)', () => {
    const now = Date.parse('2026-11-12T00:00:00Z');
    const claims = { aud: 'gid', iss: 'https://accounts.google.com', sub: 'g-123', exp: String(now / 1000 + 600), email: 'Lan@Gmail.com', email_verified: 'true', name: 'Lan' };
    const tokeninfo = (body: object, ok = true) =>
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok, json: async () => body } as Response);
    afterEach(() => jest.restoreAllMocks());

    it('accepts a token issued by Google for THIS shop and maps it to a profile', async () => {
      tokeninfo(claims);
      await expect(service.verifyGoogleIdToken('a.b.c', now)).resolves.toEqual({
        providerUserId: 'g-123',
        email: 'lan@gmail.com',
        emailVerified: true,
        name: 'Lan',
        avatarUrl: null,
      });
      expect(service.googleClientId()).toBe('gid');
    });

    it.each([
      ['issued for another website (aud)', { ...claims, aud: 'someone-else' }],
      ['wrong issuer', { ...claims, iss: 'https://evil.example' }],
      ['expired', { ...claims, exp: String(now / 1000 - 1) }],
    ])('rejects a token %s', async (_label, body) => {
      tokeninfo(body);
      await expect(service.verifyGoogleIdToken('a.b.c', now)).rejects.toEqual(new OAuthError('invalid_token'));
    });

    it('rejects a token Google itself says is invalid', async () => {
      tokeninfo({ error: 'invalid_token' }, false);
      await expect(service.verifyGoogleIdToken('a.b.c', now)).rejects.toBeInstanceOf(OAuthError);
    });
  });

  it('reports only providers that have credentials', () => {
    expect(service.enabledProviders()).toEqual({ google: true, facebook: false });
  });

  it('builds a Google authorize URL with state and PKCE S256', async () => {
    const { state, url } = await service.start('google', '/cart', null);
    const u = new URL(url);

    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('state')).toBe(state);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    // Màn hình chọn tài khoản Google luôn hiện (cho phép chọn bất kỳ tài khoản nào đã đăng nhập trên trình duyệt)
    expect(u.searchParams.get('prompt')).toBe('select_account');
    expect(u.searchParams.get('redirect_uri')).toBe('https://shop.test/api/auth/oauth/google/callback');
    const stored = JSON.parse(redisClient.set.mock.calls[0][1]);
    expect(stored).toMatchObject({ provider: 'google', next: '/cart', linkUserId: null });
  });

  it('refuses to start an unconfigured provider', async () => {
    await expect(service.start('facebook', '/', null)).rejects.toEqual(new OAuthError('not_configured'));
  });

  it('rejects a callback whose state does not match the browser cookie (CSRF)', async () => {
    await expect(service.complete('google', 'code', 'state-a', 'state-b')).rejects.toEqual(new OAuthError('invalid_state'));
    await expect(service.complete('google', 'code', 'state-a', undefined)).rejects.toEqual(new OAuthError('invalid_state'));
    expect(redisClient.getdel).not.toHaveBeenCalled();
  });

  it.each([
    ['/cart', '/cart'],
    ['/products/sofa?x=1', '/products/sofa?x=1'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    [undefined, '/'],
  ])('safeNext(%s) = %s (no open redirect)', (input, expected) => {
    expect(OAuthService.safeNext(input)).toBe(expected);
  });

  describe('resolveUser', () => {
    it('logs in the user already linked to this provider account', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue({ userId: user.id, user });

      await expect(service.resolveUser('google', profile, null)).resolves.toBe(user);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('links to an existing account with the same verified email instead of creating a duplicate', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      await service.resolveUser('google', profile, null);

      expect(prisma.user.update.mock.calls[0][0].data.oauthAccounts).toEqual({
        create: { provider: OAuthProvider.GOOGLE, providerUserId: 'g-123' },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates a password-less account for a new user', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);

      await service.resolveUser('google', profile, null);

      expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({ email: 'lan@gmail.com', passwordHash: null, fullName: 'Lan' });
    });

    it('never links on an unverified email (account takeover protection)', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue(null);

      await expect(service.resolveUser('google', { ...profile, emailVerified: false }, null)).rejects.toEqual(new OAuthError('email_unverified'));
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses to link a provider account that already belongs to someone else', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue({ userId: 'other', user: { id: 'other' } });

      await expect(service.resolveUser('google', profile, user.id)).rejects.toEqual(new OAuthError('already_linked'));
    });
  });
});
