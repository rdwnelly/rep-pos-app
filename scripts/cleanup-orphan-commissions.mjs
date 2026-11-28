/**
 * Membersihkan komisi agen travel yang transaksinya sudah dihapus.
 *
 * Latar: deleteTransaction dulu mencari komisi terkait di koleksi
 * "travel_booking_commissions", padahal komisi ditulis ke
 * "travel_commissions". Koleksi yang dicari itu tidak pernah ada dan
 * tidak punya aturan di firestore.rules, jadi kuerinya ditolak lalu
 * ditelan catch yang hanya console.warn. Akibatnya setiap transaksi
 * beragen yang dihapus meninggalkan komisi yatim, yang tetap ikut
 * terhitung di Laporan Komisi Agen. Salah namanya sudah diperbaiki,
 * tapi itu hanya menghentikan yang baru — yang terlanjur ada harus
 * dibersihkan sekali lewat skrip ini.
 *
 * Pemakaian:
 *   export GOOGLE_APPLICATION_CREDENTIALS=~/rep-secrets/sa.json
 *   node scripts/cleanup-orphan-commissions.mjs            # laporan saja
 *   node scripts/cleanup-orphan-commissions.mjs --apply    # hapus
 *
 * ────────────────────────────────────────────────────────────────────
 * YANG DIHAPUS DAN YANG TIDAK — bagian terpenting dari skrip ini.
 *
 * Komisi bisa lahir dari dua jalur:
 *
 *   a. Checkout beragen di Kasir POS. bookingCode-nya adalah
 *      invoiceNumber transaksinya, dan catatannya selalu diawali
 *      "Otomatis dari Kasir POS".
 *   b. Dibuat manual di layar Komisi Agen. Kodenya "TRV-xxxxxx" dan
 *      memang TIDAK punya transaksi sama sekali.
 *
 * Hanya jalur (a) yang boleh dianggap yatim. Menghapus komisi manual
 * karena "tidak ada transaksinya" akan memusnahkan data yang sah —
 * itulah kesalahan paling mungkin terjadi pada skrip semacam ini, jadi
 * penandanya diambil dari `notes`, bukan ditebak dari format kode.
 *
 * Komisi POS yang catatannya sudah diubah orang akan ikut dilewati.
 * Arahnya disengaja: lebih baik menyisakan satu yatim untuk diperiksa
 * manusia daripada menghapus komisi yang masih sah.
 * ────────────────────────────────────────────────────────────────────
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { klasifikasiKomisi } from './lib/klasifikasi-komisi.mjs';

const apply = process.argv.includes('--apply');

const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!inline && !keyPath) {
  console.error('Kredensial belum diset.\n  export GOOGLE_APPLICATION_CREDENTIALS=/path/di/luar/repo/sa.json');
  process.exit(1);
}
initializeApp({
  credential: cert(inline ? JSON.parse(inline) : JSON.parse(readFileSync(keyPath, 'utf8'))),
});
const db = getFirestore();

const rupiah = (n) =>
  'Rp ' + Number(n || 0).toLocaleString('id-ID');

console.log(
  apply
    ? 'MODE HAPUS — pastikan Anda sudah punya backup Firestore.\n'
    : 'MODE LAPORAN — tidak ada yang dihapus. Tambahkan --apply untuk menghapus.\n',
);

// ── 1. Kumpulkan seluruh nomor faktur yang masih ada ────────────────
const txSnap = await db.collection('transactions').select('invoiceNumber').get();
const fakturAda = new Set();
txSnap.forEach((d) => {
  const inv = d.data().invoiceNumber;
  if (inv) fakturAda.add(String(inv).trim());
});
console.log(`Transaksi terbaca        : ${txSnap.size} (${fakturAda.size} nomor faktur unik)`);

// ── 2. Periksa setiap komisi ────────────────────────────────────────
const komSnap = await db.collection('travel_commissions').get();

const yatim = [];
const manual = [];
const masihAda = [];
const taktentu = [];

const keranjang = { yatim, manual, utuh: masihAda, taktentu };

komSnap.forEach((d) => {
  const k = d.data();
  keranjang[klasifikasiKomisi(k, fakturAda)].push({
    id: d.id,
    kode: String(k.bookingCode ?? '').trim(),
    agen: k.agentName || '-',
    tamu: k.touristName || '-',
    tanggal: k.departureDate || '-',
    komisi: Number(k.totalCommission || 0) + Number(k.bonusCommission || 0),
    status: k.status || '-',
  });
});

const total = (daftar) => daftar.reduce((a, b) => a + b.komisi, 0);

console.log(`Komisi terbaca           : ${komSnap.size}\n`);
console.log(`  dibuat manual (dilewati)        : ${String(manual.length).padStart(4)}   ${rupiah(total(manual))}`);
console.log(`  dari POS, transaksinya ada      : ${String(masihAda.length).padStart(4)}   ${rupiah(total(masihAda))}`);
console.log(`  dari POS, perlu diperiksa tangan: ${String(taktentu.length).padStart(4)}   ${rupiah(total(taktentu))}`);
console.log(`  YATIM — transaksinya hilang     : ${String(yatim.length).padStart(4)}   ${rupiah(total(yatim))}\n`);

if (taktentu.length) {
  console.log('Perlu diperiksa tangan (kode cadangan POS, tidak menunjuk faktur):');
  taktentu.forEach((b) =>
    console.log(`   ${b.id}  ${b.kode}  ${b.agen} / ${b.tamu}  ${rupiah(b.komisi)}`),
  );
  console.log();
}

if (yatim.length === 0) {
  console.log('Tidak ada komisi yatim. Tidak ada yang perlu dilakukan.');
  process.exit(0);
}

console.log('Komisi yatim:');
yatim.forEach((b) =>
  console.log(
    `   ${b.id}  ${b.kode.padEnd(18)} ${String(b.agen).slice(0, 18).padEnd(18)} ` +
    `${String(b.tanggal).slice(0, 10)}  ${rupiah(b.komisi).padStart(14)}  ${b.status}`,
  ),
);
console.log(`\n   Total komisi yatim: ${rupiah(total(yatim))}`);
console.log('   Sejumlah itulah yang selama ini ikut terhitung di Laporan Komisi Agen.\n');

if (!apply) {
  console.log('Jalankan ulang dengan --apply untuk menghapusnya.');
  process.exit(0);
}

// ── 3. Hapus ────────────────────────────────────────────────────────
// Firestore membatasi 500 operasi per batch.
let terhapus = 0;
for (let i = 0; i < yatim.length; i += 400) {
  const potongan = yatim.slice(i, i + 400);
  const batch = db.batch();
  potongan.forEach((b) => batch.delete(db.collection('travel_commissions').doc(b.id)));
  await batch.commit();
  terhapus += potongan.length;
  console.log(`   terhapus ${terhapus}/${yatim.length}`);
}

console.log(`\nSelesai. ${terhapus} komisi yatim dihapus, senilai ${rupiah(total(yatim))}.`);
console.log('Komisi manual dan komisi yang transaksinya masih ada tidak disentuh.');
