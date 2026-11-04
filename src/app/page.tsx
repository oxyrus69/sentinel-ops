import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { ROLE_HOME } from '@/server/rbac';

/** Entry point: send each role to its landing page. */
export default async function IndexPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  redirect(ROLE_HOME[user.role] ?? '/admin');
}
