import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { z } from 'zod';
import {
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  type AuthUser,
  type LoginResponse,
} from '@fitflow/shared';
import { currentContext } from '../common/request-context';
import { ApiZodBody, ZodPipe } from '../common/zod';
import { env } from '../config/env';
import { AuthService } from './auth.service';
import { Public } from './decorators';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') ?? undefined });

/** Public auth routes get a much tighter per-IP limit than the global one (brute force, SMS cost). */
const AuthThrottle = () => Throttle({ default: { limit: env().AUTH_RATE_LIMIT, ttl: 60_000 } });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(loginSchema)
  login(
    @Body(new ZodPipe(loginSchema)) body: z.output<typeof loginSchema>,
    @Req() req: Request,
  ): Promise<LoginResponse> {
    return this.auth.login(body, meta(req));
  }

  @Public()
  @AuthThrottle()
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiZodBody(otpRequestSchema)
  async requestOtp(
    @Body(new ZodPipe(otpRequestSchema)) body: z.output<typeof otpRequestSchema>,
  ): Promise<{ message: string }> {
    await this.auth.requestOtp(body);
    return { message: 'If this number is registered with the gym, a code has been sent.' };
  }

  @Public()
  @AuthThrottle()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(otpVerifySchema)
  verifyOtp(
    @Body(new ZodPipe(otpVerifySchema)) body: z.output<typeof otpVerifySchema>,
    @Req() req: Request,
  ): Promise<LoginResponse> {
    return this.auth.verifyOtp(body, meta(req));
  }

  @Public()
  @AuthThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(refreshSchema)
  refresh(
    @Body(new ZodPipe(refreshSchema)) body: z.output<typeof refreshSchema>,
    @Req() req: Request,
  ): Promise<LoginResponse> {
    return this.auth.refresh(body.refreshToken, meta(req));
  }

  @Public()
  @AuthThrottle()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(refreshSchema)
  async logout(@Body(new ZodPipe(refreshSchema)) body: z.output<typeof refreshSchema>) {
    await this.auth.logout(body.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  me(): Promise<AuthUser> {
    return this.auth.me(currentContext().userId!);
  }
}
