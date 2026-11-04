import 'server-only';

import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import { idempotencyKeys } from '@/server/db/schema';
import { sql } from 'drizzle-orm';

/**
 * Idempotency for critical mutations.
 *
 * Every form that creates an incident, runs a scan, adds a credential or
 * records a DSS decision carries a client-generated requestId (UUID).
 * The row is inserted with ON CONFLICT DO NOTHING, so a double click or a
 * retried request cannot execute the mutation twice.
 */

export type MutationScope =
  | 'incident.create'
  | 'incident.update'
  | 'incident.comment'
  | 'scan.run'
  | 'vault.create'
  | 'vault.rotate'
  | 'dss.decision'
  | 'asset.create'
  | 'asset.update';

export type IdempotencyOutcome<T> =
  | { status: 'executed'; result: T }
  | { status: 'replayed'; result: T | null; createdAt: Date }
  | { status: 'conflict'; createdAt: Date };

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';
  readonly scope: MutationScope;
  readonly requestId: string;
  readonly createdAt: Date;

  constructor(scope: MutationScope, requestId: string, createdAt: Date) {
    super(
      `Permintaan dengan requestId ${requestId} sudah pernah diproses pada ${createdAt.toISOString()}.`,
    );
    this.name = 'IdempotencyConflictError';
    this.scope = scope;
    this.requestId = requestId;
    this.createdAt = createdAt;
  }
}

/** Generate a fresh request id (UUID v4). */
export function newRequestId(): string {
  return randomUUID();
}

/**
 * Claim a request id.
 *
 * @returns 'claimed' when this caller owns the mutation,
 *          'replayed' when a previous identical request already completed,
 *          'conflict' when the id is in use without a stored response.
 */
export async function claimRequest(
  scope: MutationScope,
  requestId: string,
): Promise<
  | { status: 'claimed' }
  | { status: 'replayed'; response: unknown; createdAt: Date }
  | { status: 'conflict'; createdAt: Date }
> {
  if (!requestId || requestId.trim().length === 0) {
    throw new Error('requestId wajib diisi untuk operasi idempoten.');
  }

  const rows = await db
    .insert(idempotencyKeys)
    .values({ scope, requestId: requestId.trim() })
    .onConflictDoNothing({ target: [idempotencyKeys.scope, idempotencyKeys.requestId] })
    .returning({ id: idempotencyKeys.id });

  if (rows.length > 0) return { status: 'claimed' };

  const existing = await db
    .select({
      responseJson: idempotencyKeys.responseJson,
      createdAt: idempotencyKeys.createdAt,
    })
    .from(idempotencyKeys)
    .where(
      sql`${idempotencyKeys.scope} = ${scope} AND ${idempotencyKeys.requestId} = ${requestId.trim()}`,
    )
    .limit(1);

  const row = existing[0];
  if (!row) {
    // Lost a race with another claimant; treat as conflict so the caller can
    // surface a clear message instead of silently double-executing.
    return { status: 'conflict', createdAt: new Date() };
  }

  if (row.responseJson === null || row.responseJson === undefined) {
    return { status: 'conflict', createdAt: row.createdAt };
  }

  return { status: 'replayed', response: row.responseJson, createdAt: row.createdAt };
}

/** Store the result so a replay can return it without re-running the mutation. */
export async function storeRequestResponse(
  scope: MutationScope,
  requestId: string,
  response: unknown,
): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({ responseJson: response as never })
    .where(
      sql`${idempotencyKeys.scope} = ${scope} AND ${idempotencyKeys.requestId} = ${requestId}`,
    );
}

/** Release a claim (used when the mutation fails and should be retryable). */
export async function releaseRequest(scope: MutationScope, requestId: string): Promise<void> {
  await db
    .delete(idempotencyKeys)
    .where(
      sql`${idempotencyKeys.scope} = ${scope} AND ${idempotencyKeys.requestId} = ${requestId}`,
    );
}

/**
 * Run a mutation idempotently.
 *
 * On replay the stored response is returned verbatim, so the UI can show the
 * same confirmation without a duplicate row being created.
 */
export async function withIdempotency<T>(
  scope: MutationScope,
  requestId: string,
  mutation: () => Promise<T>,
): Promise<{ replayed: boolean; result: T }> {
  const claim = await claimRequest(scope, requestId);

  if (claim.status === 'replayed') {
    return { replayed: true, result: claim.response as T };
  }
  if (claim.status === 'conflict') {
    throw new IdempotencyConflictError(scope, requestId, claim.createdAt);
  }

  try {
    const result = await mutation();
    await storeRequestResponse(scope, requestId, result);
    return { replayed: false, result };
  } catch (err) {
    await releaseRequest(scope, requestId);
    throw err;
  }
}

/** Housekeeping: drop claims older than 7 days. */
export async function pruneIdempotencyKeys(olderThanDays = 7): Promise<number> {
  const result = await db
    .delete(idempotencyKeys)
    .where(
      sql`${idempotencyKeys.createdAt} < now() - make_interval(days => ${olderThanDays})`,
    );
  return 0;
}
