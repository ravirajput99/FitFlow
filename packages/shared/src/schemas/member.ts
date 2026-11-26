import { z } from 'zod';
import {
  emptyToNull,
  emptyToUndefined,
  indianMobileSchema,
  isoDateSchema,
  paginationQuerySchema,
} from './common';

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof genderSchema>;

type Mode = 'create' | 'update';

/**
 * Optional field semantics:
 *  - create: blank/null -> not set.
 *  - update (PATCH): missing -> leave unchanged; blank/null -> clear the stored value.
 */
function optional<T extends z.ZodType>(schema: T, mode: Mode) {
  return mode === 'create'
    ? z.preprocess(emptyToUndefined, schema.optional())
    : z.preprocess(emptyToNull, schema.nullable().optional());
}

function memberFields(mode: Mode) {
  return {
    firstName: z.string().trim().min(1, 'First name is required').max(60),
    lastName: optional(z.string().trim().max(60), mode),
    phone: indianMobileSchema,
    email: optional(z.email('Enter a valid email').trim().toLowerCase(), mode),
    gender: optional(genderSchema, mode),
    dateOfBirth: optional(isoDateSchema, mode),
    address: optional(z.string().trim().max(300), mode),
    emergencyContactName: optional(z.string().trim().max(80), mode),
    emergencyContactPhone: optional(indianMobileSchema, mode),
    medicalNotes: optional(z.string().trim().max(1000), mode),
    tags: z.array(z.string().trim().min(1).max(30)).max(20),
    branchId: optional(z.string(), mode),
  };
}

export const memberCreateSchema = z.object({
  ...memberFields('create'),
  tags: memberFields('create').tags.default([]),
});
export type MemberCreateInput = z.input<typeof memberCreateSchema>;
export type MemberCreate = z.output<typeof memberCreateSchema>;

/**
 * Built from the raw fields, not memberCreateSchema.partial(): in Zod 4 `.partial()` still
 * applies defaults, so a PATCH without `tags` would silently clear the member's tags.
 */
export const memberUpdateSchema = z.object(memberFields('update')).partial();
export type MemberUpdateInput = z.input<typeof memberUpdateSchema>;
export type MemberUpdate = z.output<typeof memberUpdateSchema>;

export const memberListQuerySchema = paginationQuerySchema.extend({
  search: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
});
export type MemberListQuery = z.output<typeof memberListQuerySchema>;

/** Member as returned by the API (dates serialised as ISO strings). */
export interface MemberDto {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  medicalNotes: string | null;
  tags: string[];
  branchId: string | null;
  photoUrl: string | null;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}
