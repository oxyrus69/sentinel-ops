'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/server/auth/session';
import { requireRole, VAULT_REVEAL_ROLES, CONFIG_ROLES, type UserRole } from '@/server/rbac';
import {
  createVaultEntry,
  deleteVaultEntry,
  revealVaultSecret,
  rotateVaultSecret,
  markVaultSecretCopied,
} from '@/server/services/vault';
import { withIdempotency } from '@/server/idempotency';
import {
  parseInput,
  credentialCreateSchema,
  credentialRotateSchema,
} from '@/server/validation';
import type { CredentialCategory } from '@/server/db/schema';

/**
 * Vault mutations.
 *
 * Reveal and copy are the security-critical paths: both require a role that may
 * see secrets (SUPPORT_AGENT is excluded), both write an audit row, and neither
 * ever returns the plaintext through page props — only through the action result
 * the caller explicitly asked for.
 */

export interface VaultActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  code?: 'ACCESS_DENIED' | 'VALIDATION_ERROR' | 'UNKNOWN';
  data?: T;
}

async function revealActor() {
  const user = await getSessionUser();
  requireRole(user, VAULT_REVEAL_ROLES);
  return { id: user!.id, role: user!.role as UserRole, label: user!.fullName };
}

/** Decrypt one secret on demand. Logs the access. */
export async function revealSecretAction(vaultId: string): Promise<
  VaultActionResult<{ secret: string; username: string; loginUrl: string | null }>
> {
  let who: { id: string; role: UserRole; label: string };
  try {
    who = await revealActor();
  } catch {
    return {
      ok: false,
      code: 'ACCESS_DENIED',
      error: 'Peran Anda tidak diizinkan membuka sandi brankas.',
    };
  }

  try {
    const result = await revealVaultSecret(vaultId, who);
    revalidatePath('/vault');
    return {
      ok: true,
      data: {
        secret: result.secret,
        username: result.username,
        loginUrl: result.loginUrl,
      },
    };
  } catch (err) {
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Sandi gagal dibuka.',
    };
  }
}

/** Record that a secret was copied (same privilege as reveal). */
export async function copySecretAction(vaultId: string): Promise<VaultActionResult> {
  let who: { id: string; role: UserRole; label: string };
  try {
    who = await revealActor();
  } catch {
    return { ok: false, code: 'ACCESS_DENIED', error: 'Peran Anda tidak diizinkan menyalin sandi.' };
  }

  try {
    await markVaultSecretCopied(vaultId, who);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Gagal mencatat akses.',
    };
  }
}

/** Add a credential. Secrets are encrypted before they reach the database. */
export async function createCredentialAction(input: {
  assetId: string;
  label: string;
  category: CredentialCategory;
  username: string;
  secret: string;
  loginUrl?: string;
  notes?: string;
  requestId: string;
}): Promise<VaultActionResult<{ id: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: 'ACCESS_DENIED', error: 'Anda belum masuk.' };

  try {
    requireRole(user, CONFIG_ROLES.concat('SECOPS_ENGINEER'));
  } catch {
    return { ok: false, code: 'ACCESS_DENIED', error: 'Hanya SecOps Engineer dan Super Admin yang dapat menambah kredensial.' };
  }

  const parsed = parseInput(credentialCreateSchema, input);
  if (!parsed.ok) {
    return { ok: false, code: 'VALIDATION_ERROR', error: parsed.error };
  }

  const who = { id: user.id, role: user.role as UserRole, label: user.fullName };

  try {
    const result = await withIdempotency('vault.create', input.requestId, () =>
      createVaultEntry(
        {
          assetId: parsed.data.assetId,
          label: parsed.data.label,
          category: parsed.data.category,
          username: parsed.data.username,
          secret: parsed.data.secret,
          loginUrl: parsed.data.loginUrl,
          notes: parsed.data.notes,
        },
        who,
      ),
    );    revalidatePath('/vault');
    return { ok: true, data: result.result };
  } catch (err) {
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Kredensial gagal disimpan.',
    };
  }
}

/** Replace a stored secret and reset the rotation clock. */
export async function rotateSecretAction(input: {
  vaultId: string;
  newSecret: string;
  notes?: string;
  requestId: string;
}): Promise<VaultActionResult> {
  let who: { id: string; role: UserRole; label: string };
  try {
    who = await revealActor();
  } catch {
    return { ok: false, code: 'ACCESS_DENIED', error: 'Peran Anda tidak diizinkan merotasi sandi.' };
  }

  const parsed = parseInput(credentialRotateSchema, input);
  if (!parsed.ok) {
    return { ok: false, code: 'VALIDATION_ERROR', error: parsed.error };
  }

  try {
    await withIdempotency('vault.rotate', input.requestId, () =>
      rotateVaultSecret(
        {
          vaultId: parsed.data.vaultId,
          newSecret: parsed.data.newSecret,
          notes: parsed.data.notes,
        },
        who,
      ),
    );
    revalidatePath('/vault');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Sandi gagal dirotasi.',
    };
  }
}

/** Remove a credential entirely. */
export async function deleteCredentialAction(vaultId: string): Promise<VaultActionResult> {
  let who: { id: string; role: UserRole; label: string };
  try {
    who = await revealActor();
  } catch {
    return { ok: false, code: 'ACCESS_DENIED', error: 'Peran Anda tidak diizinkan menghapus kredensial.' };
  }

  try {
    await deleteVaultEntry(vaultId, who);
    revalidatePath('/vault');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Kredensial gagal dihapus.',
    };
  }
}
