import type { Metadata } from 'next';
import { desc, eq, sql } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { db } from '@/server/db';
import { incidents, profiles, webAssets } from '@/server/db/schema';
import { PageHeader } from '@/components/layout/page-header';
import { IncidentsTable } from './incidents-table';

export const metadata: Metadata = { title: 'Tiket Insiden' };

/**
 * Incident queue (Global Dashboard Design §5.2).
 *
 * Baris 1 — mini summary ribbon scoped to this module.
 * Baris 2 — the grid, whose toolbar owns search and status facets with counts.
 *
 * The server still validates `?status=` and `?severity=` so a bookmarked link
 * keeps working; the grid adds the interactive filtering on top.
 */

const ACTIVE = ['OPEN', 'INVESTIGATING', 'CONTAINED'] as const;

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAccess('/incidents');
  const sp = await searchParams;

  const rawStatus = String(sp.status ?? '').toUpperCase();
  const rawSeverity = String(sp.severity ?? '').toUpperCase();
  const statusFilter = ['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED'].includes(
    rawStatus,
  )
    ? rawStatus
    : null;
  const severityFilter = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(rawSeverity)
    ? rawSeverity
    : null;

  const rows = await db
    .select({
      id: incidents.id,
      ticketNumber: incidents.ticketNumber,
      title: incidents.title,
      severity: incidents.severity,
      status: incidents.status,
      category: incidents.category,
      createdAt: incidents.createdAt,
      slaResolutionDueAt: incidents.slaResolutionDueAt,
      resolvedAt: incidents.resolvedAt,
      assetName: webAssets.name,
      assetId: webAssets.id,
      assigneeName: profiles.fullName,
    })
    .from(incidents)
    .innerJoin(webAssets, eq(incidents.assetId, webAssets.id))
    .leftJoin(profiles, eq(incidents.assignedTo, profiles.id))
    .where(
      statusFilter && severityFilter
        ? sql`${incidents.status} = ${statusFilter} AND ${incidents.severity} = ${severityFilter}`
        : statusFilter
          ? sql`${incidents.status} = ${statusFilter}`
          : severityFilter
            ? sql`${incidents.severity} = ${severityFilter}`
            : undefined,
    )
    .orderBy(desc(incidents.createdAt))
    .limit(200);

  const now = Date.now();
  const active = rows.filter((r) => ACTIVE.includes(r.status as never));
  const critical = rows.filter((r) => r.severity === 'CRITICAL' && r.status !== 'CLOSED');
  const breached = active.filter(
    (r) => r.slaResolutionDueAt && r.slaResolutionDueAt.getTime() < now,
  );
  const unassigned = active.filter((r) => !r.assigneeName);

  return (
    <>
      <PageHeader
        title="Tiket Insiden"
        count={{ value: active.length, label: 'aktif' }}
        description="Hitung mundur SLA dihitung ulang di klien. Klik baris untuk inspeksi tanpa kehilangan posisi antrean."
      />

      {/* ---- Mini summary ribbon ---- */}
      <section aria-label="Ringkasan tiket" className="mb-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RibbonTile label="Aktif" value={active.length} />
          <RibbonTile
            label="Kritis terbuka"
            value={critical.length}
            tone={critical.length > 0 ? 'critical' : 'neutral'}
            detail="tingkat keparahan tertinggi"
          />
          <RibbonTile
            label="Lewat tenggat"
            value={breached.length}
            tone={breached.length > 0 ? 'critical' : 'healthy'}
            detail="pelanggaran SLA"
          />
          <RibbonTile
            label="Belum ditugaskan"
            value={unassigned.length}
            tone={unassigned.length > 0 ? 'warning' : 'healthy'}
            detail="menunggu pemilik"
          />
        </div>
      </section>

      <IncidentsTable
        rows={rows.map((r) => ({
          id: r.id,
          ticketNumber: r.ticketNumber,
          title: r.title,
          severity: r.severity,
          status: r.status,
          category: r.category,
          createdAt: r.createdAt,
          slaResolutionDueAt: r.slaResolutionDueAt,
          resolvedAt: r.resolvedAt,
          assetName: r.assetName,
          assigneeName: r.assigneeName,
        }))}
      />
    </>
  );
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
      <p className={`numeric mt-1 text-[20px] font-semibold leading-none ${color}`}>{value}</p>
      {detail ? <p className="mt-1 truncate text-[10.5px] text-text-muted">{detail}</p> : null}
    </div>
  );
}
