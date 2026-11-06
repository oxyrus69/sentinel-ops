import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Root 404.
 *
 * Dynamic segments (`/assets/[id]`, `/runbooks/[id]`, `/reports/asset/[id]`)
 * guard their uuid before querying, so a mistyped or stale link lands here
 * instead of 500ing on a Postgres cast error. Without this file Next.js renders
 * its own light-on-white error screen, which reads as a crash inside a dark
 * workspace.
 *
 * Deliberately not a card: one line of what happened, one line of what to do,
 * one way back. No illustration, no search box that cannot know the intent.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-[46ch]">
        <p className="label-xs text-[11px] text-text-muted">Galat 404</p>

        <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-text-primary">
          Halaman tidak ditemukan
        </h1>

        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          Alamat ini tidak cocok dengan data mana pun. Periksa kembali tautannya,
          atau kembali ke dasbor dan cari dari daftar modul.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
          <Link
            href="/admin"
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-sm bg-accent px-4 text-[13px] font-medium text-text-inverse transition-colors duration-fast ease-standard hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            Kembali ke dasbor
          </Link>
          <Link
            href="/assets"
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-sm border border-border-subtle bg-surface-overlay px-4 text-[13px] font-medium text-text-primary transition-colors duration-fast ease-standard hover:border-border-strong hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Buka inventaris aset
          </Link>
        </div>
      </div>
    </main>
  );
}
