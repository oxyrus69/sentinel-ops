import { requireSession } from '@/server/auth/guard';
import { buildNav } from '@/components/layout/nav-config';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { ToastProvider } from '@/components/ui/toast-provider';

/**
 * Authenticated shell.
 *
 * Owns the sidebar, the toast host, and the confirmation dialog host. Every
 * page under (app) renders inside this, so none of them re-implement chrome.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const items = await buildNav(user);

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <AppSidebar
          items={items}
          user={{
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            organizationName: user.organizationName,
          }}
        />
        <main className="min-w-0 flex-1 px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pt-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
