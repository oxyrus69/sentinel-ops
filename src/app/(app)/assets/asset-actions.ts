'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/server/auth/session';
import { requireRole, ASSET_MANAGE_ROLES, type UserRole } from '@/server/rbac';
import { runAssetScan, type ScanScenario } from '@/server/services/scannerEngine';
import { createAsset } from '@/server/services/assets';
import { writeAuditLog } from '@/server/audit';
import { withIdempotency } from '@/server/idempotency';
import { parseInput, assetCreateSchema } from '@/server/validation';
import type { PlatformType } from '@/server/db/schema';

/**
 * Scan and create actions for the asset module.
 *
 * Scans run in SIMULATED mode: the real detection engine analyzes a preset
 * document, so no outbound request leaves the machine while the demo still
 * exercises every code path (findings, health transition, auto-ticket).
 */

export interface ScanResult {
  ok: boolean;
  error?: string;
  data?: {
    threatsDetected: number;
    summary: string;
    healthStatus: string;
    incidentId: string | null;
    ticketNumber: string | null;
  };
}

export async function runScanAction(input: {
  assetId: string;
  scenario: ScanScenario;
  requestId: string;
}): Promise<ScanResult> {
  const user = await getSessionUser();
  try {
    requireRole(user, ASSET_MANAGE_ROLES);
  } catch {
    return {
      ok: false,
      error: 'Hanya SecOps Engineer dan Super Admin yang dapat menjalankan pemindaian.',
    };
  }

  try {
    const result = await withIdempotency('scan.run', input.requestId, () =>
      runAssetScan({
        assetId: input.assetId,
        mode: 'SIMULATED',
        trigger: 'MANUAL',
        scenario: input.scenario,
        actorId: user!.id,
      }),
    );

    await writeAuditLog({
      actor: { id: user!.id, role: user!.role as UserRole, label: user!.fullName },
      action: 'scan.completed',
      entityType: 'web_asset',
      entityId: input.assetId,
      summary: `Pemindaian manual (skenario ${input.scenario}) selesai: ${result.result.threatsDetected} temuan, status aset ${result.result.healthStatus}.`,
      requestId: input.requestId,
    });

    revalidatePath(`/assets/${input.assetId}`);
    revalidatePath('/assets');
    revalidatePath('/admin');
    revalidatePath('/incidents');

    return {
      ok: true,
      data: {
        threatsDetected: result.result.threatsDetected,
        summary: result.result.summary,
        healthStatus: result.result.healthStatus,
        incidentId: result.result.incidentId,
        ticketNumber: result.result.ticketNumber,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Pemindaian gagal dijalankan.',
    };
  }
}

export interface CreateAssetResult {
  ok: boolean;
  error?: string;
  code?: 'VALIDATION_ERROR' | 'ACCESS_DENIED' | 'UNKNOWN';
  data?: { id: string };
}

export async function createAssetAction(input: {
  clientId: string;
  name: string;
  domainUrl: string;
  platform: PlatformType;
  platformVersion?: string;
  serverIp?: string;
  hostingProvider?: string;
  sslExpiryDate?: string;
  requestId: string;
}): Promise<CreateAssetResult> {
  const user = await getSessionUser();
  try {
    requireRole(user, ASSET_MANAGE_ROLES);
  } catch {
    return {
      ok: false,
      code: 'ACCESS_DENIED',
      error: 'Hanya SecOps Engineer dan Super Admin yang dapat menambah aset.',
    };
  }

  const parsed = parseInput(assetCreateSchema, input);
  if (!parsed.ok) {
    return { ok: false, code: 'VALIDATION_ERROR', error: parsed.error };
  }

  try {
    const result = await withIdempotency('asset.create', input.requestId, () =>
      createAsset(
        {
          clientId: parsed.data.clientId,
          name: parsed.data.name,
          domainUrl: parsed.data.domainUrl,
          platform: parsed.data.platform,
          platformVersion: parsed.data.platformVersion,
          serverIp: parsed.data.serverIp,
          hostingProvider: parsed.data.hostingProvider,
          sslExpiryDate: parsed.data.sslExpiryDate,
        },
        { id: user!.id, role: user!.role as UserRole, label: user!.fullName },
      ),
    );

    revalidatePath('/assets');
    return { ok: true, data: { id: result.result.id } };
  } catch (err) {
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Aset gagal disimpan.',
    };
  }
}
