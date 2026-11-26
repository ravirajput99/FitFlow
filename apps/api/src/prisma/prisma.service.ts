import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient, asSystem, type SystemClient } from '@fitflow/db';

/**
 * The raw Prisma client. Feature code should not query through it directly:
 * use TenantDbService (gym data) or `.system` (deliberate cross-gym access).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** RLS-bypassing client for auth lookups and platform-level work. */
  readonly system: SystemClient = asSystem(this);

  async onModuleInit() {
    await this.$connect();
    await this.warnIfRlsIsBypassed();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Superusers and BYPASSRLS roles ignore row-level security; say so loudly. */
  private async warnIfRlsIsBypassed() {
    const rows = await this.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    const role = rows[0];
    if (role && (role.rolsuper || role.rolbypassrls)) {
      this.logger.warn(
        'Connected as a superuser/BYPASSRLS role: database row-level security is NOT enforced. ' +
          'Use the non-superuser "fitflow" role from infra/postgres/init.sql.',
      );
    }
  }
}
