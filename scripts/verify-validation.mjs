/**
 * Validation schema checks.
 *
 * Exercises zod schemas directly, including cases the UI makes hard to reach:
 * a category a client must not be able to report, a regex that would break the
 * scanner, an SLA target whose resolution is shorter than its response, and
 * unknown keys that must be stripped before they reach a query.
 *
 *   node --experimental-strip-types --conditions=react-server \
 *     scripts/run-node-script.mjs scripts/verify-validation.mjs
 */
import process from 'node:process';

const {
  assetCreateSchema,
  clientIncidentReportSchema,
  credentialCreateSchema,
  credentialRotateSchema,
  dssThresholdsSchema,
  incidentCommentSchema,
  incidentStatusChangeSchema,
  notificationPrefsSchema,
  parseInput,
  signatureCreateSchema,
  signatureUpdateSchema,
  slaTargetsSchema,
} = await import('@/server/validation');

let pass = 0;
let fail = 0;

/** Expect the schema to reject, and report which message it produced. */
function rejects(label, schema, input, expectFragment) {
  const result = parseInput(schema, input);
  if (result.ok) {
    fail += 1;
    console.log(`  FAIL ${label} — diterima, seharusnya ditolak`);
    return;
  }
  if (expectFragment && !result.error.includes(expectFragment)) {
    fail += 1;
    console.log(`  FAIL ${label} — pesan "${result.error}" tidak memuat "${expectFragment}"`);
    return;
  }
  pass += 1;
  console.log(`  ok   ${label} — "${result.error.slice(0, 72)}"`);
}

/** Expect the schema to accept, and optionally assert a transformed value. */
function accepts(label, schema, input, assert) {
  const result = parseInput(schema, input);
  if (!result.ok) {
    fail += 1;
    console.log(`  FAIL ${label} — ditolak: ${result.error}`);
    return;
  }
  if (assert) {
    const problem = assert(result.data);
    if (problem) {
      fail += 1;
      console.log(`  FAIL ${label} — ${problem}`);
      return;
    }
  }
  pass += 1;
  console.log(`  ok   ${label}`);
}

const UUID = '11111111-1111-4111-8111-111111111111';

/* -------------------------------------------------------------------------- */
console.log('\n== Aset ==');

rejects('nama terlalu pendek', assetCreateSchema, {
  clientId: UUID,
  name: 'ab',
  domainUrl: 'a.ac.id',
  platform: 'OJS_3',
}, 'Nama aset minimal 3 karakter');

rejects('domain tanpa TLD', assetCreateSchema, {
  clientId: UUID,
  name: 'Aset',
  domainUrl: 'bukan domain',
  platform: 'OJS_3',
}, 'Domain harus berupa hostname');

rejects('clientId bukan uuid', assetCreateSchema, {
  clientId: 'client-1',
  name: 'Aset',
  domainUrl: 'a.ac.id',
  platform: 'OJS_3',
}, 'Pilih klien pemilik aset');

rejects('platform di luar enum', assetCreateSchema, {
  clientId: UUID,
  name: 'Aset',
  domainUrl: 'a.ac.id',
  platform: 'JOOMLA',
}, '');

accepts('aset valid (hostname polos)', assetCreateSchema, {
  clientId: UUID,
  name: 'Jurnal Uji',
  domainUrl: 'journal.kampus.ac.id',
  platform: 'OJS_3',
});

accepts('aset valid (URL + path + port)', assetCreateSchema, {
  clientId: UUID,
  name: 'Jurnal Uji',
  domainUrl: 'https://journal.kampus.ac.id:8443/teknik',
  platform: 'OJS_3',
});

accepts('tanggal SSL dikonversi ke Date', assetCreateSchema, {
  clientId: UUID,
  name: 'Jurnal Uji',
  domainUrl: 'a.ac.id',
  platform: 'OJS_3',
  sslExpiryDate: '2027-06-01',
}, (data) => (data.sslExpiryDate instanceof Date ? null : 'sslExpiryDate bukan Date'));

rejects('tanggal SSL tidak valid', assetCreateSchema, {
  clientId: UUID,
  name: 'Jurnal Uji',
  domainUrl: 'a.ac.id',
  platform: 'OJS_3',
  sslExpiryDate: 'bukan-tanggal',
}, 'Tanggal tidak valid');

/* -------------------------------------------------------------------------- */
console.log('\n== Laporan klien ==');

rejects('judul terlalu pendek', clientIncidentReportSchema, {
  assetId: UUID,
  title: 'Galat',
  description: 'Halaman arsip menampilkan galat 500 sejak pagi ini dan semua pengunjung terkena.',
  category: 'SERVER_DOWN',
}, 'Judul minimal 10 karakter');

rejects('deskripsi terlalu pendek', clientIncidentReportSchema, {
  assetId: UUID,
  title: 'Halaman arsip menampilkan galat',
  description: 'Rusak.',
  category: 'SERVER_DOWN',
}, 'minimal 30 karakter');

// The important one: a client must not be able to self-report a compromise.
rejects('kategori malware ditolak untuk klien', clientIncidentReportSchema, {
  assetId: UUID,
  title: 'Sepertinya ada malware di situs',
  description: 'Ada berkas aneh yang tidak saya kenali di direktori unggahan.',
  category: 'MALWARE_BACKDOOR',
}, '');

rejects('kategori slot defacement ditolak untuk klien', clientIncidentReportSchema, {
  assetId: UUID,
  title: 'Ada tulisan judi di halaman',
  description: 'Saya melihat tulisan judi muncul di beranda jurnal kami sejak kemarin.',
  category: 'SLOT_DEFACEMENT',
}, '');

accepts('laporan valid', clientIncidentReportSchema, {
  assetId: UUID,
  title: 'Halaman arsip menampilkan galat',
  description: 'Halaman arsip jurnal menampilkan galat 500 sejak pagi ini dan semua pengunjung terkena.',
  category: 'SERVER_DOWN',
});

/* -------------------------------------------------------------------------- */
console.log('\n== Insiden ==');

rejects('status di luar enum', incidentStatusChangeSchema, {
  incidentId: UUID,
  toStatus: 'ARCHIVED',
  expectedVersion: 1,
}, '');

rejects('versi bukan angka', incidentStatusChangeSchema, {
  incidentId: UUID,
  toStatus: 'RESOLVED',
  expectedVersion: 'satu',
}, '');

accepts('versi dari string dikonversi', incidentStatusChangeSchema, {
  incidentId: UUID,
  toStatus: 'RESOLVED',
  expectedVersion: '3',
}, (data) => (data.expectedVersion === 3 ? null : `expectedVersion = ${data.expectedVersion}`));

rejects('komentar kosong', incidentCommentSchema, {
  incidentId: UUID,
  body: '   ',
  isInternal: true,
}, 'tidak boleh kosong');

/* -------------------------------------------------------------------------- */
console.log('\n== Brankas ==');

rejects('sandi terlalu pendek', credentialCreateSchema, {
  assetId: UUID,
  label: 'cPanel',
  category: 'CPANEL_HOSTING',
  username: 'admin',
  secret: '123',
}, 'minimal 4 karakter');

rejects('label kosong', credentialCreateSchema, {
  assetId: UUID,
  label: '   ',
  category: 'CPANEL_HOSTING',
  username: 'admin',
  secret: 'rahasia123',
}, 'Label kredensial wajib diisi');

rejects('kategori kredensial di luar enum', credentialCreateSchema, {
  assetId: UUID,
  label: 'cPanel',
  category: 'FTP',
  username: 'admin',
  secret: 'rahasia123',
}, '');

accepts('kredensial valid', credentialCreateSchema, {
  assetId: UUID,
  label: 'cPanel Utama',
  category: 'CPANEL_HOSTING',
  username: 'nusantac',
  secret: 'Cp4n3l!2026',
});

rejects('rotasi dengan sandi pendek', credentialRotateSchema, {
  vaultId: UUID,
  newSecret: 'ab',
}, 'minimal 4 karakter');

/* -------------------------------------------------------------------------- */
console.log('\n== Kamus deteksi ==');

// A bad regex must never reach the scanner: it would be skipped silently at
// scan time, quietly disabling a detection rule.
rejects('regex tidak valid', signatureCreateSchema, {
  name: 'Uji',
  pattern: '(unclosed',
  category: 'SLOT_DEFACEMENT',
  severity: 'HIGH',
}, 'regex tidak valid');

rejects('pola kosong', signatureCreateSchema, {
  name: 'Uji',
  pattern: '  ',
  category: 'SLOT_DEFACEMENT',
  severity: 'HIGH',
}, 'tidak boleh kosong');

rejects('pola terlalu panjang', signatureCreateSchema, {
  name: 'Uji',
  pattern: 'a'.repeat(401),
  category: 'SLOT_DEFACEMENT',
  severity: 'HIGH',
}, 'terlalu panjang');

accepts('aturan valid', signatureCreateSchema, {
  name: 'Slot gacor',
  pattern: 'slot\\s*gacor|maxwin',
  category: 'SLOT_DEFACEMENT',
  severity: 'CRITICAL',
});

accepts('pembaruan tanpa pola (partial)', signatureUpdateSchema, {
  id: UUID,
  isActive: false,
});

/* -------------------------------------------------------------------------- */
console.log('\n== Pengaturan ==');

rejects('SLA: resolusi lebih pendek dari respons', slaTargetsSchema, {
  CRITICAL: { responseMinutes: 240, resolutionMinutes: 15 },
  HIGH: { responseMinutes: 60, resolutionMinutes: 720 },
  MEDIUM: { responseMinutes: 240, resolutionMinutes: 1440 },
  LOW: { responseMinutes: 720, resolutionMinutes: 4320 },
}, 'resolusi harus lebih lama');

rejects('SLA: di luar batas 14 hari', slaTargetsSchema, {
  CRITICAL: { responseMinutes: 15, resolutionMinutes: 999999 },
  HIGH: { responseMinutes: 60, resolutionMinutes: 720 },
  MEDIUM: { responseMinutes: 240, resolutionMinutes: 1440 },
  LOW: { responseMinutes: 720, resolutionMinutes: 4320 },
}, 'Maksimal 14 hari');

rejects('SLA: nol menit', slaTargetsSchema, {
  CRITICAL: { responseMinutes: 0, resolutionMinutes: 240 },
  HIGH: { responseMinutes: 60, resolutionMinutes: 720 },
  MEDIUM: { responseMinutes: 240, resolutionMinutes: 1440 },
  LOW: { responseMinutes: 720, resolutionMinutes: 4320 },
}, 'Minimal 1 menit');

accepts('SLA valid', slaTargetsSchema, {
  CRITICAL: { responseMinutes: 15, resolutionMinutes: 240 },
  HIGH: { responseMinutes: 60, resolutionMinutes: 720 },
  MEDIUM: { responseMinutes: 240, resolutionMinutes: 1440 },
  LOW: { responseMinutes: 720, resolutionMinutes: 4320 },
});

rejects('ambang DSS: negatif', dssThresholdsSchema, {
  sslWarnDays: -5,
  repeatInfectionThreshold: 2,
  repeatInfectionWindowDays: 30,
  credentialRotationDays: 90,
  slaWarnRatioPct: 25,
  maxActiveTicketsPerEngineer: 5,
}, 'Minimal 1 hari');

rejects('ambang DSS: persen di atas 99', dssThresholdsSchema, {
  sslWarnDays: 14,
  repeatInfectionThreshold: 2,
  repeatInfectionWindowDays: 30,
  credentialRotationDays: 90,
  slaWarnRatioPct: 150,
  maxActiveTicketsPerEngineer: 5,
}, 'Maksimal 99%');

accepts('ambang DSS dari string form', dssThresholdsSchema, {
  sslWarnDays: '14',
  repeatInfectionThreshold: '2',
  repeatInfectionWindowDays: '30',
  credentialRotationDays: '90',
  slaWarnRatioPct: '25',
  maxActiveTicketsPerEngineer: '5',
}, (data) => (data.sslWarnDays === 14 ? null : `sslWarnDays = ${data.sslWarnDays}`));

rejects('preferensi notifikasi bukan boolean', notificationPrefsSchema, {
  slaWarning: 'kadang',
  assetCompromised: true,
  vaultAccess: true,
  weeklyDigest: false,
}, 'Harus bernilai true atau false');

// The bug this guards: `Boolean('false')` is `true`, so a naive coerce would
// flip a flag meant to be off.
accepts('preferensi dari string "false" menjadi false', notificationPrefsSchema, {
  slaWarning: 'false',
  assetCompromised: 'true',
  vaultAccess: false,
  weeklyDigest: 'false',
}, (data) =>
  data.slaWarning === false && data.assetCompromised === true && data.weeklyDigest === false
    ? null
    : `slaWarning=${data.slaWarning} assetCompromised=${data.assetCompromised}`);

accepts('isActive "false" benar-benar menonaktifkan', signatureUpdateSchema, {
  id: UUID,
  isActive: 'false',
}, (data) => (data.isActive === false ? null : `isActive=${data.isActive}`));

accepts('isInternal "false" tetap terlihat klien', incidentCommentSchema, {
  incidentId: UUID,
  body: 'Balasan untuk klien.',
  isInternal: 'false',
}, (data) => (data.isInternal === false ? null : `isInternal=${data.isInternal}`));

rejects('isInternal bernilai sampah ditolak', incidentCommentSchema, {
  incidentId: UUID,
  body: 'Balasan.',
  isInternal: 'mungkin',
}, 'Harus bernilai true atau false');

/* -------------------------------------------------------------------------- */
console.log('\n== Kebersihan input ==');

accepts('kunci asing dibuang sebelum menyentuh kueri', assetCreateSchema, {
  clientId: UUID,
  name: 'Jurnal Uji',
  domainUrl: 'a.ac.id',
  platform: 'OJS_3',
  // A caller could try to smuggle these through.
  isActive: true,
  role: 'SUPER_ADMIN',
  version: 99,
}, (data) => {
  const keys = Object.keys(data);
  const smuggled = keys.filter((k) => ['isActive', 'role', 'version'].includes(k));
  return smuggled.length > 0 ? `kunci lolos: ${smuggled.join(', ')}` : null;
});

accepts('spasi dipangkas', assetCreateSchema, {
  clientId: UUID,
  name: '  Jurnal Uji  ',
  domainUrl: '  a.ac.id  ',
  platform: 'OJS_3',
}, (data) =>
  data.name === 'Jurnal Uji' && data.domainUrl === 'a.ac.id'
    ? null
    : `name="${data.name}" domain="${data.domainUrl}"`);

console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);
process.exit(fail > 0 ? 1 : 0);
