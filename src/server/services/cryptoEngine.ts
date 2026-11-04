import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { checkVaultKey, requiresProductionSecrets, DEMO_VAULT_KEY } from '@/server/env';

/**
 * AES-256-GCM credential vault.
 *
 * Ciphertext, IV and auth tag are stored separately in credential_vaults.
 * The master key comes from VAULT_MASTER_KEY (base64, hex, or raw 32 bytes);
 * a deterministic dev fallback keeps `npm run dev` working with no setup.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const KEY_LENGTH = 32; // 256-bit

export interface EncryptedPayload {
  cipherText: string; // base64
  iv: string; // base64, 12 bytes
  authTag: string; // base64, 16 bytes
}

/**
 * Resolve the master key.
 *
 * Accepted formats for VAULT_MASTER_KEY:
 *   - hex (64 chars), decoded to 32 bytes  (what `npm run secrets:generate` emits)
 *   - base64 decoding to exactly 32 bytes
 *   - any other string is stretched with scrypt, but only in demo mode; in
 *     production a short or unrecognised key is a hard error, because silently
 *     deriving a key from a weak string would make it look stronger than it is.
 */
function resolveMasterKey(): Buffer {
  const raw = (process.env.VAULT_MASTER_KEY ?? '').trim();

  if (raw.length > 0) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      const buf = Buffer.from(raw, 'hex');
      if (buf.length === KEY_LENGTH) return buf;
    }

    if (/^[A-Za-z0-9+/]+=*$/.test(raw) && raw.length >= 40) {
      try {
        const buf = Buffer.from(raw, 'base64');
        if (buf.length === KEY_LENGTH) return buf;
      } catch {
        /* fall through */
      }
    }

    if (requiresProductionSecrets()) {
      // The message comes from the shared validator so it always names the fix.
      const status = checkVaultKey(raw);
      throw new Error(status.problem ?? 'VAULT_MASTER_KEY tidak valid untuk produksi.');
    }

    // Demo/local only: stretch deterministically so existing ciphertext stays
    // readable across restarts within one environment.
    return scryptSync(raw, 'sentinel-ops-vault-salt', KEY_LENGTH);
  }

  if (requiresProductionSecrets()) {
    throw new Error(
      'VAULT_MASTER_KEY wajib diset di produksi. Jalankan: npm run secrets:generate',
    );
  }

  return scryptSync(DEMO_VAULT_KEY, 'sentinel-ops-vault-salt', KEY_LENGTH);
}

let cachedKey: Buffer | null = null;
function masterKey(): Buffer {
  if (!cachedKey) cachedKey = resolveMasterKey();
  return cachedKey;
}

/** True when the configured key is the deterministic demo fallback. */
export function isUsingDevFallbackKey(): boolean {
  const raw = (process.env.VAULT_MASTER_KEY ?? '').trim();
  if (raw.length === 0) return true;
  // A present-but-unusable key is also a fallback situation in demo mode.
  return !checkVaultKey(raw).configured && !requiresProductionSecrets();
}

/** Encrypt a plaintext secret. Returns base64 cipherText/iv/authTag. */
export function encryptSecret(plainText: string): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  return {
    cipherText: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

/**
 * Decrypt a stored secret.
 *
 * Throws on tampered ciphertext or wrong key (GCM auth tag mismatch) rather
 * than returning garbage.
 */
export function decryptSecret(
  cipherText: string,
  iv: string,
  authTag: string,
): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    masterKey(),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherText, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** Verify a secret decrypts and matches an expected value (constant time). */
export function verifySecret(
  cipherText: string,
  iv: string,
  authTag: string,
  expectedPlain: string,
): boolean {
  try {
    const actual = decryptSecret(cipherText, iv, authTag);
    const a = Buffer.from(actual, 'utf8');
    const b = Buffer.from(expectedPlain, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Masked display form. Never reveals length precisely. */
export function maskSecret(): string {
  return '••••••••••••';
}

/* -------------------------------------------------------------------------- */
/* Password hashing (scrypt, per-user salt)                                   */
/* -------------------------------------------------------------------------- */

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1] ?? '', 'base64');
  const expected = Buffer.from(parts[2] ?? '', 'base64');
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = scryptSync(password, salt, expected.length);
  return timingSafeEqual(derived, expected);
}

/** Stable SHA-256 hex (used for DOM baseline comparison on the server). */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Cryptographically random request id for idempotency keys. */
export function newRequestId(): string {
  return randomBytes(16).toString('hex');
}

/** Cryptographically random session token. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Random UUID v4. */
export function newUuid(): string {
  return randomUUID();
}
