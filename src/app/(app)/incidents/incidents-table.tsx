'use client';

import Link from 'next/link';
import type { IncidentSeverity, IncidentStatus, ThreatCategory } from '@/server/db/schema';
import { IncidentStatusBadge, SeverityBadge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { SlaCountdown } from '@/components/ui/sla-countdown';
import { evaluateSlaPure } from '@/lib/slaMath';

/**
 * Incident queue.
 *
 * A Client Component because the table library renders the cells. The SLA state
 * is recomputed here from the deletion-safe timestamps, so the
 * countdown, the badge colour and the sort order always agree with each other
 * rather than being three independent readings of a stale server value.
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

/** Milliseconds until the resolution deadline; Infinity when there is none. */
function remainingMs(row: IncidentTableRow, now: number): number {
  if (!row.slaResolutionDueAt) return Number.POSITIVE_INFINITY;
  return row.slaResolutionDueAt.getTime() - now;
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

const columns: Array<DataTableColumn<IncidentTableRow>> = [
  {
    id: 'ticket',
    header: 'Nomor',
    sortValue: (row) => row.ticketNumber,
    cell: (row) => (
      <Link
        href={`/incidents/${row.id}`}
        className="numeric text-[12.5px] font-medium text-text-primary hover:text-accent hover:underline"
      >
        {row.ticketNumber}
      </Link>
    ),
  },
  {
    id: 'title',
    header: 'Judul',
    sortValue: (row) => row.title,
    className: 'max-w-[360px]',
    cell: (row) => (
      <Link href={`/incidents/${row.id}`} className="block truncate hover:text-accent">
        {row.title}
      </Link>
    ),
  },
  {
    id: 'asset',
    header: 'Aset',
    sortValue: (row) => row.assetName,
    className: 'max-w-[180px]',
    cell: (row) => <span className="block truncate text-text-secondary">{row.assetName}</span>,
  },
  {
    id: 'severity',
    header: 'Severity',
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
    // Soonest deadline first, so the most urgent ticket rises to the top.
    sortDescFirst: false,
    sortValue: (row) => remainingMs(row, Date.now()),
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
    cell: (row) => (
      <span className="text-text-secondary">{row.assigneeName ?? '—'}</span>
    ),
  },
];

export function IncidentsTable({
  rows,
  initialSortColumnId,
  emptyMessage,
}: {
  rows: IncidentTableRow[];
  initialSortColumnId?: string;
  emptyMessage: string;
}) {
  return (
    <DataTable<IncidentTableRow>
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      initialSort={{ columnId: initialSortColumnId ?? 'sla', desc: false }}
      pageSize={25}
      countLabel="tiket"
      emptyMessage={emptyMessage}
      mobileCard={(row) => {
        const sla = evaluationFor(row);
        return (
          <Link
            href={`/incidents/${row.id}`}
            className="block rounded-md border border-border-subtle bg-surface-raised p-3 transition-colors hover:border-border-strong"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="numeric text-[11.5px] text-text-muted">{row.ticketNumber}</span>
              <SlaCountdown
                dueAt={row.slaResolutionDueAt?.toISOString() ?? null}
                createdAt={row.createdAt.toISOString()}
                state={sla.state}
                initialLabel={sla.remainingLabel}
              />
            </div>
            <p className="mt-1 text-[13px] font-medium leading-snug text-text-primary">
              {row.title}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <SeverityBadge severity={row.severity} />
              <IncidentStatusBadge status={row.status} />
              <span className="truncate text-[11.5px] text-text-muted">{row.assetName}</span>
            </div>
          </Link>
        );
      }}
    />
  );
}
