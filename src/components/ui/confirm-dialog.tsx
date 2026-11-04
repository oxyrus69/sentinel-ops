'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Confirmation dialog.
 *
 * Used before destructive or security-sensitive actions (delete asset, reveal a
 * vault secret, record a DSS decision). A promise-returning `confirm()` keeps
 * call sites linear instead of juggling open-state.
 */

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = useCallback(
    (value: boolean) => {
      setState((prev) => {
        prev?.resolve(value);
        return null;
      });
    },
    [],
  );

  const dialog = (
    <Dialog.Root open={state !== null} onOpenChange={(open) => !open && close(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-[rgb(11_15_20_/_0.72)] data-[state=open]:opacity-100" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[91] w-[calc(100vw-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-surface-overlay p-5"
          onEscapeKeyDown={() => close(false)}
        >
          <div className="flex items-start gap-3">
            {state?.tone === 'danger' ? (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-subtle">
                <AlertTriangle aria-hidden="true" className="h-4 w-4 text-danger" />
              </span>
            ) : null}
            <div className="min-w-0">
              <Dialog.Title className="text-[15px] font-semibold text-text-primary">
                {state?.title}
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[13px] leading-relaxed text-text-secondary text-balance-pretty">
                {state?.description}
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>
              {state?.cancelLabel ?? 'Batal'}
            </Button>
            <Button
              variant={state?.tone === 'danger' ? 'danger' : 'primary'}
              onClick={() => close(true)}
            >
              {state?.confirmLabel ?? 'Lanjutkan'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );

  return { confirm, dialog };
}
