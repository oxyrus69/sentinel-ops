'use client';

import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { AUDIT_ACTION_TONE, auditActionLabel } from './labels';

/**
 * Audit trail table.
 *
 * A Client Component so the table can sort client-side; the page only passes
 * plain log rows. Action labels come from the shared labels module so the
 * server-rendered filter and this table can never disagree.
 */

export interface AuditTableRow {
  id: string;
  createdAt: Date;
  action: string;
  actorLabel: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  summary: string;
}

const ACTION_TONE = AUDIT_ACTION_TONE;

function actionLabel(action: string): string {
  return auditActionLabel(action);
}

function formatStamp(value: Date, withSeconds = false): string {
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' as const } : {}),
    timeZone: 'Asia/Jakarta',
  });
}

const columns: Array<DataTableColumn<AuditTableRow>> = [
  {
    id: 'time',
    header: 'Waktu',
    sortValue: (row) => new Date(row.createdAt).getTime(),
    cell: (row) => (
      <span className="numeric whitespace-nowrap text-[11.5px] text-text-secondary">
        {formatStamp(row.createdAt, true)}
      </span>
    ),
  },
  {
    id: 'action',
    header: 'Aksi',
    sortValue: (row) => actionLabel(row.action),
    cell: (row) => (
      <Badge tone={ACTION_TONE[row.action] ?? 'neutral'} size="sm">
        {actionLabel(row.action)}
      </Badge>
    ),
  },
  {
    id: 'actor',
    header: 'Pelaku',
    sortValue: (row) => row.actorName ?? row.actorLabel,
    cell: (row) => (
      <span className="whitespace-nowrap text-[12px] text-text-secondary">
        {row.actorName ?? row.actorLabel ?? 'Sistem'}
      </span>
    ),
  },
  {
    id: 'summary',
    header: 'Ringkasan',
    sortValue: (row) => row.summary,
    className: 'max-w-[420px]',
    cell: (row) => (
      <span className="text-[12.5px] leading-snug text-text-primary">{row.summary}</span>
    ),
  },
  {
    id: 'entity',
    header: 'Aktif',
    sortValue: (row) => row.entityType,
    cell: (row) => (
      <span className="numeric text-[11px] text-text-muted">{row.entityType}</span>
    ),
  },
];

export function AuditTable({ rows }: { rows: AuditTableRow[] }) {
  return (
    <DataTable<AuditTableRow>
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      initialSort={{ columnId: 'time', desc: true }}
      pageSize={25}
      countLabel="entri"
      emptyMessage="Belum ada entri audit pada filter ini."
      mobileCard={(row) => (
        <div className="rounded-md border border-border-subtle bg-surface-raised p-3">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={ACTION_TONE[row.action] ?? 'neutral'} size="sm">
              {actionLabel(row.action)}
            </Badge>
            <span className="numeric ml-auto text-[10.5px] text-text-muted">
              {formatStamp(row.createdAt)}
            </span>
          </div>
          <p className="text-[12.5px] leading-snug text-text-primary">{row.summary}</p>
          <p className="mt-1 text-[11px] text-text-muted">
            {row.actorName ?? row.actorLabel ?? 'Sistem'} · {row.entityType}
          </p>
        </div>
      )}
    />
  );
}
