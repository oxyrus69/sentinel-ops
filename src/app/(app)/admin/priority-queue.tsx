'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { EnterpriseDataGrid, type GridColumn } from '@/components/ui/enterprise-data-grid';
import { InspectorDrawer, InspectorField } from '@/components/ui/inspector-drawer';
import { HealthBadge, SeverityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * Priority queue (Zona D2 bottom) with the contextual inspector (Zona E).
 *
 * Clicking a row opens the drawer instead of navigating away: the operator
 * keeps the queue, its filters, and their scroll position. The row itself
 * still links out from inside the drawer for the full workspace.
 */

export interface QueueRow {
  id: string;
  kind: 'asset' | 'ticket';
  label: string;
  detail: string;
  secondary: string;
  health: string;
  severity: string | null;
  reason: string;
  metric: string;
  metricLabel: string;
  href: string;
}

const KIND_LABEL = { asset: 'Aset', ticket: 'Tiket' } as const;

export function PriorityQueue({
  assets,
  tickets,
}: {
  assets: QueueRow[];
  tickets: QueueRow[];
}) {
  const [tab, setTab] = useState<'assets' | 'tickets'>('assets');
  const [inspected, setInspected] = useState<QueueRow | null>(null);

  const rows = tab === 'assets' ? assets : tickets;

  const columns: Array<GridColumn<QueueRow>> = [
    {
      id: 'label',
      header: 'Entitas',
      sortValue: (row) => row.label,
      className: 'max-w-[280px]',
      cell: (row) => (
        <button
          type="button"
          onClick={() => setInspected(row)}
          className="block max-w-full cursor-pointer truncate text-left text-[12.5px] font-medium text-text-primary underline-offset-2 hover:text-accent hover:underline"
        >
          {row.label}
        </button>
      ),
    },
    {
      id: 'detail',
      header: 'Konteks',
      sortValue: (row) => row.detail,
      className: 'max-w-[220px]',
      hideOnMobile: true,
      cell: (row) => <span className="block truncate text-[11.5px] text-text-muted">{row.detail}</span>,
    },
    {
      id: 'state',
      header: 'Status',
      sortValue: (row) => row.severity ?? row.health,
      cell: (row) =>
        row.kind === 'ticket' && row.severity ? (
          <SeverityBadge severity={row.severity as never} />
        ) : (
          <HealthBadge status={row.health as never} />
        ),
    },
    {
      id: 'reason',
      header: 'Pemicu',
      sortValue: (row) => row.reason,
      className: 'max-w-[260px]',
      hideOnMobile: true,
      cell: (row) => <span className="block truncate text-[11.5px] text-text-secondary">{row.reason}</span>,
    },
    {
      id: 'metric',
      header: 'SLA / Metrik',
      numeric: true,
      sortValue: (row) => row.metric,
      cell: (row) => (
        <span className="numeric whitespace-nowrap text-[12px] text-text-primary" title={row.metricLabel}>
          {row.metric}
        </span>
      ),
    },
  ];

  return (
    <>
      {/* View switcher (Zona C extension) */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Antrean prioritas"
          className="flex items-center gap-px rounded-sm border border-border-subtle bg-surface-sunken p-px"
        >
          {(
            [
              ['assets', 'Aset bermasalah', assets.length],
              ['tickets', 'Tiket mendesak', tickets.length],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-fast',
                tab === value
                  ? 'bg-surface-raised text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {label}
              <span className="numeric text-[10.5px] text-text-muted">{count}</span>
            </button>
          ))}
        </div>
        <Link
          href={tab === 'assets' ? '/assets' : '/incidents'}
          className="inline-flex items-center gap-1 text-[11.5px] text-text-secondary hover:text-accent hover:underline"
        >
          Buka modul
          <ArrowRight aria-hidden="true" className="h-3 w-3" />
        </Link>
      </div>

      <EnterpriseDataGrid<QueueRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        facets={[
          {
            id: 'critical',
            label: 'Kritis',
            tone: 'critical',
            match: (r) => r.health === 'COMPROMISED' || r.health === 'DOWN' || r.severity === 'CRITICAL',
          },
          {
            id: 'warning',
            label: 'Peringatan',
            tone: 'warning',
            match: (r) => r.health === 'WARNING' || r.severity === 'HIGH',
          },
        ]}
        searchFields={[(r) => r.label, (r) => r.detail, (r) => r.reason]}
        searchPlaceholder="Cari aset atau tiket…"
        countLabel={tab === 'assets' ? 'aset' : 'tiket'}
        pageSize={8}
        initialSort={{ columnId: 'metric', desc: false }}
        emptyMessage={
          tab === 'assets'
            ? 'Tidak ada aset yang membutuhkan tindakan.'
            : 'Tidak ada tiket aktif.'
        }
        mobileCard={(row) => (
          <button
            type="button"
            onClick={() => setInspected(row)}
            className="block w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-base p-3 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="numeric text-[10.5px] uppercase tracking-wider text-text-muted">
                {KIND_LABEL[row.kind]}
              </span>
              {row.kind === 'ticket' && row.severity ? (
                <SeverityBadge severity={row.severity as never} />
              ) : (
                <HealthBadge status={row.health as never} />
              )}
            </div>
            <p className="mt-1 truncate text-[13px] font-medium text-text-primary">{row.label}</p>
            <p className="truncate text-[11.5px] text-text-muted">{row.detail}</p>
            <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-text-secondary">{row.reason}</p>
            <p className="numeric mt-1.5 text-[11.5px] text-text-primary">{row.metric}</p>
          </button>
        )}
      />

      <InspectorDrawer
        open={inspected !== null}
        onClose={() => setInspected(null)}
        title={inspected?.label ?? ''}
        subtitle={inspected?.detail}
        status={
          inspected ? (
            <>
              <span className="numeric rounded-sm border border-border-subtle px-1.5 py-0.5 text-[10.5px] uppercase tracking-wider text-text-muted">
                {KIND_LABEL[inspected.kind]}
              </span>
              {inspected.kind === 'ticket' && inspected.severity ? (
                <SeverityBadge severity={inspected.severity as never} />
              ) : (
                <HealthBadge status={inspected.health as never} />
              )}
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
                      <InspectorField label="Entitas">{inspected.label}</InspectorField>
                      <InspectorField label="Konteks">{inspected.detail}</InspectorField>
                      <InspectorField label="Pemicu">{inspected.reason}</InspectorField>
                      <InspectorField label={inspected.metricLabel} numeric>
                        {inspected.metric}
                      </InspectorField>
                      <InspectorField label="Keterangan tambahan">{inspected.secondary}</InspectorField>
                    </dl>
                  ),
                },
                {
                  label: 'Tindakan',
                  body: (
                    <div className="space-y-2">
                      <p className="text-[12px] leading-relaxed text-text-secondary">
                        Buka ruang kerja lengkap untuk riwayat pemindaian, jejak audit, dan aksi
                        perbaikan. Panel ini tetap terbuka sehingga antrean tidak hilang.
                      </p>
                      <Button asChild variant="primary" size="sm">
                        <Link href={inspected.href}>
                          Buka ruang kerja
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
                <Link href={inspected.href}>Buka {KIND_LABEL[inspected.kind]}</Link>
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
