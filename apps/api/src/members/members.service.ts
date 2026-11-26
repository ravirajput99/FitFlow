import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@fitflow/db';
import type {
  MemberCreate,
  MemberDto,
  MemberListQuery,
  MemberUpdate,
  Paginated,
} from '@fitflow/shared';
import { AuditService } from '../audit/audit.service';
import { TenantDbService } from '../prisma/tenant-db.service';
import { toMemberDto } from './member.mapper';

/**
 * Reference pattern for gym-scoped modules:
 *  - simple reads/writes go through `db.client` (gym scoping is automatic);
 *  - multi-step writes use `db.transaction` and pass `gymId` explicitly;
 *  - every change is written to the audit log.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly db: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  async list(query: MemberListQuery): Promise<Paginated<MemberDto>> {
    const where: Prisma.MemberWhereInput = { deletedAt: null };
    if (query.search) {
      const s = query.search;
      const digits = s.replace(/\D/g, '');
      where.OR = [
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
        { memberCode: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ];
    }

    const [items, total] = await Promise.all([
      this.db.client.member.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.member.count({ where }),
    ]);
    return { items: items.map(toMemberDto), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<MemberDto> {
    return toMemberDto(await this.findActive(id));
  }

  async create(input: MemberCreate): Promise<MemberDto> {
    const gymId = this.db.gymId;
    if (input.branchId) await this.assertBranch(input.branchId);

    const member = await this.db.transaction(async (tx) => {
      // Row lock on the gym serialises member-code allocation.
      const gym = await tx.gym.update({
        where: { id: gymId },
        data: { nextMemberNumber: { increment: 1 } },
        select: { nextMemberNumber: true, memberCodePrefix: true },
      });
      const memberCode = `${gym.memberCodePrefix}${String(gym.nextMemberNumber - 1).padStart(4, '0')}`;
      const created = await tx.member.create({
        data: {
          ...this.toData(input),
          firstName: input.firstName,
          phone: input.phone,
          tags: input.tags,
          gymId,
          memberCode,
        },
      });
      await this.audit.record(
        { action: 'create', entity: 'Member', entityId: created.id, after: created },
        tx,
      );
      return created;
    });
    return toMemberDto(member);
  }

  async update(id: string, input: MemberUpdate): Promise<MemberDto> {
    const before = await this.findActive(id);
    if (input.branchId) await this.assertBranch(input.branchId);

    const after = await this.db.client.member.update({
      where: { id },
      data: { ...this.toData(input), tags: input.tags },
    });
    await this.audit.record({ action: 'update', entity: 'Member', entityId: id, before, after });
    return toMemberDto(after);
  }

  /**
   * Soft delete: invoices and attendance history keep pointing at the member.
   * Their member-app login is switched off and its sessions ended, so a removed member
   * cannot keep using the app on a still-valid refresh token.
   */
  async remove(id: string): Promise<void> {
    const gymId = this.db.gymId;
    const before = await this.findActive(id);
    await this.db.transaction(async (tx) => {
      const now = new Date();
      await tx.member.update({ where: { id, gymId }, data: { deletedAt: now } });
      if (before.userId) {
        // Only MEMBER logins: never disable a staff account through the members screen.
        const disabled = await tx.user.updateMany({
          where: { id: before.userId, gymId, role: { key: 'MEMBER' } },
          data: { isActive: false },
        });
        if (disabled.count) {
          await tx.refreshToken.updateMany({
            where: { userId: before.userId, revokedAt: null },
            data: { revokedAt: now },
          });
        }
      }
      await this.audit.record({ action: 'delete', entity: 'Member', entityId: id, before }, tx);
    });
  }

  private async findActive(id: string) {
    const member = await this.db.client.member.findFirst({ where: { id, deletedAt: null } });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  private async assertBranch(branchId: string) {
    const branch = await this.db.client.branch.findFirst({ where: { id: branchId } });
    if (!branch) throw new BadRequestException('Unknown branch');
  }

  /** Maps validated input to Prisma fields (undefined = leave unchanged, null = clear). */
  private toData(input: MemberUpdate) {
    return {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth
        ? new Date(`${input.dateOfBirth}T00:00:00Z`)
        : input.dateOfBirth,
      address: input.address,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      medicalNotes: input.medicalNotes,
      branchId: input.branchId,
    };
  }
}
