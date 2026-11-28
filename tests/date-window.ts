/**
 * Uji jendela tanggal untuk kueri berbatas.
 *
 * Cara menjalankan:  npm run test:tanggal
 *
 * Yang dijaga di sini adalah satu hal: kueri berbatas TIDAK BOLEH
 * menghilangkan baris yang dianggap milik hari itu oleh penyaring di
 * layar. Kalau meleset, penjualan hilang dari setoran tanpa error apa
 * pun — kegagalan paling berbahaya, karena angkanya tetap terlihat
 * wajar.
 */
import { dayWindow, dayRangeBounds } from '../utils';

let lolos = 0;
const gagal: string[] = [];

const cek = (nama: string, benar: boolean, detail = '') => {
  if (benar) {
    console.log(`  ✓ ${nama}`);
    lolos++;
  } else {
    console.log(`  ✗ ${nama}${detail ? '  — ' + detail : ''}`);
    gagal.push(nama);
  }
};

const sama = (nama: string, hasil: unknown, harap: unknown) =>
  cek(nama, JSON.stringify(hasil) === JSON.stringify(harap),
    `dapat ${JSON.stringify(hasil)}, harap ${JSON.stringify(harap)}`);

console.log('\nBatas jendela\n');

sama('hari biasa', dayWindow('2026-11-28'), { dari: '2026-11-27', sampai: '2026-11-29' });
sama('awal bulan', dayWindow('2026-12-01'), { dari: '2026-11-30', sampai: '2026-12-02' });
sama('akhir tahun', dayWindow('2026-12-31'), { dari: '2026-12-30', sampai: '2027-01-01' });
sama('awal tahun', dayWindow('2027-01-01'), { dari: '2026-12-31', sampai: '2027-01-02' });
sama('tahun kabisat 1 Maret', dayWindow('2028-03-01'), { dari: '2028-02-29', sampai: '2028-03-02' });
sama('tahun biasa 1 Maret', dayWindow('2027-03-01'), { dari: '2027-02-28', sampai: '2027-03-02' });
sama('nilai bawa jam ikut dipotong', dayWindow('2026-11-28 14:30:00'), { dari: '2026-11-27', sampai: '2026-11-29' });
sama('bantalan nol = hari itu saja', dayWindow('2026-11-28', 0), { dari: '2026-11-28', sampai: '2026-11-28' });

console.log('\nTidak meledak pada masukan rusak\n');
cek('string kosong', typeof dayWindow('').dari === 'string');
cek('bukan tanggal', typeof dayWindow('entah apa').dari === 'string');

console.log('\nJaminan utama: baris yang dianggap milik hari itu PASTI terjaring\n');

/** Meniru pencocokan di layar: cocok bila awalannya sama, atau bila hasil parse-nya jatuh di hari itu. */
const dianggapMilikHariItu = (nilai: string, hari: string): boolean => {
  if (nilai.startsWith(hari)) return true;
  const d = new Date(nilai.includes('T') ? nilai : nilai.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return false;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` === hari;
};

/** Meniru kueri Firestore: perbandingan string mentah pada batas rentang. */
const terjaringKueri = (nilai: string, hari: string): boolean => {
  const { dari, sampai } = dayWindow(hari);
  const { start, end } = dayRangeBounds(dari, sampai);
  return nilai >= start && nilai <= end;
};

const kasus: [string, string, string][] = [
  ['2026-09-08 09:00:00', '2026-09-08', 'kanonik, hari yang sama'],
  ['2026-09-08 00:00:00', '2026-09-08', 'tengah malam'],
  ['2026-09-08 23:59:59', '2026-09-08', 'detik terakhir'],
  ['2026-09-07T20:00:00Z', '2026-09-08', 'UTC sore -> besok paginya di Jayapura'],
  ['2026-09-08T16:00:00Z', '2026-09-09', 'UTC -> hari berikutnya'],
  ['2026-09-08T23:30:00+09:00', '2026-09-08', 'berzona +09 eksplisit'],
  ['2026-12-31T20:00:00Z', '2027-01-01', 'lintas tahun'],
  ['2026-09-08', '2026-09-08', 'tanggal saja tanpa jam'],
];

for (const [nilai, hari, keterangan] of kasus) {
  if (!dianggapMilikHariItu(nilai, hari)) {
    cek(`${keterangan} — prasyarat`, false, `"${nilai}" tidak dianggap milik ${hari}; kasus ujinya keliru`);
    continue;
  }
  cek(
    `${keterangan}`,
    terjaringKueri(nilai, hari),
    `"${nilai}" dianggap milik ${hari} oleh layar, tapi TIDAK terjaring kueri — penjualan akan hilang`,
  );
}

// Pembanding: tanpa bantalan, kasus pergeseran UTC memang lolos dari kueri.
// Uji ini membuktikan bantalannya benar-benar yang menyelamatkan, bukan
// kebetulan dari batas atas dayRangeBounds.
const tanpaBantalan = (nilai: string, hari: string) => {
  const { start, end } = dayRangeBounds(hari, hari);
  return nilai >= start && nilai <= end;
};
cek(
  'tanpa bantalan, baris UTC sore memang terlewat (alasan bantalan ini ada)',
  tanpaBantalan('2026-09-07T20:00:00Z', '2026-09-08') === false,
);

console.log(
  gagal.length
    ? `\n${gagal.length} GAGAL dari ${lolos + gagal.length}:\n  - ${gagal.join('\n  - ')}\n`
    : `\nSemua ${lolos} uji lolos.\n`,
);
process.exit(gagal.length ? 1 : 0);
