'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/server/auth/session';
import { requireRole, type UserRole } from '@/server/rbac';
import { setSlaSeverityTargets, setNotificationPrefs } from '@/server/services/settings';
import { updateThresholds } from '@/server/services/dssEngine';
import {
  parseInput,
  dssThresholdsSchema,
  notificationPrefsSchema,
  slaTargetsSchema,
} from '@/server/validation';

/**
 * Settings mutations (SUPER_ADMIN only).
 *
 * SLA edits do not retroactively change existing tickets: a ticket keeps the
 * deadline it was created with. The UI states this explicitly so the behaviour
 * is not mistaken for a bug.
 */

export interface SettingsResult {
  ok: boolean;
  error?: string;
}

/** Save per-severity SLA targets in minutes. */
export async function saveSlaTargetsAction(formData: FormData): Promise<SettingsResult> {
  const user = await getSessionUser();
  try {
    requireRole(user, ['SUPER_ADMIN']);
  } catch {
    return { ok: false, error: 'Hanya Super Admin yang dapat mengubah konfigurasi SLA.' };
  }

  // Read the four severities out of the form, then let the schema own the rules
  // (integer, within 14 days, resolution strictly longer than response).
  const candidate = {
    CRITICAL: {
      responseMinutes: formData.get('response_CRITICAL'),
      resolutionMinutes: formData.get('resolution_CRITICAL'),
    },
    HIGH: {
      responseMinutes: formData.get('response_HIGH'),
      resolutionMinutes: formData.get('resolution_HIGH'),
    },
    MEDIUM: {
      responseMinutes: formData.get('response_MEDIUM'),
      resolutionMinutes: formData.get('resolution_MEDIUM'),
    },
    LOW: {
      responseMinutes: formData.get('response_LOW'),
      resolutionMinutes: formData.get('resolution_LOW'),
    },
  };

  const parsed = parseInput(slaTargetsSchema, candidate);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    await setSlaSeverityTargets(parsed.data, {
      id: user!.id,
      role: user!.role as UserRole,
      label: user!.fullName,
    });
    revalidatePath('/admin/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Konfigurasi gagal disimpan.' };
  }
}

/** Save the DSS thresholds (also shown on /dss). */
export async function saveDssThresholdsAction(formData: FormData): Promise<SettingsResult> {
  const user = await getSessionUser();
  try {
    requireRole(user, ['SUPER_ADMIN']);
  } catch {
    return { ok: false, error: 'Hanya Super Admin yang dapat mengubah ambang batas DSS.' };
  }

  const parsed = parseInput(dssThresholdsSchema, {
    sslWarnDays: formData.get('sslWarnDays'),
    repeatInfectionThreshold: formData.get('repeatInfectionThreshold'),
    repeatInfectionWindowDays: formData.get('repeatInfectionWindowDays'),
    credentialRotationDays: formData.get('credentialRotationDays'),
    slaWarnRatioPct: formData.get('slaWarnRatioPct'),
    maxActiveTicketsPerEngineer: formData.get('maxActiveTicketsPerEngineer'),
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    await updateThresholds({
      ...parsed.data,
      actor: { id: user!.id, role: user!.role as UserRole, label: user!.fullName },
    });
    revalidatePath('/admin/settings');
    revalidatePath('/dss');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ambang batas gagal disimpan.' };
  }
}

/** Save notification preferences. */
export async function saveNotificationPrefsAction(
  prefs: unknown,
): Promise<SettingsResult> {
  const user = await getSessionUser();
  try {
    requireRole(user, ['SUPER_ADMIN']);
  } catch {
    return { ok: false, error: 'Hanya Super Admin yang dapat mengubah preferensi notifikasi.' };
  }

  const parsed = parseInput(notificationPrefsSchema, prefs);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    await setNotificationPrefs(parsed.data, {
      id: user!.id,
      role: user!.role as UserRole,
      label: user!.fullName,
    });
    revalidatePath('/admin/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Preferensi gagal disimpan.' };
  }
}
