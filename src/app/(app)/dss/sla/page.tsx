import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { db } from '@/server/db';
import { incidents, profiles, webAssets } from '@/server/db/schema';
import { loadThresholds } from '@/server/services/dssEngine';
import { countActiveTicketsByAssignee } from '@/server/services/incidentEngine';
import { evaluateSlaPure, computeSlaCompliancePct } from '@/lib/slaMath';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, IncidentStatusBadge, SeverityBadge } from '@/components/ui/badge';
import { SlaCountdown } from '@/components/ui/sla-countdown';
import {
  Table,
  TableEmpty,
  TableWrap,
  TBody,
  TD,
  TDMuted,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Beban Tim & SLA' };

export default async function DssSlaPage() {
  await requirePageAccess('/dss');
  const thresholds = await loadThresholds();

  const [workload, allIncidents] = await Promise.all([
    countActiveTicketsByAssignee(),
    db
      .select({
        id: incidents.id,
        ticketNumber: incidents.ticketNumber,
        title: incidents.title,
        severity: incidents.severity,
        status: incidents.status,
        createdAt: incidents.createdAt,
        slaResolutionDueAt: incidents.slaResolutionDueAt,
        resolvedAt: incidents.resolvedAt,
        slaBreached: incidents.slaBreached,
        assetName: webAssets.name,
        assigneeName: profiles.fullName,
      })
      .from(incidents)
      .innerJoin(webAssets, eq(incidents.assetId, webAssets.id))
      .leftJoin(profiles, eq(incidents.assignedTo, profiles.id))
      .orderBy(desc(incidents.createdAt))
      .limit(200),
  ]);

  const now = new Date();
  const active = allIncidents.filter((i) =>
    ['OPEN', 'INVESTIGATING', 'CONTAINED'].includes(i.status),
  );
  const closed = allIncidents.filter((i) => ['RESOLVED', 'CLOSED'].includes(i.status));

  const breached = allIncidents.filter((i) => i.slaBreached).length;
  const compliance = computeSlaCompliancePct({
    total: allIncidents.length,
    breached,
  });

  // Tickets whose remaining window is within the warning ratio.
  const atRisk = active.filter((i) => {
    if (!i.slaResolutionDueAt) return false;
    const total = i.slaResolutionDueAt.getTime() - i.createdAt.getTime();
    if (total <= 0) return true;
    const remaining = i.slaResolutionDueAt.getTime() - now.getTime();
    return remaining <= 0 || (remaining / total) * 100 <= thresholds.slaWarnRatioPct;
  });

  const unassigned = active.filter((i) => !i.assigneeName).length;
  const overloaded = workload.filter(
    (w) => w.count > thresholds.maxActiveTicketsPerEngineer,
  );

  return (
    <>
      <PageHeader
        title="Beban Tim & Kepatuhan SLA"
        description={`Kepatuhan dihitung dari tiket yang telah ditutup maupun yang masih berjalan. Ambang peringatan SLA ${thresholds.slaWarnRatioPct}% sisa waktu; batas tiket aktif per teknisi ${thresholds.maxActiveTicketsPerEngineer}.`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Kepatuhan SLA"
          value={`${compliance}%`}
          tone={compliance >= 95 ? 'healthy' : compliance >= 80 ? 'warning' : 'critical'}
        />
        <Tile label="Tiket aktif" value={String(active.length)} tone="neutral" />
        <Tile
          label="Risiko tenggat"
          value={String(atRisk.length)}
          tone={atRisk.length > 0 ? 'warning' : 'healthy'}
        />
        <Tile
          label="Belum ditugaskan"
          value={String(unassigned)}
          tone={unassigned > 0 ? 'critical' : 'healthy'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Workload */}
        <Card padding="lg">
          <CardHeader className="mb-3">
            <div>
              <CardTitle>Beban Teknisi</CardTitle>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                Jumlah tiket aktif yang dipegang tiap teknisi.
              </p>
            </div>
            <Badge tone={overloaded.length > 0 ? 'warning' : 'healthy'} size="sm">
              {overloaded.length > 0 ? `${overloaded.length} di atas batas` : 'Seimbang'}
            </Badge>
          </CardHeader>

          {workload.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-text-muted">
              Tidak ada tiket aktif yang ditugaskan.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {workload.map((w) => {
                const over = w.count > thresholds.maxActiveTicketsPerEngineer;
                const pct = Math.min(
                  100,
                  (w.count / Math.max(1, thresholds.maxActiveTicketsPerEngineer)) * 100,
                );
                return (
                  <li key={w.assigneeId ?? w.fullName}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] text-text-primary">{w.fullName}</span>
                      <span
                        className={cn(
                          'numeric shrink-0 text-[12px]',
                          over ? 'font-medium text-status-critical' : 'text-text-secondary',
                        )}
                      >
                        {w.count} / {thresholds.maxActiveTicketsPerEngineer}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={w.count}
                      aria-valuemin={0}
                      aria-valuemax={thresholds.maxActiveTicketsPerEngineer}
                      aria-label={`Tiket aktif ${w.fullName}`}
                      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
                    >
                      <div
                        className={cn(
                          'h-full rounded-full',
                          over ? 'bg-status-critical' : 'bg-accent',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* At risk */}
        <Card padding="lg">
          <CardHeader className="mb-3">
            <div>
              <CardTitle>Tiket Berisiko Tenggat</CardTitle>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                Sisa waktu ≤ {thresholds.slaWarnRatioPct}% dari kuota SLA, atau sudah lewat.
              </p>
            </div>
            <Badge tone={atRisk.length > 0 ? 'critical' : 'healthy'} size="sm">
              {atRisk.length}
            </Badge>
          </CardHeader>

          {atRisk.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-text-muted">
              Semua tiket aktif masih jauh dari tenggat.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {atRisk.map((t) => {
                const sla = evaluateSlaPure({
                  createdAt: t.createdAt,
                  severity: t.severity,
                  resolutionDueAt: t.slaResolutionDueAt,
                  status: t.status,
                  resolvedAt: t.resolvedAt,
                  now,
                  warnRatioPct: thresholds.slaWarnRatioPct,
                });
                return (
                  <li key={t.id} className="py-2.5">
                    <Link
                      href={`/incidents/${t.id}`}
                      className="flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5">
                          <span className="numeric text-[11.5px] text-text-muted">
                            {t.ticketNumber}
                          </span>
                          <SeverityBadge severity={t.severity} />
                          <IncidentStatusBadge status={t.status} />
                        </p>
                        <p className="mt-0.5 truncate text-[12.5px] text-text-primary">
                          {t.title}
                        </p>
                        <p className="truncate text-[11px] text-text-muted">
                          {t.assigneeName ?? 'Belum ditugaskan'}
                        </p>
                      </div>
                      <SlaCountdown
                        dueAt={t.slaResolutionDueAt?.toISOString() ?? null}
                        createdAt={t.createdAt.toISOString()}
                        state={sla.state}
                        initialLabel={sla.remainingLabel}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Closed ticket compliance table */}
      <Card padding="none" className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <CardTitle>Riwayat Kepatuhan SLA</CardTitle>
          <span className="numeric text-[11.5px] text-text-muted">
            {closed.length} tiket ditutup · {breached} pelanggaran
          </span>
        </div>
        <TableWrap className="rounded-none border-0">
          <Table>
            <THead>
              <TR>
                <TH>Nomor</TH>
                <TH>Judul</TH>
                <TH>Severity</TH>
                <TH>Status</TH>
                <TH>Tenggat</TH>
                <TH>Selesai</TH>
                <TH>SLA</TH>
              </TR>
            </THead>
            <TBody>
              {closed.length === 0 ? (
                <TableEmpty colSpan={7}>Belum ada tiket yang ditutup.</TableEmpty>
              ) : (
                closed.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <Link
                        href={`/incidents/${t.id}`}
                        className="numeric text-[12px] text-text-primary hover:text-accent hover:underline"
                      >
                        {t.ticketNumber}
                      </Link>
                    </TD>
                    <TDMuted className="max-w-[280px] truncate">{t.title}</TDMuted>
                    <TD>
                      <SeverityBadge severity={t.severity} />
                    </TD>
                    <TD>
                      <IncidentStatusBadge status={t.status} />
                    </TD>
                    <TDMuted>{formatDate(t.slaResolutionDueAt)}</TDMuted>
                    <TDMuted>{formatDate(t.resolvedAt)}</TDMuted>
                    <TD>
                      <Badge tone={t.slaBreached ? 'critical' : 'healthy'} size="sm">
                        {t.slaBreached ? 'Terlambat' : 'Tepat waktu'}
                      </Badge>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableWrap>
      </Card>
    </>
  );
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'warning' | 'critical' | 'healthy';
}) {
  return (
    <Card padding="sm">
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          'numeric mt-1 text-[22px] font-semibold leading-none',
          tone === 'critical'
            ? 'text-status-critical'
            : tone === 'warning'
              ? 'text-status-warning'
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
