'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldHint, Input, Label } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast-provider';
import { newRequestId } from '@/lib/useIdempotentAction';
import { createAssetAction } from '../asset-actions';
import type { PlatformType } from '@/server/db/schema';

/**
 * Create-asset form.
 *
 * Validation mirrors the server action, which re-validates everything: the
 * client copy exists only to give immediate feedback. Domain input accepts a
 * bare hostname or a full URL and is normalised server-side.
 */

const PLATFORMS: Array<{ value: PlatformType; label: string }> = [
  { value: 'OJS_3', label: 'OJS 3' },
  { value: 'WORDPRESS', label: 'WordPress' },
  { value: 'LARAVEL', label: 'Laravel' },
  { value: 'NODE_SSR', label: 'Node.js' },
  { value: 'STATIC_WEB', label: 'Situs Statis' },
  { value: 'CUSTOM_PHP', label: 'PHP Kustom' },
];

export function AssetForm({ clients }: { clients: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const toast = useToast();

  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [name, setName] = useState('');
  const [domainUrl, setDomainUrl] = useState('');
  const [platform, setPlatform] = useState<PlatformType>('OJS_3');
  const [platformVersion, setPlatformVersion] = useState('');
  const [serverIp, setServerIp] = useState('');
  const [hostingProvider, setHostingProvider] = useState('');
  const [sslExpiryDate, setSslExpiryDate] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 3) return setError('Nama aset minimal 3 karakter.');
    if (domainUrl.trim().length === 0) return setError('Domain wajib diisi.');
    if (!/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(domainUrl.trim())) {
      return setError('Format domain tidak valid. Contoh: journal.kampus.ac.id');
    }
    if (!clientId) return setError('Pilih klien pemilik aset.');

    setSaving(true);
    const result = await createAssetAction({
      clientId,
      name,
      domainUrl,
      platform,
      platformVersion: platformVersion || undefined,
      serverIp: serverIp || undefined,
      hostingProvider: hostingProvider || undefined,
      sslExpiryDate: sslExpiryDate || undefined,
      requestId: newRequestId(),
    });
    setSaving(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? 'Aset gagal disimpan.');
      return;
    }

    toast.success('Aset ditambahkan', 'Anda dapat langsung menjalankan pemindaian pertama.');
    router.push(`/assets/${result.data.id}`);
    router.refresh();
  }

  return (
    <Card padding="lg" className="max-w-[720px]">
      <CardHeader className="mb-3">
        <CardTitle>Informasi Aset</CardTitle>
      </CardHeader>

      <form onSubmit={submit} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <Label htmlFor="asset-name">Nama aset</Label>
            <Input
              id="asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jurnal Teknik Nusantara"
            />
          </Field>

          <Field>
            <Label htmlFor="asset-domain">Domain URL</Label>
            <Input
              id="asset-domain"
              value={domainUrl}
              onChange={(e) => setDomainUrl(e.target.value)}
              placeholder="journal.kampus.ac.id"
              className="numeric"
            />
          </Field>

          <Field>
            <Label htmlFor="asset-client">Klien pemilik</Label>
            <select
              id="asset-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-3 text-[13px] text-text-primary focus:border-accent focus:outline-none"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <Label htmlFor="asset-platform">Platform</Label>
            <select
              id="asset-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as PlatformType)}
              className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-3 text-[13px] text-text-primary focus:border-accent focus:outline-none"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <Label htmlFor="asset-version">Versi platform</Label>
            <Input
              id="asset-version"
              value={platformVersion}
              onChange={(e) => setPlatformVersion(e.target.value)}
              placeholder="OJS 3.4.0-3"
              className="numeric"
            />
          </Field>

          <Field>
            <Label htmlFor="asset-ip">Server IP</Label>
            <Input
              id="asset-ip"
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              placeholder="103.28.14.77"
              className="numeric"
            />
          </Field>

          <Field>
            <Label htmlFor="asset-hosting">Penyedia hosting</Label>
            <Input
              id="asset-hosting"
              value={hostingProvider}
              onChange={(e) => setHostingProvider(e.target.value)}
              placeholder="Hostinger ID"
            />
          </Field>

          <Field>
            <Label htmlFor="asset-ssl">Tanggal kedaluwarsa SSL</Label>
            <Input
              id="asset-ssl"
              type="date"
              value={sslExpiryDate}
              onChange={(e) => setSslExpiryDate(e.target.value)}
            />
          </Field>
        </div>

        <FieldHint>
          Sisa hari SSL dihitung otomatis dari tanggal ini setiap kali aset dipindai. Kosongkan bila
          belum diketahui.
        </FieldHint>

        {error ? <FieldError>{error}</FieldError> : null}

        <div className="mt-4 flex gap-2">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="h-4 w-4" />
            )}
            Simpan aset
          </Button>
          <Button asChild variant="ghost">
            <Link href="/assets">Batal</Link>
          </Button>
        </div>
      </form>
    </Card>
  );
}
