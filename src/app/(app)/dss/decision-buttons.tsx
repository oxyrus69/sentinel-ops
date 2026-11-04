'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Label } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast-provider';
import { newRequestId } from '@/lib/useIdempotentAction';
import type { DssFact } from '@/server/services/dssEngine';
import { recordDecisionAction } from './actions';

/**
 * Accept / dismiss a recommendation.
 *
 * Dismissing asks for a reason, because a dismissed recommendation with no
 * explanation is indistinguishable from one nobody read. Both paths write the
 * trigger facts to the decision log.
 */
export function DecisionButtons({
  ruleCode,
  title,
  body,
  facts,
  riskImpact,
}: {
  ruleCode: string;
  title: string;
  body: string;
  facts: DssFact[];
  riskImpact: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<'ACCEPTED' | 'DISMISSED' | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [note, setNote] = useState('');

  async function submit(outcome: 'ACCEPTED' | 'DISMISSED', decisionNote?: string) {
    setBusy(outcome);
    const result = await recordDecisionAction({
      ruleCode,
      title,
      body,
      facts,
      riskImpact,
      outcome,
      note: decisionNote,
      requestId: newRequestId(),
    });
    setBusy(null);

    if (!result.ok) {
      toast.error('Keputusan gagal direkam', result.error);
      return;
    }

    toast.success(
      outcome === 'ACCEPTED' ? 'Rekomendasi diterima' : 'Rekomendasi ditolak',
      'Tercatat di riwayat keputusan bersama angka pemicunya.',
    );
    setDismissing(false);
    setNote('');
    router.refresh();
  }

  if (dismissing) {
    return (
      <div className="w-full rounded-sm border border-border-subtle bg-surface-sunken p-2.5">
        <Field className="mb-2">
          <Label htmlFor={`dismiss-${ruleCode}`} className="text-[11.5px]">
            Alasan menolak (wajib)
          </Label>
          <Input
            id={`dismiss-${ruleCode}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contoh: sudah dijadwalkan dengan vendor hosting"
            className="h-8 text-[12px]"
          />
        </Field>
        <div className="flex gap-1.5">
          <Button
            variant="dangerGhost"
            size="sm"
            disabled={busy !== null || note.trim().length < 5}
            onClick={() => submit('DISMISSED', note)}
          >
            {busy === 'DISMISSED' ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            Terekam ditolak
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDismissing(false)}>
            Batal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="primary"
        size="sm"
        disabled={busy !== null}
        onClick={() => submit('ACCEPTED')}
      >
        {busy === 'ACCEPTED' ? (
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        Terima
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy !== null}
        onClick={() => setDismissing(true)}
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
        Tolak
      </Button>
    </div>
  );
}
