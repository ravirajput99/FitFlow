import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { currentContext } from '../common/request-context';
import { IS_PUBLIC_KEY } from './decorators';
import type { AccessTokenPayload } from './tokens.service';

/**
 * Global guard: every route needs a valid access token unless marked @Public().
 * On success it records the caller (user, gym, permissions) in the request context,
 * which TenantDbService and PermissionsGuard read.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    const ctx = currentContext();
    ctx.userId = payload.sub;
    ctx.gymId = payload.gid;
    ctx.roleKey = payload.rk;
    ctx.permissions = payload.perms;
    ctx.isSuperAdmin = payload.sa;
    return true;
  }
}
