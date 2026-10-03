import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = '__Host-bookshop_session';
const DEMO_COOKIE = 'bookshop_demo_session';

/**
 * Lightweight gate: page requests need a session cookie.
 * API routes enforce their own auth; static assets and auth pages are public.
 * (Cookie presence only — validity is checked in the (app) layout.)
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Landing page is public.
  if (pathname === '/') return NextResponse.next();

  // Auth pages are public; bounce signed-in users away from /login.
  if (pathname === '/login' || pathname === '/setup') {
    if (pathname === '/login' && (req.cookies.has(COOKIE_NAME) || req.cookies.has(DEMO_COOKIE))) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  if (!req.cookies.has(COOKIE_NAME) && !req.cookies.has(DEMO_COOKIE)) {
    const login = new URL('/login', req.url);
    if (pathname !== '/') login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
