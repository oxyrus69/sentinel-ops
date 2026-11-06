'use client';

import { usePathname } from 'next/navigation';
import { AppSidebar, type NavItem } from '@/components/layout/app-sidebar';
import { TopBar } from '@/components/layout/app-topbar';
import { CommandPalette } from '@/components/ui/command-palette';
import { ShellProvider } from '@/components/layout/shell-provider';
import { buildBreadcrumb, printTargetFor } from '@/components/layout/nav-labels';
import type { UserRole } from '@/server/db/schema';

/**
 * The 5-zone shell.
 *
 * Zona A (rail) and Zona B (utility bar) are persistent; Zona C, D and E are
 * whatever the page renders inside `children` — the page owns its sub-header so
 * the view switcher, period filter, and primary action sit in one row with the
 * title instead of being duplicated by chrome.
 */

export interface AppShellProps {
  items: NavItem[];
  user: {
    fullName: string;
    email: string;
    role: UserRole;
    roleLabel: string;
    organizationName: string | null;
  };
  workspace: { name: string; detail: string };
  telemetry: { label: string; online: boolean };
  children: React.ReactNode;
}

export function AppShell({ items, user, workspace, telemetry, children }: AppShellProps) {
  const pathname = usePathname();
  const breadcrumb = buildBreadcrumb(pathname);
  const print = printTargetFor(pathname);

  return (
    <ShellProvider>
      <div className="flex min-h-screen">
        <AppSidebar items={items} user={user} workspace={workspace} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            breadcrumb={breadcrumb}
            user={{ fullName: user.fullName, roleLabel: user.roleLabel }}
            telemetry={telemetry}
            printHref={print?.href ?? null}
            printLabel={print?.label ?? null}
          />

          <main className="min-w-0 flex-1 px-3 pb-16 pt-3 sm:px-4 lg:px-6 lg:pb-10">
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>

      <CommandPalette
        items={items}
        topbarAction={print ? { href: print.href, label: print.label } : null}
      />
    </ShellProvider>
  );
}
