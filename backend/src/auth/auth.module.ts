import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '1d',
          issuer: 'home-shopping-api',
          algorithm: 'HS256',
        },
        verifyOptions: { issuer: 'home-shopping-api', algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [AuthService, OAuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtModule, AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
