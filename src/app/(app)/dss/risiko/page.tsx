import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { db } from '@/server/db';
import { webAssets, incidents, credentialVaults } from '@/server/db/schema';
import { loadThresholds } from '@/server/services/dssEngine';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, HealthBadge, PlatformBadge } from '@/components/ui/badge';
import {
  Table,
  TableEmpty,
  TableWrap,
  TBody,
  TD,
  TDMuted,
  TDNum,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Matriks Risiko' };

export default async function DssRiskPage() {
  await requirePageAccess('/dss');
  const thresholds = await loadThresholds();

  // Asset vulnerability matrix: one row per asset with the three risk drivers.
  const assets = await db
    .select({
      id: webAssets.id,
      name: webAssets.name,
      domainUrl: webAssets.domainUrl,
      platform: webAssets.platform,
      platformVersion: webAssets.platformVersion,
      healthStatus: webAssets.healthStatus,
      sslDaysRemaining: webAssets.sslDaysRemaining,
      uptimePct30d: webAssets.uptimePct30d,
      infections30d: sql<number>`(
        SELECT count(*)::int FROM incidents
        WHERE incidents.asset_id = ${webAssets.id}
          AND incidents.created_at >= now() - make_interval(days => ${thresholds.repeatInfectionWindowDays})
          AND incidents.category IN ('SLOT_DEFACEMENT','MALWARE_BACKDOOR','SQL_INJECTION','BRUTE_FORCE')
      )`,
      staleCreds: sql<number>`(
        SELECT count(*)::int FROM credential_vaults
        WHERE credential_vaults.asset_id = ${webAssets.id}
          AND COALESCE(credential_vaults.last_rotated_at, credential_vaults.created_at)
              <= now() - make_interval(days => ${thresholds.credentialRotationDays})
      )`,
    })
    .from(webAssets)
    .orderBy(
      sql`CASE ${webAssets.healthStatus}
            WHEN 'COMPROMISED' THEN 0 WHEN 'DOWN' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END`,
      webAssets.name,
    );

  const rotationCandidates = await db
    .select({
      id: credentialVaults.id,
      label: credentialVaults.label,
      category: credentialVaults.category,
      assetId: webAssets.id,
      assetName: webAssets.name,
      ageDays: sql<number>`extract(day FROM now() - COALESCE(${credentialVaults.lastRotatedAt}, ${credentialVaults.createdAt}))::int`,
      compromised: sql<boolean>`EXISTS (
        SELECT 1 FROM incidents
        WHERE incidents.asset_id = ${credentialVaults.assetId}
          AND incidents.status IN ('OPEN','INVESTIGATING','CONTAINED')
          AND incidents.category IN ('SLOT_DEFACEMENT','MALWARE_BACKDOOR','SQL_INJECTION')
      )`,
    })
    .from(credentialVaults)
    .innerJoin(webAssets, eq(credentialVaults.assetId, webAssets.id))
    .where(
      sql`COALESCE(${credentialVaults.lastRotatedAt}, ${credentialVaults.createdAt})
            <= now() - make_interval(days => ${thresholds.credentialRotationDays})
          OR EXISTS (
            SELECT 1 FROM incidents
            WHERE incidents.asset_id = ${credentialVaults.assetId}
              AND incidents.status IN ('OPEN','INVESTIGATING','CONTAINED')
              AND incidents.category IN ('SLOT_DEFACEMENT','MALWARE_BACKDOOR','SQL_INJECTION')
          )`,
    )
    .orderBy(
      sql`CASE WHEN EXISTS (
        SELECT 1 FROM incidents WHERE incidents.asset_id = ${credentialVaults.assetId}
          AND incidents.status IN ('OPEN','INVESTIGATING','CONTAINED')
      ) THEN 0 ELSE 1 END`,
      sql`COALESCE(${credentialVaults.lastRotatedAt}, ${credentialVaults.createdAt}) ASC`,
    );

  const sslRisk = assets.filter(
    (a) => a.sslDaysRemaining !== null && a.sslDaysRemaining <= thresholds.sslWarnDays,
  ).length;
  const chronic = assets.filter((a) => a.infections30d >= thresholds.repeatInfectionThreshold).length;

  return (
    <>
      <PageHeader
        title="Matriks Kerentanan Aset"
        description={`Tiga pemicu risiko dihitung per aset: status kesehatan, sisa SSL (ambang ${thresholds.sslWarnDays} hari), infeksi berulang (${thresholds.repeatInfectionThreshold}× dalam ${thresholds.repeatInfectionWindowDays} hari), dan kredensial yang lewat ${thresholds.credentialRotationDays} hari tanpa rotasi.`}
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Tile label="SSL mendekati batas" value={sslRisk} tone={sslRisk > 0 ? 'warning' : 'healthy'} />
        <Tile label="Infeksi berulang" value={chronic} tone={chronic > 0 ? 'critical' : 'healthy'} />
        <Tile
          label="Kredensial perlu rotasi"
          value={rotationCandidates.length}
          tone={rotationCandidates.length > 0 ? 'warning' : 'healthy'}
        />
      </div>

      <Card padding="none" className="mb-6 overflow-hidden">
        <div className="border-b border-border-subtle px-4 py-3">
          <CardTitle>Matriks per Aset</CardTitle>
        </div>
        <TableWrap className="rounded-none border-0">
          <Table>
            <THead>
              <TR>
                <TH>Aset</TH>
                <TH>Platform</TH>
                <TH>Kesehatan</TH>
                <TH className="text-right">Sisa SSL</TH>
                <TH className="text-right">Infeksi</TH>
                <TH className="text-right">Kredensial usang</TH>
                <TH className="text-right">Uptime 30h</TH>
                <TH>Tingkat Risiko</TH>
              </TR>
            </THead>
            <TBody>
              {assets.length === 0 ? (
                <TableEmpty colSpan={8}>Belum ada aset.</TableEmpty>
              ) : (
                assets.map((a) => {
                  const risk = riskLevel(a, thresholds);
                  return (
                    <TR key={a.id}>
                      <TD>
                        <Link
                          href={`/assets/${a.id}`}
                          className="font-medium text-text-primary hover:text-accent hover:underline"
                        >
                          {a.name}
                        </Link>
                      </TD>
                      <TD>
                        <PlatformBadge platform={a.platform} />
                      </TD>
                      <TD>
                        <HealthBadge status={a.healthStatus} />
                      </TD>
                      <TDNum
                        className={
                          a.sslDaysRemaining !== null && a.sslDaysRemaining <= thresholds.sslWarnDays
                            ? 'text-status-critical font-medium'
                            : undefined
                        }
                      >
                        {a.sslDaysRemaining ?? '—'}
                      </TDNum>
                      <TDNum
                        className={
                          a.infections30d >= thresholds.repeatInfectionThreshold
                            ? 'text-status-critical font-medium'
                            : a.infections30d > 0
                              ? 'text-status-warning'
                              : 'text-text-muted'
                        }
                      >
                        {a.infections30d}
                      </TDNum>
                      <TDNum className={a.staleCreds > 0 ? 'text-status-warning' : 'text-text-muted'}>
                        {a.staleCreds}
                      </TDNum>
                      <TDNum>{a.uptimePct30d}%</TDNum>
                      <TD>
                        <Badge tone={risk.tone} size="sm">
                          {risk.label}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </TableWrap>
      </Card>

      <Card padding="lg">
        <CardHeader className="mb-3">
          <div>
            <CardTitle>Kredensial Menunggu Rotasi</CardTitle>
            <p className="mt-1 text-[12.5px] text-text-secondary">
              Belum dirotasi melebihi ambang, atau berada pada aset yang sedang terkena insiden
              keamanan.
            </p>
          </div>
          <Link href="/vault" className="text-[12.5px] font-medium text-accent hover:underline">
            Buka brankas
          </Link>
        </CardHeader>

        {rotationCandidates.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-text-muted">
            Semua kredensial berada dalam siklus rotasi aman.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rotationCandidates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-text-primary">
                      {c.label}
                    </span>
                    {c.compromised ? (
                      <Badge tone="critical" size="sm">
                        Aset insiden
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-[11.5px] text-text-muted">{c.assetName}</p>
                </div>
                <span
                  className={cn(
                    'numeric shrink-0 text-[12px]',
                    c.compromised ? 'text-status-critical' : 'text-status-warning',
                  )}
                >
                  {c.ageDays} hari
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function riskLevel(
  a: {
    healthStatus: string;
    sslDaysRemaining: number | null;
    infections30d: number;
    staleCreds: number;
  },
  t: { sslWarnDays: number; repeatInfectionThreshold: number },
): { label: string; tone: 'critical' | 'warning' | 'info' | 'healthy' } {
  let score = 0;
  if (a.healthStatus === 'COMPROMISED' || a.healthStatus === 'DOWN') score += 3;
  if (a.healthStatus === 'WARNING') score += 1;
  if (a.sslDaysRemaining !== null && a.sslDaysRemaining <= t.sslWarnDays) score += 2;
  if (a.sslDaysRemaining !== null && a.sslDaysRemaining <= 3) score += 2;
  if (a.infections30d >= t.repeatInfectionThreshold) score += 3;
  else if (a.infections30d > 0) score += 1;
  if (a.staleCreds > 0) score += 1;

  if (score >= 5) return { label: 'Kritis', tone: 'critical' };
  if (score >= 3) return { label: 'Tinggi', tone: 'warning' };
  if (score >= 1) return { label: 'Sedang', tone: 'info' };
  return { label: 'Rendah', tone: 'healthy' };
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'warning' | 'critical' | 'healthy';
}) {
  return (
    <Card padding="sm">
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          'numeric mt-1 text-[22px] font-semibold leading-none',
          tone === 'critical'
            ? 'text-status-critical'
            : tone === 'warning'
              ? 'text-status-warning'
              : tone === 'healthy'
                ? 'text-status-healthy'
                : 'text-text-primary',
        )}
      >
        {value}
      </p>
    </Card>
  );
}
