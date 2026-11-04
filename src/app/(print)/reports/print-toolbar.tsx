import { PrintButton } from './print-button';

/**
 * Trigger for window.print().
 *
 * Client component because printing is a browser action. Hidden while printing
 * so the button never appears on paper.
 */
export function PrintToolbar({ title }: { title: string }) {
  return (
    <div className="print-hidden mb-6 flex items-center justify-between gap-3 border-b border-neutral-200 pb-3">
      <span className="text-[12px] text-neutral-500">{title}</span>
      <PrintButton />
    </div>
  );
}
