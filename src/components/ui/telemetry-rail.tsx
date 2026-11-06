import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Telemetry rail (Global Dashboard Design §4.6): DSS priority card, segmented
 * health bar, and the live audit timeline. Server component — all data arrives
 * as props; interactivity (a drawer/detail view) is the row's own link.
 */

export interface DssTeaser {
  title: string;
  reason: string;
  impact: string;
  actionLabel: string;
  actionHref: string;
  urgent: boolean;
}

export interface HealthSlice {
  label: string;
  count: number;
  tone: 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';
}

export interface AuditItem {
  id: string;
  summary: string;
  actorName: string | null;
  actorLabel: string | null;
  createdAt: Date;
  entityType: string;
  tone: 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';
}

const SLICE_BG: Record<HealthSlice['tone'], string> = {
  healthy: 'bg-status-healthy',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
  info: 'bg-status-info',
  neutral: 'bg-status-neutral',
};

const DOT_TONE: Record<AuditItem['tone'], string> = {
  healthy: 'bg-status-healthy',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
  info: 'bg-status-info',
  neutral: 'bg-status-neutral',
};

export function TelemetryRail({
  dss,
  health,
  audit,
  systemNote,
}: {
  dss: DssTeaser | null;
  health: { slices: HealthSlice[]; title: string; footer: string };
  audit: AuditItem[];
  systemNote: string;
}) {
  const total = health.slices.reduce((a, s) => a + s.count, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* DSS quick decision */}
      {dss ? (
        <section aria-label="Rekomendasi prioritas">
          <div
            className={cn(
              'rounded-md border border-border-subtle bg-surface-raised p-4',
              dss.urgent && 'border-l-[3px] border-l-status-critical',
            )}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="label-xs">Rekomendasi Prioritas</p>
              {dss.urgent ? (
                <span className="numeric rounded-sm border border-status-critical/40 bg-status-critical/15 px-1.5 py-0.5 text-[10px] font-medium text-status-critical">
                  SEGERA
                </span>
              ) : (
                <span className="numeric rounded-sm border border-status-warning/30 bg-status-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
                  TERJADWAL
                </span>
              )}
            </div>
            <p className="text-[13px] font-medium leading-snug text-text-primary">{dss.title}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">{dss.reason}</p>
            <p className="mt-1.5 rounded-sm border border-border-subtle bg-surface-sunken px-2 py-1.5 text-[11.5px] leading-snug text-text-secondary">
              <span className="font-medium text-text-primary">Dampak: </span>
              {dss.impact}
            </p>
            <Link
              href={dss.actionHref}
              className="mt-2.5 inline-flex h-8 items-center rounded-sm bg-accent px-3 text-[12.5px] font-medium text-text-inverse transition-colors duration-fast hover:bg-accent-hover"
            >
              Kerjakan
            </Link>
          </div>
        </section>
      ) : null}

      {/* Segmented health bar */}
      <section aria-label={health.title}>
        <div className="rounded-md border border-border-subtle bg-surface-raised p-4">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <p className="label-xs">{health.title}</p>
            <span className="numeric text-[11.5px] text-text-muted">{total} aset</span>
          </div>
          <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-surface-sunken">
            {health.slices
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.label}
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', SLICE_BG[s.tone])}
                  style={{ width: `${Math.max((s.count / Math.max(total, 1)) * 100, 2)}%` }}
                  title={`${s.label}: ${s.count}`}
                />
              ))}
          </div>
          <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
            {health.slices.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', SLICE_BG[s.tone])} />
                <span className="min-w-0 truncate">{s.label}</span>
                <span className="numeric ml-auto text-text-muted">{s.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 border-t border-border-subtle pt-2 text-[11px] leading-snug text-text-muted">
            {health.footer}
          </p>
        </div>
      </section>

      {/* Live audit timeline */}
      <section aria-label="Aktivitas terkini">
        <div className="rounded-md border border-border-subtle bg-surface-raised p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className="label-xs">Aktivitas Terkini</p>
            <span className="numeric text-[11px] text-text-muted">jejak audit</span>
          </div>
          {audit.length === 0 ? (
            <p className="py-3 text-center text-[12px] text-text-muted">Belum ada aktivitas.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-border-subtle pl-4">
              {audit.map((item) => (
                <li key={item.id} className="relative">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -left-[21px] top-1 h-2 w-2 rounded-full ring-2 ring-surface-raised',
                      DOT_TONE[item.tone],
                    )}
                  />
                  <p className="text-[12px] leading-snug text-text-primary">{item.summary}</p>
                  <p className="numeric mt-0.5 text-[10.5px] text-text-muted">
                    {item.actorName ?? item.actorLabel ?? 'Sistem'} · {relativeTime(item.createdAt)} ·{' '}
                    {item.entityType}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 border-t border-border-subtle pt-2 text-[11px] leading-snug text-text-muted">
            {systemNote}
          </p>
        </div>
      </section>
    </div>
  );
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}
