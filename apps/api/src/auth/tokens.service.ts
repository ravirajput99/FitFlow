import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Gym, Role, User } from '@fitflow/db';
import { isPermission, type AuthTokens, type AuthUser, type Permission } from '@fitflow/shared';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  /** gym id; null for super-admins */
  gid: string | null;
  /** role key */
  rk: string | null;
  perms: Permission[];
  sa: boolean;
}

export type UserWithRole = User & { role: Role | null; gym: Gym | null };

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function toAuthUser(user: UserWithRole): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    gymId: user.gymId,
    gymSlug: user.gym?.slug ?? null,
    gymName: user.gym?.name ?? null,
    roleKey: user.role?.key ?? null,
    permissions: (user.role?.permissions ?? []).filter(isPermission),
    isSuperAdmin: user.isSuperAdmin,
  };
}

/**
 * Access tokens: short-lived JWTs carrying the user's gym and permissions.
 * Refresh tokens: opaque "<id>.<secret>" strings, stored hashed, rotated on every use.
 * Re-using an already-rotated refresh token revokes all of that user's sessions,
 * because it means the token was stolen.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async issue(user: UserWithRole, meta: ClientMeta): Promise<AuthTokens> {
    const authUser = toAuthUser(user);
    const payload: AccessTokenPayload = {
      sub: user.id,
      gid: user.gymId,
      rk: authUser.roleKey,
      perms: authUser.permissions,
      sa: user.isSuperAdmin,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.createRefreshToken(user.id, meta);
    return { accessToken, expiresIn: env().JWT_ACCESS_TTL_SECONDS, refreshToken };
  }

  private async createRefreshToken(userId: string, meta: ClientMeta): Promise<string> {
    const secret = randomBytes(32).toString('base64url');
    const row = await this.prisma.system.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(secret),
        expiresAt: new Date(Date.now() + env().JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 255),
      },
    });
    return `${row.id}.${secret}`;
  }

  /** Validates a refresh token, rotates it and returns the user plus new tokens. */
  async rotate(
    token: string,
    meta: ClientMeta,
  ): Promise<{ user: UserWithRole; tokens: AuthTokens }> {
    const db = this.prisma.system;
    const row = await this.findValid(token);

    if (row.revokedAt) {
      // Reuse of a rotated token: assume theft and end every session of this user.
      await db.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session expired, please log in again');
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException('Session expired');

    // Atomic claim: only one concurrent request can rotate a given token.
    const claimed = await db.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) throw new UnauthorizedException('Session expired');

    const user = await db.user.findUnique({
      where: { id: row.userId },
      include: { role: true, gym: true },
    });
    if (!user?.isActive || user.gym?.status === 'SUSPENDED') throw new UnauthorizedException();

    const tokens = await this.issue(user, meta);
    await db.refreshToken.update({
      where: { id: row.id },
      data: { replacedById: tokens.refreshToken.split('.')[0] },
    });
    return { user, tokens };
  }

  async revoke(token: string): Promise<void> {
    try {
      const row = await this.findValid(token);
      await this.prisma.system.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Logging out with an unknown token is not an error.
    }
  }

  private async findValid(token: string) {
    const [id, secret] = token.split('.');
    if (!id || !secret) throw new UnauthorizedException();
    const row = await this.prisma.system.refreshToken.findUnique({ where: { id } });
    if (!row) throw new UnauthorizedException();
    const expected = Buffer.from(row.tokenHash, 'hex');
    const actual = Buffer.from(sha256(secret), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException();
    }
    return row;
  }
}
