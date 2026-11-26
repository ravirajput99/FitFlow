import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TenantViolationError, scopeArgs } from './tenancy';

test('adds gymId to where clauses', () => {
  const args = scopeArgs('Member', 'findMany', { where: { firstName: 'A' } }, 'g1');
  assert.deepEqual(args.where, { firstName: 'A', gymId: 'g1' });
});

test('adds a where clause when there is none', () => {
  assert.deepEqual(scopeArgs('Member', 'count', {}, 'g1').where, { gymId: 'g1' });
});

test('stamps gymId on created rows, including createMany arrays', () => {
  const one = scopeArgs('Member', 'create', { data: { firstName: 'A' } }, 'g1');
  assert.deepEqual(one.data, { firstName: 'A', gymId: 'g1' });

  const many = scopeArgs('Plan', 'createMany', { data: [{ name: 'x' }, { name: 'y' }] }, 'g1');
  assert.deepEqual(many.data, [
    { name: 'x', gymId: 'g1' },
    { name: 'y', gymId: 'g1' },
  ]);
});

test('scopes both sides of an upsert', () => {
  const args = scopeArgs('Plan', 'upsert', { where: { id: 'p' }, create: { name: 'x' } }, 'g1');
  assert.deepEqual(args.where, { id: 'p', gymId: 'g1' });
  assert.deepEqual(args.create, { name: 'x', gymId: 'g1' });
});

test('refuses explicit access to another gym', () => {
  assert.throws(
    () => scopeArgs('Member', 'findFirst', { where: { gymId: 'g2' } }, 'g1'),
    TenantViolationError,
  );
  assert.throws(
    () => scopeArgs('Member', 'create', { data: { gymId: 'g2' } }, 'g1'),
    TenantViolationError,
  );
});
