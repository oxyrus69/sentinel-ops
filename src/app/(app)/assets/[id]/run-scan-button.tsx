'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Radar, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-provider';
import { newRequestId } from '@/lib/useIdempotentAction';
import { runScanAction } from '../asset-actions';
import type { ScanScenario } from '@/server/services/scannerEngine';

/**
 * Manual scan trigger with a scenario picker.
 *
 * The picker exists so a reviewer can exercise every detection path (clean,
 * slot defacement, SQL error, backdoor, server down, expired certificate)
 * without touching a real site. Scan mode is always SIMULATED here.
 */

const SCENARIOS: Array<{ value: ScanScenario; label: string; description: string }> = [
  { value: 'CLEAN', label: 'Bersih', description: 'Halaman normal, tanpa temuan.' },
  {
    value: 'SLOT_DEFACEMENT',
    label: 'Defacement Slot',
    description: 'Tautan judi slot tersembunyi. Memicu tiket kritis.',
  },
  {
    value: 'SQLI_ERROR',
    label: 'Error SQL Injection',
    description: 'Galat basis data membocorkan struktur kueri.',
  },
  {
    value: 'MALWARE_BACKDOOR',
    label: 'Backdoor Malware',
    description: 'Fungsi PHP untuk eksekusi kode jarak jauh.',
  },
  { value: 'SERVER_DOWN', label: 'Server Down', description: 'Server membalas HTTP 503.' },
  {
    value: 'SSL_EXPIRED',
    label: 'SSL Kedaluwarsa',
    description: 'Sertifikat tidak valid, status menjadi peringatan.',
  },
];

const HEALTH_LABEL: Record<string, string> = {
  HEALTHY: 'Sehat',
  WARNING: 'Peringatan',
  COMPROMISED: 'Terkompromi',
  DOWN: 'Mati',
  MAINTENANCE: 'Pemeliharaan',
};

export function RunScanButton({ assetId }: { assetId: string }) {
  const router = useRouter();
  const toast = useToast();

  const [scenario, setScenario] = useState<ScanScenario>('CLEAN');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    threatsDetected: number;
    summary: string;
    healthStatus: string;
    incidentId: string | null;
    ticketNumber: string | null;
  } | null>(null);

  const selected = SCENARIOS.find((s) => s.value === scenario);

  async function run() {
    setRunning(true);
    setResult(null);

    const response = await runScanAction({
      assetId,
      scenario,
      requestId: newRequestId(),
    });

    setRunning(false);

    if (!response.ok || !response.data) {
      toast.error('Pemindaian gagal', response.error);
      return;
    }

    setResult(response.data);
    toast.success(
      response.data.threatsDetected > 0
        ? `Ditemukan ${response.data.threatsDetected} temuan`
        : 'Pemindaian selesai, tidak ada temuan',
      response.data.ticketNumber
        ? `Tiket ${response.data.ticketNumber} dibuat otomatis.`
        : undefined,
    );
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1">
          <span className="mb-1.5 block text-[12px] font-medium text-text-primary">
            Skenario pemindaian
          </span>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value as ScanScenario)}
            disabled={running}
            className="h-9 w-full cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-3 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          >
            {SCENARIOS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <Button variant="primary" onClick={run} disabled={running}>
          {running ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Radar aria-hidden="true" className="h-4 w-4" />
          )}
          {running ? 'Memindai…' : 'Jalankan Pemindaian'}
        </Button>
      </div>

      <p className="mt-1.5 text-[11.5px] text-text-muted">{selected?.description}</p>

      <p className="mt-2 flex items-start gap-1.5 rounded-sm bg-surface-sunken px-2.5 py-1.5 text-[11px] leading-relaxed text-text-muted">
        <ScanLine aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
        Mode simulasi: dokumen HTML preset dianalisis oleh mesin deteksi yang sama dengan pemindaian
        live. Tidak ada permintaan keluar ke situs target.
      </p>

      {result ? (
        <div className="mt-3 rounded-sm border border-border-subtle bg-surface-sunken p-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge
              tone={result.threatsDetected > 0 ? 'critical' : 'healthy'}
              size="sm"
            >
              {result.threatsDetected > 0
                ? `${result.threatsDetected} temuan`
                : 'Tidak ada temuan'}
            </Badge>
            <Badge tone={healthTone(result.healthStatus)} size="sm">
              {HEALTH_LABEL[result.healthStatus] ?? result.healthStatus}
            </Badge>
          </div>

          <p className="text-[12px] leading-relaxed text-text-secondary">{result.summary}</p>

          {result.incidentId ? (
            <Link
              href={`/incidents/${result.incidentId}`}
              className="mt-2 inline-block text-[12px] font-medium text-accent hover:underline"
            >
              Buka tiket {result.ticketNumber} →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function healthTone(status: string): 'healthy' | 'warning' | 'critical' | 'neutral' {
  if (status === 'HEALTHY') return 'healthy';
  if (status === 'WARNING') return 'warning';
  if (status === 'COMPROMISED' || status === 'DOWN') return 'critical';
  return 'neutral';
}
