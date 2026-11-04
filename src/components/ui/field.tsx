import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Form controls.
 *
 * Sunken fill + 1px subtle border, accent focus ring (DESIGN.md §8). Error state
 * always pairs a red border with a text message; never color alone.
 */

const baseField =
  'w-full rounded-sm border border-border-subtle bg-surface-sunken px-3 text-[13px] text-text-primary placeholder:text-text-muted transition-colors duration-fast ease-standard hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(baseField, 'h-9', className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(baseField, 'min-h-[88px] py-2 leading-relaxed', className)}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(baseField, 'h-9 cursor-pointer pr-8', className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-[13px] font-medium text-text-primary', className)}
      {...props}
    />
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">{children}</p>;
}

export function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-danger">
      <span aria-hidden="true" className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-danger" />
      {children}
    </p>
  );
}

export function Field({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

/** Inline checkbox + label row, used in filters and form toggles. */
export function CheckboxField({
  id,
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 cursor-pointer rounded-sm border border-border-strong bg-surface-sunken accent-accent"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[13px] text-text-primary">
          {label}
        </label>
        {hint ? <p className="text-[12px] text-text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}
