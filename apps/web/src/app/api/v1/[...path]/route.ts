import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_COOKIE,
  API_URL,
  REFRESH_COOKIE,
  clearSession,
  isSameOrigin,
  readBody,
  refreshSession,
  setSession,
  upstreamHeaders,
} from '@/lib/server/session';

/**
 * Proxies /api/v1/* to the FitFlow API, adding the access token from the httpOnly cookie.
 * Refreshes the session transparently when the access token is missing or expired.
 */
async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const isRead = req.method === 'GET' || req.method === 'HEAD';
  if (!isRead && !isSameOrigin(req)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { path } = await params;
  // "." and ".." (even percent-encoded) would let a caller step outside /v1 on the API.
  if (path.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  const url = `${API_URL}/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const body = isRead ? undefined : await readBody(req);
  if (body === null) {
    return NextResponse.json({ message: 'Request body too large' }, { status: 413 });
  }

  const forward = upstreamHeaders(req);
  const send = (token: string) =>
    fetch(url, {
      method: req.method,
      headers: {
        ...forward,
        authorization: `Bearer ${token}`,
        'content-type': req.headers.get('content-type') ?? 'application/json',
      },
      body: body || undefined,
      cache: 'no-store',
    });

  try {
    const access = req.cookies.get(ACCESS_COOKIE)?.value;
    let upstream = access ? await send(access) : null;

    let refreshed = null;
    if (!upstream || upstream.status === 401) {
      refreshed = await refreshSession(req.cookies.get(REFRESH_COOKIE)?.value, forward);
      if (!refreshed) {
        const res = NextResponse.json({ message: 'Session expired' }, { status: 401 });
        clearSession(res);
        return res;
      }
      upstream = await send(refreshed.accessToken);
    }

    // Only the body and content type are passed back: no upstream cookies or server headers.
    const res = new NextResponse(upstream.status === 204 ? null : await upstream.text(), {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
    if (refreshed) setSession(res, refreshed);
    return res;
  } catch {
    return NextResponse.json({ message: 'Cannot reach the FitFlow API' }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
