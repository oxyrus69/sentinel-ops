import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageAccess } from '@/server/auth/guard';
import { listRunbooks } from '@/server/services/runbooks';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Clock, ListChecks, TicketCheck } from 'lucide-react';

export const metadata: Metadata = { title: 'Runbook & SOP' };

const CATEGORY_LABEL: Record<string, string> = {
  SQL_INJECTION: 'SQL Injection',
  SLOT_DEFACEMENT: 'Defacement Slot',
  MALWARE_BACKDOOR: 'Backdoor Malware',
  SSL_EXPIRED: 'SSL Kedaluwarsa',
  SERVER_DOWN: 'Server Mati',
  BRUTE_FORCE: 'Brute Force',
  CONFIGURATION_ERROR: 'Kesalahan Konfigurasi',
};

export default async function RunbooksPage() {
  await requirePageAccess('/runbooks');

  const runbooks = await listRunbooks({ activeOnly: true });

  return (
    <>
      <PageHeader
        title="Runbook & SOP"
        description="Template prosedur mitigasi yang dapat dilampirkan ke tiket. Setiap langkah menjadi daftar periksa yang dicentang teknisi di ruang kerja insiden."
      />

      {runbooks.length === 0 ? (
        <Card padding="lg">
          <p className="flex items-center gap-2 py-4 text-[13px] text-text-muted">
            <BookOpen aria-hidden="true" className="h-4 w-4" />
            Belum ada template runbook aktif.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {runbooks.map(({ runbook, stepCount, usageCount }) => (
            <li key={runbook.id}>
              <Link href={`/runbooks/${runbook.id}`} className="block h-full">
                <Card
                  padding="lg"
                  className="h-full transition-colors duration-fast hover:border-border-strong"
                >
                  <CardHeader className="mb-2">
                    <CardTitle className="text-[14px] leading-snug">{runbook.title}</CardTitle>
                    <Badge tone="neutral" size="sm">
                      {CATEGORY_LABEL[runbook.category] ?? runbook.category}
                    </Badge>
                  </CardHeader>

                  {runbook.summary ? (
                    <p className="text-[12.5px] leading-relaxed text-text-secondary">
                      {runbook.summary}
                    </p>
                  ) : null}

                  <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text-muted">
                    <div className="flex items-center gap-1">
                      <ListChecks aria-hidden="true" className="h-3 w-3" />
                      <dt className="sr-only">Jumlah langkah</dt>
                      <dd className="numeric">{stepCount} langkah</dd>
                    </div>
                    {runbook.estimatedMinutes !== null ? (
                      <div className="flex items-center gap-1">
                        <Clock aria-hidden="true" className="h-3 w-3" />
                        <dt className="sr-only">Estimasi</dt>
                        <dd className="numeric">± {runbook.estimatedMinutes} menit</dd>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1">
                      <TicketCheck aria-hidden="true" className="h-3 w-3" />
                      <dt className="sr-only">Dipakai</dt>
                      <dd className="numeric">{usageCount} tiket</dd>
                    </div>
                  </dl>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
