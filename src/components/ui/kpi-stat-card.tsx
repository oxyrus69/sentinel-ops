import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * KpiStatCard — 4-layer metric card (Global Dashboard Design §4.1).
 *
 * 1. Label row: metric name + optional info formula.
 * 2. Main value: mono 28px tabular.
 * 3. Delta badge (vs previous period) or a 64x24 inline SVG sparkline.
 * 4. Footer: threshold/target context with a mini progress bar.
 *
 * Tone colors the value only when the metric itself is in a state worth
 * alarming about; healthy and neutral read as plain white numbers.
 */

export type KpiTone = 'neutral' | 'healthy' | 'warning' | 'critical' | 'info';

const TONE_VALUE: Record<KpiTone, string> = {
  neutral: 'text-text-primary',
  healthy: 'text-status-healthy',
  warning: 'text-status-warning',
  critical: 'text-status-critical',
  info: 'text-status-info',
};

const DELTA_TONE = {
  up_good: {
    icon: ArrowUpRight,
    cls: 'border-status-healthy/30 bg-status-healthy/15 text-status-healthy',
  },
  up_bad: {
    icon: ArrowUpRight,
    cls: 'border-status-critical/30 bg-status-critical/15 text-status-critical',
  },
  down_good: {
    icon: ArrowDownRight,
    cls: 'border-status-healthy/30 bg-status-healthy/15 text-status-healthy',
  },
  down_bad: {
    icon: ArrowDownRight,
    cls: 'border-status-critical/30 bg-status-critical/15 text-status-critical',
  },
} as const;

export interface KpiStatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  tone?: KpiTone;
  /** Delta vs previous period, already formatted, e.g. "+12,4%". */
  delta?: string;
  /** Direction+quality of the delta: pick arrow and semantic color. */
  deltaSentiment?: 'up_good' | 'up_bad' | 'down_good' | 'down_bad';
  /** Last ~7 points, 0..1 normalized. Renders a 64x24 sparkline in layer 3. */
  spark?: number[];
  sparkColorVar?: string;
  /** Layer 4 context line, e.g. "Target SLA: 98% • 3 tiket perlu tindakan". */
  context?: string;
  /** Layer 4 mini-bar 0..100 against a target/threshold. */
  progressPct?: number;
  progressTone?: KpiTone;
  href?: string;
  /** Title attribute on the value, e.g. the metric formula. */
  formula?: string;
}

export function KpiStatCard({
  label,
  value,
  unit,
  tone = 'neutral',
  delta,
  deltaSentiment = 'up_good',
  spark,
  sparkColorVar = 'var(--color-chart-1)',
  context,
  progressPct,
  progressTone = 'neutral',
  href,
  formula,
}: KpiStatCardProps) {
  const body = (
    <>
      {/* 1 — Label */}
      <div className="flex items-center justify-between gap-2">
        <p className="label-xs truncate">{label}</p>
        {formula ? (
          <span
            title={formula}
            aria-label={formula}
            className="shrink-0 cursor-help rounded-full border border-border-subtle px-1 text-[9px] leading-[14px] text-text-muted"
          >
            i
          </span>
        ) : null}
      </div>

      {/* 2 — Value + 3 — delta/spark */}
      <div className="mt-2 flex items-end justify-between gap-2">
        <p
          className={cn('numeric text-[27px] font-semibold leading-none tracking-[-0.02em]', TONE_VALUE[tone])}
        >
          {value}
          {unit ? (
            <span className="ml-0.5 text-[14px] font-medium text-text-secondary">{unit}</span>
          ) : null}
        </p>
        {delta !== undefined ? (
          (() => {
            const d = DELTA_TONE[deltaSentiment];
            const Icon = d.icon;
            return (
              <span
                className={cn(
                  'numeric inline-flex shrink-0 items-center gap-0.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium',
                  d.cls,
                )}
              >
                <Icon aria-hidden="true" className="h-3 w-3" />
                {delta}
              </span>
            );
          })()
        ) : spark && spark.length >= 2 ? (
          <Sparkline points={spark} colorVar={sparkColorVar} />
        ) : null}
      </div>

      {/* 4 — Footer: context + mini progress against a threshold */}
      {context || progressPct !== undefined ? (
        <div className="mt-2.5 border-t border-border-subtle pt-2">
          {progressPct !== undefined ? (
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-surface-overlay"
              role="progressbar"
              aria-valuenow={Math.round(progressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={context ?? label}
            >
              <div
                className={cn('h-full rounded-full', BAR_TONE[progressTone])}
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
          ) : null}
          {context ? (
            <p className="mt-1.5 truncate text-[11px] leading-snug text-text-muted">{context}</p>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const cls =
    'group block rounded-md border border-border-subtle bg-surface-raised p-4 transition-colors duration-fast hover:border-border-strong';

  if (href) {
    return (
      <Link href={href} className={cls} title={formula}>
        {body}
        <ArrowRight
          aria-hidden="true"
          className="mt-1.5 h-3 w-3 text-text-muted opacity-0 transition-opacity duration-fast group-hover:opacity-60"
        />
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

const BAR_TONE: Record<KpiTone, string> = {
  neutral: 'bg-text-muted',
  healthy: 'bg-status-healthy',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
  info: 'bg-status-info',
};

/** 64x24 inline SVG sparkline: polyline over the normalized points, no dots. */
function Sparkline({ points, colorVar }: { points: number[]; colorVar: string }) {
  const w = 64;
  const h = 24;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - 2 - ((p - min) / span) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 overflow-visible"
    >
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={colorVar}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
