/**
 * Uji klasifikasi komisi yatim.
 *
 * Cara menjalankan:  npm run test:komisi
 *
 * Skrip pembersihnya MENGHAPUS dokumen, dan biasanya hanya dijalankan
 * sekali terhadap basis data sungguhan. Tidak ada kesempatan kedua, dan
 * tidak ada yang akan menyadari kalau ia menghapus komisi yang salah —
 * yang hilang justru data yang tidak pernah dicurigai. Karena itu
 * keputusannya diuji di sini, bukan dipercaya begitu saja.
 *
 * Yang paling dijaga: komisi yang dibuat MANUAL di layar Komisi Agen
 * memang tidak punya transaksi, dan tidak boleh ikut terhapus hanya
 * karena itu.
 */
import { klasifikasiKomisi, PENANDA_POS } from '../scripts/lib/klasifikasi-komisi.mjs';

let lolos = 0;
const gagal = [];

const cek = (nama, dapat, harap) => {
  if (dapat === harap) {
    console.log(`  ✓ ${nama}  -> ${dapat}`);
    lolos++;
  } else {
    console.log(`  ✗ ${nama}  -> ${dapat}, seharusnya ${harap}`);
    gagal.push(nama);
  }
};

const faktur = new Set(['INV-2026-0001', 'INV-2026-0002', 'TRV-884213']);

const dariPos = (kode, catatanTambahan = '') => ({
  bookingCode: kode,
  notes: `${PENANDA_POS} (${kode}) - Skema: 10%${catatanTambahan}`,
});

console.log('\nKomisi dari Kasir POS\n');

cek('faktur masih ada', klasifikasiKomisi(dariPos('INV-2026-0001'), faktur), 'utuh');
cek('faktur sudah dihapus', klasifikasiKomisi(dariPos('INV-2026-9999'), faktur), 'yatim');
cek('kode berspasi tetap dicocokkan',
  klasifikasiKomisi({ ...dariPos('INV-2026-0002'), bookingCode: '  INV-2026-0002  ' }, faktur), 'utuh');
cek('kode cadangan POS diserahkan ke manusia',
  klasifikasiKomisi(dariPos('TRV-POS-884213'), faktur), 'taktentu');
cek('kode kosong diserahkan ke manusia',
  klasifikasiKomisi({ bookingCode: '', notes: PENANDA_POS }, faktur), 'taktentu');

console.log('\nKomisi yang dibuat manual — tidak boleh tersentuh\n');

cek('manual, berkode TRV dan tanpa transaksi',
  klasifikasiKomisi({ bookingCode: 'TRV-551203', notes: 'Komisi driver rombongan sekolah' }, faktur), 'manual');
cek('manual tanpa catatan sama sekali',
  klasifikasiKomisi({ bookingCode: 'TRV-100000' }, faktur), 'manual');
cek('manual dengan catatan kosong',
  klasifikasiKomisi({ bookingCode: 'TRV-100001', notes: '' }, faktur), 'manual');
cek('manual yang kodenya kebetulan sama dengan faktur yang ada',
  klasifikasiKomisi({ bookingCode: 'TRV-884213', notes: 'Dicatat manual' }, faktur), 'manual');
cek('dokumen kosong sama sekali', klasifikasiKomisi({}, faktur), 'manual');
cek('null tidak meledak', klasifikasiKomisi(null, faktur), 'manual');

console.log('\nKomisi POS yang catatannya sudah diubah orang\n');

// Arah kesalahannya disengaja: lebih baik menyisakan satu yatim untuk
// diperiksa manusia daripada menghapus komisi yang masih sah.
cek('catatan POS dihapus pengguna -> dianggap manual, dilewati',
  klasifikasiKomisi({ bookingCode: 'INV-2026-9999', notes: 'Sudah dibayar tunai' }, faktur), 'manual');
cek('catatan POS dengan tambahan di belakang tetap dikenali',
  klasifikasiKomisi(dariPos('INV-2026-9998', ' — revisi'), faktur), 'yatim');

console.log('\nTidak ada faktur sama sekali (basis data kosong)\n');
cek('komisi POS saat tidak ada transaksi', klasifikasiKomisi(dariPos('INV-X'), new Set()), 'yatim');
cek('komisi manual saat tidak ada transaksi',
  klasifikasiKomisi({ bookingCode: 'TRV-1', notes: 'manual' }, new Set()), 'manual');

console.log(
  gagal.length
    ? `\n${gagal.length} GAGAL dari ${lolos + gagal.length}:\n  - ${gagal.join('\n  - ')}\n`
    : `\nSemua ${lolos} uji lolos.\n`,
);
process.exit(gagal.length ? 1 : 0);
