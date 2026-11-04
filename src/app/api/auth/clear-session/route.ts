import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/server/auth/session';

/**
 * Session cleanup endpoint.
 *
 * A cookie can only be *cleared* inside a Server Action or Route Handler, not
 * during a page render. When a protected page finds a cookie it cannot verify
 * (deleted session, rotated secret, deactivated user) it redirects here so the
 * stale cookie is actually removed; otherwise the browser would keep sending it
 * and every protected page would fail.
 *
 * `next` (the originally requested path) is preserved for the login redirect.
 */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get('next');
  const jar = await cookies();

  if (jar.get(SESSION_COOKIE)) {
    jar.delete(SESSION_COOKIE);
  }

  const loginUrl = new URL('/login', request.url);
  if (next && next.startsWith('/')) {
    loginUrl.searchParams.set('next', next);
  }

  return NextResponse.redirect(loginUrl);
}
