import type { Member } from '@fitflow/db';
import type { MemberDto } from '@fitflow/shared';

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function toMemberDto(m: Member): MemberDto {
  return {
    id: m.id,
    memberCode: m.memberCode,
    firstName: m.firstName,
    lastName: m.lastName,
    fullName: [m.firstName, m.lastName].filter(Boolean).join(' '),
    phone: m.phone,
    email: m.email,
    gender: m.gender,
    dateOfBirth: dateOnly(m.dateOfBirth),
    address: m.address,
    emergencyContactName: m.emergencyContactName,
    emergencyContactPhone: m.emergencyContactPhone,
    medicalNotes: m.medicalNotes,
    tags: m.tags,
    branchId: m.branchId,
    photoUrl: m.photoUrl,
    joinedAt: m.joinedAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}
