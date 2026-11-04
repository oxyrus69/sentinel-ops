import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { profiles, sessions, type UserRole } from '@/server/db/schema';
import { newSessionToken } from '@/server/services/cryptoEngine';
import {
  checkSessionSecret,
  requiresProductionSecrets,
  DEMO_SESSION_SECRET,
} from '@/server/env';

/**
 * Cookie sessions backed by the `sessions` table.
 *
 * The cookie holds two parts: `<sessionId>.<hmac>`. The HMAC (signed with
 * SESSION_SECRET) proves the id was issued by this server, and the row proves
 * the session is still valid. Because the record lives in Postgres/PGlite, a
 * restart or HMR does not sign everyone out, and several instances can share it.
 */

export const SESSION_COOKIE = 'sentinel_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationName: string | null;
}

/**
 * Resolve the session signing secret.
 *
 * A missing secret in production is a deployment fault, not a per-request one:
 * throwing inside signature verification would surface as a silent logout loop.
 * The value is therefore resolved once, and `assertSessionSecret()` is called at
 * startup so the fault is reported where it can be fixed.
 */
let cachedSecret: string | null = null;

function sessionSecret(): string {
  if (cachedSecret) return cachedSecret;

  const raw = (process.env.SESSION_SECRET ?? '').trim();
  const status = checkSessionSecret(raw);

  if (status.configured) {
    cachedSecret = raw;
    return cachedSecret;
  }

  // In production with a real database the app must refuse to run: a weak or
  // placeholder secret would silently invalidate every session on each restart.
  if (requiresProductionSecrets()) {
    throw new Error(status.problem ?? 'SESSION_SECRET tidak valid untuk produksi.');
  }

  // Demo mode: stable fallback so a fresh clone runs and the test suite passes.
  cachedSecret = DEMO_SESSION_SECRET;
  return cachedSecret;
}

/**
 * Fail fast at boot when production is misconfigured.
 *
 * Called by the session route and the public status page, which are the first
 * requests any deployment receives. Without it the symptom is every user being
 * logged out forever with no explanation in the UI.
 */
export function assertSessionSecret(): void {
  sessionSecret();
}

function sign(sessionId: string): string {
  return createHmac('sha256', sessionSecret()).update(sessionId).digest('base64url');
}

/** Constant-time comparison of the cookie's signature half. */
function verifySignature(sessionId: string, signature: string): boolean {
  const expected = sign(sessionId);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Create a session row.
 *
 * Returns the session id so the caller can hand it to a Route Handler for the
 * cookie write. cookies().set() is deliberately NOT called here: a Server Action
 * that also sets a cookie does not reliably deliver Set-Cookie, and the app
 * writes cookies only from Route Handlers.
 */
export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<string> {
  const sessionId = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
  });

  return sessionId;
}

/** Build the signed cookie value for a session id. */
export function signSessionCookie(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

/**
 * Delete the session row and clear the cookie.
 *
 * Callable from a Route Handler or Server Action (both may modify cookies).
 */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;

  if (raw) {
    const dot = raw.indexOf('.');
    const sessionId = dot > 0 ? raw.slice(0, dot) : null;
    if (sessionId && verifySignature(sessionId, raw.slice(dot + 1))) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }
  }

  jar.delete(SESSION_COOKIE);
}

/** Resolve the signed cookie into a user, or null when expired/invalid. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const dot = raw.indexOf('.');
  if (dot <= 0) return null;

  const sessionId = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!verifySignature(sessionId, signature)) return null;

  const rows = await db
    .select({
      expiresAt: sessions.expiresAt,
      id: profiles.id,
      email: profiles.email,
      fullName: profiles.fullName,
      role: profiles.role,
      organizationName: profiles.organizationName,
      isActive: profiles.isActive,
    })
    .from(sessions)
    .innerJoin(profiles, eq(sessions.userId, profiles.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  if (!row.isActive) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    organizationName: row.organizationName,
  };
}

/** Issue a fresh session id for the same user (call right after login). */
export async function rotateSession(userId: string): Promise<string> {
  await destroySession();
  return createSession(userId);
}

/** Housekeeping: delete expired rows. Safe to call on a timer. */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return Array.isArray(result) ? result.length : 0;
}

/** Count active sessions for a user (shown in settings). */
export async function countActiveSessions(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), sql`${sessions.expiresAt} > now()`));
  return rows[0]?.count ?? 0;
}
