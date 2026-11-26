import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import type { LoginResponse } from '@fitflow/shared';

/**
 * Backend-for-frontend session handling. The browser never sees API tokens: they live in
 * httpOnly cookies and Next.js route handlers attach them when proxying to the API.
 */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const ACCESS_COOKIE = 'ff_at';
export const REFRESH_COOKIE = 'ff_rt';

const secure = process.env.NODE_ENV === 'production';

export function setSession(res: NextResponse, session: LoginResponse) {
  res.cookies.set(ACCESS_COOKIE, session.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    // Expire slightly early so the proxy refreshes before the API rejects the token.
    maxAge: Math.max(session.expiresIn - 30, 30),
  });
  res.cookies.set(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearSession(res: NextResponse) {
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
}

/**
 * Pages often fire several API calls at once. If the access token has expired they would
 * all try to refresh with the same refresh token, and the API treats a second use as token
 * theft. So concurrent refreshes share one in-flight request (per server process).
 * With several web instances, put sticky sessions or a shared cache in front of this.
 */
const inflight = new Map<string, Promise<LoginResponse | null>>();

export function refreshSession(
  refreshToken: string | undefined,
  headers: Record<string, string> = {},
): Promise<LoginResponse | null> {
  if (!refreshToken) return Promise.resolve(null);
  const existing = inflight.get(refreshToken);
  if (existing) return existing;

  const promise = fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  })
    .then(async (r) => (r.ok ? ((await r.json()) as LoginResponse) : null))
    .catch(() => null);

  inflight.set(refreshToken, promise);
  // Keep the result briefly so requests that arrive just after still reuse it.
  void promise.finally(() => setTimeout(() => inflight.delete(refreshToken), 30_000));
  return promise;
}

/**
 * Largest request body the proxy will read. Matches the API's JSON limit (100 KB), and
 * stops anyone from making this server buffer huge uploads in memory.
 */
export const MAX_BODY_BYTES = 100 * 1024;

/** Reads the request body as text, or returns null if it is larger than `limit`. */
export async function readBody(req: NextRequest, limit = MAX_BODY_BYTES): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > limit) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Headers for calls to the API. The API rate-limits anonymous requests (login, OTP) per
 * client IP, so pass the browser's IP on; otherwise every user would share this server's IP
 * and one attacker could lock everyone out of logging in.
 *
 * Takes the last X-Forwarded-For entry: the address the proxy in front of Next.js saw.
 * In production, run Next.js behind a load balancer/reverse proxy that appends to
 * X-Forwarded-For; if browsers can reach Next.js directly they can fake this header.
 */
export function upstreamHeaders(req: NextRequest, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    'user-agent': req.headers.get('user-agent') ?? 'fitflow-web',
    ...extra,
  };
  const clientIp = req.headers.get('x-forwarded-for')?.split(',').pop()?.trim();
  if (clientIp) headers['x-forwarded-for'] = clientIp;
  return headers;
}

/** CSRF defence for cookie-authenticated writes: only accept same-origin requests. */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
