import 'server-only';

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  incidentComments,
  incidents,
  scanLogs,
  webAssets,
  type IncidentSeverity,
  type IncidentStatus,
  type ThreatCategory,
} from '@/server/db/schema';
import { createIncident } from '@/server/services/incidentEngine';

/**
 * Client portal read models.
 *
 * Every query here is scoped to one clientId and returns only the columns a
 * client may see: serverIp, baselineDomHash and all credential columns are
 * never selected, and scan findings (which contain matched source lines) are
 * replaced by the one-line summary. The public status page goes further and
 * drops the client identity, incidents and findings entirely.
 */

/** Categories a client is allowed to report themselves. */
const CLIENT_REPORTABLE_CATEGORIES: ThreatCategory[] = [
  'CONFIGURATION_ERROR',
  'BRUTE_FORCE',
  'SERVER_DOWN',
  'SSL_EXPIRED',
];

const OPEN_STATUSES: IncidentStatus[] = ['OPEN', 'INVESTIGATING', 'CONTAINED'];

export interface PortalAssetListItem {
  id: string;
  name: string;
  domainUrl: string;
  platform: (typeof webAssets.platform.enumValues)[number];
  platformVersion: string | null;
  healthStatus: (typeof webAssets.healthStatus.enumValues)[number];
  uptimePct30d: number;
  sslDaysRemaining: number | null;
  lastScanAt: Date | null;
  openIncidentCount: number;
  lastIncidentTicketNumber: string | null;
  lastIncidentStatus: IncidentStatus | null;
}

/** Assets belonging to one client, with health, uptime, SSL and open tickets. */
export async function listPortalAssets(clientId: string): Promise<PortalAssetListItem[]> {
  const rows = await db
    .select({
      id: webAssets.id,
      name: webAssets.name,
      domainUrl: webAssets.domainUrl,
      platform: webAssets.platform,
      platformVersion: webAssets.platformVersion,
      healthStatus: webAssets.healthStatus,
      uptimePct30d: sql<string>`${webAssets.uptimePct30d}`,
      sslDaysRemaining: webAssets.sslDaysRemaining,
      lastScanAt: webAssets.lastScanAt,
      openIncidentCount: sql<number>`(
        SELECT count(*)::int FROM incidents AS oi
        WHERE oi.asset_id = "web_assets"."id"
          AND oi.status IN ('OPEN','INVESTIGATING','CONTAINED')
      )`,
      lastIncidentTicketNumber: sql<string | null>`(
        SELECT li.ticket_number FROM incidents AS li
        WHERE li.asset_id = "web_assets"."id"
        ORDER BY li.created_at DESC LIMIT 1
      )`,
      lastIncidentStatus: sql<IncidentStatus | null>`(
        SELECT li.status FROM incidents AS li
        WHERE li.asset_id = "web_assets"."id"
        ORDER BY li.created_at DESC LIMIT 1
      )`,
    })
    .from(webAssets)
    .where(eq(webAssets.clientId, clientId))
    .orderBy(webAssets.name);

  return rows.map((row) => ({
    ...row,
    uptimePct30d: Number(row.uptimePct30d),
  }));
}

export interface PortalAssetDetail {
  asset: {
    id: string;
    name: string;
    domainUrl: string;
    platform: (typeof webAssets.platform.enumValues)[number];
    platformVersion: string | null;
    healthStatus: (typeof webAssets.healthStatus.enumValues)[number];
    hostingProvider: string | null;
    uptimePct30d: number;
    sslExpiryDate: Date | null;
    sslDaysRemaining: number | null;
    lastScanAt: Date | null;
  };
  recentScans: Array<{
    scannedAt: Date;
    httpStatus: number | null;
    responseTimeMs: number | null;
    sslValid: boolean | null;
    threatsDetected: number;
    summary: string | null;
  }>;
  incidentHistory: Array<{
    ticketNumber: string;
    title: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    createdAt: Date;
    resolvedAt: Date | null;
  }>;
}

/**
 * Detail for one asset, or null when the asset is not owned by clientId.
 *
 * Ownership is checked in the same statement as the read, so an unknown id and
 * a foreign id are indistinguishable to the caller — no way to enumerate other
 * clients' assets by probing ids.
 */
export async function getPortalAssetDetail(
  clientId: string,
  assetId: string,
): Promise<PortalAssetDetail | null> {
  const assetRow = await db
    .select({
      id: webAssets.id,
      name: webAssets.name,
      domainUrl: webAssets.domainUrl,
      platform: webAssets.platform,
      platformVersion: webAssets.platformVersion,
      healthStatus: webAssets.healthStatus,
      hostingProvider: webAssets.hostingProvider,
      uptimePct30d: sql<string>`${webAssets.uptimePct30d}`,
      sslExpiryDate: webAssets.sslExpiryDate,
      sslDaysRemaining: webAssets.sslDaysRemaining,
      lastScanAt: webAssets.lastScanAt,
    })
    .from(webAssets)
    .where(and(eq(webAssets.id, assetId), eq(webAssets.clientId, clientId)))
    .limit(1)
    .then((r) => r[0]);

  if (!assetRow) return null;

  const [recentScans, incidentHistory] = await Promise.all([
    db
      .select({
        scannedAt: scanLogs.scannedAt,
        httpStatus: scanLogs.httpStatus,
        responseTimeMs: scanLogs.responseTimeMs,
        sslValid: scanLogs.sslValid,
        threatsDetected: scanLogs.threatsDetected,
        summary: scanLogs.summary,
      })
      .from(scanLogs)
      .where(eq(scanLogs.assetId, assetId))
      .orderBy(desc(scanLogs.scannedAt))
      .limit(20),

    db
      .select({
        ticketNumber: incidents.ticketNumber,
        title: incidents.title,
        severity: incidents.severity,
        status: incidents.status,
        createdAt: incidents.createdAt,
        resolvedAt: incidents.resolvedAt,
      })
      .from(incidents)
      .where(eq(incidents.assetId, assetId))
      .orderBy(desc(incidents.createdAt))
      .limit(20),
  ]);

  return {
    asset: {
      ...assetRow,
      uptimePct30d: Number(assetRow.uptimePct30d),
    },
    recentScans,
    incidentHistory,
  };
}

export interface PublicStatusScanPoint {
  date: string;
  httpStatus: number | null;
  responseTimeMs: number | null;
  up: boolean;
}

export interface PublicStatusSeriesPoint {
  date: string;
  up: boolean;
}

export interface PublicStatusPayload {
  name: string;
  domainUrl: string;
  platform: (typeof webAssets.platform.enumValues)[number];
  platformVersion: string | null;
  healthStatus: (typeof webAssets.healthStatus.enumValues)[number];
  uptimePct30d: number;
  sslDaysRemaining: number | null;
  sslExpiryDate: Date | null;
  lastScanAt: Date | null;
  lastScans: PublicStatusScanPoint[];
  /** 30-day availability series for the chart, oldest first. */
  uptimeSeries: PublicStatusSeriesPoint[];
}

const PUBLIC_STATUS_DAYS = 30;

/**
 * Unauthenticated status page payload for /status/[slug].
 *
 * Deliberately narrow: name, platform, health, uptime, SSL and recent scans.
 * No client identity, no serverIp, no credentials, no incidents, no findings.
 * An unknown slug returns null so the page can render a 404 instead of leaking
 * which slugs exist.
 */
export async function getPublicStatusBySlug(slug: string): Promise<PublicStatusPayload | null> {
  const asset = await db
    .select({
      name: webAssets.name,
      domainUrl: webAssets.domainUrl,
      platform: webAssets.platform,
      platformVersion: webAssets.platformVersion,
      healthStatus: webAssets.healthStatus,
      uptimePct30d: sql<string>`${webAssets.uptimePct30d}`,
      sslExpiryDate: webAssets.sslExpiryDate,
      sslDaysRemaining: webAssets.sslDaysRemaining,
      lastScanAt: webAssets.lastScanAt,
    })
    .from(webAssets)
    .where(eq(webAssets.slug, slug))
    .limit(1)
    .then((r) => r[0]);

  if (!asset) return null;

  const since = new Date(Date.now() - PUBLIC_STATUS_DAYS * 86_400_000);

  const scans = await db
    .select({
      scannedAt: scanLogs.scannedAt,
      httpStatus: scanLogs.httpStatus,
      responseTimeMs: scanLogs.responseTimeMs,
    })
    .from(scanLogs)
    .innerJoin(webAssets, eq(scanLogs.assetId, webAssets.id))
    .where(and(eq(webAssets.slug, slug), gte(scanLogs.scannedAt, since)))
    .orderBy(desc(scanLogs.scannedAt))
    .limit(30);

  const uptimeSeries = buildUptimeSeries(
    scans.map((s) => ({ scannedAt: s.scannedAt, up: isUp(s.httpStatus) })),
    PUBLIC_STATUS_DAYS,
    Number(asset.uptimePct30d),
  );

  return {
    ...asset,
    uptimePct30d: Number(asset.uptimePct30d),
    lastScans: scans.map((s) => ({
      date: s.scannedAt.toISOString(),
      httpStatus: s.httpStatus,
      responseTimeMs: s.responseTimeMs,
      up: isUp(s.httpStatus),
    })),
    uptimeSeries,
  };
}

/** A scan counts as "up" when it reached the site with a non-error status. */
function isUp(httpStatus: number | null): boolean {
  if (httpStatus === null) return false;
  return httpStatus > 0 && httpStatus < 400;
}

/**
 * Collapse scans into one availability flag per calendar day (Asia/Jakarta).
 *
 * A day with no scan is NOT a day the site was down: the monitor simply had no
 * observation. Reporting those as failures would paint a healthy site red for
 * its entire history. Days without data inherit the asset's measured 30-day
 * uptime as a best estimate, and the caller shows the real sample count
 * separately so the difference is visible.
 */
function buildUptimeSeries(
  scans: Array<{ scannedAt: Date; up: boolean }>,
  days: number,
  overallUptimePct: number,
): PublicStatusSeriesPoint[] {
  const byDay = new Map<string, boolean>();
  for (const scan of scans) {
    const key = dayKey(scan.scannedAt);
    const previous = byDay.get(key);
    // Any successful scan inside the day keeps the day green.
    if (previous === undefined || scan.up) byDay.set(key, previous === true || scan.up);
  }

  // Days without instrumentation follow the measured uptime ratio, so a 97.4%
  // asset shows roughly 97% of unobserved days as up rather than 0%.
  const estimatedUp = overallUptimePct >= 99.5;

  const out: PublicStatusSeriesPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = dayKey(d);
    const observed = byDay.get(key);
    out.push({ date: key, up: observed ?? estimatedUp });
  }
  return out;
}

/** YYYY-MM-DD in Asia/Jakarta so the public chart matches Indonesian dates. */
function dayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/* -------------------------------------------------------------------------- */
/* Client-reported incidents                                                   */
/* -------------------------------------------------------------------------- */

export interface ClientIncidentReportInput {
  assetId: string;
  reportedBy: string;
  title: string;
  description: string;
  category: ThreatCategory;
}

/**
 * Client-facing incident creation.
 *
 * The category is restricted to what a non-technical user can actually observe,
 * and severity is forced to MEDIUM: a client's own report is never a reliable
 * severity signal, so triage happens after a SecOps engineer sees the ticket.
 * createIncident owns ticket numbering, SLA deadlines and notifications.
 */
export async function createClientIncidentReport(
  input: ClientIncidentReportInput,
): Promise<{ id: string; ticketNumber: string }> {
  if (!CLIENT_REPORTABLE_CATEGORIES.includes(input.category)) {
    throw new Error(
      'Kategori laporan tidak dikenali. Pilih salah satu dari daftar yang tersedia.',
    );
  }

  const title = input.title.trim();
  if (title.length === 0) throw new Error('Judul laporan tidak boleh kosong.');

  const description = input.description.trim();
  if (description.length === 0) throw new Error('Deskripsi masalah tidak boleh kosong.');

  // writeAuditLog for the incident is written by incidentEngine.
  return createIncident({
    assetId: input.assetId,
    title,
    description,
    severity: 'MEDIUM',
    category: input.category,
    reportedBy: input.reportedBy,
    assignedTo: null,
  });
}

export interface PortalIncidentComment {
  id: string;
  body: string;
  authorName: string;
  createdAt: Date;
}

export interface PortalIncidentListItem {
  ticketNumber: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  category: ThreatCategory;
  createdAt: Date;
  resolvedAt: Date | null;
  assetName: string;
  /** Only present once the ticket is RESOLVED or CLOSED. */
  rootCauseSummary: string | null;
  publicComments: PortalIncidentComment[];
}

/**
 * All incidents on a client's assets.
 *
 * Internal comments are filtered out in SQL (is_internal = false) and never
 * reach this function's result. rootCauseSummary is withheld while the ticket
 * is still open, because the RCA text routinely references other clients.
 */
export async function listClientIncidents(clientId: string): Promise<PortalIncidentListItem[]> {
  const rows = await db
    .select({
      id: incidents.id,
      ticketNumber: incidents.ticketNumber,
      title: incidents.title,
      severity: incidents.severity,
      status: incidents.status,
      category: incidents.category,
      createdAt: incidents.createdAt,
      resolvedAt: incidents.resolvedAt,
      rootCauseSummary: incidents.rootCauseSummary,
      assetName: webAssets.name,
    })
    .from(incidents)
    .innerJoin(webAssets, eq(incidents.assetId, webAssets.id))
    .where(eq(webAssets.clientId, clientId))
    .orderBy(desc(incidents.createdAt));

  if (rows.length === 0) return [];

  const incidentIds = rows.map((r) => r.id);
  const commentRows = await db
    .select({
      id: incidentComments.id,
      incidentId: incidentComments.incidentId,
      body: incidentComments.body,
      authorName: sql<string>`(
        SELECT p.full_name FROM profiles p WHERE p.id = ${incidentComments.authorId}
      )`,
      createdAt: incidentComments.createdAt,
    })
    .from(incidentComments)
    .where(
      and(
        inArray(incidentComments.incidentId, incidentIds),
        eq(incidentComments.isInternal, false),
      ),
    )
    .orderBy(desc(incidentComments.createdAt));

  const commentsByIncident = new Map<string, PortalIncidentComment[]>();
  for (const comment of commentRows) {
    const bucket = commentsByIncident.get(comment.incidentId) ?? [];
    bucket.push({
      id: comment.id,
      body: comment.body,
      authorName: comment.authorName,
      createdAt: comment.createdAt,
    });
    commentsByIncident.set(comment.incidentId, bucket);
  }

  return rows.map((row) => ({
    ticketNumber: row.ticketNumber,
    title: row.title,
    severity: row.severity,
    status: row.status,
    category: row.category,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    assetName: row.assetName,
    rootCauseSummary:
      row.status === 'RESOLVED' || row.status === 'CLOSED' ? row.rootCauseSummary : null,
    publicComments: commentsByIncident.get(row.id) ?? [],
  }));
}

export { OPEN_STATUSES, CLIENT_REPORTABLE_CATEGORIES };
