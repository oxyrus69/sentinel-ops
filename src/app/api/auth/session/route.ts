import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createSession, destroySession, signSessionCookie } from '@/server/auth/session';
import { APP_URL } from '@/server/config';

/**
 * Session write endpoint.
 *
 * A Server Action that calls cookies().set() while its result is consumed by
 * `useActionState` does not reliably attach Set-Cookie to the response the
 * browser keeps. Writing the cookie from a Route Handler (a plain navigation
 * the browser follows) is deterministic, so all cookie writes go through here.
 *
 * Flow: the login action writes the session row -> the client POSTs the
 * returned session id here -> this handler sets the signed cookie.
 */

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // keep in sync with session.ts

/**
 * Should the session cookie carry `Secure`?
 *
 * Tied to the real scheme, not to NODE_ENV: a production build served over plain
 * HTTP on a LAN or localhost would otherwise issue a cookie the browser refuses
 * to send back, producing a login that silently bounces to /login forever.
 */
function useSecureCookie(request: NextRequest): boolean {
  if (process.env.SESSION_COOKIE_SECURE === 'false') return false;
  if (process.env.SESSION_COOKIE_SECURE === 'true') return true;

  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https';

  try {
    return APP_URL.startsWith('https://');
  } catch {
    return false;
  }
}

interface WriteBody {
  sessionId?: string;
  mode?: 'set' | 'clear';
}

export async function POST(request: NextRequest) {
  const jar = await cookies();

  let body: WriteBody = {};
  try {
    body = (await request.json()) as WriteBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Payload tidak valid.' }, { status: 400 });
  }

  if (body.mode === 'clear') {
    await destroySession();
    return NextResponse.json({ ok: true });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'sessionId wajib diisi.' }, { status: 400 });
  }

  jar.set('sentinel_session', signSessionCookie(sessionId), {
    httpOnly: true,
    secure: useSecureCookie(request),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return NextResponse.json({ ok: true, sessionId });
}

/** Convenience: create a session for a user and set the cookie in one call. */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId wajib diisi.' }, { status: 400 });
  }

  const sessionId = await createSession(userId, {
    userAgent: request.headers.get('user-agent'),
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });

  const jar = await cookies();
  jar.set('sentinel_session', signSessionCookie(sessionId), {
    httpOnly: true,
    secure: useSecureCookie(request),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return NextResponse.json({ ok: true, sessionId });
}
