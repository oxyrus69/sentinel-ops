'use server';

import { headers } from 'next/headers';
import { db } from '@/server/db';
import { profiles } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '@/server/services/cryptoEngine';
import { createSession, destroySession, getSessionUser } from '@/server/auth/session';
import { writeAuditLog } from '@/server/audit';
import { ROLE_HOME } from '@/server/rbac';

/**
 * Authentication.
 *
 * Local mode by default (profiles.password_hash). The session module is the
 * only seam that knows how sessions work, so Supabase Auth can replace it
 * without touching any page.
 *
 * NOTE ON REDIRECTS: these actions return `{ redirectTo, sessionId }` instead
 * of calling Next's redirect(). A Server Action that both writes a session row
 * and calls cookies().set() does not reliably deliver Set-Cookie to the
 * browser, so the user would appear logged in only to be bounced straight back
 * out. The client therefore commits the cookie through /api/auth/session and
 * navigates after that resolves.
 */

export interface LoginState {
  error: string | null;
  /** Where to navigate on success. Null while there is nothing to do. */
  redirectTo: string | null;
  /** Session id to hand to /api/auth/session for the cookie write. */
  sessionId?: string | null;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Email dan kata sandi wajib diisi.', redirectTo: null };
  }

  const user = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1)
    .then((r) => r[0]);

  if (!user || !user.isActive) {
    await writeAuditLog({
      actor: { id: null, role: null, label: email },
      action: 'auth.login_failed',
      entityType: 'profile',
      entityId: null,
      summary: `Percobaan masuk gagal untuk ${email}. Akun tidak ditemukan atau tidak aktif.`,
    });
    return { error: 'Email atau kata sandi salah.', redirectTo: null };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    await writeAuditLog({
      actor: { id: user.id, role: user.role, label: user.fullName },
      action: 'auth.login_failed',
      entityType: 'profile',
      entityId: user.id,
      summary: `Percobaan masuk gagal untuk ${user.fullName}. Kata sandi tidak cocok.`,
    });
    return { error: 'Email atau kata sandi salah.', redirectTo: null };
  }

  const headerList = await headers();
  const sessionId = await createSession(user.id, {
    userAgent: headerList.get('user-agent'),
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });

  await db
    .update(profiles)
    .set({ lastLoginAt: new Date() })
    .where(eq(profiles.id, user.id));

  await writeAuditLog({
    actor: { id: user.id, role: user.role, label: user.fullName },
    action: 'auth.login',
    entityType: 'profile',
    entityId: user.id,
    summary: `${user.fullName} masuk ke sistem.`,
  });

  // The row exists; the browser's cookie is written by the client via
  // /api/auth/session so the Set-Cookie header is reliably committed.
  return { error: null, redirectTo: ROLE_HOME[user.role] ?? '/admin', sessionId };
}

export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    await writeAuditLog({
      actor: { id: user.id, role: user.role, label: user.fullName },
      action: 'auth.logout',
      entityType: 'profile',
      entityId: user.id,
      summary: `${user.fullName} keluar dari sistem.`,
    });
  }
  await destroySession();
}
