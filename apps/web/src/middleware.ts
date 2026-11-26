import { NextResponse, type NextRequest } from 'next/server';

/** Sends visitors without a session to /login. API routes handle auth themselves. */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('ff_rt');
  const isLogin = req.nextUrl.pathname === '/login';

  if (!hasSession && !isLogin) {
    const url = new URL('/login', req.url);
    if (req.nextUrl.pathname !== '/') url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // "api/" with the slash, so a future page such as /apidocs is still protected.
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'],
};
