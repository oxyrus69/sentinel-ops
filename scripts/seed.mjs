#!/usr/bin/env node
/**
 * Sentinel Ops - Database seed.
 *
 * Idempotent: every row carries a fixed UUID, so re-running updates instead of
 * duplicating. Run after migrations:
 *
 *   npm run db:migrate
 *   npm run db:seed
 *
 * Demo accounts all use the password `sentinel123`.
 */

import process from 'node:process';
import { createHash } from 'node:crypto';

/* -------------------------------------------------------------------------- */
/* Deterministic IDs                                                          */
/* -------------------------------------------------------------------------- */

const ID = {
  users: {
    admin: '11111111-1111-4111-8111-111111111111',
    secops: '22222222-2222-4222-8222-222222222222',
    support: '33333333-3333-4333-8333-333333333333',
    rektorat: '44444444-4444-4444-8444-444444444444',
    corptech: '55555555-5555-4555-8555-555555555555',
  },
  assets: {
    jurnalTeknik: 'a1000000-0000-4000-8000-000000000001',
    jurnalHukum: 'a1000000-0000-4000-8000-000000000002',
    jurnalEkonomi: 'a1000000-0000-4000-8000-000000000003',
    wpCorporate: 'a1000000-0000-4000-8000-000000000004',
    wpBlog: 'a1000000-0000-4000-8000-000000000005',
    laravelErp: 'a1000000-0000-4000-8000-000000000006',
    nodeApi: 'a1000000-0000-4000-8000-000000000007',
    elibrary: 'a1000000-0000-4000-8000-000000000008',
  },
  signatures: {
    slotGacor: 'b1000000-0000-4000-8000-000000000001',
    hiddenAnchor: 'b1000000-0000-4000-8000-000000000002',
    evalBase64: 'b1000000-0000-4000-8000-000000000003',
    unionSelect: 'b1000000-0000-4000-8000-000000000004',
    infoSchema: 'b1000000-0000-4000-8000-000000000005',
    wpAdminAjax: 'b1000000-0000-4000-8000-000000000006',
  },
  runbooks: {
    ojsSlot: 'c1000000-0000-4000-8000-000000000001',
    sqliHardening: 'c1000000-0000-4000-8000-000000000002',
    sslRenewal: 'c1000000-0000-4000-8000-000000000003',
  },
};

/* -------------------------------------------------------------------------- */
/* Load environment (dotenv-free)                                             */
/* -------------------------------------------------------------------------- */

const envPath = new URL('../.env', import.meta.url);
try {
  const raw = await (await import('node:fs/promises')).readFile(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  /* .env optional for the dev-fallback key path */
}

/* -------------------------------------------------------------------------- */
/* Imports (after env load)                                                   */
/* -------------------------------------------------------------------------- */

const { db, DB_MODE, closeDbConnection, describeDbMode } = await import('@/server/db');
const {
  profiles,
  webAssets,
  malwareSignatures,
  incidents,
  incidentComments,
  credentialVaults,
  runbooks,
  runbookSteps,
  incidentRunbookTasks,
  decisionRules,
  appSettings,
  documentSequences,
  scanLogs,
} = await import('@/server/db/schema');
const { hashPassword, encryptSecret } = await import('@/server/services/cryptoEngine');
const { sql, eq } = await import('drizzle-orm');

const DEMO_PASSWORD = 'sentinel123';
const passwordHash = hashPassword(DEMO_PASSWORD);

const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000);
const hoursAgo = (n) => new Date(now.getTime() - n * 3_600_000);
const daysAhead = (n) => new Date(now.getTime() + n * 86_400_000);

/**
 * Deterministic UUID (v5-shaped, SHA-1 based) from an arbitrary seed string.
 * Used so child rows get stable, valid UUIDs derived from their parent id.
 */
function deterministicUuid(seed) {
  const h = createHash('sha1').update(seed).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5'; // version 5
  b[16] = ['8', '9', 'a', 'b'][Number.parseInt(b[16] ?? '8', 16) & 3] ?? '8';
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

let created = 0;
let updated = 0;

/** Upsert helper: reports whether the row was inserted or updated. */
async function upsert(table, values, conflictTarget, onConflict) {
  const rows = await db
    .insert(table)
    .values(values)
    .onConflictDoUpdate({
      target: conflictTarget,
      set: onConflict ?? values,
    })
    .returning({ id: table.id });

  if (rows.length > 0) {
    created += 1;
    return rows[0]?.id ?? values.id;
  }
  updated += 1;
  return values.id;
}

/* -------------------------------------------------------------------------- */
/* 1. Users                                                                   */
/* -------------------------------------------------------------------------- */

console.log('[seed] profil pengguna...');

const users = [
  {
    id: ID.users.admin,
    email: 'admin@sentinel.id',
    fullName: 'Ardiansyah Pratama',
    role: 'SUPER_ADMIN',
    organizationName: 'Sentinel Ops',
  },
  {
    id: ID.users.secops,
    email: 'secops@sentinel.id',
    fullName: 'Bima Sakti',
    role: 'SECOPS_ENGINEER',
    organizationName: 'Sentinel Ops',
  },
  {
    id: ID.users.support,
    email: 'support@sentinel.id',
    fullName: 'Citra Kirana',
    role: 'SUPPORT_AGENT',
    organizationName: 'Sentinel Ops',
  },
  {
    id: ID.users.rektorat,
    email: 'rektorat@kampus-nusantara.ac.id',
    fullName: 'Dr. Hendra Wijaya',
    role: 'CLIENT_OWNER',
    organizationName: 'Universitas Nusantara',
  },
  {
    id: ID.users.corptech,
    email: 'corptech@mitra-niaga.co.id',
    fullName: 'Rina Gunawan',
    role: 'CLIENT_OWNER',
    organizationName: 'PT Mitra Niaga',
  },
];

for (const u of users) {
  await upsert(
    profiles,
    {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      organizationName: u.organizationName,
      passwordHash,
      isActive: true,
    },
    [profiles.id],
    {
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      organizationName: u.organizationName,
      passwordHash,
      isActive: true,
      updatedAt: now,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Assets (8)                                                              */
/* -------------------------------------------------------------------------- */

console.log('[seed] aset web...');

const assets = [
  {
    id: ID.assets.jurnalTeknik,
    clientId: ID.users.rektorat,
    name: 'Jurnal Teknik Nusantara',
    domainUrl: 'https://journal.nusantara.ac.id/teknik',
    slug: 'jurnal-teknik-nusantara',
    platform: 'OJS_3',
    platformVersion: 'OJS 3.3.0-14',
    serverIp: '103.28.14.77',
    hostingProvider: 'Hostinger ID',
    healthStatus: 'COMPROMISED',
    sslExpiryDate: daysAhead(210),
    baselineDomHash: null,
    uptimePct30d: '97.40',
  },
  {
    id: ID.assets.jurnalHukum,
    clientId: ID.users.rektorat,
    name: 'Jurnal Hukum & Kebijakan',
    domainUrl: 'https://journal.nusantara.ac.id/hukum',
    slug: 'jurnal-hukum-kebijakan',
    platform: 'OJS_3',
    platformVersion: 'OJS 3.3.0-14',
    serverIp: '103.28.14.77',
    hostingProvider: 'Hostinger ID',
    healthStatus: 'WARNING',
    sslExpiryDate: daysAhead(6),
    baselineDomHash: '9f2c1a7b4e8d3f60a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718',
    uptimePct30d: '99.62',
  },
  {
    id: ID.assets.jurnalEkonomi,
    clientId: ID.users.rektorat,
    name: 'Jurnal Ekonomi Syariah',
    domainUrl: 'https://journal.nusantara.ac.id/ekonomi',
    slug: 'jurnal-ekonomi-syariah',
    platform: 'OJS_3',
    platformVersion: 'OJS 3.4.0-3',
    serverIp: '103.28.14.77',
    hostingProvider: 'Hostinger ID',
    healthStatus: 'HEALTHY',
    sslExpiryDate: daysAhead(288),
    baselineDomHash: '3a7b9c1d2e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f',
    uptimePct30d: '99.98',
  },
  {
    id: ID.assets.wpCorporate,
    clientId: ID.users.corptech,
    name: 'Portal Korporat Mitra Niaga',
    domainUrl: 'https://mitra-niaga.co.id',
    slug: 'portal-korporat-mitra-niaga',
    platform: 'WORDPRESS',
    platformVersion: 'WordPress 6.6.2',
    serverIp: '156.67.210.14',
    hostingProvider: 'Niagahoster',
    healthStatus: 'COMPROMISED',
    sslExpiryDate: daysAhead(54),
    baselineDomHash: null,
    uptimePct30d: '95.10',
  },
  {
    id: ID.assets.wpBlog,
    clientId: ID.users.corptech,
    name: 'Blog Insight Mitra Niaga',
    domainUrl: 'https://insight.mitra-niaga.co.id',
    slug: 'blog-insight-mitra-niaga',
    platform: 'WORDPRESS',
    platformVersion: 'WordPress 6.6.2',
    serverIp: '156.67.210.14',
    hostingProvider: 'Niagahoster',
    healthStatus: 'HEALTHY',
    sslExpiryDate: daysAhead(121),
    baselineDomHash: '7c1d3e5f709182a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b',
    uptimePct30d: '99.90',
  },
  {
    id: ID.assets.laravelErp,
    clientId: ID.users.corptech,
    name: 'ERP Internal Mitra Niaga',
    domainUrl: 'https://erp.mitra-niaga.co.id',
    slug: 'erp-internal-mitra-niaga',
    platform: 'LARAVEL',
    platformVersion: 'Laravel 11.28',
    serverIp: '156.67.211.90',
    hostingProvider: 'VPS Niagahoster',
    healthStatus: 'HEALTHY',
    sslExpiryDate: daysAhead(178),
    baselineDomHash: 'b4d6f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c',
    uptimePct30d: '99.99',
  },
  {
    id: ID.assets.nodeApi,
    clientId: ID.users.corptech,
    name: 'API Gateway Logistik',
    domainUrl: 'https://api-logistik.mitra-niaga.co.id',
    slug: 'api-gateway-logistik',
    platform: 'NODE_SSR',
    platformVersion: 'Node 22 LTS / Next 15',
    serverIp: '156.67.211.91',
    hostingProvider: 'VPS Niagahoster',
    healthStatus: 'HEALTHY',
    sslExpiryDate: daysAhead(240),
    baselineDomHash: 'e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4',
    uptimePct30d: '100.00',
  },
  {
    id: ID.assets.elibrary,
    clientId: ID.users.rektorat,
    name: 'E-Library Kampus',
    domainUrl: 'https://lib.nusantara.ac.id',
    slug: 'e-library-kampus',
    platform: 'CUSTOM_PHP',
    platformVersion: 'PHP 8.2 / Custom',
    serverIp: '103.28.14.88',
    hostingProvider: 'Rumahweb',
    healthStatus: 'DOWN',
    sslExpiryDate: daysAhead(96),
    baselineDomHash: null,
    uptimePct30d: '71.30',
  },
];

for (const a of assets) {
  const sslDaysRemaining = Math.ceil((a.sslExpiryDate.getTime() - now.getTime()) / 86_400_000);
  await upsert(
    webAssets,
    {
      id: a.id,
      clientId: a.clientId,
      name: a.name,
      domainUrl: a.domainUrl,
      slug: a.slug,
      platform: a.platform,
      platformVersion: a.platformVersion,
      serverIp: a.serverIp,
      hostingProvider: a.hostingProvider,
      healthStatus: a.healthStatus,
      sslExpiryDate: a.sslExpiryDate,
      sslDaysRemaining,
      baselineDomHash: a.baselineDomHash,
      lastScanAt: daysAgo(1),
      uptimePct30d: a.uptimePct30d,
      version: 1,
    },
    [webAssets.id],
    {
      name: a.name,
      domainUrl: a.domainUrl,
      slug: a.slug,
      platform: a.platform,
      platformVersion: a.platformVersion,
      serverIp: a.serverIp,
      hostingProvider: a.hostingProvider,
      healthStatus: a.healthStatus,
      sslExpiryDate: a.sslExpiryDate,
      sslDaysRemaining,
      baselineDomHash: a.baselineDomHash,
      uptimePct30d: a.uptimePct30d,
      updatedAt: now,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Malware signatures (6)                                                  */
/* -------------------------------------------------------------------------- */

console.log('[seed] kamus deteksi malware...');

const signatures = [
  {
    id: ID.signatures.slotGacor,
    name: 'Teks promosi judi slot',
    pattern: 'slot\\s*gacor|maxwin|rtp\\s*live|sbobet|judol|judi\\s*online',
    category: 'SLOT_DEFACEMENT',
    severity: 'CRITICAL',
    description:
      'Pola teks yang lazim disisipkan sebagai backlink atau pengganti konten pada situs OJS dan WordPress.',
  },
  {
    id: ID.signatures.hiddenAnchor,
    name: 'Tautan tersembunyi (display none)',
    pattern: '<a\\s[^>]*style\\s*=\\s*["\'][^"\']*(?:display\\s*:\\s*none|visibility\\s*:\\s*hidden|left\\s*:\\s*-\\d{3,}px)',
    category: 'SLOT_DEFACEMENT',
    severity: 'HIGH',
    description:
      'Jangkar yang disembunyikan dari pengunjung namun tetap terbaca perayap, teknik utama injeksi backlink judi slot.',
  },
  {
    id: ID.signatures.evalBase64,
    name: 'Eksekusi kode tersembunyi PHP',
    pattern: 'eval\\s*\\(\\s*base64_decode|assert\\s*\\(\\s*\\$_|preg_replace\\s*\\(.*\\/e|shell_exec\\s*\\(',
    category: 'MALWARE_BACKDOOR',
    severity: 'CRITICAL',
    description:
      'Fungsi PHP yang dipakai untuk mengeksekusi payload jarak jauh dari plugin atau tema yang disusupi.',
  },
  {
    id: ID.signatures.unionSelect,
    name: 'Pola UNION SELECT',
    pattern: 'UNION\\s+(?:ALL\\s+)?SELECT|\\/\\*!?\\s*\\d{5}',
    category: 'SQL_INJECTION',
    severity: 'HIGH',
    description: 'Indikasi percobaan penggabungan kueri untuk membaca tabel lain.',
  },
  {
    id: ID.signatures.infoSchema,
    name: 'Penelusuran information_schema',
    pattern: 'information_schema|pg_catalog|sysobjects',
    category: 'SQL_INJECTION',
    severity: 'MEDIUM',
    description: 'Upaya memetakan struktur basis data dari halaman yang rentan.',
  },
  {
    id: ID.signatures.wpAdminAjax,
    name: 'WordPress admin-ajax abuse',
    pattern: 'wp-admin\\/admin-ajax\\.php[^"\']*(?:action\\s*=\\s*["\']?(?:revslider|upload))',
    category: 'MALWARE_BACKDOOR',
    severity: 'HIGH',
    description:
      'Pola eksploitasi plugin WordPress yang diketahui lemah, sering dipakai memasang backdoor.',
  },
];

for (const s of signatures) {
  await upsert(
    malwareSignatures,
    {
      id: s.id,
      name: s.name,
      pattern: s.pattern,
      category: s.category,
      severity: s.severity,
      description: s.description,
      isActive: true,
    },
    [malwareSignatures.id],
    {
      name: s.name,
      pattern: s.pattern,
      category: s.category,
      severity: s.severity,
      description: s.description,
      isActive: true,
      updatedAt: now,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Runbooks (3) with steps                                                 */
/* -------------------------------------------------------------------------- */

console.log('[seed] template runbook...');

const runbookSeed = [
  {
    id: ID.runbooks.ojsSlot,
    title: 'SOP Pembersihan Injeksi Slot & Backdoor pada OJS 3',
    slug: 'sop-pembersihan-injeksi-slot-ojs3',
    category: 'SLOT_DEFACEMENT',
    summary:
      'Langkah sistematis membersihkan sisipan tautan judi slot dan backdoor pada instalasi OJS 3, termasuk verifikasi ulang setelah pembersihan.',
    estimatedMinutes: 180,
    steps: [
      {
        title: 'Ambil cadangan penuh sebelum menyentuh apa pun',
        detail:
          'Cadangkan berkas publik dan basis data ke lokasi terpisah. Catat tanggal dan ukuran cadangan.',
        requiresEvidence: true,
      },
      {
        title: 'Bandingkan hash DOM dengan baseline',
        detail:
          'Jalankan pemindaian Sentinel Ops. Jika dom_hash_matched bernilai false, tandai berkas yang berubah sejak baseline.',
      },
      {
        title: 'Cari berkas yang disisipi di luar inti OJS',
        detail:
          'Periksa direktori tema, plugin pihak ketiga, dan berkas .php yang waktu modifikasinya berbeda dari paket asli.',
      },
      {
        title: 'Bersihkan blok tautan tersembunyi',
        detail:
          'Hapus elemen <a> dengan style display:none, visibility:hidden, atau posisi di luar layar yang mengarah ke domain judi.',
      },
      {
        title: 'Perbarui OJS, plugin, dan tema ke versi terbaru',
        detail: 'Terapkan pembaruan keamanan, lalu hapus plugin yang sudah tidak dipelihara.',
      },
      {
        title: 'Rotasi seluruh kredensial aset',
        detail:
          'Ganti sandi cPanel, SSH, basis data, dan akun admin OJS. Catat rotasi di brankas Sentinel Ops.',
      },
      {
        title: 'Verifikasi dengan pemindaian ulang',
        detail:
          'Jalankan pemindaian skenario Bersih. Status aset baru dikembalikan ke HEALTHY setelah hasil bersih.',
      },
    ],
  },
  {
    id: ID.runbooks.sqliHardening,
    title: 'SOP Pemulihan Serangan SQL Injection & Hardening cPanel',
    slug: 'sop-pemulihan-sqli-hardening-cpanel',
    category: 'SQL_INJECTION',
    summary:
      'Prosedur pemulihan setelah percobaan atau keberhasilan SQL Injection, disertai langkah pengerasan konfigurasi hosting.',
    estimatedMinutes: 240,
    steps: [
      {
        title: 'Putuskan akses publik sementara',
        detail:
          'Aktifkan halaman pemeliharaan agar pengguna tidak terpapar galat kueri selama investigasi.',
      },
      {
        title: 'Analisis log akses untuk pola serangan',
        detail:
          'Cari permintaan memuat UNION SELECT, information_schema, atau komentar SQL pada parameter URL.',
      },
      {
        title: 'Perbaiki kueri yang rentan',
        detail:
          'Ganti perakitan kueri berbasis string dengan parameter terikat (prepared statement).',
      },
      {
        title: 'Periksa akun basis data yang tidak wajar',
        detail:
          'Hapus pengguna basis data baru yang tidak dikenal dan batasi hak akses menjadi minimum.',
      },
      {
        title: 'Keraskan konfigurasi cPanel',
        detail:
          'Aktifkan ModSecurity, batasi Percobaan login, dan nonaktifkan allow_url_fopen bila tidak diperlukan.',
      },
      {
        title: 'Rotasi kredensial basis data dan aplikasi',
        detail: 'Ganti sandi basis data produksi serta akun CMS admin, lalu catat di brankas.',
      },
      {
        title: 'Uji ulang dan tutup tiket',
        detail:
          'Jalankan pemindaian skenario Error SQL Injection hingga hasilnya bersih, lalu lengkapi RCA.',
      },
    ],
  },
  {
    id: ID.runbooks.sslRenewal,
    title: 'SOP Perpanjangan Sertifikat SSL',
    slug: 'sop-perpanjangan-sertifikat-ssl',
    category: 'SSL_EXPIRED',
    summary:
      'Prosedur standar memperbarui sertifikat SSL sebelum kedaluwarsa agar situs tidak kehilangan kepercayaan browser.',
    estimatedMinutes: 60,
    steps: [
      {
        title: 'Konfirmasi sisa masa aktif sertifikat',
        detail: 'Periksa kolom sisa hari pada dasbor DSS atau halaman detail aset.',
      },
      {
        title: 'Minta atau perbarui sertifikat pada panel hosting',
        detail: 'Gunakan Let\'s Encrypt otomatis bila hosting mendukung, atau unggah sertifikat baru.',
      },
      {
        title: 'Verifikasi rantai sertifikat',
        detail: 'Pastikan intermediate certificate terpasang dan tidak ada peringatan di browser.',
      },
      {
        title: 'Perbarui tanggal kedaluwarsa pada inventaris',
        detail:
          'Sesuaikan ssl_expiry_date pada data aset agar perhitungan sisa hari tetap akurat.',
      },
    ],
  },
];

for (const rb of runbookSeed) {
  await upsert(
    runbooks,
    {
      id: rb.id,
      title: rb.title,
      slug: rb.slug,
      category: rb.category,
      summary: rb.summary,
      estimatedMinutes: rb.estimatedMinutes,
      isActive: true,
    },
    [runbooks.id],
    {
      title: rb.title,
      slug: rb.slug,
      category: rb.category,
      summary: rb.summary,
      estimatedMinutes: rb.estimatedMinutes,
      isActive: true,
      updatedAt: now,
    },
  );

  for (let i = 0; i < rb.steps.length; i += 1) {
    const step = rb.steps[i];
    // Deterministic UUID derived from the runbook id and step order: the raw
    // "<uuid>-step-<n>" form is not a valid uuid and is rejected by the column.
    const stepId = deterministicUuid(`${rb.id}:step:${i + 1}`);
    await upsert(
      runbookSteps,
      {
        id: stepId,
        runbookId: rb.id,
        stepOrder: i + 1,
        title: step.title,
        detail: step.detail,
        requiresEvidence: step.requiresEvidence === true,
      },
      [runbookSteps.id],
      {
        stepOrder: i + 1,
        title: step.title,
        detail: step.detail,
        requiresEvidence: step.requiresEvidence === true,
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* 5. Credential vault (10, AES-256-GCM encrypted)                            */
/* -------------------------------------------------------------------------- */

console.log('[seed] brankas kredensial...');

const vaultSeed = [
  {
    assetId: ID.assets.jurnalTeknik,
    label: 'cPanel Utama Jurnal Teknik',
    category: 'CPANEL_HOSTING',
    username: 'nusantac',
    secret: 'Cp4n3l!Teknik2026',
    loginUrl: 'https://server-nusantara.id:2083',
    notes: 'Akses penuh hosting jurnal teknik. Jangan dipakai tanpa izin pimpinan.',
    rotatedDaysAgo: 42,
  },
  {
    assetId: ID.assets.jurnalTeknik,
    label: 'SSH Root Jurnal Teknik',
    category: 'SSH_ROOT',
    username: 'root',
    secret: 'R00t-SSH#Teknik-9f2a',
    loginUrl: 'ssh://103.28.14.77',
    notes: 'Kunci akses root. Autentikasi kunci saja, password login dimatikan.',
    rotatedDaysAgo: 118,
  },
  {
    assetId: ID.assets.jurnalTeknik,
    label: 'Database Produksi OJS',
    category: 'DATABASE',
    username: 'ojs_teknik',
    secret: 'Db!OjsTeknik#2026x',
    loginUrl: 'https://server-nusantara.id/phpmyadmin',
    notes: 'Basis data OJS jurnal teknik. Prefix tabel ojs_.',
    rotatedDaysAgo: 96,
  },
  {
    assetId: ID.assets.jurnalHukum,
    label: 'Admin OJS Jurnal Hukum',
    category: 'CMS_ADMIN',
    username: 'admin.hukum',
    secret: 'Hukum@Admin26!',
    loginUrl: 'https://journal.nusantara.ac.id/hukum/admin',
    notes: 'Akun administrator jurnal hukum.',
    rotatedDaysAgo: 31,
  },
  {
    assetId: ID.assets.jurnalEkonomi,
    label: 'Akun DOAJ Jurnal Ekonomi',
    category: 'OJS_INDEXING',
    username: 'editor.ekonomi',
    secret: 'Doaj#Ekonomi2026',
    loginUrl: 'https://doaj.org',
    notes: 'Pendaftaran dan pemeliharaan indeks DOAJ.',
    rotatedDaysAgo: 156,
  },
  {
    assetId: ID.assets.jurnalEkonomi,
    label: 'Akun SINTA & Garuda',
    category: 'OJS_INDEXING',
    username: 'sinta.ekonomi',
    secret: 'S1nta-Garuda#26',
    loginUrl: 'https://sinta.kemdikbud.go.id',
    notes: 'Satu akun untuk SINTA dan Garuda. Verifikasi dua langkah aktif.',
    rotatedDaysAgo: 187,
  },
  {
    assetId: ID.assets.wpCorporate,
    label: 'cPanel Portal Korporat',
    category: 'CPANEL_HOSTING',
    username: 'mitracorp',
    secret: 'Cpanel#Corp26!x',
    loginUrl: 'https://niagahoster.co.id/panel',
    notes: 'Hosting portal korporat dan blog insight.',
    rotatedDaysAgo: 74,
  },
  {
    assetId: ID.assets.wpCorporate,
    label: 'Admin WordPress Portal',
    category: 'CMS_ADMIN',
    username: 'rina.gunawan',
    secret: 'Wp@Corp#2026aa',
    loginUrl: 'https://mitra-niaga.co.id/wp-admin',
    notes: 'Akun administrator portal. Perlu dirotasi segera setelah insiden SQLi.',
    rotatedDaysAgo: 134,
  },
  {
    assetId: ID.assets.laravelErp,
    label: 'Database ERP Produksi',
    category: 'DATABASE',
    username: 'erp_app',
    secret: 'Erp#Db26!prod',
    loginUrl: 'https://erp.mitra-niaga.co.id/admin',
    notes: 'Basis data ERP. Hak akses terbatas pada skema aplikasi.',
    rotatedDaysAgo: 58,
  },
  {
    assetId: ID.assets.elibrary,
    label: 'SSH Root E-Library',
    category: 'SSH_ROOT',
    username: 'root',
    secret: 'R00t#Lib88-nus',
    loginUrl: 'ssh://103.28.14.88',
    notes: 'Akses root e-library. Server sedang down, periksa setelah pulih.',
    rotatedDaysAgo: 203,
  },
];

for (let i = 0; i < vaultSeed.length; i += 1) {
  const v = vaultSeed[i];
  const id = `d1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
  const { cipherText, iv, authTag } = encryptSecret(v.secret);

  await upsert(
    credentialVaults,
    {
      id,
      assetId: v.assetId,
      label: v.label,
      category: v.category,
      username: v.username,
      loginUrl: v.loginUrl,
      encryptedSecret: cipherText,
      iv,
      authTag,
      notes: v.notes,
      lastRotatedAt: daysAgo(v.rotatedDaysAgo),
      lastAccessedAt: daysAgo(Math.max(1, v.rotatedDaysAgo - 12)),
      lastAccessedBy: i % 2 === 0 ? ID.users.secops : ID.users.admin,
    },
    [credentialVaults.id],
    {
      label: v.label,
      category: v.category,
      username: v.username,
      loginUrl: v.loginUrl,
      encryptedSecret: cipherText,
      iv,
      authTag,
      notes: v.notes,
      lastRotatedAt: daysAgo(v.rotatedDaysAgo),
      lastAccessedAt: daysAgo(Math.max(1, v.rotatedDaysAgo - 12)),
      lastAccessedBy: i % 2 === 0 ? ID.users.secops : ID.users.admin,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Incidents (6)                                                           */
/* -------------------------------------------------------------------------- */

console.log('[seed] tiket insiden...');

// Ticket numbers are fixed so re-seeding stays stable.
const incidentSeed = [
  {
    id: 'e1000000-0000-4000-8000-000000000001',
    ticketNumber: 'INC-202611-0001',
    assetId: ID.assets.jurnalTeknik,
    reportedBy: ID.users.secops,
    assignedTo: ID.users.secops,
    title: 'Sisipan tautan judi slot terdeteksi pada Jurnal Teknik',
    description:
      'Pemindaian terjadwal menemukan tiga tautan tersembunyi mengarah ke domain judi slot di halaman beranda. Elemen disembunyikan memakai display:none dan posisi left:-9999px.',
    severity: 'CRITICAL',
    category: 'SLOT_DEFACEMENT',
    status: 'INVESTIGATING',
    // CRITICAL, 3.25h old: 4h SLA leaves ~45m, which lands in AT_RISK.
    createdAt: hoursAgo(3.25),
    rootCauseSummary: null,
    remediationSteps: null,
    runbookId: ID.runbooks.ojsSlot,
    runbookDone: 3,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000002',
    ticketNumber: 'INC-202611-0002',
    assetId: ID.assets.wpCorporate,
    reportedBy: ID.users.secops,
    assignedTo: ID.users.support,
    title: 'Indikasi SQL Injection pada plugin portal korporat',
    description:
      'Log akses menunjukkan permintaan berulang memuat UNION SELECT pada parameter id artikel. Halaman galat membocorkan struktur kueri.',
    severity: 'HIGH',
    category: 'SQL_INJECTION',
    status: 'OPEN',
    // HIGH, 1h old against a 12h window: comfortable, ON_TRACK.
    createdAt: hoursAgo(1),
    rootCauseSummary: null,
    remediationSteps: null,
    runbookId: ID.runbooks.sqliHardening,
    runbookDone: 0,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000003',
    ticketNumber: 'INC-202611-0003',
    assetId: ID.assets.elibrary,
    reportedBy: ID.users.rektorat,
    assignedTo: null,
    title: 'E-Library tidak dapat diakses',
    description:
      'Halaman e-library mengembalikan galat 503. Dugaan kegagalan koneksi basis data pada server 103.28.14.88.',
    severity: 'CRITICAL',
    category: 'SERVER_DOWN',
    status: 'OPEN',
    // CRITICAL, 3.4h old against a 4h window: ~15% left, AT_RISK and unassigned.
    createdAt: hoursAgo(3.4),
    rootCauseSummary: null,
    remediationSteps: null,
    runbookId: null,
    runbookDone: 0,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000004',
    ticketNumber: 'INC-202611-0004',
    assetId: ID.assets.jurnalHukum,
    reportedBy: ID.users.secops,
    assignedTo: ID.users.secops,
    title: 'Sertifikat SSL Jurnal Hukum kedaluwarsa dalam 6 hari',
    description:
      'Sertifikat akan berakhir dan browser mulai menandai halaman sebagai tidak aman. Perlu perpanjangan sebelum tenggat.',
    severity: 'MEDIUM',
    category: 'SSL_EXPIRED',
    status: 'CONTAINED',
    // MEDIUM, 3 days old against a 24h window: genuinely breached, which is
    // what a CONTAINED ticket that slipped past its resolution target looks
    // like. The badge must show that honestly.
    createdAt: daysAgo(3),
    rootCauseSummary: null,
    remediationSteps: 'Perpanjangan lewat panel hosting sedang diproses.',
    runbookId: ID.runbooks.sslRenewal,
    runbookDone: 2,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000005',
    ticketNumber: 'INC-202610-0011',
    assetId: ID.assets.jurnalEkonomi,
    reportedBy: ID.users.secops,
    assignedTo: ID.users.secops,
    title: 'Percobaan login berulang pada akun editor',
    description:
      'Dugaan serangan brute force terhadap halaman login OJS. Sudah dikendalikan dengan pembatasan percobaan login.',
    severity: 'MEDIUM',
    category: 'BRUTE_FORCE',
    status: 'RESOLVED',
    createdAt: daysAgo(11),
    resolvedAt: daysAgo(9),
    rootCauseSummary:
      'Halaman login OJS tidak memiliki pembatasan percobaan, sehingga 214 usaha masuk dari satu rentang IP berhasil dieksekusi dalam 40 menit.',
    remediationSteps:
      'Mengaktifkan fitur pembatasan percobaan login bawaan OJS 3.4, menambahkan aturan fail2ban pada server, dan menginformasikan pengguna untuk mengaktifkan verifikasi dua langkah.',
    runbookId: null,
    runbookDone: 0,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000006',
    ticketNumber: 'INC-202610-0008',
    assetId: ID.assets.jurnalTeknik,
    reportedBy: ID.users.rektorat,
    assignedTo: ID.users.secops,
    title: 'Konten halaman beranda terganti saat pemeliharaan',
    description:
      'Selama pembaruan plugin, tema sempat menampilkan halaman kosong. Sudah dipulihkan dari cadangan.',
    severity: 'LOW',
    category: 'CONFIGURATION_ERROR',
    status: 'CLOSED',
    createdAt: daysAgo(22),
    resolvedAt: daysAgo(21),
    rootCauseSummary:
      'Plugin cache menyimpan berkas lama setelah pembaruan tema sehingga halaman beranda merender templat yang tidak lengkap.',
    remediationSteps:
      'Membersihkan cache plugin, memverifikasi berkas tema terhadap paket asli, dan menjadwalkan pembaruan di luar jam akses tinggi.',
    runbookId: null,
    runbookDone: 0,
  },
];

const { computeSlaDeadlinesPure } = await import('@/lib/slaMath');

for (const inc of incidentSeed) {
  const deadlines = computeSlaDeadlinesPure(inc.createdAt, inc.severity);
  const isResolved = inc.status === 'RESOLVED' || inc.status === 'CLOSED';
  const slaBreached = isResolved && (inc.resolvedAt?.getTime() ?? 0) > deadlines.resolutionDueAt.getTime();

  await upsert(
    incidents,
    {
      id: inc.id,
      ticketNumber: inc.ticketNumber,
      assetId: inc.assetId,
      reportedBy: inc.reportedBy,
      assignedTo: inc.assignedTo,
      title: inc.title,
      description: inc.description,
      severity: inc.severity,
      category: inc.category,
      status: inc.status,
      slaResponseDueAt: deadlines.responseDueAt,
      firstRespondedAt: inc.status === 'OPEN' ? null : new Date(deadlines.responseDueAt.getTime() - 5 * 60_000),
      slaResolutionDueAt: deadlines.resolutionDueAt,
      resolvedAt: inc.resolvedAt ?? null,
      slaBreached,
      rootCauseSummary: inc.rootCauseSummary,
      remediationSteps: inc.remediationSteps,
      // Backdating matters: the SLA countdown is computed from created_at, so a
      // seed that let the column default to now() would show every historical
      // ticket as freshly created and instantly overdue.
      createdAt: inc.createdAt,
      updatedAt: inc.resolvedAt ?? inc.createdAt,
      version: 1,
    },
    [incidents.id],
    {
      ticketNumber: inc.ticketNumber,
      assetId: inc.assetId,
      reportedBy: inc.reportedBy,
      assignedTo: inc.assignedTo,
      title: inc.title,
      description: inc.description,
      severity: inc.severity,
      category: inc.category,
      status: inc.status,
      slaResponseDueAt: deadlines.responseDueAt,
      firstRespondedAt: inc.status === 'OPEN' ? null : new Date(deadlines.responseDueAt.getTime() - 5 * 60_000),
      slaResolutionDueAt: deadlines.resolutionDueAt,
      resolvedAt: inc.resolvedAt ?? null,
      slaBreached,
      rootCauseSummary: inc.rootCauseSummary,
      remediationSteps: inc.remediationSteps,
      createdAt: inc.createdAt,
      updatedAt: inc.resolvedAt ?? inc.createdAt,
    },
  );

  // Comments: internal notes plus client-visible replies.
  const comments = [
    {
      id: deterministicUuid(`${inc.id}:comment:1`),
      authorId: inc.assignedTo ?? ID.users.secops,
      body:
        inc.status === 'OPEN'
          ? 'Tiket baru. Saya mulai triage dan akan menghubungi klien setelah verifikasi awal.'
          : 'Investigasi dimulai. Saya sudah mengambil cadangan sebelum menyentuh berkas apa pun.',
      isInternal: true,
      createdAt: new Date(inc.createdAt.getTime() + 15 * 60_000),
    },
    {
      id: deterministicUuid(`${inc.id}:comment:2`),
      authorId: ID.users.support,
      body:
        'Halo, tim kami sudah menangani masalah ini. Kami akan mengabari perkembangan terbaru dalam beberapa jam ke depan.',
      isInternal: false,
      createdAt: new Date(inc.createdAt.getTime() + 90 * 60_000),
    },
  ];

  if (isResolved) {
    comments.push({
      id: deterministicUuid(`${inc.id}:comment:3`),
      authorId: inc.assignedTo ?? ID.users.secops,
      body: 'Pembersihan selesai dan pemindaian ulang bersih. Tiket ditutup dengan RCA terlampir.',
      isInternal: false,
      createdAt: inc.resolvedAt ?? daysAgo(1),
    });
  }

  for (const c of comments) {
    await upsert(
      incidentComments,
      {
        id: c.id,
        incidentId: inc.id,
        authorId: c.authorId,
        body: c.body,
        isInternal: c.isInternal,
        createdAt: c.createdAt,
      },
      [incidentComments.id],
      {
        body: c.body,
        isInternal: c.isInternal,
        createdAt: c.createdAt,
      },
    );
  }

  // Materialize runbook checklist for incidents that have one.
  if (inc.runbookId) {
    const steps = await db
      .select()
      .from(runbookSteps)
      .where(eq(runbookSteps.runbookId, inc.runbookId))
      .orderBy(runbookSteps.stepOrder);

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const done = i < inc.runbookDone;
      await upsert(
        incidentRunbookTasks,
        {
          id: deterministicUuid(`${inc.id}:task:${i + 1}`),
          incidentId: inc.id,
          runbookStepId: step.id,
          isDone: done,
          doneAt: done ? daysAgo(1) : null,
          doneBy: done ? (inc.assignedTo ?? ID.users.secops) : null,
        },
        [incidentRunbookTasks.id],
        {
          isDone: done,
          doneAt: done ? daysAgo(1) : null,
          doneBy: done ? (inc.assignedTo ?? ID.users.secops) : null,
          updatedAt: now,
        },
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 7. Scan history                                                            */
/* -------------------------------------------------------------------------- */

console.log('[seed] riwayat pemindaian...');

const scanSeed = [
  { assetId: ID.assets.jurnalTeknik, daysAgo: 0, status: 200, threats: 3, ssl: true, domMatch: false, summary: 'Pemindaian Jurnal Teknik Nusantara: HTTP 200, SSL valid, 3 temuan (tertinggi CRITICAL), hash DOM berbeda dari baseline.' },
  { assetId: ID.assets.jurnalTeknik, daysAgo: 1, status: 200, threats: 0, ssl: true, domMatch: true, summary: 'Pemindaian Jurnal Teknik Nusantara: HTTP 200, SSL valid, tidak ada temuan.' },
  { assetId: ID.assets.jurnalTeknik, daysAgo: 2, status: 200, threats: 0, ssl: true, domMatch: true, summary: 'Pemindaian Jurnal Teknik Nusantara: HTTP 200, SSL valid, tidak ada temuan.' },
  { assetId: ID.assets.jurnalHukum, daysAgo: 0, status: 200, threats: 1, ssl: false, domMatch: true, summary: 'Pemindaian Jurnal Hukum & Kebijakan: HTTP 200, SSL tidak valid, 1 temuan (tertinggi HIGH).' },
  { assetId: ID.assets.jurnalHukum, daysAgo: 1, status: 200, threats: 1, ssl: false, domMatch: true, summary: 'Pemindaian Jurnal Hukum & Kebijakan: HTTP 200, SSL tidak valid, 1 temuan (tertinggi HIGH).' },
  { assetId: ID.assets.jurnalEkonomi, daysAgo: 0, status: 200, threats: 0, ssl: true, domMatch: true, summary: 'Pemindaian Jurnal Ekonomi Syariah: HTTP 200, SSL valid, tidak ada temuan.' },
  { assetId: ID.assets.jurnalEkonomi, daysAgo: 1, status: 200, threats: 0, ssl: true, domMatch: true, summary: 'Pemindaian Jurnal Ekonomi Syariah: HTTP 200, SSL valid, tidak ada temuan.' },
  { assetId: ID.assets.wpCorporate, daysAgo: 0, status: 500, threats: 2, ssl: true, domMatch: false, summary: 'Pemindaian Portal Korporat Mitra Niaga: HTTP 500, SSL valid, 2 temuan (tertinggi HIGH), hash DOM berbeda dari baseline.' },
  { assetId: ID.assets.wpCorporate, daysAgo: 1, status: 200, threats: 0, ssl: true, domMatch: true, summary: 'Pemindaian Portal Korporat Mitra Niaga: HTTP 200, SSL valid, tidak ada temuan.' },
  { assetId: ID.assets.wpBlog, daysAgo: 0, status: 200, threats: 0, ssl: true, domMatch: true, summary: 'Pemindaian Blog Insight Mitra Niaga: HTTP 200, SSL valid, tidak ada temuan.' },
  { assetId: ID.assets.laravelErp, daysAgo: 0, status: 200, threats: 0, ssl: true, domMatch: true, summary: 'Pemindaian ERP Internal Mitra Niaga: HTTP 200, SSL valid, tidak ada temuan.' },
  { assetId: ID.assets.nodeApi, daysAgo: 0, status: 200, threats: 0, ssl: true, domMatch: true, summary: 'Pemindaian API Gateway Logistik: HTTP 200, SSL valid, tidak ada temuan.' },
  { assetId: ID.assets.elibrary, daysAgo: 0, status: 503, threats: 1, ssl: false, domMatch: null, summary: 'Pemindaian E-Library Kampus: HTTP 503, SSL tidak valid, 1 temuan (tertinggi CRITICAL).' },
  { assetId: ID.assets.elibrary, daysAgo: 1, status: 503, threats: 1, ssl: false, domMatch: null, summary: 'Pemindaian E-Library Kampus: HTTP 503, SSL tidak valid, 1 temuan (tertinggi CRITICAL).' },
  { assetId: ID.assets.elibrary, daysAgo: 2, status: 503, threats: 1, ssl: false, domMatch: null, summary: 'Pemindaian E-Library Kampus: HTTP 503, SSL tidak valid, 1 temuan (tertinggi CRITICAL).' },
];

for (let i = 0; i < scanSeed.length; i += 1) {
  const s = scanSeed[i];
  const id = `f1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
  const findings =
    s.threats === 0
      ? []
      : Array.from({ length: s.threats }, (_, k) => ({
          signatureId: null,
          signatureName: k === 0 ? 'Server Tidak Merespons' : 'Tautan tersembunyi (display none)',
          category: k === 0 ? 'SERVER_DOWN' : 'SLOT_DEFACEMENT',
          severity: k === 0 ? 'CRITICAL' : 'HIGH',
          pattern: 'pemindaian awal',
          matchedText: 'hasil pemindaian berkala',
          lineNumber: 0,
          context: 'direkam saat seeding data',
          reason: 'Temuan contoh dari riwayat pemindaian.',
        }));

  await upsert(
    scanLogs,
    {
      id,
      assetId: s.assetId,
      scannedAt: daysAgo(s.daysAgo),
      triggeredBy: i % 3 === 0 ? 'SCHEDULED' : 'MANUAL',
      scanMode: 'SIMULATED',
      httpStatus: s.status,
      responseTimeMs: 180 + ((i * 37) % 900),
      sslValid: s.ssl,
      domHashMatched: s.domMatch,
      threatsDetected: s.threats,
      findingsJson: findings,
      summary: s.summary,
      createdBy: i % 4 === 0 ? null : ID.users.secops,
    },
    [scanLogs.id],
    {
      scannedAt: daysAgo(s.daysAgo),
      httpStatus: s.status,
      responseTimeMs: 180 + ((i * 37) % 900),
      sslValid: s.ssl,
      domHashMatched: s.domMatch,
      threatsDetected: s.threats,
      findingsJson: findings,
      summary: s.summary,
      createdBy: i % 4 === 0 ? null : ID.users.secops,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* 8. Decision rules + settings + sequences                                   */
/* -------------------------------------------------------------------------- */

console.log('[seed] aturan DSS & pengaturan...');

await upsert(
  decisionRules,
  {
    id: 'aa000000-0000-4000-8000-000000000001',
    code: 'DEFAULT',
    label: 'Ambang batas default',
    description: 'Aturan keputusan keamanan standar Sentinel Ops.',
    sslWarnDays: 14,
    repeatInfectionThreshold: 2,
    repeatInfectionWindowDays: 30,
    credentialRotationDays: 90,
    slaWarnRatioPct: 25,
    maxActiveTicketsPerEngineer: 5,
    isActive: true,
  },
  [decisionRules.code],
  {
    label: 'Ambang batas default',
    sslWarnDays: 14,
    repeatInfectionThreshold: 2,
    repeatInfectionWindowDays: 30,
    credentialRotationDays: 90,
    slaWarnRatioPct: 25,
    maxActiveTicketsPerEngineer: 5,
    isActive: true,
    updatedAt: now,
  },
);

await upsert(
  appSettings,
  {
    id: 'ab000000-0000-4000-8000-000000000001',
    key: 'notifications.prefs',
    valueJson: {
      slaWarning: true,
      assetCompromised: true,
      vaultAccess: true,
      weeklyDigest: false,
    },
    description: 'Preferensi notifikasi internal.',
  },
  [appSettings.key],
  {
    valueJson: {
      slaWarning: true,
      assetCompromised: true,
      vaultAccess: true,
      weeklyDigest: false,
    },
    updatedAt: now,
  },
);

// Keep ticket numbering continuous with the seeded incidents.
const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
await upsert(
  documentSequences,
  { id: 'ac000000-0000-4000-8000-000000000001', docType: 'INC', period, lastValue: 4 },
  [documentSequences.docType, documentSequences.period],
  { lastValue: 4, updatedAt: now },
);

/* -------------------------------------------------------------------------- */
/* Done                                                                      */
/* -------------------------------------------------------------------------- */

const counts = await Promise.all([
  db.execute(sql`SELECT count(*)::int AS n FROM profiles`),
  db.execute(sql`SELECT count(*)::int AS n FROM web_assets`),
  db.execute(sql`SELECT count(*)::int AS n FROM malware_signatures`),
  db.execute(sql`SELECT count(*)::int AS n FROM incidents`),
  db.execute(sql`SELECT count(*)::int AS n FROM credential_vaults`),
  db.execute(sql`SELECT count(*)::int AS n FROM runbooks`),
  db.execute(sql`SELECT count(*)::int AS n FROM runbook_steps`),
  db.execute(sql`SELECT count(*)::int AS n FROM scan_logs`),
]);

const [p, a, m, i, c, r, s, sc] = counts.map((x) => Number(x.rows[0]?.n ?? 0));

console.log('');
console.log('[seed] selesai.');
console.log(`  profil              : ${p}`);
console.log(`  aset web            : ${a}`);
console.log(`  kamus deteksi       : ${m}`);
console.log(`  tiket insiden       : ${i}`);
console.log(`  kredensial brankas  : ${c}`);
console.log(`  runbook / langkah   : ${r} / ${s}`);
console.log(`  riwayat pemindaian  : ${sc}`);
console.log(`  baris baru/diperbarui: ${created} / ${updated}`);
console.log('');
console.log('Akun demo (kata sandi: sentinel123):');
for (const u of users) {
  console.log(`  ${u.role.padEnd(18)} ${u.email}`);
}
console.log('');

// Close the pool properly: PGlite flushes its files on close, and postgres.js
// keeps the event loop alive until the pool ends. Falling back to process.exit
// would leave PGlite's data directory marked as in use.
await closeDbConnection();
console.log(`[seed] koneksi ditutup (mode: ${describeDbMode()}).`);
process.exit(0);
