#!/usr/bin/env node
/**
 * Generate production-ready secrets.
 *
 * Prints copy-paste lines for `.env`. Both values come from the OS CSPRNG, so
 * they are suitable for production; nothing here is deterministic.
 *
 *   npm run secrets:generate
 *
 * VAULT_MASTER_KEY is 64 hex characters (32 bytes), which is exactly what
 * AES-256-GCM needs, and what `src/server/env.ts` validates for.
 */

import { randomBytes } from 'node:crypto';
import process from 'node:process';

const vaultKey = randomBytes(32).toString('hex');
const sessionSecret = randomBytes(48).toString('base64url');

const line = '='.repeat(72);

console.log('');
console.log(line);
console.log('Kunci produksi Sentinel Ops');
console.log(line);
console.log('');
console.log('Salin dua baris berikut ke .env (ganti nilai yang sudah ada):');
console.log('');
console.log(`VAULT_MASTER_KEY="${vaultKey}"`);
console.log(`SESSION_SECRET="${sessionSecret}"`);
console.log('');
console.log(line);
console.log('Catatan penting');
console.log(line);
console.log('');
console.log('1. Jangan commit .env. Berkas itu sudah masuk .gitignore.');
console.log('2. Mengganti VAULT_MASTER_KEY membuat sandi brankas yang sudah');
console.log('   tersimpan TIDAK BISA didekripsi lagi. Untuk brankas berisi data,');
console.log('   rotasi kunci butuh migrasi ulang seluruh entri.');
console.log('3. Mengganti SESSION_SECRET akan mengeluarkan semua pengguna aktif.');
console.log('4. Simpan salinan di tempat aman (password manager), bukan di repo.');
console.log('5. Setelah menyalin, set ALLOW_DEMO_SECRETS="false" atau hapus baris itu.');
console.log('');

// Machine-readable form for scripting: npm run secrets:generate -- --json
if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify({ VAULT_MASTER_KEY: vaultKey, SESSION_SECRET: sessionSecret }, null, 2),
  );
}
