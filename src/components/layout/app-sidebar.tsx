'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Activity,
  AppWindow,
  BookOpen,
  ChevronLeft,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Menu,
  Radar,
  ShieldCheck,
  TicketCheck,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { LogoutButton } from '@/components/layout/logout-button';
import type { UserRole } from '@/server/db/schema';

/**
 * Adaptive sidebar.
 *
 * Items are filtered by role on the server and passed in, so a role never
 * receives a link it cannot open. Desktop shows labels; tablet collapses to
 * icons; mobile becomes a drawer.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  /** Optional count badge, e.g. active incidents. */
  count?: number;
  /** Alert tone for the count badge. */
  tone?: 'neutral' | 'critical' | 'warning';
  /** Nested items, rendered as an indented group. */
  children?: Array<{ href: string; label: string }>;
}

export type NavIconName =
  | 'dashboard'
  | 'assets'
  | 'scanner'
  | 'incidents'
  | 'vault'
  | 'runbooks'
  | 'dss'
  | 'portal'
  | 'audit'
  | 'settings'
  | 'users';

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

const ROLE_BADGE: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SECOPS_ENGINEER: 'SecOps',
  SUPPORT_AGENT: 'Support',
  CLIENT_OWNER: 'Klien',
};

export interface AppSidebarProps {
  items: NavItem[];
  user: {
    fullName: string;
    email: string;
    role: UserRole;
    organizationName: string | null;
  };
}

export function AppSidebar({ items, user }: AppSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  const nav = (
    <nav aria-label="Navigasi utama" className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border-subtle px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-accent">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-text-inverse" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-tight text-text-primary">
            Sentinel Ops
          </span>
          <span className="block text-[11px] leading-tight text-text-muted">
            Keamanan Aset Web
          </span>
        </span>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] transition-colors duration-fast ease-standard',
                    active
                      ? 'bg-accent-subtle text-accent'
                      : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {typeof item.count === 'number' && item.count > 0 ? (
                    <span
                      className={cn(
                        'numeric rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        item.tone === 'critical'
                          ? 'bg-status-critical text-white'
                          : item.tone === 'warning'
                            ? 'bg-status-warning text-text-inverse'
                            : 'bg-surface-overlay text-text-secondary',
                      )}
                    >
                      {item.count}
                    </span>
                  ) : null}
                </Link>

                {item.children && item.children.length > 0 && active ? (
                  <ul className="mb-1 ml-[26px] mt-0.5 space-y-0.5 border-l border-border-subtle pl-2.5">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={pathname === child.href ? 'page' : undefined}
                          className={cn(
                            'block rounded-sm px-2 py-1.5 text-[12.5px] transition-colors duration-fast',
                            pathname === child.href
                              ? 'text-accent'
                              : 'text-text-muted hover:text-text-primary',
                          )}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {/* User */}
      <div className="shrink-0 border-t border-border-subtle p-2">
        <div className="flex items-center gap-2.5 rounded-sm px-2 py-1.5">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-[11px] font-semibold text-text-secondary"
          >
            {initials(user.fullName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium leading-tight text-text-primary">
              {user.fullName}
            </span>
            <span className="block truncate text-[11px] leading-tight text-text-muted">
              {user.organizationName ?? ROLE_BADGE[user.role]}
            </span>
          </span>
        </div>
        <LogoutButton />
      </div>
    </nav>
  );
  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm border border-border-subtle bg-surface-raised text-text-secondary lg:hidden"
        aria-label="Buka menu navigasi"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Desktop rail */}
      <aside className="hidden w-[248px] shrink-0 border-r border-border-subtle bg-surface-raised lg:block">
        {nav}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-[rgb(11_15_20_/_0.72)]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-[268px] border-r border-border-strong bg-surface-raised">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3.5 z-10 cursor-pointer rounded-sm p-1 text-text-muted hover:text-text-primary"
              aria-label="Tutup menu"
            >
              <X className="h-4 w-4" />
            </button>
            {nav}
          </div>
        </div>
      ) : null}
    </>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

export { ChevronLeft };
