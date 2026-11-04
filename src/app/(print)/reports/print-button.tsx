'use client';

import { Printer } from 'lucide-react';

/** Calls the browser print dialog. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex cursor-pointer items-center gap-2 rounded-sm bg-black px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-80"
    >
      <Printer aria-hidden="true" className="h-3.5 w-3.5" />
      Cetak / Simpan PDF
    </button>
  );
}
