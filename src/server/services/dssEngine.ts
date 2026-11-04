import 'server-only';

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  credentialVaults,
  decisionRules,
  incidents,
  profiles,
  scanLogs,
  webAssets,
} from '@/server/db/schema';
import { countActiveTicketsByAssignee } from '@/server/services/incidentEngine';
import { writeAuditLog } from '@/server/audit';

/**
 * Decision Support System.
 *
 * All metrics are aggregated on the fly when the page renders. No cached score
 * column exists anywhere, so a recommendation can never go stale.
 */

export type DssRuleCode =
  | 'SSL_EXPIRY_RISK'
  | 'CHRONIC_VULNERABILITY'
  | 'STALE_CREDENTIALS'
  | 'SLA_BREACH_WARNING'
  | 'ENGINEER_BOTTLENECK';

export interface DssRecommendation {
  id: string;
  ruleCode: DssRuleCode;
  /** Short headline, Indonesian. */
  title: string;
  /** The numeric facts that triggered it. */
  facts: DssFact[];
  /** One-sentence reason. */
  reason: string;
  /** Concrete risk or cost. */
  riskImpact: string;
  /** Deep link to the screen where the fix happens. */
  actionLabel: string;
  actionHref: string;
  /** 0 = most urgent. */
  priority: number;
}

export interface DssFact {
  label: string;
  value: string | number;
  /** Extra context, e.g. which assets. */
  detail?: string;
}

export interface DssThresholds {
  sslWarnDays: number;
  repeatInfectionThreshold: number;
  repeatInfectionWindowDays: number;
  credentialRotationDays: number;
  slaWarnRatioPct: number;
  maxActiveTicketsPerEngineer: number;
}

export const DEFAULT_THRESHOLDS: DssThresholds = {
  sslWarnDays: 14,
  repeatInfectionThreshold: 2,
  repeatInfectionWindowDays: 30,
  credentialRotationDays: 90,
  slaWarnRatioPct: 25,
  maxActiveTicketsPerEngineer: 5,
};

/** Active thresholds, falling back to defaults for a missing row. */
export async function loadThresholds(): Promise<DssThresholds> {
  const rows = await db.select().from(decisionRules).limit(1);
  const rule = rows[0];
  if (!rule) return { ...DEFAULT_THRESHOLDS };
  return {
    sslWarnDays: rule.sslWarnDays,
    repeatInfectionThreshold: rule.repeatInfectionThreshold,
    repeatInfectionWindowDays: rule.repeatInfectionWindowDays,
    credentialRotationDays: rule.credentialRotationDays,
    slaWarnRatioPct: rule.slaWarnRatioPct,
    maxActiveTicketsPerEngineer: rule.maxActiveTicketsPerEngineer,
  };
}

/**
 * Build the priority recommendation list.
 *
 * Every rule follows the same contract:
 *   trigger fact -> threshold -> one-sentence reason -> risk/cost -> action.
 */
export async function buildRecommendations(): Promise<{
  recommendations: DssRecommendation[];
  thresholds: DssThresholds;
  generatedAt: Date;
}> {
  const thresholds = await loadThresholds();
  const now = new Date();
  const out: DssRecommendation[] = [];

  const [sslRisk, chronic, staleCreds, slaWarn, bottleneck] = await Promise.all([
    findSslExpiryRisk(thresholds.sslWarnDays, now),
    findChronicVulnerabilities(
      thresholds.repeatInfectionThreshold,
      thresholds.repeatInfectionWindowDays,
      now,
    ),
    findStaleCredentials(thresholds.credentialRotationDays, now),
    findSlaBreachWarnings(thresholds.slaWarnRatioPct, now),
    findEngineerBottleneck(thresholds.maxActiveTicketsPerEngineer),
  ]);

  out.push(...sslRisk, ...chronic, ...staleCreds, ...slaWarn, ...bottleneck);

  // Stable ordering: priority first, then rule code, then title.
  out.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.ruleCode !== b.ruleCode) return a.ruleCode.localeCompare(b.ruleCode);
    return a.title.localeCompare(b.title);
  });

  return { recommendations: out, thresholds, generatedAt: now };
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                      */
/* -------------------------------------------------------------------------- */

async function findSslExpiryRisk(
  warnDays: number,
  now: Date,
): Promise<DssRecommendation[]> {
  const horizon = new Date(now.getTime() + warnDays * 86_400_000);

  const rows = await db
    .select({
      id: webAssets.id,
      name: webAssets.name,
      domainUrl: webAssets.domainUrl,
      sslExpiryDate: webAssets.sslExpiryDate,
      sslDaysRemaining: webAssets.sslDaysRemaining,
      healthStatus: webAssets.healthStatus,
    })
    .from(webAssets)
    .where(
      and(
        sql`${webAssets.sslExpiryDate} IS NOT NULL`,
        sql`${webAssets.sslExpiryDate} <= ${horizon}`,
        sql`${webAssets.healthStatus} <> 'MAINTENANCE'`,
      ),
    )
    .orderBy(webAssets.sslExpiryDate);

  if (rows.length === 0) return [];

  const worst = rows.reduce(
    (min, r) => (r.sslDaysRemaining ?? 9999) < (min.sslDaysRemaining ?? 9999) ? r : min,
    rows[0]!,
  );

  return [
    {
      id: `SSL_EXPIRY_RISK:${rows.length}`,
      ruleCode: 'SSL_EXPIRY_RISK',
      title: `${rows.length} sertifikat SSL kedaluwarsa dalam ${warnDays} hari`,
      facts: [
        {
          label: 'Ambang batas',
          value: `${warnDays} hari`,
        },
        {
          label: 'Aset terdekat',
          value: `${worst.name} (sisa ${worst.sslDaysRemaining ?? '?'} hari)`,
          detail: worst.domainUrl,
        },
        {
          label: 'Total aset terpapar',
          value: rows.length,
        },
      ],
      reason: `Sertifikat yang berakhir membuat browser menandai situs "Tidak aman" dan menghentikan trafik pengguna.`,
      riskImpact:
        rows.length === 1
          ? 'Satu situs berisiko tidak dapat diakses, lengkap dengan peringatan keamanan di semua perangkat.'
          : `${rows.length} situs berisiko tidak dapat diakses sekaligus, termasuk halaman status publik.`,
      actionLabel: 'Perbarui sertifikat SSL',
      actionHref: '/dss/risiko',
      priority: worst.sslDaysRemaining !== null && worst.sslDaysRemaining <= 3 ? 0 : 1,
    },
  ];
}

async function findChronicVulnerabilities(
  threshold: number,
  windowDays: number,
  now: Date,
): Promise<DssRecommendation[]> {
  const since = new Date(now.getTime() - windowDays * 86_400_000);

  const rows = await db
    .select({
      assetId: incidents.assetId,
      assetName: webAssets.name,
      domainUrl: webAssets.domainUrl,
      platform: webAssets.platform,
      platformVersion: webAssets.platformVersion,
      count: sql<number>`count(*)::int`,
      lastAt: sql<string>`max(${incidents.createdAt})`,
    })
    .from(incidents)
    .innerJoin(webAssets, eq(incidents.assetId, webAssets.id))
    .where(
      and(
        gte(incidents.createdAt, since),
        sql`${incidents.category} IN ('SLOT_DEFACEMENT','MALWARE_BACKDOOR','SQL_INJECTION','BRUTE_FORCE')`,
      ),
    )
    .groupBy(incidents.assetId, webAssets.name, webAssets.domainUrl, webAssets.platform, webAssets.platformVersion)
    .having(sql`count(*) >= ${threshold}`)
    .orderBy(sql`count(*) DESC`);

  if (rows.length === 0) return [];

  return rows.map((r) => ({
    id: `CHRONIC_VULNERABILITY:${r.assetId}`,
    ruleCode: 'CHRONIC_VULNERABILITY' as const,
    title: `${r.assetName} terinfeksi ${r.count} kali dalam ${windowDays} hari`,
    facts: [
      { label: 'Ambang batas', value: `${threshold} insiden / ${windowDays} hari` },
      { label: 'Insiden tercatat', value: r.count },
      {
        label: 'Platform',
        value: `${r.platform}${r.platformVersion ? ` ${r.platformVersion}` : ''}`,
        detail: r.domainUrl,
      },
    ],
    reason:
      'Infeksi berulang pada aset yang sama menandakan pintu masuk yang belum ditutup, bukan kebetulan.',
    riskImpact:
      'Setiap infeksi berikutnya berpotensi mencuri data pengguna, merusak reputasi, dan menghabiskan waktu tim berulang kali.',
    actionLabel: 'Jadwalkan audit mendalam',
    actionHref: `/assets/${r.assetId}`,
    priority: r.count >= threshold + 2 ? 0 : 1,
  }));
}

async function findStaleCredentials(
  rotationDays: number,
  now: Date,
): Promise<DssRecommendation[]> {
  const cutoff = new Date(now.getTime() - rotationDays * 86_400_000);

  // Never rotated, or rotated too long ago.
  const staleRows = await db
    .select({
      id: credentialVaults.id,
      label: credentialVaults.label,
      category: credentialVaults.category,
      lastRotatedAt: credentialVaults.lastRotatedAt,
      assetId: webAssets.id,
      assetName: webAssets.name,
    })
    .from(credentialVaults)
    .innerJoin(webAssets, eq(credentialVaults.assetId, webAssets.id))
    .where(
      sql`COALESCE(${credentialVaults.lastRotatedAt}, ${credentialVaults.createdAt}) <= ${cutoff}`,
    )
    .orderBy(sql`COALESCE(${credentialVaults.lastRotatedAt}, ${credentialVaults.createdAt}) ASC`)
    .limit(50);

  if (staleRows.length === 0) return [];

  const oldest = staleRows[0]!;
  const oldestDate = oldest.lastRotatedAt ?? null;
  const ageDays = oldestDate
    ? Math.floor((now.getTime() - oldestDate.getTime()) / 86_400_000)
    : null;

  return [
    {
      id: `STALE_CREDENTIALS:${staleRows.length}`,
      ruleCode: 'STALE_CREDENTIALS',
      title: `${staleRows.length} kredensial belum dirotasi selama ${rotationDays} hari`,
      facts: [
        { label: 'Ambang batas', value: `${rotationDays} hari` },
        {
          label: 'Paling usang',
          value: `${oldest.label} (${oldest.assetName})`,
          detail: ageDays !== null ? `Terakhir dirotasi ${ageDays} hari lalu` : 'Belum pernah dirotasi',
        },
        { label: 'Total kredensial usang', value: staleRows.length },
      ],
      reason:
        'Kredensial yang tidak diganti semakin lama semakin mungkin sudah bocor tanpa terdeteksi.',
      riskImpact:
        'Satu sandi yang bocor bisa memberi akses penuh ke hosting, basis data, atau akun indeksasi jurnal.',
      actionLabel: 'Rotasi kredensial',
      actionHref: '/vault',
      priority: ageDays !== null && ageDays >= rotationDays * 2 ? 0 : 1,
    },
  ];
}

async function findSlaBreachWarnings(
  warnRatioPct: number,
  now: Date,
): Promise<DssRecommendation[]> {
  const rows = await db
    .select({
      id: incidents.id,
      ticketNumber: incidents.ticketNumber,
      title: incidents.title,
      severity: incidents.severity,
      status: incidents.status,
      createdAt: incidents.createdAt,
      slaResolutionDueAt: incidents.slaResolutionDueAt,
      assetName: webAssets.name,
    })
    .from(incidents)
    .innerJoin(webAssets, eq(incidents.assetId, webAssets.id))
    .where(sql`${incidents.status} IN ('OPEN','INVESTIGATING','CONTAINED')`)
    .orderBy(incidents.slaResolutionDueAt);

  const atRisk = rows.filter((r) => {
    if (!r.slaResolutionDueAt) return false;
    const total = r.slaResolutionDueAt.getTime() - r.createdAt.getTime();
    if (total <= 0) return true;
    const remaining = r.slaResolutionDueAt.getTime() - now.getTime();
    if (remaining <= 0) return true; // already breached
    const remainingPct = (remaining / total) * 100;
    return remainingPct <= warnRatioPct;
  });

  if (atRisk.length === 0) return [];

  const worst = atRisk[0]!;
  const remainingMs = worst.slaResolutionDueAt
    ? worst.slaResolutionDueAt.getTime() - now.getTime()
    : 0;

  return [
    {
      id: `SLA_BREACH_WARNING:${atRisk.length}`,
      ruleCode: 'SLA_BREACH_WARNING',
      title: `${atRisk.length} tiket berisiko melanggar tenggat SLA`,
      facts: [
        { label: 'Ambang batas', value: `sisa waktu <= ${warnRatioPct}% kuota SLA` },
        {
          label: 'Paling mendesak',
          value: `${worst.ticketNumber} — ${worst.assetName}`,
          detail:
            remainingMs <= 0
              ? 'Sudah melewati tenggat'
              : `Sisa ${formatShortDuration(remainingMs)} (${worst.severity})`,
        },
        { label: 'Total tiket terpapar', value: atRisk.length },
      ],
      reason:
        'Tiket yang menyentuh ambang peringatan hampir pasti melewati tenggat jika tidak ditangani hari ini.',
      riskImpact:
        'Pelanggaran SLA tercatat sebagai ketidakpatuhan kontrak layanan dan berdampak pada kepercayaan klien.',
      actionLabel: 'Buka antrean insiden',
      actionHref: '/incidents',
      priority: remainingMs <= 0 ? 0 : 1,
    },
  ];
}

async function findEngineerBottleneck(
  maxActive: number,
): Promise<DssRecommendation[]> {
  const rows = await countActiveTicketsByAssignee();

  const overloaded = rows.filter((r) => r.count > maxActive);
  if (overloaded.length === 0) return [];

  const worst = overloaded[0]!;

  return [
    {
      id: `ENGINEER_BOTTLENECK:${overloaded.length}`,
      ruleCode: 'ENGINEER_BOTTLENECK',
      title: `${overloaded.length} teknisi membawa tiket aktif di atas batas`,
      facts: [
        { label: 'Ambang batas', value: `${maxActive} tiket aktif / teknisi` },
        {
          label: 'Paling terbebani',
          value: `${worst.fullName} — ${worst.count} tiket aktif`,
        },
        { label: 'Total teknisi terbebani', value: overloaded.length },
      ],
      reason:
        'Beban yang tidak seimbang membuat tenggat SLA tiket paling padat sulit dipenuhi.',
      riskImpact:
        'Tiket menumpuk di satu orang, sementara teknisi lain belum dimanfaatkan optimal.',
      actionLabel: 'Tinjau pembagian tiket',
      actionHref: '/dss/sla',
      priority: worst.count >= maxActive + 3 ? 0 : 1,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Decision log                                                               */
/* -------------------------------------------------------------------------- */

export type DecisionOutcomeValue = 'ACCEPTED' | 'DISMISSED';

export interface RecordDecisionInput {
  ruleCode: DssRuleCode | string;
  recommendationTitle: string;
  recommendationBody?: string;
  facts: DssFact[];
  riskImpact?: string;
  outcome: DecisionOutcomeValue;
  note?: string;
  actor: { id: string; role: string; label: string };
}

export async function recordDecision(input: RecordDecisionInput): Promise<{ id: string }> {
  const { randomUUID } = await import('node:crypto');
  const id = randomUUID();

  await db.execute(sql`
    INSERT INTO decision_logs (
      id, rule_code, recommendation_title, recommendation_body,
      trigger_facts_json, risk_impact, outcome, decided_by, decided_at, decision_note
    ) VALUES (
      ${id}, ${input.ruleCode}, ${input.recommendationTitle}, ${input.recommendationBody ?? null},
      ${JSON.stringify(input.facts)}::jsonb, ${input.riskImpact ?? null},
      ${input.outcome}, ${input.actor.id}, now(), ${input.note ?? null}
    )
  `);

  await writeAuditLog({
    actor: input.actor,
    action: 'dss.decision_recorded',
    entityType: 'decision_log',
    entityId: id,
    summary:
      `Rekomendasi DSS "${input.recommendationTitle}" ${input.outcome === 'ACCEPTED' ? 'diterima' : 'ditolak'}` +
      (input.note ? `. Catatan: ${input.note}` : '.'),
    changes: { outcome: { from: 'PENDING', to: input.outcome } },
  });

  return { id };
}

/** Decision history, newest first. */
export async function listDecisionLogs(limit = 100) {
  return db
    .select({
      log: sql`decision_logs`,
      actor: profiles,
    })
    .from(sql`decision_logs`)
    .leftJoin(profiles, sql`decision_logs.decided_by = ${profiles.id}`)
    .orderBy(desc(sql`decision_logs.created_at`))
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatShortDuration(ms: number): string {
  if (ms <= 0) return 'lewat tenggat';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}h ${hours}j`;
  if (hours > 0) return `${hours}j ${mins}m`;
  return `${mins} menit`;
}

/** Thresholds for the settings form (SUPER_ADMIN only). */
export async function updateThresholds(input: {
  sslWarnDays: number;
  repeatInfectionThreshold: number;
  repeatInfectionWindowDays: number;
  credentialRotationDays: number;
  slaWarnRatioPct: number;
  maxActiveTicketsPerEngineer: number;
  actor: { id: string; role: string; label: string };
}): Promise<void> {
  const existing = await db.select().from(decisionRules).limit(1);

  if (existing[0]) {
    const before = existing[0];
    await db
      .update(decisionRules)
      .set({
        sslWarnDays: input.sslWarnDays,
        repeatInfectionThreshold: input.repeatInfectionThreshold,
        repeatInfectionWindowDays: input.repeatInfectionWindowDays,
        credentialRotationDays: input.credentialRotationDays,
        slaWarnRatioPct: input.slaWarnRatioPct,
        maxActiveTicketsPerEngineer: input.maxActiveTicketsPerEngineer,
        updatedBy: input.actor.id,
        updatedAt: new Date(),
      })
      .where(eq(decisionRules.id, before.id));

    await writeAuditLog({
      actor: input.actor,
      action: 'dss.rule_updated',
      entityType: 'decision_rules',
      entityId: before.id,
      summary: 'Ambang batas aturan keputusan DSS diperbarui.',
      changes: {
        sslWarnDays: { from: before.sslWarnDays, to: input.sslWarnDays },
        repeatInfectionThreshold: {
          from: before.repeatInfectionThreshold,
          to: input.repeatInfectionThreshold,
        },
        credentialRotationDays: {
          from: before.credentialRotationDays,
          to: input.credentialRotationDays,
        },
        slaWarnRatioPct: { from: before.slaWarnRatioPct, to: input.slaWarnRatioPct },
        maxActiveTicketsPerEngineer: {
          from: before.maxActiveTicketsPerEngineer,
          to: input.maxActiveTicketsPerEngineer,
        },
      },
    });
    return;
  }

  const { randomUUID } = await import('node:crypto');
  const id = randomUUID();
  await db.insert(decisionRules).values({
    id,
    code: 'DEFAULT',
    label: 'Ambang batas default',
    description: 'Aturan keputusan keamanan standar Sentinel Ops.',
    ...input,
    updatedBy: input.actor.id,
  });
}

export { scanLogs, profiles };
