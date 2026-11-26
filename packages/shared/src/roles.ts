import { ALL_PERMISSIONS, PERMISSIONS as P, type Permission } from './permissions';

/** Built-in roles created for every new gym. Gyms can add custom roles on top. */
export const SYSTEM_ROLE_KEYS = ['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER', 'MEMBER'] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export interface RoleTemplate {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: Permission[];
}

export const SYSTEM_ROLES: Record<SystemRoleKey, RoleTemplate> = {
  OWNER: {
    key: 'OWNER',
    name: 'Owner',
    description: 'Full access to the gym, including roles, settings and refunds',
    permissions: ALL_PERMISSIONS,
  },
  MANAGER: {
    key: 'MANAGER',
    name: 'Manager',
    description: 'Runs daily operations; cannot manage roles or gym settings',
    permissions: ALL_PERMISSIONS.filter((p) => p !== P.ROLES_MANAGE && p !== P.SETTINGS_MANAGE),
  },
  RECEPTIONIST: {
    key: 'RECEPTIONIST',
    name: 'Receptionist',
    description: 'Front desk: members, renewals, payments, check-ins and enquiries',
    permissions: [
      P.MEMBERS_READ,
      P.MEMBERS_WRITE,
      P.PLANS_READ,
      P.MEMBERSHIPS_READ,
      P.MEMBERSHIPS_WRITE,
      P.BILLING_READ,
      P.BILLING_WRITE,
      P.ATTENDANCE_READ,
      P.ATTENDANCE_WRITE,
      P.LEADS_READ,
      P.LEADS_WRITE,
    ],
  },
  TRAINER: {
    key: 'TRAINER',
    name: 'Trainer',
    description: 'Sees members and attendance to coach assigned clients',
    permissions: [P.MEMBERS_READ, P.PLANS_READ, P.MEMBERSHIPS_READ, P.ATTENDANCE_READ],
  },
  MEMBER: {
    key: 'MEMBER',
    name: 'Member',
    description: 'Gym member using the mobile app (self-service endpoints only)',
    permissions: [],
  },
};
