import { Injectable } from '@nestjs/common';
import { Prisma } from '@fitflow/db';
import { currentContext } from '../common/request-context';
import { TenantDbService } from '../prisma/tenant-db.service';

export interface AuditEntry {
  action: 'create' | 'update' | 'delete' | (string & {});
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

const toJson = (value: unknown) =>
  value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

/** Records who changed what in the current gym. Pass `tx` to log inside a transaction. */
@Injectable()
export class AuditService {
  constructor(private readonly db: TenantDbService) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const ctx = currentContext();
    const data = {
      gymId: this.db.gymId,
      actorUserId: ctx.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 255),
    };
    if (tx) await tx.auditLog.create({ data });
    else await this.db.client.auditLog.create({ data });
  }
}
