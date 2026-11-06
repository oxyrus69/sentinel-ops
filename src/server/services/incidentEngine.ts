import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  incidentComments,
  incidentRunbookTasks,
  incidents,
  profiles,
  runbookSteps,
  runbooks,
  type ScanMode,
  webAssets,
} from '@/server/db/schema';
import { computeSlaDeadlinesPure } from '@/lib/slaMath';
import { newTicketNumber } from '@/server/services/ticketNumber';
import { notify } from '@/server/services/notifications';
import { writeAuditLog, diffChanges } from '@/server/audit';

export type IncidentSeverityValue = (typeof incidents.severity.enumValues)[number];
export type IncidentStatusValue = (typeof incidents.status.enumValues)[number];
export type ThreatCategoryValue = (typeof incidents.category.enumValues)[number];

/** Allowed status transitions. Anything not listed is rejected. */
export const ALLOWED_TRANSITIONS: Record<IncidentStatusValue, IncidentStatusValue[]> = {
  OPEN: ['INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED'],
  INVESTIGATING: ['CONTAINED', 'RESOLVED', 'CLOSED'],
  CONTAINED: ['INVESTIGATING', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['INVESTIGATING', 'CLOSED'],
  CLOSED: [],
};

export class IncidentValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'IncidentValidationError';
  }
}

export class IncidentConflictError extends Error {
  readonly code = 'CONFLICT';
  readonly latestData: {
    id: string;
    status: IncidentStatusValue;
    version: number;
    updatedAt: Date;
  };

  constructor(
    message: string,
    latestData: {
      id: string;
      status: IncidentStatusValue;
      version: number;
      updatedAt: Date;
    },
  ) {
    super(message);
    this.name = 'IncidentConflictError';
    this.latestData = latestData;
  }
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateIncidentInput {
  assetId: string;
  title: string;
  description: string;
  severity: IncidentSeverityValue;
  category: ThreatCategoryValue;
  reportedBy: string;
  assignedTo?: string | null;
}

export async function createIncident(
  input: CreateIncidentInput,
): Promise<{ id: string; ticketNumber: string }> {
  const id = randomUUID();
  const ticketNumber = await newTicketNumber('INC');
  const now = new Date();
  const deadlines = computeSlaDeadlinesPure(now, input.severity);

  await db.insert(incidents).values({
    id,
    ticketNumber,
    assetId: input.assetId,
    reportedBy: input.reportedBy,
    assignedTo: input.assignedTo ?? null,
    title: input.title.trim(),
    description: input.description.trim(),
    severity: input.severity,
    category: input.category,
    status: 'OPEN',
    slaResponseDueAt: deadlines.responseDueAt,
    slaResolutionDueAt: deadlines.resolutionDueAt,
  });

  if (input.assignedTo) {
    await notify({
      recipientId: input.assignedTo,
      kind: 'INCIDENT_ASSIGNED',
      title: `Tiket ${ticketNumber} ditugaskan kepada Anda`,
      body: input.title,
      entityType: 'incident',
      entityId: id,
    });
  }

  return { id, ticketNumber };
}

/* -------------------------------------------------------------------------- */
/* Status transition with optimistic locking                                  */
/* -------------------------------------------------------------------------- */

export interface TransitionIncidentInput {
  incidentId: string;
  toStatus: IncidentStatusValue;
  expectedVersion: number;
  actorId: string;
  actorRole: string;
  actorLabel: string;
  /** Required when moving to RESOLVED. */
  rootCauseSummary?: string;
  remediationSteps?: string;
  assignedTo?: string | null;
  requestId?: string;
}

export async function transitionIncident(
  input: TransitionIncidentInput,
): Promise<{ id: string; status: IncidentStatusValue; version: number }> {
  const current = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, input.incidentId))
    .limit(1)
    .then((r) => r[0]);

  if (!current) throw new IncidentValidationError('Tiket insiden tidak ditemukan.');

  if (current.version !== input.expectedVersion) {
    throw new IncidentConflictError(
      'Tiket ini sudah diubah oleh pengguna lain. Muat ulang halaman sebelum menyimpan.',
      {
        id: current.id,
        status: current.status,
        version: current.version,
        updatedAt: current.updatedAt,
      },
    );
  }

  if (current.status === input.toStatus) {
    return { id: current.id, status: current.status, version: current.version };
  }

  const allowedNext = ALLOWED_TRANSITIONS[current.status] ?? [];
  if (!allowedNext.includes(input.toStatus)) {
    throw new IncidentValidationError(
      `Transisi dari ${current.status} ke ${input.toStatus} tidak diizinkan.`,
    );
  }

  const now = new Date();
  const isFirstResponse =
    current.firstRespondedAt === null && input.toStatus !== 'OPEN';
  const isResolved = input.toStatus === 'RESOLVED';

  if (isResolved) {
    const rca = (input.rootCauseSummary ?? current.rootCauseSummary ?? '').trim();
    const steps = (input.remediationSteps ?? current.remediationSteps ?? '').trim();
    if (rca.length === 0) {
      throw new IncidentValidationError(
        'Root Cause Analysis wajib diisi sebelum tiket ditandai selesai.',
      );
    }
    if (steps.length === 0) {
      throw new IncidentValidationError(
        'Langkah remediasi wajib diisi sebelum tiket ditandai selesai.',
      );
    }
  }

  const patch: Partial<typeof incidents.$inferInsert> = {
    status: input.toStatus,
    version: sql`${incidents.version} + 1` as unknown as number,
    updatedAt: now,
  };

  if (isFirstResponse) patch.firstRespondedAt = now;
  if (isResolved) patch.resolvedAt = now;
  if (input.rootCauseSummary !== undefined) {
    patch.rootCauseSummary = input.rootCauseSummary.trim();
  }
  if (input.remediationSteps !== undefined) {
    patch.remediationSteps = input.remediationSteps.trim();
  }
  if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo;

  // SLA breach bookkeeping.
  if (isResolved && current.slaResolutionDueAt) {
    if (now.getTime() > current.slaResolutionDueAt.getTime()) {
      patch.slaBreached = true;
    }
  } else if (current.slaResolutionDueAt && now.getTime() > current.slaResolutionDueAt.getTime()) {
    patch.slaBreached = true;
  }

  const updated = await db
    .update(incidents)
    .set(patch)
    .where(and(eq(incidents.id, input.incidentId), eq(incidents.version, input.expectedVersion)))
    .returning({ id: incidents.id, status: incidents.status, version: incidents.version });

  const row = updated[0];
  if (!row) {
    throw new IncidentConflictError(
      'Tiket ini sudah diubah oleh pengguna lain. Muat ulang halaman sebelum menyimpan.',
      {
        id: current.id,
        status: current.status,
        version: current.version,
        updatedAt: current.updatedAt,
      },
    );
  }

  await writeAuditLog({
    actor: { id: input.actorId, role: input.actorRole, label: input.actorLabel },
    action: 'incident.status_changed',
    entityType: 'incident',
    entityId: input.incidentId,
    summary:
      `Status tiket ${current.ticketNumber} berubah dari ${current.status} menjadi ${input.toStatus}` +
      (isResolved ? '. Analisis akar masalah dan remediasi dicatat.' : '.'),
    changes: diffChanges(
      { status: current.status, assignedTo: current.assignedTo, version: current.version },
      { status: input.toStatus, assignedTo: input.assignedTo, version: row.version },
    ),
    requestId: input.requestId ?? null,
  });

  // Slot defacement / backdoor: re-scan before restoring the asset to HEALTHY.
  if (isResolved && (current.category === 'SLOT_DEFACEMENT' || current.category === 'MALWARE_BACKDOOR')) {
    await restoreAssetHealthAfterResolution(current.assetId, input.actorId);
  }

  return { id: row.id, status: row.status, version: row.version };
}

/**
 * After a malware incident is resolved, re-verify the asset with a simulated
 * clean scan. The asset only returns to HEALTHY once that verification passes;
 * a still-compromised asset stays flagged.
 */
async function restoreAssetHealthAfterResolution(assetId: string, actorId: string): Promise<void> {
  const asset = await db
    .select()
    .from(webAssets)
    .where(eq(webAssets.id, assetId))
    .limit(1)
    .then((r) => r[0]);
  if (!asset) return;

  // Verification scan in SIMULATED mode (no outbound traffic).
  const { runAssetScan } = await import('./scannerEngine');
  const result = await runAssetScan({
    assetId,
    mode: 'SIMULATED' satisfies ScanMode,
    trigger: 'SCHEDULED',
    scenario: 'CLEAN',
    actorId,
    skipAutomation: true,
  });

  if (result.threatsDetected === 0) {
    await db
      .update(webAssets)
      .set({
        healthStatus: 'HEALTHY',
        version: sql`${webAssets.version} + 1` as unknown as number,
        updatedAt: new Date(),
      })
      .where(eq(webAssets.id, assetId));
  }
}

/* -------------------------------------------------------------------------- */
/* Comments                                                                   */
/* -------------------------------------------------------------------------- */

export interface AddCommentInput {
  incidentId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  attachmentUrl?: string | null;
}

export async function addIncidentComment(
  input: AddCommentInput,
): Promise<{ id: string }> {
  const body = input.body.trim();
  if (body.length === 0) {
    throw new IncidentValidationError('Isi komentar tidak boleh kosong.');
  }

  const id = randomUUID();
  await db.insert(incidentComments).values({
    id,
    incidentId: input.incidentId,
    authorId: input.authorId,
    body,
    isInternal: input.isInternal,
    attachmentUrl: input.attachmentUrl ?? null,
  });

  // A public reply counts as the first response for SLA purposes.
  if (!input.isInternal) {
    await db
      .update(incidents)
      .set({
        firstRespondedAt: sql`COALESCE(${incidents.firstRespondedAt}, now())`,
        status: sql`CASE WHEN ${incidents.status} = 'OPEN' THEN 'INVESTIGATING' ELSE ${incidents.status} END`,
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, input.incidentId));
  }

  const incident = await db
    .select({ ticketNumber: incidents.ticketNumber, reportedBy: incidents.reportedBy })
    .from(incidents)
    .where(eq(incidents.id, input.incidentId))
    .limit(1);

  const ticket = incident[0];
  if (ticket && !input.isInternal && ticket.reportedBy !== input.authorId) {
    await notify({
      recipientId: ticket.reportedBy,
      kind: 'INCIDENT_COMMENT',
      title: `Balasan baru pada tiket ${ticket.ticketNumber}`,
      body: body.slice(0, 200),
      entityType: 'incident',
      entityId: input.incidentId,
    });
  }

  return { id };
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

/** True for a well-formed UUID — guards a dynamic segment before it hits a uuid column. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function getIncidentById(incidentId: string) {
  // A non-UUID segment (a mistyped link, a crawler) must not reach a uuid
  // column: Postgres raises a cast error and the page 500s instead of 404ing.
  if (!isUuid(incidentId)) return null;
  const rows = await db
    .select({
      incident: incidents,
      asset: webAssets,
      reporter: profiles,
    })
    .from(incidents)
    .innerJoin(webAssets, eq(incidents.assetId, webAssets.id))
    .leftJoin(profiles, eq(incidents.reportedBy, profiles.id))
    .where(eq(incidents.id, incidentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listIncidentComments(incidentId: string) {
  return db
    .select({
      comment: incidentComments,
      author: profiles,
    })
    .from(incidentComments)
    .innerJoin(profiles, eq(incidentComments.authorId, profiles.id))
    .where(eq(incidentComments.incidentId, incidentId))
    .orderBy(desc(incidentComments.createdAt));
}

/** Attach a runbook to an incident and materialize its step checklist. */
export async function attachRunbookToIncident(input: {
  incidentId: string;
  runbookId: string;
}): Promise<{ taskCount: number }> {
  const steps = await db
    .select({ id: runbookSteps.id })
    .from(runbookSteps)
    .where(eq(runbookSteps.runbookId, input.runbookId))
    .orderBy(runbookSteps.stepOrder);

  if (steps.length === 0) throw new IncidentValidationError('Runbook belum memiliki langkah.');

  await db
    .insert(incidentRunbookTasks)
    .values(
      steps.map((s) => ({
        id: randomUUID(),
        incidentId: input.incidentId,
        runbookStepId: s.id,
      })),
    )
    .onConflictDoNothing();

  return { taskCount: steps.length };
}

export interface ToggleTaskInput {
  taskId: string;
  isDone: boolean;
  actorId: string;
  actorLabel: string;
  actorRole: string;
  notes?: string;
}

export async function toggleRunbookTask(input: ToggleTaskInput): Promise<void> {
  await db
    .update(incidentRunbookTasks)
    .set({
      isDone: input.isDone,
      doneAt: input.isDone ? new Date() : null,
      doneBy: input.isDone ? input.actorId : null,
      notes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(incidentRunbookTasks.id, input.taskId));

  const task = await db
    .select({
      incidentId: incidentRunbookTasks.incidentId,
      stepTitle: runbookSteps.title,
      ticketNumber: incidents.ticketNumber,
    })
    .from(incidentRunbookTasks)
    .innerJoin(runbookSteps, eq(incidentRunbookTasks.runbookStepId, runbookSteps.id))
    .innerJoin(incidents, eq(incidentRunbookTasks.incidentId, incidents.id))
    .where(eq(incidentRunbookTasks.id, input.taskId))
    .limit(1);

  const row = task[0];
  if (row) {
    await writeAuditLog({
      actor: { id: input.actorId, role: input.actorRole, label: input.actorLabel },
      action: 'incident.runbook_task_toggled',
      entityType: 'incident',
      entityId: row.incidentId,
      summary:
        `Langkah runbook "${row.stepTitle}" pada tiket ${row.ticketNumber} ` +
        `${input.isDone ? 'ditandai selesai' : 'dibuka kembali'}.`,
    });
  }
}

/** Load an incident with its runbook checklist and comment thread. */
export async function getIncidentWorkspace(incidentId: string) {
  const base = await getIncidentById(incidentId);
  if (!base) return null;

  const [comments, tasks] = await Promise.all([
    listIncidentComments(incidentId),
    db
      .select({
        task: incidentRunbookTasks,
        step: runbookSteps,
        runbook: runbooks,
      })
      .from(incidentRunbookTasks)
      .innerJoin(runbookSteps, eq(incidentRunbookTasks.runbookStepId, runbookSteps.id))
      .innerJoin(runbooks, eq(runbookSteps.runbookId, runbooks.id))
      .where(eq(incidentRunbookTasks.incidentId, incidentId))
      .orderBy(runbookSteps.stepOrder),
  ]);

  return { ...base, comments, tasks };
}

/** Runbooks whose category matches an incident (for the attach picker). */
export async function suggestRunbooks(category: ThreatCategoryValue) {
  return db
    .select()
    .from(runbooks)
    .where(and(eq(runbooks.category, category), eq(runbooks.isActive, true)))
    .orderBy(runbooks.title);
}

/** Active ticket count per engineer (DSS bottleneck rule). */
export async function countActiveTicketsByAssignee() {
  const rows = await db
    .select({
      assigneeId: incidents.assignedTo,
      fullName: profiles.fullName,
      role: profiles.role,
      count: sql<number>`count(*)::int`,
    })
    .from(incidents)
    .innerJoin(profiles, eq(incidents.assignedTo, profiles.id))
    .where(sql`${incidents.status} IN ('OPEN','INVESTIGATING','CONTAINED')`)
    .groupBy(incidents.assignedTo, profiles.fullName, profiles.role)
    .orderBy(sql`count(*) DESC`);
  return rows;
}
