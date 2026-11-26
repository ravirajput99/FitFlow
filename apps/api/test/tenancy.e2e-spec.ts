import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { forTenant, tenantTransaction } from '@fitflow/db';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createGym, createTestApp, deleteGyms, login, randomMobile, type TestGym } from './helpers';

describe('Tenant isolation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gymA: TestGym;
  let gymB: TestGym;
  let tokenA: string;
  let tokenB: string;
  let memberAId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    gymA = await createGym(prisma, 'a');
    gymB = await createGym(prisma, 'b');
    tokenA = (await login(app, gymA.slug, gymA.ownerEmail)).accessToken;
    tokenB = (await login(app, gymB.slug, gymB.ownerEmail)).accessToken;

    const res = await request(app.getHttpServer())
      .post('/v1/members')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ firstName: 'Only', lastName: 'InGymA', phone: randomMobile() })
      .expect(201);
    memberAId = res.body.id;
    expect(res.body.memberCode).toBe('M0001');
  });

  afterAll(async () => {
    await deleteGyms(prisma, [gymA, gymB]);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('API level', () => {
    it('gym A sees its own member', async () => {
      await http()
        .get(`/v1/members/${memberAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const list = await http()
        .get('/v1/members')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(list.body.total).toBe(1);
    });

    it("gym B cannot read, list, edit or delete gym A's member", async () => {
      const auth = { Authorization: `Bearer ${tokenB}` };
      await http().get(`/v1/members/${memberAId}`).set(auth).expect(404);
      await http()
        .patch(`/v1/members/${memberAId}`)
        .set(auth)
        .send({ firstName: 'Hacked' })
        .expect(404);
      await http().delete(`/v1/members/${memberAId}`).set(auth).expect(404);
      const list = await http().get('/v1/members').set(auth).expect(200);
      expect(list.body.total).toBe(0);
    });

    it("gym A's member is unchanged", async () => {
      const res = await http()
        .get(`/v1/members/${memberAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.firstName).toBe('Only');
    });

    it('member codes are numbered per gym', async () => {
      const res = await http()
        .post('/v1/members')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ firstName: 'First', phone: randomMobile() })
        .expect(201);
      expect(res.body.memberCode).toBe('M0001');
    });
  });

  describe('Database level (row-level security)', () => {
    it('the test database role is subject to RLS', async () => {
      const [role] = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
        SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
      // If this fails, DATABASE_URL uses a superuser and the RLS tests below prove nothing.
      expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    });

    it("raw SQL in gym B's context cannot see gym A's rows", async () => {
      const rows = await tenantTransaction(
        prisma,
        gymB.id,
        (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Member" WHERE id = ${memberAId}`,
      );
      expect(rows).toEqual([]);
      const own = await tenantTransaction(
        prisma,
        gymA.id,
        (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Member" WHERE id = ${memberAId}`,
      );
      expect(own).toHaveLength(1);
    });

    it("raw SQL in gym B's context cannot write rows into gym A", async () => {
      await expect(
        tenantTransaction(
          prisma,
          gymB.id,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "Member" (id, "gymId", "memberCode", "firstName", phone, tags, "updatedAt")
            VALUES ('rls-test', ${gymA.id}, 'X1', 'Sneaky', '+919999999999', '{}', now())`,
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('queries with no gym context return nothing (fails closed)', async () => {
      const rows = await prisma.member.findMany({ where: { id: memberAId } });
      expect(rows).toEqual([]);
    });

    it('the tenant client refuses to target another gym explicitly', async () => {
      const dbB = forTenant(prisma, gymB.id);
      await expect(dbB.member.findMany({ where: { gymId: gymA.id } })).rejects.toThrow(
        /another gym/,
      );
    });
  });
});
