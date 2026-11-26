import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppThrottlerGuard } from '../common/throttler.guard';
import { env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LogOtpSender, OtpSender } from './otp-sender';
import { PermissionsGuard } from './permissions.guard';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    JwtModule.register({
      secret: env().JWT_ACCESS_SECRET,
      signOptions: {
        expiresIn: env().JWT_ACCESS_TTL_SECONDS,
        issuer: 'fitflow',
        algorithm: 'HS256',
      },
      verifyOptions: { issuer: 'fitflow', algorithms: ['HS256'] },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    { provide: OtpSender, useClass: LogOtpSender },
    // Order matters: authenticate, then rate-limit (per user once known), then check permissions.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
