'use client';

import { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Label } from '@/components/ui/field';
import { loginAction, type LoginState } from '@/server/auth/actions';

/**
 * Login form.
 *
 * Calls the Server Action directly from onSubmit instead of going through
 * `useActionState`. With useActionState the form becomes a progressive-
 * enhancement form whose hidden action fields must round-trip exactly; any
 * mismatch makes React silently drop the action, which presents as a login
 * button that does nothing. A direct call keeps the contract explicit.
 *
 * The action writes the session row and returns its id. The cookie itself is
 * committed by /api/auth/session, because a Server Action's Set-Cookie is not
 * reliably delivered to the browser. Navigation happens only after the cookie
 * is stored, so the first request after login is already authenticated.
 */
export function LoginForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    setPending(true);
    setError(null);

    let state: LoginState;
    try {
      state = await loginAction(
        { error: null, redirectTo: null },
        formData,
      );
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan yang tidak terduga.');
      return;
    }

    if (state.error || !state.redirectTo) {
      setPending(false);
      setError(state.error ?? 'Email atau kata sandi salah.');
      return;
    }

    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId }),
        // Cookies must be committed before navigation; default credentials mode
        // already sends them, this just makes the intent explicit.
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Sesi gagal disimpan.');
      }
    } catch {
      setPending(false);
      setError('Sesi berhasil dibuat tetapi cookie tidak tersimpan. Coba lagi.');
      return;
    }

    setPending(false);
    // A full document navigation (not router.replace) guarantees the next
    // request carries the cookie that was just written. A soft client-side
    // navigation can race the cookie commit and bounce straight back to /login.
    window.location.assign(state.redirectTo);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-0" noValidate>
      <Field>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="nama@organisasi.id"
          required
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
        />
      </Field>

      <Field>
        <Label htmlFor="password">Kata sandi</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            disabled={pending}
            className="pr-10"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-sm p-1 text-text-muted transition-colors duration-fast hover:text-text-primary"
            aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>

      {error ? (
        <div
          id="login-error"
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-sm border border-danger/40 bg-danger-subtle px-3 py-2 text-[12.5px] leading-relaxed text-danger"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            Memeriksa…
          </>
        ) : (
          'Masuk'
        )}
      </Button>
    </form>
  );
}
