import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { asSystem } from '@fitflow/db';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  CapturingOtpSender,
  PASSWORD,
  addStaff,
  createGym,
  createTestApp,
  deleteGyms,
  login,
  randomMobile,
  type TestGym,
} from './helpers';

/** Abuse protections: lockout, OTP limits, removed members, client IP, paging bounds. */
describe('Security', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let otp: CapturingOtpSender;
  let gym: TestGym;

  beforeAll(async () => {
    ({ app, prisma, otp } = await createTestApp());
    gym = await createGym(prisma, 'sec');
  });

  afterAll(async () => {
    await deleteGyms(prisma, [gym]);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const db = () => asSystem(prisma);

  async function addMember(phone: string) {
    const owner = await login(app, gym.slug, gym.ownerEmail);
    const res = await http()
      .post('/v1/members')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ firstName: 'Sec', phone })
      .expect(201);
    return { owner, memberId: res.body.id as string };
  }

  it('locks an account after 5 wrong passwords, even with the right one', async () => {
    const email = await addStaff(prisma, gym, 'RECEPTIONIST');
    for (let i = 0; i < 5; i++) {
      await http()
        .post('/v1/auth/login')
        .send({ gymSlug: gym.slug, email, password: 'Wrong@12345' })
        .expect(401);
    }
    await http()
      .post('/v1/auth/login')
      .send({ gymSlug: gym.slug, email, password: PASSWORD })
      .expect(429);

    // When the lock expires the right password works and the counter starts again.
    await db().user.updateMany({ where: { gymId: gym.id, email }, data: { lockedUntil: null } });
    await login(app, gym.slug, email);
    const user = await db().user.findFirstOrThrow({ where: { gymId: gym.id, email } });
    expect(user.failedLoginCount).toBe(0);
  });

  it('does not let owners log in with only an SMS code, but lets trainers', async () => {
    const ownerPhone = `+91${randomMobile()}`;
    await db().user.updateMany({
      where: { gymId: gym.id, email: gym.ownerEmail },
      data: { phone: ownerPhone },
    });
    await http()
      .post('/v1/auth/otp/request')
      .send({ gymSlug: gym.slug, phone: ownerPhone.slice(3) })
      .expect(202);
    expect(otp.codes.has(ownerPhone)).toBe(false);

    const trainerEmail = await addStaff(prisma, gym, 'TRAINER');
    const trainerPhone = `+91${randomMobile()}`;
    await db().user.updateMany({
      where: { gymId: gym.id, email: trainerEmail },
      data: { phone: trainerPhone },
    });
    await http()
      .post('/v1/auth/otp/request')
      .send({ gymSlug: gym.slug, phone: trainerPhone.slice(3) })
      .expect(202);
    const code = otp.codes.get(trainerPhone);
    const res = await http()
      .post('/v1/auth/otp/verify')
      .send({ gymSlug: gym.slug, phone: trainerPhone.slice(3), code })
      .expect(200);
    expect(res.body.user.roleKey).toBe('TRAINER');
  });

  it('caps OTP guesses at 5 even when they arrive in parallel', async () => {
    const phone = randomMobile();
    await addMember(phone);
    await http().post('/v1/auth/otp/request').send({ gymSlug: gym.slug, phone }).expect(202);
    const code = otp.codes.get(`+91${phone}`)!;
    const wrong = code === '000000' ? '111111' : '000000';

    const guesses = await Promise.all(
      Array.from({ length: 10 }, () =>
        http().post('/v1/auth/otp/verify').send({ gymSlug: gym.slug, phone, code: wrong }),
      ),
    );
    expect(guesses.every((r) => r.status === 401)).toBe(true);
    // The real code no longer works: every attempt slot has been used.
    await http().post('/v1/auth/otp/verify').send({ gymSlug: gym.slug, phone, code }).expect(401);
  });

  it('ends the app login of a member who is removed', async () => {
    const phone = randomMobile();
    const { owner, memberId } = await addMember(phone);
    await http().post('/v1/auth/otp/request').send({ gymSlug: gym.slug, phone }).expect(202);
    const session = await http()
      .post('/v1/auth/otp/verify')
      .send({ gymSlug: gym.slug, phone, code: otp.codes.get(`+91${phone}`) })
      .expect(200);

    await http()
      .delete(`/v1/members/${memberId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);

    await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: session.body.refreshToken })
      .expect(401);
    otp.codes.delete(`+91${phone}`);
    await http().post('/v1/auth/otp/request').send({ gymSlug: gym.slug, phone }).expect(202);
    expect(otp.codes.has(`+91${phone}`)).toBe(false);
  });

  it('records the client IP forwarded by the web proxy', async () => {
    const res = await http()
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ gymSlug: gym.slug, email: gym.ownerEmail, password: PASSWORD })
      .expect(200);
    const tokenId = (res.body.refreshToken as string).split('.')[0]!;
    const row = await db().refreshToken.findUniqueOrThrow({ where: { id: tokenId } });
    expect(row.ip).toBe('203.0.113.9');
  });

  it('rejects absurd page numbers', async () => {
    const owner = await login(app, gym.slug, gym.ownerEmail);
    await http()
      .get('/v1/members?page=1000000')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(400);
  });
});
