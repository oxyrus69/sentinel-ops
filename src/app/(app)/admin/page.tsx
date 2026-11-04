import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { requirePageAccess } from '@/server/auth/guard';
import {
  getAssetsNeedingAction,
  getIncidentTrend,
  getKpiSummary,
  getTicketsNearSla,
} from '@/server/services/analytics';
import { buildRecommendations } from '@/server/services/dssEngine';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, HealthBadge, SeverityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableEmpty, TBody, TD, TDMuted, TDNum, TH, THead, TR } from '@/components/ui/table';
import { IncidentTrendChart } from './incident-trend-chart';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Dasbor Komando' };

export default async function AdminDashboardPage() {
  const user = await requirePageAccess('/admin');

  const [kpi, trend, needAction, nearSla, dss] = await Promise.all([
    getKpiSummary(),
    getIncidentTrend(6),
    getAssetsNeedingAction(),
    getTicketsNearSla(6),
    buildRecommendations(),
  ]);

  const topRecommendations = dss.recommendations.slice(0, 3);
  const compromisedTotal = kpi.compromisedAssets + kpi.downAssets;

  return (
    <>
      <PageHeader
        title="Dasbor Komando"
        description={`Ringkasan operasional per ${new Date().toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}. Angka dihitung langsung dari basis data saat halaman dibuka.`}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/dss">
              <Activity aria-hidden="true" className="h-3.5 w-3.5" />
              Rekomendasi DSS
            </Link>
          </Button>
        }
      />

      {/* ---- KPI row ---- */}
      <section aria-label="Indikator utama" className="mb-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard
            label="Aset Terkelola"
            value={kpi.totalAssets}
            context={`${kpi.healthyAssets} sehat`}
            href="/assets"
          />
          <KpiCard
            label="Perlu Tindakan"
            value={compromisedTotal}
            context={`${kpi.compromisedAssets} kompromi · ${kpi.downAssets} mati`}
            tone={compromisedTotal > 0 ? 'critical' : 'healthy'}
            href="/assets?health=COMPROMISED"
          />
          <KpiCard
            label="Insiden Aktif"
            value={kpi.activeIncidents}
            context={`${kpi.openBySeverity.CRITICAL} kritis · ${kpi.openBySeverity.HIGH} tinggi`}
            tone={kpi.openBySeverity.CRITICAL > 0 ? 'critical' : 'neutral'}
            href="/incidents"
          />
          <KpiCard
            label="Kepatuhan SLA"
            value={`${kpi.slaCompliancePct}`}
            unit="%"
            context={`${kpi.breachedIncidents} pelanggaran`}
            tone={
              kpi.slaCompliancePct >= 95
                ? 'healthy'
                : kpi.slaCompliancePct >= 80
                  ? 'warning'
                  : 'critical'
            }
            href="/dss/sla"
          />
          <KpiCard
            label="SSL ≤ 14 Hari"
            value={kpi.sslExpiringIn14Days}
            context="perlu perpanjangan"
            tone={kpi.sslExpiringIn14Days > 0 ? 'warning' : 'healthy'}
            href="/dss/risiko"
          />
        </div>
      </section>

      {/* ---- Trend ---- */}
      <section className="mb-6">
        <Card padding="lg">
          <CardHeader className="mb-4">
            <div>
              <CardTitle>Tren Insiden 6 Bulan Terakhir</CardTitle>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                Jumlah tiket per bulan, dipisah menurut tingkat keparahan.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <IncidentTrendChart data={trend} />

            {/* Same numbers as a table: screen readers and print. */}
            <details className="group mt-4">
              <summary className="cursor-pointer list-none text-[12px] text-text-muted transition-colors hover:text-text-secondary">
                <span className="inline-flex items-center gap-1">
                  <ArrowRight
                    aria-hidden="true"
                    className="h-3 w-3 transition-transform group-open:rotate-90"
                  />
                  Lihat angka dalam tabel
                </span>
              </summary>
              <div className="mt-2">
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
                        <TD>{row.monthLabel}</TD>
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
            </details>
          </CardContent>
        </Card>
      </section>

      {/* ---- Two action lists ---- */}
      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="needs-action" className="min-w-0">
          <Card padding="lg" className="h-full">
            <CardHeader className="mb-3">
              <div className="min-w-0">
                <CardTitle id="needs-action">Aset Membutuhkan Tindakan</CardTitle>
                <p className="mt-1 text-[12.5px] text-text-secondary">
                  Terkompromi, mati, atau sertifikat mendekati kedaluwarsa.
                </p>
              </div>
              <Badge tone={needAction.length > 0 ? 'critical' : 'healthy'}>
                {needAction.length}
              </Badge>
            </CardHeader>

            {needAction.length === 0 ? (
              <EmptyRow text="Semua aset dalam kondisi sehat." />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {needAction.map((asset) => (
                  <li key={asset.id} className="min-w-0">
                    <Link
                      href={`/assets/${asset.id}`}
                      className="flex items-start justify-between gap-3 py-2.5 transition-colors duration-fast hover:bg-surface-overlay/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-text-primary">
                          {asset.name}
                        </p>
                        <p className="numeric truncate text-[11.5px] text-text-muted">
                          {asset.domainUrl.replace(/^https?:\/\//, '')}
                        </p>
                        <p className="mt-0.5 text-[12px] text-text-secondary">{asset.reason}</p>
                      </div>
                      <HealthBadge status={asset.healthStatus as never} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section aria-labelledby="near-sla" className="min-w-0">
          <Card padding="lg" className="h-full">
            <CardHeader className="mb-3">
              <div className="min-w-0">
                <CardTitle id="near-sla">Tiket Mendekati Tenggat SLA</CardTitle>
                <p className="mt-1 text-[12.5px] text-text-secondary">
                  Diurutkan dari sisa waktu paling sedikit.
                </p>
              </div>
              <Badge tone={nearSla.length > 0 ? 'warning' : 'healthy'}>{nearSla.length}</Badge>
            </CardHeader>

            {nearSla.length === 0 ? (
              <EmptyRow text="Tidak ada tiket aktif." />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {nearSla.map((ticket) => {
                  const breached = ticket.remainingMs <= 0;
                  return (
                    <li key={ticket.id} className="min-w-0">
                      <Link
                        href={`/incidents/${ticket.id}`}
                        className="flex items-start justify-between gap-3 py-2.5 transition-colors duration-fast hover:bg-surface-overlay/40"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-2">
                            <span className="numeric text-[12px] text-text-muted">
                              {ticket.ticketNumber}
                            </span>
                            <SeverityBadge severity={ticket.severity as never} />
                          </p>
                          <p className="mt-0.5 truncate text-[13px] text-text-primary">
                            {ticket.title}
                          </p>
                          <p className="truncate text-[11.5px] text-text-muted">
                            {ticket.assetName}
                            {ticket.assigneeName ? ` · ${ticket.assigneeName}` : ' · belum ditugaskan'}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'numeric shrink-0 rounded-sm border px-1.5 py-0.5 text-[11.5px]',
                            breached
                              ? 'border-status-critical/40 bg-status-critical/20 text-status-critical'
                              : 'border-status-warning/30 bg-status-warning/15 text-status-warning',
                          )}
                        >
                          {breached ? 'lewat' : relativeShort(ticket.remainingMs)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      </div>

      {/* ---- DSS ---- */}
      {topRecommendations.length > 0 ? (
        <section className="mt-6" aria-labelledby="dss-top">
          <Card padding="lg">
            <CardHeader className="mb-3">
              <div>
                <CardTitle id="dss-top">Rekomendasi Prioritas Hari Ini</CardTitle>
                <p className="mt-1 text-[12.5px] text-text-secondary">
                  Dari {dss.recommendations.length} rekomendasi aktif. Ambang batas diambil
                  dari aturan DSS.
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dss">
                  Semua rekomendasi
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>

            <ul className="grid gap-3 md:grid-cols-3">
              {topRecommendations.map((rec) => (
                <li key={rec.id}>
                  <div className="h-full rounded-md border border-border-subtle bg-surface-sunken p-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      {rec.priority === 0 ? (
                        <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5 text-status-critical" />
                      ) : (
                        <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-status-warning" />
                      )}
                      <span className="label-xs">{RULE_LABEL[rec.ruleCode] ?? 'Rekomendasi'}</span>
                    </div>
                    <p className="text-[13px] font-medium leading-snug text-text-primary">
                      {rec.title}
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">
                      {rec.reason}
                    </p>
                    <Link
                      href={rec.actionHref}
                      className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
                    >
                      {rec.actionLabel}
                      <ArrowRight aria-hidden="true" className="h-3 w-3" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {/* Greeting footer keeps the page from ending abruptly for non-admins. */}
      <p className="mt-6 text-[12px] text-text-muted">
        Masuk sebagai {user.fullName}
        {user.organizationName ? ` · ${user.organizationName}` : ''}.{' '}
        {kpi.staleCredentials > 0
          ? `${kpi.staleCredentials} kredensial menunggu rotasi.`
          : 'Semua kredensial dalam siklus rotasi.'}
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------- */

const RULE_LABEL: Record<string, string> = {
  SSL_EXPIRY_RISK: 'Risiko SSL',
  CHRONIC_VULNERABILITY: 'Infeksi Berulang',
  STALE_CREDENTIALS: 'Kredensial Usang',
  SLA_BREACH_WARNING: 'Risiko SLA',
  ENGINEER_BOTTLENECK: 'Beban Teknisi',
};

const KPI_TONE = {
  critical: 'text-status-critical',
  warning: 'text-status-warning',
  healthy: 'text-status-healthy',
  neutral: 'text-text-primary',
} as const;

function KpiCard({
  label,
  value,
  unit,
  context,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: number | string;
  unit?: string;
  context: string;
  tone?: keyof typeof KPI_TONE;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-md border border-border-subtle bg-surface-raised p-4 transition-colors duration-fast hover:border-border-strong"
    >
      <p className="label-xs">{label}</p>
      <p className={cn('numeric mt-1.5 text-[30px] font-semibold leading-none', KPI_TONE[tone])}>
        {value}
        {unit ? <span className="ml-0.5 text-[15px] font-medium opacity-70">{unit}</span> : null}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-tight text-text-muted">{context}</p>
    </Link>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-border-subtle bg-surface-sunken px-3 py-4">
      <ShieldCheck aria-hidden="true" className="h-4 w-4 text-status-healthy" />
      <span className="text-[12.5px] text-text-secondary">{text}</span>
    </div>
  );
}

function relativeShort(ms: number): string {
  const mins = Math.floor(Math.abs(ms) / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j ${mins % 60}m`;
  return `${Math.floor(hours / 24)}h`;
}
