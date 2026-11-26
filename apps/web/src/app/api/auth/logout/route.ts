import { NextResponse, type NextRequest } from 'next/server';
import {
  API_URL,
  REFRESH_COOKIE,
  clearSession,
  isSameOrigin,
  upstreamHeaders,
} from '@/lib/server/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${API_URL}/v1/auth/logout`, {
      method: 'POST',
      headers: upstreamHeaders(req, { 'content-type': 'application/json' }),
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }
  const res = new NextResponse(null, { status: 204 });
  clearSession(res);
  return res;
}
