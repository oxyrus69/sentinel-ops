/**
 * Database mode detection (plain JavaScript).
 *
 * The CLI scripts are `.mjs` and run under plain Node, so they cannot import the
 * TypeScript module in `src/server/db/mode.ts`. Rather than duplicating the rule
 * in three places — app, migrate script, seed script — this file is the single
 * implementation, and `src/server/db/mode.ts` re-exports it with types on top.
 *
 * If you change the rule, change it here only.
 */

/** Prefixes that mean "a real PostgreSQL server over the network". */
const NETWORK_PREFIXES = ['postgres://', 'postgresql://'];

/** Prefixes that explicitly mean "embedded, ignore the rest of the string". */
const EMBEDDED_PREFIXES = ['pglite://', 'file:', 'memory://'];

/** Default data directory for embedded mode. Ignored by Git. */
export const DEFAULT_PGLITE_DIR = '.data/pglite';

/**
 * Resolve the active mode from an environment object.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {'pglite' | 'postgres'}
 */
export function resolveDbMode(env = process.env) {
  const rawUrl = String(env.DATABASE_URL ?? '').trim();
  const lowerUrl = rawUrl.toLowerCase();

  if (!rawUrl) {
    return forceNetwork(env) ? 'postgres' : 'pglite';
  }

  if (EMBEDDED_PREFIXES.some((prefix) => lowerUrl.startsWith(prefix))) return 'pglite';
  if (NETWORK_PREFIXES.some((prefix) => lowerUrl.startsWith(prefix))) return 'postgres';

  // An unrecognised scheme is a configuration mistake. Failing loudly is far
  // better than silently opening an empty embedded database, which would make an
  // operator think their data had vanished.
  throw new Error(
    `DATABASE_URL tidak dikenali: "${rawUrl.slice(0, 32)}...". ` +
      'Gunakan postgresql://user:pass@host:5432/db untuk server, ' +
      'atau kosongkan untuk mode demo (PGlite embedded).',
  );
}

/** True when the operator forced the network driver via the legacy variable. */
function forceNetwork(env) {
  const driver = String(env.DATABASE_DRIVER ?? '')
    .trim()
    .toLowerCase();
  return driver === 'postgres-js' || driver === 'postgres' || driver === 'pg';
}

/** Directory used by embedded mode. */
export function resolvePgliteDir(env = process.env) {
  const dir = String(env.PGLITE_DATA_DIR ?? '').trim();
  return dir.length > 0 ? dir : DEFAULT_PGLITE_DIR;
}

/**
 * Human-readable description of the active mode, used by /api/health and the
 * settings screen. Never echoes credentials.
 */
export function describeDbMode(env = process.env) {
  const mode = resolveDbMode(env);
  if (mode === 'pglite') return 'PGlite (embedded)';
  const url = String(env.DATABASE_URL ?? '').trim();
  const host = url.replace(/^postgres(ql)?:\/\//, '').split('@').pop()?.split('/')[0] ?? '';
  return `PostgreSQL server${host ? ` (${host})` : ''}`;
}
