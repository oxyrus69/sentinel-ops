import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgliteQueryResultHKT } from 'drizzle-orm/pglite';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema';
import { resolveDbMode, resolvePgliteDir, type DbMode } from './mode';

export type DbDriver = 'pglite' | 'postgres-js';

/**
 * Shared database type.
 *
 * Both drivers produce a PgDatabase; only the result HKT differs. Casting the
 * executor to PgDatabase<PgliteQueryResultHKT> keeps full query-builder
 * inference (including .onConflictDoNothing().returning()) while the union
 * of the two concrete classes does not.
 */
export type SentinelDb = PgDatabase<PgliteQueryResultHKT, typeof schema> &
  PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

/** Active mode, resolved once from DATABASE_URL. Exported for health/settings. */
export const DB_MODE: DbMode = resolveDbMode();

interface DbInstance {
  driver: DbDriver;
  db: SentinelDb;
  client: unknown;
  close: () => Promise<void>;
}

/**
 * Warn when another live process holds the PGlite data directory.
 *
 * The existence of `postmaster.pid` alone is not proof: a crashed process leaves
 * the file behind and PGlite reclaims it on open. This probes whether the PID
 * inside is still running, so a stale file does not warn on every start.
 */
function warnIfPgliteLocked(dataDir: string): void {
  try {
    const lockPath = join(dataDir, 'postmaster.pid');
    if (!existsSync(lockPath)) return;

    const raw = readFileSync(lockPath, 'utf8').split(/\r?\n/)[0]?.trim() ?? '';
    const pid = Number.parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) return;

    let alive = false;
    try {
      // Signal 0 throws only when the process does not exist.
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }

    if (alive) {
      console.warn(
        `[db] Direktori PGlite "${dataDir}" sedang dipakai proses PID ${pid}. ` +
          'Hentikan proses tersebut (dev server atau skrip migrasi) sebelum menjalankan yang baru.',
      );
    }
  } catch {
    /* probe is best-effort */
  }
}

function create(): DbInstance {
  const mode = DB_MODE;

  if (mode === 'postgres') {
    const url = (process.env.DATABASE_URL ?? '').trim();
    if (!url) {
      throw new Error(
        'Mode PostgreSQL dipilih tetapi DATABASE_URL kosong. ' +
          'Isi DATABASE_URL, atau kosongkan DATABASE_DRIVER untuk mode demo (PGlite).',
      );
    }

    const client = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      // Neon/Supabase pooler friendly: no named prepared statements.
      prepare: false,
    });

    return {
      driver: 'postgres-js',
      client,
      db: drizzlePostgres(client, { schema }) as unknown as SentinelDb,
      close: async () => {
        await client.end({ timeout: 5 });
      },
    };
  }

  const dataDir = resolvePgliteDir();

  // PGlite is single-writer: it locks its data directory, so a second process
  // (a migration script while `next dev` runs, or a second dev server) makes
  // every query fail with an opaque RuntimeError. Detect the lock up front and
  // explain it.
  if (process.env.NODE_ENV !== 'production') {
    warnIfPgliteLocked(dataDir);
  }

  const client = new PGlite(dataDir);
  return {
    driver: 'pglite',
    client,
    db: drizzlePglite(client, { schema }) as unknown as SentinelDb,
    close: async () => {
      await client.close();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Singleton                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Connection cache.
 *
 * In development the instance is parked on `globalThis`, because Next.js Fast
 * Refresh re-evaluates modules on every edit: without this, each save would open
 * another PGlite instance (or another PostgreSQL pool) and the old ones would
 * keep the data directory locked. In production the module is evaluated once, so
 * a module-scoped variable is enough and a global would only leak across tests.
 */
const CACHE_KEY = '__sentinelDbInstance';

type GlobalWithDb = typeof globalThis & { [CACHE_KEY]?: DbInstance | null };

function cache(): DbInstance | null {
  if (process.env.NODE_ENV === 'production') return productionCache;
  return (globalThis as GlobalWithDb)[CACHE_KEY] ?? null;
}

function setCache(instance: DbInstance | null): void {
  if (process.env.NODE_ENV === 'production') {
    productionCache = instance;
    return;
  }
  (globalThis as GlobalWithDb)[CACHE_KEY] = instance;
}

let productionCache: DbInstance | null = null;

function instance(): DbInstance {
  const existing = cache();
  if (existing) return existing;
  const created = create();
  setCache(created);
  return created;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Active Drizzle instance, resolved lazily through a proxy.
 *
 * Lazy matters for two reasons: `next build` imports every module while
 * prerendering, and creating a PGlite instance there would fail; and a script
 * that only needs the mode should not pay for a connection.
 */
export const db: SentinelDb = new Proxy({} as SentinelDb, {
  get(_target, prop, receiver) {
    const real = instance().db as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
  has(_target, prop) {
    return prop in (instance().db as object);
  },
}) as SentinelDb;

/** Driver currently in use. */
export function activeDriver(): DbDriver {
  return instance().driver;
}

/**
 * Close the connection and drop the cache.
 *
 * Required at the end of every CLI script: PGlite writes its files on close, and
 * postgres.js keeps the event loop alive until the pool is ended.
 */
export async function closeDbConnection(): Promise<void> {
  const existing = cache();
  if (!existing) return;
  setCache(null);
  await existing.close();
}

/** Backwards-compatible alias for scripts written against the older name. */
export const closeDb = closeDbConnection;

export { schema };
export { resolveDbMode, resolvePgliteDir, describeDbMode } from './mode';
export type { DbMode } from './mode';
export * from './schema';
