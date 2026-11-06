'use client';

import { Badge } from '@/components/ui/badge';
import { EnterpriseDataGrid, type GridColumn } from '@/components/ui/enterprise-data-grid';
import { AUDIT_ACTION_TONE, auditActionLabel } from './labels';

/**
 * Audit trail table.
 *
 * Same grid engine as the operational modules so search, facets, density and
 * paging behave identically across the product. Action labels come from the
 * shared labels module so the server-rendered filter and this table can never
 * disagree.
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

const columns: Array<GridColumn<AuditTableRow>> = [
  {
    id: 'time',
    header: 'Waktu',
    sortValue: (row) => new Date(row.createdAt).getTime(),
    cell: (row) => (
      <span className="numeric whitespace-nowrap text-[11px] text-text-secondary">
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
    hideOnMobile: true,
    cell: (row) => (
      <span className="whitespace-nowrap text-[11.5px] text-text-secondary">
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
      <span className="text-[12px] leading-snug text-text-primary">{row.summary}</span>
    ),
  },
  {
    id: 'entity',
    header: 'Entitas',
    sortValue: (row) => row.entityType,
    hideOnMobile: true,
    cell: (row) => <span className="numeric text-[10.5px] text-text-muted">{row.entityType}</span>,
  },
];

export function AuditTable({ rows }: { rows: AuditTableRow[] }) {
  return (
    <EnterpriseDataGrid<AuditTableRow>
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      facets={[
        {
          id: 'vault',
          label: 'Brankas',
          tone: 'warning',
          match: (r) => r.action.startsWith('vault.'),
        },
        {
          id: 'incident',
          label: 'Insiden',
          tone: 'info',
          match: (r) => r.action.startsWith('incident.'),
        },
        {
          id: 'auth',
          label: 'Autentikasi',
          tone: 'neutral',
          match: (r) => r.action.startsWith('auth.'),
        },
        {
          id: 'asset',
          label: 'Aset & pindai',
          tone: 'healthy',
          match: (r) => r.action.startsWith('asset.') || r.action.startsWith('scan.'),
        },
      ]}
      searchFields={[(r) => r.summary, (r) => r.actorName, (r) => actionLabel(r.action)]}
      searchPlaceholder="Cari isi ringkasan atau pelaku…"
      initialSort={{ columnId: 'time', desc: true }}
      pageSize={25}
      countLabel="entri"
      emptyMessage="Belum ada entri audit pada filter ini."
      mobileCard={(row) => (
        <div className="rounded-sm border border-border-subtle bg-surface-base p-3">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={ACTION_TONE[row.action] ?? 'neutral'} size="sm">
              {actionLabel(row.action)}
            </Badge>
            <span className="numeric ml-auto text-[10px] text-text-muted">
              {formatStamp(row.createdAt)}
            </span>
          </div>
          <p className="text-[12px] leading-snug text-text-primary">{row.summary}</p>
          <p className="mt-1 text-[10.5px] text-text-muted">
            {row.actorName ?? row.actorLabel ?? 'Sistem'} · {row.entityType}
          </p>
        </div>
      )}
    />
  );
}
