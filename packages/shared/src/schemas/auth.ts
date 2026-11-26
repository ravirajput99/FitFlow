import { z } from 'zod';
import { emptyToUndefined, gymSlugSchema, indianMobileSchema } from './common';
import type { Permission } from '../permissions';

export const loginSchema = z.object({
  /** Omitted only by FitFlow super-admins. Staff always log in to a specific gym. */
  gymSlug: z.preprocess(emptyToUndefined, gymSlugSchema.optional()),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export type LoginInput = z.input<typeof loginSchema>;

export const otpRequestSchema = z.object({
  gymSlug: gymSlugSchema,
  phone: indianMobileSchema,
});
export type OtpRequestInput = z.input<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  gymSlug: gymSlugSchema,
  phone: indianMobileSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type OtpVerifyInput = z.input<typeof otpVerifySchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.input<typeof refreshSchema>;

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  gymId: string | null;
  gymSlug: string | null;
  gymName: string | null;
  roleKey: string | null;
  permissions: Permission[];
  isSuperAdmin: boolean;
}

export interface AuthTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}
