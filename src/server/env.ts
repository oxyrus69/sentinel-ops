import 'server-only';

import { DB_MODE } from '@/server/db';

/**
 * Environment validation, concentrated in one place.
 *
 * Two families of secrets matter here, and both have the same failure mode if
 * left unchecked: the app starts happily, then either cannot decrypt the vault
 * or logs everyone out, with no message explaining why.
 *
 *   VAULT_MASTER_KEY  AES-256-GCM key for the credential vault
 *   SESSION_SECRET    HMAC key for session cookies
 *
 * Rules:
 *   - Demo / embedded mode (DB_MODE === 'pglite') or ALLOW_DEMO_SECRETS=true
 *     uses a stable local fallback so `npm install && npm run dev` works and the
 *     whole test suite passes with no setup.
 *   - Production with a real PostgreSQL server requires both secrets to be set,
 *     long enough, and not one of the known placeholder values.
 */

/** Placeholder values that must never reach production. */
const KNOWN_PLACEHOLDERS = new Set([
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'sentinel-ops-local-dev-session-secret-change-in-prod',
  'sentinel-ops-dev-session-secret-do-not-use-in-production',
  'changeme',
  'change-me',
  'secret',
  'password',
]);

/** Minimum accepted length for a session secret. */
export const MIN_SESSION_SECRET_LENGTH = 32;

/** AES-256 needs exactly 32 bytes, which is 64 hex characters. */
export const VAULT_KEY_HEX_LENGTH = 64;

export type SecretSource = 'env' | 'demo-fallback';

export interface SecretStatus {
  configured: boolean;
  source: SecretSource;
  /** Why it failed, when it did. */
  problem?: string;
}

/** Running in demo mode: embedded database, or demo secrets explicitly allowed. */
export function isDemoMode(): boolean {
  if (DB_MODE === 'pglite') return true;
  return (process.env.ALLOW_DEMO_SECRETS ?? '').trim().toLowerCase() === 'true';
}

/** True when production rules must be enforced. */
export function requiresProductionSecrets(): boolean {
  return !isDemoMode() && process.env.NODE_ENV === 'production';
}

function isPlaceholder(value: string): boolean {
  return KNOWN_PLACEHOLDERS.has(value.trim().toLowerCase());
}

/**
 * Validate the vault key without throwing.
 *
 * Accepted forms: 64 hex characters (32 bytes), or base64 decoding to exactly 32
 * bytes. Anything else is rejected rather than stretched, because silently
 * deriving a key from a short string would make a weak secret look strong.
 */
export function checkVaultKey(value: string | undefined): SecretStatus {
  const raw = (value ?? '').trim();
  if (!raw) {
    return { configured: false, source: 'demo-fallback', problem: 'VAULT_MASTER_KEY kosong.' };
  }
  if (isPlaceholder(raw)) {
    return {
      configured: false,
      source: 'env',
      problem: 'VAULT_MASTER_KEY masih memakai nilai contoh. Jalankan: npm run secrets:generate',
    };
  }

  const isHex = /^[0-9a-fA-F]{64}$/.test(raw);
  if (isHex) return { configured: true, source: 'env' };

  // Base64 that decodes to exactly 32 bytes.
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(raw) && raw.length >= 40) {
    try {
      const bytes = Buffer.from(raw, 'base64');
      if (bytes.length === 32) return { configured: true, source: 'env' };
    } catch {
      /* fall through to the error below */
    }
  }

  return {
    configured: false,
    source: 'env',
    problem:
      `VAULT_MASTER_KEY harus ${VAULT_KEY_HEX_LENGTH} karakter hex (32 byte) ` +
      'atau base64 dari 32 byte. Jalankan: npm run secrets:generate',
  };
}

/** Validate the session secret without throwing. */
export function checkSessionSecret(value: string | undefined): SecretStatus {
  const raw = (value ?? '').trim();
  if (!raw) {
    return { configured: false, source: 'demo-fallback', problem: 'SESSION_SECRET kosong.' };
  }
  if (isPlaceholder(raw)) {
    return {
      configured: false,
      source: 'env',
      problem: 'SESSION_SECRET masih memakai nilai contoh. Jalankan: npm run secrets:generate',
    };
  }
  if (raw.length < MIN_SESSION_SECRET_LENGTH) {
    return {
      configured: false,
      source: 'env',
      problem: `SESSION_SECRET minimal ${MIN_SESSION_SECRET_LENGTH} karakter (sekarang ${raw.length}).`,
    };
  }
  return { configured: true, source: 'env' };
}

/** Inspect both secrets without enforcing anything. */
export function inspectSecrets(): {
  demoMode: boolean;
  enforced: boolean;
  vault: SecretStatus;
  session: SecretStatus;
} {
  return {
    demoMode: isDemoMode(),
    enforced: requiresProductionSecrets(),
    vault: checkVaultKey(process.env.VAULT_MASTER_KEY),
    session: checkSessionSecret(process.env.SESSION_SECRET),
  };
}

/**
 * Throw when production requirements are not met.
 *
 * Called from the health endpoint and from the first authenticated render
 * surface. The failure is deliberately loud and actionable: a misconfigured
 * deployment should refuse to serve rather than quietly invalidate every session
 * on the next restart.
 */
export function assertProductionSecrets(): void {
  if (!requiresProductionSecrets()) return;

  const problems: string[] = [];

  const vault = checkVaultKey(process.env.VAULT_MASTER_KEY);
  if (!vault.configured) problems.push(vault.problem ?? 'VAULT_MASTER_KEY tidak valid.');

  const session = checkSessionSecret(process.env.SESSION_SECRET);
  if (!session.configured) problems.push(session.problem ?? 'SESSION_SECRET tidak valid.');

  if (problems.length > 0) {
    throw new Error(
      'Konfigurasi produksi belum aman:\n' +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n\nJalankan `npm run secrets:generate`, salin hasilnya ke .env, lalu restart.',
    );
  }
}

/**
 * Development fallbacks.
 *
 * Deterministic so a demo keeps working across restarts, and clearly marked so
 * nobody mistakes them for real secrets. Never reachable in production: the
 * assert above runs first.
 */
export const DEMO_VAULT_KEY = 'sentinel-ops-demo-vault-key-not-for-production';
export const DEMO_SESSION_SECRET = 'sentinel-ops-demo-session-secret-not-for-production';
