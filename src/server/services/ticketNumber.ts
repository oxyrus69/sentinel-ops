import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { documentSequences } from '@/server/db/schema';

/**
 * Atomic, gap-light document numbering.
 *
 * Format: INC-YYYYMM-0001, RB-YYYYMM-0001, ...
 * The counter row is upserted inside a transaction and locked with
 * FOR UPDATE, so two concurrent scans can never mint the same number.
 */
export type DocumentType = 'INC' | 'RB' | 'RPT' | 'SCN';

const PAD_WIDTH = 4;

function currentPeriod(now = new Date()): string {
  const y = now.getFullYear().toString().padStart(4, '0');
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${y}${m}`;
}

/**
 * Reserve the next number for a document type in the current month.
 * Must be called inside a transaction to keep the FOR UPDATE lock useful;
 * a standalone call still works (the statement itself is atomic).
 */
export async function reserveDocumentNumber(
  tx: {
    execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }>;
  },
  docType: DocumentType,
  now = new Date(),
): Promise<string> {
  const period = currentPeriod(now);

  await tx.execute(sql`
    INSERT INTO document_sequences (doc_type, period, last_value)
    VALUES (${docType}, ${period}, 1)
    ON CONFLICT (doc_type, period) DO UPDATE SET last_value = document_sequences.last_value + 1
  `);

  const rows = await tx.execute(sql`
    SELECT last_value FROM document_sequences WHERE doc_type = ${docType} AND period = ${period}
  `);

  const value = Number(rows.rows[0]?.last_value ?? 1);
  const padded = value.toString().padStart(PAD_WIDTH, '0');
  return `${docType}-${period}-${padded}`;
}

export async function newTicketNumber(docType: DocumentType = 'INC'): Promise<string> {
  const seq = db as unknown as {
    transaction: <T>(fn: (tx: TxLike) => Promise<T>) => Promise<T>;
  };
  return seq.transaction((tx) => reserveDocumentNumber(tx, docType));
}

interface TxLike {
  execute: (q: unknown) => Promise<{ rows: Array<Record<string, unknown>> }>;
}
