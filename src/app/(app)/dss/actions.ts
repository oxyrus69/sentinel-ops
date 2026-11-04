'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/server/auth/session';
import { requireRole, DSS_ROLES, type UserRole } from '@/server/rbac';
import { recordDecision, updateThresholds, type DssFact } from '@/server/services/dssEngine';
import { withIdempotency } from '@/server/idempotency';
import { parseInput, dssThresholdsSchema } from '@/server/validation';

/**
 * DSS mutations.
 *
 * Accepting or dismissing a recommendation writes a decision_logs row with the
 * exact facts that triggered it, so the history explains *why* a decision was
 * taken later, not just that it was.
 */

export interface DssActionResult {
  ok: boolean;
  error?: string;
  code?: 'ACCESS_DENIED' | 'VALIDATION_ERROR' | 'UNKNOWN';
}

export async function recordDecisionAction(input: {
  ruleCode: string;
  title: string;
  body?: string;
  facts: DssFact[];
  riskImpact?: string;
  outcome: 'ACCEPTED' | 'DISMISSED';
  note?: string;
  requestId: string;
}): Promise<DssActionResult> {
  const user = await getSessionUser();
  try {
    requireRole(user, DSS_ROLES);
  } catch {
    return {
      ok: false,
      code: 'ACCESS_DENIED',
      error: 'Hanya SecOps Engineer dan Super Admin yang dapat merekam keputusan DSS.',
    };
  }

  const actor = { id: user!.id, role: user!.role as UserRole, label: user!.fullName };

  try {
    await withIdempotency('dss.decision', input.requestId, () =>
      recordDecision({
        ruleCode: input.ruleCode,
        recommendationTitle: input.title,
        recommendationBody: input.body,
        facts: input.facts,
        riskImpact: input.riskImpact,
        outcome: input.outcome,
        note: input.note,
        actor,
      }),
    );

    revalidatePath('/dss');
    revalidatePath('/dss/riwayat');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Keputusan gagal direkam.',
    };
  }
}

export async function updateThresholdsAction(input: {
  sslWarnDays: number;
  repeatInfectionThreshold: number;
  repeatInfectionWindowDays: number;
  credentialRotationDays: number;
  slaWarnRatioPct: number;
  maxActiveTicketsPerEngineer: number;
}): Promise<DssActionResult> {
  const user = await getSessionUser();
  try {
    requireRole(user, ['SUPER_ADMIN']);
  } catch {
    return {
      ok: false,
      code: 'ACCESS_DENIED',
      error: 'Hanya Super Admin yang dapat mengubah ambang batas DSS.',
    };
  }

  const parsed = parseInput(dssThresholdsSchema, input);
  if (!parsed.ok) {
    return { ok: false, code: 'VALIDATION_ERROR', error: parsed.error };
  }

  try {
    await updateThresholds({
      ...parsed.data,
      actor: { id: user!.id, role: user!.role as UserRole, label: user!.fullName },
    });
    revalidatePath('/dss');
    revalidatePath('/admin/settings');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Ambang batas gagal disimpan.',
    };
  }
}
