# Sentinel Ops — Spesifikasi Koneksi Basis Data Ganda & Inisialisasi Git

Dokumen ini adalah instruksi teknis lanjutan bagi *coding agent* untuk menyelesaikan tiga risiko utama pada laporan proyek (**Butir #1: Basis Data Embedded PGlite**, **Butir #2: Kunci Kriptografi Lokal**, dan **Butir #8: Inisialisasi Repositori Git**) tanpa merusak kemudahan demo lokal maupun 128 pengujian otomatis yang sudah lulus.

---

## 1. Tujuan Arsitektur

1. **Koneksi Basis Data Ganda (*Dual-Mode Database Adapter*):**
   * **Mode Demo / Lokal (Default):** Jika variabel `DATABASE_URL` tidak diisi atau bernilai `pglite://...`, sistem otomatis menggunakan **PGlite** (*embedded PostgreSQL*). Siapa pun yang mengunduh repositori dari GitHub dapat langsung menjalankan `npm install && npm run db:migrate && npm run db:seed && npm run dev` tanpa perlu menginstal server PostgreSQL.
   * **Mode Server Produksi:** Jika `DATABASE_URL` berisi URI standar (`postgresql://user:pass@host:5432/dbname`), sistem otomatis beralih menggunakan *driver* PostgreSQL jaringan (melalui `postgres` / `pg`) dengan *connection pooling* yang aman untuk lingkungan *multi-instance* atau *serverless*.
2. **Penegakan Keamanan Variabel Lingkungan (*Secret Hardening*):**
   * Memastikan `VAULT_MASTER_KEY` dan `SESSION_SECRET` memiliki *fallback* deterministik hanya saat pengembangan/demo lokal, dan wajib diisi dengan kunci acak kriptografis saat berjalan di mode produksi penuh (`NODE_ENV=production` dan `ALLOW_DEMO_SECRETS !== 'true'`).
3. **Inisialisasi Git Standar Industri:**
   * Menyiapkan `.gitignore` yang ketat agar direktori data PGlite, berkas `.env`, dan hasil kompilasi `.next` tidak pernah bocor ke repositori publik.
   * Menyediakan `.env.example` yang terdokumentasi rapi serta membuat riwayat *commit* awal yang bersih di cabang `main`.

---

## 2. Spesifikasi Koneksi Basis Data Ganda (`src/server/db`)

### 2.1. Deteksi Mode & Inisialisasi Driver (`src/server/db/index.ts`)

Perbarui modul basis data utama agar mendeteksi protokol dari `process.env.DATABASE_URL`:

1. **Aturan Pemilihan Driver:**
   * Jika `DATABASE_URL` kosong, tidak terdefinisi, atau diawali dengan `pglite://` / `file:`:
     * Gunakan `@electric-sql/pglite` dan `drizzle-orm/pglite`.
     * Simpan berkas data lokal di direktori khusus yang diabaikan Git (misal: `.data/pglite` atau sesuai lokasi yang saat ini dipakai).
   * Jika `DATABASE_URL` diawali dengan `postgres://` atau `postgresql://`:
     * Gunakan paket `postgres` (`drizzle-orm/postgres-js`) atau `pg` (`drizzle-orm/node-postgres`).
     * Konfigurasikan *connection pool* (misal: `max: 10`, `idle_timeout: 20`, `connect_timeout: 10`).

2. **Singleton Pattern untuk Next.js Hot-Reload:**
   * Simpan instans koneksi di `globalThis` selama mode pengembangan (`NODE_ENV !== 'production'`) agar *Fast Refresh* Next.js tidak membuat koneksi ganda atau mengunci direktori PGlite:
     ```typescript
     // Pola konseptual yang wajib diterapkan:
     // 1. Ekspor konstanta DB_MODE: 'pglite' | 'postgres'
     // 2. Pastikan tipe instans `db` tetap kompatibel bagi seluruh 23 modul di `src/server/`
     // 3. Sediakan fungsi `closeDbConnection()` untuk menutup koneksi dengan bersih pada skrip CLI/migrasi
     ```

3. **Kompatibilitas Skrip CLI (`scripts/db-migrate.mjs` & `scripts/seed.mjs`):**
   * Perbarui skrip migrasi dan *seed* agar membaca logika pemilihan *driver* yang sama.
   * Ketika dijalankan tanpa `DATABASE_URL`, skrip bermigrasi dan mengisi *seed* ke PGlite lokal.
   * Ketika dijalankan dengan `DATABASE_URL="postgresql://..."`, skrip yang sama langsung bermigrasi dan mengisi *seed* ke server PostgreSQL eksternal (seperti Supabase, Neon, Railway, atau VPS) tanpa perlu mengubah kode skrip.

---

## 3. Pengamanan Kunci Enkripsi & Sesi (`src/server/env.ts`)

Untuk menutup **Risiko #2** pada laporan proyek:

1. Buat modul validator konfigurasi terpusat di `src/server/env.ts` (`import 'server-only'`).
2. **Aturan Validasi Kunci (`VAULT_MASTER_KEY` & `SESSION_SECRET`):**
   * Jika `process.env.NODE_ENV === 'production'` **dan** `process.env.ALLOW_DEMO_SECRETS !== 'true'` **dan** `DB_MODE === 'postgres'`:
     * Wajibkan `VAULT_MASTER_KEY` terisi (minimal 32 karakter / 64 karakter hex untuk AES-256-GCM) dan bukan nilai *default* bawaan.
     * Wajibkan `SESSION_SECRET` terisi (minimal 32 karakter acak) dan bukan nilai *default* bawaan.
     * Jika salah satu tidak memenuhi syarat, lemparkan *Error* yang jelas saat *startup* dengan pesan cara membuatnya.
   * Jika berjalan di mode lokal/demo (`DB_MODE === 'pglite'` atau `ALLOW_DEMO_SECRETS === 'true'`):
     * Gunakan nilai *fallback* lokal yang stabil agar pengujian otomatis (`npm run build` dan `e2e-actions.mjs`) tetap berjalan lancar dengan **0 error**.
3. **Skrip Pembuat Kunci Rahasia (`scripts/generate-secrets.mjs`):**
   * Tambahkan skrip utilitas yang dapat dipanggil melalui `npm run secrets:generate`.
   * Skrip ini mencetak baris siap salin untuk `.env` produksi menggunakan `crypto.randomBytes(32).toString('hex')` untuk `VAULT_MASTER_KEY` dan `SESSION_SECRET`.

---

## 4. Konfigurasi `.env.example` & `.gitignore`

### 4.1. Isi Wajib `.env.example`

Buat berkas `.env.example` di akar proyek yang menjelaskan kedua mode secara gamblang:

```env
# ============================================================================
# SENTINEL OPS — KONFIGURASI LINGKUNGAN
# ============================================================================

# 1. MODE BASIS DATA
# Biarkan kosong atau gunakan jalur lokal untuk Mode Demo (PGlite Embedded):
DATABASE_URL=""
PGLITE_DATA_DIR=".data/pglite"

# Untuk Mode Produksi (PostgreSQL Server / Supabase / Neon / VPS),
# isi dengan URI PostgreSQL standar (otomatis menonaktifkan PGlite):
# DATABASE_URL="postgresql://postgres:password@localhost:5432/sentinel_ops"

# 2. KUNCI KEAMANAN & KRIPTOGRAFI
# Jalankan `npm run secrets:generate` untuk membuat kunci produksi baru.
# Pada mode produksi dengan PostgreSQL, kedua variabel di bawah ini WAJIB diganti:
VAULT_MASTER_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
SESSION_SECRET="sentinel-ops-local-dev-session-secret-change-in-prod"

# Setel ke "true" hanya jika Anda sengaja menjalankan build simulasi lokal tanpa PostgreSQL:
ALLOW_DEMO_SECRETS="true"
```

### 4.2. Aturan Ketat `.gitignore`

Pastikan `.gitignore` mencakup seluruh artefak berikut agar repositori tetap ringan dan aman:

* Direktori dependensi: `/node_modules`, `/.pnp`, `.pnp.js`
* Hasil kompilasi & cache Next.js: `/.next/`, `/out/`, `/build`, `next-env.d.ts`, `*.tsbuildinfo`
* Direktori basis data lokal PGlite & berkas sementara: `/.data/`, `/pglite-data/`, `*.db`, `*.sqlite*`, `/drizzle/*.tmp`
* Berkas variabel lingkungan rahasia: `.env`, `.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local` (**kecuali** `.env.example` yang wajib masuk ke Git: `!.env.example`)
* Log & sistem operasi: `npm-debug.log*`, `yarn-debug.log*`, `pnpm-debug.log*`, `.DS_Store`, `Thumbs.db`

---

## 5. Pembaruan Dokumentasi (`OVERVIEW-PM.md` & `README.md`)

Setelah fitur koneksi basis data ganda dan skrip kunci enkripsi selesai diimplementasikan:

1. Perbarui `README.md` dengan panduan beralih dari **Mode Demo (PGlite)** ke **Mode Produksi (PostgreSQL Server)** hanya dengan mengubah variabel `DATABASE_URL` di `.env`.
2. Perbarui bagian **6. Batasan dan Risiko** pada `OVERVIEW-PM.md` untuk mencatat bahwa:
   * Adaptor PostgreSQL Server sudah tersedia dan siap diaktifkan melalui `DATABASE_URL`.
   * Generator dan validator kunci kriptografi produksi (`npm run secrets:generate`) sudah terpasang.
   * Repositori Git telah diinisialisasi dengan aturan `.gitignore` produksi.

---

## 6. Prosedur Inisialisasi Git & Verifikasi Akhir (Wajib)

*Coding agent* wajib mengeksekusi langkah-langkah verifikasi dan inisialisasi Git berikut secara berurutan:

1. **Verifikasi Kode & Pengujian Otomatis:**
   * Jalankan migrasi dan *seed*: `npm run db:migrate && npm run db:seed`
   * Jalankan pemeriksaan tipe: `npx tsc --noEmit` (Wajib **0 error**)
   * Jalankan kompilasi produksi: `npm run build` (Wajib **0 error**)
   * Jalankan seluruh rangkaian uji otomatis (E2E HTTP, RBAC, integritas data, pengurutan, dan validasi input) dan pastikan seluruh **128 pemeriksaan tetap lulus 100%**.

2. **Inisialisasi Repositori Git:**
   * Jika belum ada folder `.git`, jalankan `git init -b main`.
   * Periksa `git status` untuk memastikan **tidak ada** berkas di dalam `.next/`, `node_modules/`, `.data/` (data biner PGlite), maupun `.env` yang ikut terlacak (*tracked*).
   * Lakukan *staging* seluruh berkas kode sumber, skrip pengujian, migrasi SQL, `.env.example`, dan dokumentasi.
   * Buat *commit* terstruktur dengan pesan yang jelas, misalnya:
     `feat: initial production-ready release of Sentinel Ops ITSM with dual-mode PostgreSQL/PGlite support`
   * Jalankan `git status` dan `git log -n 3` di akhir eksekusi sebagai bukti bahwa repositori bersih dan siap di-*push* ke GitHub.