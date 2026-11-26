import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@fitflow/shared';
import { currentContext } from '../common/request-context';
import { PERMISSIONS_KEY } from './decorators';

/** Global guard (runs after JwtAuthGuard): enforces @RequirePermissions(). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const ctx = currentContext();
    // Gym permissions only make sense inside a gym. Super-admin access to a gym
    // (support impersonation) arrives in Phase 4 as a separate, audited token.
    if (!ctx.gymId) throw new ForbiddenException('This action needs a gym context');

    const granted = new Set(ctx.permissions ?? []);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    return true;
  }
}
