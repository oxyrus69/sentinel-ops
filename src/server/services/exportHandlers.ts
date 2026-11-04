import 'server-only';

import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { incidents, webAssets } from '@/server/db/schema';

/**
 * CSV export helpers for Route Handlers.
 *
 * Target reader is Excel with an Indonesian locale, so the output uses:
 *   - a UTF-8 BOM so Excel detects the encoding instead of mangling accents,
 *   - semicolon delimiters (comma is the decimal separator in id-ID),
 *   - CRLF line endings,
 *   - DD/MM/YYYY HH:mm timestamps in Asia/Jakarta.
 *
 * Keep this file free of Next.js APIs: it is imported by a Node-runtime route
 * handler, not a React component.
 */

const CSV_DELIMITER = ';';
const CSV_EOL = '\r\n';
const CSV_BOM = '\uFEFF';

/** Escape one cell: quote when it holds a delimiter, quote, or newline. */
export function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[;"\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Alias of escapeCsv for call sites that read better as a cell formatter. */
export function toCsvCell(value: string | number | null | undefined): string {
  return escapeCsv(value);
}

/**
 * Build a downloadable CSV Response.
 *
 * Column order comes from the first row's key insertion order; rows that miss a
 * column produce an empty cell rather than shifting the columns.
 */
export function buildCsvResponse(
  rows: Array<Record<string, string | number | null>>,
  filename: string,
): Response {
  const columns = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];

  const lines: string[] = [];
  if (columns.length > 0) {
    lines.push(columns.map((c) => escapeCsv(c)).join(CSV_DELIMITER));
  }

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsv(row[column] ?? null)).join(CSV_DELIMITER));
  }

  const body = CSV_BOM + lines.join(CSV_EOL) + (lines.length > 0 ? CSV_EOL : '');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** DD/MM/YYYY HH:mm in Asia/Jakarta, or an empty string for a missing date. */
function formatJakartaDate(value: Date | null | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).format(value);
}

function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

/* -------------------------------------------------------------------------- */
/* Asset export                                                                */
/* -------------------------------------------------------------------------- */

/** Full asset inventory with client name, health, uptime and SSL window. */
export async function exportAssetsCsv(): Promise<Response> {
  const rows = await db
    .select({
      name: webAssets.name,
      domainUrl: webAssets.domainUrl,
      clientName: sql<string>`(SELECT full_name FROM profiles WHERE profiles.id = ${webAssets.clientId})`,
      platform: webAssets.platform,
      platformVersion: webAssets.platformVersion,
      hostingProvider: webAssets.hostingProvider,
      healthStatus: webAssets.healthStatus,
      uptimePct30d: sql<string>`${webAssets.uptimePct30d}`,
      sslDaysRemaining: webAssets.sslDaysRemaining,
      lastScanAt: webAssets.lastScanAt,
      openIncidents: sql<number>`(
        SELECT count(*)::int FROM incidents AS xi
        WHERE xi.asset_id = "web_assets"."id"
          AND xi.status IN ('OPEN','INVESTIGATING','CONTAINED')
      )`,
    })
    .from(webAssets)
    .orderBy(webAssets.name);

  const data = rows.map((row) => ({
    'Nama Aset': row.name,
    Domain: row.domainUrl,
    Klien: row.clientName,
    Platform: row.platform,
    'Versi Platform': row.platformVersion ?? '',
    Hosting: row.hostingProvider ?? '',
    'Status Kesehatan': row.healthStatus,
    'Uptime 30 Hari (%)': formatNumber(row.uptimePct30d),
    'Sisa SSL (hari)': row.sslDaysRemaining === null ? '' : String(row.sslDaysRemaining),
    'Terakhir Dipindai': formatJakartaDate(row.lastScanAt),
    'Insiden Aktif': String(row.openIncidents),
  }));

  return buildCsvResponse(data, 'aset-web.csv');
}

/* -------------------------------------------------------------------------- */
/* Incident export                                                             */
/* -------------------------------------------------------------------------- */

/** Ticket register with asset, assignee and SLA breach flag. */
export async function exportIncidentsCsv(): Promise<Response> {
  const rows = await db
    .select({
      ticketNumber: incidents.ticketNumber,
      title: incidents.title,
      assetName: webAssets.name,
      category: incidents.category,
      severity: incidents.severity,
      status: incidents.status,
      createdAt: incidents.createdAt,
      slaResolutionDueAt: incidents.slaResolutionDueAt,
      resolvedAt: incidents.resolvedAt,
      slaBreached: incidents.slaBreached,
      assigneeName: sql<string | null>`(
        SELECT p.full_name FROM profiles p WHERE p.id = ${incidents.assignedTo}
      )`,
      reporterName: sql<string>`(
        SELECT p.full_name FROM profiles p WHERE p.id = ${incidents.reportedBy}
      )`,
    })
    .from(incidents)
    .innerJoin(webAssets, eq(incidents.assetId, webAssets.id))
    .orderBy(desc(incidents.createdAt));

  const data = rows.map((row) => ({
    'Nomor Tiket': row.ticketNumber,
    Judul: row.title,
    Aset: row.assetName,
    Kategori: row.category,
    Severity: row.severity,
    Status: row.status,
    Dibuat: formatJakartaDate(row.createdAt),
    'Tenggat Resolusi': formatJakartaDate(row.slaResolutionDueAt),
    Diselesaikan: formatJakartaDate(row.resolvedAt),
    'Pelanggaran SLA': row.slaBreached ? 'Ya' : 'Tidak',
    'Ditugaskan Ke': row.assigneeName ?? 'Belum ditugaskan',
    Pelapor: row.reporterName,
  }));

  return buildCsvResponse(data, 'insiden.csv');
}
