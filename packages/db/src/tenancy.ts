import { type Prisma, type PrismaClient } from '@prisma/client';

/**
 * Models that belong to a single gym. Every query on these models through `forTenant()`
 * is scoped to that gym. Keep in sync with the RLS migration.
 */
export const TENANT_MODELS: ReadonlySet<Prisma.ModelName> = new Set<Prisma.ModelName>([
  'Branch',
  'Role',
  'User',
  'Member',
  'Plan',
  'Membership',
  'AuditLog',
]);

/** Operations whose `where` gets `gymId` added. */
const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

/** Operations whose `data` (or `create` for upsert) gets `gymId` set. */
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantViolationError';
  }
}

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

function stampGymId(data: unknown, gymId: string, model: string): void {
  if (Array.isArray(data)) {
    for (const row of data) stampGymId(row, gymId, model);
    return;
  }
  if (!data || typeof data !== 'object') return;
  const row = data as Record<string, unknown>;
  if (row.gymId !== undefined && row.gymId !== gymId) {
    throw new TenantViolationError(`Refusing to write ${model} for another gym`);
  }
  // A nested `gym: { connect }` cannot be mixed with a scalar gymId; let RLS check that case.
  if (!('gym' in row)) row.gymId = gymId;
}

/** Adds the tenant filter to Prisma query args in place. Exported for unit tests. */
export function scopeArgs(model: string, operation: string, args: Args, gymId: string): Args {
  if (WHERE_OPERATIONS.has(operation)) {
    const where = args.where ?? {};
    if (where.gymId !== undefined && where.gymId !== gymId) {
      throw new TenantViolationError(`Refusing to query ${model} of another gym`);
    }
    args.where = { ...where, gymId };
  }
  if (CREATE_OPERATIONS.has(operation)) stampGymId(args.data, gymId, model);
  if (operation === 'upsert') stampGymId(args.create, gymId, model);
  return args;
}

/**
 * Returns a client scoped to one gym.
 *
 * - App level: `gymId` is added to the where/data of every tenant-model query.
 * - DB level: each query runs in a short transaction that sets `app.gym_id`, which the
 *   row-level-security policies check. Nested writes and relation filters are covered by RLS.
 *
 * Do not call `$transaction(async tx => ...)` on this client: interactive transactions are
 * not supported by query extensions. Use `tenantTransaction()` instead.
 */
export function forTenant(prisma: PrismaClient, gymId: string) {
  if (!gymId) throw new TenantViolationError('forTenant() needs a gymId');
  return prisma.$extends({
    name: 'fitflow-tenant',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scoped = TENANT_MODELS.has(model)
            ? scopeArgs(model, operation, (args ?? {}) as Args, gymId)
            : args;
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.gym_id', ${gymId}, TRUE)`,
            query(scoped as typeof args),
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof forTenant>;

/**
 * Interactive transaction for one gym. RLS is active for every statement inside `fn`,
 * but `gymId` is NOT auto-injected: pass it explicitly in where/data.
 */
export function tenantTransaction<T>(
  prisma: PrismaClient,
  gymId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number },
): Promise<T> {
  if (!gymId) throw new TenantViolationError('tenantTransaction() needs a gymId');
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.gym_id', ${gymId}, TRUE)`;
    return fn(tx);
  }, options);
}

/**
 * Client for platform-level work that legitimately spans gyms: login lookups, super-admin
 * screens, background jobs, seeding. It switches RLS off per query, so use it deliberately.
 */
export function asSystem(prisma: PrismaClient) {
  return prisma.$extends({
    name: 'fitflow-system',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type SystemClient = ReturnType<typeof asSystem>;

/** Interactive transaction with RLS switched off. Same caveats as `asSystem()`. */
export function systemTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number },
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return fn(tx);
  }, options);
}
