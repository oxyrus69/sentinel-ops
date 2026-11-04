import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { requirePageAccess } from '@/server/auth/guard';
import { listAssets, type AssetListFilter } from '@/server/services/assets';
import { assetHealth, platformType, type AssetHealth, type PlatformType } from '@/server/db/schema';
import { parseTableQuery } from '@/lib/tableQuery';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AssetsTable, type AssetTableRow } from './assets-table';

export const metadata: Metadata = { title: 'Inventaris Aset' };

interface AssetsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PLATFORM_OPTIONS: Array<{ value: PlatformType; label: string }> = [
  { value: 'OJS_3', label: 'OJS 3' },
  { value: 'WORDPRESS', label: 'WordPress' },
  { value: 'LARAVEL', label: 'Laravel' },
  { value: 'NODE_SSR', label: 'Node.js' },
  { value: 'STATIC_WEB', label: 'Situs Statis' },
  { value: 'CUSTOM_PHP', label: 'PHP Kustom' },
];

const HEALTH_OPTIONS: Array<{ value: AssetHealth; label: string }> = [
  { value: 'HEALTHY', label: 'Sehat' },
  { value: 'WARNING', label: 'Peringatan' },
  { value: 'COMPROMISED', label: 'Terkompromi' },
  { value: 'DOWN', label: 'Mati' },
  { value: 'MAINTENANCE', label: 'Pemeliharaan' },
];

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  await requirePageAccess('/assets');

  const rawParams = await searchParams;

  // Filters stay in the URL: a filtered view is shareable and survives a
  // refresh. Sorting and page position are handled by the table on the client,
  // so changing them never costs a round trip. The whitelist still validates
  // every parameter before it can reach a query.
  const query = parseTableQuery(rawParams, {
    sortable: ['name', 'health_status', 'uptime_pct_30d', 'ssl_days_remaining', 'last_scan_at'],
    defaultSort: 'name',
    defaultDir: 'asc',
    filters: {
      platform: platformType.enumValues,
      health: assetHealth.enumValues,
    },
  });

  const platform = (query.filters.platform ?? null) as PlatformType | null;
  const health = (query.filters.health ?? null) as AssetHealth | null;

  const filter: AssetListFilter = {
    platform,
    health,
    q: query.q || undefined,
  };

  const rows = await listAssets(filter, 500);
  const hasFilters = platform !== null || health !== null || query.q.length > 0;

  // Only plain data crosses into the table component.
  const tableRows: AssetTableRow[] = rows.map((row) => ({
    asset: {
      id: row.asset.id,
      name: row.asset.name,
      domainUrl: row.asset.domainUrl,
      platform: row.asset.platform,
      healthStatus: row.asset.healthStatus,
      uptimePct30d: row.asset.uptimePct30d,
      sslDaysRemaining: row.asset.sslDaysRemaining,
      lastScanAt: row.asset.lastScanAt,
    },
    clientName: row.clientName,
    openIncidents: row.openIncidents,
  }));

  return (
    <>
      <PageHeader
        title="Inventaris Aset"
        description="Seluruh situs web yang dipantau Sentinel Ops beserta status kesehatan, uptime 30 hari, sisa masa berlaku sertifikat SSL, dan insiden yang masih terbuka."
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/assets/baru">
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              Tambah Aset
            </Link>
          </Button>
        }
      />

      {/* ---- Filters ---- */}
      <section aria-label="Filter inventaris" className="mb-4">
        <Card padding="md">
          <form method="get" action="/assets" className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-full sm:basis-56">
              <label htmlFor="filter-q" className="label-xs mb-1.5 block">
                Cari
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
                />
                <input
                  id="filter-q"
                  name="q"
                  type="search"
                  defaultValue={query.q}
                  placeholder="Nama, domain, atau hosting"
                  className="h-9 w-full rounded-sm border border-border-subtle bg-surface-sunken pl-8 pr-3 text-[13px] text-text-primary placeholder:text-text-muted transition-colors duration-fast ease-standard hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-end">
              <div className="min-w-0 sm:w-44">
                <label htmlFor="filter-platform" className="label-xs mb-1.5 block">
                  Platform
                </label>
                <select
                  id="filter-platform"
                  name="platform"
                  defaultValue={platform ?? ''}
                  className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-2 pr-6 text-[13px] text-text-primary transition-colors duration-fast ease-standard hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Semua platform</option>
                  {PLATFORM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-0 sm:w-44">
                <label htmlFor="filter-health" className="label-xs mb-1.5 block">
                  Status
                </label>
                <select
                  id="filter-health"
                  name="health"
                  defaultValue={health ?? ''}
                  className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-2 pr-6 text-[13px] text-text-primary transition-colors duration-fast ease-standard hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Semua status</option>
                  {HEALTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Button type="submit" variant="secondary" size="md">
                Terapkan
              </Button>
              {hasFilters ? (
                <Link
                  href="/assets"
                  className="inline-flex h-9 items-center gap-1.5 rounded-sm px-2 text-[13px] text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
                >
                  <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                  Reset
                </Link>
              ) : null}
            </div>
          </form>
        </Card>
      </section>

      {hasFilters ? (
        <p className="mb-3 text-[12.5px] text-text-secondary">
          Filter aktif{' '}
          <Badge tone="info" size="sm">
            Terfilter
          </Badge>
        </p>
      ) : null}

      <AssetsTable
        rows={tableRows}
        initialSortColumnId={sortKeyToColumnId(query.sort)}
        initialSortDesc={query.dir === 'desc'}
        emptyMessage={
          hasFilters
            ? 'Tidak ada aset yang cocok dengan filter ini.'
            : 'Belum ada aset terdaftar. Tambahkan aset pertama lewat tombol Tambah Aset.'
        }
      />
    </>
  );
}

/** Map a validated `?sort=` value onto the column id the table knows. */
function sortKeyToColumnId(sort: string | null): string {
  switch (sort) {
    case 'health_status':
      return 'health';
    case 'uptime_pct_30d':
      return 'uptime';
    case 'ssl_days_remaining':
      return 'ssl';
    case 'last_scan_at':
      return 'scanned';
    default:
      return 'name';
  }
}
