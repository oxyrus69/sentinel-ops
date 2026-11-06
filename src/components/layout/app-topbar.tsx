'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  ChevronRight,
  Circle,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useShell } from '@/components/layout/shell-provider';

/**
 * Top global utility bar (Zona B).
 *
 * Carries the breadcrumb trail, the Ctrl+K trigger, the notification bell
 * popover, system telemetry, and page-print. Height 48px, sticky. The sidebar
 * collapse button lives here because it resizes the zone below, not this one.
 */

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
}

const KIND_TONE: Record<string, string> = {
  SLA_WARNING: 'bg-status-warning',
  SLA_BREACH: 'bg-status-critical',
  ASSET_COMPROMISED: 'bg-status-critical',
  ASSET_DOWN: 'bg-status-critical',
  SSL_EXPIRING: 'bg-status-warning',
  INCIDENT_ASSIGNED: 'bg-status-info',
  INCIDENT_COMMENT: 'bg-status-info',
  VAULT_ACCESS: 'bg-status-warning',
  SYSTEM: 'bg-status-neutral',
};

export interface TopBarProps {
  breadcrumb: Array<{ label: string; href?: string }>;
  user: { fullName: string; roleLabel: string };
  telemetry: { label: string; online: boolean };
  printHref: string | null;
  printLabel: string | null;
}

export function TopBar({ breadcrumb, user, telemetry, printHref, printLabel }: TopBarProps) {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed, openPalette } = useShell();
  const [bellOpen, setBellOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  async function loadNotifications() {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { items: NotificationItem[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      // Silent: the bell must never break the bar.
    }
  }

  useEffect(() => {
    loadNotifications();
  }, [pathname]);

  useEffect(() => {
    if (!bellOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [bellOpen]);

  async function markAllRead() {
    setBellOpen(false);
    setUnread(0);
    setItems((prev) => prev?.map((i) => ({ ...i, isRead: true })) ?? null);
    try {
      await fetch('/api/notifications', { method: 'POST' });
    } catch {
      // Re-labelled locally; next load corrects.
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-base pl-12 pr-3 sm:pr-4 lg:pl-3">
      {/* pl-12 clears the mobile hamburger (fixed left-3, 32px wide); lg+
          replaces it with the in-bar collapse toggle, so normal padding
          resumes there. */}
      {/* Sidebar toggle (desktop only) */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-sm text-text-muted transition-colors duration-fast hover:bg-surface-raised hover:text-text-primary lg:flex"
        aria-label={collapsed ? 'Bentangkan navigasi' : 'Ciutkan navigasi'}
        aria-pressed={collapsed}
        title={collapsed ? 'Bentangkan navigasi' : 'Ciutkan navigasi'}
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
        ) : (
          <PanelLeftClose aria-hidden="true" className="h-4 w-4" />
        )}
      </button>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
        <ol className="flex items-center gap-1 whitespace-nowrap text-[12.5px] text-text-muted">
          {breadcrumb.map((crumb, i) => (
            <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 ? (
                <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-border-strong" />
              ) : null}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="truncate transition-colors duration-fast hover:text-text-secondary"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="truncate text-text-secondary">
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Ctrl+K trigger */}
      <button
        type="button"
        onClick={openPalette}
        className="hidden h-8 cursor-pointer items-center gap-2 rounded-sm border border-border-subtle bg-surface-sunken px-2.5 text-[12.5px] text-text-muted transition-colors duration-fast hover:border-border-strong hover:text-text-secondary md:flex"
        aria-label="Buka palet perintah (Ctrl+K)"
      >
        <Search aria-hidden="true" className="h-3.5 w-3.5" />
        <span>Cari…</span>
        <kbd className="numeric rounded-sm border border-border-subtle bg-surface-raised px-1.5 py-0.5 text-[10px]">
          Ctrl K
        </kbd>
      </button>

      {/* Mobile search trigger: same palette */}
      <button
        type="button"
        onClick={openPalette}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm text-text-muted hover:bg-surface-raised md:hidden"
        aria-label="Cari"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
      </button>

      {/* Telemetry pill */}
      <span
        className="hidden items-center gap-1.5 rounded-full border border-border-subtle bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-text-secondary xl:inline-flex"
        title="Status koneksi ke basis data aplikasi"
      >
        <Circle
          aria-hidden="true"
          className={cn(
            'h-2 w-2 fill-current',
            telemetry.online ? 'text-status-healthy' : 'text-status-critical',
          )}
        />
        {telemetry.label}
      </span>

      {/* Print quick action */}
      {printHref ? (
        <Link
          href={printHref}
          title={printLabel ?? 'Cetak laporan'}
          className="hidden h-8 w-8 items-center justify-center rounded-sm text-text-muted transition-colors duration-fast hover:bg-surface-raised hover:text-text-primary lg:flex"
        >
          <Printer aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">{printLabel ?? 'Cetak laporan'}</span>
        </Link>
      ) : null}

      {/* Notification bell */}
      <div className="relative" ref={bellRef}>
        <button
          type="button"
          onClick={() => {
            setBellOpen((v) => !v);
            if (!bellOpen) loadNotifications();
          }}
          className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm text-text-muted transition-colors duration-fast hover:bg-surface-raised hover:text-text-primary"
          aria-label={`Notifikasi${unread > 0 ? `, ${unread} belum dibaca` : ''}`}
          aria-expanded={bellOpen}
        >
          <Bell aria-hidden="true" className="h-4 w-4" />
          {unread > 0 ? (
            <span className="numeric absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-critical px-0.5 text-[9.5px] font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>

        {bellOpen ? (
          <div className="absolute right-0 top-10 w-[340px] overflow-hidden rounded-md border border-border-strong bg-surface-overlay shadow-[0_8px_24px_rgb(0_0_0_/_0.5)]">
            <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2.5">
              <p className="text-[13px] font-semibold text-text-primary">Notifikasi</p>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="cursor-pointer text-[11.5px] text-accent hover:underline"
                >
                  Tandai semua dibaca
                </button>
              ) : null}
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {items === null ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-text-muted">Memuat…</p>
              ) : items.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-text-muted">
                  Belum ada notifikasi.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {items.map((n) => (
                    <li
                      key={n.id}
                      className={cn('flex gap-2.5 px-3 py-2.5', !n.isRead && 'bg-surface-raised/60')}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          KIND_TONE[n.kind] ?? 'bg-status-neutral',
                        )}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-text-primary">
                          {n.title}
                        </p>
                        {n.body ? (
                          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-text-secondary">
                            {n.body}
                          </p>
                        ) : null}
                        <p className="numeric mt-0.5 text-[10.5px] text-text-muted">
                          {formatStamp(n.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* User pill */}
      <span
        className="hidden h-8 items-center gap-2 rounded-sm border border-border-subtle bg-surface-sunken pl-1.5 pr-2.5 sm:flex"
        title={`${user.fullName} · ${user.roleLabel}`}
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-overlay text-[9.5px] font-semibold text-text-secondary"
        >
          {user.fullName
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p.charAt(0).toUpperCase())
            .join('')}
        </span>
        <span className="max-w-[140px] truncate text-[12px] font-medium text-text-primary">
          {user.fullName}
        </span>
        <span className="hidden max-w-[110px] truncate text-[10.5px] text-text-muted lg:inline">
          {user.roleLabel}
        </span>
      </span>
    </header>
  );
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}
