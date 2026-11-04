import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { requirePageAccess } from '@/server/auth/guard';
import { listPortalAssets, listClientIncidents } from '@/server/services/portal';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, HealthBadge, IncidentStatusBadge, PlatformBadge, SeverityBadge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Portal Klien' };

export default async function PortalPage() {
  const user = await requirePageAccess('/portal');

  const [assets, incidents] = await Promise.all([
    listPortalAssets(user.id),
    listClientIncidents(user.id),
  ]);

  const healthy = assets.filter((a) => a.healthStatus === 'HEALTHY').length;
  const openTickets = incidents.filter((i) =>
    ['OPEN', 'INVESTIGATING', 'CONTAINED'].includes(i.status),
  ).length;

  return (
    <>
      <PageHeader
        title="Portal Klien"
        description={`Kesehatan aset web milik ${user.organizationName ?? user.fullName}. Uptime dihitung dari riwayat pemindaian 30 hari terakhir.`}
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Tile label="Aset terkelola" value={assets.length} tone="neutral" />
        <Tile label="Sehat" value={healthy} tone="healthy" />
        <Tile
          label="Tiket aktif"
          value={openTickets}
          tone={openTickets > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {/* Assets */}
      <section className="mb-6" aria-labelledby="portal-assets">
        <Card padding="lg">
          <CardHeader className="mb-3">
            <CardTitle id="portal-assets">Aset Web Anda</CardTitle>
            <Badge tone="neutral" size="sm">
              {assets.length}
            </Badge>
          </CardHeader>

          {assets.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text-muted">
              Belum ada aset web terdaftar untuk organisasi Anda.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {assets.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13.5px] font-medium text-text-primary">
                          {a.name}
                        </span>
                        <PlatformBadge platform={a.platform} />
                      </div>
                      <p className="numeric truncate text-[11.5px] text-text-muted">
                        {a.domainUrl.replace(/^https?:\/\//, '')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Metric label="Uptime 30h" value={`${a.uptimePct30d}%`} />
                      <Metric
                        label="Sisa SSL"
                        value={a.sslDaysRemaining !== null ? `${a.sslDaysRemaining} hari` : '—'}
                        danger={a.sslDaysRemaining !== null && a.sslDaysRemaining <= 14}
                      />
                      <HealthBadge status={a.healthStatus} />
                    </div>
                  </div>

                  {a.lastIncidentTicketNumber ? (
                    <p className="mt-1 text-[11.5px] text-text-muted">
                      Tiket terakhir:{' '}
                      <span className="numeric text-text-secondary">
                        {a.lastIncidentTicketNumber}
                      </span>
                      {a.lastIncidentStatus ? ` · ${statusLabel(a.lastIncidentStatus)}` : ''}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Incidents */}
      <section aria-labelledby="portal-incidents">
        <Card padding="lg">
          <CardHeader className="mb-3">
            <div>
              <CardTitle id="portal-incidents">Tiket Bantuan</CardTitle>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                Progres penanganan insiden. Catatan internal teknisi tidak ditampilkan di sini.
              </p>
            </div>
            <Link
              href="/portal/lapor"
              className="text-[12.5px] font-medium text-accent hover:underline"
            >
              Laporkan masalah
            </Link>
          </CardHeader>

          {incidents.length === 0 ? (
            <p className="flex items-center gap-2 py-6 text-[13px] text-text-muted">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-status-healthy" />
              Tidak ada tiket bantuan. Semua aset berjalan normal.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {incidents.map((i) => (
                <li key={i.ticketNumber} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="numeric text-[11.5px] text-text-muted">
                          {i.ticketNumber}
                        </span>
                        <SeverityBadge severity={i.severity} />
                        <IncidentStatusBadge status={i.status} />
                      </p>
                      <span className="mt-0.5 block text-[13px] text-text-primary">
                        {i.title}
                      </span>
                      <p className="truncate text-[11.5px] text-text-muted">{i.assetName}</p>
                    </div>
                    <span className="numeric shrink-0 text-[11px] text-text-muted">
                      {formatDate(i.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    OPEN: 'terbuka',
    INVESTIGATING: 'sedang ditangani',
    CONTAINED: 'terkendali',
    RESOLVED: 'selesai',
    CLOSED: 'ditutup',
  };
  return map[s] ?? s.toLowerCase();
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="text-right">
      <p className="text-[10.5px] uppercase tracking-[0.06em] text-text-muted">{label}</p>
      <p className={cn('numeric text-[13px]', danger ? 'text-status-critical' : 'text-text-primary')}>
        {value}
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'warning' | 'healthy';
}) {
  return (
    <Card padding="sm">
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          'numeric mt-1 text-[22px] font-semibold leading-none',
          tone === 'warning'
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
