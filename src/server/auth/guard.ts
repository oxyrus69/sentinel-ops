import 'server-only';

import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from '@/server/auth/session';
import { canAccessRoute, redirectHomeFor, type UserRole } from '@/server/rbac';

/**
 * Page-level access guard.
 *
 * Call at the top of every protected page. Returns the session user when the
 * role may enter.
 *
 * A cookie that cannot be verified (bad signature, deleted session, deactivated
 * user) is bounced through /api/auth/clear-session, because Next.js only allows
 * a cookie to be cleared from a Route Handler or Server Action — not from a
 * page render. Without that hop the browser keeps replaying the stale cookie and
 * every protected page fails.
 */
export async function requirePageAccess(pathname: string): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect(`/api/auth/clear-session?next=${encodeURIComponent(pathname)}`);
  }

  if (!canAccessRoute(user.role, pathname)) {
    redirect(redirectHomeFor(user.role));
  }

  return user;
}

/** Convenience wrapper when a page only needs any authenticated user. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/api/auth/clear-session?next=/admin');
  return user;
}

/** Guard for pages restricted to a set of roles. */
export async function requirePageRole(allowed: UserRole[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!allowed.includes(user.role)) {
    redirect(redirectHomeFor(user.role));
  }
  return user;
}
