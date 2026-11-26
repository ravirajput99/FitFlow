import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { asSystem } from '@fitflow/db';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  addStaff,
  createGym,
  createTestApp,
  deleteGyms,
  login,
  randomMobile,
  type TestGym,
} from './helpers';

describe('Members + role permissions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gym: TestGym;
  const tokens: Record<'owner' | 'receptionist' | 'trainer', string> = {
    owner: '',
    receptionist: '',
    trainer: '',
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    gym = await createGym(prisma, 'rbac');
    const receptionistEmail = await addStaff(prisma, gym, 'RECEPTIONIST');
    const trainerEmail = await addStaff(prisma, gym, 'TRAINER');
    tokens.owner = (await login(app, gym.slug, gym.ownerEmail)).accessToken;
    tokens.receptionist = (await login(app, gym.slug, receptionistEmail)).accessToken;
    tokens.trainer = (await login(app, gym.slug, trainerEmail)).accessToken;
  });

  afterAll(async () => {
    await deleteGyms(prisma, [gym]);
    await app.close();
  });

  const as = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}` });
  const http = () => request(app.getHttpServer());

  it('validates input with the shared schema', async () => {
    const res = await http()
      .post('/v1/members')
      .set(as('owner'))
      .send({ firstName: '', phone: '12345' })
      .expect(400);
    const paths = res.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['firstName', 'phone']));
  });

  it('receptionist can add and edit members but not delete them', async () => {
    const created = await http()
      .post('/v1/members')
      .set(as('receptionist'))
      .send({ firstName: 'Riya', phone: randomMobile(), tags: ['evening'] })
      .expect(201);
    const id = created.body.id as string;

    const updated = await http()
      .patch(`/v1/members/${id}`)
      .set(as('receptionist'))
      .send({ lastName: 'Kapoor' })
      .expect(200);
    expect(updated.body.fullName).toBe('Riya Kapoor');
    expect(updated.body.tags).toEqual(['evening']); // PATCH keeps fields it did not send

    await http().delete(`/v1/members/${id}`).set(as('receptionist')).expect(403);
  });

  it('PATCH clears a field sent blank and keeps fields not sent', async () => {
    const created = await http()
      .post('/v1/members')
      .set(as('owner'))
      .send({
        firstName: 'Clear',
        phone: randomMobile(),
        email: 'clear@example.com',
        dateOfBirth: '1990-01-31',
      })
      .expect(201);
    expect(created.body.dateOfBirth).toBe('1990-01-31');

    const updated = await http()
      .patch(`/v1/members/${created.body.id}`)
      .set(as('owner'))
      .send({ email: '' })
      .expect(200);
    expect(updated.body.email).toBeNull();
    expect(updated.body.dateOfBirth).toBe('1990-01-31');
  });

  it('trainer can read members but not create them', async () => {
    await http().get('/v1/members').set(as('trainer')).expect(200);
    await http()
      .post('/v1/members')
      .set(as('trainer'))
      .send({ firstName: 'Nope', phone: randomMobile() })
      .expect(403);
  });

  it('owner can soft-delete; deleted members disappear from the API', async () => {
    const created = await http()
      .post('/v1/members')
      .set(as('owner'))
      .send({ firstName: 'Temp', phone: randomMobile() })
      .expect(201);
    const id = created.body.id as string;
    await http().delete(`/v1/members/${id}`).set(as('owner')).expect(204);
    await http().get(`/v1/members/${id}`).set(as('owner')).expect(404);

    const row = await asSystem(prisma).member.findUnique({ where: { id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it('searches by name and phone', async () => {
    const phone = randomMobile();
    await http()
      .post('/v1/members')
      .set(as('owner'))
      .send({ firstName: 'Zoravar', phone })
      .expect(201);
    const byName = await http().get('/v1/members?search=zorav').set(as('owner')).expect(200);
    expect(byName.body.items.map((m: { firstName: string }) => m.firstName)).toContain('Zoravar');
    const byPhone = await http()
      .get(`/v1/members?search=${phone.slice(-6)}`)
      .set(as('owner'))
      .expect(200);
    expect(byPhone.body.total).toBeGreaterThanOrEqual(1);
  });

  it('writes an audit log entry for every change', async () => {
    const logs = await asSystem(prisma).auditLog.findMany({
      where: { gymId: gym.id, entity: 'Member' },
    });
    const actions = new Set(logs.map((l) => l.action));
    expect(actions).toEqual(new Set(['create', 'update', 'delete']));
    expect(logs.every((l) => l.actorUserId)).toBe(true);
  });
});
