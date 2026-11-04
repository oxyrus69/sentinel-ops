import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePageAccess } from '@/server/auth/guard';
import { getAssetById } from '@/server/services/assets';
import { listAssetScans } from '@/server/services/scannerEngine';
import { PrintToolbar } from '../../print-toolbar';

export const metadata: Metadata = { title: 'Laporan Audit Aset' };

const PLATFORM_LABEL: Record<string, string> = {
  OJS_3: 'Open Journal Systems 3',
  WORDPRESS: 'WordPress',
  LARAVEL: 'Laravel',
  NODE_SSR: 'Node.js SSR',
  STATIC_WEB: 'Situs Statis',
  CUSTOM_PHP: 'PHP Kustom',
};

const HEALTH_LABEL: Record<string, string> = {
  HEALTHY: 'Sehat',
  WARNING: 'Peringatan',
  COMPROMISED: 'Terkompromi',
  DOWN: 'Mati',
  MAINTENANCE: 'Pemeliharaan',
};

export default async function AssetReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess('/admin');
  const { id } = await params;

  const data = await getAssetById(id);
  if (!data) notFound();

  const scans = await listAssetScans(id, 20);
  const { asset } = data;

  const totalScans = scans.length;
  const cleanScans = scans.filter((s) => s.threatsDetected === 0).length;
  const threatsFound = scans.reduce((sum, s) => sum + s.threatsDetected, 0);
  const avgResponse =
    totalScans > 0
      ? Math.round(
          scans.reduce((sum, s) => sum + (s.responseTimeMs ?? 0), 0) / totalScans,
        )
      : 0;

  const period = new Date().toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });

  return (
    <article>
      <PrintToolbar title="Laporan Audit Keamanan Aset" />

      {/* Letterhead */}
      <header className="mb-6 border-b-2 border-black pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Sentinel Ops · Laporan Audit Keamanan
            </p>
            <h1 className="mt-1 text-[22px] font-bold leading-tight text-black">
              {asset.name}
            </h1>
            <p className="mt-1 text-[11px] text-neutral-600">
              {asset.domainUrl.replace(/^https?:\/\//, '')} · {PLATFORM_LABEL[asset.platform] ?? asset.platform}
              {asset.platformVersion ? ` ${asset.platformVersion}` : ''}
            </p>
          </div>
          <div className="shrink-0 text-right text-[10px] text-neutral-600">
            <p className="font-semibold text-black">Periode {period}</p>
            <p className="mt-0.5">
              Dicetak {new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}
            </p>
          </div>
        </div>
      </header>

      {/* Summary */}
      <section className="print-avoid-break mb-5">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-black">
          Ringkasan Kondisi
        </h2>
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            <Row label="Status kesehatan" value={HEALTH_LABEL[asset.healthStatus] ?? asset.healthStatus} strong />
            <Row label="Uptime 30 hari" value={`${asset.uptimePct30d}%`} />
            <Row
              label="Sisa masa berlaku SSL"
              value={asset.sslDaysRemaining !== null ? `${asset.sslDaysRemaining} hari` : 'Tidak tercatat'}
            />
            <Row label="Hosting" value={asset.hostingProvider ?? 'Tidak tercatat'} />
            <Row label="Alamat IP server" value={asset.serverIp ?? 'Tidak tercatat'} />
            <Row label="Pemindaian terakhir" value={formatDate(asset.lastScanAt)} />
          </tbody>
        </table>
      </section>

      {/* Scan statistics */}
      <section className="print-avoid-break mb-5">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-black">
          Statistik Pemindaian
        </h2>
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Total pemindaian" value={String(totalScans)} />
          <Stat label="Tanpa temuan" value={String(cleanScans)} />
          <Stat label="Temuan tercatat" value={String(threatsFound)} />
          <Stat label="Respons rata-rata" value={`${avgResponse} ms`} />
        </div>
      </section>

      {/* Scan history */}
      <section className="mb-5">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-black">
          Riwayat Pemindaian
        </h2>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 text-left font-semibold">Waktu</th>
              <th className="py-1 text-left font-semibold">Mode</th>
              <th className="py-1 text-right font-semibold">HTTP</th>
              <th className="py-1 text-right font-semibold">Respons</th>
              <th className="py-1 text-center font-semibold">SSL</th>
              <th className="py-1 text-right font-semibold">Temuan</th>
              <th className="py-1 text-left font-semibold">Ringkasan</th>
            </tr>
          </thead>
          <tbody>
            {scans.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-3 text-center text-neutral-500">
                  Belum ada pemindaian tercatat.
                </td>
              </tr>
            ) : (
              scans.map((s) => (
                <tr key={s.id} className="print-avoid-break border-b border-neutral-300">
                  <td className="py-1 pr-2">{formatDate(s.scannedAt)}</td>
                  <td className="py-1 pr-2">{s.scanMode === 'LIVE' ? 'Live' : 'Simulasi'}</td>
                  <td className="py-1 pr-2 text-right">{s.httpStatus ?? '—'}</td>
                  <td className="py-1 pr-2 text-right">
                    {s.responseTimeMs !== null ? `${s.responseTimeMs} ms` : '—'}
                  </td>
                  <td className="py-1 px-2 text-center">{s.sslValid ? 'Valid' : 'Tidak'}</td>
                  <td className="py-1 pr-2 text-right font-semibold">
                    {s.threatsDetected}
                  </td>
                  <td className="py-1 text-neutral-700">{s.summary ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Signature block */}
      <footer className="print-avoid-break mt-8 border-t border-neutral-300 pt-4">
        <div className="flex justify-between gap-8 text-[10px]">
          <div>
            <p className="mb-8 text-neutral-600">Disusun oleh,</p>
            <p className="border-t border-black pt-1 font-semibold">Tim SecOps Sentinel</p>
          </div>
          <div>
            <p className="mb-8 text-neutral-600">Diketahui oleh,</p>
            <p className="border-t border-black pt-1 font-semibold">Kepala Operasional</p>
          </div>
        </div>
        <p className="mt-4 text-[9px] leading-relaxed text-neutral-500">
          Dokumen ini dihasilkan otomatis oleh Sentinel Ops dari data pemindaian yang tercatat pada
          basis data. Hash DOM baseline: {asset.baselineDomHash ?? 'belum ditetapkan'}.
        </p>
      </footer>
    </article>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <tr className="border-b border-neutral-200">
      <td className="w-[42%] py-1 text-neutral-600">{label}</td>
      <td className={`py-1 ${strong ? 'font-semibold' : ''}`}>{value}</td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-300 p-2">
      <p className="text-[9px] uppercase tracking-[0.06em] text-neutral-500">{label}</p>
      <p className="mt-0.5 text-[14px] font-bold">{value}</p>
    </div>
  );
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}
