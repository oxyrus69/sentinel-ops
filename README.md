# Sentinel Ops

Konsol pemantauan keamanan aset web: inventaris, pemindaian uptime/SSL, deteksi
defacement dan injeksi malware, brankas kredensial terenkripsi, serta manajemen
insiden ber-SLA.

Spesifikasi lengkap ada di `spesifikasi_sistem_itsm_web_security_monitor.md`.
Keputusan visual ada di `DESIGN.md`.

## Tampilan

<p align="center">
  <img src="docs/screenshots/dashboard-desktop.jpg" alt="Dasbor Komando" width="1100">
</p>

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/screenshots/assets-desktop.jpg" alt="Inventaris aset">
      <br>Inventaris aset — grid data dengan status kesehatan
    </td>
    <td align="center" width="50%">
      <img src="docs/screenshots/incidents-desktop.jpg" alt="Antrean tiket insiden">
      <br>Antrean insiden — hitung mundur SLA per baris
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/screenshots/command-palette.jpg" alt="Palet perintah">
      <br>Palet perintah (Ctrl/⌘ + K)
    </td>
    <td align="center" width="50%">
      <img src="docs/screenshots/inspector-drawer.jpg" alt="Inspector aset">
      <br>Inspector aset — drawer tanpa meninggalkan list
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/screenshots/report-print.jpg" alt="Laporan cetak A4">
      <br>Laporan postmortem cetak (A4)
    </td>
    <td align="center" width="50%">
      <img src="docs/screenshots/status-public.jpg" alt="Halaman status publik">
      <br>Halaman status publik <code>/status/[slug]</code>, tanpa sesi
    </td>
  </tr>
</table>

Tampilan di atas memakai anatomi 5-zona: topbar + sidebar, header konteks,
toolbar, grid data, dan rail telemetri. Di ponsel yang sama terlihat utuh:

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/screenshots/dashboard-mobile.jpg" alt="Dasbor mobile">
      <br>Dasbor
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/assets-mobile.jpg" alt="Aset mobile">
      <br>Detail aset
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/vault-mobile.jpg" alt="Brankas mobile">
      <br>Brankas kredensial
    </td>
  </tr>
</table>

## Menjalankan

```bash
npm install
npm run db:migrate     # buat skema
npm run db:seed        # data demo
npm run dev
```

Buka <http://localhost:3000> dan masuk dengan salah satu akun demo di bawah.

### Akun demo (kata sandi: `sentinel123`)

| Email | Peran | Fokus |
|---|---|---|
| `admin@sentinel.id` | SUPER_ADMIN | Akses penuh, pengaturan, audit |
| `secops@sentinel.id` | SECOPS_ENGINEER | Pemindaian, insiden, brankas, DSS |
| `support@sentinel.id` | SUPPORT_AGENT | Triase tiket (tanpa akses brankas) |
| `rektorat@kampus-nusantara.ac.id` | CLIENT_OWNER | Portal klien, 4 portal jurnal OJS |
| `corptech@mitra-niaga.co.id` | CLIENT_OWNER | Portal klien, web korporat |

## Basis data

Sistem ini mendukung **dua mode** dan memilih otomatis dari `DATABASE_URL`. Tidak ada kode yang
perlu diubah saat berpindah mode.

### Mode Demo (default) — PGlite tertanam

Jika `DATABASE_URL` kosong, aplikasi memakai **PGlite**: PostgreSQL 16/18 asli yang berjalan di
dalam proses Node. Tanpa instalasi, tanpa layanan eksternal. Data disimpan di `.data/pglite/`.

```bash
npm install && npm run db:migrate && npm run db:seed && npm run dev
```

Cocok untuk mencoba, demo ke klien, dan pengembangan. Batasannya: **hanya satu proses** — PGlite
mengunci direktori datanya. Jangan jalankan `db:seed` saat `npm run dev` aktif.

### Mode Produksi — PostgreSQL server

Isi `DATABASE_URL` dengan URI standar, dan driver otomatis beralih ke `postgres` (connection pool
`max: 10`, `idle_timeout: 20`, `connect_timeout: 10`, tanpa prepared statement agar cocok dengan
pooler Neon/Supabase).

```env
DATABASE_URL="postgresql://user:password@host:5432/sentinel_ops?sslmode=require"
VAULT_MASTER_KEY="<64 karakter hex>"
SESSION_SECRET="<minimal 32 karakter>"
```

Lalu jalankan perintah yang sama:

```bash
npm run db:migrate && npm run db:seed && npm run dev
```

Skrip `db:migrate` dan `db:seed` memakai logika pemilihan mode yang **sama persis** dengan
aplikasi (`src/server/db/mode.mjs`), sehingga migrasi tidak mungkin mendarat di basis data yang
berbeda dari yang dibaca aplikasi.

| `DATABASE_URL` | Mode | Driver |
|---|---|---|
| kosong / tidak diset | Demo | PGlite tertanam |
| `pglite://...`, `file:...`, `memory://` | Demo | PGlite tertanam |
| `postgresql://...` atau `postgres://...` | Produksi | postgres.js (pool) |
| skema lain (`mysql://`, dll.) | **Ditolak** dengan pesan jelas | — |

### Kunci enkripsi

```bash
npm run secrets:generate
```

Mencetak `VAULT_MASTER_KEY` (64 hex) dan `SESSION_SECRET` siap salin ke `.env`.

**Aturan penegakan:**

| Kondisi | Perilaku |
|---|---|
| Mode demo (PGlite, atau `ALLOW_DEMO_SECRETS=true`) | Fallback lokal yang stabil. Demo dan seluruh tes berjalan tanpa konfigurasi |
| `NODE_ENV=production` + PostgreSQL server + secret contoh/kosong/pendek | **Aplikasi menolak start** dengan pesan cara memperbaikinya |
| `NODE_ENV=production` + PostgreSQL server + secret valid | Berjalan normal |

> Mengganti `VAULT_MASTER_KEY` membuat sandi brankas yang sudah tersimpan tidak bisa didekripsi.
> Rotasi kunci memerlukan migrasi ulang seluruh entri brankas.

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Terapkan migrasi (idempoten) |
| `npm run db:migrate -- --status` | Daftar migrasi yang sudah diterapkan |
| `npm run db:migrate -- --fresh` | Hapus semua tabel lalu migrasi ulang |
| `npm run db:seed` | Isi/segarkan data demo (idempoten) |
| `npm run secrets:generate` | Cetak `VAULT_MASTER_KEY` + `SESSION_SECRET` untuk produksi |

## Peta modul

| Modul | Rute |
|---|---|
| Dasbor komando | `/admin` |
| Inventaris aset | `/assets`, `/assets/[id]`, `/assets/baru` |
| Pemindai & kamus deteksi | `/scanner`, `/scanner/rules` |
| Tiket insiden & SLA | `/incidents`, `/incidents/[id]` |
| Brankas kredensial | `/vault` |
| Runbook & SOP | `/runbooks`, `/runbooks/[id]` |
| Pendukung keputusan | `/dss`, `/dss/risiko`, `/dss/sla`, `/dss/riwayat` |
| Portal klien | `/portal`, `/portal/lapor` |
| Halaman status publik | `/status/[slug]` |
| Jejak audit & pengaturan | `/admin/audit`, `/admin/settings` |
| Ekspor CSV | `/api/export/assets`, `/api/export/incidents` |
| Laporan cetak A4 | `/reports/asset/[id]`, `/reports/incident/[id]` |

## Arsitektur

```
src/
├── app/                 Rute App Router
│   ├── (app)/           Shell terautentikasi (sidebar + toast)
│   ├── (print)/         Route group cetak A4, layout terpisah
│   ├── api/             Route handler (sesi, ekspor CSV)
│   ├── login/           Autentikasi
│   └── status/[slug]/   Publik, tanpa sesi
├── components/
│   ├── layout/          Sidebar adaptif, page header, tombol keluar
│   └── ui/              Primitif (button, card, badge, field, table, toast, dialog, SLA)
├── lib/                 Murni, bisa dipakai server maupun klien
│   ├── scannerMath.ts   Analisis HTML, hash DOM, deteksi tautan tersembunyi
│   ├── slaMath.ts       Tenggat & progres SLA
│   ├── tableQuery.ts    Whitelist searchParams
│   └── useIdempotentAction.ts
└── server/              Hanya server
    ├── auth/            Sesi berbasis cookie + penjaga halaman
    ├── db/              Skema Drizzle + singleton koneksi
    ├── services/        12 mesin inti
    ├── audit.ts         Jejak audit
    ├── idempotency.ts   Kunci requestId
    └── rbac.ts          Matriks akses
```

### Keputusan desain yang perlu diketahui

**Sesi disimpan di tabel `sessions`, bukan memori proses.** Cookie membawa
`<sessionId>.<hmac>`; tanda tangan pakai `SESSION_SECRET`. Ini bertahan saat
restart dan bekerja di lebih dari satu instance.

**Satu aturan pemilihan basis data, dipakai tiga tempat.** `src/server/db/mode.mjs`
adalah satu-satunya implementasi deteksi mode; `mode.ts` memberi tipe di atasnya untuk
aplikasi, dan skrip migrasi/seed mengimpornya langsung. Dua salinan logika akan membuat
migrasi mendarat di basis data berbeda dari yang dibaca aplikasi.

**Tabel memakai `@tanstack/react-table`, tapi komparatornya sendiri.**
Fungsi bawaan `alphanumeric` dipecah untuk teks seperti "item2" < "item10":
tanda minus jadi potongan teks dan diabaikan, sehingga antrean tiket terlambat
tampil "lewat 2h, lewat 10h, lewat 19h" — paling tidak mendesak di atas.
`src/lib/tableSort.ts` membandingkan angka sebagai angka bertanda dan sisanya
secara natural. Diuji langsung di `verify-sort.mjs` justru karena bug ini pernah
lolos.

**Validasi input terpusat di `src/server/validation.ts` (zod).** Server Action
adalah batas kepercayaan: formulir bisa dilewati dengan memanggil action
langsung. Skema di sana juga menolak kategori yang tidak boleh dilaporkan klien
(malware, defacement) dan regex yang tidak bisa dikompilasi. Perhatikan
`z.coerce.boolean()` sengaja tidak dipakai: `Boolean('false')` bernilai `true`,
jadi `isActive: 'false'` akan mengaktifkan aturan, bukan mematikannya.

**Cookie `Secure` mengikuti skema URL, bukan `NODE_ENV`.** Build produksi yang
disajikan lewat HTTP biasa (LAN, localhost, uji coba) akan menerbitkan cookie
yang ditolak browser kalau flag ini diikat ke `NODE_ENV`, dan gejalanya adalah
login yang terus terpental ke `/login`. Deteksi memakai `x-forwarded-proto` atau
`APP_URL`. Paksa lewat `SESSION_COOKIE_SECURE=true|false` bila perlu.

**Cookie hanya ditulis dari Route Handler.** Server Action yang memanggil
`cookies().set()` sambil dipakai lewat `useActionState` tidak selalu mengirim
`Set-Cookie` ke browser. Alur login karena itu: action membuat baris sesi →
klien memanggil `POST /api/auth/session` → baru navigasi penuh.

**Subquery berkorelasi ditulis dengan alias eksplisit.** Drizzle tidak selalu
mengikat `${tabel.kolom}` di dalam `sql` bersarang ke tabel luar. Bentuk yang
dipakai: `SELECT count(*) FROM incidents AS i WHERE i.asset_id = "web_assets"."id"`.

**Idempotensi dua lapis.** `useIdempotentAction` mengunci dengan `useRef` sebelum
Server Action dipanggil; server memakai `withIdempotency()` dengan
`INSERT ... ON CONFLICT DO NOTHING` pada `idempotency_keys`.

**Penguncian optimistik.** `incidents.version` dan `web_assets.version` diperiksa
di klausa `WHERE`. Konflik mengembalikan `{ ok: false, code: 'CONFLICT' }` plus
versi terbaru, bukan menimpa data diam-diam.

**Pemindaian mode simulasi.** Dokumen HTML preset dianalisis oleh mesin deteksi
yang sama dengan pemindaian live. Tidak ada permintaan keluar ke situs target,
tetapi seluruh jalur kode (temuan, transisi status, tiket otomatis) tetap
dijalankan.

## Verifikasi

```bash
npx tsc --noEmit        # 0 error
npm run build           # 0 error, 30 rute

# Saat server berjalan (HTTP-only, tidak menyentuh DB):
node --experimental-strip-types --conditions=react-server \
  scripts/run-node-script.mjs scripts/e2e-actions.mjs http://localhost:3000   # 39/39

# Tidak butuh server:
node --experimental-strip-types --conditions=react-server \
  scripts/run-node-script.mjs scripts/verify-rbac.mjs          # 22/22
node --experimental-strip-types --conditions=react-server \
  scripts/run-node-script.mjs scripts/verify-sort.mjs          # 13/13
node --experimental-strip-types --conditions=react-server \
  scripts/run-node-script.mjs scripts/verify-validation.mjs    # 41/41
node --experimental-strip-types --conditions=react-server \
  scripts/run-node-script.mjs scripts/verify-env.mjs           # 23/23
node --experimental-strip-types --conditions=react-server \
  scripts/run-node-script.mjs scripts/verify-secrets.mjs       # 16/16

# Saat server DIMATIKAN (butuh akses langsung ke PGlite):
node --experimental-strip-types --conditions=react-server \
  scripts/run-node-script.mjs scripts/verify-db.mjs            # 13/13

# Penegakan produksi (dua arah, butuh environment khusus):
#   lihat header scripts/verify-prod-enforcement.mjs dan verify-prod-accepted.mjs
```

**Total: 167 pemeriksaan.** `e2e-actions.mjs` menguji lewat HTTP saja.
`verify-db.mjs` memeriksa integritas data dan harus dijalankan tanpa server karena
PGlite hanya menerima satu penulis.

## Kredensial produksi

Ganti tiga nilai di `.env` sebelum deploy:

```bash
# Kunci master brankas (32 byte)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Secret sesi (minimal 32 karakter)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Isi `VAULT_MASTER_KEY` dan `SESSION_SECRET`. Tanpa keduanya, sistem memakai
fallback deterministik khusus pengembangan dan menolak berjalan di produksi
untuk kunci brankas.

> Mengganti `VAULT_MASTER_KEY` membuat sandi yang sudah tersimpan tidak bisa
> didekripsi. Rotasi kunci butuh migrasi ulang seluruh entri brankas.
