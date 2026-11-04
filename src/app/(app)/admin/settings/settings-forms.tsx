'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxField, Field, FieldError, FieldHint, Input, Label } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast-provider';
import type { SlaTarget, Severity } from '@/lib/slaMath';
import type { DssThresholds } from '@/server/services/dssEngine';
import {
  saveDssThresholdsAction,
  saveNotificationPrefsAction,
  saveSlaTargetsAction,
} from './actions';

/**
 * Settings forms.
 *
 * Three independent cards so a failed save in one does not discard edits in
 * another. Validation messages come back from the server actions, which are the
 * authority; the inputs are constrained here only to catch obvious mistakes
 * before a round trip.
 */

const SEVERITIES: Array<{ key: Severity; label: string; hint: string }> = [
  { key: 'CRITICAL', label: 'Kritis', hint: 'Layanan mati atau data bocor. Respons 15 menit.' },
  { key: 'HIGH', label: 'Tinggi', hint: 'Injeksi atau defacement terdeteksi.' },
  { key: 'MEDIUM', label: 'Sedang', hint: 'Ancaman terbatas atau SSL mendekati batas.' },
  { key: 'LOW', label: 'Rendah', hint: 'Gangguan kecil tanpa dampak keamanan.' },
];

export function SettingsForms({
  slaTargets,
  thresholds,
  prefs,
}: {
  slaTargets: Record<string, SlaTarget>;
  thresholds: DssThresholds;
  prefs: { slaWarning: boolean; assetCompromised: boolean; vaultAccess: boolean; weeklyDigest: boolean };
}) {
  return (
    <div className="space-y-4">
      <SlaCard slaTargets={slaTargets} />
      <DssCard thresholds={thresholds} />
      <NotificationCard prefs={prefs} />
    </div>
  );
}

function SlaCard({ slaTargets }: { slaTargets: Record<string, SlaTarget> }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setError(null);
    setSaving(true);
    const result = await saveSlaTargetsAction(formData);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }
    toast.success('Konfigurasi SLA tersimpan');
    router.refresh();
  }

  return (
    <Card padding="lg">
      <CardHeader className="mb-3">
        <div>
          <CardTitle>Target SLA per Tingkat Keparahan</CardTitle>
          <p className="mt-1 text-[12.5px] text-text-secondary">
            Nilai dalam menit. Tenggat dihitung saat tiket dibuat.
          </p>
        </div>
      </CardHeader>

      <form action={submit}>
        <div className="space-y-3">
          {SEVERITIES.map((s) => {
            const target = slaTargets[s.key] ?? { responseMinutes: 60, resolutionMinutes: 720 };
            return (
              <div
                key={s.key}
                className="grid gap-2 rounded-sm border border-border-subtle bg-surface-sunken p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-text-primary">{s.label}</p>
                  <p className="text-[11.5px] text-text-muted">{s.hint}</p>
                </div>
                <Field className="mb-0">
                  <Label htmlFor={`response_${s.key}`} className="text-[11.5px]">
                    Respons (menit)
                  </Label>
                  <Input
                    id={`response_${s.key}`}
                    name={`response_${s.key}`}
                    type="number"
                    min={1}
                    max={20160}
                    defaultValue={target.responseMinutes}
                    className="h-8 w-[120px]"
                  />
                </Field>
                <Field className="mb-0">
                  <Label htmlFor={`resolution_${s.key}`} className="text-[11.5px]">
                    Resolusi (menit)
                  </Label>
                  <Input
                    id={`resolution_${s.key}`}
                    name={`resolution_${s.key}`}
                    type="number"
                    min={1}
                    max={20160}
                    defaultValue={target.resolutionMinutes}
                    className="h-8 w-[120px]"
                  />
                </Field>
              </div>
            );
          })}
        </div>

        <FieldHint>
          Perubahan tidak berlaku surut: tiket yang sudah ada tetap memakai tenggat yang tersimpan
          saat dibuat, sehingga riwayat kepatuhan SLA tidak berubah.
        </FieldHint>

        {error ? <FieldError>{error}</FieldError> : null}

        <Button type="submit" variant="primary" size="sm" className="mt-3" disabled={saving}>
          {saving ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Save aria-hidden="true" className="h-3.5 w-3.5" />}
          Simpan SLA
        </Button>
      </form>
    </Card>
  );
}

function DssCard({ thresholds }: { thresholds: DssThresholds }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setError(null);
    setSaving(true);
    const result = await saveDssThresholdsAction(formData);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }
    toast.success('Ambang batas DSS tersimpan');
    router.refresh();
  }

  const fields: Array<{ name: keyof DssThresholds; label: string; hint: string; unit: string }> = [
    {
      name: 'sslWarnDays',
      label: 'Peringatan SSL',
      hint: 'Sisa hari sebelum sertifikat dianggap berisiko.',
      unit: 'hari',
    },
    {
      name: 'repeatInfectionThreshold',
      label: 'Infeksi berulang',
      hint: 'Jumlah insiden dalam jendela waktu yang memicu audit.',
      unit: 'insiden',
    },
    {
      name: 'repeatInfectionWindowDays',
      label: 'Jendela infeksi',
      hint: 'Rentang hari untuk menghitung infeksi berulang.',
      unit: 'hari',
    },
    {
      name: 'credentialRotationDays',
      label: 'Rotasi kredensial',
      hint: 'Umur maksimal sandi sebelum ditandai usang.',
      unit: 'hari',
    },
    {
      name: 'slaWarnRatioPct',
      label: 'Peringatan SLA',
      hint: 'Sisa waktu yang memicu status berisiko.',
      unit: '%',
    },
    {
      name: 'maxActiveTicketsPerEngineer',
      label: 'Beban teknisi',
      hint: 'Batas tiket aktif yang wajar untuk satu teknisi.',
      unit: 'tiket',
    },
  ];

  return (
    <Card padding="lg">
      <CardHeader className="mb-3">
        <div>
          <CardTitle>Ambang Batas Keputusan DSS</CardTitle>
          <p className="mt-1 text-[12.5px] text-text-secondary">
            Nilai ini menentukan kapan rekomendasi muncul di halaman Pendukung Keputusan.
          </p>
        </div>
      </CardHeader>

      <form action={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <Field key={f.name} className="mb-0">
              <Label htmlFor={f.name} className="text-[12.5px]">
                {f.label}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={f.name}
                  name={f.name}
                  type="number"
                  min={1}
                  defaultValue={thresholds[f.name]}
                  className="h-8"
                />
                <span className="shrink-0 text-[11.5px] text-text-muted">{f.unit}</span>
              </div>
              <FieldHint>{f.hint}</FieldHint>
            </Field>
          ))}
        </div>

        {error ? <FieldError>{error}</FieldError> : null}

        <Button type="submit" variant="primary" size="sm" className="mt-3" disabled={saving}>
          {saving ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Save aria-hidden="true" className="h-3.5 w-3.5" />}
          Simpan ambang batas
        </Button>
      </form>
    </Card>
  );
}

function NotificationCard({
  prefs,
}: {
  prefs: { slaWarning: boolean; assetCompromised: boolean; vaultAccess: boolean; weeklyDigest: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState(prefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSaving(true);
    const result = await saveNotificationPrefsAction(state);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }
    toast.success('Preferensi notifikasi tersimpan');
    router.refresh();
  }

  const items: Array<{ key: keyof typeof state; label: string; hint: string }> = [
    {
      key: 'slaWarning',
      label: 'Peringatan SLA',
      hint: 'Beritahu saat tiket mendekati tenggat resolusi.',
    },
    {
      key: 'assetCompromised',
      label: 'Aset terkompromi',
      hint: 'Beritahu saat pemindaian menemukan ancaman kritis.',
    },
    {
      key: 'vaultAccess',
      label: 'Akses brankas',
      hint: 'Beritahu saat sandi kredensial dibuka.',
    },
    {
      key: 'weeklyDigest',
      label: 'Ringkasan mingguan',
      hint: 'Rekap insiden dan tren keamanan setiap Senin.',
    },
  ];

  return (
    <Card padding="lg">
      <CardHeader className="mb-3">
        <CardTitle>Preferensi Notifikasi</CardTitle>
      </CardHeader>

      <div className="space-y-3">
        {items.map((item) => (
          <CheckboxField
            key={item.key}
            id={`pref-${item.key}`}
            label={item.label}
            hint={item.hint}
            checked={state[item.key]}
            onChange={(e) => setState((prev) => ({ ...prev, [item.key]: e.target.checked }))}
          />
        ))}
      </div>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button type="button" variant="primary" size="sm" className="mt-3" disabled={saving} onClick={submit}>
        {saving ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Save aria-hidden="true" className="h-3.5 w-3.5" />}
        Simpan preferensi
      </Button>
    </Card>
  );
}
