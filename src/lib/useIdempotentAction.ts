'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Idempotent action helper (client half of the contract).
 *
 * Spec §7.1 requires that critical form submissions carry a `requestId` and are
 * guarded against double clicks. This hook:
 *
 *   1. generates one requestId per logical attempt (regenerated only after a
 *      success or a definitive failure),
 *   2. synchronously locks with a ref before the Server Action is called, so a
 *      second click during the same tick cannot start another call,
 *   3. exposes `pending` for disabling the trigger.
 *
 * The server half is `withIdempotency()` in src/server/idempotency.ts, which
 * inserts the requestId with ON CONFLICT DO NOTHING.
 */

export interface IdempotentResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: 'CONFLICT' | 'VALIDATION_ERROR' | 'ACCESS_DENIED' | 'UNKNOWN';
}

export function useIdempotentAction<TInput, TResult>(
  action: (input: TInput & { requestId: string }) => Promise<IdempotentResult<TResult>>,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TResult | null>(null);

  // Synchronous lock: state updates are async, refs are not.
  const locked = useRef(false);
  const requestIdRef = useRef<string>(newRequestId());

  const run = useCallback(
    async (input: TInput): Promise<IdempotentResult<TResult>> => {
      if (locked.current) {
        return { ok: false, error: 'Permintaan sedang diproses.', code: 'UNKNOWN' };
      }
      locked.current = true;
      setPending(true);
      setError(null);

      try {
        const response = await action({ ...input, requestId: requestIdRef.current });

        if (response.ok) {
          setResult(response.data ?? null);
          // Fresh id for the next distinct attempt.
          requestIdRef.current = newRequestId();
        } else {
          setError(response.error ?? 'Terjadi kesalahan.');
          // A conflict or validation error is retryable with a new id.
          if (response.code === 'CONFLICT' || response.code === 'VALIDATION_ERROR') {
            requestIdRef.current = newRequestId();
          }
        }

        return response;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Terjadi kesalahan yang tidak terduga.';
        setError(message);
        requestIdRef.current = newRequestId();
        return { ok: false, error: message, code: 'UNKNOWN' };
      } finally {
        locked.current = false;
        setPending(false);
      }
    },
    [action],
  );

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
    requestIdRef.current = newRequestId();
  }, []);

  return { run, pending, error, result, reset, requestId: requestIdRef };
}

/** crypto.randomUUID with a safe fallback for non-secure contexts. */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
