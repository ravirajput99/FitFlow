import { NextResponse, type NextRequest } from 'next/server';
import type { LoginResponse } from '@fitflow/shared';
import { API_URL, isSameOrigin, readBody, setSession, upstreamHeaders } from '@/lib/server/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const body = await readBody(req, 4 * 1024);
  if (body === null) {
    return NextResponse.json({ message: 'Request body too large' }, { status: 413 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: upstreamHeaders(req, { 'content-type': 'application/json' }),
      body,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ message: 'Cannot reach the FitFlow API' }, { status: 502 });
  }

  const json = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(json, { status: upstream.status });

  // Tokens go into httpOnly cookies only; the browser just gets the user profile.
  const session = json as LoginResponse;
  const res = NextResponse.json({ user: session.user });
  setSession(res, session);
  return res;
}
