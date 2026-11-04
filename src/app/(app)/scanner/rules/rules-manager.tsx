'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldHint, Input, Label, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast-provider';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';
import {
  createSignatureAction,
  deleteSignatureAction,
  updateSignatureAction,
} from '../actions';

/**
 * Signature dictionary manager.
 *
 * Patterns are user-authored regexes, so the form validates them locally before
 * the round trip and the server re-validates (never trust the client). Toggling
 * active state is one click; editing a pattern opens an inline editor so the
 * list stays scannable.
 */

interface Rule {
  id: string;
  name: string;
  pattern: string;
  category: string;
  severity: string;
  description: string | null;
  isActive: boolean;
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

const SEVERITY_TONE: Record<string, 'critical' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'critical',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
};

export function RulesManager({ rules, canEdit }: { rules: Rule[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(rule: Rule) {
    setBusy(rule.id);
    const result = await updateSignatureAction({ id: rule.id, isActive: !rule.isActive });
    setBusy(null);
    if (!result.ok) {
      toast.error('Gagal mengubah status aturan', result.error);
      return;
    }
    toast.success(rule.isActive ? 'Aturan dinonaktifkan' : 'Aturan diaktifkan');
    router.refresh();
  }

  async function remove(rule: Rule) {
    const proceed = await confirm({
      title: `Hapus aturan "${rule.name}"?`,
      description:
        'Aturan akan hilang dari kamus dan tidak lagi dijalankan pada pemindaian berikutnya. Riwayat temuan lama tetap tersimpan.',
      confirmLabel: 'Hapus aturan',
      tone: 'danger',
    });
    if (!proceed) return;

    setBusy(rule.id);
    const result = await deleteSignatureAction(rule.id);
    setBusy(null);
    if (!result.ok) {
      toast.error('Gagal menghapus aturan', result.error);
      return;
    }
    toast.success('Aturan dihapus');
    router.refresh();
  }

  return (
    <>
      {dialog}

      {canEdit ? (
        <div className="mb-3 flex justify-end">
          <Button
            variant={creating ? 'ghost' : 'primary'}
            size="sm"
            onClick={() => {
              setCreating((v) => !v);
              setEditing(null);
            }}
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            {creating ? 'Tutup' : 'Tambah aturan'}
          </Button>
        </div>
      ) : null}

      {creating && canEdit ? (
        <RuleForm
          mode="create"
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}

      <ul className="space-y-2">
        {rules.map((rule) => {
          const isBusy = busy === rule.id;
          const isEditing = editing?.id === rule.id;

          return (
            <li key={rule.id}>
              <Card padding="md" className={cn(!rule.isActive && 'opacity-70')}>
                <CardHeader className="mb-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CardTitle className="text-[13.5px]">{rule.name}</CardTitle>
                      <Badge tone={SEVERITY_TONE[rule.severity] ?? 'neutral'} size="sm">
                        {rule.severity}
                      </Badge>
                      <Badge tone="neutral" size="sm">
                        {CATEGORY_LABEL[rule.category] ?? rule.category}
                      </Badge>
                      {!rule.isActive ? (
                        <Badge tone="neutral" size="sm">
                          Nonaktif
                        </Badge>
                      ) : null}
                    </div>
                    {rule.description ? (
                      <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
                        {rule.description}
                      </p>
                    ) : null}
                  </div>

                  {canEdit && !isEditing ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="iconSm"
                        disabled={isBusy}
                        onClick={() => toggle(rule)}
                        aria-label={rule.isActive ? 'Nonaktifkan aturan' : 'Aktifkan aturan'}
                        title={rule.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      >
                        {isBusy ? (
                          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                        ) : rule.isActive ? (
                          <PowerOff aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                          <Power aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        disabled={isBusy}
                        onClick={() => {
                          setEditing(rule);
                          setCreating(false);
                        }}
                        aria-label="Ubah aturan"
                        title="Ubah"
                      >
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        disabled={isBusy}
                        onClick={() => remove(rule)}
                        aria-label="Hapus aturan"
                        title="Hapus"
                        className="text-danger hover:text-danger"
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </CardHeader>

                {isEditing ? (
                  <RuleForm
                    mode="edit"
                    rule={rule}
                    onDone={() => {
                      setEditing(null);
                      router.refresh();
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <pre className="numeric overflow-x-auto rounded-sm border border-border-subtle bg-surface-sunken px-2.5 py-2 text-[11.5px] leading-relaxed text-text-secondary">
                    {rule.pattern}
                  </pre>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function RuleForm({
  mode,
  rule,
  onDone,
  onCancel,
}: {
  mode: 'create' | 'edit';
  rule?: Rule;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(rule?.name ?? '');
  const [pattern, setPattern] = useState(rule?.pattern ?? '');
  const [category, setCategory] = useState(rule?.category ?? 'SLOT_DEFACEMENT');
  const [severity, setSeverity] = useState(rule?.severity ?? 'HIGH');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function localValidate(): string | null {
    if (name.trim().length === 0) return 'Nama aturan wajib diisi.';
    if (pattern.trim().length === 0) return 'Pola regex wajib diisi.';
    try {
      new RegExp(pattern, 'gi');
    } catch (err) {
      return `Pola regex tidak valid: ${err instanceof Error ? err.message : 'kesalahan sintaks'}`;
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const localError = localValidate();
    if (localError) {
      setError(localError);
      return;
    }
    setError(null);
    setSaving(true);

    const result =
      mode === 'create'
        ? await createSignatureAction({
            name,
            pattern,
            category: category as never,
            severity: severity as never,
            description,
          })
        : await updateSignatureAction({
            id: rule!.id,
            name,
            pattern,
            severity: severity as never,
            description: description || null,
          });

    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? 'Aturan gagal disimpan.');
      return;
    }

    toast.success(mode === 'create' ? 'Aturan ditambahkan' : 'Aturan diperbarui');
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-2 rounded-sm border border-border-subtle bg-surface-sunken p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field className="mb-0">
          <Label htmlFor={`rule-name-${rule?.id ?? 'new'}`}>Nama aturan</Label>
          <Input
            id={`rule-name-${rule?.id ?? 'new'}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        {mode === 'create' ? (
          <>
            <Field className="mb-0">
              <Label htmlFor={`rule-category-${rule?.id ?? 'new'}`}>Kategori</Label>
              <select
                id={`rule-category-${rule?.id ?? 'new'}`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-base px-3 text-[13px] text-text-primary focus:border-accent focus:outline-none"
              >
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}

        <Field className="mb-0">
          <Label htmlFor={`rule-severity-${rule?.id ?? 'new'}`}>Severity</Label>
          <select
            id={`rule-severity-${rule?.id ?? 'new'}`}
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-base px-3 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="CRITICAL">Kritis</option>
            <option value="HIGH">Tinggi</option>
            <option value="MEDIUM">Sedang</option>
            <option value="LOW">Rendah</option>
          </select>
        </Field>
      </div>

      <Field className="mt-3 mb-0">
        <Label htmlFor={`rule-pattern-${rule?.id ?? 'new'}`}>Pola regex</Label>
        <Textarea
          id={`rule-pattern-${rule?.id ?? 'new'}`}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          rows={2}
          spellCheck={false}
          className="numeric text-[12px]"
        />
        <FieldHint>
          Dijalankan dengan flag <span className="numeric">gi</span> terhadap setiap baris HTML.
          Contoh: <span className="numeric">slot\\s*gacor|maxwin</span>
        </FieldHint>
      </Field>

      <Field className="mt-3 mb-0">
        <Label htmlFor={`rule-desc-${rule?.id ?? 'new'}`}>Deskripsi (opsional)</Label>
        <Textarea
          id={`rule-desc-${rule?.id ?? 'new'}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </Field>

      {error ? <FieldError>{error}</FieldError> : null}

      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
          {mode === 'create' ? 'Simpan aturan' : 'Simpan perubahan'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (onCancel) onCancel();
            else onDone();
          }}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
