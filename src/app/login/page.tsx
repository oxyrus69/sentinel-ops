import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { getSessionUser } from '@/server/auth/session';
import { ROLE_HOME } from '@/server/rbac';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Masuk',
  description: 'Masuk ke konsol Sentinel Ops.',
};

export default async function LoginPage() {
  // Already signed in: go straight to the role's landing page.
  const user = await getSessionUser();
  if (user) redirect(ROLE_HOME[user.role] ?? '/admin');

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent">
            <ShieldCheck aria-hidden="true" className="h-5 w-5 text-text-inverse" />
          </span>
          <h1 className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.01em] text-text-primary">
            Sentinel Ops
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
            Konsol pemantauan keamanan aset web. Masuk untuk mengelola aset,
            menangani insiden, dan membuka brankas kredensial.
          </p>
        </div>

        <LoginForm />

        <div className="mt-8 border-t border-border-subtle pt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
            Akun demo (kata sandi: sentinel123)
          </p>
          <ul className="space-y-1 text-[12px] text-text-muted">
            {[
              ['admin@sentinel.id', 'Super Admin'],
              ['secops@sentinel.id', 'SecOps Engineer'],
              ['support@sentinel.id', 'Support Agent'],
              ['rektorat@kampus-nusantara.ac.id', 'Klien'],
            ].map(([email, role]) => (
              <li key={email} className="flex items-baseline justify-between gap-3">
                <span className="numeric min-w-0 truncate text-text-secondary">{email}</span>
                <span className="shrink-0">{role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
