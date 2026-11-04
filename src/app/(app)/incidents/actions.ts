'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/server/auth/session';
import { requireRole, INCIDENT_WORK_ROLES, type UserRole } from '@/server/rbac';
import {
  transitionIncident,
  addIncidentComment,
  attachRunbookToIncident,
  toggleRunbookTask,
  IncidentConflictError,
  IncidentValidationError,
  type IncidentStatusValue,
} from '@/server/services/incidentEngine';
import { writeAuditLog } from '@/server/audit';
import { withIdempotency } from '@/server/idempotency';
import {
  parseInput,
  incidentCommentSchema,
  incidentStatusChangeSchema,
} from '@/server/validation';

/**
 * Incident workspace mutations.
 *
 * Every action resolves the session first (layer 2 of RBAC), then delegates to
 * the engine. Conflicts and validation failures come back as structured results
 * so the client can show a precise message instead of a generic error page.
 */

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  code?: 'CONFLICT' | 'VALIDATION_ERROR' | 'ACCESS_DENIED' | 'UNKNOWN';
  data?: T;
}

async function actor() {
  const user = await getSessionUser();
  requireRole(user, INCIDENT_WORK_ROLES);
  return {
    id: user!.id,
    role: user!.role as UserRole,
    label: user!.fullName,
  };
}

/** Change ticket status with optimistic locking and RCA enforcement. */
export async function changeStatusAction(input: {
  incidentId: string;
  toStatus: IncidentStatusValue;
  expectedVersion: number;
  rootCauseSummary?: string;
  remediationSteps?: string;
  requestId: string;
}): Promise<ActionResult<{ version: number; status: IncidentStatusValue }>> {
  const who = await actor();

  const parsed = parseInput(incidentStatusChangeSchema, input);
  if (!parsed.ok) {
    return { ok: false, code: 'VALIDATION_ERROR', error: parsed.error };
  }

  try {
    const result = await withIdempotency('incident.update', input.requestId, () =>
      transitionIncident({
        incidentId: parsed.data.incidentId,
        toStatus: parsed.data.toStatus,
        expectedVersion: parsed.data.expectedVersion,
        actorId: who.id,
        actorRole: who.role,
        actorLabel: who.label,
        rootCauseSummary: parsed.data.rootCauseSummary,
        remediationSteps: parsed.data.remediationSteps,
        requestId: input.requestId,
      }),
    );

    revalidatePath(`/incidents/${input.incidentId}`);
    revalidatePath('/incidents');
    return { ok: true, data: { version: result.result.version, status: input.toStatus } };
  } catch (err) {
    if (err instanceof IncidentConflictError) {
      return {
        ok: false,
        code: 'CONFLICT',
        error: err.message,
        data: undefined,
      };
    }
    if (err instanceof IncidentValidationError) {
      return { ok: false, code: 'VALIDATION_ERROR', error: err.message };
    }
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Terjadi kesalahan yang tidak terduga.',
    };
  }
}

/** Post a comment, internal or client-visible. */
export async function addCommentAction(input: {
  incidentId: string;
  body: string;
  isInternal: boolean;
  requestId: string;
}): Promise<ActionResult<{ id: string }>> {
  const who = await actor();

  const parsed = parseInput(incidentCommentSchema, input);
  if (!parsed.ok) {
    return { ok: false, code: 'VALIDATION_ERROR', error: parsed.error };
  }

  try {
    const result = await withIdempotency('incident.comment', input.requestId, () =>
      addIncidentComment({
        incidentId: parsed.data.incidentId,
        authorId: who.id,
        body: parsed.data.body,
        isInternal: parsed.data.isInternal,
      }),
    );

    await writeAuditLog({
      actor: who,
      action: 'incident.commented',
      entityType: 'incident',
      entityId: input.incidentId,
      summary: input.isInternal
        ? 'Catatan internal ditambahkan pada tiket.'
        : 'Balasan publik kepada klien ditambahkan pada tiket.',
      requestId: input.requestId,
    });

    revalidatePath(`/incidents/${input.incidentId}`);
    return { ok: true, data: { id: result.result.id } };
  } catch (err) {
    if (err instanceof IncidentValidationError) {
      return { ok: false, code: 'VALIDATION_ERROR', error: err.message };
    }
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Komentar gagal disimpan.',
    };
  }
}

/** Attach a runbook, materialising its checklist on the ticket. */
export async function attachRunbookAction(input: {
  incidentId: string;
  runbookId: string;
}): Promise<ActionResult<{ taskCount: number }>> {
  const who = await actor();

  try {
    const result = await attachRunbookToIncident({
      incidentId: input.incidentId,
      runbookId: input.runbookId,
    });

    await writeAuditLog({
      actor: who,
      action: 'incident.updated',
      entityType: 'incident',
      entityId: input.incidentId,
      summary: `Runbook dilampirkan ke tiket (${result.taskCount} langkah).`,
    });

    revalidatePath(`/incidents/${input.incidentId}`);
    return { ok: true, data: result };
  } catch (err) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      error: err instanceof Error ? err.message : 'Runbook gagal dilampirkan.',
    };
  }
}

/** Tick or untick one runbook step. */
export async function toggleTaskAction(input: {
  taskId: string;
  isDone: boolean;
  incidentId: string;
}): Promise<ActionResult> {
  const who = await actor();

  try {
    await toggleRunbookTask({
      taskId: input.taskId,
      isDone: input.isDone,
      actorId: who.id,
      actorLabel: who.label,
      actorRole: who.role,
    });
    revalidatePath(`/incidents/${input.incidentId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Langkah gagal diperbarui.',
    };
  }
}
