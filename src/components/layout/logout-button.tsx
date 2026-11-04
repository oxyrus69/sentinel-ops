'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { logoutAction } from '@/server/auth/actions';

/**
 * Logout trigger.
 *
 * Same reasoning as login: the action clears the cookie, the client navigates
 * afterwards. Kept as its own component so the sidebar stays a server-rendered
 * shell and does not need 'use client' for a single button.
 */
export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await logoutAction();
          router.replace('/login');
          router.refresh();
        });
      }}
      className="mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[12.5px] text-text-secondary transition-colors duration-fast hover:bg-surface-raised hover:text-text-primary disabled:opacity-50"
    >
      <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
      {pending ? 'Keluar…' : 'Keluar'}
    </button>
  );
}
