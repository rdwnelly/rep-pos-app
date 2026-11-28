/**
 * Uji pencatat kegagalan pembacaan data.
 *
 * Cara menjalankan:  npm run test:load
 *
 * Yang dijaga di sini bukan tampilannya, melainkan dua perilaku yang
 * kalau salah justru membuat bannernya berbahaya:
 *
 *   1. Catatan gagal TIDAK boleh menumpuk. useData memuat ulang setiap
 *      kali datanya berubah, jadi satu entitas yang terus gagal akan
 *      menghasilkan ratusan baris identik.
 *   2. Pemuatan yang akhirnya berhasil HARUS menghapus catatannya.
 *      Kalau tidak, peringatan basi tetap menempel setelah datanya
 *      masuk, dan karyawan akan belajar mengabaikan banner itu — yang
 *      membuat seluruh perbaikan ini sia-sia.
 */
import {
  clearLoadFailures,
  getLoadFailures,
  namaEntitas,
  recordLoadFailure,
  recordLoadSuccess,
  sebabDari,
  subscribeLoadFailures,
} from '../services/loadStatus';

let lolos = 0;
const gagal: string[] = [];

const cek = (nama: string, benar: boolean) => {
  if (benar) {
    console.log(`  ✓ ${nama}`);
    lolos++;
  } else {
    console.log(`  ✗ ${nama}`);
    gagal.push(nama);
  }
};

const galat = (code: string, message = '') => ({ code, message });

console.log('\nPencatatan kegagalan\n');

clearLoadFailures();
recordLoadFailure('transactions', galat('permission-denied'));
cek('satu kegagalan tercatat', getLoadFailures().length === 1);
cek('dinamai untuk karyawan, bukan nama koleksi', getLoadFailures()[0].nama === 'Transaksi penjualan');

recordLoadFailure('transactions', galat('permission-denied'));
recordLoadFailure('transactions', galat('unavailable'));
cek('entitas yang sama tidak menumpuk', getLoadFailures().length === 1);
cek('catatan terbaru yang menang', getLoadFailures()[0].sebab.includes('Server tidak terjangkau'));

recordLoadFailure('products', galat('unavailable'));
cek('entitas berbeda dicatat terpisah', getLoadFailures().length === 2);

recordLoadSuccess('transactions');
cek('pemuatan berhasil menghapus catatannya', getLoadFailures().length === 1);
cek('yang terhapus memang yang benar', getLoadFailures()[0].entitas === 'products');

recordLoadSuccess('products');
cek('semua pulih menghapus seluruh catatan', getLoadFailures().length === 0);

recordLoadSuccess('entitas-yang-tidak-pernah-gagal');
cek('sukses untuk entitas tak bercatat tidak menimbulkan masalah', getLoadFailures().length === 0);

console.log('\nPemberitahuan ke pendengar\n');

clearLoadFailures();
let diterima = 0;
let terakhir = 0;
const lepas = subscribeLoadFailures((f) => {
  diterima++;
  terakhir = f.length;
});
cek('pendengar langsung diberi keadaan saat ini', diterima === 1);
recordLoadFailure('cashflow', galat('unavailable'));
cek('pendengar diberi tahu saat gagal', terakhir === 1);
recordLoadSuccess('cashflow');
cek('pendengar diberi tahu saat pulih', terakhir === 0);
lepas();
const sebelum = diterima;
recordLoadFailure('banks', galat('unavailable'));
cek('berhenti berlangganan benar-benar berhenti', diterima === sebelum);

console.log('\nPenerjemahan sebab\n');

cek('ditolak aturan', sebabDari(galat('permission-denied')).includes('Ditolak aturan'));
cek('pesan SDK tanpa code ikut dikenali',
  sebabDari({ message: 'Missing or insufficient permissions.' }).includes('Ditolak aturan'));
cek('indeks belum dibuat', sebabDari(galat('failed-precondition', 'The query requires an index')).includes('indeks'));
cek('server tak terjangkau', sebabDari(galat('unavailable')).includes('koneksi'));
cek('kuota habis', sebabDari(galat('resource-exhausted')).includes('Kuota'));
cek('galat tak dikenal tetap menyebutkan pesan aslinya',
  sebabDari(galat('aneh', 'Sesuatu yang aneh')).includes('Sesuatu yang aneh'));
cek('tanpa pesan apa pun tetap memberi kalimat',
  sebabDari(undefined).length > 0);

console.log('\nNama entitas\n');
cek('kunci dikenal diterjemahkan', namaEntitas('categories') === 'Unit usaha');
cek('penulisan berbeda di Settings ikut tertangani', namaEntitas('storeSettings') === 'Pengaturan toko');
cek('kunci tak dikenal dikembalikan apa adanya', namaEntitas('koleksi_baru') === 'koleksi_baru');

clearLoadFailures();

console.log(
  gagal.length
    ? `\n${gagal.length} GAGAL dari ${lolos + gagal.length}:\n  - ${gagal.join('\n  - ')}\n`
    : `\nSemua ${lolos} uji lolos.\n`,
);
process.exit(gagal.length ? 1 : 0);
