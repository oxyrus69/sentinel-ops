'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, ASSET_MANAGE_ROLES, AccessDeniedError } from '@/server/rbac';
import { getSessionUser } from '@/server/auth/session';
import {
  AssetConflictError,
  deleteAsset,
  updateAsset,
  type UpdateAssetInput,
} from '@/server/services/assets';
import { platformType, type PlatformType } from '@/server/db/schema';
import { withIdempotency, IdempotencyConflictError } from '@/server/idempotency';

/**
 * Edit and delete an asset.
 *
 * Both actions require an asset-managing role, both run under an idempotency
 * scope, and both leave the audit row to the service — writing a second one here
 * would double-count the change in the audit trail.
 *
 * Update uses optimistic locking: a stale expectedVersion comes back as
 * code 'CONFLICT' with the latest version so the UI can reload and retry.
 */

export interface AssetMutationFailure {
  ok: false;
  error: string;
  code: 'CONFLICT' | 'VALIDATION_ERROR' | 'ACCESS_DENIED' | 'UNKNOWN';
  data: { latestVersion?: number };
}

export type UpdateAssetResponse = { ok: true; data: { version: number } } | AssetMutationFailure;

export type DeleteAssetResponse =
  | { ok: true; data: { deleted: true } }
  | { ok: false; error: string; code: 'ACCESS_DENIED' | 'VALIDATION_ERROR' | 'UNKNOWN' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export async function updateAssetAction(
  assetId: string,
  expectedVersion: number,
  formData: FormData,
  requestId: string,
): Promise<UpdateAssetResponse> {
  try {
    const sessionUser = await getSessionUser();
    const actor = requireRole(sessionUser, ASSET_MANAGE_ROLES);
    const label = sessionUser?.fullName ?? 'Pengguna tidak dikenal';

    if (!UUID_RE.test(assetId)) {
      return fail('Aset tidak valid.', 'VALIDATION_ERROR');
    }
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return fail('Versi aset tidak valid. Muat ulang halaman.', 'CONFLICT');
    }

    const parsed = parseUpdateForm(assetId, expectedVersion, formData);
    if (!parsed.ok) return fail(parsed.error, 'VALIDATION_ERROR');

    const outcome = await withIdempotency<{ version: number }>('asset.update', requestId, async () => {
      await updateAsset(parsed.input, { id: actor.id, role: actor.role, label });
      return { version: expectedVersion + 1 };
    });

    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/assets');

    return { ok: true, data: outcome.result };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return fail(err.message, 'ACCESS_DENIED');
    }
    if (err instanceof AssetConflictError) {
      return fail(err.message, 'CONFLICT');
    }
    if (err instanceof IdempotencyConflictError) {
      return fail('Perubahan ini sudah diproses sebelumnya. Muat ulang halaman.', 'CONFLICT');
    }
    return fail(toMessage(err), 'UNKNOWN');
  }
}

export async function deleteAssetAction(
  assetId: string,
  requestId: string,
): Promise<DeleteAssetResponse> {
  try {
    const sessionUser = await getSessionUser();
    const actor = requireRole(sessionUser, ASSET_MANAGE_ROLES);
    const label = sessionUser?.fullName ?? 'Pengguna tidak dikenal';

    if (!UUID_RE.test(assetId)) {
      return { ok: false, error: 'Aset tidak valid.', code: 'VALIDATION_ERROR' };
    }

    await withIdempotency<{ deleted: true }>('asset.update', requestId, async () => {
      await deleteAsset(assetId, { id: actor.id, role: actor.role, label });
      return { deleted: true };
    });

    revalidatePath('/assets');
    revalidatePath(`/assets/${assetId}`);

    return { ok: true, data: { deleted: true } };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return { ok: false, error: err.message, code: 'ACCESS_DENIED' };
    }
    if (err instanceof IdempotencyConflictError) {
      return {
        ok: false,
        error: 'Penghapusan ini sudah diproses sebelumnya.',
        code: 'UNKNOWN',
      };
    }
    return { ok: false, error: toMessage(err), code: 'UNKNOWN' };
  }
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

type ParseResult = { ok: true; input: UpdateAssetInput } | { ok: false; error: string };

function parseUpdateForm(
  assetId: string,
  expectedVersion: number,
  formData: FormData,
): ParseResult {
  const name = readText(formData, 'name', 160);
  const domainRaw = readText(formData, 'domainUrl', 255);
  const platformRaw = readText(formData, 'platform', 40);
  const platformVersion = readText(formData, 'platformVersion', 40);
  const serverIp = readText(formData, 'serverIp', 64);
  const hostingProvider = readText(formData, 'hostingProvider', 120);
  const sslExpiryRaw = readText(formData, 'sslExpiryDate', 20);

  if (!name) return { ok: false, error: 'Nama aset wajib diisi.' };
  if (name.length < 3) return { ok: false, error: 'Nama aset minimal 3 karakter.' };

  if (!domainRaw) return { ok: false, error: 'Domain wajib diisi.' };
  const domainUrl = normalizeDomain(domainRaw);
  if (domainUrl === null) {
    return { ok: false, error: 'Domain harus berupa hostname atau URL valid.' };
  }

  if (!isPlatform(platformRaw)) {
    return { ok: false, error: 'Platform yang dipilih tidak dikenal.' };
  }

  if (serverIp && !IPV4_RE.test(serverIp)) {
    return { ok: false, error: 'Server IP harus berupa alamat IPv4 yang valid.' };
  }

  let sslExpiryDate: Date | null = null;
  if (sslExpiryRaw) {
    const parsed = new Date(`${sslExpiryRaw}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: 'Tanggal kedaluwarsa SSL tidak valid.' };
    }
    sslExpiryDate = parsed;
  }

  return {
    ok: true,
    input: {
      assetId,
      expectedVersion,
      name,
      domainUrl,
      platform: platformRaw,
      platformVersion: platformVersion || null,
      serverIp: serverIp || null,
      hostingProvider: hostingProvider || null,
      sslExpiryDate,
    },
  };
}

function readText(formData: FormData, key: string, max: number): string {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeDomain(input: string): string | null {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;

  const host = parsed.hostname.toLowerCase();
  if (IPV4_RE.test(host)) return withScheme;
  if (!HOSTNAME_RE.test(host)) return null;
  return withScheme;
}

function isPlatform(value: string): value is PlatformType {
  return (platformType.enumValues as readonly string[]).includes(value);
}

function fail(error: string, code: AssetMutationFailure['code']): AssetMutationFailure {
  return { ok: false, error, code, data: {} };
}

function toMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  return 'Terjadi kesalahan yang tidak terduga.';
}
