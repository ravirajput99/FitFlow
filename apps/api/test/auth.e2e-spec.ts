import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PERMISSIONS } from '@fitflow/shared';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  CapturingOtpSender,
  PASSWORD,
  createGym,
  createTestApp,
  deleteGyms,
  login,
  randomMobile,
  type TestGym,
} from './helpers';

describe('Auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let otp: CapturingOtpSender;
  let gym: TestGym;

  beforeAll(async () => {
    ({ app, prisma, otp } = await createTestApp());
    gym = await createGym(prisma, 'auth');
  });

  afterAll(async () => {
    await deleteGyms(prisma, [gym]);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('reports health', async () => {
    await http().get('/health').expect(200, { status: 'ok', db: 'up' });
  });

  it('logs in an owner with all permissions', async () => {
    const res = await login(app, gym.slug, gym.ownerEmail);
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toContain('.');
    expect(res.user.roleKey).toBe('OWNER');
    expect(res.user.gymSlug).toBe(gym.slug);
    expect(res.user.permissions).toContain(PERMISSIONS.ROLES_MANAGE);
  });

  it('rejects a wrong password and an unknown gym with the same message', async () => {
    const wrongPassword = await http()
      .post('/v1/auth/login')
      .send({ gymSlug: gym.slug, email: gym.ownerEmail, password: 'Wrong@12345' })
      .expect(401);
    const wrongGym = await http()
      .post('/v1/auth/login')
      .send({ gymSlug: 'no-such-gym', email: gym.ownerEmail, password: PASSWORD })
      .expect(401);
    expect(wrongPassword.body.message).toBe(wrongGym.body.message);
  });

  it('protects routes and returns the current user', async () => {
    await http().get('/v1/auth/me').expect(401);
    await http().get('/v1/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    const { accessToken } = await login(app, gym.slug, gym.ownerEmail);
    const me = await http()
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(gym.ownerEmail);
  });

  it('rotates refresh tokens and revokes everything when an old one is reused', async () => {
    const first = await login(app, gym.slug, gym.ownerEmail);

    const second = await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    expect(second.body.refreshToken).not.toBe(first.refreshToken);

    // Reusing the rotated token = theft signal: rejected, and the new token dies too.
    await http().post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: second.body.refreshToken })
      .expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const session = await login(app, gym.slug, gym.ownerEmail);
    await http().post('/v1/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
    await http().post('/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
  });

  it('lets a member log in with an OTP, with member-only permissions', async () => {
    const owner = await login(app, gym.slug, gym.ownerEmail);
    const phone = randomMobile();
    await http()
      .post('/v1/members')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ firstName: 'Otp', lastName: 'Member', phone })
      .expect(201);

    await http().post('/v1/auth/otp/request').send({ gymSlug: gym.slug, phone }).expect(202);
    const e164 = `+91${phone}`;
    const code = otp.codes.get(e164);
    expect(code).toMatch(/^\d{6}$/);

    const wrong = code === '000000' ? '111111' : '000000';
    await http()
      .post('/v1/auth/otp/verify')
      .send({ gymSlug: gym.slug, phone, code: wrong })
      .expect(401);

    const ok = await http()
      .post('/v1/auth/otp/verify')
      .send({ gymSlug: gym.slug, phone, code })
      .expect(200);
    expect(ok.body.user.roleKey).toBe('MEMBER');
    expect(ok.body.user.name).toBe('Otp Member');

    // A code works once.
    await http().post('/v1/auth/otp/verify').send({ gymSlug: gym.slug, phone, code }).expect(401);

    // Members cannot use staff endpoints.
    await http()
      .get('/v1/members')
      .set('Authorization', `Bearer ${ok.body.accessToken}`)
      .expect(403);
  });

  it('does not send a code to unknown numbers but answers the same way', async () => {
    const phone = randomMobile();
    await http().post('/v1/auth/otp/request').send({ gymSlug: gym.slug, phone }).expect(202);
    expect(otp.codes.has(`+91${phone}`)).toBe(false);
  });
});
