import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_ROLES,
  memberCreateSchema,
  memberUpdateSchema,
  normalizeIndianMobile,
} from './index';

test('normalizeIndianMobile accepts common formats', () => {
  for (const input of ['9876543210', '+91 98765 43210', '09876543210', '919876543210']) {
    assert.equal(normalizeIndianMobile(input), '+919876543210');
  }
});

test('normalizeIndianMobile rejects invalid numbers', () => {
  for (const input of ['12345', '5876543210', '+1 415 555 0100', '']) {
    assert.equal(normalizeIndianMobile(input), null);
  }
});

test('memberCreateSchema normalises phone and drops empty optional fields', () => {
  const parsed = memberCreateSchema.parse({
    firstName: ' Asha ',
    phone: '98765 43210',
    email: '',
    gender: '',
    dateOfBirth: '1995-04-12',
  });
  assert.equal(parsed.firstName, 'Asha');
  assert.equal(parsed.phone, '+919876543210');
  assert.equal(parsed.email, undefined);
  assert.equal(parsed.gender, undefined);
  assert.deepEqual(parsed.tags, []);
});

test('memberUpdateSchema leaves omitted fields undefined (no defaults on PATCH)', () => {
  const parsed = memberUpdateSchema.parse({ firstName: 'Asha' });
  assert.deepEqual(parsed, { firstName: 'Asha' });
});

test('memberUpdateSchema turns blank optional fields into null so PATCH can clear them', () => {
  const parsed = memberUpdateSchema.parse({ email: '', gender: '', dateOfBirth: null });
  assert.deepEqual(parsed, { email: null, gender: null, dateOfBirth: null });
});

test('memberUpdateSchema still rejects a blank required field', () => {
  assert.equal(memberUpdateSchema.safeParse({ firstName: '' }).success, false);
  assert.equal(memberUpdateSchema.safeParse({ phone: '' }).success, false);
});

test('memberCreateSchema rejects a bad phone', () => {
  const result = memberCreateSchema.safeParse({ firstName: 'A', phone: '123' });
  assert.equal(result.success, false);
});

test('system roles only use known permissions; owner has all of them', () => {
  for (const role of Object.values(SYSTEM_ROLES)) {
    for (const p of role.permissions) assert.ok(ALL_PERMISSIONS.includes(p), `${role.key}: ${p}`);
  }
  assert.deepEqual(SYSTEM_ROLES.OWNER.permissions, ALL_PERMISSIONS);
  assert.ok(!SYSTEM_ROLES.RECEPTIONIST.permissions.includes(PERMISSIONS.MEMBERS_DELETE));
});
