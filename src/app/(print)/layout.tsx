/**
 * Print layout for A4 reports.
 *
 * A separate route group so reports never inherit the app shell: no sidebar, no
 * top bar, white paper in print, and a print button that hides itself inside
 * @media print. Colors are forced to their print-safe solid values because
 * dark-mode surfaces would waste ink and lose contrast on paper.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-black print:bg-white">
      <style>{`
        @page {
          size: A4;
          margin: 14mm;
        }

        @media print {
          html, body {
            background: #fff !important;
            color: #000 !important;
          }
          .print-hidden { display: none !important; }
          .print-break-before { break-before: page; }
          .print-avoid-break { break-inside: avoid; }
          a[href]::after { content: ""; }
        }

        @media screen {
          .print-sheet {
            max-width: 210mm;
            margin: 0 auto;
            padding: 14mm;
            background: #fff;
            box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
          }
        }
      `}</style>

      <div className="print-hidden sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-2.5">
        <span className="text-[12px] font-medium text-neutral-600">
          Pratinjau cetak A4 · Sentinel Ops
        </span>
        <a
          href="/admin"
          className="text-[12px] text-neutral-500 hover:text-neutral-900"
        >
          Kembali ke aplikasi
        </a>
      </div>

      <div className="print-sheet">{children}</div>
    </div>
  );
}
