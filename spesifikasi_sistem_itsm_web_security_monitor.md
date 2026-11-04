# Sentinel Ops — IT Asset, Web Security & Incident Monitor (ITSM)

Dokumen ini adalah spesifikasi teknis menyeluruh (*blueprint* & *agent instructions*) untuk membangun sistem manajemen aset web, pemantauan keamanan (*uptime*, SSL, deteksi *defacement* / injeksi *malware* judi slot), brankas kredensial terenkripsi, serta *ticketing* insiden berbasis SLA menggunakan **Next.js App Router**.

Dirancang khusus dengan standar arsitektur setara produksi (*production-grade*) agar dapat dieksekusi secara mandiri dari awal hingga tuntas oleh *coding agent*.

## 1. Identitas Proyek & Tech Stack

* **Nama Sistem:** Sentinel Ops (IT Asset, Web Security & Incident Management System)

* **Domain Masalah:** Agensi pengelola web, pengelola jurnal akademik (OJS), *software house*, dan tim DevOps/SecOps internal yang mengelola puluhan hingga ratusan aset web klien dan membutuhkan deteksi dini serangan siber (seperti *SQL Injection*, *script defacement*, atau sisipan *backlink* judi slot), manajemen insiden ber-SLA, serta penyimpanan kredensial server yang aman.

* **Tech Stack Wajib:**

  * **Framework:** Next.js 15 (App Router, React 19, *React Server Components*, & *Server Actions*) + TypeScript ketat (*strict mode*).

  * **Database & ORM:** PostgreSQL + Drizzle ORM (`src/server/db`).

  * **Styling & UI:** Tailwind CSS, Radix UI Primitives (`shadcn/ui` *architecture*), `lucide-react` untuk ikon, `@tanstack/react-table` untuk tabel interaktif, dan `recharts` untuk visualisasi metrik.

  * **Keamanan & Kriptografi:** Node.js `crypto` (`AES-256-GCM`) di sisi server (`server-only`) untuk enkripsi kredensial, serta `SHA-256` untuk *hashing* integritas DOM halaman web.

  * **Autentikasi:** Sesi berbasis *cookie* HTTP-only yang divalidasi melalui Next.js `middleware.ts` dan utilitas sesi server (mendukung mode lokal untuk demo/pengembangan maupun integrasi Supabase Auth).

## 2. Peta Modul & Rute Sistem (`src/app`)

| Modul | Rute Halaman (App Router) | Service & Server Actions (`src/server`) | Status Target | 
| ----- | ----- | ----- | ----- | 
| **Dasbor SecOps** | `/admin` | `analytics.ts`, `dssEngine.ts` | Wajib Selesai | 
| **Inventaris Aset Web** | `/assets`, `/assets/[id]` | `assets.ts`, `scannerEngine.ts` | Wajib Selesai | 
| **Pemindai Keamanan & Defacement** | `/scanner`, `/scanner/rules` | `scannerEngine.ts` | Wajib Selesai | 
| **Tiket Insiden & SLA** | `/incidents`, `/incidents/[id]` | `incidentEngine.ts`, `slaMath.ts` | Wajib Selesai | 
| **Brankas Kredensial & Indeksasi** | `/vault` | `vault.ts`, `cryptoEngine.ts` | Wajib Selesai | 
| **Runbook & SOP Mitigasi** | `/runbooks`, `/runbooks/[id]` | `runbooks.ts` | Wajib Selesai | 
| **DSS (Keputusan Infrastruktur)** | `/dss`, `/dss/risiko`, `/dss/sla`, `/dss/riwayat` | `dssEngine.ts` | Wajib Selesai | 
| **Portal Klien & Halaman Status** | `/portal`, `/status/[slug]` | `portal.ts` | Wajib Selesai | 
| **Jejak Audit & Pengaturan** | `/admin/audit`, `/admin/settings` | `audit.ts`, `settings.ts` | Wajib Selesai | 
| **Ekspor CSV (Route Handlers)** | `/api/export/assets`, `/api/export/incidents` | `exportHandlers.ts` | Wajib Selesai | 
| **Laporan Cetak A4** | `(print)/reports/asset/[id]`, `(print)/reports/incident/[id]` | — | Wajib Selesai | 

## 3. Matriks RBAC (Role-Based Access Control)

Penegakan akses dilakukan pada dua lapisan: pemeriksaan rute menggunakan *longest-prefix match* di `src/middleware.ts` serta verifikasi otorisasi di dalam setiap *Server Action* menggunakan `requireRole()` di `src/server/rbac.ts`.

| Peran | Halaman Pendaratan (`ROLE_HOME`) | Hak Akses Utama | 
| ----- | ----- | ----- | 
| `SUPER_ADMIN` | `/admin` | Akses penuh ke seluruh modul, manajemen aturan pemindaian, brankas kredensial, konfigurasi SLA, dan jejak audit. | 
| `SECOPS_ENGINEER` | `/admin` | Mengelola aset, menjalankan pemindaian, menangani tiket insiden, membuka brankas kredensial (tercatat di audit), mengeksekusi *runbook*, dan mengakses DSS. | 
| `SUPPORT_AGENT` | `/incidents` | Melihat aset, membuat dan membalas tiket insiden, melihat status pemindaian; **tanpa akses** ke pembukaan sandi di brankas kredensial (`/vault`). | 
| `CLIENT_OWNER` | `/portal` | Melihat kesehatan aset web miliknya sendiri, riwayat *uptime*, status SSL, melapor insiden baru, dan mengunduh laporan pemeliharaan/audit keamanan. | 
| Publik | `/status/[slug]`, `/login` | Halaman status *uptime* publik per organisasi/klien dan halaman autentikasi. | 

## 4. Skema Database (`src/server/db/schema.ts`)

Gunakan Drizzle ORM dengan PostgreSQL. Pastikan semua migrasi bersifat idempoten.

### 4.1. Enum Utama

* `user_role`: `'SUPER_ADMIN' | 'SECOPS_ENGINEER' | 'SUPPORT_AGENT' | 'CLIENT_OWNER'`

* `platform_type`: `'OJS_3' | 'WORDPRESS' | 'LARAVEL' | 'NODE_SSR' | 'STATIC_WEB' | 'CUSTOM_PHP'`

* `asset_health`: `'HEALTHY' | 'WARNING' | 'COMPROMISED' | 'DOWN' | 'MAINTENANCE'`

* `incident_severity`: `'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'`

* `incident_status`: `'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'CLOSED'`

* `threat_category`: `'SQL_INJECTION' | 'SLOT_DEFACEMENT' | 'MALWARE_BACKDOOR' | 'SSL_EXPIRED' | 'SERVER_DOWN' | 'BRUTE_FORCE' | 'CONFIGURATION_ERROR'`

* `credential_category`: `'CPANEL_HOSTING' | 'SSH_ROOT' | 'DATABASE' | 'CMS_ADMIN' | 'OJS_INDEXING'` (DOAJ, SINTA, Garuda, Copernicus, ISSN)

### 4.2. Tabel Inti

 1. **`profiles`**: `id` (UUID PK), `email` (unique), `full_name`, `role` (`user_role`), `organization_name`, `password_hash`, `created_at`.

 2. **`web_assets`**:

    * `id` (UUID PK), `client_id` (FK `profiles.id`), `name`, `domain_url`, `slug` (unique, untuk halaman status publik).

    * `platform` (`platform_type`), `platform_version` (misal: `"OJS 3.3.0-14"`, `"WordPress 6.6"`).

    * `server_ip`, `hosting_provider`, `health_status` (`asset_health`), `ssl_expiry_date` (timestamp), `ssl_days_remaining` (integer).

    * `baseline_dom_hash` (text, hash SHA-256 struktur DOM bersih), `last_scan_at` (timestamp), `uptime_pct_30d` (`numeric(5,2)`).

    * `version` (integer, untuk *optimistic locking*), `created_at`, `updated_at`.

 3. **`scan_logs`**:

    * `id` (UUID PK), `asset_id` (FK `web_assets.id`), `scanned_at` (timestamp), `triggered_by` (`'SCHEDULED' | 'MANUAL'`).

    * `http_status` (integer), `response_time_ms` (integer), `ssl_valid` (boolean).

    * `dom_hash_matched` (boolean), `threats_detected` (integer), `findings_json` (jsonb — daftar temuan kata kunci berbahaya, injeksi `iframe`/`script`, atau anomali *header*), `summary` (text).

 4. **`malware_signatures`** (Kamus Deteksi Injeksi & Defacement):

    * `id` (UUID PK), `name`, `pattern` (regex/keyword string, misal: `slot\s*gacor|maxwin|sbobet|judol|eval\(base64_decode` atau deteksi tautan tersembunyi `display:\s*none`), `category` (`threat_category`), `severity` (`incident_severity`), `is_active` (boolean).

 5. **`incidents`**:

    * `id` (UUID PK), `ticket_number` (unique, format atomik `INC-YYYYMM-XXXX`), `asset_id` (FK `web_assets.id`), `reported_by` (FK `profiles.id`), `assigned_to` (FK `profiles.id`, nullable).

    * `title`, `description`, `severity` (`incident_severity`), `category` (`threat_category`), `status` (`incident_status`).

    * `sla_response_due_at` (timestamp), `first_responded_at` (timestamp, nullable), `sla_resolution_due_at` (timestamp), `resolved_at` (timestamp, nullable), `sla_breached` (boolean, default `false`).

    * `root_cause_summary` (text, wajib diisi sebelum status menjadi `RESOLVED`), `remediation_steps` (text), `version` (integer, *optimistic locking*), `created_at`, `updated_at`.

 6. **`incident_comments`**:

    * `id` (UUID PK), `incident_id` (FK `incidents.id`), `author_id` (FK `profiles.id`), `body` (text), `is_internal` (boolean — jika `true`, disembunyikan dari `CLIENT_OWNER`), `attachment_url` (nullable), `created_at`.

 7. **`credential_vaults`** (Terinspirasi dari sistem manajemen kredensial & indeksasi):

    * `id` (UUID PK), `asset_id` (FK `web_assets.id`), `label` (misal: `"cPanel Utama"`, `"Akun DOAJ & Garuda"`, `"Database Produksi"`), `category` (`credential_category`).

    * `username`, `login_url`, `encrypted_secret` (text, terenkripsi `AES-256-GCM`), `iv` (text), `auth_tag` (text).

    * `notes` (text), `last_rotated_at` (timestamp), `last_accessed_at` (timestamp), `last_accessed_by` (FK `profiles.id`), `created_at`.

 8. **`runbooks`** & **`incident_runbook_tasks`**:

    * Template SOP standar penanganan insiden (misal: *"SOP Pembersihan Malware Slot pada OJS 3"*, *"SOP Mitigasi SQL Injection & Patching Database"*).

    * Daftar langkah periksa (*checklist*) yang dapat dilampirkan ke tiket insiden dan dicentang satu per satu oleh teknisi.

 9. **`decision_rules`** & **`decision_logs`** (Modul DSS):

    * Menyimpan parameter ambang batas keputusan keamanan dan riwayat eksekusi rekomendasi (`ACCEPTED` / `DISMISSED` beserta fakta numerik saat keputusan diambil).

10. **Tabel Operasional Standar**:

    * `audit_logs` (`id`, `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `summary`, `changes` jsonb, `request_id`, `created_at`).

    * `notifications`, `app_settings`, `document_sequences`, `idempotency_keys`.

## 5. Spesifikasi Mesin Inti (*Core Engines*)

Semua modul mesin inti di bawah ini berjalan di sisi server (`import 'server-only'`) dan diekspos ke komponen React melalui **Next.js Server Actions** (`'use server'`) dengan pemanggilan `revalidatePath()` yang presisi setelah mutasi berhasil.

### 5.1. Mesin Pemindai Keamanan (`src/server/services/scannerEngine.ts`)

Memiliki fungsi murni dan layanan terukur untuk memeriksa kesehatan aset:

1. **`analyzeHtmlForThreats(htmlContent: string, signatures: MalwareSignature[])`** (Fungsi Murni di `src/lib/scannerMath.ts` — dapat diimpor di *Server* maupun *Client Component* untuk simulasi *sandbox*):

   * Memindai teks HTML terhadap pola regex di `malware_signatures`.

   * Mendeteksi penyisipan tautan eksternal mencurigakan di dalam elemen tersembunyi (`style="display:none"`, `visibility:hidden`, `opacity:0`, atau posisi di luar layar `left:-9999px`) yang sangat umum digunakan pada serangan *backlink* judi slot di situs OJS dan WordPress.

   * Menghitung hash `SHA-256` dari kerangka tag utama untuk membandingkannya dengan `baseline_dom_hash`.

   * Memeriksa keberadaan *security headers* dasar (`Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`).

2. **`runAssetScan(assetId: string, mode: 'LIVE' | 'SIMULATED')`**:

   * Mencatat hasil ke `scan_logs` dan memperbarui `web_assets.health_status`.

   * **Otomasi Insiden:** Jika ditemukan ancaman dengan tingkat `CRITICAL` atau `HIGH` (misalnya injeksi *malware* slot terdeteksi atau situs *down* `HTTP >= 500`), sistem secara otomatis membuat tiket insiden baru di tabel `incidents` (jika belum ada tiket aktif dengan kategori yang sama pada aset tersebut) agar tidak terjadi duplikasi tiket (*idempotent alert-to-ticket*).

### 5.2. Mesin SLA & Tiket Insiden (`src/server/services/incidentEngine.ts` & `src/lib/slaMath.ts`)

1. **Perhitungan Tenggat SLA (`computeSlaDeadlinesPure`)**:

   * Berdasarkan tingkat keparahan (`severity`) dari pengaturan sistem:

     * `CRITICAL`: Respons $\le 15$ menit, Resolusi $\le 4$ jam.

     * `HIGH`: Respons $\le 1$ jam, Resolusi $\le 12$ jam.

     * `MEDIUM`: Respons $\le 4$ jam, Resolusi $\le 24$ jam.

     * `LOW`: Respons $\le 12$ jam, Resolusi $\le 72$ jam.

2. **Transisi Status & Validasi Ketat**:

   * Saat teknisi pertama kali mengambil tiket atau mengirim respons publik/tindakan (`OPEN` $\to$ `INVESTIGATING`), catat `first_responded_at`.

   * Transisi ke `RESOLVED` **wajib menolak** jika kolom `root_cause_summary` atau `remediation_steps` masih kosong.

   * Jika insiden berjenis `SLOT_DEFACEMENT` atau `MALWARE_BACKDOOR` ditandai `RESOLVED`, sistem otomatis memperbarui status aset kembali menjadi `HEALTHY` setelah verifikasi pemindaian ulang.

   * Terapkan **penguncian optimistik** (`incidents.version`): jika dua teknisi memperbarui tiket yang sama secara bersamaan, kembalikan respons terstruktur `{ ok: false, code: 'CONFLICT', latestData }` agar antarmuka React menampilkan peringatan konflik tanpa menimpa data secara diam-diam.

### 5.3. Mesin Kriptografi Brankas (`src/server/services/cryptoEngine.ts`)

1. **`encryptSecret(plainText: string)`** & **`decryptSecret(cipherText: string, iv: string, authTag: string)`**:

   * Menggunakan algoritma `aes-256-gcm` dengan kunci rahasia server (`VAULT_MASTER_KEY` dari *environment variable*, dengan *fallback* kunci pengembangan lokal yang deterministik agar `npm run dev` langsung berjalan tanpa konfigurasi rumit).

2. **Audit Pembukaan Sandi (`revealVaultSecretAction`)**:

   * Sandi tidak pernah dikirim dalam bentuk teks terbuka di dalam *payload* awal *React Server Component* saat halaman `/vault` dimuat (hanya tampil `••••••••••••`).

   * Saat `SUPER_ADMIN` atau `SECOPS_ENGINEER` menekan tombol **"Lihat Sandi"** atau **"Salin"**, *Client Component* memanggil *Server Action* yang mendekripsi sandi tersebut, memperbarui `last_accessed_at`, dan **wajib** menulis baris baru di `audit_logs` dengan aksi `vault.secret_revealed`.

### 5.4. Mesin Pendukung Keputusan / DSS (`src/server/services/dssEngine.ts`)

Mengolah metrik keamanan dan operasional secara langsung saat halaman dibuka (*on-the-fly SQL aggregation* di *Server Component*, tanpa kolom skor yang disimpan di cache) untuk menjawab **"Tindakan preventif apa yang harus segera diambil hari ini?"**:

1. **Kontrak Rekomendasi DSS:** Fakta pemicu $\to$ Ambang batas aturan $\to$ Alasan 1 kalimat $\to$ Dampak risiko/biaya $\to$ Tombol aksi langsung $\to$ Pencatatan ke `decision_logs` (`ACCEPTED` / `DISMISSED`).

2. **Aturan Keputusan yang Wajib Ada:**

   * **Risiko Kedaluwarsa SSL:** Situs dengan sisa masa aktif SSL $\le$ `sslWarnDays` (default: $14$ hari).

   * **Aset Rawan / Infeksi Berulang (*Chronic Vulnerability*):** Aset web yang mengalami $\ge$ `repeatInfectionThreshold` (default: $2$ insiden *malware*/SQLi dalam $30$ hari terakhir) $\to$ Rekomendasikan audit mendalam, *upgrade* versi OJS/CMS, atau isolasi *hosting*.

   * **Kredensial Usang (*Stale Credentials*):** Kredensial di `/vault` yang belum pernah dirotasi selama $\ge$ `credentialRotationDays` (default: $90$ hari), atau kredensial milik aset yang baru saja terkena insiden `COMPROMISED` namun sandinya belum diganti sejak insiden terjadi.

   * **Ancaman Pelanggaran SLA (*SLA Breach Warning*):** Tiket insiden berstatus `OPEN` atau `INVESTIGATING` yang sisa waktu menuju tenggat resolusinya $\le 25\%$ dari total kuota waktu SLA.

   * **Ketimpangan Beban Teknisi (*Engineer Bottleneck*):** Teknisi dengan jumlah tiket aktif melebihi `maxActiveTicketsPerEngineer` (default: $5$ tiket).

## 6. Spesifikasi Antarmuka & Fitur Per Halaman

1. **`/admin` (Dasbor Komando SecOps):**

   * Kartu KPI utama: Total Aset Terkelola, Aset Sehat vs Terinfeksi/Down, Insiden Aktif (dipecah per *Severity*), Kepatuhan SLA ($\%$), dan Peringatan DSS Teratas.

   * Grafik tren insiden 6 bulan terakhir menggunakan `recharts` (`ResponsiveContainer`, `AreaChart` / `BarChart`) **lengkap dengan tabel angka HTML di bawahnya** (ramah pembaca layar & cetak).

   * Daftar langsung *"Aset Membutuhkan Tindakan Segera"* dan *"Tiket Mendekati Tenggat SLA"*.

2. **`/assets` & `/assets/[id]` (Inventaris & Detail Aset Web):**

   * Filter berbasis URL `searchParams` (`?platform=OJS_3&health=COMPROMISED&q=`) yang dirender melalui *Server Component*.

   * Halaman detail menampilkan: status kesehatan terkini, informasi versi platform (misal OJS 3.3 / WordPress), tombol *Client Component* **"Jalankan Pemindaian Sekarang"** (dengan pemilih skenario simulasi agar penguji dapat mencoba skenario *Clean*, *Slot Defacement Detected*, atau *SQLi Error* secara langsung di mode demo), riwayat `scan_logs`, daftar kredensial terkait, dan riwayat insiden aset tersebut.

3. **`/scanner` & `/scanner/rules` (Pusat Pemindaian & Kamus Malware):**

   * Antarmuka interaktif (*Live / Sandbox HTML Analyzer*): pengguna bisa menempelkan potongan kode HTML (atau memilih *preset* kode HTML yang sudah disisipi *script* judi slot tersembunyi) dan melihat mesin `analyzeHtmlForThreats` menyoroti baris berbahaya secara instan di sisi klien maupun server.

   * CRUD kamus regex `malware_signatures` melalui *Server Actions*.

4. **`/incidents` & `/incidents/[id]` (Manajemen Insiden & Ruang Kerja Mitigasi):**

   * Papan dan tabel antrean tiket dengan indikator hitung mundur SLA (*SLA Countdown Badge* berbasis React *hook*).

   * Di halaman detail `/incidents/[id]`: progres tahapan mitigasi, daftar periksa *Runbook* interaktif, kolom diskusi (pilihan tab *Catatan Internal Tim* vs *Balasan Publik ke Klien*), dan formulir penutupan tiket yang mewajibkan pengisian *Root Cause Analysis (RCA)*.

5. **`/vault` (Brankas Kredensial & Indeksasi Jurnal):**

   * Mengelompokkan akses berdasarkan aset dan kategori (`CPANEL_HOSTING`, `DATABASE`, `CMS_ADMIN`, hingga `OJS_INDEXING` seperti akun DOAJ, SINTA, Garuda, ISSN).

   * Fitur lihat sandi dengan dialog konfirmasi & pencatatan audit otomatis, indikator umur sandi (peringatan jika belum diganti $>90$ hari), dan formulir rotasi sandi.

6. **`/dss` (Sistem Pendukung Keputusan Infrastruktur):**

   * Sub-halaman: `/dss` (Pusat Rekomendasi Prioritas), `/dss/risiko` (Matriks Kerentanan Aset & Rotasi Sandi), `/dss/sla` (Analisis Beban Tim & Kepatuhan SLA), serta `/dss/riwayat` (Log Keputusan yang Diterima/Ditolak).

7. **`/portal` & `/status/[slug]` (Portal Klien & Status Publik):**

   * `/portal`: Klien melihat daftar situs/jurnal milik mereka, persentase *uptime*, status keamanan, membuka tiket bantuan baru, dan memantau progres pengerjaan tiket tanpa melihat komentar internal teknisi.

   * `/status/[slug]`: Halaman publik bersih (tanpa perlu login) yang menampilkan indikator operasional situs klien beserta riwayat *uptime* 30 hari terakhir.

8. **Rute Cetak A4 (`src/app/(print)/reports/asset/[id]` & `src/app/(print)/reports/incident/[id]`):**

   * *Route Group* khusus cetak dengan `layout.tsx` tersendiri (latar putih bersih, margin A4 14mm, tanpa bilah navigasi samping, tombol cetak otomatis tersembunyi saat `window.print()`) untuk mencetak **Sertifikat/Laporan Audit Keamanan Bulanan** dan **Dokumen Postmortem Insiden (RCA)** ke PDF.

## 7. Aturan Teknis yang Mengikat (Wajib Dipatuhi Coding Agent)

1. **Kunci Idempoten (`src/server/idempotency.ts` & `useIdempotentAction`):** Semua pengiriman formulir mutasi krusial (buat tiket, jalankan pemindaian, tambah kredensial, rekam keputusan DSS) wajib membawa `requestId` (UUID) dan diproses secara idempoten (`INSERT ... ON CONFLICT DO NOTHING`) di database, serta dikunci secara sinkron menggunakan `useRef` di sisi klien sebelum *Server Action* dipanggil agar klik ganda tidak memicu eksekusi ganda.

2. **Penguncian Optimistik (`version`):** Pembaruan status pada `web_assets` dan `incidents` wajib memeriksa kolom `version` di klausa `WHERE` untuk mencegah dua teknisi saling menimpa data secara diam-diam.

3. **Keamanan Kriptografi Nyata (`server-only`):** Jangan pernah menyimpan `encrypted_secret` sebagai teks biasa di database dan jangan pernah mengimpor `cryptoEngine.ts` di dalam *Client Component*. Gunakan `crypto.createCipheriv('aes-256-gcm', ...)` dan `crypto.createDecipheriv('aes-256-gcm', ...)`.

4. **Sanitasi Parameter Tabel & URL (`src/lib/tableQuery.ts`):** Semua parameter `searchParams` (`?sort=&dir=&page=&size=&q=&filter=`) pada `page.tsx` wajib divalidasi melalui daftar putih (*whitelist*) sebelum menyentuh kueri Drizzle ORM.

5. **Ekspor CSV Ramah Excel Indonesia:** Route Handlers (`/api/export/...`) untuk laporan insiden dan aset wajib mengembalikan `Response` dengan `Content-Type: text/csv; charset=utf-8`, menyertakan UTF-8 BOM (`\uFEFF`), dan menggunakan pemisah titik koma (`;`).

6. **Jejak Audit Bermakna:** Catat setiap perubahan status insiden, perubahan aturan keamanan, penghapusan aset, dan **setiap pembukaan sandi brankas** ke dalam `audit_logs` dengan label Bahasa Indonesia yang jelas.

## 8. Data Seed & Akun Demo (`scripts/seed.mjs`)

Skrip `seed.mjs` harus bersifat idempoten (menggunakan UUID tetap) dan menyiapkan data realistis agar seluruh fitur langsung hidup saat dijalankan:

### Akun Demo (Kata sandi seragam: `sentinel123`)

| Email | Nama | Peran | Fokus Demo | 
| ----- | ----- | ----- | ----- | 
| `admin@sentinel.id` | Ardiansyah Pratama | `SUPER_ADMIN` | Akses penuh seluruh sistem & konfigurasi | 
| `secops@sentinel.id` | Bima Sakti | `SECOPS_ENGINEER` | Penanganan malware, pemindaian, brankas & DSS | 
| `support@sentinel.id` | Citra Kirana | `SUPPORT_AGENT` | Triase tiket insiden & komunikasi klien | 
| `rektorat@kampus-nusantara.ac.id` | Dr. Hendra Wijaya | `CLIENT_OWNER` | Klien pemilik 4 portal jurnal OJS & web kampus | 
| `corptech@mitra-niaga.co.id` | Rina Gunawan | `CLIENT_OWNER` | Klien pemilik portal web korporat & WordPress | 

### Skenario Data Awal yang Wajib Disediakan di Seed:

1. **8 Aset Web (`web_assets`):**

   * 3 Portal Jurnal OJS 3.3 (1 berstatus `COMPROMISED` karena terdeteksi sisipan *script* judi slot tersembunyi, 1 berstatus `WARNING` karena SSL tersisa $6$ hari, 1 berstatus `HEALTHY`).

   * 2 Situs WordPress Korporat (1 berstatus `COMPROMISED` akibat percobaan *SQL Injection* pada *plugin*, 1 `HEALTHY`).

   * 2 Aplikasi Web Kustom Laravel / Node.js (`HEALTHY`).

   * 1 Portal E-Library (`DOWN` — simulasi gagal koneksi database).

2. **6 Kamus Deteksi (`malware_signatures`):** Mencakup pola injeksi tautan judi slot (`slot gacor`, `maxwin`, `rtp live`), elemen tersembunyi (`display:none` dengan tag `<a href=`), fungsi berbahaya PHP (`eval(base64_decode`), dan pola umum *SQL Injection* (`UNION SELECT`, `information_schema`).

3. **6 Tiket Insiden (`incidents`):** Mencakup tiket berstatus `OPEN` (mendekati batas SLA), `INVESTIGATING` (lengkap dengan komentar internal vs publik dan progres *runbook*), serta `RESOLVED` (lengkap dengan dokumen *Root Cause Analysis*).

4. **10 Entri Brankas Kredensial (`credential_vaults`):** Terenkripsi asli menggunakan `AES-256-GCM`, mencakup akses cPanel, SSH, Database MySQL, dan akun indeksasi jurnal (DOAJ, Garuda, SINTA, ISSN) — beberapa di antaranya sengaja disetel berumur $>100$ hari agar memicu rekomendasi rotasi sandi di modul DSS.

5. **3 Template Runbook (`runbooks`):** Termasuk *"SOP Pembersihan Injeksi Slot & Backdoor pada OJS 3"* dan *"SOP Pemulihan Serangan SQL Injection & Hardening cPanel"*.

## 9. Instruksi Eksekusi untuk Coding Agent

Ikuti urutan langkah pembangunan ini tanpa melewati satu bagian pun:

1. **Inisialisasi & Skema Database:**

   * Siapkan struktur proyek Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS + Drizzle ORM.

   * Tulis `src/server/db/schema.ts` dan berkas migrasi SQL idempoten di `drizzle/0000_init_sentinel.sql`.

   * Buat skrip `scripts/db-migrate.mjs` dan `scripts/seed.mjs`.

2. **Mesin Inti, Server Actions & Middleware RBAC:**

   * Bangun `cryptoEngine.ts` (`AES-256-GCM`), `idempotency.ts`, `audit.ts`, `rbac.ts`, `slaMath.ts`, `scannerEngine.ts`, `incidentEngine.ts`, dan `dssEngine.ts`.

   * Siapkan `src/middleware.ts` untuk proteksi rute dan pengalihan `ROLE_HOME`.

3. **Komponen UI & Layout React (`src/components`):**

   * Bangun navigasi adaptif berdasarkan peran pengguna (`AppSidebar.tsx`), `DataTable.tsx` responsif (tabel di desktop, kartu di layar ponsel), `ConfirmDialogProvider.tsx`, `ToastProvider.tsx`, dan indikator lencana status keamanan/SLA.

4. **Implementasi Seluruh Halaman App Router (20+ Rute):**

   * Bangun seluruh rute `/admin`, `/assets`, `/scanner`, `/incidents`, `/vault`, `/runbooks`, `/dss`, `/portal`, `/status/[slug]`, Route Handlers `/api/export/...`, dan rute cetak `(print)`.

   * Pastikan tidak ada halaman kosong (*placeholder/stub*) — semua formulir *Server Actions*, filter URL `searchParams`, ekspor CSV, dan aksi mutasi harus berfungsi penuh dari ujung ke ujung (*end-to-end*).

5. **Verifikasi Akhir Wajib:**

   * Jalankan migrasi dan *seed* database: `node scripts/db-migrate.mjs && node scripts/seed.mjs`.

   * Jalankan pemeriksaan tipe TypeScript dan kompilasi produksi Next.js:

     ```bash
     npx tsc --noEmit
     npm run build
     ```

   * Pastikan hasil pemeriksaan menunjukkan **0 error** sebelum menyatakan pekerjaan selesai.