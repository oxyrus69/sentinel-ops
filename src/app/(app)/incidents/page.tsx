import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { db } from '@/server/db';
import { incidents, profiles, webAssets } from '@/server/db/schema';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { IncidentsTable } from './incidents-table';

export const metadata: Metadata = { title: 'Tiket Insiden' };

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

  const now = new Date();

  const counts = {
    active: rows.filter((r) => ['OPEN', 'INVESTIGATING', 'CONTAINED'].includes(r.status)).length,
    critical: rows.filter((r) => r.severity === 'CRITICAL' && r.status !== 'CLOSED').length,
    breached: rows.filter(
      (r) =>
        r.slaResolutionDueAt &&
        ['OPEN', 'INVESTIGATING', 'CONTAINED'].includes(r.status) &&
        r.slaResolutionDueAt.getTime() < now.getTime(),
    ).length,
  };

  const hasFilter = statusFilter !== null || severityFilter !== null;

  return (
    <>
      <PageHeader
        title="Tiket Insiden"
        description="Antrean tiket dengan hitung mundur SLA. Urut dari yang terbaru; badge warna mengikuti sisa waktu menuju tenggat resolusi."
      />

      {/* Summary strip */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryTile label="Aktif" value={counts.active} tone="neutral" />
        <SummaryTile
          label="Kritis terbuka"
          value={counts.critical}
          tone={counts.critical > 0 ? 'critical' : 'neutral'}
        />
        <SummaryTile
          label="Lewat tenggat"
          value={counts.breached}
          tone={counts.breached > 0 ? 'critical' : 'healthy'}
        />
      </div>

      {/* Filters */}
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <select
          name="status"
          defaultValue={statusFilter ?? ''}
          className="h-8 rounded-sm border border-border-subtle bg-surface-sunken px-2 text-[12.5px] text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Semua status</option>
          <option value="OPEN">Terbuka</option>
          <option value="INVESTIGATING">Investigasi</option>
          <option value="CONTAINED">Terkendali</option>
          <option value="RESOLVED">Selesai</option>
          <option value="CLOSED">Ditutup</option>
        </select>
        <select
          name="severity"
          defaultValue={severityFilter ?? ''}
          className="h-8 rounded-sm border border-border-subtle bg-surface-sunken px-2 text-[12.5px] text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Semua severity</option>
          <option value="CRITICAL">Kritis</option>
          <option value="HIGH">Tinggi</option>
          <option value="MEDIUM">Sedang</option>
          <option value="LOW">Rendah</option>
        </select>
        <button
          type="submit"
          className="h-8 cursor-pointer rounded-sm border border-border-subtle bg-surface-overlay px-3 text-[12.5px] text-text-primary transition-colors hover:border-border-strong"
        >
          Terapkan
        </button>
        {hasFilter && (
          <Link href="/incidents" className="text-[12.5px] text-text-muted hover:text-text-secondary">
            Reset
          </Link>
        )}
      </form>

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
        emptyMessage={hasFilter ? 'Belum ada tiket pada filter ini.' : 'Belum ada tiket.'}
      />
    </>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'critical' | 'healthy';
}) {
  return (
    <Card padding="sm" className="text-center">
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          'numeric mt-1 text-[22px] font-semibold leading-none',
          tone === 'critical'
            ? 'text-status-critical'
            : tone === 'healthy'
              ? 'text-status-healthy'
              : 'text-text-primary',
        )}
      >
        {value}
      </p>
    </Card>
  );
}
