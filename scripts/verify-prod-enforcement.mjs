/**
 * Production enforcement, spawned with an explicit hostile environment.
 *
 * Verifies the rule from section 3 of the spec: with NODE_ENV=production, a real
 * PostgreSQL URL, and ALLOW_DEMO_SECRETS unset, placeholder or missing secrets
 * must abort startup instead of silently producing a broken deployment.
 *
 *   node scripts/run-node-script.mjs scripts/verify-prod-enforcement.mjs
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
console.log(`   DATABASE_URL=${process.env.DATABASE_URL ? '(terisi)' : '(kosong)'}`);
console.log(`   ALLOW_DEMO_SECRETS=${process.env.ALLOW_DEMO_SECRETS ?? '(tidak diset)'}`);

check('aturan produksi ditegakkan', requiresProductionSecrets(), true);

// --- placeholder secrets must abort ---------------------------------------
let threw = false;
let message = '';
try {
  assertProductionSecrets();
} catch (err) {
  threw = true;
  message = err instanceof Error ? err.message : String(err);
}
check('startup ditolak dengan secret contoh', threw, true);
check('pesan menyebut VAULT_MASTER_KEY', message.includes('VAULT_MASTER_KEY'), true);
check('pesan menyebut SESSION_SECRET', message.includes('SESSION_SECRET'), true);
check('pesan menyebut perintah perbaikan', message.includes('secrets:generate'), true);

// --- each secret is reported separately -----------------------------------
const vault = checkVaultKey(process.env.VAULT_MASTER_KEY);
const session = checkSessionSecret(process.env.SESSION_SECRET);
check('VAULT_MASTER_KEY contoh ditandai tidak valid', vault.configured, false);
check('SESSION_SECRET contoh ditandai tidak valid', session.configured, false);

console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);
process.exitCode = fail > 0 ? 1 : 0;
