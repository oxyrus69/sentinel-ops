'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  AppWindow,
  ArrowRight,
  BookOpen,
  Download,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Radar,
  Search,
  ShieldCheck,
  TicketCheck,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useShell } from '@/components/layout/shell-provider';
import type { NavItem, NavIconName } from '@/components/layout/app-sidebar';

/**
 * Global command palette (Ctrl+K / Cmd+K).
 *
 * The single fastest route between any two screens: pages, quick actions, and
 * cross-module jumps in one list, filtered as the user types. Navigation runs
 * client-side; every action that mutates state stays a server action reached
 * through its page, so the palette never bypasses RBAC.
 */

const ICONS: Record<NavIconName, typeof Activity> = {
  dashboard: LayoutDashboard,
  assets: AppWindow,
  scanner: Radar,
  incidents: TicketCheck,
  vault: KeyRound,
  runbooks: BookOpen,
  dss: Gauge,
  portal: ShieldCheck,
  audit: Activity,
  settings: Users,
  users: Users,
};

interface PaletteEntry {
  id: string;
  group: 'Halaman' | 'Aksi cepat';
  label: string;
  hint?: string;
  href?: string;
  action?: () => void;
  icon?: NavIconName;
  /** Extra search terms (English/technical aliases) so both vocabularies hit. */
  keywords?: string;
}

/** Search aliases: the UI is Indonesian, but operators think in both. */
const KEYWORDS: Record<string, string> = {
  '/admin': 'dashboard dasbor command komando overview ringkasan home',
  '/assets': 'asset aset inventory inventaris website situs domain ssl uptime',
  '/scanner': 'scan scanner pemindai sandbox malware analysis analisis',
  '/scanner/rules': 'rules signature kamus detection deteksi regex',
  '/incidents': 'incident insiden ticket tiket sla queue antrean',
  '/vault': 'vault brankas credential kredensial password sandi secret',
  '/runbooks': 'runbook sop playbook procedure prosedur',
  '/dss': 'dss decision recommendation rekomendasi keputusan',
  '/dss/risiko': 'risk risiko matrix matriks vulnerability kerentanan',
  '/dss/sla': 'sla workload beban engineer teknisi compliance',
  '/dss/riwayat': 'history riwayat decisions log',
  '/admin/audit': 'audit jejak trail log activity aktivitas',
  '/admin/settings': 'settings pengaturan config konfigurasi sla threshold ambang',
  '/portal': 'portal client klien customer',
};

interface CommandPaletteProps {
  items: NavItem[];
  topbarAction?: { href: string; label: string } | null;
}

export function CommandPalette({ items, topbarAction }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { paletteOpen, openPalette, closePalette } = useShell();
  const open = paletteOpen;

  // Open via the top-bar trigger button or the Ctrl+K shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
      if (e.key === 'Escape') closePalette();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, openPalette, closePalette]);

  // Reset state on every open and focus the input.
  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close when navigating away, not on mount: the first run must not slam the
  // palette shut the moment a click opens it.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      closePalette();
    }
  }, [pathname, closePalette]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const pages: PaletteEntry[] = [];
    for (const item of items) {
      pages.push({
        id: `page:${item.href}`,
        group: 'Halaman',
        label: item.label,
        href: item.href,
        icon: item.icon,
        keywords: KEYWORDS[item.href],
      });
      for (const child of item.children ?? []) {
        pages.push({
          id: `page:${child.href}`,
          group: 'Halaman',
          label: child.label,
          hint: item.label,
          href: child.href,
          icon: item.icon,
          keywords: KEYWORDS[child.href],
        });
      }
    }

    const isAdminArea = pathname === '/admin';
    const isOps = items.some((i) => i.href === '/vault');

    const actions: PaletteEntry[] = [];
    if (topbarAction) {
      actions.push({
        id: 'action:print',
        group: 'Aksi cepat',
        label: topbarAction.label,
        hint: 'Laporan A4 dari data halaman ini',
        href: topbarAction.href,
        icon: 'settings',
        keywords: 'print cetak report laporan a4 pdf export',
      });
    }
    if (isOps || pathname === '/admin' || isAdminArea) {
      actions.push(
        {
          id: 'action:export-assets',
          group: 'Aksi cepat',
          label: 'Ekspor CSV inventaris aset',
          action: () => {
            window.location.href = '/api/export/assets';
          },
          icon: 'assets',
          keywords: 'export ekspor csv download unduh assets aset excel',
        },
        {
          id: 'action:export-incidents',
          group: 'Aksi cepat',
          label: 'Ekspor CSV tiket insiden',
          action: () => {
            window.location.href = '/api/export/incidents';
          },
          icon: 'incidents',
          keywords: 'export ekspor csv download unduh incidents tiket excel',
        },
      );
    }
    if (isOps) {
      actions.push({
        id: 'action:scan',
        group: 'Aksi cepat',
        label: 'Buka sandbox pemindai',
        href: '/scanner',
        icon: 'scanner',
        keywords: 'scan pindai sandbox html analyze analisis',
      });
    }
    return [...actions, ...pages];
  }, [items, pathname, topbarAction]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.label, e.hint ?? '', e.keywords ?? ''].join(' ').toLowerCase().includes(q),
    );
  }, [entries, query]);

  const groups = useMemo(() => {
    const out: Array<{ group: string; entries: Array<{ entry: PaletteEntry; flat: number }> }> = [];
    let flat = 0;
    for (const name of ['Aksi cepat', 'Halaman'] as const) {
      const inGroup = filtered
        .map((entry, i) => ({ entry, i }))
        .filter(({ entry }) => entry.group === name);
      if (inGroup.length === 0) continue;
      out.push({
        group: name,
        entries: inGroup.map(({ entry }) => {
          const row = { entry, flat };
          flat += 1;
          return row;
        }),
      });
    }
    // If the flat numbering above miscounts because a group was skipped,
    // re-number to keep keyboard navigation exact.
    let n = 0;
    for (const g of out) for (const row of g.entries) row.flat = n++;
    return out;
  }, [filtered]);

  function run(entry: PaletteEntry) {
    if (entry.href) {
      router.push(entry.href);
    } else {
      entry.action?.();
    }
    closePalette();
  }

  function onListKey(e: React.KeyboardEvent) {
    const total = filtered.length;
    if (total === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + total) % total);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(filtered[cursor]!);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]" role="presentation" onClick={closePalette}>
      <div className="absolute inset-0 bg-[rgb(11_15_20_/_0.72)]" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palet perintah"
        className="absolute inset-x-0 top-[12vh] mx-auto w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-md border border-border-strong bg-surface-overlay shadow-[0_8px_24px_rgb(0_0_0_/_0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-3.5">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onListKey}
            placeholder="Cari halaman atau aksi…"
            aria-label="Cari halaman atau aksi"
            className="h-11 w-full bg-transparent text-[13.5px] text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={closePalette}
            aria-label="Tutup"
            className="cursor-pointer rounded-sm p-1 text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[46vh] overflow-y-auto px-1.5 py-1.5">
          {groups.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-text-muted">
              Tidak ada hasil untuk “{query}”.
            </p>
          ) : (
            groups.map(({ group, entries: rows }) => (
              <div key={group} className="mb-1 last:mb-0">
                <p className="label-xs px-2.5 pb-1 pt-2">{group}</p>
                <ul role="listbox">
                  {rows.map(({ entry, flat }) => {
                    const Icon = entry.icon ? ICONS[entry.icon] : ArrowRight;
                    const isCursor = flat === cursor;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isCursor}
                          onMouseEnter={() => setCursor(flat)}
                          onClick={() => run(entry)}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[13px] transition-colors duration-fast',
                            isCursor
                              ? 'bg-accent-subtle text-text-primary'
                              : 'text-text-secondary hover:bg-surface-raised',
                          )}
                        >
                          <Icon
                            aria-hidden="true"
                            className={cn('h-4 w-4 shrink-0', isCursor ? 'text-accent' : 'text-text-muted')}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {entry.label}
                            {entry.hint ? (
                              <span className="ml-1.5 text-[11.5px] text-text-muted">· {entry.hint}</span>
                            ) : null}
                          </span>
                          {isCursor ? (
                            <kbd className="numeric rounded-sm border border-border-subtle bg-surface-sunken px-1.5 py-0.5 text-[10px] text-text-muted">
                              Enter
                            </kbd>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border-subtle px-3.5 py-2 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded-sm border border-border-subtle bg-surface-sunken px-1.5 py-0.5 text-[10px]">↑↓</kbd>
            navigasi
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded-sm border border-border-subtle bg-surface-sunken px-1.5 py-0.5 text-[10px]">Enter</kbd>
            buka
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded-sm border border-border-subtle bg-surface-sunken px-1.5 py-0.5 text-[10px]">Esc</kbd>
            tutup
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Download aria-hidden="true" className="h-3 w-3" />
            ekspor tersedia via “Aksi cepat”
          </span>
        </div>
      </div>
    </div>
  );
}
