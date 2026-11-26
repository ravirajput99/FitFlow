import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS, type Permission } from '@fitflow/shared';
import { runWithContext, type RequestContext } from '../common/request-context';
import { PermissionsGuard } from './permissions.guard';

const executionContext = {
  getHandler: () => () => undefined,
  getClass: () => class {},
} as unknown as ExecutionContext;

function check(required: Permission[] | undefined, ctx: RequestContext) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);
  return runWithContext(ctx, () => guard.canActivate(executionContext));
}

describe('PermissionsGuard', () => {
  it('allows routes without requirements', () => {
    expect(check(undefined, {})).toBe(true);
  });

  it('allows when every required permission is granted', () => {
    expect(
      check([PERMISSIONS.MEMBERS_READ], {
        gymId: 'g1',
        permissions: [PERMISSIONS.MEMBERS_READ, PERMISSIONS.MEMBERS_WRITE],
      }),
    ).toBe(true);
  });

  it('rejects when any permission is missing', () => {
    expect(() =>
      check([PERMISSIONS.MEMBERS_READ, PERMISSIONS.MEMBERS_DELETE], {
        gymId: 'g1',
        permissions: [PERMISSIONS.MEMBERS_READ],
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects gym permissions without a gym context (e.g. super-admin)', () => {
    expect(() =>
      check([PERMISSIONS.MEMBERS_READ], {
        gymId: null,
        isSuperAdmin: true,
        permissions: [PERMISSIONS.MEMBERS_READ],
      }),
    ).toThrow(ForbiddenException);
  });
});
