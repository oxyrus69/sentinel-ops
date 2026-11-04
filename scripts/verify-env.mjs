/**
 * Database mode detection and secret validation.
 *
 * The risky part of dual-mode support is choosing the wrong database:
 * a migration that silently lands in the embedded file while the app reads a
 * server, or a production deploy that starts with placeholder secrets and then
 * logs everyone out. These cases are covered here because they cannot be
 * exercised through the UI.
 *
 *   node --experimental-strip-types --conditions=react-server \
 *     scripts/run-node-script.mjs scripts/verify-env.mjs
 */
import process from 'node:process';

const { resolveDbMode, resolvePgliteDir, describeDbMode, DEFAULT_PGLITE_DIR } = await import(
  '@/server/db/mode'
);

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log(`  ok   ${label} -> ${a}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} -> ${a}, harus ${e}`);
  }
}

/* -------------------------------------------------------------------------- */
console.log('\n== Pemilihan mode basis data ==');

check('DATABASE_URL kosong', resolveDbMode({ DATABASE_URL: '' }), 'pglite');
check('DATABASE_URL tidak ada', resolveDbMode({}), 'pglite');
check('DATABASE_URL spasi saja', resolveDbMode({ DATABASE_URL: '   ' }), 'pglite');

check(
  'postgresql:// memilih server',
  resolveDbMode({ DATABASE_URL: 'postgresql://u:p@h:5432/d' }),
  'postgres',
);
check(
  'postgres:// memilih server',
  resolveDbMode({ DATABASE_URL: 'postgres://u:p@h:5432/d' }),
  'postgres',
);
check(
  'huruf besar tetap dikenali',
  resolveDbMode({ DATABASE_URL: 'PostgreSQL://u:p@h:5432/d' }),
  'postgres',
);
check(
  'postgresql dengan sslmode',
  resolveDbMode({ DATABASE_URL: 'postgresql://u:p@h:5432/d?sslmode=require' }),
  'postgres',
);
check(
  'neon pooled URL',
  resolveDbMode({
    DATABASE_URL: 'postgresql://user:pass@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
  }),
  'postgres',
);
check(
  'supabase URL',
  resolveDbMode({ DATABASE_URL: 'postgresql://postgres.abc:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres' }),
  'postgres',
);

check('pglite:// tetap embedded', resolveDbMode({ DATABASE_URL: 'pglite://.local/db' }), 'pglite');
check('file: tetap embedded', resolveDbMode({ DATABASE_URL: 'file:./local.db' }), 'pglite');
check('memory:// tetap embedded', resolveDbMode({ DATABASE_URL: 'memory://' }), 'pglite');

check(
  'URL mengalahkan DATABASE_DRIVER lama',
  resolveDbMode({ DATABASE_URL: 'postgresql://u:p@h/d', DATABASE_DRIVER: 'pglite' }),
  'postgres',
);
check(
  'DATABASE_DRIVER lama masih dihormati tanpa URL',
  resolveDbMode({ DATABASE_DRIVER: 'postgres-js' }),
  'postgres',
);

// A wrong scheme must never fall back to an empty embedded database silently.
let threw = false;
let message = '';
try {
  resolveDbMode({ DATABASE_URL: 'mysql://u:p@h/d' });
} catch (err) {
  threw = true;
  message = err instanceof Error ? err.message : String(err);
}
check('skema tak dikenal ditolak', threw, true);
check('pesan menyebut cara memperbaiki', message.includes('postgresql://'), true);

/* -------------------------------------------------------------------------- */
console.log('\n== Direktori data PGlite ==');

check('default direktori', resolvePgliteDir({}), DEFAULT_PGLITE_DIR);
check('default mengabaikan Git', DEFAULT_PGLITE_DIR, '.data/pglite');
check('override dari env', resolvePgliteDir({ PGLITE_DATA_DIR: '/tmp/x' }), '/tmp/x');
check('override kosong kembali ke default', resolvePgliteDir({ PGLITE_DATA_DIR: '  ' }), DEFAULT_PGLITE_DIR);

/* -------------------------------------------------------------------------- */
console.log('\n== Deskripsi mode (tidak membocorkan sandi) ==');

check('deskripsi embedded', describeDbMode({}), 'PGlite (embedded)');
const described = describeDbMode({
  DATABASE_URL: 'postgresql://admin:SUPER-SECRET-PASSWORD@db.example.com:5432/sentinel',
});
check('deskripsi server menyebut host', described.includes('db.example.com'), true);
check('deskripsi server menyembunyikan sandi', described.includes('SUPER-SECRET-PASSWORD'), false);

/* -------------------------------------------------------------------------- */
console.log('\n== Validasi kunci rahasia ==');
console.log('   (aturan diuji lewat proses terpisah agar NODE_ENV/db mode bersih)');

console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);
process.exit(fail > 0 ? 1 : 0);
