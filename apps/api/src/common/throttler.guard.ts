import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { currentContext } from './request-context';

/**
 * Global rate limit. Runs after JwtAuthGuard, so logged-in callers are limited per user
 * (staff behind one office NAT do not share a bucket) and anonymous callers per IP.
 *
 * Storage is in-memory: with more than one API instance, switch to a Redis store
 * (Phase 1, when Redis is added) or the limits multiply by the instance count.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const userId = currentContext().userId;
    return userId ? `user:${userId}` : `ip:${String(req.ip)}`;
  }
}
