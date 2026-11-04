import 'server-only';

import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';

/**
 * Meaningful audit trail.
 *
 * Every status change, rule change, asset deletion and every vault secret
 * reveal must land here with a human-readable Indonesian summary.
 */

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'asset.created'
  | 'asset.updated'
  | 'asset.deleted'
  | 'asset.status_changed'
  | 'scan.started'
  | 'scan.completed'
  | 'scan.rule_created'
  | 'scan.rule_updated'
  | 'scan.rule_deleted'
  | 'incident.created'
  | 'incident.updated'
  | 'incident.status_changed'
  | 'incident.assigned'
  | 'incident.commented'
  | 'incident.runbook_task_toggled'
  | 'incident.resolved'
  | 'vault.credential_created'
  | 'vault.credential_updated'
  | 'vault.credential_rotated'
  | 'vault.secret_revealed'
  | 'vault.secret_copied'
  | 'runbook.created'
  | 'runbook.updated'
  | 'dss.rule_updated'
  | 'dss.decision_recorded'
  | 'settings.updated'
  | 'export.csv'
  | 'report.printed';

export interface AuditActor {
  id: string | null;
  role: string | null;
  label: string | null;
}

export interface AuditEntryInput {
  actor: AuditActor;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Indonesian sentence shown in the audit table. */
  summary: string;
  /** Structured before/after diff for detail drill-down. */
  changes?: Record<string, { from?: unknown; to?: unknown }> | null;
  requestId?: string | null;
}

/**
 * Append an audit row. Never throws: a failed audit write must not roll back
 * the user's real operation, but it is surfaced to the server log.
 */
export async function writeAuditLog(entry: AuditEntryInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: entry.actor.id,
      actorRole: entry.actor.role as never,
      actorLabel: entry.actor.label,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      changesJson: entry.changes ? (entry.changes as never) : null,
      requestId: entry.requestId ?? null,
    });
  } catch (err) {
    console.error('[audit] gagal menulis jejak audit:', err);
  }
}

/** Build a before/after diff limited to the keys that actually changed. */
export function diffChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from?: unknown; to?: unknown }> {
  const out: Record<string, { from?: unknown; to?: unknown }> = {};
  for (const [key, to] of Object.entries(after)) {
    const from = before[key];
    if (from === to) continue;
    if (isEqualish(from, to)) continue;
    out[key] = { from: normalizeForLog(from), to: normalizeForLog(to) };
  }
  return out;
}

function isEqualish(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a === null && b === undefined) return true;
  if (a === undefined && b === null) return true;
  return false;
}

function normalizeForLog(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return null;
  return v;
}

/** Human-readable summary helper for status transitions. */
export function statusChangeSummary(
  entityLabel: string,
  from: string,
  to: string,
  extra?: string,
): string {
  const base = `Status ${entityLabel} berubah dari ${from} menjadi ${to}`;
  return extra ? `${base}. ${extra}` : `${base}.`;
}
