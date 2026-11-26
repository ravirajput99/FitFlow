import { AsyncLocalStorage } from 'node:async_hooks';
import type { Permission } from '@fitflow/shared';
import type { NextFunction, Request, Response } from 'express';

/** Who is calling and for which gym. Filled by JwtAuthGuard for authenticated requests. */
export interface RequestContext {
  ip?: string;
  userAgent?: string;
  userId?: string;
  gymId?: string | null;
  roleKey?: string | null;
  permissions?: Permission[];
  isSuperAdmin?: boolean;
  /** Per-request cache for the tenant-scoped Prisma client. */
  tenantClient?: unknown;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Express middleware: every request gets its own context object. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  storage.run({ ip: req.ip, userAgent: req.get('user-agent') ?? undefined }, () => next());
}

export function currentContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('No request context: is requestContextMiddleware registered?');
  return ctx;
}

/** For background jobs and tests: run code with an explicit context. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}
