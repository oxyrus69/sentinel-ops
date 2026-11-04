/**
 * Secret validation, tested in a clean process.
 *
 * `requiresProductionSecrets()` depends on NODE_ENV and on the database mode, and
 * both are read once at import time. Testing it inside a shared process would be
 * fragile, so this file is spawned with an explicit environment per case.
 *
 *   node scripts/run-node-script.mjs scripts/verify-secrets.mjs
 */
import process from 'node:process';

const { checkVaultKey, checkSessionSecret, inspectSecrets, isDemoMode } = await import(
  '@/server/env'
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

const HEX64 = 'a'.repeat(64);
const PLACEHOLDER_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const B64_32 = Buffer.alloc(32, 7).toString('base64');

console.log(`\n== Konteks proses: NODE_ENV=${process.env.NODE_ENV} mode=${isDemoMode() ? 'demo' : 'produksi'} ==`);

/* -------------------------------------------------------------------------- */
console.log('\n== VAULT_MASTER_KEY ==');

check('hex 64 karakter diterima', checkVaultKey(HEX64).configured, true);
check('base64 32 byte diterima', checkVaultKey(B64_32).configured, true);
check('kosong ditolak', checkVaultKey('').configured, false);
check('undefined ditolak', checkVaultKey(undefined).configured, false);
check('terlalu pendek ditolak', checkVaultKey('abc').configured, false);
check('hex 63 karakter ditolak', checkVaultKey('a'.repeat(63)).configured, false);
check('nilai contoh ditolak', checkVaultKey(PLACEHOLDER_HEX).configured, false);
check(
  'pesan menyebut cara membuat',
  (checkVaultKey('abc').problem ?? '').includes('secrets:generate'),
  true,
);

/* -------------------------------------------------------------------------- */
console.log('\n== SESSION_SECRET ==');

check('32 karakter diterima', checkSessionSecret('x'.repeat(32)).configured, true);
check('48 karakter diterima', checkSessionSecret('x'.repeat(48)).configured, true);
check('31 karakter ditolak', checkSessionSecret('x'.repeat(31)).configured, false);
check('kosong ditolak', checkSessionSecret('').configured, false);
check(
  'nilai contoh ditolak',
  checkSessionSecret('sentinel-ops-local-dev-session-secret-change-in-prod').configured,
  false,
);
check(
  'fallback demo lama juga ditolak sebagai nilai eksplisit',
  checkSessionSecret('sentinel-ops-dev-session-secret-do-not-use-in-production').configured,
  false,
);

/* -------------------------------------------------------------------------- */
console.log('\n== Ringkasan ==');

const summary = inspectSecrets();
check('demoMode terdeteksi', typeof summary.demoMode, 'boolean');
check('enforced terdeteksi', typeof summary.enforced, 'boolean');

// In demo mode (the default for this script run) nothing may be enforced, so the
// existing 128-check suite keeps passing with no .env.
if (process.env.EXPECT_DEMO === '1') {
  check('mode demo tidak menegakkan aturan', summary.enforced, false);
}

console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);

// `process.exit()` while a WASM module is still initialising triggers a libuv
// assertion on Windows. Setting the exit code lets Node drain its handles and
// exit cleanly, which CI also prefers.
process.exitCode = fail > 0 ? 1 : 0;
