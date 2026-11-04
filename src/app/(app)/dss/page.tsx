import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { requirePageAccess } from '@/server/auth/guard';
import { can } from '@/server/rbac';
import { buildRecommendations } from '@/server/services/dssEngine';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DecisionButtons } from './decision-buttons';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Rekomendasi Prioritas' };

const RULE_LABEL: Record<string, string> = {
  SSL_EXPIRY_RISK: 'Risiko SSL',
  CHRONIC_VULNERABILITY: 'Infeksi Berulang',
  STALE_CREDENTIALS: 'Kredensial Usang',
  SLA_BREACH_WARNING: 'Risiko SLA',
  ENGINEER_BOTTLENECK: 'Beban Teknisi',
};

const RULE_HREF: Record<string, string> = {
  SSL_EXPIRY_RISK: '/dss/risiko',
  CHRONIC_VULNERABILITY: '/dss/risiko',
  STALE_CREDENTIALS: '/dss/risiko',
  SLA_BREACH_WARNING: '/dss/sla',
  ENGINEER_BOTTLENECK: '/dss/sla',
};

export default async function DssPage() {
  const user = await requirePageAccess('/dss');
  const canRecord = can(user, ['SUPER_ADMIN', 'SECOPS_ENGINEER']);

  const { recommendations, thresholds, generatedAt } = await buildRecommendations();

  const urgent = recommendations.filter((r) => r.priority === 0);
  const normal = recommendations.filter((r) => r.priority > 0);

  return (
    <>
      <PageHeader
        title="Rekomendasi Prioritas"
        description={`Dihitung ulang setiap halaman dibuka dari data terkini. Ambang batas: SSL ${thresholds.sslWarnDays} hari, infeksi berulang ${thresholds.repeatInfectionThreshold}× dalam ${thresholds.repeatInfectionWindowDays} hari, rotasi kredensial ${thresholds.credentialRotationDays} hari.`}
        actions={
          <span className="numeric text-[11.5px] text-text-muted">
            Dihitung {generatedAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
          </span>
        }
      />

      {/* Summary */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <SummaryTile label="Total rekomendasi" value={recommendations.length} tone="neutral" />
        <SummaryTile
          label="Perlu segera"
          value={urgent.length}
          tone={urgent.length > 0 ? 'critical' : 'healthy'}
        />
        <SummaryTile label="Normal" value={normal.length} tone="neutral" />
      </div>

      {recommendations.length === 0 ? (
        <Card padding="lg">
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-status-healthy" />
            <div>
              <p className="text-[14px] font-medium text-text-primary">
                Tidak ada rekomendasi aktif
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                Semua aset berada di luar ambang batas: SSL masih panjang, tidak ada infeksi
                berulang, kredensial dalam siklus rotasi, tiket SLA aman, dan beban teknisi
                seimbang.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {recommendations.map((rec) => {
            const isUrgent = rec.priority === 0;
            return (
              <li key={rec.id}>
                <Card
                  padding="lg"
                  className={cn(isUrgent && 'border-l-[3px] border-l-status-critical')}
                >
                  <CardHeader className="mb-2">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        {isUrgent ? (
                          <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5 text-status-critical" />
                        ) : (
                          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-status-warning" />
                        )}
                        <span className="label-xs">{RULE_LABEL[rec.ruleCode] ?? rec.ruleCode}</span>
                        <Badge tone={isUrgent ? 'critical' : 'warning'} size="sm">
                          {isUrgent ? 'Segera' : 'Terjadwal'}
                        </Badge>
                      </div>
                      <CardTitle className="text-[15px]">{rec.title}</CardTitle>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
                        {rec.reason}
                      </p>
                    </div>
                  </CardHeader>

                  {/* Trigger facts: the numbers that caused this recommendation. */}
                  <dl className="mt-3 grid gap-2 rounded-sm border border-border-subtle bg-surface-sunken p-3 sm:grid-cols-3">
                    {rec.facts.map((fact) => (
                      <div key={fact.label}>
                        <dt className="text-[10.5px] uppercase tracking-[0.06em] text-text-muted">
                          {fact.label}
                        </dt>
                        <dd className="numeric mt-0.5 text-[13px] font-medium text-text-primary">
                          {fact.value}
                        </dd>
                        {fact.detail ? (
                          <dd className="mt-0.5 text-[11px] leading-snug text-text-muted">
                            {fact.detail}
                          </dd>
                        ) : null}
                      </div>
                    ))}
                  </dl>

                  <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 max-w-[60ch]">
                      <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-text-muted">
                        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          <span className="font-medium text-text-secondary">Dampak: </span>
                          {rec.riskImpact}
                        </span>
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={RULE_HREF[rec.ruleCode] ?? rec.actionHref}
                        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"
                      >
                        {rec.actionLabel}
                        <ArrowRight aria-hidden="true" className="h-3 w-3" />
                      </Link>

                      {canRecord ? (
                        <DecisionButtons
                          ruleCode={rec.ruleCode}
                          title={rec.title}
                          body={rec.reason}
                          facts={rec.facts}
                          riskImpact={rec.riskImpact}
                        />
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap gap-3 text-[12px]">
        <Link href="/dss/risiko" className="text-text-secondary hover:text-accent hover:underline">
          Matriks risiko aset
        </Link>
        <Link href="/dss/sla" className="text-text-secondary hover:text-accent hover:underline">
          Beban tim &amp; kepatuhan SLA
        </Link>
        <Link href="/dss/riwayat" className="text-text-secondary hover:text-accent hover:underline">
          Riwayat keputusan
        </Link>
      </div>
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
    <Card padding="sm">
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
