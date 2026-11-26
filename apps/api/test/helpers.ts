import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { asSystem, provisionGym, type PrismaClient } from '@fitflow/db';
import type { LoginResponse, SystemRoleKey } from '@fitflow/shared';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { OtpSender } from '../src/auth/otp-sender';
import { PrismaService } from '../src/prisma/prisma.service';

export const PASSWORD = 'Test@12345';

/** Captures OTP codes instead of sending them. */
export class CapturingOtpSender extends OtpSender {
  readonly codes = new Map<string, string>();
  async send(phone: string, code: string) {
    this.codes.set(phone, code);
  }
}

export async function createTestApp() {
  const otp = new CapturingOtpSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(OtpSender)
    .useValue(otp)
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: ['error'] }));
  await app.init();
  return { app, prisma: app.get(PrismaService), otp };
}

export interface TestGym {
  id: string;
  slug: string;
  ownerEmail: string;
}

export async function createGym(prisma: PrismaClient, label: string): Promise<TestGym> {
  const slug = `t-${label}-${randomUUID().slice(0, 8)}`;
  const { gym } = await provisionGym(prisma, {
    slug,
    name: `Test gym ${label}`,
    owner: {
      name: 'Owner',
      email: `owner@${slug}.test`,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    },
  });
  return { id: gym.id, slug, ownerEmail: `owner@${slug}.test` };
}

export async function addStaff(prisma: PrismaClient, gym: TestGym, roleKey: SystemRoleKey) {
  const db = asSystem(prisma);
  const role = await db.role.findUniqueOrThrow({
    where: { gymId_key: { gymId: gym.id, key: roleKey } },
  });
  const email = `${roleKey.toLowerCase()}@${gym.slug}.test`;
  await db.user.create({
    data: {
      gymId: gym.id,
      roleId: role.id,
      name: roleKey,
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    },
  });
  return email;
}

export async function login(
  app: INestApplication,
  gymSlug: string,
  email: string,
): Promise<LoginResponse> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ gymSlug, email, password: PASSWORD })
    .expect(200);
  return res.body as LoginResponse;
}

export async function deleteGyms(prisma: PrismaClient, gyms: TestGym[]) {
  await asSystem(prisma).gym.deleteMany({ where: { id: { in: gyms.map((g) => g.id) } } });
}

/** Random valid Indian mobile, so parallel/re-run tests never collide. */
export function randomMobile(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
}
