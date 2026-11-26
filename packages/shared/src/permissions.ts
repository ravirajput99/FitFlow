/**
 * Permission catalog. Roles store a list of these keys; the API checks them with
 * @RequirePermissions() and the web app uses them to hide actions a user cannot take.
 * Add new keys as modules are built. Never rename an existing key: it is stored in the DB.
 */
export const PERMISSIONS = {
  MEMBERS_READ: 'members.read',
  MEMBERS_WRITE: 'members.write',
  MEMBERS_DELETE: 'members.delete',
  PLANS_READ: 'plans.read',
  PLANS_WRITE: 'plans.write',
  MEMBERSHIPS_READ: 'memberships.read',
  MEMBERSHIPS_WRITE: 'memberships.write',
  BILLING_READ: 'billing.read',
  BILLING_WRITE: 'billing.write',
  BILLING_REFUND: 'billing.refund',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_WRITE: 'attendance.write',
  LEADS_READ: 'leads.read',
  LEADS_WRITE: 'leads.write',
  REPORTS_READ: 'reports.read',
  STAFF_READ: 'staff.read',
  STAFF_WRITE: 'staff.write',
  ROLES_MANAGE: 'roles.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_READ: 'audit.read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}
