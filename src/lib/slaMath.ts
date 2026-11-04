/**
 * Pure SLA math — importable from both server and client components.
 *
 * Severity-based response/resolution targets (minutes):
 *   CRITICAL  response   15  / resolution  240 (4h)
 *   HIGH      response   60  / resolution  720 (12h)
 *   MEDIUM    response  240  / resolution 1440 (24h)
 *   LOW       response  720  / resolution 4320 (72h)
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'CONTAINED'
  | 'RESOLVED'
  | 'CLOSED';

export interface SlaTarget {
  responseMinutes: number;
  resolutionMinutes: number;
}

export const SLA_TARGETS: Record<Severity, SlaTarget> = {
  CRITICAL: { responseMinutes: 15, resolutionMinutes: 240 },
  HIGH: { responseMinutes: 60, resolutionMinutes: 720 },
  MEDIUM: { responseMinutes: 240, resolutionMinutes: 1440 },
  LOW: { responseMinutes: 720, resolutionMinutes: 4320 },
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: 'Kritis',
  HIGH: 'Tinggi',
  MEDIUM: 'Sedang',
  LOW: 'Rendah',
};

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  OPEN: 'Terbuka',
  INVESTIGATING: 'Investigasi',
  CONTAINED: 'Terkendali',
  RESOLVED: 'Terselesaikan',
  CLOSED: 'Ditutup',
};

/** Statuses that still count against the engineer's active workload. */
export const ACTIVE_STATUSES: IncidentStatus[] = ['OPEN', 'INVESTIGATING', 'CONTAINED'];

export interface SlaDeadlines {
  responseDueAt: Date;
  resolutionDueAt: Date;
}

/** Compute SLA deadlines from a creation timestamp and severity. */
export function computeSlaDeadlinesPure(
  createdAt: Date,
  severity: Severity,
): SlaDeadlines {
  const target = SLA_TARGETS[severity];
  return {
    responseDueAt: new Date(createdAt.getTime() + target.responseMinutes * 60_000),
    resolutionDueAt: new Date(createdAt.getTime() + target.resolutionMinutes * 60_000),
  };
}

export type SlaState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET' | 'NOT_APPLICABLE';

export interface SlaProgress {
  state: SlaState;
  /** Milliseconds remaining until resolution deadline (negative = overdue). */
  remainingMs: number;
  /** Percentage of the SLA window consumed, clamped to [0, 100]. */
  consumedPct: number;
  /** Human-readable remaining time, e.g. "3j 12m" or "lewat 45m". */
  remainingLabel: string;
  /** True when the resolution deadline has passed. */
  isBreached: boolean;
}

/**
 * Evaluate an incident against its SLA.
 *
 * @param createdAt        When the incident was created.
 * @param severity         Severity driving the SLA target.
 * @param resolutionDueAt  Stored deadline (authoritative, may be re-based).
 * @param status           Current status.
 * @param resolvedAt       When it was resolved, if applicable.
 * @param now              Injection point for deterministic tests.
 * @param warnRatioPct     Fraction of the window after which state becomes AT_RISK.
 */
export function evaluateSlaPure(params: {
  createdAt: Date;
  severity: Severity;
  resolutionDueAt: Date | null;
  status: IncidentStatus;
  resolvedAt?: Date | null;
  firstRespondedAt?: Date | null;
  now?: Date;
  warnRatioPct?: number;
}): SlaProgress {
  const now = params.now ?? new Date();
  const warnRatio = (params.warnRatioPct ?? 25) / 100;
  const target = SLA_TARGETS[params.severity];
  const totalMs = target.resolutionMinutes * 60_000;

  if (!params.resolutionDueAt) {
    return {
      state: 'NOT_APPLICABLE',
      remainingMs: 0,
      consumedPct: 0,
      remainingLabel: '-',
      isBreached: false,
    };
  }

  const isClosed = params.status === 'RESOLVED' || params.status === 'CLOSED';
  const remainingMs = params.resolutionDueAt.getTime() - now.getTime();
  const consumedMs = now.getTime() - params.createdAt.getTime();
  const consumedPct = clampPct((consumedMs / totalMs) * 100);
  const isBreached = remainingMs < 0;

  if (isClosed) {
    // Resolved in time?
    const finishedAt = params.resolvedAt ?? now;
    const finishedInTime = finishedAt.getTime() <= params.resolutionDueAt.getTime();
    return {
      state: finishedInTime ? 'MET' : 'BREACHED',
      remainingMs: Math.max(0, remainingMs),
      consumedPct: clampPct(
        ((finishedAt.getTime() - params.createdAt.getTime()) / totalMs) * 100,
      ),
      remainingLabel: finishedInTime ? 'Tepat waktu' : 'Lewat tenggat',
      isBreached: !finishedInTime,
    };
  }

  if (isBreached) {
    return {
      state: 'BREACHED',
      remainingMs,
      consumedPct: 100,
      remainingLabel: `lewat ${formatDuration(Math.abs(remainingMs))}`,
      isBreached: true,
    };
  }

  const warnThresholdMs = totalMs * (1 - warnRatio);
  if (remainingMs <= warnThresholdMs) {
    return {
      state: 'AT_RISK',
      remainingMs,
      consumedPct,
      remainingLabel: formatDuration(remainingMs),
      isBreached: false,
    };
  }

  return {
    state: 'ON_TRACK',
    remainingMs,
    consumedPct,
    remainingLabel: formatDuration(remainingMs),
    isBreached: false,
  };
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** "2j 5m", "45m", "3h 12m", "12h" — compact, locale-independent. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}h ${hours}j` : `${days} hari`;
  if (hours > 0) return minutes > 0 ? `${hours}j ${minutes}m` : `${hours} jam`;
  return `${minutes} menit`;
}

/** Percentage of incidents that met their resolution SLA. */
export function computeSlaCompliancePct(params: {
  total: number;
  breached: number;
}): number {
  if (params.total <= 0) return 100;
  const met = params.total - params.breached;
  return Math.round((met / params.total) * 10000) / 100;
}
