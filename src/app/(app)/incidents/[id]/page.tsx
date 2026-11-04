import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { db } from '@/server/db';
import { profiles } from '@/server/db/schema';
import { getIncidentWorkspace, suggestRunbooks } from '@/server/services/incidentEngine';
import { evaluateSlaPure } from '@/lib/slaMath';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, IncidentStatusBadge, SeverityBadge } from '@/components/ui/badge';
import { SlaCountdown } from '@/components/ui/sla-countdown';
import { IncidentWorkspace } from './workspace';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getIncidentWorkspace(id);
  return { title: data ? `${data.incident.ticketNumber} — ${data.incident.title}` : 'Tiket' };
}

const CATEGORY_LABEL: Record<string, string> = {
  SQL_INJECTION: 'SQL Injection',
  SLOT_DEFACEMENT: 'Defacement Slot',
  MALWARE_BACKDOOR: 'Backdoor Malware',
  SSL_EXPIRED: 'SSL Kedaluwarsa',
  SERVER_DOWN: 'Server Mati',
  BRUTE_FORCE: 'Brute Force',
  CONFIGURATION_ERROR: 'Kesalahan Konfigurasi',
};

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess('/incidents');
  const { id } = await params;

  const data = await getIncidentWorkspace(id);
  if (!data) notFound();

  const { incident, asset, reporter, comments, tasks } = data;

  const sla = evaluateSlaPure({
    createdAt: incident.createdAt,
    severity: incident.severity,
    resolutionDueAt: incident.slaResolutionDueAt,
    status: incident.status,
    resolvedAt: incident.resolvedAt,
  });

  const [assignees, runbookOptions] = await Promise.all([
    db
      .select({ id: profiles.id, fullName: profiles.fullName, role: profiles.role })
      .from(profiles)
      .where(sql`${profiles.role} IN ('SUPER_ADMIN','SECOPS_ENGINEER','SUPPORT_AGENT')`),
    suggestRunbooks(incident.category),
  ]);

  const doneCount = tasks.filter((t) => t.task.isDone).length;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: 'Tiket Insiden', href: '/incidents' },
          { label: incident.ticketNumber },
        ]}
        title={incident.title}
        description={`${CATEGORY_LABEL[incident.category] ?? incident.category} · ${asset.name}`}
        actions={
          <div className="flex items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <IncidentStatusBadge status={incident.status} />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          <Card padding="lg">
            <CardHeader className="mb-3">
              <CardTitle>Deskripsi Masalah</CardTitle>
              <SlaCountdown
                dueAt={incident.slaResolutionDueAt?.toISOString() ?? null}
                createdAt={incident.createdAt.toISOString()}
                state={sla.state}
                initialLabel={sla.remainingLabel}
              />
            </CardHeader>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary">
              {incident.description}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border-subtle pt-3 text-[12.5px] sm:grid-cols-4">
              <Meta label="Dibuat" value={formatDate(incident.createdAt)} />
              <Meta label="Tenggat SLA" value={formatDate(incident.slaResolutionDueAt)} />
              <Meta label="Pelapor" value={reporter?.fullName ?? '—'} />
              <Meta
                label="Respons pertama"
                value={formatDate(incident.firstRespondedAt)}
              />
            </dl>
          </Card>

          {/* Runbook progress summary: the interactive checklist lives in the rail. */}
          {tasks.length > 0 ? (
            <Card padding="lg">
              <CardHeader className="mb-3">
                <div>
                  <CardTitle>Progres Mitigasi</CardTitle>
                  <p className="mt-1 text-[12.5px] text-text-secondary">
                    {doneCount} dari {tasks.length} langkah selesai. Centang di panel kanan.
                  </p>
                </div>
                <Badge tone={doneCount === tasks.length ? 'healthy' : 'neutral'}>
                  {Math.round((doneCount / tasks.length) * 100)}%
                </Badge>
              </CardHeader>

              {/* Progress bar: a real measure, not decoration. */}
              <div
                role="progressbar"
                aria-valuenow={doneCount}
                aria-valuemin={0}
                aria-valuemax={tasks.length}
                aria-label="Langkah mitigasi selesai"
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-base ease-standard"
                  style={{ width: `${(doneCount / tasks.length) * 100}%` }}
                />
              </div>

              <ul className="mt-4 space-y-1.5">
                {tasks.map(({ task, step, runbook }) => (
                  <li
                    key={task.id}
                    className="flex items-start gap-2.5 rounded-sm px-1 py-1"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        task.isDone
                          ? 'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-status-healthy'
                          : 'mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border border-border-strong'
                      }
                    >
                      {task.isDone ? (
                        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-text-inverse" fill="none">
                          <path
                            d="M2.5 6.5 4.5 8.5 9.5 3.5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={
                          task.isDone
                            ? 'block text-[13px] text-text-muted line-through'
                            : 'block text-[13px] text-text-primary'
                        }
                      >
                        {step.stepOrder}. {step.title}
                      </span>
                      {step.detail ? (
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-text-secondary">
                          {step.detail}
                        </span>
                      ) : null}
                      {task.doneAt ? (
                        <span className="mt-0.5 block text-[11px] text-text-muted">
                          Selesai {formatDate(task.doneAt)}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-[11px] text-text-muted">
                        {runbook.title}
                        {step.requiresEvidence ? ' · wajib bukti' : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card padding="lg">
              <CardHeader className="mb-2">
                <CardTitle>Langkah Mitigasi</CardTitle>
              </CardHeader>
              <p className="text-[13px] text-text-secondary">
                Belum ada runbook terlampir. Pilih template yang sesuai di panel kanan untuk
                memunculkan daftar periksa.
              </p>
            </Card>
          )}

          {/* Discussion */}
          <Card padding="lg">
            <CardHeader className="mb-3">
              <CardTitle>Diskusi Tiket</CardTitle>
              <Badge tone="neutral">{comments.length} pesan</Badge>
            </CardHeader>

            {comments.length === 0 ? (
              <p className="py-4 text-[13px] text-text-muted">Belum ada diskusi pada tiket ini.</p>
            ) : (
              <ul className="space-y-3">
                {[...comments].reverse().map(({ comment, author }) => (
                  <li
                    key={comment.id}
                    className={
                      comment.isInternal
                        ? 'rounded-sm border border-status-warning/30 bg-status-warning/5 p-3'
                        : 'rounded-sm border border-border-subtle bg-surface-sunken p-3'
                    }
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-medium text-text-primary">
                        {author?.fullName ?? 'Pengguna dihapus'}
                      </span>
                      {comment.isInternal ? (
                        <Badge tone="warning" size="sm">
                          Catatan internal
                        </Badge>
                      ) : (
                        <Badge tone="info" size="sm">
                          Terlihat klien
                        </Badge>
                      )}
                      <span className="numeric ml-auto text-[11px] text-text-muted">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary">
                      {comment.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* RCA when resolved */}
          {incident.rootCauseSummary ? (
            <Card padding="lg" tone="healthy">
              <CardHeader className="mb-2">
                <CardTitle>Root Cause Analysis</CardTitle>
              </CardHeader>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary">
                {incident.rootCauseSummary}
              </p>
              {incident.remediationSteps ? (
                <>
                  <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
                    Langkah remediasi
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary">
                    {incident.remediationSteps}
                  </p>
                </>
              ) : null}
              <Link
                href={`/reports/incident/${incident.id}`}
                className="mt-3 inline-block text-[12.5px] font-medium text-accent hover:underline"
              >
                Buka dokumen postmortem (A4)
              </Link>
            </Card>
          ) : null}
        </div>

        {/* Action rail */}
        <div className="min-w-0 space-y-4">
          <IncidentWorkspace
            incidentId={incident.id}
            currentStatus={incident.status}
            version={incident.version}
            runbookOptions={runbookOptions.map((r) => ({
              id: r.id,
              title: r.title,
              category: r.category,
            }))}
            hasRunbook={tasks.length > 0}
            tasks={tasks.map(({ task, step }) => ({
              id: task.id,
              isDone: task.isDone,
              label: `${step.stepOrder}. ${step.title}`,
            }))}
            assignees={assignees.map((a) => ({ id: a.id, name: a.fullName, role: a.role }))}
            assignedTo={incident.assignedTo}
          />

          <Card padding="md">
            <CardTitle className="mb-2 text-[13px]">Aset Terkait</CardTitle>
            <Link
              href={`/assets/${asset.id}`}
              className="block text-[13px] font-medium text-text-primary hover:text-accent hover:underline"
            >
              {asset.name}
            </Link>
            <p className="numeric text-[11.5px] text-text-muted">
              {asset.domainUrl.replace(/^https?:\/\//, '')}
            </p>
            <p className="mt-1.5 text-[12px] text-text-secondary">
              {asset.platformVersion ?? asset.platform}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.06em] text-text-muted">{label}</dt>
      <dd className="numeric mt-0.5 text-text-primary">{value}</dd>
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
