import { NextResponse } from 'next/server';
import { desc, eq, and } from 'drizzle-orm';
import { getSessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { notifications } from '@/server/db/schema';

/**
 * Notification feed for the top-bar bell popover.
 * GET returns the latest items for the signed-in user; no body is ever sent
 * to anyone but the recipient, enforced by the session guard here.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      entityType: notifications.entityType,
      entityId: notifications.entityId,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.recipientId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(15);

  const unread = rows.filter((r) => !r.isRead).length;

  return NextResponse.json({ items: rows, unread });
}

/** Mark every notification of the current user as read. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.recipientId, user.id), eq(notifications.isRead, false)));

  return NextResponse.json({ ok: true });
}
