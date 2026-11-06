'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { IncidentSeverity, IncidentStatus, ThreatCategory } from '@/server/db/schema';
import { IncidentStatusBadge, SeverityBadge } from '@/components/ui/badge';
import { EnterpriseDataGrid, type GridColumn } from '@/components/ui/enterprise-data-grid';
import { InspectorDrawer, InspectorField } from '@/components/ui/inspector-drawer';
import { SlaCountdown } from '@/components/ui/sla-countdown';
import { Button } from '@/components/ui/button';
import { evaluateSlaPure } from '@/lib/slaMath';

/**
 * Incident queue (Global Dashboard Design §5.2).
 *
 * SLA state is recomputed on the client from the timestamps, so the countdown,
 * the badge colour and the sort order always agree rather than being three
 * readings of a stale server value. Clicking a row opens the inspector; the
 * workspace stays one click away from inside it.
 */

export interface IncidentTableRow {
  id: string;
  ticketNumber: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  category: ThreatCategory;
  createdAt: Date;
  slaResolutionDueAt: Date | null;
  resolvedAt: Date | null;
  assetName: string;
  assigneeName: string | null;
}

const SEVERITY_SORT: Record<IncidentSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const STATUS_SORT: Record<IncidentStatus, number> = {
  OPEN: 0,
  INVESTIGATING: 1,
  CONTAINED: 2,
  RESOLVED: 3,
  CLOSED: 4,
};

const CATEGORY_LABEL: Record<string, string> = {
  SQL_INJECTION: 'Injeksi SQL',
  SLOT_DEFACEMENT: 'Defacement Slot',
  MALWARE_BACKDOOR: 'Malware / Backdoor',
  SSL_EXPIRED: 'SSL Kedaluwarsa',
  SERVER_DOWN: 'Server Mati',
  BRUTE_FORCE: 'Brute Force',
  CONFIGURATION_ERROR: 'Galat Konfigurasi',
};

function remainingMs(row: IncidentTableRow): number {
  if (!row.slaResolutionDueAt) return Number.POSITIVE_INFINITY;
  return row.slaResolutionDueAt.getTime() - Date.now();
}

function evaluationFor(row: IncidentTableRow) {
  return evaluateSlaPure({
    createdAt: row.createdAt,
    severity: row.severity,
    resolutionDueAt: row.slaResolutionDueAt,
    status: row.status,
    resolvedAt: row.resolvedAt,
  });
}

export function IncidentsTable({ rows }: { rows: IncidentTableRow[] }) {
  const [inspected, setInspected] = useState<IncidentTableRow | null>(null);

  const columns: Array<GridColumn<IncidentTableRow>> = [
    {
      id: 'ticket',
      header: 'No. Tiket',
      sortValue: (row) => row.ticketNumber,
      cell: (row) => (
        <button
          type="button"
          onClick={() => setInspected(row)}
          className="numeric cursor-pointer text-[11.5px] font-medium text-text-primary hover:text-accent hover:underline"
        >
          {row.ticketNumber}
        </button>
      ),
    },
    {
      id: 'title',
      header: 'Judul',
      sortValue: (row) => row.title,
      className: 'max-w-[320px]',
      cell: (row) => (
        <button
          type="button"
          onClick={() => setInspected(row)}
          className="block max-w-full cursor-pointer truncate text-left text-[12.5px] text-text-primary hover:text-accent"
        >
          {row.title}
        </button>
      ),
    },
    {
      id: 'asset',
      header: 'Aset',
      sortValue: (row) => row.assetName,
      className: 'max-w-[160px]',
      hideOnMobile: true,
      cell: (row) => <span className="block truncate text-[11.5px] text-text-secondary">{row.assetName}</span>,
    },
    {
      id: 'severity',
      header: 'Keparahan',
      sortValue: (row) => SEVERITY_SORT[row.severity],
      cell: (row) => <SeverityBadge severity={row.severity} />,
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (row) => STATUS_SORT[row.status],
      cell: (row) => <IncidentStatusBadge status={row.status} />,
    },
    {
      id: 'sla',
      header: 'SLA',
      sortDescFirst: false,
      sortValue: (row) => remainingMs(row),
      cell: (row) => {
        const sla = evaluationFor(row);
        return (
          <SlaCountdown
            dueAt={row.slaResolutionDueAt?.toISOString() ?? null}
            createdAt={row.createdAt.toISOString()}
            state={sla.state}
            initialLabel={sla.remainingLabel}
          />
        );
      },
    },
    {
      id: 'assignee',
      header: 'Ditugaskan',
      sortValue: (row) => row.assigneeName,
      hideOnMobile: true,
      cell: (row) => (
        <span className="truncate text-[11.5px] text-text-secondary">{row.assigneeName ?? '—'}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex items-center justify-end opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => setInspected(row)}
            aria-label={`Inspeksi tiket ${row.ticketNumber}`}
            title="Inspeksi"
          >
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const activeStatuses: IncidentStatus[] = ['OPEN', 'INVESTIGATING', 'CONTAINED'];

  return (
    <>
      <EnterpriseDataGrid<IncidentTableRow>
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        facets={[
          {
            id: 'open',
            label: 'Terbuka',
            tone: 'critical',
            match: (r) => r.status === 'OPEN',
          },
          {
            id: 'investigating',
            label: 'Investigasi',
            tone: 'warning',
            match: (r) => r.status === 'INVESTIGATING',
          },
          {
            id: 'breached',
            label: 'Lewat tenggat',
            tone: 'critical',
            match: (r) =>
              activeStatuses.includes(r.status) &&
              r.slaResolutionDueAt !== null &&
              r.slaResolutionDueAt.getTime() < Date.now(),
          },
          {
            id: 'resolved',
            label: 'Selesai',
            tone: 'healthy',
            match: (r) => r.status === 'RESOLVED' || r.status === 'CLOSED',
          },
        ]}
        searchFields={[(r) => r.ticketNumber, (r) => r.title, (r) => r.assetName, (r) => r.assigneeName]}
        searchPlaceholder="Cari nomor tiket, judul, atau aset…"
        initialSort={{ columnId: 'sla', desc: false }}
        pageSize={20}
        countLabel="tiket"
        emptyMessage="Tidak ada tiket yang cocok dengan filter ini."
        mobileCard={(row) => {
          const sla = evaluationFor(row);
          return (
            <button
              type="button"
              onClick={() => setInspected(row)}
              className="block w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-base p-3 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="numeric text-[10.5px] text-text-muted">{row.ticketNumber}</span>
                <SlaCountdown
                  dueAt={row.slaResolutionDueAt?.toISOString() ?? null}
                  createdAt={row.createdAt.toISOString()}
                  state={sla.state}
                  initialLabel={sla.remainingLabel}
                />
              </div>
              <p className="mt-1 text-[12.5px] font-medium leading-snug text-text-primary">{row.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <SeverityBadge severity={row.severity} />
                <IncidentStatusBadge status={row.status} />
                <span className="truncate text-[11px] text-text-muted">{row.assetName}</span>
              </div>
            </button>
          );
        }}
      />

      <InspectorDrawer
        open={inspected !== null}
        onClose={() => setInspected(null)}
        title={inspected?.title ?? ''}
        subtitle={inspected ? `${inspected.ticketNumber} · ${inspected.assetName}` : undefined}
        status={
          inspected ? (
            <>
              <SeverityBadge severity={inspected.severity} />
              <IncidentStatusBadge status={inspected.status} />
              {activeStatuses.includes(inspected.status) ? (
                <SlaCountdown
                  dueAt={inspected.slaResolutionDueAt?.toISOString() ?? null}
                  createdAt={inspected.createdAt.toISOString()}
                  state={evaluationFor(inspected).state}
                  initialLabel={evaluationFor(inspected).remainingLabel}
                />
              ) : null}
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
                      <InspectorField label="Nomor tiket" numeric>
                        {inspected.ticketNumber}
                      </InspectorField>
                      <InspectorField label="Kategori">
                        {CATEGORY_LABEL[inspected.category] ?? inspected.category}
                      </InspectorField>
                      <InspectorField label="Aset">{inspected.assetName}</InspectorField>
                      <InspectorField label="Ditugaskan">
                        {inspected.assigneeName ?? 'Belum ditugaskan'}
                      </InspectorField>
                      <InspectorField label="Dibuat" numeric>
                        {formatStamp(inspected.createdAt)}
                      </InspectorField>
                      <InspectorField label="Tenggat resolusi" numeric>
                        {inspected.slaResolutionDueAt
                          ? formatStamp(inspected.slaResolutionDueAt)
                          : 'Tanpa tenggat'}
                      </InspectorField>
                      {inspected.resolvedAt ? (
                        <InspectorField label="Diselesaikan" numeric>
                          {formatStamp(inspected.resolvedAt)}
                        </InspectorField>
                      ) : null}
                    </dl>
                  ),
                },
                {
                  label: 'Tindakan',
                  body: (
                    <div className="space-y-2">
                      <p className="text-[12px] leading-relaxed text-text-secondary">
                        Ruang kerja insiden memuat runbook mitigasi, diskusi internal, dan formulir
                        penutupan dengan analisis akar masalah.
                      </p>
                      <Button asChild variant="primary" size="sm">
                        <Link href={`/incidents/${inspected.id}`}>
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
                <Link href={`/incidents/${inspected.id}`}>Tangani tiket</Link>
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

function formatStamp(value: Date): string {
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}
