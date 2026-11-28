/**
 * Menentukan nasib sebuah komisi agen travel: yatim, atau jangan disentuh.
 *
 * Dipisahkan dari skripnya supaya bisa diuji tanpa menyentuh Firestore.
 * Inilah bagian yang kalau salah akan MENGHAPUS DATA YANG SAH, jadi ia
 * tidak boleh hidup di dalam skrip yang hanya pernah dijalankan sekali
 * terhadap basis data sungguhan.
 *
 * Tanpa efek samping dan tanpa impor apa pun.
 */

/** Catatan yang ditulis POS pada setiap komisi hasil checkout beragen. */
export const PENANDA_POS = 'Otomatis dari Kasir POS';

/**
 * Kode cadangan yang dipakai POS ketika invoiceNumber tidak terbaca.
 * Kode seperti ini tidak pernah menunjuk faktur mana pun, jadi
 * ketiadaan transaksinya BUKAN bukti bahwa ia yatim.
 */
export const POLA_CADANGAN_POS = /^TRV-POS-\d+$/;

/**
 * @returns 'yatim'    — dari POS, fakturnya sudah tidak ada: boleh dihapus
 *          'manual'   — dibuat tangan di layar Komisi Agen: jangan disentuh
 *          'utuh'     — dari POS, transaksinya masih ada
 *          'taktentu' — dari POS tapi kodenya kode cadangan: serahkan ke manusia
 */
export const klasifikasiKomisi = (komisi, fakturAda) => {
  const kode = String(komisi?.bookingCode ?? '').trim();
  const catatan = String(komisi?.notes ?? '');

  // Penandanya diambil dari catatan, bukan ditebak dari format kode.
  // Komisi manual juga berkode "TRV-xxxxxx" dan memang tidak punya
  // transaksi — menebak dari kode akan menghapusnya.
  if (!catatan.includes(PENANDA_POS)) return 'manual';

  if (!kode || POLA_CADANGAN_POS.test(kode)) return 'taktentu';

  return fakturAda.has(kode) ? 'utuh' : 'yatim';
};
