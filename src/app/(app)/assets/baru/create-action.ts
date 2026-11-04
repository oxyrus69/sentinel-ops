'use server';

import { requireRole, ASSET_MANAGE_ROLES, AccessDeniedError } from '@/server/rbac';
import { getSessionUser } from '@/server/auth/session';
import { createAsset, type CreateAssetInput } from '@/server/services/assets';
import { platformType, type PlatformType } from '@/server/db/schema';
import { withIdempotency, IdempotencyConflictError } from '@/server/idempotency';

/**
 * Create an asset.
 *
 * Validation lives here rather than only in the browser: the client form is a
 * convenience, this function is the contract. The mutation runs inside
 * withIdempotency so a double submit or a retried request cannot insert two
 * rows. The audit row is written by createAsset() itself, never here.
 */

export interface CreateAssetActionResult {
  id: string;
  slug: string;
}

export interface CreateAssetResponse {
  ok: boolean;
  data?: CreateAssetActionResult;
  error?: string;
  code?: 'CONFLICT' | 'VALIDATION_ERROR' | 'ACCESS_DENIED' | 'UNKNOWN';
}

const MAX_NAME = 160;
const MAX_DOMAIN = 255;
const MAX_VERSION = 40;
const MAX_IP = 64;
const MAX_HOSTING = 120;

/** Hostname or full http(s) URL. Rejects scheme-less oddities like "foo bar". */
const HOSTNAME_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export async function createAssetAction(
  formData: FormData,
  requestId: string,
): Promise<CreateAssetResponse> {
  try {
    const sessionUser = await getSessionUser();
    const actor = requireRole(sessionUser, ASSET_MANAGE_ROLES);
    const label = sessionUser?.fullName ?? 'Pengguna tidak dikenal';

    const validation = validateCreateForm(formData);
    if (!validation.ok) {
      return { ok: false, error: validation.error, code: 'VALIDATION_ERROR' };
    }

    const outcome = await withIdempotency<CreateAssetActionResult>(
      'asset.create',
      requestId,
      () =>
        createAsset(validation.input, {
          id: actor.id,
          role: actor.role,
          label,
        }),
    );

    return { ok: true, data: outcome.result };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return { ok: false, error: err.message, code: 'ACCESS_DENIED' };
    }
    if (err instanceof IdempotencyConflictError) {
      return {
        ok: false,
        error: 'Formulir ini sudah dikirim sebelumnya. Muat ulang halaman dan coba lagi.',
        code: 'CONFLICT',
      };
    }
    return { ok: false, error: toMessage(err), code: 'UNKNOWN' };
  }
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

interface ValidationSuccess {
  ok: true;
  input: CreateAssetInput;
}

interface ValidationFailure {
  ok: false;
  error: string;
}

function validateCreateForm(formData: FormData): ValidationSuccess | ValidationFailure {
  const name = readText(formData, 'name', MAX_NAME);
  const domainRaw = readText(formData, 'domainUrl', MAX_DOMAIN);
  const clientId = readText(formData, 'clientId', 64);
  const platformRaw = readText(formData, 'platform', 40);
  const platformVersion = readText(formData, 'platformVersion', MAX_VERSION);
  const serverIp = readText(formData, 'serverIp', MAX_IP);
  const hostingProvider = readText(formData, 'hostingProvider', MAX_HOSTING);
  const sslExpiryRaw = readText(formData, 'sslExpiryDate', 20);

  if (!name) return { ok: false, error: 'Nama aset wajib diisi.' };
  if (name.length < 3) return { ok: false, error: 'Nama aset minimal 3 karakter.' };

  if (!domainRaw) return { ok: false, error: 'Domain wajib diisi.' };
  const cleanedDomain = normalizeDomain(domainRaw);
  if (cleanedDomain === null) {
    return { ok: false, error: 'Domain harus berupa hostname atau URL valid, misalnya jurnal.kampus.ac.id.' };
  }

  if (!clientId) return { ok: false, error: 'Klien wajib dipilih.' };
  if (!isUuid(clientId)) return { ok: false, error: 'Klien yang dipilih tidak valid.' };

  if (!platformRaw) return { ok: false, error: 'Platform wajib dipilih.' };
  if (!isPlatform(platformRaw)) {
    return { ok: false, error: 'Platform yang dipilih tidak dikenal.' };
  }

  if (serverIp && !IPV4_RE.test(serverIp)) {
    return { ok: false, error: 'Server IP harus berupa alamat IPv4 yang valid, misalnya 103.44.12.8.' };
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
      clientId,
      name,
      domainUrl: cleanedDomain,
      platform: platformRaw as PlatformType,
      platformVersion: platformVersion || undefined,
      serverIp: serverIp || undefined,
      hostingProvider: hostingProvider || undefined,
      sslExpiryDate,
    },
  };
}

function readText(formData: FormData, key: string, max: number): string {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return '';
  // Strip control characters, collapse runs of whitespace, cap length.
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Accept a bare hostname or a full URL; return a normalised URL or null. */
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
  if (parsed.port && !/^\d{2,5}$/.test(parsed.port)) return null;

  const host = parsed.hostname.toLowerCase();
  if (IPV4_RE.test(host)) return withScheme;
  if (!HOSTNAME_RE.test(host)) return null;
  // A bare "localhost" or "foo" without a dot is not a real web asset domain.
  if (!host.includes('.')) return null;

  return withScheme;
}

function isPlatform(value: string): value is PlatformType {
  return (platformType.enumValues as readonly string[]).includes(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function toMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  return 'Terjadi kesalahan yang tidak terduga saat menyimpan aset.';
}
