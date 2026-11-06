import type { Metadata } from 'next';
import { requirePageAccess } from '@/server/auth/guard';
import { listPortalAssets } from '@/server/services/portal';
import { PageHeader } from '@/components/layout/page-header';
import { ReportForm } from './report-form';

export const metadata: Metadata = { title: 'Laporkan Masalah' };

export default async function ReportPage() {
  const user = await requirePageAccess('/portal/lapor');
  const assets = await listPortalAssets(user.id);

  return (
    <>
      <PageHeader
        title="Laporkan Masalah"
        description="Laporan Anda langsung membuat tiket dengan tenggat SLA. Tim akan merespons sesuai tingkat keparahan yang ditetapkan setelah triase."
      />

      {assets.length === 0 ? (
        <p className="rounded-md border border-border-subtle bg-surface-raised p-4 text-[13px] text-text-muted">
          Belum ada aset web terdaftar untuk organisasi Anda. Hubungi tim Sentinel Ops untuk
          menambahkan aset terlebih dahulu.
        </p>
      ) : (
        <ReportForm
          assets={assets.map((a) => ({ id: a.id, name: a.name, domainUrl: a.domainUrl }))}
        />
      )}
    </>
  );
}
