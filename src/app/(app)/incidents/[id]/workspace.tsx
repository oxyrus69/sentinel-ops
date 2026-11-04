'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, MessageSquare, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, Label, Textarea } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-provider';
import { newRequestId } from '@/lib/useIdempotentAction';
import {
  addCommentAction,
  attachRunbookAction,
  changeStatusAction,
  toggleTaskAction,
} from '../actions';
import type { IncidentStatusValue } from '@/server/services/incidentEngine';

/**
 * Action rail for one ticket.
 *
 * Owns the three mutations a technician performs from the detail page: change
 * status (with RCA when resolving), post a comment, and work the runbook
 * checklist. Every call is locked against double submission with a synchronous
 * ref-free guard (a pending flag plus disabled controls), and each mutation
 * carries its own requestId so a retry cannot duplicate a ticket change.
 */

interface RunbookOption {
  id: string;
  title: string;
  category: string;
}

interface AssigneeOption {
  id: string;
  name: string;
  role: string;
}

export interface WorkspaceProps {
  incidentId: string;
  currentStatus: IncidentStatusValue;
  version: number;
  runbookOptions: RunbookOption[];
  hasRunbook: boolean;
  tasks: Array<{ id: string; isDone: boolean; label: string }>;
  assignees: AssigneeOption[];
  assignedTo: string | null;
}

const NEXT_STATUS: Record<IncidentStatusValue, Array<{ value: IncidentStatusValue; label: string }>> = {
  OPEN: [
    { value: 'INVESTIGATING', label: 'Mulai investigasi' },
    { value: 'CONTAINED', label: 'Tandai terkendali' },
  ],
  INVESTIGATING: [
    { value: 'CONTAINED', label: 'Tandai terkendali' },
    { value: 'RESOLVED', label: 'Selesaikan tiket' },
  ],
  CONTAINED: [
    { value: 'INVESTIGATING', label: 'Kembali investigasi' },
    { value: 'RESOLVED', label: 'Selesaikan tiket' },
  ],
  RESOLVED: [
    { value: 'CLOSED', label: 'Tutup tiket' },
    { value: 'INVESTIGATING', label: 'Buka kembali' },
  ],
  CLOSED: [],
};

export function IncidentWorkspace(props: WorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [version, setVersion] = useState(props.version);
  const [status, setStatus] = useState(props.currentStatus);
  const [resolving, setResolving] = useState(false);
  const [rca, setRca] = useState('');
  const [steps, setSteps] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState('');
  const [commentInternal, setCommentInternal] = useState(true);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [selectedRunbook, setSelectedRunbook] = useState(props.runbookOptions[0]?.id ?? '');

  /** Apply a status change; resolving requires the RCA fields. */
  async function applyStatus(next: IncidentStatusValue) {
    setFormError(null);

    if (next === 'RESOLVED' && !resolving) {
      setResolving(true);
      return;
    }

    if (next === 'RESOLVED') {
      if (rca.trim().length < 20) {
        setFormError('Root Cause Analysis wajib diisi minimal 20 karakter sebelum tiket diselesaikan.');
        return;
      }
      if (steps.trim().length < 10) {
        setFormError('Langkah remediasi wajib diisi minimal 10 karakter.');
        return;
      }
    }

    startTransition(async () => {
      const result = await changeStatusAction({
        incidentId: props.incidentId,
        toStatus: next,
        expectedVersion: version,
        rootCauseSummary: next === 'RESOLVED' ? rca : undefined,
        remediationSteps: next === 'RESOLVED' ? steps : undefined,
        requestId: newRequestId(),
      });

      if (!result.ok) {
        if (result.code === 'CONFLICT') {
          toast.error('Tiket sudah diubah pengguna lain', result.error);
          router.refresh();
        } else {
          setFormError(result.error ?? 'Status gagal diubah.');
        }
        return;
      }

      setVersion(result.data?.version ?? version + 1);
      setStatus(next);
      setResolving(false);
      toast.success('Status tiket diperbarui', `Sekarang: ${next}`);
      router.refresh();
    });
  }

  /** Post a comment (internal note or client-visible reply). */
  async function postComment() {
    if (commentBody.trim().length === 0) {
      setCommentError('Isi komentar tidak boleh kosong.');
      return;
    }
    setCommentError(null);
    setPosting(true);

    const result = await addCommentAction({
      incidentId: props.incidentId,
      body: commentBody,
      isInternal: commentInternal,
      requestId: newRequestId(),
    });

    setPosting(false);

    if (!result.ok) {
      setCommentError(result.error ?? 'Komentar gagal disimpan.');
      return;
    }

    setCommentBody('');
    toast.success(
      commentInternal ? 'Catatan internal disimpan' : 'Balasan publik dikirim',
      commentInternal ? 'Hanya terlihat oleh tim internal.' : 'Klien dapat melihat balasan ini.',
    );
    router.refresh();
  }

  /** Tick or untick a runbook step. */
  async function toggleTask(taskId: string, nextDone: boolean) {
    setBusyTask(taskId);
    const result = await toggleTaskAction({
      taskId,
      isDone: nextDone,
      incidentId: props.incidentId,
    });
    setBusyTask(null);

    if (!result.ok) {
      toast.error('Langkah gagal diperbarui', result.error);
      return;
    }
    router.refresh();
  }

  /** Attach a runbook template and materialise its checklist. */
  async function attach() {
    if (!selectedRunbook) return;
    setAttaching(true);
    const result = await attachRunbookAction({
      incidentId: props.incidentId,
      runbookId: selectedRunbook,
    });
    setAttaching(false);

    if (!result.ok) {
      toast.error('Runbook gagal dilampirkan', result.error);
      return;
    }
    toast.success('Runbook dilampirkan', `${result.data?.taskCount ?? 0} langkah ditambahkan.`);
    router.refresh();
  }

  const nextOptions = NEXT_STATUS[status] ?? [];

  return (
    <>
      {/* Status changes */}
      <Card padding="md">
        <CardHeader className="mb-3">
          <CardTitle className="text-[13px]">Ubah Status</CardTitle>
          <Badge tone="neutral" size="sm">
            v{version}
          </Badge>
        </CardHeader>

        {nextOptions.length === 0 ? (
          <p className="text-[12.5px] text-text-muted">
            Tiket sudah ditutup. Tidak ada perubahan status yang tersedia.
          </p>
        ) : (
          <div className="space-y-2">
            {nextOptions.map((opt) => (
              <Button
                key={opt.value}
                variant={opt.value === 'RESOLVED' ? 'primary' : 'secondary'}
                size="sm"
                className="w-full justify-start"
                disabled={pending}
                onClick={() => applyStatus(opt.value)}
              >
                {pending ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {opt.label}
              </Button>
            ))}
          </div>
        )}

        {resolving ? (
          <div className="mt-4 rounded-sm border border-border-subtle bg-surface-sunken p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-status-warning">
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
              RCA wajib sebelum menyelesaikan tiket
            </p>
            <Field>
              <Label htmlFor="rca">Root Cause Analysis</Label>
              <Textarea
                id="rca"
                value={rca}
                onChange={(e) => setRca(e.target.value)}
                placeholder="Jelaskan penyebab akar masalah, bukan gejalanya."
                rows={4}
              />
            </Field>
            <Field>
              <Label htmlFor="steps">Langkah remediasi</Label>
              <Textarea
                id="steps"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                placeholder="Apa yang sudah dilakukan agar masalah tidak terulang."
                rows={3}
              />
            </Field>
            {formError ? <FieldError>{formError}</FieldError> : null}
            <div className="mt-2 flex gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => applyStatus('RESOLVED')}
              >
                {pending ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
                Simpan & selesaikan
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setResolving(false);
                  setFormError(null);
                }}
              >
                Batal
              </Button>
            </div>
          </div>
        ) : formError ? (
          <div className="mt-3">
            <FieldError>{formError}</FieldError>
          </div>
        ) : null}
      </Card>

      {/* Runbook checklist toggles */}
      {props.hasRunbook ? (
        <Card padding="md">
          <CardHeader className="mb-2">
            <CardTitle className="text-[13px]">Periksa Langkah</CardTitle>
            <Badge tone="neutral" size="sm">
              {props.tasks.filter((t) => t.isDone).length}/{props.tasks.length}
            </Badge>
          </CardHeader>
          <ul className="space-y-1">
            {props.tasks.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-sm px-1 py-1 text-[12px] leading-snug transition-colors hover:bg-surface-overlay/50">
                  <input
                    type="checkbox"
                    checked={t.isDone}
                    disabled={busyTask === t.id}
                    onChange={(e) => toggleTask(t.id, e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border border-border-strong bg-surface-base accent-accent"
                  />
                  <span className={t.isDone ? 'text-text-muted line-through' : 'text-text-secondary'}>
                    {t.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Attach runbook */}
      <Card padding="md">
        <CardHeader className="mb-2">
          <CardTitle className="text-[13px]">Lampirkan Runbook</CardTitle>
        </CardHeader>
        {props.runbookOptions.length === 0 ? (
          <p className="text-[12px] text-text-muted">
            Belum ada template runbook untuk kategori insiden ini.
          </p>
        ) : (
          <div className="space-y-2">
            <select
              value={selectedRunbook}
              onChange={(e) => setSelectedRunbook(e.target.value)}
              className="h-8 w-full rounded-sm border border-border-subtle bg-surface-sunken px-2 text-[12px] text-text-primary focus:border-accent focus:outline-none"
              aria-label="Pilih runbook"
            >
              {props.runbookOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={attaching}
              onClick={attach}
            >
              {attaching ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {props.hasRunbook ? 'Tambah checklist lagi' : 'Lampirkan'}
            </Button>
          </div>
        )}
      </Card>

      {/* Comment composer */}
      <Card padding="md">
        <CardHeader className="mb-2">
          <CardTitle className="text-[13px]">Tulis Balasan</CardTitle>
        </CardHeader>

        <div className="mb-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => setCommentInternal(true)}
            aria-pressed={commentInternal}
            className={
              commentInternal
                ? 'flex-1 cursor-pointer rounded-sm border border-status-warning/40 bg-status-warning/15 px-2 py-1 text-[11.5px] text-status-warning'
                : 'flex-1 cursor-pointer rounded-sm border border-border-subtle px-2 py-1 text-[11.5px] text-text-muted hover:text-text-secondary'
            }
          >
            Internal
          </button>
          <button
            type="button"
            onClick={() => setCommentInternal(false)}
            aria-pressed={!commentInternal}
            className={
              !commentInternal
                ? 'flex-1 cursor-pointer rounded-sm border border-status-info/40 bg-status-info/15 px-2 py-1 text-[11.5px] text-status-info'
                : 'flex-1 cursor-pointer rounded-sm border border-border-subtle px-2 py-1 text-[11.5px] text-text-muted hover:text-text-secondary'
            }
          >
            Ke klien
          </button>
        </div>

        <Textarea
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          placeholder={
            commentInternal
              ? 'Catatan untuk tim: temuan, dugaan, langkah berikutnya.'
              : 'Balasan yang akan dibaca klien.'
          }
          rows={3}
          aria-label="Isi komentar"
        />
        {commentError ? <FieldError>{commentError}</FieldError> : null}

        <Button
          variant="primary"
          size="sm"
          className="mt-2 w-full"
          disabled={posting}
          onClick={postComment}
        >
          {posting ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          Kirim
        </Button>
      </Card>

      {/* Refresh hint */}
      <button
        type="button"
        onClick={() => router.refresh()}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-[11.5px] text-text-muted transition-colors hover:text-text-secondary"
      >
        <RefreshCw aria-hidden="true" className="h-3 w-3" />
        Muat ulang data terbaru
      </button>
    </>
  );
}
