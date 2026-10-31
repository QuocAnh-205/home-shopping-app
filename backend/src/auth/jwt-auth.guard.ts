import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtPayload } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing bearer token');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!payload.jti || typeof payload.iat !== 'number') throw new UnauthorizedException('Invalid token');

    // Fail-closed: không kiểm tra được denylist thì không cho token (có thể đã logout) lọt qua
    let revoked: boolean;
    try {
      revoked = await this.auth.isRevoked(payload);
    } catch (err) {
      this.logger.error(`Revocation check failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication temporarily unavailable');
    }
    if (revoked) throw new UnauthorizedException('Token has been revoked');

    req.user = payload;
    return true;
  }
}
