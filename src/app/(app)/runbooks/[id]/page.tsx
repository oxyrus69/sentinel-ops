import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, ListChecks } from 'lucide-react';
import { requirePageAccess } from '@/server/auth/guard';
import { getRunbookById } from '@/server/services/runbooks';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const CATEGORY_LABEL: Record<string, string> = {
  SQL_INJECTION: 'SQL Injection',
  SLOT_DEFACEMENT: 'Defacement Slot',
  MALWARE_BACKDOOR: 'Backdoor Malware',
  SSL_EXPIRED: 'SSL Kedaluwarsa',
  SERVER_DOWN: 'Server Mati',
  BRUTE_FORCE: 'Brute Force',
  CONFIGURATION_ERROR: 'Kesalahan Konfigurasi',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const rb = await getRunbookById(id);
  return { title: rb ? rb.runbook.title : 'Runbook' };
}

export default async function RunbookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess('/runbooks');
  const { id } = await params;

  const data = await getRunbookById(id);
  if (!data) notFound();
  const { runbook: rb, steps } = data;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: 'Runbook & SOP', href: '/runbooks' },
          { label: rb.title },
        ]}
        title={rb.title}
        description={rb.summary ?? undefined}
        actions={<Badge tone="neutral">{CATEGORY_LABEL[rb.category] ?? rb.category}</Badge>}
      />

      <div className="mb-4 flex flex-wrap gap-4 text-[12px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="numeric">{steps.length} langkah</span>
        </span>
        {rb.estimatedMinutes !== null ? (
          <span className="flex items-center gap-1.5">
            <Clock aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="numeric">Estimasi {rb.estimatedMinutes} menit</span>
          </span>
        ) : null}
      </div>

      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Card padding="md">
              <div className="flex items-start gap-3">
                <span className="numeric mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-[11.5px] font-medium text-text-secondary">
                  {step.stepOrder}
                </span>
                <div className="min-w-0">
                  <CardHeader className="mb-1">
                    <CardTitle className="text-[13.5px] leading-snug">{step.title}</CardTitle>
                    {step.requiresEvidence ? (
                      <Badge tone="warning" size="sm">
                        Wajib bukti
                      </Badge>
                    ) : null}
                  </CardHeader>
                  {step.detail ? (
                    <p className="text-[12.5px] leading-relaxed text-text-secondary">
                      {step.detail}
                    </p>
                  ) : null}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-[12px] text-text-muted">
        Untuk memakai runbook ini, buka tiket insiden yang relevan lalu pilih runbook pada panel
        aksi.{' '}
        <Link href="/incidents" className="font-medium text-accent hover:underline">
          Buka antrean tiket
        </Link>
      </p>
    </>
  );
}
