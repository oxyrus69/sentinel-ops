'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldHint, Input, Label, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast-provider';
import { newRequestId } from '@/lib/useIdempotentAction';
import { reportIncidentAction } from '../actions';

/**
 * Client report form.
 *
 * Category choices are deliberately limited to what a client can meaningfully
 * diagnose from the outside; anything involving malware or injection is
 * classified by the SecOps team after triage, not by the reporter.
 */

const CATEGORIES = [
  { value: 'CONFIGURATION_ERROR', label: 'Halaman tampil tidak normal / galat' },
  { value: 'SERVER_DOWN', label: 'Situs tidak dapat diakses sama sekali' },
  { value: 'SSL_EXPIRED', label: 'Peringatan keamanan sertifikat di browser' },
  { value: 'BRUTE_FORCE', label: 'Dugaan percobaan masuk tanpa izin' },
];

export function ReportForm({
  assets,
}: {
  assets: Array<{ id: string; name: string; domainUrl: string }>;
}) {
  const router = useRouter();
  const toast = useToast();

  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [category, setCategory] = useState(CATEGORIES[0]?.value ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!assetId) return setError('Pilih aset yang bermasalah.');
    if (title.trim().length < 10) return setError('Judul minimal 10 karakter.');
    if (description.trim().length < 30) {
      return setError('Jelaskan masalahnya minimal 30 karakter.');
    }

    setSubmitting(true);
    const result = await reportIncidentAction({
      assetId,
      title,
      description,
      category,
      requestId: newRequestId(),
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Laporan gagal dikirim.');
      return;
    }

    setDone(result.data?.ticketNumber ?? '');
    toast.success('Laporan terkirim', 'Tiket dibuat dan akan segera ditriase.');
    router.refresh();
  }

  if (done) {
    return (
      <Card padding="lg">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-status-healthy" />
          <div>
            <p className="text-[14px] font-medium text-text-primary">Laporan diterima</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
              Tiket{' '}
              <span className="numeric font-medium text-text-primary">{done}</span> telah dibuat.
              Anda dapat memantau progresnya di Portal Klien.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => router.push('/portal')}
            >
              Kembali ke Portal
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="max-w-[640px]">
      <CardHeader className="mb-3">
        <CardTitle>Detail Masalah</CardTitle>
      </CardHeader>

      <form onSubmit={submit} noValidate>
        <Field>
          <Label htmlFor="report-asset">Aset yang bermasalah</Label>
          <select
            id="report-asset"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-3 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          >
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.domainUrl.replace(/^https?:\/\//, '')}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <Label htmlFor="report-category">Jenis masalah</Label>
          <select
            id="report-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-3 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <Label htmlFor="report-title">Judul singkat</Label>
          <Input
            id="report-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Halaman arsip jurnal menampilkan galat 500"
            maxLength={160}
          />
        </Field>

        <Field>
          <Label htmlFor="report-description">Penjelasan</Label>
          <Textarea
            id="report-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Apa yang terlihat, sejak kapan, di halaman mana, dan apakah semua pengunjung terkena."
          />
          <FieldHint>
            Semakin spesifik, semakin cepat tim menemukan penyebabnya. Jangan tulis sandi atau data
            pribadi di kolom ini.
          </FieldHint>
        </Field>

        {error ? <FieldError>{error}</FieldError> : null}

        <div className="mt-4 flex gap-2">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="h-4 w-4" />
            )}
            Kirim laporan
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push('/portal')}>
            Batal
          </Button>
        </div>
      </form>
    </Card>
  );
}
