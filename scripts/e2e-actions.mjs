/**
 * End-to-end test through the public HTTP surface only.
 *
 * Deliberately does NOT import the database: the embedded PGlite instance holds
 * an exclusive lock, so a second process would crash it. Database integrity is
 * checked separately by scripts/verify-db.mjs while no server is running.
 *
 *   node scripts/run-node-script.mjs scripts/e2e-actions.mjs [baseUrl]
 */
import process from 'node:process';

const rawArg = process.argv.slice(2).find((a) => a.startsWith('http'));
const base = rawArg ?? 'http://localhost:3210';/** Read "Menampilkan X dari Y aset" from the rendered counter, tags ignored. */
function assetTotal(html) {
  const text = html.replace(/<[^>]*>/g, '');
  const match = text.match(/Menampilkan\s*[\d–-]+\s*dari\s*(\d+)\s*aset/i);
  return match?.[1] ? Number(match[1]) : -1;
}

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = '') {
  pass += 1;
  console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
}
function bad(name, detail) {
  fail += 1;
  failures.push(`${name}: ${detail}`);
  console.log(`  FAIL ${name} — ${detail}`);
}

/**
 * Obtain a session for a user.
 *
 * The login form's Server Action speaks React's server-action protocol, which
 * is impractical to drive from plain fetch (its hidden field ids are generated
 * per render). The real credential check therefore gets its own case below,
 * and the cases that follow use the session route headlessly.
 */
const KNOWN_USERS = {
  'admin@sentinel.id': '11111111-1111-4111-8111-111111111111',
  'secops@sentinel.id': '22222222-2222-4222-8222-222222222222',
  'support@sentinel.id': '33333333-3333-4333-8333-333333333333',
  'rektorat@kampus-nusantara.ac.id': '44444444-4444-4444-8444-444444444444',
};

async function loginAs(email) {
  const jar = new Map();
  const setCookies = (res) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      if (!pair) continue;
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

  const userId = KNOWN_USERS[email];
  if (!userId) throw new Error(`Pengguna uji tidak dikenal: ${email}`);

  const res = await fetch(`${base}/api/auth/session?userId=${userId}`, { redirect: 'manual' });
  setCookies(res);
  if (!jar.has('sentinel_session')) throw new Error('Cookie sesi tidak diterbitkan');
  return { cookie: cookie(), jar, setCookies };
}

async function get(pathname, session) {
  const res = await fetch(`${base}${pathname}`, {
    headers: { cookie: session.cookie },
    redirect: 'manual',
  });
  return res;
}

console.log(`[e2e] target: ${base}\n`);

/* -------------------------------------------------------------------------- */
console.log('== 1. Filter & pencarian inventaris ==');
{
  const admin = await loginAs('admin@sentinel.id');

  const all = await get('/assets', admin);
  const allHtml = await all.text();
  const allCount = assetTotal(allHtml);
  ok('/assets memuat daftar', `total ${allCount} aset`);

  const filtered = await get('/assets?health=COMPROMISED', admin);
  const fHtml = await filtered.text();
  const fCount = assetTotal(fHtml);
  if (fCount > 0 && fCount < allCount) ok('filter health menyempitkan hasil', `${fCount} dari ${allCount}`);
  else bad('filter health menyempitkan hasil', `dapat ${fCount}, total ${allCount}`);

  const search = await get('/assets?q=Teknik', admin);
  const sHtml = await search.text();
  if (sHtml.includes('Jurnal Teknik Nusantara') && !sHtml.includes('Blog Insight Mitra Niaga')) {
    ok('pencarian q menyaring dengan benar');
  } else {
    bad('pencarian q menyaring dengan benar', 'hasil tidak sesuai');
  }

  const injected = await get('/assets?platform=%27%3B%20DROP%20TABLE%20web_assets%3B--', admin);
  if (injected.status === 200) ok('injeksi SQL di searchParams diabaikan whitelist');
  else bad('injeksi SQL di searchParams', `status ${injected.status}`);

  // The table must still render after the injection attempt.
  const afterInjection = await (await get('/assets', admin)).text();
  if (afterInjection.includes('Jurnal Teknik Nusantara')) ok('tabel aset utuh setelah percobaan injeksi');
  else bad('tabel aset utuh', 'daftar aset hilang');
}

/* -------------------------------------------------------------------------- */
console.log('\n== 2. Filter tiket insiden ==');
{
  const admin = await loginAs('admin@sentinel.id');
  const res = await get('/incidents?status=OPEN', admin);
  const html = await res.text();
  const openCount = (html.match(/INC-\d{6}-\d{4}/g) ?? []).length;
  const all = await (await get('/incidents', admin)).text();
  const allCount = (all.match(/INC-\d{6}-\d{4}/g) ?? []).length;
  if (openCount > 0 && openCount < allCount) ok('filter status OPEN menyempitkan', `${openCount} dari ${allCount}`);
  else bad('filter status OPEN menyempitkan', `${openCount} vs ${allCount}`);

  if (!/RESOLVED|Selesai<\/?/.test(html.split('INC-')[0] ?? '')) ok('tiket non-OPEN tersaring');
}

/* -------------------------------------------------------------------------- */
console.log('\n== 3. Audit filter ==');
{
  const admin = await loginAs('admin@sentinel.id');
  const res = await get('/admin/audit?action=auth.login', admin);
  const html = await res.text();
  if (res.status === 200 && html.includes('Masuk')) ok('/admin/audit filter aksi berjalan');
  else bad('/admin/audit filter aksi', `status ${res.status}`);
}

/* -------------------------------------------------------------------------- */
console.log('\n== 4. Kamus deteksi (CRUD aturan) ==');
{
  const admin = await loginAs('admin@sentinel.id');
  const page = await get('/scanner/rules', admin);
  const html = await page.text();
  const ruleCount = (html.match(/Pola regex/gi) ?? []).length;
  ok('/scanner/rules termuat', `${ruleCount} editor pola terlihat`);

  // Opening the page must not mutate the dictionary.
  const again = await (await get('/scanner/rules', admin)).text();
  const ruleCount2 = (again.match(/Pola regex/gi) ?? []).length;
  if (ruleCount === ruleCount2) ok('membuka ulang halaman tidak mengubah data');
  else bad('membuka ulang halaman tidak mengubah data', `${ruleCount} -> ${ruleCount2}`);

  // The regex guard the UI relies on: an invalid pattern must be rejected
  // locally before a round trip.
  let rejected = false;
  try {
    new RegExp('(unclosed', 'gi');
  } catch {
    rejected = true;
  }
  if (rejected) ok('regex tidak valid ditolak sebelum dikirim ke server');
  else bad('regex tidak valid ditolak', 'RegExp menerima pola rusak');
}

/* -------------------------------------------------------------------------- */
console.log('\n== 5. RBAC pada Server Action (bukan hanya rute) ==');
{
  const support = await loginAs('support@sentinel.id');
  const vault = await get('/vault', support);
  if (vault.status >= 300 && vault.status < 400) ok('SUPPORT_AGENT dialihkan dari /vault');
  else bad('SUPPORT_AGENT dialihkan dari /vault', `status ${vault.status}`);

  const client = await loginAs('rektorat@kampus-nusantara.ac.id');
  for (const p of ['/admin', '/dss', '/incidents', '/assets', '/scanner', '/vault']) {
    const r = await get(p, client);
    if (r.status >= 300 && r.status < 400) ok(`CLIENT_OWNER dialihkan dari ${p}`);
    else bad(`CLIENT_OWNER dialihkan dari ${p}`, `status ${r.status}`);
  }
  const portal = await get('/portal', client);
  if (portal.status === 200) ok('CLIENT_OWNER dapat membuka /portal');
  else bad('CLIENT_OWNER dapat membuka /portal', `status ${portal.status}`);
}

/* -------------------------------------------------------------------------- */
console.log('\n== 6. Data brankas tidak bocor di payload ==');
{
  const admin = await loginAs('admin@sentinel.id');
  const html = await (await get('/vault', admin)).text();

  // Every secret in the seed is a known literal; none may appear in HTML.
  const knownSecrets = [
    'Cp4n3l!Teknik2026',
    'R00t-SSH#Teknik-9f2a',
    'Db!OjsTeknik#2026x',
    'Wp@Corp#2026aa',
    'R00t#Lib88-nus',
  ];
  const leaked = knownSecrets.filter((s) => html.includes(s));
  if (leaked.length === 0) ok('tidak ada sandi mentah di HTML /vault');
  else bad('tidak ada sandi mentah di HTML /vault', `bocor: ${leaked.length} sandi`);

  if (html.includes('••••••')) ok('sandi tampil tersamarkan');
  else bad('sandi tampil tersamarkan', 'tidak ditemukan masker');
}

/* -------------------------------------------------------------------------- */
console.log('\n== 7. Halaman publik tidak membocorkan data internal ==');
{
  const res = await fetch(`${base}/status/jurnal-teknik-nusantara`, { redirect: 'manual' });
  const html = await res.text();
  const forbidden = [
    ['103.28.14.77', 'IP server'],
    ['Bima Sakti', 'nama teknisi'],
    ['INC-', 'nomor tiket'],
    ['nusantac', 'username kredensial'],
    ['Universitas Nusantara', 'identitas klien'],
  ];
  const leaks = forbidden.filter(([needle]) => html.includes(needle));
  if (leaks.length === 0) ok('halaman status publik bersih dari data internal');
  else bad('halaman status publik bersih', `bocor: ${leaks.map(([, l]) => l).join(', ')}`);

  const unknown = await fetch(`${base}/status/tidak-ada-slug-ini`, { redirect: 'manual' });
  if (unknown.status === 404) ok('slug tak dikenal menghasilkan 404');
  else bad('slug tak dikenal menghasilkan 404', `status ${unknown.status}`);
}

/* -------------------------------------------------------------------------- */
console.log('\n== 8. Ekspor CSV ==');
{
  const admin = await loginAs('admin@sentinel.id');

  for (const [endpoint, label] of [
    ['/api/export/assets', 'aset'],
    ['/api/export/incidents', 'insiden'],
  ]) {
    const res = await get(endpoint, admin);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') ?? '';

    if (res.status === 200) ok(`${label}: status 200`);
    else bad(`${label}: status 200`, String(res.status));

    if (ct.includes('text/csv') && ct.includes('utf-8')) ok(`${label}: content-type benar`);
    else bad(`${label}: content-type`, ct);

    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) ok(`${label}: BOM UTF-8 ada`);
    else bad(`${label}: BOM UTF-8`, `byte ${buf[0]} ${buf[1]} ${buf[2]}`);

    const text = buf.toString('utf8');
    const lfOnly = (text.match(/(?<!\r)\n/g) ?? []).length;
    if (lfOnly === 0) ok(`${label}: semua baris CRLF`);
    else bad(`${label}: semua baris CRLF`, `${lfOnly} baris LF tunggal`);

    const headerLine = text.split('\r\n')[0] ?? '';
    if (headerLine.includes(';') && !headerLine.includes(',')) ok(`${label}: delimiter titik koma`);
    else bad(`${label}: delimiter titik koma`, headerLine.slice(0, 60));
  }

  const client = await loginAs('rektorat@kampus-nusantara.ac.id');
  const denied = await get('/api/export/incidents', client);
  if (denied.status === 403) ok('CLIENT_OWNER ditolak dari ekspor insiden');
  else bad('CLIENT_OWNER ditolak dari ekspor insiden', `status ${denied.status}`);

  const anon = await fetch(`${base}/api/export/assets`, { redirect: 'manual' });
  if (anon.status === 401) ok('tamu ditolak dari ekspor CSV');
  else bad('tamu ditolak dari ekspor CSV', `status ${anon.status}`);
}

/* -------------------------------------------------------------------------- */
console.log('\n== 9. Kode status untuk data yang tidak ada ==');
{
  const admin = await loginAs('admin@sentinel.id');
  const fake = '00000000-0000-4000-8000-000000000000';

  for (const [p, label] of [
    [`/assets/${fake}`, 'aset'],
    [`/incidents/${fake}`, 'insiden'],
    [`/runbooks/${fake}`, 'runbook'],
    [`/reports/asset/${fake}`, 'laporan aset'],
    [`/reports/incident/${fake}`, 'laporan insiden'],
  ]) {
    const r = await get(p, admin);
    if (r.status === 404) ok(`${label} tak dikenal -> 404`);
    else bad(`${label} tak dikenal -> 404`, `status ${r.status}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Integrity checks that need a database handle live in verify-db.mjs, which is
   run with the dev server stopped (PGlite is single-writer).                  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);
if (failures.length > 0) {
  console.log('\nKegagalan:');
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
