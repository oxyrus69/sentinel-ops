import type { Metadata } from 'next';
import { desc, eq, sql } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { db } from '@/server/db';
import { decisionLogs, profiles } from '@/server/db/schema';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Riwayat Keputusan' };

const RULE_LABEL: Record<string, string> = {
  SSL_EXPIRY_RISK: 'Risiko SSL',
  CHRONIC_VULNERABILITY: 'Infeksi Berulang',
  STALE_CREDENTIALS: 'Kredensial Usang',
  SLA_BREACH_WARNING: 'Risiko SLA',
  ENGINEER_BOTTLENECK: 'Beban Teknisi',
};

interface FactShape {
  label?: string;
  value?: string | number;
  detail?: string;
}

export default async function DssHistoryPage() {
  await requirePageAccess('/dss');

  const rows = await db
    .select({
      log: decisionLogs,
      decidedByName: profiles.fullName,
    })
    .from(decisionLogs)
    .leftJoin(profiles, eq(decisionLogs.decidedBy, profiles.id))
    .orderBy(desc(decisionLogs.createdAt))
    .limit(200);

  const accepted = rows.filter((r) => r.log.outcome === 'ACCEPTED').length;
  const dismissed = rows.filter((r) => r.log.outcome === 'DISMISSED').length;

  return (
    <>
      <PageHeader
        title="Riwayat Keputusan"
        description="Setiap rekomendasi yang diterima atau ditolak tersimpan bersama angka pemicunya, sehingga keputusan dapat ditinjau ulang dengan konteks yang sama seperti saat diambil."
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Tile label="Total keputusan" value={rows.length} tone="neutral" />
        <Tile label="Diterima" value={accepted} tone="healthy" />
        <Tile label="Ditolak" value={dismissed} tone="warning" />
      </div>

      {rows.length === 0 ? (
        <Card padding="lg">
          <p className="py-6 text-center text-[13px] text-text-muted">
            Belum ada keputusan yang direkam. Buka halaman rekomendasi untuk menerima atau menolak.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ log, decidedByName }) => {
            const facts = parseFacts(log.triggerFactsJson);
            return (
              <li key={log.id}>
                <Card padding="md">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      tone={log.outcome === 'ACCEPTED' ? 'healthy' : 'warning'}
                      size="sm"
                    >
                      {log.outcome === 'ACCEPTED' ? 'Diterima' : 'Ditolak'}
                    </Badge>
                    <span className="label-xs">{RULE_LABEL[log.ruleCode] ?? log.ruleCode}</span>
                    <span className="numeric ml-auto text-[11px] text-text-muted">
                      {formatDate(log.createdAt)}
                    </span>
                  </div>

                  <p className="text-[13px] font-medium leading-snug text-text-primary">
                    {log.recommendationTitle}
                  </p>

                  {facts.length > 0 ? (
                    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
                      {facts.map((f) => (
                        <div key={f.label} className="flex items-baseline gap-1">
                          <dt className="text-text-muted">{f.label}:</dt>
                          <dd
                            className={cn(
                              'numeric',
                              log.outcome === 'ACCEPTED'
                                ? 'text-text-secondary'
                                : 'text-text-muted',
                            )}
                          >
                            {f.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  <p className="mt-1.5 text-[11.5px] text-text-muted">
                    Diputuskan oleh {decidedByName ?? 'pengguna dihapus'}
                    {log.decisionNote ? ` · "${log.decisionNote}"` : ''}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function parseFacts(value: unknown): Array<{ label: string; value: string | number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is FactShape => typeof v === 'object' && v !== null)
    .map((v) => ({ label: v.label ?? '', value: v.value ?? '' }))
    .filter((v) => v.label.length > 0);
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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
  value: number;
  tone: 'neutral' | 'warning' | 'healthy';
}) {
  return (
    <Card padding="sm">
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          'numeric mt-1 text-[22px] font-semibold leading-none',
          tone === 'warning'
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
