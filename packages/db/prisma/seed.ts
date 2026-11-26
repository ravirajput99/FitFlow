/**
 * Development seed: a super-admin, one demo gym with staff, plans and members.
 * Safe to run more than once - it skips anything that already exists.
 *
 *   pnpm db:seed
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { asSystem, provisionGym, systemTransaction } from '../src';

const prisma = new PrismaClient();
const db = asSystem(prisma);

const DEMO = {
  slug: 'demo',
  name: 'FitFlow Demo Gym',
  city: 'Pune',
  state: 'Maharashtra',
  gstStateCode: '27',
  password: 'Demo@1234',
};

const SUPER_ADMIN = { email: 'admin@fitflow.local', password: 'ChangeMe@123' };

const PLANS = [
  { name: 'Monthly', durationDays: 30, pricePaise: 1_500_00 },
  { name: 'Quarterly', durationDays: 90, pricePaise: 4_000_00 },
  { name: 'Half-yearly', durationDays: 180, pricePaise: 7_000_00 },
  { name: 'Annual', durationDays: 365, pricePaise: 12_000_00 },
];

const MEMBERS = [
  { firstName: 'Aarav', lastName: 'Sharma', phone: '+919811000001', gender: 'MALE' },
  { firstName: 'Diya', lastName: 'Patel', phone: '+919811000002', gender: 'FEMALE' },
  { firstName: 'Kabir', lastName: 'Mehta', phone: '+919811000003', gender: 'MALE' },
  { firstName: 'Ananya', lastName: 'Iyer', phone: '+919811000004', gender: 'FEMALE' },
  { firstName: 'Rohan', lastName: 'Deshmukh', phone: '+919811000005', gender: 'MALE' },
  { firstName: 'Ishita', lastName: 'Rao', phone: '+919811000006', gender: 'FEMALE' },
  { firstName: 'Vivaan', lastName: 'Kulkarni', phone: '+919811000007', gender: 'MALE' },
  { firstName: 'Meera', lastName: 'Nair', phone: '+919811000008', gender: 'FEMALE' },
] as const;

const DAY = 24 * 60 * 60 * 1000;

async function seedSuperAdmin() {
  const existing = await db.user.findFirst({
    where: { email: SUPER_ADMIN.email, gymId: null },
  });
  if (existing) return;
  await db.user.create({
    data: {
      name: 'FitFlow Admin',
      email: SUPER_ADMIN.email,
      passwordHash: await bcrypt.hash(SUPER_ADMIN.password, 10),
      isSuperAdmin: true,
    },
  });
  console.log(`Super-admin created: ${SUPER_ADMIN.email} / ${SUPER_ADMIN.password}`);
}

async function seedDemoGym() {
  if (await db.gym.findUnique({ where: { slug: DEMO.slug } })) {
    console.log(`Gym "${DEMO.slug}" already exists - skipping demo data.`);
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO.password, 10);
  const { gym } = await provisionGym(prisma, {
    slug: DEMO.slug,
    name: DEMO.name,
    city: DEMO.city,
    state: DEMO.state,
    gstStateCode: DEMO.gstStateCode,
    owner: {
      name: 'Demo Owner',
      email: 'owner@demo.fitflow.local',
      phone: '+919800000001',
      passwordHash,
    },
  });

  await systemTransaction(prisma, async (tx) => {
    const receptionist = await tx.role.findUniqueOrThrow({
      where: { gymId_key: { gymId: gym.id, key: 'RECEPTIONIST' } },
    });
    await tx.user.create({
      data: {
        gymId: gym.id,
        roleId: receptionist.id,
        name: 'Front Desk',
        email: 'frontdesk@demo.fitflow.local',
        phone: '+919800000002',
        passwordHash,
      },
    });

    await tx.plan.createMany({
      data: PLANS.map((p) => ({ ...p, gymId: gym.id, joiningFeePaise: 500_00 })),
    });
    const plans = await tx.plan.findMany({
      where: { gymId: gym.id },
      orderBy: { durationDays: 'asc' },
    });
    const branch = await tx.branch.findFirstOrThrow({ where: { gymId: gym.id } });

    const today = new Date();
    for (const [i, m] of MEMBERS.entries()) {
      const plan = plans[i % plans.length]!;
      const memberCode = `${gym.memberCodePrefix}${String(i + 1).padStart(4, '0')}`;
      // Spread start dates so some memberships are active and some have expired.
      const start = new Date(today.getTime() - (i * 20 + 5) * DAY);
      const end = new Date(start.getTime() + plan.durationDays * DAY);
      await tx.member.create({
        data: {
          ...m,
          gymId: gym.id,
          branchId: branch.id,
          memberCode,
          tags: i % 3 === 0 ? ['morning'] : [],
          joinedAt: start,
          memberships: {
            create: {
              gymId: gym.id,
              planId: plan.id,
              startDate: start,
              endDate: end,
              pricePaise: plan.pricePaise,
              status: end < today ? 'EXPIRED' : 'ACTIVE',
            },
          },
        },
      });
    }
    await tx.gym.update({
      where: { id: gym.id },
      data: { nextMemberNumber: MEMBERS.length + 1 },
    });
  });

  console.log(`Demo gym created. Log in with gym "${DEMO.slug}":`);
  console.log(`  owner@demo.fitflow.local / ${DEMO.password}  (Owner)`);
  console.log(`  frontdesk@demo.fitflow.local / ${DEMO.password}  (Receptionist)`);
}

async function main() {
  // The seed creates logins with well-known passwords. Never run it against production.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== 'yes') {
    throw new Error('Refusing to seed demo accounts with NODE_ENV=production.');
  }
  await seedSuperAdmin();
  await seedDemoGym();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
