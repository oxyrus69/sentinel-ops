'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, Input, Label, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast-provider';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';
import { newRequestId } from '@/lib/useIdempotentAction';
import {
  copySecretAction,
  createCredentialAction,
  deleteCredentialAction,
  revealSecretAction,
  rotateSecretAction,
} from './actions';

/**
 * Vault list.
 *
 * Secrets are never part of the page payload: each row renders a masked value,
 * and the plaintext only exists in component state after the user explicitly
 * asks for it (which writes an audit row). Revealed values auto-hide again so
 * they cannot be left on screen by accident.
 */

interface Entry {
  id: string;
  label: string;
  category: string;
  categoryLabel: string;
  username: string;
  loginUrl: string | null;
  notes: string | null;
  assetId: string;
  assetName: string;
  domainUrl: string;
  ageDays: number | null;
  lastAccessedAt: string | null;
  lastAccessedByName: string | null;
  assetCompromised: boolean;
}

const CATEGORY_TONE: Record<string, 'info' | 'warning' | 'neutral' | 'accent'> = {
  CPANEL_HOSTING: 'info',
  SSH_ROOT: 'warning',
  DATABASE: 'accent',
  CMS_ADMIN: 'neutral',
  OJS_INDEXING: 'neutral',
};

export function VaultList({
  entries,
  assets,
  rotationDays,
}: {
  entries: Entry[];
  assets: Array<{ id: string; name: string }>;
  rotationDays: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rotating, setRotating] = useState<Entry | null>(null);
  const [rotatingSecret, setRotatingSecret] = useState('');
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function reveal(entry: Entry) {
    // Confirmation makes the audit trail deliberate rather than accidental.
    const proceed = await confirm({
      title: `Buka sandi "${entry.label}"?`,
      description:
        'Akses ini dicatat di jejak audit: nama Anda, waktu, dan kredensial yang dibuka. Sandi akan tersembunyi kembali otomatis setelah 30 detik.',
      confirmLabel: 'Buka sandi',
    });
    if (!proceed) return;

    setBusy(entry.id);
    const result = await revealSecretAction(entry.id);
    setBusy(null);

    if (!result.ok || !result.data) {
      toast.error('Sandi gagal dibuka', result.error);
      return;
    }

    setRevealed((prev) => ({ ...prev, [entry.id]: result.data!.secret }));

    // Auto-hide so a secret is not left visible on a shared screen.
    setTimeout(() => {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
    }, 30_000);

    router.refresh();
  }

  async function copy(entry: Entry) {
    setBusy(entry.id);
    const result = await revealSecretAction(entry.id);

    if (!result.ok || !result.data) {
      setBusy(null);
      toast.error('Sandi gagal disalin', result.error);
      return;
    }

    try {
      await navigator.clipboard.writeText(result.data.secret);
      await copySecretAction(entry.id);
      toast.success('Sandi disalin', 'Akses tercatat di jejak audit.');
    } catch {
      toast.error('Clipboard tidak tersedia', 'Gunakan tombol "Lihat" untuk membaca sandi.');
    }

    setBusy(null);
    router.refresh();
  }

  async function submitRotate() {
    if (!rotating) return;
    if (rotatingSecret.trim().length < 4) {
      setRotateError('Sandi baru minimal 4 karakter.');
      return;
    }
    setRotateError(null);
    setBusy(rotating.id);

    const result = await rotateSecretAction({
      vaultId: rotating.id,
      newSecret: rotatingSecret,
      requestId: newRequestId(),
    });

    setBusy(null);

    if (!result.ok) {
      setRotateError(result.error ?? 'Sandi gagal dirotasi.');
      return;
    }

    setRotating(null);
    setRotatingSecret('');
    toast.success('Sandi dirotasi', 'Penghitung umur sandi direset ke hari ini.');
    router.refresh();
  }

  async function remove(entry: Entry) {
    const proceed = await confirm({
      title: `Hapus kredensial "${entry.label}"?`,
      description:
        'Baris kredensial beserta sandi terenkripsinya dihapus permanen. Riwayat audit tetap tersimpan.',
      confirmLabel: 'Hapus permanen',
      tone: 'danger',
    });
    if (!proceed) return;

    setBusy(entry.id);
    const result = await deleteCredentialAction(entry.id);
    setBusy(null);

    if (!result.ok) {
      toast.error('Kredensial gagal dihapus', result.error);
      return;
    }
    toast.success('Kredensial dihapus');
    router.refresh();
  }

  return (
    <>
      {dialog}

      <div className="mb-3 flex justify-end">
        <Button
          variant={showCreate ? 'ghost' : 'primary'}
          size="sm"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          {showCreate ? 'Tutup formulir' : 'Tambah kredensial'}
        </Button>
      </div>

      {showCreate ? (
        <CreateCredentialForm
          assets={assets}
          onDone={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      ) : null}

      <ul className="space-y-2">
        {entries.map((entry) => {
          const isBusy = busy === entry.id;
          const secret = revealed[entry.id];
          const stale = (entry.ageDays ?? 0) > rotationDays;

          return (
            <li key={entry.id}>
              <Card
                padding="md"
                className={cn(entry.assetCompromised && 'border-l-[3px] border-l-status-critical')}
              >
                <CardHeader className="mb-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CardTitle className="text-[13.5px]">{entry.label}</CardTitle>
                      <Badge tone={CATEGORY_TONE[entry.category] ?? 'neutral'} size="sm">
                        {entry.categoryLabel}
                      </Badge>
                      {stale ? (
                        <Badge tone="warning" size="sm">
                          Usang {entry.ageDays}h
                        </Badge>
                      ) : null}
                      {entry.assetCompromised ? (
                        <Badge tone="critical" size="sm">
                          Aset insiden
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[12px] text-text-secondary">
                      <span className="numeric">{entry.username}</span>
                      {' · '}
                      {entry.assetName}
                    </p>
                  </div>
                </CardHeader>

                {/* Masked / revealed secret */}
                <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border-subtle bg-surface-sunken px-3 py-2">
                  <KeyRound aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[12.5px]',
                      secret ? 'numeric text-text-primary select-all' : 'text-text-muted',
                    )}
                  >
                    {secret ?? '••••••••••••'}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      disabled={isBusy}
                      onClick={() => (secret ? hide(entry.id) : reveal(entry))}
                      aria-label={secret ? 'Sembunyikan sandi' : 'Lihat sandi'}
                      title={secret ? 'Sembunyikan' : 'Lihat sandi'}
                    >
                      {isBusy ? (
                        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      ) : secret ? (
                        <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
                      ) : (
                        <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      disabled={isBusy}
                      onClick={() => copy(entry)}
                      aria-label="Salin sandi"
                      title="Salin"
                    >
                      <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      disabled={isBusy}
                      onClick={() => {
                        setRotating(entry);
                        setRotatingSecret('');
                        setRotateError(null);
                      }}
                      aria-label="Rotasi sandi"
                      title="Rotasi sandi"
                    >
                      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      disabled={isBusy}
                      onClick={() => remove(entry)}
                      aria-label="Hapus kredensial"
                      title="Hapus"
                      className="text-danger hover:text-danger"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
                  {entry.loginUrl ? (
                    <a
                      href={entry.loginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="numeric truncate hover:text-text-secondary hover:underline"
                    >
                      {entry.loginUrl}
                    </a>
                  ) : null}
                  <span>
                    Dirotasi{' '}
                    {entry.ageDays !== null ? `${entry.ageDays} hari lalu` : 'belum pernah'}
                  </span>
                  {entry.lastAccessedAt ? (
                    <span>
                      Terakhir dibuka {formatDate(entry.lastAccessedAt)}
                      {entry.lastAccessedByName ? ` oleh ${entry.lastAccessedByName}` : ''}
                    </span>
                  ) : (
                    <span>Belum pernah dibuka</span>
                  )}
                </div>

                {entry.notes ? (
                  <p className="mt-2 rounded-sm bg-surface-sunken px-2.5 py-1.5 text-[11.5px] leading-relaxed text-text-secondary">
                    {entry.notes}
                  </p>
                ) : null}

                {/* Rotation form */}
                {rotating?.id === entry.id ? (
                  <div className="mt-3 rounded-sm border border-border-subtle bg-surface-sunken p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-status-warning">
                      <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" />
                      Sandi lama tidak dapat dipulihkan setelah dirotasi
                    </p>
                    <Field>
                      <Label htmlFor={`rotate-${entry.id}`}>Sandi baru</Label>
                      <Input
                        id={`rotate-${entry.id}`}
                        type="password"
                        value={rotatingSecret}
                        onChange={(e) => setRotatingSecret(e.target.value)}
                        autoComplete="new-password"
                      />
                    </Field>
                    {rotateError ? <FieldError>{rotateError}</FieldError> : null}
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isBusy}
                        onClick={submitRotate}
                      >
                        {isBusy ? (
                          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Simpan sandi baru
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRotating(null);
                          setRotateError(null);
                        }}
                      >
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );

  function hide(id: string) {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }
}

/** Inline create form. Kept local because it is only used on this page. */
function CreateCredentialForm({
  assets,
  onDone,
}: {
  assets: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const toast = useToast();
  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('CPANEL_HOSTING');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!assetId) return setError('Pilih aset terlebih dahulu.');
    if (label.trim().length === 0) return setError('Label wajib diisi.');
    if (username.trim().length === 0) return setError('Username wajib diisi.');
    if (secret.trim().length < 4) return setError('Sandi minimal 4 karakter.');

    setSaving(true);
    const result = await createCredentialAction({
      assetId,
      label,
      category: category as never,
      username,
      secret,
      loginUrl: loginUrl || undefined,
      notes: notes || undefined,
      requestId: newRequestId(),
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? 'Kredensial gagal disimpan.');
      return;
    }

    toast.success('Kredensial tersimpan', 'Sandi dienkripsi AES-256-GCM sebelum masuk basis data.');
    setLabel('');
    setUsername('');
    setSecret('');
    setLoginUrl('');
    setNotes('');
    onDone();
  }

  return (
    <Card padding="lg" className="mb-3">
      <CardHeader className="mb-3">
        <CardTitle className="text-[13.5px]">Tambah Kredensial</CardTitle>
      </CardHeader>
      <form onSubmit={submit} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field className="mb-0">
            <Label htmlFor="new-asset">Aset</Label>
            <select
              id="new-asset"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-3 text-[13px] text-text-primary focus:border-accent focus:outline-none"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field className="mb-0">
            <Label htmlFor="new-category">Kategori</Label>
            <select
              id="new-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-3 text-[13px] text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="CPANEL_HOSTING">cPanel Hosting</option>
              <option value="SSH_ROOT">SSH Root</option>
              <option value="DATABASE">Database</option>
              <option value="CMS_ADMIN">Admin CMS</option>
              <option value="OJS_INDEXING">Indeksasi Jurnal</option>
            </select>
          </Field>
          <Field className="mb-0">
            <Label htmlFor="new-label">Label</Label>
            <Input
              id="new-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="cPanel Utama"
            />
          </Field>
          <Field className="mb-0">
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field className="mb-0">
            <Label htmlFor="new-secret">Sandi</Label>
            <Input
              id="new-secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field className="mb-0">
            <Label htmlFor="new-url">URL login (opsional)</Label>
            <Input
              id="new-url"
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </div>

        <Field className="mt-3 mb-0">
          <Label htmlFor="new-notes">Catatan (opsional)</Label>
          <Textarea
            id="new-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </Field>

        {error ? <FieldError>{error}</FieldError> : null}

        <div className="mt-3 flex gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
            Simpan kredensial
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Batal
          </Button>
        </div>
      </form>
    </Card>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}
