'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * InspectorDrawer — right slide-over (Zona E, Global Dashboard Design §4.4).
 *
 * Opens over the data table so the operator keeps the filter context, the row
 * they were comparing against, and their scroll position. Radix-free on
 * purpose: a fixed panel plus a scrim is smaller than a dialog primitive and
 * this panel is not trapped (the table behind stays keyboard-reachable).
 */

export interface InspectorDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Status badge row under the heading. */
  status?: ReactNode;
  /** Tab-like sections: label + body. The first is shown. */
  tabs?: Array<{ label: string; body: ReactNode }>;
  children?: ReactNode;
  /** Quick action buttons in the footer. */
  footer?: ReactNode;
}

export function InspectorDrawer({
  open,
  onClose,
  title,
  subtitle,
  status,
  tabs,
  children,
  footer,
}: InspectorDrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <div
        className="absolute inset-0 bg-[rgb(11_15_20_/_0.6)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="absolute inset-y-0 right-0 flex w-[min(480px,100vw)] flex-col border-l border-border-strong bg-surface-overlay shadow-[0_8px_24px_rgb(0_0_0_/_0.5)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold leading-tight text-text-primary">
              {title}
            </h2>
            {subtitle ? (
              <p className="numeric mt-0.5 truncate text-[12px] text-text-muted">{subtitle}</p>
            ) : null}
            {status ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{status}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel inspeksi"
            className="shrink-0 cursor-pointer rounded-sm p-1 text-text-muted transition-colors duration-fast hover:bg-surface-raised hover:text-text-primary"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5">
          {tabs && tabs.length > 0 ? (
            <div className="space-y-4">
              {tabs.map((tab) => (
                <section key={tab.label}>
                  <p className="label-xs mb-2 border-b border-border-subtle pb-1.5">{tab.label}</p>
                  {tab.body}
                </section>
              ))}
            </div>
          ) : (
            children
          )}
        </div>

        {/* Footer */}
        {footer ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-4 py-3">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

/** Definition row used inside an inspector body. */
export function InspectorField({
  label,
  children,
  numeric,
}: {
  label: string;
  children: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-1.5 last:border-0">
      <dt className="text-[12px] text-text-muted">{label}</dt>
      <dd className={cn('min-w-0 truncate text-right text-[12.5px] text-text-primary', numeric && 'numeric')}>
        {children}
      </dd>
    </div>
  );
}

export function InspectorSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <p className="label-xs mb-2 border-b border-border-subtle pb-1.5">{label}</p>
      {children}
    </section>
  );
}
