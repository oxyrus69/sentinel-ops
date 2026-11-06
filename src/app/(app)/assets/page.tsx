import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePageAccess } from '@/server/auth/guard';
import { listAssets, type AssetListFilter } from '@/server/services/assets';
import { assetHealth, platformType, type AssetHealth, type PlatformType } from '@/server/db/schema';
import { parseTableQuery } from '@/lib/tableQuery';
import { cn } from '@/lib/cn';
import { getKpiSummary } from '@/server/services/analytics';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { AssetsTable, type AssetTableRow } from './assets-table';

export const metadata: Metadata = { title: 'Inventaris Aset' };

interface AssetsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Asset inventory (Global Dashboard Design §5.2).
 *
 * Baris 1 — mini summary ribbon of module aggregates.
 * Baris 2 — the EnterpriseDataGrid, whose toolbar owns search, facet chips,
 * density, row selection and paging. The old page-level filter form is gone:
 * filtering now lives where the data is, and a facet chip shows its own count.
 */

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

  const [rows, kpi] = await Promise.all([listAssets(filter, 500), getKpiSummary()]);

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

  const healthyRatio = kpi.totalAssets === 0 ? 100 : (kpi.healthyAssets / kpi.totalAssets) * 100;

  return (
    <>
      <PageHeader
        title="Inventaris Aset"
        count={{ value: rows.length, label: 'aset ditampilkan' }}
        description="Status kesehatan, uptime 30 hari, sisa masa berlaku SSL, dan insiden yang masih terbuka. Klik baris untuk inspeksi tanpa meninggalkan daftar."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href="/api/export/assets">Ekspor CSV</Link>
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link href="/assets/baru">
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                Tambah Aset
              </Link>
            </Button>
          </>
        }
      />

      {/* ---- Mini summary ribbon ---- */}
      <section aria-label="Ringkasan inventaris" className="mb-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RibbonTile label="Total aset" value={kpi.totalAssets} />
          <RibbonTile
            label="Sehat"
            value={kpi.healthyAssets}
            tone="healthy"
            detail={`${Math.round(healthyRatio)}% dari total`}
          />
          <RibbonTile
            label="Perlu tindakan"
            value={kpi.compromisedAssets + kpi.downAssets}
            tone={kpi.compromisedAssets + kpi.downAssets > 0 ? 'critical' : 'neutral'}
            detail={`${kpi.compromisedAssets} kompromi · ${kpi.downAssets} mati`}
          />
          <RibbonTile
            label="SSL ≤ 14 hari"
            value={kpi.sslExpiringIn14Days}
            tone={kpi.sslExpiringIn14Days > 0 ? 'warning' : 'neutral'}
            detail="perlu perpanjangan"
          />
        </div>
      </section>

      <AssetsTable
        rows={tableRows}
        initialSortColumnId={sortKeyToColumnId(query.sort)}
        initialSortDesc={query.dir === 'desc'}
        emptyMessage="Belum ada aset yang cocok. Ubah filter status atau kata kunci pencarian."
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

function RibbonTile({
  label,
  value,
  tone = 'neutral',
  detail,
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'healthy' | 'warning' | 'critical';
  detail?: string;
}) {
  const color =
    tone === 'healthy'
      ? 'text-status-healthy'
      : tone === 'warning'
        ? 'text-status-warning'
        : tone === 'critical'
          ? 'text-status-critical'
          : 'text-text-primary';
  return (
    <div className="rounded-md border border-border-subtle bg-surface-raised px-3 py-2.5">
      <p className="label-xs truncate text-[10px]">{label}</p>
      <p className={cn('numeric mt-1 text-[20px] font-semibold leading-none', color)}>{value}</p>
      {detail ? <p className="mt-1 truncate text-[10.5px] text-text-muted">{detail}</p> : null}
    </div>
  );
}
