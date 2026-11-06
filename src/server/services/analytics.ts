import 'server-only';

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  auditLogs,
  incidents,
  profiles,
  scanLogs,
  webAssets,
} from '@/server/db/schema';

/**
 * Dashboard aggregations.
 *
 * Everything is computed with on-the-fly SQL so the numbers always match the
 * tables. No cached counters.
 */

export interface KpiSummary {
  totalAssets: number;
  healthyAssets: number;
  compromisedAssets: number;
  downAssets: number;
  warningAssets: number;
  maintenanceAssets: number;
  activeIncidents: number;
  openBySeverity: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  slaCompliancePct: number;
  breachedIncidents: number;
  resolvedIncidents: number;
  sslExpiringIn14Days: number;
  staleCredentials: number;
}

export async function getKpiSummary(): Promise<KpiSummary> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86_400_000);
  const rotationCutoff = new Date(now.getTime() - 90 * 86_400_000);

  const [assetRows, incidentRows, sslRows, credRows] = await Promise.all([
    db
      .select({
        healthStatus: webAssets.healthStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(webAssets)
      .groupBy(webAssets.healthStatus),

    db
      .select({
        severity: incidents.severity,
        status: incidents.status,
        slaBreached: incidents.slaBreached,
        count: sql<number>`count(*)::int`,
      })
      .from(incidents)
      .groupBy(incidents.severity, incidents.status, incidents.slaBreached),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(webAssets)
      .where(sql`${webAssets.sslExpiryDate} IS NOT NULL AND ${webAssets.sslExpiryDate} <= ${horizon}`),

    db.execute(sql`
      SELECT count(*)::int AS count FROM credential_vaults
      WHERE COALESCE(last_rotated_at, created_at) <= ${rotationCutoff}
    `),
  ]);

  const byHealth = new Map<string, number>();
  for (const r of assetRows) byHealth.set(r.healthStatus, r.count);

  let activeIncidents = 0;
  let resolvedIncidents = 0;
  let breachedIncidents = 0;
  const openBySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

  for (const r of incidentRows) {
    if (r.status === 'OPEN' || r.status === 'INVESTIGATING' || r.status === 'CONTAINED') {
      activeIncidents += r.count;
      openBySeverity[r.severity] += r.count;
    }
    if (r.status === 'RESOLVED' || r.status === 'CLOSED') resolvedIncidents += r.count;
    if (r.slaBreached) breachedIncidents += r.count;
  }

  const totalDecided = activeIncidents + resolvedIncidents;
  const slaCompliancePct =
    totalDecided === 0
      ? 100
      : Math.round(((totalDecided - breachedIncidents) / totalDecided) * 10000) / 100;

  return {
    totalAssets: [...byHealth.values()].reduce((a, b) => a + b, 0),
    healthyAssets: byHealth.get('HEALTHY') ?? 0,
    compromisedAssets: byHealth.get('COMPROMISED') ?? 0,
    downAssets: byHealth.get('DOWN') ?? 0,
    warningAssets: byHealth.get('WARNING') ?? 0,
    maintenanceAssets: byHealth.get('MAINTENANCE') ?? 0,
    activeIncidents,
    openBySeverity,
    slaCompliancePct,
    breachedIncidents,
    resolvedIncidents,
    sslExpiringIn14Days: sslRows[0]?.count ?? 0,
    staleCredentials: Number(credRows.rows[0]?.count ?? 0),
  };
}

export interface MonthlyTrendPoint {
  month: string;
  monthLabel: string;
  total: number;
  critical: number;
  high: number;
  resolved: number;
}

/** Incident trend for the last N months, oldest first. */
export async function getIncidentTrend(months = 6): Promise<MonthlyTrendPoint[]> {
  const rows = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
      count(*)::int AS total,
      count(*) FILTER (WHERE severity = 'CRITICAL')::int AS critical,
      count(*) FILTER (WHERE severity = 'HIGH')::int AS high,
      count(*) FILTER (WHERE status IN ('RESOLVED','CLOSED'))::int AS resolved
    FROM incidents
    WHERE created_at >= date_trunc('month', now()) - make_interval(months => ${months - 1})
    GROUP BY 1
    ORDER BY 1
  `);

  const byMonth = new Map<string, Omit<MonthlyTrendPoint, 'monthLabel'>>();
  for (const r of rows.rows as Array<Record<string, unknown>>) {
    const key = String(r.month);
    byMonth.set(key, {
      month: key,
      total: Number(r.total ?? 0),
      critical: Number(r.critical ?? 0),
      high: Number(r.high ?? 0),
      resolved: Number(r.resolved ?? 0),
    });
  }

  // Fill every month in range so the chart has no gaps.
  const out: MonthlyTrendPoint[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const found = byMonth.get(key);
    out.push({
      month: key,
      monthLabel: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      total: found?.total ?? 0,
      critical: found?.critical ?? 0,
      high: found?.high ?? 0,
      resolved: found?.resolved ?? 0,
    });
  }
  return out;
}

export interface AssetNeedingAction {
  id: string;
  name: string;
  domainUrl: string;
  platform: string;
  healthStatus: string;
  sslDaysRemaining: number | null;
  lastScanAt: Date | null;
  reason: string;
}

/** Assets that are compromised, down, or expiring within 14 days. */
export async function getAssetsNeedingAction(): Promise<AssetNeedingAction[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86_400_000);

  const rows = await db
    .select()
    .from(webAssets)
    .where(
      sql`${webAssets.healthStatus} IN ('COMPROMISED','DOWN','WARNING')
          OR (${webAssets.sslExpiryDate} IS NOT NULL AND ${webAssets.sslExpiryDate} <= ${horizon})`,
    )
    .orderBy(sql`
      CASE ${webAssets.healthStatus}
        WHEN 'COMPROMISED' THEN 0
        WHEN 'DOWN' THEN 1
        WHEN 'WARNING' THEN 2
        ELSE 3
      END,
      ${webAssets.sslExpiryDate} ASC NULLS LAST
    `)
    .limit(10);

  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    domainUrl: a.domainUrl,
    platform: a.platform,
    healthStatus: a.healthStatus,
    sslDaysRemaining: a.sslDaysRemaining,
    lastScanAt: a.lastScanAt,
    reason: explainAssetRisk(a.healthStatus, a.sslDaysRemaining, now),
  }));
}

export interface TicketNearSla {
  id: string;
  ticketNumber: string;
  title: string;
  severity: string;
  status: string;
  assetName: string;
  slaResolutionDueAt: Date | null;
  remainingMs: number;
  assigneeName: string | null;
}

/** Open tickets ordered by how little SLA time they have left. */
export async function getTicketsNearSla(limit = 8): Promise<TicketNearSla[]> {
  const now = new Date();
  const rows = await db
    .select({
      id: incidents.id,
      ticketNumber: incidents.ticketNumber,
      title: incidents.title,
      severity: incidents.severity,
      status: incidents.status,
      slaResolutionDueAt: incidents.slaResolutionDueAt,
      assetName: webAssets.name,
      assigneeName: profiles.fullName,
    })
    .from(incidents)
    .innerJoin(webAssets, eq(incidents.assetId, webAssets.id))
    .leftJoin(profiles, eq(incidents.assignedTo, profiles.id))
    .where(sql`${incidents.status} IN ('OPEN','INVESTIGATING','CONTAINED')`)
    .orderBy(sql`${incidents.slaResolutionDueAt} ASC NULLS LAST`)
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    remainingMs: r.slaResolutionDueAt ? r.slaResolutionDueAt.getTime() - now.getTime() : 0,
  }));
}

function explainAssetRisk(
  health: string,
  sslDays: number | null,
  now: Date,
): string {
  if (health === 'COMPROMISED') return 'Terdeteksi injeksi atau malware. Perlu pembersihan segera.';
  if (health === 'DOWN') return 'Situs tidak merespons. Perlu pemulihan layanan.';
  if (health === 'WARNING' && sslDays !== null && sslDays <= 14) {
    return `Sertifikat SSL sisa ${sslDays} hari. Perbarui sebelum kedaluwarsa.`;
  }
  if (health === 'WARNING') return 'Ada temuan berisiko sedang. Perlu ditinjau.';
  return 'Perlu ditinjau.';
}

/** 30-day uptime and scan volume for an asset detail page. */
export async function getAssetScanStats(assetId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${scanLogs.scannedAt}), 'YYYY-MM-DD')`,
      scans: sql<number>`count(*)::int`,
      threats: sql<number>`coalesce(sum(${scanLogs.threatsDetected}), 0)::int`,
      avgResponseMs: sql<number>`coalesce(avg(${scanLogs.responseTimeMs}), 0)::int`,
    })
    .from(scanLogs)
    .where(and(eq(scanLogs.assetId, assetId), gte(scanLogs.scannedAt, since)))
    .groupBy(sql`date_trunc('day', ${scanLogs.scannedAt})`)
    .orderBy(sql`date_trunc('day', ${scanLogs.scannedAt})`);

  return rows;
}

export interface AuditActivityItem {
  id: string;
  action: string;
  actorLabel: string | null;
  actorName: string | null;
  actorRole: string | null;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: Date;
}

/** Latest audit entries for the live activity stream in the telemetry rail. */
export async function getRecentAuditActivity(limit = 8): Promise<AuditActivityItem[]> {
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorLabel: auditLogs.actorLabel,
      actorRole: auditLogs.actorRole,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      summary: auditLogs.summary,
      createdAt: auditLogs.createdAt,
      actorName: profiles.fullName,
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(auditLogs.actorId, profiles.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorLabel: r.actorLabel,
    actorName: r.actorName,
    actorRole: r.actorRole,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
    createdAt: r.createdAt,
  }));
}

export interface DailyTrendPoint {
  date: string;
  dayLabel: string;
  scans: number;
  threats: number;
  avgResponseMs: number;
}

/**
 * Daily scan + threat series for the dashboard hero chart.
 *
 * Every day in the window is present even with no scans, so the chart line has
 * no gaps and a quiet day is visibly zero rather than missing.
 */
export async function getDailyTrend(days = 30): Promise<DailyTrendPoint[]> {
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${scanLogs.scannedAt}), 'YYYY-MM-DD')`,
      scans: sql<number>`count(*)::int`,
      threats: sql<number>`coalesce(sum(${scanLogs.threatsDetected}), 0)::int`,
      avgResponseMs: sql<number>`coalesce(avg(${scanLogs.responseTimeMs}), 0)::int`,
    })
    .from(scanLogs)
    .where(gte(scanLogs.scannedAt, new Date(Date.now() - days * 86_400_000)))
    .groupBy(sql`date_trunc('day', ${scanLogs.scannedAt})`)
    .orderBy(sql`date_trunc('day', ${scanLogs.scannedAt})`);

  const byDay = new Map(
    (rows as Array<Record<string, unknown>>).map((r) => [
      String(r.day),
      {
        scans: Number(r.scans ?? 0),
        threats: Number(r.threats ?? 0),
        avgResponseMs: Number(r.avgResponseMs ?? 0),
      },
    ]),
  );

  const out: DailyTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const found = byDay.get(key);
    out.push({
      date: key,
      dayLabel: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
      scans: found?.scans ?? 0,
      threats: found?.threats ?? 0,
      avgResponseMs: found?.avgResponseMs ?? 0,
    });
  }
  return out;
}
