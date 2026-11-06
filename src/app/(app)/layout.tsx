import { requireSession } from '@/server/auth/guard';
import { buildNav } from '@/components/layout/nav-config';
import { AppShell } from '@/components/layout/app-shell';
import { ToastProvider } from '@/components/ui/toast-provider';
import { ROLE_LABEL } from '@/server/rbac';

/**
 * Authenticated shell.
 *
 * Owns Zona A (navigation rail), Zona B (top utility bar), the command palette,
 * the toast host, and the confirmation dialog host. Every page under (app)
 * renders inside this, so none of them re-implement chrome.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const items = await buildNav(user);

  return (
    <ToastProvider>
      <AppShell
        items={items}
        user={{
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          roleLabel: ROLE_LABEL[user.role],
          organizationName: user.organizationName,
        }}
        workspace={{
          name: user.organizationName ?? 'Sentinel SecOps',
          detail: `Masuk sebagai ${ROLE_LABEL[user.role]}`,
        }}
        telemetry={{ label: 'DB Online', online: true }}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
