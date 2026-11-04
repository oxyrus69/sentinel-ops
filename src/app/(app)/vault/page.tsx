import type { Metadata } from 'next';
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { db } from '@/server/db';
import { webAssets } from '@/server/db/schema';
import { listVaultEntries } from '@/server/services/vault';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { VaultList } from './vault-list';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Brankas Kredensial' };

const CATEGORY_LABEL: Record<string, string> = {
  CPANEL_HOSTING: 'cPanel Hosting',
  SSH_ROOT: 'SSH Root',
  DATABASE: 'Database',
  CMS_ADMIN: 'Admin CMS',
  OJS_INDEXING: 'Indeksasi Jurnal',
};

const ROTATION_DAYS = 90;

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAccess('/vault');
  const sp = await searchParams;

  const rawCategory = String(sp.category ?? '').toUpperCase();
  const category = ['CPANEL_HOSTING', 'SSH_ROOT', 'DATABASE', 'CMS_ADMIN', 'OJS_INDEXING'].includes(
    rawCategory,
  )
    ? rawCategory
    : undefined;
  const q = String(sp.q ?? '').slice(0, 120);

  const [entries, assetOptions] = await Promise.all([
    listVaultEntries({ category: category as never, q: q || undefined }),
    db
      .select({ id: webAssets.id, name: webAssets.name })
      .from(webAssets)
      .orderBy(webAssets.name),
  ]);

  const staleCount = entries.filter((e) => (e.ageDays ?? 0) > ROTATION_DAYS).length;
  const compromisedCount = entries.filter((e) => e.assetCompromised).length;

  return (
    <>
      <PageHeader
        title="Brankas Kredensial"
        description="Sandi disimpan terenkripsi AES-256-GCM. Membuka atau menyalin sandi tercatat di jejak audit beserta nama pengguna dan waktu akses."
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Total kredensial" value={entries.length} />
        <Stat
          label={`Belum dirotasi > ${ROTATION_DAYS}h`}
          value={staleCount}
          tone={staleCount > 0 ? 'warning' : 'healthy'}
        />
        <Stat
          label="Aset sedang insiden"
          value={compromisedCount}
          tone={compromisedCount > 0 ? 'critical' : 'healthy'}
        />
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <select
          name="category"
          defaultValue={category ?? ''}
          className="h-8 rounded-sm border border-border-subtle bg-surface-sunken px-2 text-[12.5px] text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Semua kategori</option>
          {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Cari label atau username…"
          className="h-8 min-w-[200px] rounded-sm border border-border-subtle bg-surface-sunken px-2.5 text-[12.5px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="h-8 cursor-pointer rounded-sm border border-border-subtle bg-surface-overlay px-3 text-[12.5px] text-text-primary transition-colors hover:border-border-strong"
        >
          Cari
        </button>
        {(category || q) && (
          <Link href="/vault" className="text-[12.5px] text-text-muted hover:text-text-secondary">
            Reset
          </Link>
        )}
      </form>

      {entries.length === 0 ? (
        <Card padding="lg">
          <p className="py-6 text-center text-[13px] text-text-muted">
            Tidak ada kredensial yang cocok dengan filter ini.
          </p>
        </Card>
      ) : (
        <VaultList
          entries={entries.map((e) => ({
            id: e.id,
            label: e.label,
            category: e.category,
            categoryLabel: CATEGORY_LABEL[e.category] ?? e.category,
            username: e.username,
            loginUrl: e.loginUrl,
            notes: e.notes,
            assetId: e.assetId,
            assetName: e.assetName,
            domainUrl: e.domainUrl,
            ageDays: e.ageDays,
            lastAccessedAt: e.lastAccessedAt?.toISOString() ?? null,
            lastAccessedByName: e.lastAccessedByName,
            assetCompromised: e.assetCompromised,
          }))}
          assets={assetOptions}
          rotationDays={ROTATION_DAYS}
        />
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'warning' | 'critical' | 'healthy';
}) {
  const color =
    tone === 'warning'
      ? 'text-status-warning'
      : tone === 'critical'
        ? 'text-status-critical'
        : tone === 'healthy'
          ? 'text-status-healthy'
          : 'text-text-primary';
  return (
    <Card padding="sm">
      <p className="label-xs">{label}</p>
      <p className={cn('numeric mt-1 text-[22px] font-semibold leading-none', color)}>{value}</p>
    </Card>
  );
}
