import { BATAS_STOK_MAKSIMAL } from '../types';

/**
 * Menerjemahkan penolakan server pada operasi yang mengubah stok.
 *
 * Firestore menolak dengan "Missing or insufficient permissions" untuk
 * apa pun yang gagal lolos aturan — pelanggaran batas stok, stok yang
 * akan jadi minus, maupun peran yang tidak berwenang. Pesan itu benar
 * secara teknis tapi tidak memberi tahu apa yang harus dilakukan, dan
 * yang membacanya adalah kasir atau petugas gudang di tengah pekerjaan.
 *
 * Dua aturan stok yang bisa menolak sebuah penulisan:
 *   - hasilnya akan melebihi BATAS_STOK_MAKSIMAL, atau
 *   - hasilnya akan negatif.
 *
 * Dari sisi klien keduanya tidak bisa dibedakan: penolakannya identik.
 * Jadi pesannya menyebutkan keduanya, dengan urutan sesuai arah operasi
 * yang sedang dijalankan — itulah gunanya parameter `arah`.
 *
 * @returns penjelasan untuk ditampilkan, atau null bila penolakannya
 *          bukan soal izin (biar pemanggil memakai pesannya sendiri).
 */
export const pesanTolakanStok = (
  error: unknown,
  arah: 'menambah' | 'mengurangi' = 'menambah',
): string | null => {
  const e = error as { code?: string; message?: string } | undefined;
  const ditolak =
    e?.code === 'permission-denied' ||
    /insufficient permissions|permission-denied/i.test(String(e?.message ?? ''));
  if (!ditolak) return null;

  const batas =
    `Stok melebihi batas ${BATAS_STOK_MAKSIMAL} unit per jenis produk. `
    + `Kurangi jumlahnya, atau pecah menjadi beberapa jenis produk.`;
  const minus =
    'Stok akan menjadi minus — jumlah yang dikeluarkan melebihi stok yang tercatat. '
    + 'Muat ulang halaman untuk melihat stok terbaru.';

  const sebab = arah === 'menambah' ? [batas, minus] : [minus, batas];

  return (
    'DITOLAK server.\n\n'
    + 'Kemungkinan penyebabnya:\n'
    + sebab.map((s, i) => `${i + 1}. ${s}`).join('\n')
    + '\n\nKalau keduanya tidak sesuai, berarti akun Anda tidak berwenang '
    + 'melakukan perubahan ini. Laporkan ke tim IT.'
  );
};
