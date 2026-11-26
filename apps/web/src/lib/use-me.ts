'use client';

import { useQuery } from '@tanstack/react-query';
import type { AuthUser, Permission } from '@fitflow/shared';
import { api } from './api-client';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<AuthUser>('/auth/me'),
    staleTime: 5 * 60 * 1000,
  });
}

/** UI-only check to hide actions; the API enforces permissions regardless. */
export function useCan() {
  const { data } = useMe();
  return (permission: Permission) => !!data?.permissions.includes(permission);
}
