import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq, sql } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { can, VAULT_REVEAL_ROLES } from '@/server/rbac';
import { db } from '@/server/db';
import { incidents, profiles } from '@/server/db/schema';
import { getAssetById } from '@/server/services/assets';
import { listAssetScans } from '@/server/services/scannerEngine';
import { listVaultEntries } from '@/server/services/vault';
import { evaluateSlaPure } from '@/lib/slaMath';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Badge,
  HealthBadge,
  IncidentStatusBadge,
  PlatformBadge,
  SeverityBadge,
} from '@/components/ui/badge';
import { SlaCountdown } from '@/components/ui/sla-countdown';
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
import { RunScanButton } from './run-scan-button';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Detail Aset' };

const ROTATION_DAYS = 90;

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageAccess('/assets');
  const { id } = await params;

  const data = await getAssetById(id);
  if (!data) notFound();

  const { asset, client } = data;

  const [scans, creds, assetIncidents] = await Promise.all([
    listAssetScans(id, 20),
    listVaultEntries({ assetId: id }),
    db
      .select({
        id: incidents.id,
        ticketNumber: incidents.ticketNumber,
        title: incidents.title,
        severity: incidents.severity,
        status: incidents.status,
        createdAt: incidents.createdAt,
        slaResolutionDueAt: incidents.slaResolutionDueAt,
        resolvedAt: incidents.resolvedAt,
        assigneeName: profiles.fullName,
      })
      .from(incidents)
      .leftJoin(profiles, eq(incidents.assignedTo, profiles.id))
      .where(eq(incidents.assetId, id))
      .orderBy(desc(incidents.createdAt))
      .limit(20),
  ]);

  const activeIncidents = assetIncidents.filter((i) =>
    ['OPEN', 'INVESTIGATING', 'CONTAINED'].includes(i.status),
  ).length;

  const sslDays = asset.sslDaysRemaining;
  const sslDanger = sslDays !== null && sslDays <= 14;
  const canSeeVault = can(user, VAULT_REVEAL_ROLES);
  const staleCreds = creds.filter((c) => (c.ageDays ?? 0) > ROTATION_DAYS).length;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: 'Inventaris Aset', href: '/assets' },
          { label: asset.name },
        ]}
        title={asset.name}
        description={[
          asset.domainUrl.replace(/^https?:\/\//, ''),
          asset.platformVersion ?? asset.platform,
          asset.hostingProvider,
          asset.serverIp,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <HealthBadge status={asset.healthStatus} />
            <PlatformBadge platform={asset.platform} />
            <Link
              href={`/reports/asset/${asset.id}`}
              className="rounded-sm border border-border-subtle px-2 py-1 text-[11.5px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              Laporan A4
            </Link>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Status kesehatan" tone={asset.healthStatus === 'HEALTHY' ? 'healthy' : asset.healthStatus === 'WARNING' ? 'warning' : 'critical'}>
          <HealthBadge status={asset.healthStatus} />
        </Kpi>
        <Kpi label="Uptime 30 hari">
          <span className="numeric text-[20px] font-semibold leading-none text-text-primary">
            {asset.uptimePct30d}
            <span className="text-[13px] font-medium opacity-70">%</span>
          </span>
        </Kpi>
        <Kpi label="Sisa SSL" tone={sslDanger ? 'critical' : sslDays === null ? 'neutral' : 'healthy'}>
          <span
            className={cn(
              'numeric text-[20px] font-semibold leading-none',
              sslDanger ? 'text-status-critical' : 'text-text-primary',
            )}
          >
            {sslDays !== null ? sslDays : '—'}
            {sslDays !== null ? <span className="text-[13px] font-medium opacity-70"> hari</span> : null}
          </span>
        </Kpi>
        <Kpi label="Insiden aktif" tone={activeIncidents > 0 ? 'warning' : 'neutral'}>
          <span
            className={cn(
              'numeric text-[20px] font-semibold leading-none',
              activeIncidents > 0 ? 'text-status-warning' : 'text-text-primary',
            )}
          >
            {activeIncidents}
          </span>
        </Kpi>
        <Kpi label="Terakhir dipindai">
          <span className="numeric text-[12.5px] text-text-secondary">
            {asset.lastScanAt ? formatDate(asset.lastScanAt) : 'Belum pernah'}
          </span>
        </Kpi>
      </div>

      {/* Scan */}
      <Card padding="lg" className="mb-6">
        <CardHeader className="mb-3">
          <div>
            <CardTitle>Jalankan Pemindaian Sekarang</CardTitle>
            <p className="mt-1 text-[12.5px] text-text-secondary">
              Pemindaian manual diproses langsung dan memperbarui status kesehatan aset.
            </p>
          </div>
        </CardHeader>
        <RunScanButton assetId={asset.id} />
      </Card>

      {/* Scan history */}
      <Card padding="none" className="mb-6 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <CardTitle>Riwayat Pemindaian</CardTitle>
          <span className="numeric text-[11.5px] text-text-muted">{scans.length} entri</span>
        </div>
        <TableWrap className="rounded-none border-0">
          <Table>
            <THead>
              <TR>
                <TH>Waktu</TH>
                <TH>Mode</TH>
                <TH className="text-right">HTTP</TH>
                <TH className="text-right">Respons</TH>
                <TH className="text-center">SSL</TH>
                <TH className="text-right">Temuan</TH>
                <TH>Ringkasan</TH>
              </TR>
            </THead>
            <TBody>
              {scans.length === 0 ? (
                <TableEmpty colSpan={7}>Belum ada pemindaian untuk aset ini.</TableEmpty>
              ) : (
                scans.map((s) => (
                  <TR key={s.id}>
                    <TDMuted className="numeric whitespace-nowrap text-[11.5px]">
                      {formatDate(s.scannedAt)}
                    </TDMuted>
                    <TD>
                      <Badge tone={s.scanMode === 'LIVE' ? 'info' : 'neutral'} size="sm">
                        {s.scanMode === 'LIVE' ? 'Live' : 'Simulasi'}
                      </Badge>
                    </TD>
                    <TDNum className={s.httpStatus && s.httpStatus >= 500 ? 'text-status-critical' : undefined}>
                      {s.httpStatus ?? '—'}
                    </TDNum>
                    <TDNum className="text-text-secondary">
                      {s.responseTimeMs !== null ? `${s.responseTimeMs}` : '—'}
                    </TDNum>
                    <TD className="text-center">
                      <span
                        className={
                          s.sslValid ? 'text-status-healthy' : 'text-status-critical'
                        }
                      >
                        {s.sslValid ? 'Valid' : 'Tidak valid'}
                      </span>
                    </TD>
                    <TDNum
                      className={
                        s.threatsDetected > 0
                          ? 'font-medium text-status-critical'
                          : 'text-status-healthy'
                      }
                    >
                      {s.threatsDetected}
                    </TDNum>
                    <TDMuted className="max-w-[280px] truncate text-[11.5px]">
                      {s.summary ?? '—'}
                    </TDMuted>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableWrap>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Credentials */}
        <Card padding="lg">
          <CardHeader className="mb-3">
            <div>
              <CardTitle>Kredensial Terkait</CardTitle>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                {creds.length} kredensial tersimpan untuk aset ini.
              </p>
            </div>
            {staleCreds > 0 ? (
              <Badge tone="warning" size="sm">
                {staleCreds} usang
              </Badge>
            ) : null}
          </CardHeader>

          {creds.length === 0 ? (
            <p className="py-4 text-[12.5px] text-text-muted">
              Belum ada kredensial tercatat untuk aset ini.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {creds.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-text-primary">
                      {c.label}
                    </p>
                    <p className="numeric truncate text-[11px] text-text-muted">{c.username}</p>
                  </div>
                  <span
                    className={cn(
                      'numeric shrink-0 text-[11.5px]',
                      (c.ageDays ?? 0) > ROTATION_DAYS
                        ? 'text-status-warning'
                        : 'text-text-muted',
                    )}
                  >
                    {c.ageDays !== null ? `${c.ageDays} hari` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 border-t border-border-subtle pt-3">
            {canSeeVault ? (
              <Link
                href="/vault"
                className="text-[12.5px] font-medium text-accent hover:underline"
              >
                Buka di Brankas →
              </Link>
            ) : (
              <p className="text-[11.5px] text-text-muted">
                Isi sandi hanya dapat dibuka oleh SecOps Engineer dan Super Admin. Hubungi mereka
                bila memerlukan akses.
              </p>
            )}
          </div>
        </Card>

        {/* Incidents */}
        <Card padding="lg">
          <CardHeader className="mb-3">
            <div>
              <CardTitle>Riwayat Insiden</CardTitle>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                {assetIncidents.length} tiket tercatat untuk aset ini.
              </p>
            </div>
          </CardHeader>

          {assetIncidents.length === 0 ? (
            <p className="py-4 text-[12.5px] text-text-muted">
              Tidak ada insiden tercatat. Aset ini belum pernah memiliki tiket.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {assetIncidents.map((i) => {
                const sla = evaluateSlaPure({
                  createdAt: i.createdAt,
                  severity: i.severity,
                  resolutionDueAt: i.slaResolutionDueAt,
                  status: i.status,
                  resolvedAt: i.resolvedAt,
                });
                return (
                  <li key={i.id} className="min-w-0 py-2.5">
                    <Link href={`/incidents/${i.id}`} className="group block min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5">
                            <span className="numeric text-[11px] text-text-muted">
                              {i.ticketNumber}
                            </span>
                            <SeverityBadge severity={i.severity} />
                            <IncidentStatusBadge status={i.status} />
                          </p>
                          <p className="mt-0.5 truncate text-[12.5px] text-text-primary group-hover:text-accent">
                            {i.title}
                          </p>
                          <p className="truncate text-[11px] text-text-muted">
                            {i.assigneeName ?? 'Belum ditugaskan'}
                          </p>
                        </div>
                        <SlaCountdown
                          dueAt={i.slaResolutionDueAt?.toISOString() ?? null}
                          createdAt={i.createdAt.toISOString()}
                          state={sla.state}
                          initialLabel={sla.remainingLabel}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Asset metadata */}
      <Card padding="lg" className="mt-6">
        <CardHeader className="mb-3">
          <CardTitle>Data Aset</CardTitle>
        </CardHeader>
        <dl className="grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
          <MetaRow label="Klien" value={client?.organizationName ?? client?.fullName ?? '—'} />
          <MetaRow label="Platform" value={asset.platformVersion ?? asset.platform} />
          <MetaRow label="Server IP" value={asset.serverIp ?? '—'} />
          <MetaRow label="Hosting" value={asset.hostingProvider ?? '—'} />
          <MetaRow
            label="SSL berlaku sampai"
            value={asset.sslExpiryDate ? formatDate(asset.sslExpiryDate) : '—'}
          />
          <MetaRow label="Dibuat" value={formatDate(asset.createdAt)} />
          <MetaRow
            label="Hash DOM baseline"
            value={asset.baselineDomHash ? `${asset.baselineDomHash.slice(0, 24)}…` : 'Belum ditetapkan'}
            mono
          />
          <MetaRow label="Versi data" value={`v${asset.version}`} mono />
        </dl>
      </Card>
    </>
  );
}

function Kpi({
  label,
  children,
  tone = 'neutral',
}: {
  label: string;
  children: React.ReactNode;
  tone?: 'neutral' | 'healthy' | 'warning' | 'critical';
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-border-subtle bg-surface-raised p-3.5',
        tone === 'critical' && 'border-l-[3px] border-l-status-critical',
      )}
    >
      <p className="label-xs">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-border-subtle pb-1.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className={cn('truncate text-right', mono ? 'numeric text-text-secondary' : 'text-text-primary')}>
        {value}
      </dd>
    </div>
  );
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}
