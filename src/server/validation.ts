import 'server-only';

import { z } from 'zod';
import {
  assetHealth,
  credentialCategory,
  incidentSeverity,
  incidentStatus,
  platformType,
  threatCategory,
} from '@/server/db/schema';

/**
 * Input schemas for every mutation that accepts user data.
 *
 * The server actions are the trust boundary: a form can be bypassed entirely by
 * calling the action directly, so validation lives here rather than in the
 * component. Messages are written for the end user, in the language of the
 * interface, because they are shown verbatim next to the field.
 */

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

const REQUEST_ID = z
  .string()
  .trim()
  .min(8, 'requestId tidak valid.')
  .max(64, 'requestId terlalu panjang.');

/**
 * Hostname or IPv4, optionally with a scheme, a path and a port.
 * Deliberately permissive about the scheme but strict about the host, because a
 * bare `journal.kampus.ac.id` is what operators have on hand.
 */
const HOSTNAME_RE =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$|^(?:\d{1,3}\.){3}\d{1,3}$|^localhost$/i;

const DOMAIN = z
  .string()
  .trim()
  .min(1, 'Domain wajib diisi.')
  .max(255, 'Domain terlalu panjang.')
  .refine((value) => {
    const withoutScheme = value.replace(/^https?:\/\//i, '');
    const host = withoutScheme.split('/')[0]?.split(':')[0] ?? '';
    return HOSTNAME_RE.test(host);
  }, 'Domain harus berupa hostname atau URL yang valid, misalnya journal.kampus.ac.id.');

/** Trimmed, non-empty, length-bounded text. */
function text(min: number, max: number, emptyMessage: string, tooLongMessage?: string) {
  return z
    .string()
    .trim()
    .min(min, emptyMessage)
    .max(max, tooLongMessage ?? `Maksimal ${max} karakter.`);
}

/** A date input value, or empty/absent when the user left it blank. */
const OPTIONAL_DATE = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? new Date(value) : null))
  .refine((date) => date === null || !Number.isNaN(date.getTime()), 'Tanggal tidak valid.');

/**
 * A real boolean flag.
 *
 * `z.coerce.boolean()` is unusable here: `Boolean('false')` is `true`, so a form
 * or API payload sending the string "false" would silently *enable* the flag.
 * For `isActive` that means an operator disabling a noisy rule would leave it
 * running. Only a genuine boolean, or the exact strings "true"/"false", count.
 */
const BOOLEAN_FLAG = z
  .union([z.boolean(), z.literal('true'), z.literal('false')], {
    message: 'Harus bernilai true atau false.',
  })
  .transform((value) => value === true || value === 'true');

/* -------------------------------------------------------------------------- */
/* Assets                                                                     */
/* -------------------------------------------------------------------------- */

export const assetCreateSchema = z.object({
  clientId: z.string().uuid('Pilih klien pemilik aset.'),
  name: text(3, 160, 'Nama aset minimal 3 karakter.'),
  domainUrl: DOMAIN,
  platform: z.enum(platformType.enumValues),
  platformVersion: z.string().trim().max(80).optional(),
  serverIp: z.string().trim().max(64).optional(),
  hostingProvider: z.string().trim().max(120).optional(),
  sslExpiryDate: OPTIONAL_DATE,
});
export type AssetCreateInput = z.infer<typeof assetCreateSchema>;

/* -------------------------------------------------------------------------- */
/* Client incident report                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Categories a client may choose. Anything involving malware or injection is
 * classified by the SecOps team after triage, not by the reporter.
 */
export const CLIENT_REPORTABLE_CATEGORIES = [
  'CONFIGURATION_ERROR',
  'SERVER_DOWN',
  'SSL_EXPIRED',
  'BRUTE_FORCE',
] as const satisfies readonly (typeof threatCategory.enumValues)[number][];

export const clientIncidentReportSchema = z.object({
  assetId: z.string().uuid('Pilih aset yang bermasalah.'),
  category: z.enum(CLIENT_REPORTABLE_CATEGORIES, {
    message: 'Jenis masalah tidak dikenali.',
  }),
  title: text(10, 160, 'Judul minimal 10 karakter agar teknisi memahami masalahnya.'),
  description: text(
    30,
    2000,
    'Jelaskan masalahnya minimal 30 karakter: apa yang terlihat, sejak kapan, di halaman mana.',
  ),
});
export type ClientIncidentReportInput = z.infer<typeof clientIncidentReportSchema>;

/* -------------------------------------------------------------------------- */
/* Incidents                                                                  */
/* -------------------------------------------------------------------------- */

export const incidentStatusChangeSchema = z.object({
  incidentId: z.string().uuid('Tiket tidak valid.'),
  toStatus: z.enum(incidentStatus.enumValues),
  expectedVersion: z.coerce.number().int().min(1, 'Versi tiket tidak valid.'),
  rootCauseSummary: z.string().max(8000).optional(),
  remediationSteps: z.string().max(8000).optional(),
});
export type IncidentStatusChangeInput = z.infer<typeof incidentStatusChangeSchema>;

export const incidentCommentSchema = z.object({
  incidentId: z.string().uuid('Tiket tidak valid.'),
  body: text(1, 8000, 'Isi komentar tidak boleh kosong.'),
  isInternal: BOOLEAN_FLAG,
});
export type IncidentCommentInput = z.infer<typeof incidentCommentSchema>;

/* -------------------------------------------------------------------------- */
/* Vault                                                                      */
/* -------------------------------------------------------------------------- */

export const credentialCreateSchema = z.object({
  assetId: z.string().uuid('Pilih aset terlebih dahulu.'),
  label: text(1, 160, 'Label kredensial wajib diisi.'),
  category: z.enum(credentialCategory.enumValues),
  username: text(1, 160, 'Username wajib diisi.'),
  // A minimum length is the only useful server-side rule for a secret; entropy
  // and reuse checks belong to the operator's own policy.
  secret: z.string().min(4, 'Sandi minimal 4 karakter.').max(4096, 'Sandi terlalu panjang.'),
  loginUrl: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CredentialCreateInput = z.infer<typeof credentialCreateSchema>;

export const credentialRotateSchema = z.object({
  vaultId: z.string().uuid('Kredensial tidak valid.'),
  newSecret: z.string().min(4, 'Sandi baru minimal 4 karakter.').max(4096, 'Sandi terlalu panjang.'),
  notes: z.string().trim().max(2000).optional(),
});
export type CredentialRotateInput = z.infer<typeof credentialRotateSchema>;

/* -------------------------------------------------------------------------- */
/* Signature dictionary                                                       */
/* -------------------------------------------------------------------------- */

/** A pattern must compile, or the scanner would skip it at scan time. */
function validRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, 'gi');
    return true;
  } catch {
    return false;
  }
}

export const signatureCreateSchema = z.object({
  name: text(1, 160, 'Nama aturan wajib diisi.'),
  pattern: z
    .string()
    .trim()
    .min(1, 'Pola tidak boleh kosong.')
    .max(400, 'Pola terlalu panjang (maksimal 400 karakter).')
    .refine(validRegex, 'Pola regex tidak valid.'),
  category: z.enum(threatCategory.enumValues),
  severity: z.enum(incidentSeverity.enumValues),
  description: z.string().trim().max(1000).optional(),
});
export type SignatureCreateInput = z.infer<typeof signatureCreateSchema>;

export const signatureUpdateSchema = z.object({
  id: z.string().uuid('Aturan tidak valid.'),
  name: z.string().trim().min(1, 'Nama aturan wajib diisi.').max(160).optional(),
  pattern: z
    .string()
    .trim()
    .min(1, 'Pola tidak boleh kosong.')
    .max(400, 'Pola terlalu panjang (maksimal 400 karakter).')
    .refine(validRegex, 'Pola regex tidak valid.')
    .optional(),
  severity: z.enum(incidentSeverity.enumValues).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  isActive: BOOLEAN_FLAG.optional(),
});
export type SignatureUpdateInput = z.infer<typeof signatureUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

/** Minutes in 14 days: the longest SLA target the UI allows. */
const MAX_TARGET_MINUTES = 14 * 24 * 60;

const minutes = z.coerce
  .number()
  .int('Harus bilangan bulat.')
  .min(1, 'Minimal 1 menit.')
  .max(MAX_TARGET_MINUTES, 'Maksimal 14 hari (20160 menit).');

export const slaTargetsSchema = z
  .object({
    CRITICAL: z.object({ responseMinutes: minutes, resolutionMinutes: minutes }),
    HIGH: z.object({ responseMinutes: minutes, resolutionMinutes: minutes }),
    MEDIUM: z.object({ responseMinutes: minutes, resolutionMinutes: minutes }),
    LOW: z.object({ responseMinutes: minutes, resolutionMinutes: minutes }),
  })
  .refine((value) => Object.values(value).every((t) => t.resolutionMinutes > t.responseMinutes), {
    message: 'Tenggat resolusi harus lebih lama daripada tenggat respons.',
  });
export type SlaTargetsInput = z.infer<typeof slaTargetsSchema>;

export const dssThresholdsSchema = z.object({
  sslWarnDays: z.coerce.number().int('Hari peringatan SSL harus bilangan bulat.').min(1, 'Minimal 1 hari.').max(365, 'Maksimal 365 hari.'),
  repeatInfectionThreshold: z.coerce.number().int('Ambang infeksi harus bilangan bulat.').min(1, 'Minimal 1 insiden.').max(20, 'Maksimal 20 insiden.'),
  repeatInfectionWindowDays: z.coerce.number().int('Jendela infeksi harus bilangan bulat.').min(1, 'Minimal 1 hari.').max(365, 'Maksimal 365 hari.'),
  credentialRotationDays: z.coerce.number().int('Hari rotasi kredensial harus bilangan bulat.').min(1, 'Minimal 1 hari.').max(365, 'Maksimal 365 hari.'),
  slaWarnRatioPct: z.coerce.number().int('Ambang peringatan SLA harus bilangan bulat.').min(1, 'Minimal 1%.').max(99, 'Maksimal 99%.'),
  maxActiveTicketsPerEngineer: z.coerce.number().int('Batas tiket aktif harus bilangan bulat.').min(1, 'Minimal 1 tiket.').max(100, 'Maksimal 100 tiket.'),
});
export type DssThresholdsInput = z.infer<typeof dssThresholdsSchema>;

export const notificationPrefsSchema = z.object({
  slaWarning: BOOLEAN_FLAG,
  assetCompromised: BOOLEAN_FLAG,
  vaultAccess: BOOLEAN_FLAG,
  weeklyDigest: BOOLEAN_FLAG,
});
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** First issue of a failed parse, phrased for display. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Data tidak valid.';
  const where = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${where}${issue.message}`;
}

/** Discriminated result so a caller can branch on ok without throwing. */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Validate, returning a display-ready message on failure.
 *
 * zod strips unknown keys by default, so a caller that spreads the result into
 * a query can never forward an unexpected input.
 */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: firstIssue(result.error) };
}

/** Extract a trimmed string field from FormData, or undefined when absent. */
export function formField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export { REQUEST_ID as requestIdSchema };
export { assetHealth };
