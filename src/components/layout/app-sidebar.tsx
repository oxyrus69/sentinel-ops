'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Activity,
  AppWindow,
  BookOpen,
  ChevronsUpDown,
  Circle,
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
import { LogoutButton } from '@/components/layout/logout-button';
import { useShell } from '@/components/layout/shell-provider';
import type { UserRole } from '@/server/db/schema';

/**
 * Collapsible navigation rail (Zona A).
 *
 * Expanded 240px with grouped menus and live counters; collapsed 64px shows
 * icons only with accessible labels. Groups follow the business domains from
 * the spec (Operasional, Analitik & DSS, Keamanan & Audit, Konfigurasi), so a
 * long menu stays scannable instead of becoming one flat list.
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

/** Business-domain grouping of the menu, keyed by href prefix. */
const GROUPS: Array<{ id: string; label: string; hrefs: string[] }> = [
  { id: 'main', label: 'Ringkasan', hrefs: ['/admin', '/portal'] },
  { id: 'ops', label: 'Operasional', hrefs: ['/assets', '/scanner', '/incidents'] },
  { id: 'analytics', label: 'Analitik & DSS', hrefs: ['/dss'] },
  { id: 'security', label: 'Keamanan & Audit', hrefs: ['/vault', '/admin/audit'] },
  { id: 'reference', label: 'Referensi & Konfigurasi', hrefs: ['/runbooks', '/admin/settings'] },
];

export interface AppSidebarProps {
  items: NavItem[];
  user: {
    fullName: string;
    email: string;
    role: UserRole;
    organizationName: string | null;
  };
  workspace: { name: string; detail: string };
}

export function AppSidebar({ items, user, workspace }: AppSidebarProps) {
  const pathname = usePathname();
  const { collapsed } = useShell();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  const grouped = GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => group.hrefs.includes(item.href)),
  })).filter((g) => g.items.length > 0);

  // Anything the grouping table does not mention still has to appear.
  const placed = new Set(grouped.flatMap((g) => g.items.map((i) => i.href)));
  const leftover = items.filter((i) => !placed.has(i.href));
  if (leftover.length > 0) {
    grouped.push({ id: 'other', label: 'Lainnya', hrefs: [], items: leftover });
  }

  const navBody = (forceExpanded: boolean) => (
    <nav aria-label="Navigasi utama" className="flex h-full flex-col">
      {/* Brand + workspace switcher */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 border-b border-border-subtle',
          forceExpanded || !collapsed ? 'px-3 py-2.5' : 'justify-center px-2 py-2.5',
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-accent">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-text-inverse" />
        </span>
        {forceExpanded || !collapsed ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold leading-tight text-text-primary">
              Sentinel Ops
            </span>
            <span className="flex items-center gap-1 truncate text-[10.5px] leading-tight text-text-muted">
              <Circle aria-hidden="true" className="h-1.5 w-1.5 fill-current text-status-healthy" />
              {workspace.name}
            </span>
          </span>
        ) : null}
        {forceExpanded || !collapsed ? (
          <span
            aria-hidden="true"
            title={workspace.detail}
            className="shrink-0 rounded-sm p-0.5 text-text-muted"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>

      {/* Grouped items */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2">
        {grouped.map((group) => (
          <div key={group.id} className="mb-2 last:mb-0">
            {forceExpanded || !collapsed ? (
              <p className="label-xs px-2 pb-1 pt-1.5 text-[10px] text-text-muted">{group.label}</p>
            ) : (
              <div aria-hidden="true" className="mx-auto mb-1.5 mt-1 h-px w-6 bg-border-subtle" />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(item.href);
                const showLabel = forceExpanded || !collapsed;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      aria-label={showLabel ? undefined : item.label}
                      title={showLabel ? undefined : item.label}
                      className={cn(
                        'group relative flex items-center rounded-sm text-[13px] transition-colors duration-fast ease-standard',
                        showLabel ? 'gap-2.5 px-2 py-1.5' : 'h-9 justify-center px-0',
                        active
                          ? 'bg-accent-subtle text-accent'
                          : 'text-text-secondary hover:bg-surface-base hover:text-text-primary',
                      )}
                    >
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                      {showLabel ? (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {typeof item.count === 'number' && item.count > 0 ? (
                            <span
                              className={cn(
                                'numeric rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                item.tone === 'critical'
                                  ? 'bg-status-critical text-white'
                                  : item.tone === 'warning'
                                    ? 'bg-status-warning text-text-inverse'
                                    : 'bg-surface-base text-text-secondary',
                              )}
                            >
                              {item.count}
                            </span>
                          ) : null}
                        </>
                      ) : typeof item.count === 'number' && item.count > 0 ? (
                        <span
                          aria-hidden="true"
                          className={cn(
                            'absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full',
                            item.tone === 'critical' ? 'bg-status-critical' : 'bg-status-warning',
                          )}
                        />
                      ) : null}
                    </Link>

                    {showLabel && item.children && item.children.length > 0 && active ? (
                      <ul className="mb-1 ml-[22px] mt-0.5 space-y-0.5 border-l border-border-subtle pl-2.5">
                        {item.children.map((child) => (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={() => setMobileOpen(false)}
                              aria-current={pathname === child.href ? 'page' : undefined}
                              className={cn(
                                'block rounded-sm px-2 py-1 text-[12px] transition-colors duration-fast',
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
        ))}
      </div>

      {/* Footer: health + user + role */}
      <div className="shrink-0 border-t border-border-subtle p-2">
        {forceExpanded || !collapsed ? (
          <div className="mb-1.5 flex items-center gap-1.5 rounded-sm bg-surface-base px-2 py-1 text-[10.5px] text-text-muted">
            <Circle aria-hidden="true" className="h-1.5 w-1.5 fill-current text-status-healthy" />
            <span className="truncate">DB: Online</span>
            <span className="ml-auto shrink-0 rounded-sm border border-border-subtle px-1 text-[9.5px] text-text-secondary">
              {ROLE_BADGE[user.role]}
            </span>
          </div>
        ) : null}
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-sm',
            forceExpanded || !collapsed ? 'px-2 py-1.5' : 'justify-center py-1.5',
          )}
          title={forceExpanded || !collapsed ? undefined : `${user.fullName} · ${ROLE_BADGE[user.role]}`}
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-base text-[10.5px] font-semibold text-text-secondary"
          >
            {initials(user.fullName)}
          </span>
          {forceExpanded || !collapsed ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium leading-tight text-text-primary">
                {user.fullName}
              </span>
              <span className="block truncate text-[10.5px] leading-tight text-text-muted">
                {user.organizationName ?? ROLE_BADGE[user.role]}
              </span>
            </span>
          ) : null}
        </div>
        {forceExpanded || !collapsed ? <LogoutButton /> : null}
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border border-border-subtle bg-surface-raised text-text-secondary lg:hidden"
        aria-label="Buka menu navigasi"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Desktop rail */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 self-start border-r border-border-subtle bg-surface-raised transition-[width] duration-base ease-standard lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {navBody(false)}
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
              className="absolute right-2.5 top-3 z-10 cursor-pointer rounded-sm p-1 text-text-muted hover:text-text-primary"
              aria-label="Tutup menu"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {navBody(true)}
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
