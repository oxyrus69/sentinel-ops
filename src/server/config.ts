import 'server-only';

/**
 * Runtime configuration resolved once from the environment.
 *
 * Centralised so a missing or malformed value fails at one obvious place instead
 * of producing a subtle behaviour difference (a Secure cookie on plain HTTP, an
 * absolute URL pointing at localhost in production).
 */

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Public base URL of this deployment, without a trailing slash. */
export const APP_URL: string = trimSlash(process.env.APP_URL ?? 'http://localhost:3000');

/** True when the deployment is served over HTTPS (enables Secure cookies). */
export const IS_HTTPS: boolean = APP_URL.startsWith('https://');

/** Scanner network settings. */
export const SCANNER_HTTP_TIMEOUT_MS = Number(process.env.SCANNER_HTTP_TIMEOUT_MS ?? 10_000);
export const SCANNER_DEFAULT_MODE: 'LIVE' | 'SIMULATED' =
  (process.env.SCANNER_DEFAULT_MODE ?? 'SIMULATED').toUpperCase() === 'LIVE' ? 'LIVE' : 'SIMULATED';
export const SCANNER_USER_AGENT =
  process.env.SCANNER_USER_AGENT ?? 'SentinelOps-SecurityMonitor/1.0';
