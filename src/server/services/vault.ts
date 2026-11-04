import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  credentialVaults,
  incidents,
  webAssets,
  type CredentialCategory,
} from '@/server/db/schema';
import { decryptSecret, encryptSecret, maskSecret } from '@/server/services/cryptoEngine';
import { writeAuditLog } from '@/server/audit';

/**
 * Credential vault.
 *
 * Secrets are never included in the initial RSC payload: the list query only
 * selects non-sensitive columns. Reveal goes through revealVaultSecretAction,
 * which decrypts, updates last_accessed_at, and writes an audit row.
 */

export interface VaultListItem {
  id: string;
  assetId: string;
  assetName: string;
  domainUrl: string;
  label: string;
  category: CredentialCategory;
  username: string;
  loginUrl: string | null;
  notes: string | null;
  lastRotatedAt: Date | null;
  lastAccessedAt: Date | null;
  lastAccessedByName: string | null;
  createdAt: Date;
  /** Days since last rotation (null when never rotated). */
  ageDays: number | null;
  /** True when the owning asset has an unresolved COMPROMISED incident. */
  assetCompromised: boolean;
}

export async function listVaultEntries(filter: {
  assetId?: string;
  category?: CredentialCategory;
  q?: string;
} = {}): Promise<VaultListItem[]> {
  const conditions = [];
  if (filter.assetId) conditions.push(eq(credentialVaults.assetId, filter.assetId));
  if (filter.category) conditions.push(eq(credentialVaults.category, filter.category));
  if (filter.q) {
    const term = `%${filter.q}%`;
    conditions.push(
      sql`(${credentialVaults.label} ILIKE ${term} OR ${credentialVaults.username} ILIKE ${term})`,
    );
  }

  const rows = await db
    .select({
      id: credentialVaults.id,
      assetId: credentialVaults.assetId,
      assetName: webAssets.name,
      domainUrl: webAssets.domainUrl,
      label: credentialVaults.label,
      category: credentialVaults.category,
      username: credentialVaults.username,
      loginUrl: credentialVaults.loginUrl,
      notes: credentialVaults.notes,
      lastRotatedAt: credentialVaults.lastRotatedAt,
      lastAccessedAt: credentialVaults.lastAccessedAt,
      lastAccessedByName: sql<string | null>`(
        SELECT full_name FROM profiles WHERE profiles.id = ${credentialVaults.lastAccessedBy}
      )`,
      createdAt: credentialVaults.createdAt,
      ageDays: sql<number | null>`(
        SELECT extract(day FROM now() - COALESCE(${credentialVaults.lastRotatedAt}, ${credentialVaults.createdAt}))::int
      )`,
      assetCompromised: sql<boolean>`EXISTS (
        SELECT 1 FROM incidents
        WHERE incidents.asset_id = ${credentialVaults.assetId}
          AND incidents.status IN ('OPEN','INVESTIGATING','CONTAINED')
          AND incidents.category IN ('SLOT_DEFACEMENT','MALWARE_BACKDOOR','SQL_INJECTION')
      )`,
    })
    .from(credentialVaults)
    .innerJoin(webAssets, eq(credentialVaults.assetId, webAssets.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(credentialVaults.createdAt));

  return rows;
}

export interface CreateVaultInput {
  assetId: string;
  label: string;
  category: CredentialCategory;
  username: string;
  secret: string;
  loginUrl?: string;
  notes?: string;
}

export async function createVaultEntry(
  input: CreateVaultInput,
  actor: { id: string; role: string; label: string },
): Promise<{ id: string }> {
  if (!input.secret || input.secret.trim().length === 0) {
    throw new Error('Sandi tidak boleh kosong.');
  }

  const { cipherText, iv, authTag } = encryptSecret(input.secret);
  const id = randomUUID();

  await db.insert(credentialVaults).values({
    id,
    assetId: input.assetId,
    label: input.label.trim(),
    category: input.category,
    username: input.username.trim(),
    loginUrl: input.loginUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    encryptedSecret: cipherText,
    iv,
    authTag,
    lastRotatedAt: new Date(),
  });

  await writeAuditLog({
    actor,
    action: 'vault.credential_created',
    entityType: 'credential_vault',
    entityId: id,
    summary: `Kredensial "${input.label.trim()}" ditambahkan ke brankas.`,
  });

  return { id };
}

/**
 * Reveal a secret.
 *
 * The caller must hold SUPER_ADMIN or SECOPS_ENGINEER. The plaintext exists
 * only for the duration of this call: it is never persisted, never logged, and
 * never included in the page payload.
 */
export async function revealVaultSecret(
  vaultId: string,
  actor: { id: string; role: string; label: string },
): Promise<{ secret: string; username: string; label: string; loginUrl: string | null }> {
  const row = await db
    .select()
    .from(credentialVaults)
    .where(eq(credentialVaults.id, vaultId))
    .limit(1)
    .then((r) => r[0]);

  if (!row) throw new Error('Kredensial tidak ditemukan.');

  const secret = decryptSecret(row.encryptedSecret, row.iv, row.authTag);

  await db
    .update(credentialVaults)
    .set({ lastAccessedAt: new Date(), lastAccessedBy: actor.id })
    .where(eq(credentialVaults.id, vaultId));

  await writeAuditLog({
    actor,
    action: 'vault.secret_revealed',
    entityType: 'credential_vault',
    entityId: vaultId,
    summary: `Sandi kredensial "${row.label}" dibuka oleh ${actor.label}.`,
  });

  return {
    secret,
    username: row.username,
    label: row.label,
    loginUrl: row.loginUrl,
  };
}

/** Copy action: same audit trail as reveal, different label. */
export async function markVaultSecretCopied(
  vaultId: string,
  actor: { id: string; role: string; label: string },
): Promise<void> {
  const row = await db
    .select({ label: credentialVaults.label })
    .from(credentialVaults)
    .where(eq(credentialVaults.id, vaultId))
    .limit(1)
    .then((r) => r[0]);

  await db
    .update(credentialVaults)
    .set({ lastAccessedAt: new Date(), lastAccessedBy: actor.id })
    .where(eq(credentialVaults.id, vaultId));

  await writeAuditLog({
    actor,
    action: 'vault.secret_copied',
    entityType: 'credential_vault',
    entityId: vaultId,
    summary: `Sandi kredensial "${row?.label ?? vaultId}" disalin oleh ${actor.label}.`,
  });
}

export interface RotateVaultInput {
  vaultId: string;
  newSecret: string;
  notes?: string;
}

export async function rotateVaultSecret(
  input: RotateVaultInput,
  actor: { id: string; role: string; label: string },
): Promise<void> {
  if (!input.newSecret || input.newSecret.trim().length === 0) {
    throw new Error('Sandi baru tidak boleh kosong.');
  }

  const row = await db
    .select()
    .from(credentialVaults)
    .where(eq(credentialVaults.id, input.vaultId))
    .limit(1)
    .then((r) => r[0]);
  if (!row) throw new Error('Kredensial tidak ditemukan.');

  const { cipherText, iv, authTag } = encryptSecret(input.newSecret);

  await db
    .update(credentialVaults)
    .set({
      encryptedSecret: cipherText,
      iv,
      authTag,
      lastRotatedAt: new Date(),
      notes: input.notes?.trim() || row.notes,
    })
    .where(eq(credentialVaults.id, input.vaultId));

  await writeAuditLog({
    actor,
    action: 'vault.credential_rotated',
    entityType: 'credential_vault',
    entityId: input.vaultId,
    summary: `Sandi kredensial "${row.label}" dirotasi oleh ${actor.label}.`,
  });
}

export async function deleteVaultEntry(
  vaultId: string,
  actor: { id: string; role: string; label: string },
): Promise<void> {
  const row = await db
    .select({ label: credentialVaults.label })
    .from(credentialVaults)
    .where(eq(credentialVaults.id, vaultId))
    .limit(1)
    .then((r) => r[0]);
  if (!row) throw new Error('Kredensial tidak ditemukan.');

  await db.delete(credentialVaults).where(eq(credentialVaults.id, vaultId));

  await writeAuditLog({
    actor,
    action: 'vault.credential_updated',
    entityType: 'credential_vault',
    entityId: vaultId,
    summary: `Kredensial "${row.label}" dihapus dari brankas.`,
  });
}

/** Rotation candidates: older than 90 days, or on a compromised asset. */
export async function listRotationCandidates(rotationDays = 90) {
  const cutoff = new Date(Date.now() - rotationDays * 86_400_000);
  return db
    .select({
      id: credentialVaults.id,
      label: credentialVaults.label,
      assetId: webAssets.id,
      assetName: webAssets.name,
      ageDays: sql<number>`extract(day FROM now() - COALESCE(${credentialVaults.lastRotatedAt}, ${credentialVaults.createdAt}))::int`,
      reason: sql<string>`CASE
        WHEN EXISTS (
          SELECT 1 FROM incidents
          WHERE incidents.asset_id = ${credentialVaults.assetId}
            AND incidents.status IN ('OPEN','INVESTIGATING','CONTAINED')
            AND incidents.category IN ('SLOT_DEFACEMENT','MALWARE_BACKDOOR','SQL_INJECTION')
        ) THEN 'Aset sedang terkena insiden keamanan'
        ELSE 'Belum dirotasi melebihi ambang batas'
      END`,
    })
    .from(credentialVaults)
    .innerJoin(webAssets, eq(credentialVaults.assetId, webAssets.id))
    .where(
      sql`COALESCE(${credentialVaults.lastRotatedAt}, ${credentialVaults.createdAt}) <= ${cutoff}
          OR EXISTS (
            SELECT 1 FROM incidents
            WHERE incidents.asset_id = ${credentialVaults.assetId}
              AND incidents.status IN ('OPEN','INVESTIGATING','CONTAINED')
              AND incidents.category IN ('SLOT_DEFACEMENT','MALWARE_BACKDOOR','SQL_INJECTION')
          )`,
    )
    .orderBy(
      sql`CASE WHEN EXISTS (
        SELECT 1 FROM incidents
        WHERE incidents.asset_id = ${credentialVaults.assetId}
          AND incidents.status IN ('OPEN','INVESTIGATING','CONTAINED')
      ) THEN 0 ELSE 1 END`,
      sql`COALESCE(${credentialVaults.lastRotatedAt}, ${credentialVaults.createdAt}) ASC`,
    );
}

export { maskSecret };
