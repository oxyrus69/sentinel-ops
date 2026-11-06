import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  incidentRunbookTasks,
  incidents,
  runbookSteps,
  runbooks,
  type ThreatCategory,
} from '@/server/db/schema';
import { writeAuditLog } from '@/server/audit';

/**
 * Runbook library.
 *
 * A runbook is a reusable checklist for one threat category. The list query
 * counts steps and the number of incidents that currently carry a task from
 * that runbook, so operators can see which procedures are actually in use
 * before editing them.
 */

export interface RunbookListItem {
  runbook: typeof runbooks.$inferSelect;
  stepCount: number;
  /** Distinct incidents with at least one task built from this runbook. */
  usageCount: number;
}

export async function listRunbooks(filter: {
  category?: ThreatCategory;
  activeOnly?: boolean;
} = {}): Promise<RunbookListItem[]> {
  const conditions = [];
  if (filter.category) conditions.push(eq(runbooks.category, filter.category));
  if (filter.activeOnly) conditions.push(eq(runbooks.isActive, true));

  return db
    .select({
      runbook: runbooks,
      // Correlated subqueries must qualify the outer table explicitly: an
      // interpolated column can render as bare `"id"`, which the planner
      // rejects as ambiguous when the subquery also has an `id`.
      stepCount: sql<number>`(
        SELECT count(*)::int FROM runbook_steps AS st
        WHERE st.runbook_id = "runbooks"."id"
      )`,
      usageCount: sql<number>`(
        SELECT count(DISTINCT irt.incident_id)::int
        FROM incident_runbook_tasks irt
        JOIN runbook_steps rs ON rs.id = irt.runbook_step_id
        WHERE rs.runbook_id = "runbooks"."id"
      )`,
    })
    .from(runbooks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(runbooks.title);
}

/** True for a well-formed UUID — guards a dynamic segment before it hits a uuid column. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function getRunbookById(id: string) {
  // A non-UUID segment (a mistyped link, a crawler) must not reach a uuid
  // column: Postgres raises a cast error and the page 500s instead of 404ing.
  if (!isUuid(id)) return null;
  const row = await db
    .select({ runbook: runbooks })
    .from(runbooks)
    .where(eq(runbooks.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!row) return null;

  const steps = await db
    .select()
    .from(runbookSteps)
    .where(eq(runbookSteps.runbookId, id))
    .orderBy(runbookSteps.stepOrder);

  return { ...row, steps };
}

export async function getRunbookBySlug(slug: string) {
  const row = await db
    .select({ id: runbooks.id })
    .from(runbooks)
    .where(eq(runbooks.slug, slug))
    .limit(1)
    .then((r) => r[0]);

  if (!row) return null;
  return getRunbookById(row.id);
}

export interface CreateRunbookStepInput {
  title: string;
  detail?: string;
  requiresEvidence?: boolean;
}

export interface CreateRunbookInput {
  title: string;
  slug: string;
  category: ThreatCategory;
  summary?: string;
  estimatedMinutes?: number;
  steps: CreateRunbookStepInput[];
}

export async function createRunbook(
  input: CreateRunbookInput,
  actor: { id: string; role: string; label: string },
): Promise<{ id: string }> {
  const title = input.title.trim();
  const slug = input.slug.trim();

  if (title.length === 0) throw new Error('Judul runbook tidak boleh kosong.');
  if (slug.length === 0) throw new Error('Slug runbook tidak boleh kosong.');
  if (input.steps.length === 0) {
    throw new Error('Runbook harus memiliki minimal satu langkah.');
  }

  const taken = await db
    .select({ id: runbooks.id })
    .from(runbooks)
    .where(eq(runbooks.slug, slug))
    .limit(1)
    .then((r) => r[0]);

  if (taken) throw new Error(`Slug "${slug}" sudah dipakai runbook lain.`);

  const id = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(runbooks).values({
      id,
      title,
      slug,
      category: input.category,
      summary: input.summary?.trim() || null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      isActive: true,
      createdBy: actor.id,
    });

    await tx.insert(runbookSteps).values(
      input.steps.map((step, index) => ({
        id: randomUUID(),
        runbookId: id,
        stepOrder: index + 1,
        title: step.title.trim(),
        detail: step.detail?.trim() || null,
        requiresEvidence: step.requiresEvidence ?? false,
      })),
    );
  });

  await writeAuditLog({
    actor,
    action: 'runbook.created',
    entityType: 'runbook',
    entityId: id,
    summary:
      `Runbook "${title}" (${input.category}) dibuat dengan ${input.steps.length} langkah.`,
  });

  return { id };
}

export interface UpdateRunbookInput {
  id: string;
  title?: string;
  summary?: string;
  estimatedMinutes?: number;
  isActive?: boolean;
  steps?: CreateRunbookStepInput[];
}

export async function updateRunbook(
  input: UpdateRunbookInput,
  actor: { id: string; role: string; label: string },
): Promise<void> {
  const current = await db
    .select({ title: runbooks.title })
    .from(runbooks)
    .where(eq(runbooks.id, input.id))
    .limit(1)
    .then((r) => r[0]);

  if (!current) throw new Error('Runbook tidak ditemukan.');

  if (input.steps !== undefined && input.steps.length === 0) {
    throw new Error('Runbook harus memiliki minimal satu langkah.');
  }

  const patch: Partial<typeof runbooks.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.summary !== undefined) patch.summary = input.summary.trim() || null;
  if (input.estimatedMinutes !== undefined) patch.estimatedMinutes = input.estimatedMinutes;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  await db.transaction(async (tx) => {
    await tx.update(runbooks).set(patch).where(eq(runbooks.id, input.id));

    if (input.steps !== undefined) {
      // Replacing the checklist: the old rows are dropped and re-inserted so
      // stepOrder stays contiguous from 1.
      await tx.delete(runbookSteps).where(eq(runbookSteps.runbookId, input.id));

      await tx.insert(runbookSteps).values(
        input.steps.map((step, index) => ({
          id: randomUUID(),
          runbookId: input.id,
          stepOrder: index + 1,
          title: step.title.trim(),
          detail: step.detail?.trim() || null,
          requiresEvidence: step.requiresEvidence ?? false,
        })),
      );
    }
  });

  await writeAuditLog({
    actor,
    action: 'runbook.updated',
    entityType: 'runbook',
    entityId: input.id,
    summary:
      `Runbook "${current.title}" diperbarui` +
      (input.steps !== undefined ? ` (${input.steps.length} langkah diganti)` : '') +
      (input.isActive === false ? ' dan dinonaktifkan' : '') +
      '.',
  });
}

/**
 * Delete a runbook.
 *
 * Refused while any incident still references its steps: the incident_runbook_tasks
 * rows are the operator's progress record, and removing them silently would lose
 * evidence of work already done on a live ticket.
 */
export async function deleteRunbook(
  id: string,
  actor: { id: string; role: string; label: string },
): Promise<void> {
  const current = await db
    .select({ title: runbooks.title })
    .from(runbooks)
    .where(eq(runbooks.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!current) throw new Error('Runbook tidak ditemukan.');

  const inUse = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(incidentRunbookTasks)
    .innerJoin(runbookSteps, eq(incidentRunbookTasks.runbookStepId, runbookSteps.id))
    .where(eq(runbookSteps.runbookId, id))
    .limit(1)
    .then((r) => r[0]?.count ?? 0);

  if (inUse > 0) {
    throw new Error(
      `Runbook "${current.title}" masih dipakai pada ${inUse} langkah tiket insiden aktif. ` +
        'Nonaktifkan runbook saja bila tidak ingin dipilih lagi.',
    );
  }

  await db.delete(runbooks).where(eq(runbooks.id, id));

  await writeAuditLog({
    actor,
    action: 'runbook.updated',
    entityType: 'runbook',
    entityId: id,
    summary: `Runbook "${current.title}" dihapus dari pustaka.`,
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Newest incidents that already carry a task from this runbook. */
export async function listRunbookIncidents(runbookId: string, limit = 10) {
  return db
    .select({
      ticketNumber: incidents.ticketNumber,
      title: incidents.title,
      status: incidents.status,
      severity: incidents.severity,
      createdAt: incidents.createdAt,
    })
    .from(incidentRunbookTasks)
    .innerJoin(runbookSteps, eq(incidentRunbookTasks.runbookStepId, runbookSteps.id))
    .innerJoin(incidents, eq(incidentRunbookTasks.incidentId, incidents.id))
    .where(eq(runbookSteps.runbookId, runbookId))
    .orderBy(desc(incidents.createdAt))
    .limit(limit);
}
