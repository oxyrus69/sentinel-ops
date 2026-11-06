'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Live SLA countdown.
 *
 * Client component because the remaining time changes without a page reload.
 * Updates once per minute (not per second): a per-second tick would be motion
 * that conveys nothing at this scale, and DESIGN.md caps motion intensity at 2.
 * Renders a static, server-computed initial value so there is no hydration
 * mismatch and nothing is blank if JS never runs.
 */

export type SlaState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET' | 'NOT_APPLICABLE';

export interface SlaCountdownProps {
  dueAt: string | null;
  createdAt: string;
  state: SlaState;
  /** Server-rendered label, shown before hydration and as the fallback. */
  initialLabel: string;
  className?: string;
}

const STATE_CLASS: Record<SlaState, string> = {
  ON_TRACK: 'border-status-healthy/30 bg-status-healthy/15 text-status-healthy',
  AT_RISK: 'border-status-warning/30 bg-status-warning/15 text-status-warning',
  BREACHED: 'border-status-critical/40 bg-status-critical/20 text-status-critical',
  MET: 'border-status-info/30 bg-status-info/15 text-status-info',
  NOT_APPLICABLE: 'border-border-subtle bg-surface-overlay text-text-muted',
};

function formatRemaining(ms: number): string {
  if (ms <= 0) {
    const over = Math.abs(ms);
    const mins = Math.floor(over / 60_000);
    if (mins < 60) return `lewat ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `lewat ${hours}j`;
    return `lewat ${Math.floor(hours / 24)}h`;
  }
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours < 24) return rest > 0 ? `${hours}j ${rest}m` : `${hours}j`;
  const days = Math.floor(hours / 24);
  return `${days}h ${hours % 24}j`;
}

export function SlaCountdown({
  dueAt,
  createdAt,
  state: initialState,
  initialLabel,
  className,
}: SlaCountdownProps) {
  const [label, setLabel] = useState(initialLabel);
  const [state, setState] = useState<SlaState>(initialState);

  /**
   * Resolved and closed tickets freeze: the server-computed state and label are
   * final. Without this the ticking effect below turns a "Lewat tenggat" badge
   * on a closed ticket into a growing "lewat 4h" as wall time passes — that
   * ticket's own clock stopped at resolution.
   */
  const frozen = initialLabel === 'Tepat waktu' || initialLabel === 'Lewat tenggat';

  useEffect(() => {
    if (!dueAt || frozen) return;

    const due = new Date(dueAt).getTime();
    const created = new Date(createdAt).getTime();
    const total = due - created;

    function tick() {
      const now = Date.now();
      const remaining = due - now;
      setLabel(formatRemaining(remaining));

      if (remaining <= 0) {
        setState('BREACHED');
        return;
      }
      // Mirrors evaluateSlaPure: AT_RISK once 75% of the window is consumed.
      const remainingPct = total > 0 ? (remaining / total) * 100 : 100;
      setState(remainingPct <= 25 ? 'AT_RISK' : 'ON_TRACK');
    }

    // Recompute immediately so a stale server value is corrected on mount.
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [dueAt, createdAt, frozen]);

  if (!dueAt || state === 'NOT_APPLICABLE') {
    return <span className={cn('text-[12px] text-text-muted', className)}>Tanpa tenggat</span>;
  }

  return (
    <span
      className={cn(
        'numeric inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[12px] font-medium tabular-nums',
        STATE_CLASS[state],
        className,
      )}
      title={dueAt ? `Tenggat: ${new Date(dueAt).toLocaleString('id-ID')}` : undefined}
    >
      {state === 'MET' ? (
        <span>tepat waktu</span>
      ) : frozen ? (
        <span>{initialLabel}</span>
      ) : (
        <>
          <span aria-hidden="true" className="text-[10px] opacity-70">
            {state === 'BREACHED' ? '!' : '⏱'}
          </span>
          <span>{label}</span>
        </>
      )}
    </span>
  );
}
