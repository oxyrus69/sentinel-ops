import 'server-only';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { appSettings } from '@/server/db/schema';
import { writeAuditLog } from '@/server/audit';
import { SLA_TARGETS, type Severity, type SlaTarget } from '@/lib/slaMath';

/**
 * Application settings store (key -> jsonb value).
 *
 * Two keys are typed rather than free-form:
 *   'sla.targets'         per-severity response/resolution targets in minutes
 *   'notifications.prefs' on/off switches per notification kind
 * Everything else is read through getSetting<T> with an explicit fallback.
 *
 * NOTE: incidents store their SLA deadlines (sla_response_due_at,
 * sla_resolution_due_at) at creation time. Editing sla.targets therefore only
 * affects tickets created afterwards; existing tickets keep the deadline they
 * were born with and are never retroactively re-based.
 */

const SLA_TARGETS_KEY = 'sla.targets';
const NOTIFICATION_PREFS_KEY = 'notifications.prefs';

/** Upper bound for any SLA target: 14 days in minutes. */
const MAX_TARGET_MINUTES = 14 * 24 * 60;

const ALL_SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export interface SlaSeverityTargets {
  [severity: string]: SlaTarget;
}

export interface NotificationPrefs {
  slaWarning: boolean;
  assetCompromised: boolean;
  vaultAccess: boolean;
  weeklyDigest: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  slaWarning: true,
  assetCompromised: true,
  vaultAccess: true,
  weeklyDigest: false,
};

/**
 * Read one setting.
 *
 * Falls back when the row is missing, when the stored value is null, or when
 * the driver hands back a JSON string that fails to parse (jsonb is normally
 * already decoded by the driver, but the fallback keeps a bad row from
 * breaking the caller).
 */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1)
    .then((r) => r[0]);

  if (!row) return fallback;

  const raw = row.valueJson;
  if (raw === null || raw === undefined) return fallback;

  if (typeof raw !== 'string') return raw as T;

  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[settings] nilai untuk "${key}" bukan JSON yang sah:`, err);
    return fallback;
  }
}

/** Insert or update a setting row and leave an audit trace. */
export async function setSetting(
  key: string,
  value: unknown,
  description?: string,
  actor?: { id: string; role: string; label: string },
): Promise<void> {
  const id = randomUUID();

  await db
    .insert(appSettings)
    .values({
      id,
      key,
      valueJson: value,
      description: description?.trim() || null,
      updatedBy: actor?.id ?? null,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        valueJson: value,
        description: description?.trim() || null,
        updatedBy: actor?.id ?? null,
        updatedAt: new Date(),
      },
    });

  if (actor) {
    await writeAuditLog({
      actor,
      action: 'settings.updated',
      entityType: 'app_settings',
      entityId: key,
      summary: `Pengaturan "${key}" diperbarui.`,
    });
  }
}

/** Every setting row, newest key first for a stable admin table. */
export async function getAllSettings() {
  return db.select().from(appSettings).orderBy(appSettings.key);
}

/**
 * Effective SLA targets, falling back to the compiled defaults.
 *
 * A missing or malformed row never breaks ticket creation: the fallback in
 * src/lib/slaMath is authoritative.
 */
export async function getSlaSeverityTargets(): Promise<Record<Severity, SlaTarget>> {
  const stored = await getSetting<SlaSeverityTargets | null>(SLA_TARGETS_KEY, null);
  if (!stored || typeof stored !== 'object') {
    return { ...SLA_TARGETS };
  }

  const out = {} as Record<Severity, SlaTarget>;
  for (const severity of ALL_SEVERITIES) {
    const entry = stored[severity];
    if (
      entry &&
      typeof entry === 'object' &&
      Number.isFinite(entry.responseMinutes) &&
      Number.isFinite(entry.resolutionMinutes)
    ) {
      out[severity] = {
        responseMinutes: entry.responseMinutes,
        resolutionMinutes: entry.resolutionMinutes,
      };
    } else {
      out[severity] = SLA_TARGETS[severity];
    }
  }
  return out;
}

/** Persist validated SLA targets. Throws on any invalid severity or minute value. */
export async function setSlaSeverityTargets(
  targets: Record<Severity, SlaTarget>,
  actor: { id: string; role: string; label: string },
): Promise<void> {
  for (const severity of ALL_SEVERITIES) {
    const entry = targets[severity];
    if (!entry) {
      throw new Error(`Target SLA untuk severity ${severity} belum diisi.`);
    }

    const { responseMinutes, resolutionMinutes } = entry;
    if (!Number.isInteger(responseMinutes) || responseMinutes <= 0) {
      throw new Error(
        `Target respons untuk ${severity} harus berupa bilangan bulat lebih besar dari 0.`,
      );
    }
    if (!Number.isInteger(resolutionMinutes) || resolutionMinutes <= 0) {
      throw new Error(
        `Target penyelesaian untuk ${severity} harus berupa bilangan bulat lebih besar dari 0.`,
      );
    }
    if (responseMinutes > MAX_TARGET_MINUTES || resolutionMinutes > MAX_TARGET_MINUTES) {
      throw new Error(
        `Target SLA untuk ${severity} melebihi batas ${MAX_TARGET_MINUTES} menit (14 hari).`,
      );
    }
    if (resolutionMinutes <= responseMinutes) {
      throw new Error(
        `Target penyelesaian ${severity} harus lebih besar daripada target respons.`,
      );
    }
  }

  await setSetting(
    SLA_TARGETS_KEY,
    targets,
    'Target SLA per severity (menit). Hanya berlaku untuk tiket yang dibuat setelah perubahan.',
    actor,
  );
}

/** Notification switches for the current operator. */
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const stored = await getSetting<Partial<NotificationPrefs> | null>(
    NOTIFICATION_PREFS_KEY,
    null,
  );
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(stored ?? {}) };
}

export async function setNotificationPrefs(
  prefs: NotificationPrefs,
  actor: { id: string; role: string; label: string },
): Promise<void> {
  await setSetting(
    NOTIFICATION_PREFS_KEY,
    prefs,
    'Sakelar notifikasi in-app per jenis peringatan.',
    actor,
  );
}

export { SLA_TARGETS_KEY, NOTIFICATION_PREFS_KEY, ALL_SEVERITIES };
