# KASIR RELY

Aplikasi kasir (POS) oleh **RELY STUDIO**, diterapkan di **Yaswar Cafe & Toko Souvenir**, Yayasan Rumah Etnik Papua — Sorong, Papua Barat Daya.

Satu aplikasi web yang dipakai kasir di depan pelanggan sekaligus jadi pembukuan: penjualan, stok, piutang/BON, pembelian, arus kas, komisi mitra agen, dan laporan bulanan.

---

## Teknologi

| | |
|---|---|
| Framework | Next.js 16 (App Router, **Turbopack**) |
| UI | React 19, Tailwind CSS 3, lucide-react |
| Bahasa | TypeScript 5.8, `strict: true` |
| Database & Auth | **Firebase Firestore + Firebase Authentication** |
| Sisi server | Firebase Admin SDK (hanya untuk custom claims) |
| Grafik & ekspor | Recharts, SheetJS (xlsx), jsPDF, html2canvas |

Tidak ada MySQL, tidak ada Express, tidak ada Sequelize, dan tidak ada folder `server/`. Semuanya pernah ada dan sudah dihapus dari repo ini.

## Arsitektur

```
Komponen layar (screens/)
        │  useData(fetcher, deps, entitas)     hooks/useData.ts
        ▼
StorageService                                 services/storage.ts
        │  (lapisan tipis + notifikasi perubahan)
        ▼
FirestoreService                               services/firestore.ts
        │  SDK Firebase (web)
        ▼
Firestore  ──  persistence IndexedDB aktif, tulisan diantre saat offline
```

Hampir seluruh aplikasi berjalan di browser. `app/api/` hanya memuat **satu** route, yaitu `admin/set-role`, yang butuh Admin SDK karena custom claim tidak bisa diset dari klien. `proxy.ts` (middleware Next.js 16) memverifikasi ID token Firebase untuk semua `/api/*`.

### Hak akses ditegakkan di Firestore Rules

Tidak ada backend yang memvalidasi, jadi [`firestore.rules`](./firestore.rules) adalah satu-satunya penjaga. Dua hal yang wajib dipahami sebelum menulis query:

1. **Rules bukan filter.** Query yang berpotensi mengembalikan dokumen yang tidak boleh dibaca ditolak **seluruhnya**. Karena kasir hanya boleh membaca transaksinya sendiri, query mereka wajib menyertakan `where('cashierId','==',uid)`. Lihat `scopedToSelf()` di `services/firestore.ts`.
2. **Peran dibaca dari custom claim** `request.auth.token.role`, bukan dari dokumen `users` — agar tidak ada document read tambahan di setiap operasi. Ada fallback ke dokumen `users/{uid}` selama masa transisi; hapus setelah semua akun punya claim.

## Peran

| Peran | Ringkas |
|---|---|
| `SUPERADMIN` | Semua akses, termasuk kelola user dan hapus data |
| `OWNER` | Seperti admin, plus boleh menghapus transaksi/pembelian/arus kas |
| `ADMIN` | Kelola data master, lihat semua laporan |
| `CASHIER` | POS; hanya melihat transaksi miliknya sendiri |
| `GUDANG` | Produk dan penyesuaian stok; tidak boleh menyentuh data pelanggan |

**Tidak ada kredensial default.** Akun dibuat SUPERADMIN lewat menu Pengaturan → User, yang mendaftarkannya ke Firebase Authentication lalu menyimpan profilnya di `users/{uid}`. Password dikelola sepenuhnya Firebase Auth dan **tidak pernah** disimpan di Firestore (ditolak rules).

## Layar

`dashboard` · `pos` · `products` · `transactions` · `finance` · `people` · `customer_history` · `supplier_history` · `travel_commission` · `real_stock_check` · `sold_items` · `transfer_history` · `return_history` · `monthly_report` · `backdate_entry` · `berita-acara` · `barcode` · `settings` · `about`

Semua dipilih dan dirender oleh [`app/(protected)/layout.tsx`](./app/%28protected%29/layout.tsx). Hanya POS yang diimpor statis; sisanya `next/dynamic` agar membuka `/pos` tidak ikut mengunduh Finance, Laporan Bulanan, jsPDF, dan Recharts.

## Koleksi Firestore

`products` · `categories` · `divisions` · `customers` · `suppliers` · `banks` · `transactions` · `purchases` · `cashflow` · `stock_adjustments` · `travel_agents` · `travel_commissions` · `berita_acara_archives` · `store_settings` · `users`

> `open_bills` punya aturan di `firestore.rules` tapi **tidak dipakai** — bon terbuka disimpan di `localStorage` perangkat kasir. Aturannya sisa dari rencana lama.

### Format tanggal itu kontrak, bukan preferensi

Field `date` **wajib** `"YYYY-MM-DD HH:mm:ss"` pada zona waktu toko (`Asia/Jayapura`). Pakai `toCanonicalDate()` dari [`utils.ts`](./utils.ts); jangan pernah menyimpan `new Date().toISOString()`.

Alasannya: Firestore membandingkan string mentah. Spasi (`0x20`) lebih kecil daripada `T` (`0x54`), jadi mencampur kedua format membuat query rentang tanggal mengembalikan baris yang salah **tanpa error apa pun**. Untuk batas rentang pakai `dayRangeBounds()` — batas atas harus `" 23:59:59"`, karena `"2026-10-31 08:00:00" <= "2026-10-31"` bernilai `false` dan akan membuang seluruh hari terakhir.

## Menjalankan di lokal

Butuh Node.js 20.9+ (syarat Next.js 16) dan satu proyek Firebase (Firestore + Authentication email/password aktif).

```bash
npm install
cp .env.local.example .env.local   # isi dengan konfigurasi Firebase Anda
npm run dev                        # http://localhost:3001
```

```bash
npm run build     # build produksi
npm run start     # jalankan hasil build di :3001
npm run lint      # ESLint 9 (flat config di eslint.config.mjs)
```

### Variabel environment

`.env.local` — konfigurasi Firebase sisi klien (nilai-nilai ini memang terkirim ke browser, bukan rahasia):

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

Untuk route `admin/set-role` dan skrip pemeliharaan, Admin SDK butuh kredensial service account — **salah satu**:

```
FIREBASE_SERVICE_ACCOUNT_JSON=<seluruh isi JSON>     # untuk server produksi
GOOGLE_APPLICATION_CREDENTIALS=/path/di/luar/repo.json  # untuk di laptop
```

> Jangan pernah menaruh file service account di dalam folder project. `.gitignore` sudah memblokir pola `*serviceAccount*.json` dan `*-adminsdk-*.json`, tapi simpan di luar repo.

## Deploy

Urutannya penting.

```bash
# 1. Rules & indeks Firestore
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <project-id>
```

Tunggu indeks berstatus **Enabled** di Firebase Console → Firestore → Indexes. Selama masih *Building*, query piutang dan riwayat akan gagal.

```bash
# 2. Aplikasi (host Node.js mana pun yang bisa menjalankan Next.js)
npm run build && npm run start
```

**Wajib HTTPS.** Service worker hanya terdaftar di secure context, jadi di atas HTTP murni seluruh kemampuan offline mati tanpa pesan error.

## Offline & PWA

Kasir harus tetap bisa melayani saat internet mati — ini kebutuhan nyata di Sorong, bukan fitur tambahan.

- **Tulisan diantre Firestore sendiri** ke IndexedDB, lalu terkirim saat jaringan kembali.
- Promise `commit()` Firestore **baru selesai setelah server mengakui**, jadi `await` biasa akan menggantung saat offline. Jalur tulis yang dipicu kasir memakai `queueWrite()` dari [`services/syncStatus.ts`](./services/syncStatus.ts) supaya struk tetap tercetak dan keranjang bisa direset. **Jangan** `await` commit langsung di jalur kasir.
- Sidebar menampilkan **"N data menunggu terkirim"** dan tombol merah bila ada yang gagal. Antrean sisa sesi sebelumnya dideteksi lewat `waitForPendingWrites()`.
- Kerangka aplikasi di-cache [`public/sw.js`](./public/sw.js), ditulis manual — `next-pwa` adalah plugin webpack dan **menggagalkan build** di Turbopack. Service worker sengaja tidak menyentuh Firestore, Firebase Auth, maupun `/api/*`.

## Skrip pemeliharaan

Semua butuh kredensial Admin SDK. Perilaku default-nya **berbeda** — perhatikan sebelum menjalankan:

| Skrip | Default |
|---|---|
| `normalize-dates.mjs` | hanya melaporkan; menulis dengan `--apply` |
| `audit-users.mjs` | hanya melaporkan; menulis hanya dengan `--delete-orphan` / `--link-orphan` |
| `set-custom-claims.mjs` | **langsung menulis**; pakai `--dry-run` untuk melihat rencananya dulu |

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/rep-secrets/sa.json

node scripts/set-custom-claims.mjs            # isi claim `role` dari dokumen users
node scripts/set-custom-claims.mjs --dry-run

node scripts/audit-users.mjs                  # cari akun Auth tanpa dokumen Firestore
node scripts/audit-users.mjs --email=staf@rep.id
node scripts/audit-users.mjs --delete-orphan=<UID>

node scripts/normalize-dates.mjs              # samakan format field `date`
node scripts/normalize-dates.mjs --apply
```

`audit-users.mjs` juga melaporkan dokumen `users` yang masih menyimpan field `password` dari versi lama — field itu perlu dibersihkan.

## Yang perlu diketahui sebelum melanjutkan

Catatan jujur, bukan daftar keinginan:

- **Stok masih bisa minus.** Validasi stok hanya di klien, dan `applyTransactionStock` memakai `increment()` yang atomik tapi tanpa membaca ulang stok. Dua kasir yang bersamaan bisa menjual melebihi stok. Perlu `runTransaction` atau Cloud Function.
- **Total transaksi tidak diverifikasi per item.** Firestore Rules tidak bisa melakukan loop, jadi `subtotal == Σ(harga × qty)` mustahil diperiksa di rules. Yang ditegakkan hanya konsistensi antar-field skalar, tipe data, tanda, dan atribusi kasir. Verifikasi penuh butuh Cloud Function.
- **7 layar masih membaca koleksi penuh** lewat `getTransactions()` — `Finance`, `MonthlyReport`, `SoldItems`, `CustomerHistory`, `ReturnHistory`, `TransferHistory`, dan `berita-acara`. Baru Dashboard yang memakai query berbatas. Penghambatnya: ada 21 titik yang me-resolve dokumen terkait dari array di memori (18 di `Finance.tsx`), misalnya `transactions.find(t => t.id === item.originalTransactionId)` — begitu daftarnya dibatasi tanggal, semua itu mengembalikan `undefined`. Perbaiki dengan pencarian per-id lebih dulu.
- **Tidak ada test otomatis di repo.** `npm run lint` melaporkan ~201 temuan, semuanya utang kualitas lama (aturan react-hooks, entitas HTML, `<img>` mentah), bukan error build.
- **`Finance.tsx` 4.820 baris** dengan 56 `useState`. Perubahan di sana perlu hati-hati.

## Dokumen lain

- **[FITUR_APLIKASI.md](./FITUR_APLIKASI.md)** — katalog fitur per layar, berguna untuk serah terima staf dan lampiran proposal.
- **[firestore.rules](./firestore.rules)** — aturan hak akses yang sebenarnya berlaku.

Sepuluh dokumen lama yang mendokumentasikan arsitektur MySQL/Express/Docker sudah dihapus; kalau membutuhkannya, berkasnya masih ada di history git.

---

**KASIR RELY** — dikembangkan oleh **RELY STUDIO** (Application & Web Development) · [github.com/rdwnelly](https://github.com/rdwnelly)
