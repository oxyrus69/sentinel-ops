/**
 * Production mode with *valid* secrets must be accepted.
 *
 * The mirror of verify-prod-enforcement.mjs: that script proves a bad deploy is
 * refused, this one proves a correctly configured one is not. Without both, a
 * validator that rejects everything would look "safe" while breaking production.
 *
 *   NODE_ENV=production DATABASE_URL=postgresql://... \
 *   VAULT_MASTER_KEY=<64 hex> SESSION_SECRET=<32+ chars> \
 *   node scripts/run-node-script.mjs scripts/verify-prod-accepted.mjs
 */
import process from 'node:process';

const { assertProductionSecrets, requiresProductionSecrets, checkVaultKey, checkSessionSecret } =
  await import('@/server/env');

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

console.log(`\n== Konteks: NODE_ENV=${process.env.NODE_ENV} ==`);

check('aturan produksi aktif', requiresProductionSecrets(), true);
check('VAULT_MASTER_KEY valid diterima', checkVaultKey(process.env.VAULT_MASTER_KEY).configured, true);
check('SESSION_SECRET valid diterima', checkSessionSecret(process.env.SESSION_SECRET).configured, true);

let threw = false;
let message = '';
try {
  assertProductionSecrets();
} catch (err) {
  threw = true;
  message = err instanceof Error ? err.message : String(err);
}
check('startup lolos dengan secret valid', threw, false);
if (message) console.log(`   pesan: ${message}`);

console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);
process.exitCode = fail > 0 ? 1 : 0;
