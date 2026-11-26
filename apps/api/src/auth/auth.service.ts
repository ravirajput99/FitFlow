import { createHash, randomInt } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { z } from 'zod';
import { systemTransaction, type Member } from '@fitflow/db';
import type {
  AuthUser,
  LoginResponse,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  SystemRoleKey,
} from '@fitflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OtpSender } from './otp-sender';
import { TokensService, toAuthUser, type ClientMeta, type UserWithRole } from './tokens.service';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 5;

/** Wrong passwords allowed before the account is locked, and for how long. */
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

/**
 * Roles that may log in with a phone code alone. Owners, managers and front-desk staff
 * can see the whole gym, so they must use their password (SMS can be SIM-swapped).
 */
const OTP_LOGIN_ROLES: ReadonlySet<string> = new Set<SystemRoleKey>(['MEMBER', 'TRAINER']);

// Compared against when the user does not exist, so response time does not reveal
// which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('fitflow-timing-equaliser', 10);

const hashOtp = (gymId: string, phone: string, code: string) =>
  createHash('sha256').update(`${gymId}:${phone}:${code}`).digest('hex');

const USER_INCLUDE = { role: true, gym: true } as const;

/** Who a phone number logs in as: an existing user, or a member who has no login yet. */
type OtpAccount = { user: UserWithRole } | { member: Member };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly otpSender: OtpSender,
  ) {}

  private get db() {
    return this.prisma.system;
  }

  async login(input: z.output<typeof loginSchema>, meta: ClientMeta): Promise<LoginResponse> {
    let user: UserWithRole | null = null;

    if (input.gymSlug) {
      const gym = await this.activeGym(input.gymSlug);
      if (gym) {
        user = await this.db.user.findUnique({
          where: { gymId_email: { gymId: gym.id, email: input.email } },
          include: USER_INCLUDE,
        });
      }
    } else {
      user = await this.db.user.findFirst({
        where: { gymId: null, email: input.email, isSuperAdmin: true },
        include: USER_INCLUDE,
      });
    }

    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        'Too many failed attempts. Try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (user && user.passwordHash && !ok) await this.recordFailedLogin(user.id);
    if (!user || !user.passwordHash || !ok || !user.isActive) {
      throw new UnauthorizedException('Invalid gym, email or password');
    }
    return this.completeLogin(user, meta);
  }

  /**
   * Per-account brute-force protection. Works even when an attacker spreads guesses over
   * many IPs, which the per-IP rate limit alone cannot stop.
   */
  private async recordFailedLogin(userId: string) {
    const { failedLoginCount } = await this.db.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount >= LOGIN_MAX_FAILURES) {
      await this.db.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOGIN_LOCK_MS) },
      });
    }
  }

  /** Sends a login code. Always answers the same way so phone numbers cannot be probed. */
  async requestOtp(input: z.output<typeof otpRequestSchema>): Promise<void> {
    const gym = await this.activeGym(input.gymSlug);
    if (!gym) return;
    if (!(await this.otpAccount(gym.id, input.phone))) return;

    const recent = await this.db.otpCode.count({
      where: {
        gymId: gym.id,
        phone: input.phone,
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recent >= OTP_MAX_PER_HOUR) {
      throw new HttpException(
        'Too many codes requested. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.otpCode.create({
      data: {
        gymId: gym.id,
        phone: input.phone,
        codeHash: hashOtp(gym.id, input.phone, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    await this.otpSender.send(input.phone, code);
  }

  async verifyOtp(
    input: z.output<typeof otpVerifySchema>,
    meta: ClientMeta,
  ): Promise<LoginResponse> {
    const invalid = new UnauthorizedException('Invalid or expired code');
    const gym = await this.activeGym(input.gymSlug);
    if (!gym) throw invalid;

    const otp = await this.db.otpCode.findFirst({
      where: { gymId: gym.id, phone: input.phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw invalid;

    // Take an attempt slot atomically *before* comparing, so parallel guesses cannot
    // all slip in under the limit.
    const slot = await this.db.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (slot.count !== 1) throw invalid;
    if (otp.codeHash !== hashOtp(gym.id, input.phone, input.code)) throw invalid;

    const consumed = await this.db.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw invalid;

    const account = await this.otpAccount(gym.id, input.phone);
    if (!account) throw invalid;
    const user = 'user' in account ? account.user : await this.createMemberLogin(account.member);
    if (!user) throw invalid;
    return this.completeLogin(user, meta);
  }

  async refresh(refreshToken: string, meta: ClientMeta): Promise<LoginResponse> {
    const { user, tokens } = await this.tokens.rotate(refreshToken, meta);
    return { ...tokens, user: toAuthUser(user) };
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.db.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
    if (!user?.isActive) throw new UnauthorizedException();
    return toAuthUser(user);
  }

  private activeGym(slug: string) {
    return this.db.gym.findFirst({ where: { slug, status: { not: 'SUSPENDED' } } });
  }

  /**
   * A phone with a login account may use OTP only if that account is active and its role
   * allows OTP. Otherwise a member with that phone and no account yet may (first login).
   */
  private async otpAccount(gymId: string, phone: string): Promise<OtpAccount | null> {
    const user = await this.db.user.findUnique({
      where: { gymId_phone: { gymId, phone } },
      include: USER_INCLUDE,
    });
    if (user) {
      return user.isActive && OTP_LOGIN_ROLES.has(user.role?.key ?? '') ? { user } : null;
    }
    const member = await this.db.member.findFirst({
      where: { gymId, phone, deletedAt: null, userId: null },
      orderBy: { createdAt: 'asc' },
    });
    return member ? { member } : null;
  }

  /** A member's first OTP login creates their login account (MEMBER role) and links it. */
  private createMemberLogin(member: Member): Promise<UserWithRole | null> {
    return systemTransaction(this.prisma, async (tx) => {
      const role = await tx.role.findUniqueOrThrow({
        where: { gymId_key: { gymId: member.gymId, key: 'MEMBER' } },
      });
      const user = await tx.user.create({
        data: {
          gymId: member.gymId,
          roleId: role.id,
          name: [member.firstName, member.lastName].filter(Boolean).join(' '),
          phone: member.phone,
          // No email: members log in by phone, and copying it could clash with a staff login.
        },
        include: USER_INCLUDE,
      });
      // Guard against two first logins racing for the same member.
      const linked = await tx.member.updateMany({
        where: { id: member.id, userId: null },
        data: { userId: user.id },
      });
      if (linked.count !== 1) throw new UnauthorizedException('Invalid or expired code');
      return user;
    });
  }

  private async completeLogin(user: UserWithRole, meta: ClientMeta): Promise<LoginResponse> {
    await this.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    const tokens = await this.tokens.issue(user, meta);
    return { ...tokens, user: toAuthUser(user) };
  }
}
