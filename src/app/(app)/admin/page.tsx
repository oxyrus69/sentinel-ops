import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarDays, ShieldAlert } from 'lucide-react';
import { requirePageAccess } from '@/server/auth/guard';
import {
  getAssetsNeedingAction,
  getDailyTrend,
  getIncidentTrend,
  getKpiSummary,
  getRecentAuditActivity,
  getTicketsNearSla,
} from '@/server/services/analytics';
import { buildRecommendations } from '@/server/services/dssEngine';
import { PageHeader } from '@/components/layout/page-header';
import { KpiStatCard } from '@/components/ui/kpi-stat-card';
import { TelemetryRail } from '@/components/ui/telemetry-rail';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TDNum, TH, THead, TR } from '@/components/ui/table';
import { AUDIT_ACTION_TONE } from '@/app/(app)/admin/audit/labels';import { IncidentTrendChart } from './incident-trend-chart';
import { ScanActivityChart } from './scan-activity-chart';
import { PriorityQueue, type QueueRow } from './priority-queue';

export const metadata: Metadata = { title: 'Dasbor Komando' };

/**
 * Executive command dashboard (Global Dashboard Design §5.1).
 *
 * Row 1 — contextual alert banner, only when something is actually on fire.
 * Row 2 — four KPI cards with sparkline / delta / threshold context.
 * Row 3 — 8-col chart + data matrix | 4-col telemetry and DSS rail.
 * Row 4 — 8-col priority queue | 4-col activity stream.
 */

const SLA_TARGET = 98;

export default async function AdminDashboardPage() {
  const user = await requirePageAccess('/admin');

  const [kpi, trend, needAction, nearSla, dss, daily, audit] = await Promise.all([
    getKpiSummary(),
    getIncidentTrend(6),
    getAssetsNeedingAction(),
    getTicketsNearSla(6),
    buildRecommendations(),
    getDailyTrend(30),
    getRecentAuditActivity(7),
  ]);

  const topRecommendation = dss.recommendations[0] ?? null;
  const compromisedTotal = kpi.compromisedAssets + kpi.downAssets;
  const totalTickets = trend.reduce((a, t) => a + t.total, 0);
  const totalResolved = trend.reduce((a, t) => a + t.resolved, 0);

  // Sparkline series (normalized downstream by the card).
  const incidentSpark = trend.map((t) => t.total);
  const scanSpark = daily.slice(-7).map((d) => d.scans);
  const threatSpark = daily.slice(-7).map((d) => d.threats);

  // --- Alert banner facts -------------------------------------------------
  const breachCount = nearSla.filter((t) => t.remainingMs <= 0).length;
  const showAlert = compromisedTotal > 0 || breachCount > 0 || kpi.slaCompliancePct < SLA_TARGET;

  // --- Queue rows ---------------------------------------------------------
  const assetRows: QueueRow[] = needAction.map((a) => ({
    id: `asset:${a.id}`,
    kind: 'asset',
    label: a.name,
    detail: a.domainUrl.replace(/^https?:\/\//, ''),
    secondary: `Platform ${a.platform}`,
    health: a.healthStatus,
    severity: null,
    reason: a.reason,
    metric: a.sslDaysRemaining !== null ? `${a.sslDaysRemaining} hari` : '—',
    metricLabel: 'Sisa SSL',
    href: `/assets/${a.id}`,
  }));

  const ticketRows: QueueRow[] = nearSla.map((t) => ({
    id: `ticket:${t.id}`,
    kind: 'ticket',
    label: t.title,
    detail: `${t.ticketNumber} · ${t.assetName}`,
    secondary: t.assigneeName ? `Ditugaskan ke ${t.assigneeName}` : 'Belum ditugaskan',
    health: 'WARNING',
    severity: t.severity,
    reason: `Status ${t.status.toLowerCase()} · tenggat resolusi`,
    metric: t.remainingMs <= 0 ? 'lewat tenggat' : formatRemaining(t.remainingMs),
    metricLabel: 'Sisa waktu SLA',
    href: `/incidents/${t.id}`,
  }));

  return (
    <>
      {/* ---- Zona C: contextual sub-header ---- */}
      <PageHeader
        title="Dasbor Komando"
        count={{ value: kpi.totalAssets, label: 'aset terpantau' }}
        description="Angka dihitung langsung dari basis data setiap halaman dibuka, bukan cache."
        views={
          <span className="numeric hidden items-center gap-1.5 rounded-sm border border-border-subtle bg-surface-sunken px-2 py-1 text-[11px] text-text-muted sm:flex">
            <CalendarDays aria-hidden="true" className="h-3 w-3" />
            {new Date().toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        }
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/dss">
              Rekomendasi DSS
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />

      {/* ---- Alert banner: only when an incident is live ---- */}
      {showAlert ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2">
          <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-status-critical" />
          <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-text-primary">
            <span className="font-semibold text-status-critical">Perlu perhatian sekarang. </span>
            {compromisedTotal > 0 ? (
              <>
                <span className="numeric font-medium">{compromisedTotal}</span> aset terkompromi atau mati.
              </>
            ) : null}
            {breachCount > 0 ? (
              <>
                {' '}
                <span className="numeric font-medium">{breachCount}</span> tiket sudah melewati tenggat SLA.
              </>
            ) : null}
            {kpi.slaCompliancePct < SLA_TARGET ? (
              <>
                {' '}
                Kepatuhan SLA <span className="numeric font-medium">{kpi.slaCompliancePct}%</span>, di
                bawah target {SLA_TARGET}%.
              </>
            ) : null}
          </p>
          <Link
            href="/incidents"
            className="shrink-0 text-[12px] font-medium text-status-critical hover:underline"
          >
            Buka antrean
          </Link>
        </div>
      ) : null}

      {/* ---- Zona D1: KPI strip (4 cards) ---- */}
      <section aria-label="Indikator utama" className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiStatCard
            label="Aset Terkelola"
            value={kpi.totalAssets}
            tone="neutral"
            spark={scanSpark.length >= 2 ? scanSpark : undefined}
            sparkColorVar="var(--color-chart-2)"
            context={`${kpi.healthyAssets} sehat · ${kpi.warningAssets} peringatan`}
            progressPct={(kpi.healthyAssets / Math.max(kpi.totalAssets, 1)) * 100}
            progressTone="healthy"
            href="/assets"
            formula="Jumlah seluruh aset web yang terdaftar pada inventaris."
          />
          <KpiStatCard
            label="Perlu Tindakan"
            value={compromisedTotal}
            tone={compromisedTotal > 0 ? 'critical' : 'healthy'}
            delta={compromisedTotal > 0 ? `${compromisedTotal} aset` : undefined}
            deltaSentiment={compromisedTotal > 0 ? 'up_bad' : 'up_good'}
            context={`${kpi.compromisedAssets} kompromi · ${kpi.downAssets} mati · ${kpi.sslExpiringIn14Days} SSL ≤14 hari`}
            progressPct={
              ((kpi.totalAssets - compromisedTotal) / Math.max(kpi.totalAssets, 1)) * 100
            }
            progressTone={compromisedTotal > 0 ? 'critical' : 'healthy'}
            href="/assets?health=COMPROMISED"
            formula="Aset berstatus COMPROMISED atau DOWN dihitung dari tabel web_assets."
          />
          <KpiStatCard
            label="Insiden Aktif"
            value={kpi.activeIncidents}
            tone={kpi.openBySeverity.CRITICAL > 0 ? 'critical' : 'neutral'}
            spark={incidentSpark.length >= 2 ? incidentSpark : undefined}
            sparkColorVar="var(--color-chart-4)"
            context={`${kpi.openBySeverity.CRITICAL} kritis · ${kpi.openBySeverity.HIGH} tinggi · ${kpi.resolvedIncidents} selesai`}
            href="/incidents"
            formula="Tiket berstatus OPEN, INVESTIGATING, atau CONTAINED."
          />
          <KpiStatCard
            label="Kepatuhan SLA"
            value={kpi.slaCompliancePct}
            unit="%"
            tone={
              kpi.slaCompliancePct >= SLA_TARGET
                ? 'healthy'
                : kpi.slaCompliancePct >= 80
                  ? 'warning'
                  : 'critical'
            }
            delta={
              kpi.slaCompliancePct >= SLA_TARGET
                ? `+${(kpi.slaCompliancePct - SLA_TARGET).toFixed(1)} pts`
                : `${(kpi.slaCompliancePct - SLA_TARGET).toFixed(1)} pts`
            }
            deltaSentiment={
              kpi.slaCompliancePct >= SLA_TARGET ? 'up_good' : 'down_bad'
            }
            context={`Target SLA ${SLA_TARGET}% · ${kpi.breachedIncidents} pelanggaran tercatat`}
            progressPct={kpi.slaCompliancePct}
            progressTone={
              kpi.slaCompliancePct >= SLA_TARGET
                ? 'healthy'
                : kpi.slaCompliancePct >= 80
                  ? 'warning'
                  : 'critical'
            }
            href="/dss/sla"
            formula="(tiket diputuskan − tiket melewati tenggat) ÷ tiket diputuskan × 100."
          />
        </div>
      </section>

      {/* ---- Zona D: 8/4 split, row A ---- */}
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <ScanActivityChart data={daily} />

          {/* Incident trend with its own numeric matrix (print + screen reader) */}
          <div className="mt-4">
            <Card padding="none">
              <CardHeader className="items-center border-b border-border-subtle px-4 py-3">
                <div className="min-w-0">
                  <CardTitle className="text-[14px]">Tren Insiden 6 Bulan</CardTitle>
                  <p className="mt-0.5 text-[11.5px] text-text-muted">
                    <span className="numeric">{totalTickets}</span> tiket tercatat ·{' '}
                    <span className="numeric">{totalResolved}</span> selesai
                  </p>
                </div>
                <p className="numeric shrink-0 text-right text-[11px] text-text-muted">
                  tingkat penyelesaian{' '}
                  <span className="text-[13px] font-medium text-text-primary">
                    {totalTickets === 0 ? 0 : Math.round((totalResolved / totalTickets) * 100)}%
                  </span>
                </p>
              </CardHeader>
              <CardContent className="px-2 py-3">
                <IncidentTrendChart data={trend} />
                <div className="mt-2 overflow-x-auto px-2">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Bulan</TH>
                        <TH className="text-right">Total</TH>
                        <TH className="text-right">Kritis</TH>
                        <TH className="text-right">Tinggi</TH>
                        <TH className="text-right">Selesai</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {trend.map((row) => (
                        <TR key={row.month}>
                          <TD className="numeric">{row.monthLabel}</TD>
                          <TDNum>{row.total}</TDNum>
                          <TDNum className={row.critical > 0 ? 'text-status-critical' : undefined}>
                            {row.critical}
                          </TDNum>
                          <TDNum className={row.high > 0 ? 'text-status-warning' : undefined}>
                            {row.high}
                          </TDNum>
                          <TDNum className="text-text-secondary">{row.resolved}</TDNum>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Zona D3: telemetry + DSS rail */}
        <aside className="min-w-0 xl:col-span-4">
          <TelemetryRail
            dss={
              topRecommendation
                ? {
                    title: topRecommendation.title,
                    reason: topRecommendation.reason,
                    impact: topRecommendation.riskImpact,
                    actionLabel: topRecommendation.actionLabel,
                    actionHref: topRecommendation.actionHref,
                    urgent: topRecommendation.priority === 0,
                  }
                : null
            }
            health={{
              title: 'Kesehatan Aset',
              slices: [
                { label: 'Sehat', count: kpi.healthyAssets, tone: 'healthy' },
                { label: 'Peringatan', count: kpi.warningAssets, tone: 'warning' },
                { label: 'Terkompromi', count: kpi.compromisedAssets, tone: 'critical' },
                { label: 'Mati', count: kpi.downAssets, tone: 'critical' },
                { label: 'Pemeliharaan', count: kpi.maintenanceAssets, tone: 'neutral' },
              ],
              footer:
                kpi.staleCredentials > 0
                  ? `${kpi.staleCredentials} kredensial menunggu rotasi lebih dari 90 hari.`
                  : 'Semua kredensial berada dalam siklus rotasi.',
            }}
            audit={audit.map((a) => ({
              id: a.id,
              summary: a.summary,
              actorName: a.actorName,
              actorLabel: a.actorLabel,
              createdAt: a.createdAt,
              entityType: a.entityType,
              tone: (AUDIT_ACTION_TONE[a.action] ?? 'neutral') as
                | 'healthy'
                | 'warning'
                | 'critical'
                | 'info'
                | 'neutral',
            }))}
            systemNote={
              dss.recommendations.length > 0
                ? `${dss.recommendations.length} rekomendasi aktif dari ${Object.keys(dss.thresholds).length} ambang batas.`
                : 'Tidak ada rekomendasi aktif; semua ambang batas terpenuhi.'
            }
          />
        </aside>
      </div>

      {/* ---- Zona D: 8/4 split, row B ---- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <section aria-labelledby="priority-queue" className="min-w-0 xl:col-span-8">
          <h2 id="priority-queue" className="mb-2 text-[14px] font-semibold text-text-primary">
            Antrean Prioritas
          </h2>
          <PriorityQueue assets={assetRows} tickets={ticketRows} />
        </section>

        <aside aria-labelledby="dss-list" className="min-w-0 xl:col-span-4">
          <h2 id="dss-list" className="mb-2 text-[14px] font-semibold text-text-primary">
            Rekomendasi Lain
          </h2>
          <div className="rounded-md border border-border-subtle bg-surface-raised">
            {dss.recommendations.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-text-muted">
                Tidak ada rekomendasi aktif.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {dss.recommendations.slice(0, 4).map((rec) => (
                  <li key={rec.id} className="px-4 py-2.5">
                    <div className="mb-1 flex items-center gap-1.5">
                      {rec.priority === 0 ? (
                        <ShieldAlert aria-hidden="true" className="h-3 w-3 shrink-0 text-status-critical" />
                      ) : (
                        <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0 text-status-warning" />
                      )}
                      <span className="label-xs truncate text-[10px]">
                        {RULE_LABEL[rec.ruleCode] ?? 'Rekomendasi'}
                      </span>
                    </div>
                    <p className="text-[12px] font-medium leading-snug text-text-primary">{rec.title}</p>
                    <Link
                      href={rec.actionHref}
                      className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline"
                    >
                      {rec.actionLabel}
                      <ArrowRight aria-hidden="true" className="h-3 w-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border-subtle px-4 py-2">
              <Link
                href="/dss"
                className="inline-flex items-center gap-1 text-[11.5px] text-text-secondary hover:text-accent hover:underline"
              >
                Semua rekomendasi
                <ArrowRight aria-hidden="true" className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
            Masuk sebagai {user.fullName}
            {user.organizationName ? ` · ${user.organizationName}` : ''}.
          </p>
        </aside>
      </div>
    </>
  );
}

const RULE_LABEL: Record<string, string> = {
  SSL_EXPIRY_RISK: 'Risiko SSL',
  CHRONIC_VULNERABILITY: 'Infeksi Berulang',
  STALE_CREDENTIALS: 'Kredensial Usang',
  SLA_BREACH_WARNING: 'Risiko SLA',
  ENGINEER_BOTTLENECK: 'Beban Teknisi',
};

function formatRemaining(ms: number): string {
  const mins = Math.floor(Math.abs(ms) / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j ${mins % 60}m`;
  return `${Math.floor(hours / 24)}h`;
}
