import { z } from 'zod';
import { normalizeIndianMobile } from '../phone';

const isBlank = (v: unknown) => v === null || (typeof v === 'string' && v.trim() === '');

/** HTML forms send "" for empty optional fields; treat that (and null) as "not provided". */
export const emptyToUndefined = (v: unknown) => (isBlank(v) ? undefined : v);

/** For PATCH: a blank field means "clear this value". */
export const emptyToNull = (v: unknown) => (isBlank(v) ? null : v);

export const indianMobileSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizeIndianMobile(v);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number' });
      return z.NEVER;
    }
    return normalized;
  });

export const gymSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3-40 lowercase letters, numbers or dashes');

export const isoDateSchema = z.iso.date();

export const paginationQuerySchema = z.object({
  // Capped: a huge page means a huge OFFSET, which makes Postgres scan the whole table.
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
