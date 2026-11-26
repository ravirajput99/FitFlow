import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@fitflow/shared';

export const IS_PUBLIC_KEY = 'fitflow:isPublic';
export const PERMISSIONS_KEY = 'fitflow:permissions';

/** Route needs no login (health check, login itself). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Caller must hold ALL listed permissions within their gym. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
