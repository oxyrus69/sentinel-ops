import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { getPublicStatusBySlug } from '@/server/services/portal';
import { cn } from '@/lib/cn';

/**
 * Public status page.
 *
 * No session required (see PUBLIC_ROUTE_PREFIXES in rbac.ts). Deliberately
 * minimal: the service returns only operational facts, never client identity,
 * incidents, credential metadata, or scan findings.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const status = await getPublicStatusBySlug(slug);
  return {
    title: status ? `Status ${status.name}` : 'Halaman status',
    robots: { index: true, follow: false },
  };
}

const STATE = {
  HEALTHY: {
    label: 'Beroperasi normal',
    tone: 'healthy',
    Icon: ShieldCheck,
  },
  WARNING: {
    label: 'Beroperasi dengan peringatan',
    tone: 'warning',
    Icon: ShieldAlert,
  },
  COMPROMISED: {
    label: 'Gangguan keamanan',
    tone: 'critical',
    Icon: ShieldX,
  },
  DOWN: {
    label: 'Tidak dapat diakses',
    tone: 'critical',
    Icon: ShieldX,
  },
  MAINTENANCE: {
    label: 'Dalam pemeliharaan',
    tone: 'neutral',
    Icon: ShieldAlert,
  },
} as const;

const TONE_TEXT: Record<string, string> = {
  healthy: 'text-status-healthy',
  warning: 'text-status-warning',
  critical: 'text-status-critical',
  neutral: 'text-text-muted',
};

const TONE_BG: Record<string, string> = {
  healthy: 'bg-status-healthy',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
  neutral: 'bg-status-neutral',
};

export default async function PublicStatusPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const status = await getPublicStatusBySlug(slug);
  if (!status) notFound();

  const state = STATE[status.healthStatus as keyof typeof STATE] ?? STATE.HEALTHY;
  const Icon = state.Icon;

  const upCount = status.uptimeSeries.filter((d) => d.up).length;
  const totalDays = status.uptimeSeries.length;
  // Honest instrumentation count: the series is a 30-day window, but only these
  // days actually carry a scan record.
  const observedDays = new Set(status.lastScans.map((s) => s.date.slice(0, 10))).size;

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-accent">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-text-inverse" />
          </span>
          <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-muted">
            Sentinel Ops · Status Layanan
          </span>
        </div>

        <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-text-primary">
          {status.name}
        </h1>
        <p className="numeric mt-1 text-[13px] text-text-secondary">
          {status.domainUrl.replace(/^https?:\/\//, '')}
          {status.platformVersion ? ` · ${status.platformVersion}` : ''}
        </p>
      </header>

      {/* Current state */}
      <div
        className={cn(
          'mb-6 flex items-start gap-3 rounded-md border border-border-subtle bg-surface-raised p-4',
          state.tone === 'critical' && 'border-l-[3px] border-l-status-critical',
          state.tone === 'warning' && 'border-l-[3px] border-l-status-warning',
        )}
      >
        <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', TONE_TEXT[state.tone])} />
        <div>
          <p className={cn('text-[15px] font-semibold', TONE_TEXT[state.tone])}>{state.label}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
            {status.healthStatus === 'HEALTHY'
              ? 'Pemantauan otomatis berjalan rutin. Tidak ada gangguan yang terdeteksi saat ini.'
              : status.healthStatus === 'DOWN'
                ? 'Situs sedang tidak dapat diakses. Tim teknis sudah menerima notifikasi dan sedang menangani.'
                : status.healthStatus === 'COMPROMISED'
                  ? 'Sistem mendeteksi anomali keamanan. Pemantauan intensif dan penanganan sedang berlangsung.'
                  : 'Ada indikasi yang perlu ditinjau tim teknis. Layanan tetap dapat diakses.'}
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricBox
          label="Uptime 30 hari"
          value={`${status.uptimePct30d}%`}
          tone={
            Number(status.uptimePct30d) >= 99
              ? 'healthy'
              : Number(status.uptimePct30d) >= 95
                ? 'warning'
                : 'critical'
          }
        />
        <MetricBox
          label="Sisa masa SSL"
          value={status.sslDaysRemaining !== null ? `${status.sslDaysRemaining} hari` : '—'}
          tone={
            status.sslDaysRemaining === null
              ? 'neutral'
              : status.sslDaysRemaining <= 14
                ? 'critical'
                : status.sslDaysRemaining <= 30
                  ? 'warning'
                  : 'healthy'
          }
        />
        <MetricBox
          label="Hari berpemantauan"
          value={`${observedDays} hari`}
          tone={observedDays >= totalDays * 0.8 ? 'healthy' : 'neutral'}
        />
      </div>

      {/* Uptime history */}
      <section aria-labelledby="uptime-history" className="mb-6">
        <h2
          id="uptime-history"
          className="mb-2 text-[13px] font-medium text-text-primary"
        >
          Riwayat 30 Hari Terakhir
        </h2>
        <p className="mb-3 text-[12px] text-text-secondary">
          Satu batang mewakili satu hari pemantauan. Batang berwarna menandakan situs merespons
          normal; batang gelap menandakan pemantauan gagal atau server mengembalikan galat.
        </p>

        <div className="flex items-end gap-[3px]" role="img" aria-label={`${upCount} dari ${totalDays} hari beroperasi normal`}>
          {status.uptimeSeries.map((day) => (
            <div
              key={day.date}
              title={`${formatDay(day.date)} — ${day.up ? 'normal' : 'gangguan'}`}
              className={cn(
                'h-8 flex-1 rounded-sm',
                day.up ? TONE_BG.healthy : TONE_BG.critical,
              )}
              style={{ opacity: day.up ? 0.85 : 1 }}
            />
          ))}
        </div>

        <div className="mt-2 flex justify-between text-[11px] text-text-muted">
          <span>30 hari lalu</span>
          <span>Hari ini</span>
        </div>

        {status.lastScanAt ? (
          <p className="mt-3 text-[11.5px] text-text-muted">
            Pemeriksaan terakhir{' '}
            <span className="numeric">
              {new Date(status.lastScanAt).toLocaleString('id-ID', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Jakarta',
              })}{' '}
              WIB
            </span>
          </p>
        ) : null}
      </section>

      <footer className="border-t border-border-subtle pt-4 text-[11.5px] text-text-muted">
        Halaman ini dipelihara otomatis oleh Sentinel Ops. Data diperbarui pada setiap pemindaian
        terjadwal.
      </footer>
    </div>
  );
}

function MetricBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'healthy' | 'warning' | 'critical' | 'neutral';
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-raised p-3">
      <p className="text-[10.5px] uppercase tracking-[0.06em] text-text-muted">{label}</p>
      <p className={cn('numeric mt-1 text-[18px] font-semibold leading-none', TONE_TEXT[tone])}>
        {value}
      </p>
    </div>
  );
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
