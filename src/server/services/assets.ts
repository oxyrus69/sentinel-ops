import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  incidents,
  webAssets,
  type PlatformType,
} from '@/server/db/schema';
import { writeAuditLog } from '@/server/audit';
import { computeSlaDeadlinesPure } from '@/lib/slaMath';

/** Web asset inventory CRUD with optimistic locking on updates. */

export interface AssetListFilter {
  platform?: PlatformType | null;
  health?: string | null;
  q?: string;
  clientId?: string | null;
}

export async function listAssets(filter: AssetListFilter = {}, limit = 100) {
  const conditions = [];

  if (filter.platform) conditions.push(eq(webAssets.platform, filter.platform));
  if (filter.health) conditions.push(eq(webAssets.healthStatus, filter.health as never));
  if (filter.clientId) conditions.push(eq(webAssets.clientId, filter.clientId));
  if (filter.q) {
    const term = `%${filter.q}%`;
    conditions.push(
      or(ilike(webAssets.name, term), ilike(webAssets.domainUrl, term), ilike(webAssets.hostingProvider, term))!,
    );
  }

  const query = db
    .select({
      asset: webAssets,
      clientName: sql<string>`(SELECT full_name FROM profiles WHERE profiles.id = ${webAssets.clientId})`,
      // Correlated subquery: `web_assets.id` must be qualified with the outer
      // table alias, otherwise the subquery's own `incidents` reference does
      // not link back per row and the count collapses to 0.
      openIncidents: sql<number>`(
        SELECT count(*)::int FROM incidents AS i
        WHERE i.asset_id = "web_assets"."id"
          AND i.status IN ('OPEN','INVESTIGATING','CONTAINED')
      )`,
    })
    .from(webAssets)
    .orderBy(desc(webAssets.updatedAt))
    .limit(limit);

  return conditions.length > 0 ? query.where(and(...conditions)) : query;
}

export async function getAssetById(assetId: string) {
  const rows = await db
    .select({
      asset: webAssets,
      client: sql<{
        id: string;
        fullName: string;
        email: string;
        organizationName: string | null;
      } | null>`(
        SELECT json_build_object('id', p.id, 'fullName', p.full_name, 'email', p.email, 'organizationName', p.organization_name)
        FROM profiles p WHERE p.id = ${webAssets.clientId}
      )`,
    })
    .from(webAssets)
    .where(eq(webAssets.id, assetId))
    .limit(1);
  return rows[0] ?? null;
}

export interface CreateAssetInput {
  clientId: string;
  name: string;
  domainUrl: string;
  platform: PlatformType;
  platformVersion?: string;
  serverIp?: string;
  hostingProvider?: string;
  sslExpiryDate?: Date | null;
  baselineDomHash?: string | null;
}

export async function createAsset(
  input: CreateAssetInput,
  actor: { id: string; role: string; label: string },
): Promise<{ id: string; slug: string }> {
  const id = randomUUID();
  const slug = await uniqueSlug(input.domainUrl);

  const sslDaysRemaining = input.sslExpiryDate
    ? Math.ceil((input.sslExpiryDate.getTime() - Date.now()) / 86_400_000)
    : null;

  await db.insert(webAssets).values({
    id,
    clientId: input.clientId,
    name: input.name.trim(),
    domainUrl: normalizeUrl(input.domainUrl),
    slug,
    platform: input.platform,
    platformVersion: input.platformVersion?.trim() ?? null,
    serverIp: input.serverIp?.trim() ?? null,
    hostingProvider: input.hostingProvider?.trim() ?? null,
    sslExpiryDate: input.sslExpiryDate ?? null,
    sslDaysRemaining,
    baselineDomHash: input.baselineDomHash ?? null,
    healthStatus: 'HEALTHY',
  });

  await writeAuditLog({
    actor,
    action: 'asset.created',
    entityType: 'web_asset',
    entityId: id,
    summary: `Aset web "${input.name.trim()}" (${normalizeUrl(input.domainUrl)}) ditambahkan ke inventaris.`,
  });

  return { id, slug };
}

export interface UpdateAssetInput {
  assetId: string;
  expectedVersion: number;
  name?: string;
  domainUrl?: string;
  platform?: PlatformType;
  platformVersion?: string | null;
  serverIp?: string | null;
  hostingProvider?: string | null;
  healthStatus?: (typeof webAssets.healthStatus.enumValues)[number];
  sslExpiryDate?: Date | null;
  baselineDomHash?: string | null;
}

export class AssetConflictError extends Error {
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'AssetConflictError';
  }
}

export async function updateAsset(
  input: UpdateAssetInput,
  actor: { id: string; role: string; label: string },
): Promise<void> {
  const current = await db
    .select()
    .from(webAssets)
    .where(eq(webAssets.id, input.assetId))
    .limit(1)
    .then((r) => r[0]);

  if (!current) throw new Error('Aset tidak ditemukan.');
  if (current.version !== input.expectedVersion) {
    throw new AssetConflictError(
      'Aset ini sudah diubah oleh pengguna lain. Muat ulang halaman sebelum menyimpan.',
    );
  }

  const patch: Partial<typeof webAssets.$inferInsert> = {
    version: sql`${webAssets.version} + 1` as unknown as number,
    updatedAt: new Date(),
  };

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.domainUrl !== undefined) patch.domainUrl = normalizeUrl(input.domainUrl);
  if (input.platform !== undefined) patch.platform = input.platform;
  if (input.platformVersion !== undefined) patch.platformVersion = input.platformVersion;
  if (input.serverIp !== undefined) patch.serverIp = input.serverIp;
  if (input.hostingProvider !== undefined) patch.hostingProvider = input.hostingProvider;
  if (input.healthStatus !== undefined) patch.healthStatus = input.healthStatus;
  if (input.sslExpiryDate !== undefined) {
    patch.sslExpiryDate = input.sslExpiryDate;
    patch.sslDaysRemaining = input.sslExpiryDate
      ? Math.ceil((input.sslExpiryDate.getTime() - Date.now()) / 86_400_000)
      : null;
  }
  if (input.baselineDomHash !== undefined) patch.baselineDomHash = input.baselineDomHash;

  await db
    .update(webAssets)
    .set(patch)
    .where(and(eq(webAssets.id, input.assetId), eq(webAssets.version, input.expectedVersion)));

  const changes: Record<string, { from?: unknown; to?: unknown }> = {};
  if (input.healthStatus !== undefined && input.healthStatus !== current.healthStatus) {
    changes.healthStatus = { from: current.healthStatus, to: input.healthStatus };
  }
  if (input.name !== undefined && input.name.trim() !== current.name) {
    changes.name = { from: current.name, to: input.name.trim() };
  }

  await writeAuditLog({
    actor,
    action: 'asset.updated',
    entityType: 'web_asset',
    entityId: input.assetId,
    summary: `Data aset "${current.name}" diperbarui.`,
    changes: Object.keys(changes).length > 0 ? changes : null,
  });
}

export async function deleteAsset(
  assetId: string,
  actor: { id: string; role: string; label: string },
): Promise<void> {
  const current = await db
    .select({ name: webAssets.name, domainUrl: webAssets.domainUrl })
    .from(webAssets)
    .where(eq(webAssets.id, assetId))
    .limit(1)
    .then((r) => r[0]);

  if (!current) throw new Error('Aset tidak ditemukan.');

  // Cascades remove scans, incidents, comments, credentials.
  await db.delete(webAssets).where(eq(webAssets.id, assetId));

  await writeAuditLog({
    actor,
    action: 'asset.deleted',
    entityType: 'web_asset',
    entityId: assetId,
    summary: `Aset web "${current.name}" (${current.domainUrl}) beserta seluruh riwayat pemindaian, insiden, dan kredensialnya dihapus dari sistem.`,
  });
}

/** Assets owned by a client (portal). */
export async function listAssetsForClient(clientId: string) {
  return db
    .select()
    .from(webAssets)
    .where(eq(webAssets.clientId, clientId))
    .orderBy(webAssets.name);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** URL-derived slug, de-duplicated with a numeric suffix. */
async function uniqueSlug(url: string): Promise<string> {
  const base = slugify(url);
  const existing = await db
    .select({ slug: webAssets.slug })
    .from(webAssets)
    .where(ilike(webAssets.slug, `${base}%`));

  if (existing.length === 0) return base;
  const taken = new Set(existing.map((e) => e.slug));
  for (let i = 2; i < 200; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'aset';
}

export { incidents, computeSlaDeadlinesPure };
