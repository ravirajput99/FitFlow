import { ForbiddenException, Injectable } from '@nestjs/common';
import { forTenant, tenantTransaction, type Prisma, type TenantClient } from '@fitflow/db';
import { currentContext } from '../common/request-context';
import { PrismaService } from './prisma.service';

/**
 * Gym-scoped database access for the current request. Every query is limited to the
 * caller's gym by the app (gymId injection) and by PostgreSQL row-level security.
 */
@Injectable()
export class TenantDbService {
  constructor(private readonly prisma: PrismaService) {}

  /** Gym id of the current request; throws 403 for callers without a gym (e.g. super-admin). */
  get gymId(): string {
    const gymId = currentContext().gymId;
    if (!gymId) throw new ForbiddenException('This action needs a gym context');
    return gymId;
  }

  /** Prisma client scoped to the current gym (cached for the request). */
  get client(): TenantClient {
    const ctx = currentContext();
    const gymId = this.gymId;
    ctx.tenantClient ??= forTenant(this.prisma, gymId);
    return ctx.tenantClient as TenantClient;
  }

  /**
   * Interactive transaction under RLS for the current gym. Inside `fn`, gymId is NOT
   * auto-injected: pass `this.gymId` explicitly in where/data.
   */
  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return tenantTransaction(this.prisma, this.gymId, fn);
  }
}
