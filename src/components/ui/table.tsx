import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Table primitives.
 *
 * Desktop renders a real <table> with a sticky monospace header; mobile swaps
 * to stacked cards via `DataTable`. Numbers always use the `numeric` utility so
 * digits align in a column.
 */

export function TableWrap({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('w-full overflow-x-auto rounded-md border border-border-subtle', className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-[13px]', className)} {...props} />;
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-surface-sunken', className)} {...props} />;
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border-subtle', className)} {...props} />;
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('transition-colors duration-fast ease-standard hover:bg-surface-overlay/60', className)}
      {...props}
    />
  );
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'label-xs sticky top-0 z-10 whitespace-nowrap border-b border-border-subtle bg-surface-sunken px-3 py-2.5 text-left',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle text-text-primary', className)} {...props} />;
}

/** Right-aligned numeric cell. */
export function TDNum({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <TD className={cn('numeric text-right', className)} {...props} />;
}

/** Muted secondary cell, e.g. a timestamp or hostname. */
export function TDMuted({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <TD className={cn('text-text-secondary', className)} {...props} />;
}

/** Empty state rendered inside a table body. */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-[13px] text-text-muted">
        {children}
      </td>
    </tr>
  );
}
