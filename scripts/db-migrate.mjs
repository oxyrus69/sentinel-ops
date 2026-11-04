#!/usr/bin/env node
/**
 * Sentinel Ops — Database migration runner.
 *
 * Applies every *.sql file in drizzle/ (sorted) against the configured driver.
 * Fully idempotent: every statement is guarded, so running twice is a no-op.
 *
 *   node scripts/db-migrate.mjs            # apply pending migrations
 *   node scripts/db-migrate.mjs --status   # show what is applied
 *   node scripts/db-migrate.mjs --fresh    # drop everything, then re-apply
 *
 * Driver selection is the same as the app (src/server/db/mode.mjs):
 *   DATABASE_URL empty            -> embedded PGlite in .data/pglite
 *   DATABASE_URL=postgresql://... -> real PostgreSQL server
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// --- env loader (dotenv-free, dependency free) -----------------------------
const envPath = path.join(root, '.env');
if (existsSync(envPath)) {
  const raw = await readFile(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const args = new Set(process.argv.slice(2));
const mode = args.has('--fresh') ? 'fresh' : args.has('--status') ? 'status' : 'apply';

// One source of truth for the driver decision (src/server/db/mode.mjs), shared
// with the app and the seed script so a migration can never land in a different
// database than the one the application reads.
const { resolveDbMode, resolvePgliteDir } = await import('../src/server/db/mode.mjs');

let DRIVER;
try {
  DRIVER = resolveDbMode();
} catch (err) {
  console.error(`[migrate] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

/** @type {{ db: any, close: () => Promise<void> }} */
let handle;
let drizzle;
let PGlite;
let postgres;

if (DRIVER === 'postgres') {
  if (!process.env.DATABASE_URL) {
    console.error(
      '[migrate] Mode PostgreSQL dipilih tetapi DATABASE_URL kosong.\n' +
        '          Isi DATABASE_URL, atau biarkan kosong untuk mode demo (PGlite).',
    );
    process.exit(1);
  }
  ({ default: postgres } = await import('postgres'));
  ({ drizzle } = await import('drizzle-orm/postgres-js'));
  const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });
  handle = { db: drizzle(sql), close: async () => sql.end({ timeout: 5 }) };
} else {
  ({ PGlite } = await import('@electric-sql/pglite'));
  ({ drizzle } = await import('drizzle-orm/pglite'));
  const dataDir = resolvePgliteDir();
  const absDir = path.isAbsolute(dataDir) ? dataDir : path.join(root, dataDir);
  const client = new PGlite(absDir);
  handle = { db: drizzle(client), close: async () => client.close() };
}

const { db, close } = handle;
const { sql } = await import('drizzle-orm');

const drizzleDir = path.join(root, 'drizzle');
const files = (await readdir(drizzleDir))
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('[migrate] Tidak ada berkas migrasi di drizzle/.');
  await close();
  process.exit(0);
}

// --- helpers ---------------------------------------------------------------

const MIGRATION_MARKER = 'migration:applied';

async function appliedMigrations() {
  // marker table lives in app_settings; create it if absent
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app_settings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "key" varchar(80) NOT NULL,
      "value_json" jsonb,
      "description" text,
      "updated_by" uuid,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "app_settings_key_key" ON "app_settings" USING btree ("key")`,
  );
  const rows = await db.execute(
    sql`SELECT key FROM app_settings WHERE key LIKE ${MIGRATION_MARKER} || ':%'`,
  );
  return new Set(rows.rows.map((r) => String(r.key).slice(MIGRATION_MARKER.length + 1)));
}

async function markApplied(name) {
  await db.execute(sql`
    INSERT INTO app_settings ("key", "value_json", "description")
    VALUES (${`${MIGRATION_MARKER}:${name}`}, ${JSON.stringify({ at: new Date().toISOString() })}::jsonb, ${'Migrasi ' + name})
    ON CONFLICT ("key") DO NOTHING
  `);
}

async function unmarkApplied(name) {
  await db.execute(sql`
    DELETE FROM app_settings WHERE key = ${`${MIGRATION_MARKER}:${name}`}
  `);
}

/**
 * Split a migration file on drizzle's statement-breakpoint and further split
 * top-level `$$ ... $$;` DO blocks so each statement is sent individually.
 * Statements are never reordered; failures abort the run.
 */
function splitStatements(text) {
  const out = [];
  let buf = '';
  let inDollar = false;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/^\s*--/.test(line)) continue; // strip comment lines
    const opens = (line.match(/\$\$/g) ?? []).length;
    if (inDollar) {
      buf += line + '\n';
      if (opens % 2 === 1) inDollar = false;
      if (!inDollar && /;\s*$/.test(line)) {
        out.push(buf.trim());
        buf = '';
      }
      continue;
    }
    if (opens % 2 === 1) {
      inDollar = true;
      buf += line + '\n';
      continue;
    }
    if (/--> statement-breakpoint/.test(line)) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += line + '\n';
    if (/;\s*$/.test(line)) {
      out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => s.replace(/[\s;]/g, '').length > 0);
}

// --- run -------------------------------------------------------------------

if (mode === 'status') {
  const applied = await appliedMigrations();
  for (const f of files) {
    console.log(`${applied.has(f) ? '[x]' : '[ ]'} ${f}`);
  }
  await close();
  process.exit(0);
}

if (mode === 'fresh') {
  console.log('[migrate] --fresh: menghapus seluruh tabel publik...');
  const rows = await db.execute(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  const tables = rows.rows.map((r) => String(r.tablename));
  for (const t of tables) {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "public"."${t}" CASCADE`));
  }
  const types = await db.execute(sql`
    SELECT typname FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    GROUP BY typname
  `);
  for (const ty of types.rows.map((r) => String(r.typname))) {
    await db.execute(sql.raw(`DROP TYPE IF EXISTS "public"."${ty}" CASCADE`));
  }
  console.log(`[migrate] dihapus: ${tables.length} tabel, ${types.rows.length} enum`);
}

const already = await appliedMigrations();
let appliedCount = 0;

for (const file of files) {
  if (already.has(file)) {
    console.log(`[migrate] lewati (sudah diterapkan): ${file}`);
    continue;
  }
  const full = path.join(drizzleDir, file);
  const text = await readFile(full, 'utf8');
  const statements = splitStatements(text);
  console.log(`[migrate] menerapkan ${file} (${statements.length} statement)...`);
  try {
    await db.transaction(async (tx) => {
      for (const stmt of statements) {
        await tx.execute(sql.raw(stmt));
      }
    });
  } catch (err) {
    console.error(`[migrate] GAGAL pada ${file}:`);
    console.error(err instanceof Error ? err.message : err);
    await close();
    process.exit(1);
  }
  await markApplied(file);
  appliedCount += 1;
  console.log(`[migrate] selesai: ${file}`);
}

console.log(
  `[migrate] ${appliedCount === 0 ? 'tidak ada yang baru' : `${appliedCount} migrasi diterapkan`} (driver: ${DRIVER})`,
);
await close();
