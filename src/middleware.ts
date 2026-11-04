import { NextResponse, type NextRequest } from 'next/server';
import { isPublicRoute } from '@/server/rbac';

/**
 * Route protection, layer 1 of 2.
 *
 * This layer only decides *whether a session cookie exists*. It deliberately
 * does not read roles: the signed cookie carries no role claim, and the
 * signature can only be verified server-side (edge runtime has no DB access).
 * Pages resolve the real role through getSessionUser() and redirect with
 * requirePageAccess() when the role may not enter. Layer 2 (requireRole() in
 * every Server Action) is the authoritative check for mutations.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Never gate Next internals or files with an extension.
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('sentinel_session');

  if (isPublicRoute(pathname)) {
    // Signed in already: skip the login screen.
    if (pathname === '/login' && sessionCookie) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    return NextResponse.next();
  }

  if (!sessionCookie) {
    // API clients get a machine-readable 401 from the route handler itself.
    // Redirecting them to an HTML login page would make a script follow a
    // redirect and parse HTML as CSV, so API routes are left to answer.
    if (pathname.startsWith('/api/')) {
      return NextResponse.next();
    }

    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname + search);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
