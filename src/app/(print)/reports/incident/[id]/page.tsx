import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePageAccess } from '@/server/auth/guard';
import { getIncidentWorkspace } from '@/server/services/incidentEngine';
import { PrintToolbar } from '../../print-toolbar';

export const metadata: Metadata = { title: 'Dokumen Postmortem Insiden' };

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'Kritis',
  HIGH: 'Tinggi',
  MEDIUM: 'Sedang',
  LOW: 'Rendah',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Terbuka',
  INVESTIGATING: 'Investigasi',
  CONTAINED: 'Terkendali',
  RESOLVED: 'Terselesaikan',
  CLOSED: 'Ditutup',
};

const CATEGORY_LABEL: Record<string, string> = {
  SQL_INJECTION: 'SQL Injection',
  SLOT_DEFACEMENT: 'Defacement Slot',
  MALWARE_BACKDOOR: 'Backdoor Malware',
  SSL_EXPIRED: 'Sertifikat SSL Kedaluwarsa',
  SERVER_DOWN: 'Server Tidak Merespons',
  BRUTE_FORCE: 'Brute Force',
  CONFIGURATION_ERROR: 'Kesalahan Konfigurasi',
};

export default async function IncidentReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess('/admin');
  const { id } = await params;

  const data = await getIncidentWorkspace(id);
  if (!data) notFound();

  const { incident, asset, reporter, comments, tasks } = data;

  // Only client-visible discussion belongs in a postmortem document.
  const publicComments = comments.filter((c) => !c.comment.isInternal);

  return (
    <article>
      <PrintToolbar title="Dokumen Postmortem Insiden (RCA)" />

      {/* Letterhead */}
      <header className="mb-6 border-b-2 border-black pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Sentinel Ops · Dokumen Postmortem Insiden
            </p>
            <h1 className="mt-1 text-[20px] font-bold leading-tight text-black">
              {incident.title}
            </h1>
            <p className="mt-1 text-[11px] text-neutral-600">
              <span className="font-mono font-semibold">{incident.ticketNumber}</span> ·{' '}
              {asset.name} ({asset.domainUrl.replace(/^https?:\/\//, '')})
            </p>
          </div>
          <div className="shrink-0 text-right text-[10px] text-neutral-600">
            <p className="font-semibold text-black">
              {SEVERITY_LABEL[incident.severity] ?? incident.severity}
            </p>
            <p className="mt-0.5">{STATUS_LABEL[incident.status] ?? incident.status}</p>
          </div>
        </div>
      </header>

      {/* Timeline facts */}
      <section className="print-avoid-break mb-5">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-black">
          Kronologi
        </h2>
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            <Row label="Kategori insiden" value={CATEGORY_LABEL[incident.category] ?? incident.category} />
            <Row label="Dilaporkan oleh" value={reporter?.fullName ?? '—'} />
            <Row label="Waktu dilaporkan" value={formatDate(incident.createdAt)} />
            <Row label="Respons pertama" value={formatDate(incident.firstRespondedAt)} />
            <Row label="Tenggat resolusi SLA" value={formatDate(incident.slaResolutionDueAt)} />
            <Row label="Waktu diselesaikan" value={formatDate(incident.resolvedAt)} />
            <Row
              label="Status SLA"
              value={incident.slaBreached ? 'Tenggat terlewati' : 'Memenuhi tenggat'}
              strong
            />
          </tbody>
        </table>
      </section>

      {/* Description */}
      <section className="print-avoid-break mb-5">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-black">
          Uraian Masalah
        </h2>
        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-black">
          {incident.description}
        </p>
      </section>

      {/* RCA */}
      <section className="print-avoid-break mb-5">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-black">
          Analisis Akar Masalah
        </h2>
        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-black">
          {incident.rootCauseSummary ?? 'Belum diisi. Analisis akar masalah wajib dilengkapi sebelum tiket ditutup.'}
        </p>
      </section>

      {/* Remediation */}
      <section className="print-avoid-break mb-5">
        <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-black">
          Langkah Remediasi
        </h2>
        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-black">
          {incident.remediationSteps ?? 'Belum diisi.'}
        </p>
      </section>

      {/* Runbook */}
      {tasks.length > 0 ? (
        <section className="print-break-before mb-5">
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-black">
            Langkah Mitigasi yang Dijalankan
          </h2>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-black">
                <th className="w-8 py-1 text-left font-semibold">#</th>
                <th className="py-1 text-left font-semibold">Langkah</th>
                <th className="w-20 py-1 text-center font-semibold">Status</th>
                <th className="w-32 py-1 text-left font-semibold">Diselesaikan</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(({ task, step }) => (
                <tr key={task.id} className="print-avoid-break border-b border-neutral-300">
                  <td className="py-1 font-mono">{step.stepOrder}</td>
                  <td className="py-1 pr-2">{step.title}</td>
                  <td className="py-1 text-center">{task.isDone ? 'Selesai' : 'Belum'}</td>
                  <td className="py-1">{task.doneAt ? formatDate(task.doneAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* Public discussion */}
      {publicComments.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-black">
            Komunikasi dengan Klien
          </h2>
          <ul className="space-y-2">
            {publicComments.map(({ comment, author }) => (
              <li key={comment.id} className="print-avoid-break border-l-2 border-neutral-300 pl-2.5">
                <p className="text-[9.5px] text-neutral-500">
                  {author?.fullName ?? 'Pengguna'} · {formatDate(comment.createdAt)}
                </p>
                <p className="whitespace-pre-wrap text-[10.5px] leading-relaxed">{comment.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="print-avoid-break mt-8 border-t border-neutral-300 pt-4">
        <div className="flex justify-between gap-8 text-[10px]">
          <div>
            <p className="mb-8 text-neutral-600">Disusun oleh,</p>
            <p className="border-t border-black pt-1 font-semibold">Tim SecOps Sentinel</p>
          </div>
          <div>
            <p className="mb-8 text-neutral-600">Diketahui oleh,</p>
            <p className="border-t border-black pt-1 font-semibold">Pemilik Aset</p>
          </div>
        </div>
        <p className="mt-4 text-[9px] leading-relaxed text-neutral-500">
          Dokumen ini dihasilkan otomatis oleh Sentinel Ops. Catatan internal teknisi sengaja tidak
          disertakan karena dokumen ini dapat dibagikan kepada pemilik aset.
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
