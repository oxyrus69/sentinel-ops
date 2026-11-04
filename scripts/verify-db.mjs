/**
 * Database integrity checks.
 *
 * MUST run with no other process holding the PGlite data directory (stop
 * `npm run dev` first): PGlite is single-writer and a second process aborts.
 *
 *   node --experimental-strip-types --conditions=react-server \
 *     scripts/run-node-script.mjs scripts/verify-db.mjs
 */
import process from 'node:process';

const { db } = await import('@/server/db');
const { sql } = await import('drizzle-orm');

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} — dapat ${actual}, harus ${expected}`);
  }
}

async function count(query) {
  const res = await db.execute(query);
  return Number(res.rows[0]?.n ?? -1);
}

console.log('\n== Integritas basis data ==');

check(
  'sandi tidak tersimpan sebagai teks biasa',
  await count(sql`
    SELECT count(*)::int AS n FROM credential_vaults
    WHERE encrypted_secret LIKE '%Cp4n3l%' OR encrypted_secret LIKE '%R00t%'
       OR encrypted_secret LIKE '%Erp#%' OR encrypted_secret LIKE '%Wp@%'
       OR encrypted_secret LIKE '%S1nta%' OR encrypted_secret LIKE '%Doaj%'
  `),
  0,
);

check(
  'setiap kredensial punya iv + auth_tag yang cukup panjang',
  await count(sql`
    SELECT count(*)::int AS n FROM credential_vaults
    WHERE iv IS NULL OR auth_tag IS NULL
       OR length(iv) < 16 OR length(auth_tag) < 16
  `),
  0,
);

check(
  'tidak ada tiket tanpa nomor',
  await count(sql`SELECT count(*)::int AS n FROM incidents WHERE ticket_number IS NULL OR ticket_number = ''`),
  0,
);

check(
  'nomor tiket unik',
  await count(sql`
    SELECT count(*)::int AS n FROM (
      SELECT ticket_number FROM incidents GROUP BY ticket_number HAVING count(*) > 1
    ) t
  `),
  0,
);

check(
  'tidak ada aset tanpa slug',
  await count(sql`SELECT count(*)::int AS n FROM web_assets WHERE slug IS NULL OR slug = ''`),
  0,
);

check(
  'setiap tiket punya tenggat resolusi SLA',
  await count(sql`SELECT count(*)::int AS n FROM incidents WHERE sla_resolution_due_at IS NULL`),
  0,
);

check(
  'setiap tiket selesai punya RCA + langkah remediasi',
  await count(sql`
    SELECT count(*)::int AS n FROM incidents
    WHERE status IN ('RESOLVED','CLOSED')
      AND (root_cause_summary IS NULL OR root_cause_summary = ''
           OR remediation_steps IS NULL OR remediation_steps = '')
  `),
  0,
);

check(
  'tidak ada kredensial yatim',
  await count(sql`
    SELECT count(*)::int AS n FROM credential_vaults cv
    LEFT JOIN web_assets wa ON wa.id = cv.asset_id WHERE wa.id IS NULL
  `),
  0,
);

check(
  'tidak ada tiket yatim',
  await count(sql`
    SELECT count(*)::int AS n FROM incidents i
    LEFT JOIN web_assets wa ON wa.id = i.asset_id WHERE wa.id IS NULL
  `),
  0,
);

check(
  'tidak ada skor DSS yang di-cache ke kolom',
  await count(sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_name IN ('web_assets','incidents') AND column_name LIKE '%score%'
  `),
  0,
);

check(
  'versi optimistik setiap aset >= 1',
  await count(sql`SELECT count(*)::int AS n FROM web_assets WHERE version < 1`),
  0,
);

check(
  'versi optimistik setiap tiket >= 1',
  await count(sql`SELECT count(*)::int AS n FROM incidents WHERE version < 1`),
  0,
);

check(
  'kunci idempotensi tidak duplikat',
  await count(sql`
    SELECT count(*)::int AS n FROM (
      SELECT scope, request_id FROM idempotency_keys
      GROUP BY scope, request_id HAVING count(*) > 1
    ) t
  `),
  0,
);

console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);
process.exit(fail > 0 ? 1 : 0);
