'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { AssetHealth, PlatformType } from '@/server/db/schema';
import { HealthBadge, PlatformBadge } from '@/components/ui/badge';
import {
  EnterpriseDataGrid,
  type GridColumn,
} from '@/components/ui/enterprise-data-grid';
import { InspectorDrawer, InspectorField } from '@/components/ui/inspector-drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * Asset table (module /assets — Global Dashboard Design §5.2).
 *
 * The grid owns search, facets, sorting, density and paging; the inspector
 * drawer shows a row without leaving the filtered list, so an operator can
 * triage a batch without losing place.
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

export function AssetsTable({
  rows,
  initialSortColumnId,
  initialSortDesc,
  emptyMessage,
  onExportSelected,
}: {
  rows: AssetTableRow[];
  initialSortColumnId?: string;
  initialSortDesc?: boolean;
  emptyMessage: string;
  onExportSelected?: (ids: string[]) => void;
}) {
  const [inspected, setInspected] = useState<AssetTableRow | null>(null);

  const columns: Array<GridColumn<AssetTableRow>> = [
    {
      id: 'name',
      header: 'Nama Aset',
      sortValue: (row) => row.asset.name,
      className: 'max-w-[240px]',
      cell: (row) => (
        <button
          type="button"
          onClick={() => setInspected(row)}
          className="block max-w-full cursor-pointer truncate text-left text-[12.5px] font-medium text-text-primary underline-offset-2 hover:text-accent hover:underline"
          title={row.asset.name}
        >
          {row.asset.name}
        </button>
      ),
    },
    {
      id: 'domain',
      header: 'Domain',
      className: 'max-w-[200px]',
      cell: (row) => (
        <span className="numeric block truncate text-[11.5px] text-text-secondary">
          {stripProtocol(row.asset.domainUrl)}
        </span>
      ),
    },
    {
      id: 'client',
      header: 'Klien',
      sortValue: (row) => row.clientName,
      className: 'max-w-[160px]',
      hideOnMobile: true,
      cell: (row) => (
        <span className="block truncate text-[11.5px] text-text-secondary">
          {row.clientName ?? 'Tanpa klien'}
        </span>
      ),
    },
    {
      id: 'platform',
      header: 'Platform',
      hideOnMobile: true,
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
      sortDescFirst: false,
      sortValue: (row) => Number(row.asset.uptimePct30d),
      cell: (row) => <span className="whitespace-nowrap">{formatPct(row.asset.uptimePct30d)}</span>,
    },
    {
      id: 'ssl',
      header: 'SSL',
      numeric: true,
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
          className={cn(
            'font-medium',
            row.openIncidents > 0 ? 'text-status-critical' : 'text-text-muted',
          )}
        >
          {row.openIncidents}
        </span>
      ),
    },
    {
      id: 'scanned',
      header: 'Dipindai',
      hideOnMobile: true,
      sortValue: (row) => (row.asset.lastScanAt ? row.asset.lastScanAt.getTime() : null),
      cell: (row) => (
        <span className="numeric whitespace-nowrap text-[11.5px] text-text-secondary">
          {formatDate(row.asset.lastScanAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => setInspected(row)}
            aria-label={`Inspeksi ${row.asset.name}`}
            title="Inspeksi"
          >
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <EnterpriseDataGrid<AssetTableRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.asset.id}
        facets={[
          { id: 'critical', label: 'Terkompromi', tone: 'critical', match: (r) => r.asset.healthStatus === 'COMPROMISED' },
          { id: 'down', label: 'Mati', tone: 'critical', match: (r) => r.asset.healthStatus === 'DOWN' },
          { id: 'warning', label: 'Peringatan', tone: 'warning', match: (r) => r.asset.healthStatus === 'WARNING' },
          { id: 'healthy', label: 'Sehat', tone: 'healthy', match: (r) => r.asset.healthStatus === 'HEALTHY' },
        ]}
        searchFields={[
          (r) => r.asset.name,
          (r) => r.asset.domainUrl,
          (r) => r.clientName,
        ]}
        searchPlaceholder="Cari nama, domain, atau klien…"
        initialSort={{ columnId: initialSortColumnId ?? 'name', desc: initialSortDesc ?? false }}
        pageSize={20}
        countLabel="aset"
        emptyMessage={emptyMessage}
        bulkActions={
          onExportSelected ? [{ label: 'Ekspor terpilih', onRun: onExportSelected }] : []
        }
        mobileCard={({ asset, clientName, openIncidents }) => (
          <button
            type="button"
            onClick={() => setInspected({ asset, clientName, openIncidents })}
            className="block w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-base p-3 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-text-primary">{asset.name}</p>
                <p className="numeric mt-0.5 truncate text-[11.5px] text-text-muted">
                  {stripProtocol(asset.domainUrl)}
                </p>
              </div>
              <HealthBadge status={asset.healthStatus} />
            </div>
            <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border-subtle pt-2">
              <div>
                <dt className="label-xs text-[10px]">Uptime</dt>
                <dd className="numeric text-[12px] text-text-primary">{formatPct(asset.uptimePct30d)}</dd>
              </div>
              <div>
                <dt className="label-xs text-[10px]">SSL</dt>
                <dd
                  className={cn(
                    'numeric text-[12px]',
                    asset.sslDaysRemaining !== null && asset.sslDaysRemaining <= 14
                      ? 'text-status-critical'
                      : 'text-text-primary',
                  )}
                >
                  {formatSslDays(asset.sslDaysRemaining)}
                </dd>
              </div>
              <div>
                <dt className="label-xs text-[10px]">Insiden</dt>
                <dd
                  className={cn(
                    'numeric text-[12px]',
                    openIncidents > 0 ? 'text-status-critical' : 'text-text-primary',
                  )}
                >
                  {openIncidents}
                </dd>
              </div>
            </dl>
          </button>
        )}
      />

      <InspectorDrawer
        open={inspected !== null}
        onClose={() => setInspected(null)}
        title={inspected?.asset.name ?? ''}
        subtitle={inspected ? stripProtocol(inspected.asset.domainUrl) : undefined}
        status={
          inspected ? (
            <>
              <HealthBadge status={inspected.asset.healthStatus} />
              <PlatformBadge platform={inspected.asset.platform} />
            </>
          ) : null
        }
        tabs={
          inspected
            ? [
                {
                  label: 'Ringkasan & Metadata',
                  body: (
                    <dl>
                      <InspectorField label="Klien">{inspected.clientName ?? 'Tanpa klien'}</InspectorField>
                      <InspectorField label="Platform">{inspected.asset.platform}</InspectorField>
                      <InspectorField label="Uptime 30 hari" numeric>
                        {formatPct(inspected.asset.uptimePct30d)}
                      </InspectorField>
                      <InspectorField label="Sisa SSL" numeric>
                        {formatSslDays(inspected.asset.sslDaysRemaining)}
                      </InspectorField>
                      <InspectorField label="Insiden terbuka" numeric>
                        {inspected.openIncidents}
                      </InspectorField>
                      <InspectorField label="Pemindaian terakhir" numeric>
                        {formatDate(inspected.asset.lastScanAt)}
                      </InspectorField>
                    </dl>
                  ),
                },
                {
                  label: 'Tindakan',
                  body: (
                    <div className="space-y-2">
                      <p className="text-[12px] leading-relaxed text-text-secondary">
                        Buka ruang kerja aset untuk menjalankan pemindaian, melihat riwayat temuan,
                        kredensial terkait, dan metadata server.
                      </p>
                      <Button asChild variant="primary" size="sm">
                        <Link href={`/assets/${inspected.asset.id}`}>
                          Buka ruang kerja aset
                          <ExternalLink aria-hidden="true" className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  ),
                },
              ]
            : undefined
        }
        footer={
          inspected ? (
            <>
              <Button asChild variant="primary" size="sm">
                <Link href={`/assets/${inspected.asset.id}`}>Buka aset</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setInspected(null)}>
                Tutup
              </Button>
            </>
          ) : null
        }
      />
    </>
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
  return `${days} hari`;
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
