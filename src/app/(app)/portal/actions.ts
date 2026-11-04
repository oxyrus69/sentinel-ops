'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/server/auth/session';
import { requireRole, type UserRole } from '@/server/rbac';
import { createClientIncidentReport } from '@/server/services/portal';
import { withIdempotency } from '@/server/idempotency';
import { parseInput, clientIncidentReportSchema } from '@/server/validation';

/**
 * Client-reported incidents.
 *
 * A client can only report a subset of categories, cannot choose severity
 * (forced to MEDIUM by the service), and can only target their own assets —
 * ownership is re-checked server-side in createClientIncidentReport.
 */

export interface ReportResult {
  ok: boolean;
  error?: string;
  data?: { ticketNumber: string };
}

export async function reportIncidentAction(input: {
  assetId: string;
  title: string;
  description: string;
  category: string;
  requestId: string;
}): Promise<ReportResult> {
  const user = await getSessionUser();
  try {
    requireRole(user, ['CLIENT_OWNER']);
  } catch {
    return { ok: false, error: 'Hanya pemilik klien yang dapat melaporkan insiden.' };
  }

  const parsed = parseInput(clientIncidentReportSchema, input);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  try {
    const result = await withIdempotency('incident.create', input.requestId, () =>
      createClientIncidentReport({
        assetId: parsed.data.assetId,
        reportedBy: user!.id,
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
      }),
    );

    revalidatePath('/portal');
    revalidatePath('/incidents');
    return { ok: true, data: { ticketNumber: result.result.ticketNumber } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Laporan gagal dikirim.',
    };
  }
}

export type { UserRole };
