# Sentinel Ops - Overview Proyek

**Untuk:** Project Manager
**Tanggal:** 4 November 2026
**Status:** Selesai dibangun, terverifikasi, siap demo. Belum siap produksi (lihat bagian 6).

---

## 1. Ringkasan Eksekutif

Sentinel Ops adalah konsol pemantauan keamanan aset web untuk agensi pengelola web,
pengelola jurnal akademik (OJS), dan tim internal. Sistem ini menjawab satu pertanyaan
operasional: **aset web mana yang sedang bermasalah, seberapa mendesak, dan siapa yang
menanganinya.**

Seluruh modul dalam spesifikasi teknis sudah dibangun dan berfungsi, bukan kerangka kosong.
Setiap formulir, filter, ekspor, dan aksi mutasi tersambung dari antarmuka sampai basis data
dan sudah diuji lewat HTTP serta di browser.

| Aspek | Ringkasan |
|---|---|
| Modul spesifikasi | 12 dari 12 selesai |
| Halaman aplikasi | 24 halaman + 5 endpoint API |
| Basis data | 18 tabel, 11 enum, 37 indeks, 23 relasi |
| Ukuran kode | sekitar 20.000 baris (113 berkas) |
| Data demo | 5 akun, 8 aset, 6 tiket, 10 kredensial, 3 runbook |
| Hasil uji otomatis | 167 pemeriksaan, **0 gagal** |

---

## 2. Masalah yang Diselesaikan

Tim pengelola web sering menemukan situs klien sudah disusupi tautan judi slot atau
mengalami galat basis data **setelah** pengunjung melaporkannya. Penanganannya pun
tersebar: cek manual satu per satu, sandi server disimpan di catatan pribadi, dan
tidak ada catatan siapa menangani apa.

Sentinel Ops menyatukan empat hal yang biasanya terpisah:

1. **Inventaris** - daftar semua aset web beserta status kesehatan, uptime, dan masa berlaku SSL.
2. **Deteksi otomatis** - pemindaian yang mengenali pola injeksi malware dan tautan tersembunyi.
3. **Penanganan ber-SLA** - tiket dengan tenggat respons dan resolusi, plus prosedur baku (runbook).
4. **Brankas kredensial** - sandi server terenkripsi, dengan catatan audit setiap kali dibuka.

Nilai praktisnya: gangguan terdeteksi lebih awal, penanganan punya tenggat yang terukur, dan
tidak ada lagi sandi server yang berpindah lewat pesan pribadi tanpa jejak.

---

## 3. Modul yang Sudah Berfungsi

| Modul | Rute | Yang bisa dilakukan pengguna |
|---|---|---|
| Dasbor Komando | `/admin` | Melihat 5 indikator utama, tren insiden 6 bulan (grafik + tabel angka), daftar aset bermasalah, tiket mendekati tenggat, dan rekomendasi prioritas hari ini |
| Inventaris Aset | `/assets` | Mencari dan memfilter aset, mengurutkan tabel, membuka detail, menambah aset baru |
| Detail Aset | `/assets/[id]` | Menjalankan pemindaian dengan 6 skenario, melihat riwayat pemindaian, kredensial terkait, riwayat insiden, dan metadata aset |
| Pemindai Keamanan | `/scanner` | Menempel potongan HTML dan melihat analisis langsung, termasuk sorotan baris berbahaya |
| Kamus Deteksi | `/scanner/rules` | Menambah, mengubah, menonaktifkan, dan menghapus aturan pendeteksian beserta validasi regex |
| Tiket Insiden | `/incidents` | Antrean tiket dengan hitung mundur SLA, filter status dan tingkat keparahan |
| Ruang Kerja Insiden | `/incidents/[id]` | Mengubah status, melampirkan runbook, mencentang langkah mitigasi, berdiskusi (catatan internal vs balasan klien), menutup tiket dengan analisis akar masalah |
| Brankas Kredensial | `/vault` | Menyimpan sandi terenkripsi, membuka sandi (dengan konfirmasi + audit), menyalin, merotasi, menghapus |
| Runbook dan SOP | `/runbooks` | Membaca prosedur mitigasi standar, 18 langkah total dalam 3 template |
| Pendukung Keputusan | `/dss` dan 3 sub-halaman | Menerima atau menolak rekomendasi berbasis data, melihat matriks risiko aset, beban teknisi, dan riwayat keputusan |
| Portal Klien | `/portal` | Klien melihat kondisi asetnya sendiri, memantau tiket, dan melaporkan masalah baru |
| Halaman Status Publik | `/status/[slug]` | Halaman publik tanpa login: status layanan dan riwayat 30 hari |
| Jejak Audit | `/admin/audit` | Melihat catatan kronologis setiap perubahan dan setiap pembukaan sandi |
| Pengaturan | `/admin/settings` | Mengatur target SLA per tingkat keparahan, ambang batas keputusan, preferensi notifikasi |
| Ekspor CSV | `/api/export/assets`, `/api/export/incidents` | Mengunduh data aset atau insiden, terbuka rapi di Excel Indonesia |
| Laporan Cetak A4 | `/reports/asset/[id]`, `/reports/incident/[id]` | Mencetak laporan audit bulanan dan dokumen postmortem ke PDF |

---

## 4. Bukti Kualitas

Bukan klaim. Ini hasil perintah yang bisa dijalankan ulang.

| Pemeriksaan | Cakupan | Hasil |
|---|---|---|
| Pemeriksaan tipe TypeScript | Seluruh kode | **0 error** |
| Build produksi | 30 rute | **0 error** |
| Uji end-to-end lewat HTTP | Filter, pencarian, injeksi SQL, RBAC, kebocoran sandi, ekspor CSV, kode 404 | **39 / 39** |
| Uji hak akses (4 peran, berbagai rute) | Siapa boleh membuka apa | **22 / 22** |
| Uji integritas data | Sandi terenkripsi, tanpa baris yatim, kunci idempoten, versi optimistik | **13 / 13** |
| Uji logika pengurutan | Angka bertanda, nilai kosong, teks natural | **13 / 13** |
| Uji validasi masukan | 8 skema, termasuk kasus yang tidak bisa dipicu lewat UI | **41 / 41** |
| Uji pemilihan mode basis data | URL kosong, postgres, neon, supabase, skema asing, direktori data | **23 / 23** |
| Uji validasi kunci rahasia | Hex, base64, placeholder, terlalu pendek, kosong | **16 / 16** |
| Uji penegakan produksi | Secret buruk ditolak, secret valid diterima | **11 / 11** |
| Seluruh rute pada mode produksi | 25 halaman dan endpoint | **25 / 25 berhasil** |

### Jaminan keamanan yang sudah diuji

- **Sandi brankas tidak pernah muncul di halaman.** Halaman `/vault` hanya mengirim
  teks bertopeng. Membuka sandi wajib lewat konfirmasi, dan setiap pembukaan tercatat
  di audit dengan nama pengguna serta waktu.
- **Halaman status publik tidak membocorkan data internal.** Sudah diuji: tidak ada IP
  server, nama teknisi, nomor tiket, maupun identitas klien.
- **Klien tidak bisa melihat catatan internal teknisi.** Disaring di level basis data,
  bukan di tampilan.
- **Klien tidak bisa melaporkan kategori berbahaya.** Malware dan defacement harus
  diklasifikasikan tim SecOps setelah triase.
- **Percobaan injeksi SQL lewat URL diabaikan.** Seluruh parameter disaring daftar putih.

---

## 5. Cakupan terhadap Spesifikasi

| Butir spesifikasi | Status |
|---|---|
| Next.js 15 App Router + React 19 + TypeScript ketat | Sesuai |
| PostgreSQL + Drizzle ORM | Sesuai (mode embedded, lihat bagian 6) |
| Tailwind CSS + Radix UI + `@tanstack/react-table` + `recharts` | Sesuai |
| AES-256-GCM + SHA-256 untuk brankas | Sesuai |
| Sesi cookie HTTP-only + `middleware.ts` | Sesuai |
| 18 tabel sesuai bagian 4.2 spesifikasi | Sesuai |
| 5 mesin inti (bagian 5.1 sampai 5.4) | Sesuai |
| Kunci idempoten `requestId` | Sesuai, dua lapis (klien + server) |
| Penguncian optimistik `version` | Sesuai, mengembalikan `CONFLICT` + data terbaru |
| Sanitasi parameter tabel | Sesuai, daftar putih |
| Ekspor CSV ramah Excel Indonesia | Sesuai (BOM, titik koma, CRLF) |
| Jejak audit bermakna | Sesuai, 31 jenis aksi berlabel Indonesia |
| Seed idempoten 8 aset, 6 tiket, 10 kredensial | Sesuai |
| `tsc --noEmit` dan `npm run build` bersih | Sesuai |

### Penyimpangan yang perlu diketahui PM

Radix UI awalnya dipasang lengkap (12 paket). Setelah audit, hanya **2 paket** yang benar-benar
dipakai (`dialog`, `slot`); 10 sisanya dihapus untuk mengurangi beban. Komponen tabel, dropdown,
dan toggle dibangun sendiri di atas Tailwind agar sesuai sistem desain. Fungsinya setara, tetapi
ini berbeda dari asumsi "memakai seluruh komponen Radix" di spesifikasi.

---

## 6. Batasan dan Risiko

Bagian ini jujur, bukan daftar pujian. Butir yang sudah ditutup ditandai, sisanya masih terbuka.

| # | Butir | Status | Tingkat |
|---|---|---|---|
| 1 | **Basis data hanya bisa satu proses (embedded)** | **Selesai.** Adaptor PostgreSQL server sudah terpasang. Cukup isi `DATABASE_URL` dengan URI `postgresql://...`, dan driver beralih otomatis dengan connection pool yang aman untuk multi-instance/serverless. Terverifikasi lewat 23 pemeriksaan pemilihan mode | **Ditutup** |
| 2 | **Kunci enkripsi memakai nilai lokal** | **Selesai.** `npm run secrets:generate` membuat `VAULT_MASTER_KEY` (64 hex) dan `SESSION_SECRET`. Validator `src/server/env.ts` menolak start bila produksi masih memakai nilai contoh, terlalu pendek, atau kosong, dengan pesan cara memperbaiki. Diuji dua arah: secret buruk ditolak (7 pemeriksaan), secret valid diterima (4 pemeriksaan) | **Ditutup** |
| 8 | **Repositori belum di-`git init`** | **Selesai.** Repositori diinisialisasi pada cabang `main` dengan `.gitignore` produksi. Terverifikasi: `.env`, `.data/`, `.next/`, `node_modules/` tidak ikut terlacak | **Ditutup** |
| 3 | Belum ada penjadwal pemindaian otomatis | Terbuka. Pemindaian masih manual; mesinnya siap dipanggil, tinggal ditambah cron | Sedang |
| 4 | Pemindaian mode "live" belum diaktifkan | Terbuka. Masih memakai dokumen HTML preset yang dianalisis mesin sungguhan | Sedang |
| 5 | Paginasi tabel belum diuji dengan data >20 baris | Terbuka. Data demo hanya 8 aset | Rendah |
| 6 | Notifikasi hanya tersimpan di basis data | Terbuka. Belum terkirim lewat email/WhatsApp/Slack | Rendah |
| 7 | Belum ada uji beban / konkurensi nyata | Terbuka. Pencegahan benturan sudah dirancang (penguncian optimistik), belum diuji dengan dua tab sungguhan | Rendah |

Catatan penting mengenai butir 1: adaptor PostgreSQL sudah **ada dan teruji pemilihan drivernya**,
tetapi belum pernah dijalankan terhadap server PostgreSQL sungguhan dalam proyek ini. Langkah
pertama sebelum produksi tetap: arahkan `DATABASE_URL` ke database nyata, lalu jalankan
`npm run db:migrate && npm run db:seed` dan ulangi rangkaian uji.

Total pengujian otomatis kini **167 pemeriksaan** (dari 128), seluruhnya lulus, karena fitur
baru menambah cakupan: 23 pemeriksaan pemilihan mode, 16 validasi kunci, dan 11 penegakan
produksi dua arah.

---

## 7. Yang Perlu Keputusan PM

Tiga hal ini menentukan langkah berikutnya dan tidak bisa diputuskan sendiri oleh tim teknis.

**Pertama, target deploy.** Adaptor PostgreSQL sudah siap: cukup isi `DATABASE_URL` di `.env`
dengan URI standar, dan driver beralih otomatis tanpa mengubah kode. Yang masih dibutuhkan
hanyalah **kredensial dari pihak infrastruktur** (Supabase, Neon, Railway, atau VPS), lalu
jalankan `npm run secrets:generate` untuk kunci produksi. Perkiraan: 1 hari kerja setelah
kredensial tersedia.

**Kedua, cakupan pemindaian.** Spesifikasi menyebut pemindaian "live" ke situs asli. Ini
memerlukan keputusan hukum dan operasional: apakah boleh ada permintaan HTTP otomatis ke
server milik klien, dan siapa yang bertanggung jawab bila ada dampak. Fitur ini sengaja
belum diaktifkan tanpa persetujuan.

**Ketiga, penjadwalan.** Pemindaian otomatis setiap beberapa jam akan mengubah produk ini
dari "alat yang dibuka saat ingat" menjadi "sistem yang memberi tahu lebih dulu". Ini
kebutuhan bisnis, bukan teknis, jadi perlu ditentukan frekuensinya.

---

## 8. Cara Melakukan Demo

```bash
npm install
npm run db:migrate     # menyiapkan basis data
npm run db:seed        # mengisi data contoh
npm run dev
```

Buka `http://localhost:3000`. Kata sandi semua akun: `sentinel123`.

| Akun | Peran | Cocok untuk menunjukkan |
|---|---|---|
| `admin@sentinel.id` | Super Admin | Dasbor, audit, pengaturan SLA |
| `secops@sentinel.id` | SecOps Engineer | Pemindaian, penanganan insiden, brankas, DSS |
| `support@sentinel.id` | Support Agent | Triase tiket, dan pembuktian bahwa brankas tertutup untuknya |
| `rektorat@kampus-nusantara.ac.id` | Klien | Portal klien dan pembuktian catatan internal tidak terlihat |
| `corptech@mitra-niaga.co.id` | Klien | Portal klien, aset korporat |

### Alur demo yang paling meyakinkan (5 menit)

1. Masuk sebagai `secops`, buka **Inventaris Aset**, urutkan kolom SSL. Aset dengan
   sertifikat paling mendesak muncul di atas.
2. Buka **Jurnal Teknik Nusantara**, jalankan pemindaian skenario *Defacement Slot*.
   Hasilnya: 7 temuan, status aset berubah menjadi Terkompromi, dan tiket insiden dibuat
   otomatis bila belum ada.
3. Buka tiket tersebut, centang beberapa langkah runbook, lalu selesaikan tiket. Sistem
   **menolak** bila analisis akar masalah masih kosong.
4. Buka **Brankas Kredensial**, tekan "Lihat Sandi". Muncul konfirmasi, lalu sandi
   terdekripsi. Buka **Jejak Audit**: akses tersebut tercatat lengkap dengan nama dan waktu.
5. Masuk sebagai `support`, coba buka `/vault` (dialihkan). Masuk sebagai `rektorat`,
   buka **Portal Klien**: hanya aset miliknya yang tampil, tanpa catatan internal teknisi.

---

## 9. Lampiran Teknis

**Tumpukan:** Next.js 15.5, React 19.1, TypeScript 5.9 (strict), Drizzle ORM 0.45,
PGlite 0.5 (PostgreSQL 16 di dalam proses), Tailwind CSS 4.3, zod 4.1,
`@tanstack/react-table` 9.3, recharts 3.2.

**Struktur kode:**

```
src/
|-- app/          24 halaman + 5 endpoint API
|-- components/   9 komponen UI + 3 komponen layout
|-- lib/          logika murni (pemindaian, SLA, pengurutan, validasi tabel)
`-- server/       23 modul: mesin inti, RBAC, audit, kriptografi, validasi
```

**Mesin inti terbesar:** pemindai keamanan (579 baris), pendukung keputusan (493),
mesin insiden (453), portal klien (438).

**Perintah pemeriksaan:**

```bash
npx tsc --noEmit    # 0 error
npm run build       # 0 error
node --experimental-strip-types --conditions=react-server \
  scripts/run-node-script.mjs scripts/e2e-actions.mjs   # 39/39
```

Dokumentasi pendamping: `README.md` (teknis, untuk developer), `DESIGN.md`
(sistem visual), `spesifikasi_sistem_itsm_web_security_monitor.md` (brief asli).

---

## 10. Rekomendasi

Produk ini **layak dilanjutkan ke tahap uji coba terbatas** dengan satu syarat: dipakai
untuk aset internal atau aset klien yang sudah menyetujui pemantauan, bukan langsung
menggantikan proses yang berjalan.

Tiga pekerjaan yang saya sarankan dikerjakan berurutan:

1. **Minggu 1** - arahkan `DATABASE_URL` ke PostgreSQL server, jalankan
   `npm run secrets:generate`, lalu migrasi dan seed ulang ke database nyata.
2. **Minggu 2** - aktifkan pemindaian terjadwal, lalu jalankan selama beberapa hari untuk
   melihat apakah deteksi menghasilkan alarm palsu.
3. **Minggu 3** - uji coba dengan 1 atau 2 klien nyata, sambil mengumpulkan masukan sebelum
   pemakaian lebih luas.

Yang **tidak** saya sarankan: memakai mode demo (PGlite tertanam) untuk layanan produksi.
Direktori datanya hanya menerima satu proses, sehingga satu deploy kedua atau restart
bersamaan akan menghentikan layanan.
