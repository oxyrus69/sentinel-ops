import 'server-only';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { notifications, type NotificationKind } from '@/server/db/schema';

/**
 * In-app notification centre.
 *
 * Writes are best-effort: a notification failure must never roll back the
 * operation that triggered it.
 */
export async function notify(input: {
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}): Promise<string | null> {
  try {
    const id = randomUUID();
    await db.insert(notifications).values({
      id,
      recipientId: input.recipientId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    });
    return id;
  } catch (err) {
    console.error('[notify] gagal membuat notifikasi:', err);
    return null;
  }
}

/** Notify several recipients with the same content. */
export async function notifyMany(
  recipientIds: string[],
  input: {
    kind: NotificationKind;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
  },
): Promise<number> {
  let sent = 0;
  for (const recipientId of recipientIds) {
    const id = await notify({ ...input, recipientId });
    if (id) sent += 1;
  }
  return sent;
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, notificationId));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { and } = await import('drizzle-orm');
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(eq(notifications.recipientId, userId), eq(notifications.isRead, false)),
    );
}

/** Unread count for the sidebar badge. */
export async function countUnread(userId: string): Promise<number> {
  const { and } = await import('drizzle-orm');
  const { sql } = await import('drizzle-orm');
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.recipientId, userId), eq(notifications.isRead, false)));
  return rows[0]?.count ?? 0;
}
