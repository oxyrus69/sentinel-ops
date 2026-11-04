'use client';

import Link from 'next/link';
import type { AssetHealth, PlatformType } from '@/server/db/schema';
import { HealthBadge, PlatformBadge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { cn } from '@/lib/cn';

/**
 * Asset table.
 *
 * A Client Component because the table library renders the cells, and a function
 * cannot cross the server/client boundary. The page therefore passes plain rows
 * only, and the column definitions — including how each cell renders — live
 * here. Data fetching, filtering and authorization all stay on the server.
 */

export interface AssetTableRow {
  asset: {
    id: string;
    name: string;
    domainUrl: string;
    platform: PlatformType;
    healthStatus: AssetHealth;
    uptimePct30d: string;
    sslDaysRemaining: number | null;
    lastScanAt: Date | null;
  };
  clientName: string | null;
  openIncidents: number;
}

/** Worst-first ordering so sorting by status surfaces problems at the top. */
const HEALTH_SORT_ORDER: Record<AssetHealth, number> = {
  COMPROMISED: 0,
  DOWN: 1,
  WARNING: 2,
  MAINTENANCE: 3,
  HEALTHY: 4,
};

const columns: Array<DataTableColumn<AssetTableRow>> = [
  {
    id: 'name',
    header: 'Nama Aset',
    sortValue: (row) => row.asset.name,
    className: 'max-w-[240px]',
    cell: (row) => (
      <Link
        href={`/assets/${row.asset.id}`}
        className="block truncate text-[13px] font-medium text-text-primary underline-offset-2 hover:text-accent hover:underline"
        title={row.asset.name}
      >
        {row.asset.name}
      </Link>
    ),
  },
  {
    id: 'domain',
    header: 'Domain',
    className: 'max-w-[200px]',
    cell: (row) => (
      <span className="numeric block truncate text-[12px] text-text-secondary">
        {stripProtocol(row.asset.domainUrl)}
      </span>
    ),
  },
  {
    id: 'client',
    header: 'Klien',
    sortValue: (row) => row.clientName,
    className: 'max-w-[160px]',
    cell: (row) => (
      <span className="block truncate text-[12.5px] text-text-secondary">
        {row.clientName ?? 'Tanpa klien'}
      </span>
    ),
  },
  {
    id: 'platform',
    header: 'Platform',
    cell: (row) => <PlatformBadge platform={row.asset.platform} />,
  },
  {
    id: 'health',
    header: 'Status',
    sortValue: (row) => HEALTH_SORT_ORDER[row.asset.healthStatus] ?? 99,
    cell: (row) => <HealthBadge status={row.asset.healthStatus} />,
  },
  {
    id: 'uptime',
    header: 'Uptime',
    numeric: true,
    // Worst uptime first: an operator scanning this column wants the problems.
    sortDescFirst: false,
    sortValue: (row) => Number(row.asset.uptimePct30d),
    cell: (row) => <span className="whitespace-nowrap">{formatPct(row.asset.uptimePct30d)}</span>,
  },
  {
    id: 'ssl',
    header: 'SSL',
    numeric: true,
    // Soonest expiry first, which is the column's whole point.
    sortDescFirst: false,
    sortValue: (row) => row.asset.sslDaysRemaining,
    cell: (row) => (
      <span
        className={cn(
          'whitespace-nowrap',
          row.asset.sslDaysRemaining !== null && row.asset.sslDaysRemaining <= 14
            ? 'font-medium text-status-critical'
            : undefined,
        )}
      >
        {formatSslDays(row.asset.sslDaysRemaining)}
      </span>
    ),
  },
  {
    id: 'incidents',
    header: 'Insiden',
    numeric: true,
    sortValue: (row) => row.openIncidents,
    cell: (row) => (
      <span
        className={row.openIncidents > 0 ? 'font-medium text-status-critical' : 'text-text-muted'}
      >
        {row.openIncidents}
      </span>
    ),
  },
  {
    id: 'scanned',
    header: 'Dipindai',
    sortValue: (row) => (row.asset.lastScanAt ? row.asset.lastScanAt.getTime() : null),
    cell: (row) => (
      <span className="numeric whitespace-nowrap text-[12px] text-text-secondary">
        {formatDate(row.asset.lastScanAt)}
      </span>
    ),
  },
];

export function AssetsTable({
  rows,
  initialSortColumnId,
  initialSortDesc,
  emptyMessage,
}: {
  rows: AssetTableRow[];
  initialSortColumnId?: string;
  initialSortDesc?: boolean;
  emptyMessage: string;
}) {
  return (
    <DataTable<AssetTableRow>
      columns={columns}
      rows={rows}
      getRowId={(row) => row.asset.id}
      initialSort={{ columnId: initialSortColumnId ?? 'name', desc: initialSortDesc ?? false }}
      pageSize={20}
      countLabel="aset"
      emptyMessage={emptyMessage}
      mobileCard={({ asset, clientName, openIncidents }) => (
        <Link
          href={`/assets/${asset.id}`}
          className="block rounded-md border border-border-subtle bg-surface-raised p-3.5 transition-colors duration-fast hover:border-border-strong"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-text-primary">{asset.name}</p>
              <p className="numeric mt-0.5 truncate text-[12px] text-text-muted">
                {stripProtocol(asset.domainUrl)}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-text-secondary">
                {clientName ?? 'Tanpa klien'}
              </p>
            </div>
            <HealthBadge status={asset.healthStatus} />
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border-subtle pt-2.5">
            <div>
              <dt className="label-xs">Uptime</dt>
              <dd className="numeric text-[13px] text-text-primary">
                {formatPct(asset.uptimePct30d)}
              </dd>
            </div>
            <div>
              <dt className="label-xs">SSL</dt>
              <dd
                className={cn(
                  'numeric text-[13px]',
                  asset.sslDaysRemaining !== null && asset.sslDaysRemaining <= 14
                    ? 'text-status-critical'
                    : 'text-text-primary',
                )}
              >
                {formatSslDays(asset.sslDaysRemaining)}
              </dd>
            </div>
            <div>
              <dt className="label-xs">Insiden</dt>
              <dd
                className={cn(
                  'numeric text-[13px]',
                  openIncidents > 0 ? 'text-status-critical' : 'text-text-primary',
                )}
              >
                {openIncidents}
              </dd>
            </div>
          </dl>

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <PlatformBadge platform={asset.platform} />
            <span className="numeric text-[11.5px] text-text-muted">
              {formatDate(asset.lastScanAt)}
            </span>
          </div>
        </Link>
      )}
    />
  );
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function formatPct(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function formatSslDays(days: number | null): string {
  if (days === null) return '—';
  return `${days}h`;
}

function formatDate(value: Date | null): string {
  if (!value) return 'Belum pernah';
  return value.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
