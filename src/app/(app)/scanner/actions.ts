'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { malwareSignatures } from '@/server/db/schema';
import { getSessionUser } from '@/server/auth/session';
import { requireRole, CONFIG_ROLES, type UserRole } from '@/server/rbac';
import { analyzeSandboxHtml } from '@/server/services/scannerEngine';
import { writeAuditLog } from '@/server/audit';
import {
  parseInput,
  signatureCreateSchema,
  signatureUpdateSchema,
} from '@/server/validation';
import type { SeverityValue, ThreatCategoryValue } from '@/lib/scannerMath';

/**
 * Scanner page actions.
 *
 * Two distinct jobs: analyze pasted HTML (read-only, no DB write), and manage
 * the malware signature dictionary (SUPER_ADMIN only, audited).
 */

export interface SignatureActionResult {
  ok: boolean;
  error?: string;
}

/** Analyze pasted HTML with the real detection engine. */
export async function analyzeHtmlAction(html: string): Promise<{
  ok: boolean;
  error?: string;
  result?: Awaited<ReturnType<typeof analyzeSandboxHtml>>;
}> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'Anda belum masuk.' };

  if (html.length > 500_000) {
    return { ok: false, error: 'HTML terlalu besar. Batas 500.000 karakter.' };
  }

  try {
    const result = await analyzeSandboxHtml(html);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Analisis gagal dijalankan.',
    };
  }
}

async function adminActor(): Promise<
  { ok: true; actor: { id: string; role: UserRole; label: string } } | { ok: false; error: string }
> {
  const user = await getSessionUser();
  try {
    requireRole(user, CONFIG_ROLES);
    return { ok: true, actor: { id: user!.id, role: user!.role as UserRole, label: user!.fullName } };
  } catch {
    return { ok: false, error: 'Hanya Super Admin yang dapat mengubah kamus deteksi.' };
  }
}

export async function createSignatureAction(input: {
  name: string;
  pattern: string;
  category: ThreatCategoryValue;
  severity: SeverityValue;
  description?: string;
}): Promise<SignatureActionResult> {
  const auth = await adminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = parseInput(signatureCreateSchema, input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    const id = randomUUID();
    await db.insert(malwareSignatures).values({
      id,
      name: parsed.data.name,
      pattern: parsed.data.pattern,
      category: parsed.data.category,
      severity: parsed.data.severity,
      description: parsed.data.description ?? null,
      isActive: true,
      createdBy: auth.actor.id,
    });

    await writeAuditLog({
      actor: auth.actor,
      action: 'scan.rule_created',
      entityType: 'malware_signature',
      entityId: id,
      summary: `Aturan deteksi "${parsed.data.name}" ditambahkan ke kamus.`,
    });

    revalidatePath('/scanner/rules');
    revalidatePath('/scanner');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Aturan gagal disimpan.',
    };
  }
}

export async function updateSignatureAction(input: {
  id: string;
  name?: string;
  pattern?: string;
  severity?: SeverityValue;
  description?: string | null;
  isActive?: boolean;
}): Promise<SignatureActionResult> {
  const auth = await adminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = parseInput(signatureUpdateSchema, input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    const patch: Partial<typeof malwareSignatures.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.pattern !== undefined) patch.pattern = parsed.data.pattern;
    if (parsed.data.severity !== undefined) patch.severity = parsed.data.severity;
    if (parsed.data.description !== undefined) patch.description = parsed.data.description;
    if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;

    await db.update(malwareSignatures).set(patch).where(eq(malwareSignatures.id, parsed.data.id));

    await writeAuditLog({
      actor: auth.actor,
      action: 'scan.rule_updated',
      entityType: 'malware_signature',
      entityId: parsed.data.id,
      summary:
        input.isActive === false
          ? 'Aturan deteksi dinonaktifkan.'
          : input.isActive === true
            ? 'Aturan deteksi diaktifkan kembali.'
            : 'Aturan deteksi diperbarui.',
      changes: {
        ...(parsed.data.pattern !== undefined ? { pattern: { to: parsed.data.pattern } } : {}),
        ...(parsed.data.severity !== undefined ? { severity: { to: parsed.data.severity } } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: { to: parsed.data.isActive } } : {}),
      },
    });

    revalidatePath('/scanner/rules');
    revalidatePath('/scanner');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Aturan gagal diperbarui.',
    };
  }
}

export async function deleteSignatureAction(id: string): Promise<SignatureActionResult> {
  const auth = await adminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    const row = await db
      .select({ name: malwareSignatures.name })
      .from(malwareSignatures)
      .where(eq(malwareSignatures.id, id))
      .limit(1)
      .then((r) => r[0]);

    await db.delete(malwareSignatures).where(eq(malwareSignatures.id, id));

    await writeAuditLog({
      actor: auth.actor,
      action: 'scan.rule_deleted',
      entityType: 'malware_signature',
      entityId: id,
      summary: `Aturan deteksi "${row?.name ?? id}" dihapus dari kamus.`,
    });

    revalidatePath('/scanner/rules');
    revalidatePath('/scanner');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Aturan gagal dihapus.',
    };
  }
}
