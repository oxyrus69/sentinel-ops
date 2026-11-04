'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, ASSET_MANAGE_ROLES, AccessDeniedError } from '@/server/rbac';
import { getSessionUser } from '@/server/auth/session';
import {
  runAssetScan,
  SCAN_SCENARIOS,
  type ScanScenario,
} from '@/server/services/scannerEngine';
import { withIdempotency, IdempotencyConflictError } from '@/server/idempotency';

/**
 * Manual scan.
 *
 * Runs in SIMULATED mode: a preset document is analyzed by the real detection
 * engine. No outbound request leaves the server, and the result still creates an
 * incident through the same alert-to-ticket path a live scan would use.
 */

export interface RunScanPayload {
  threatsDetected: number;
  summary: string;
  healthStatus: 'HEALTHY' | 'WARNING' | 'COMPROMISED' | 'DOWN' | 'MAINTENANCE';
  incidentId: string | null;
  ticketNumber: string | null;
}

export interface RunScanResponse {
  ok: boolean;
  data?: RunScanPayload;
  error?: string;
  code?: 'CONFLICT' | 'VALIDATION_ERROR' | 'ACCESS_DENIED' | 'UNKNOWN';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runScanAction(
  assetId: string,
  scenario: ScanScenario,
  requestId: string,
): Promise<RunScanResponse> {
  try {
    const sessionUser = await getSessionUser();
    const actor = requireRole(sessionUser, ASSET_MANAGE_ROLES);

    if (!UUID_RE.test(assetId)) {
      return { ok: false, error: 'Aset tidak valid.', code: 'VALIDATION_ERROR' };
    }
    if (!isScenario(scenario)) {
      return { ok: false, error: 'Skenario pemindaian tidak dikenal.', code: 'VALIDATION_ERROR' };
    }

    const outcome = await withIdempotency<RunScanPayload>('scan.run', requestId, async () => {
      const result = await runAssetScan({
        assetId,
        mode: 'SIMULATED',
        trigger: 'MANUAL',
        scenario,
        actorId: actor.id,
      });

      return {
        threatsDetected: result.threatsDetected,
        summary: result.summary,
        healthStatus: result.healthStatus,
        incidentId: result.incidentId,
        ticketNumber: result.ticketNumber,
      };
    });

    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/assets');

    return { ok: true, data: outcome.result };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return { ok: false, error: err.message, code: 'ACCESS_DENIED' };
    }
    if (err instanceof IdempotencyConflictError) {
      return {
        ok: false,
        error: 'Pemindaian ini sudah dijalankan. Tunggu hasilnya muncul sebelum mencoba lagi.',
        code: 'CONFLICT',
      };
    }
    return { ok: false, error: toMessage(err), code: 'UNKNOWN' };
  }
}

function isScenario(value: string): value is ScanScenario {
  return SCAN_SCENARIOS.some((preset) => preset.id === value);
}

function toMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  return 'Pemindaian gagal dijalankan karena kesalahan yang tidak terduga.';
}
