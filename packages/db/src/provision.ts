import { type Gym, type PrismaClient, type User } from '@prisma/client';
import { SYSTEM_ROLES, SYSTEM_ROLE_KEYS } from '@fitflow/shared';
import { systemTransaction } from './tenancy';

export interface ProvisionGymInput {
  slug: string;
  name: string;
  city?: string;
  state?: string;
  gstStateCode?: string;
  branchName?: string;
  owner: {
    name: string;
    email: string;
    phone?: string;
    /** bcrypt hash; hashing stays in the caller so this package has no crypto policy. */
    passwordHash: string;
  };
}

/**
 * Creates a gym with its system roles, a first branch and the owner account, atomically.
 * Used by the seed script, tests and (later) self-serve signup and the super-admin console.
 */
export function provisionGym(
  prisma: PrismaClient,
  input: ProvisionGymInput,
): Promise<{ gym: Gym; owner: User }> {
  return systemTransaction(prisma, async (tx) => {
    const gym = await tx.gym.create({
      data: {
        slug: input.slug,
        name: input.name,
        city: input.city,
        state: input.state,
        gstStateCode: input.gstStateCode,
      },
    });

    await tx.role.createMany({
      data: SYSTEM_ROLE_KEYS.map((key) => ({
        gymId: gym.id,
        key,
        name: SYSTEM_ROLES[key].name,
        description: SYSTEM_ROLES[key].description,
        permissions: SYSTEM_ROLES[key].permissions,
        isSystem: true,
      })),
    });

    await tx.branch.create({
      data: { gymId: gym.id, name: input.branchName ?? 'Main', city: input.city },
    });

    const ownerRole = await tx.role.findUniqueOrThrow({
      where: { gymId_key: { gymId: gym.id, key: 'OWNER' } },
    });

    const owner = await tx.user.create({
      data: {
        gymId: gym.id,
        roleId: ownerRole.id,
        name: input.owner.name,
        email: input.owner.email.toLowerCase(),
        phone: input.owner.phone,
        passwordHash: input.owner.passwordHash,
      },
    });

    return { gym, owner };
  });
}
