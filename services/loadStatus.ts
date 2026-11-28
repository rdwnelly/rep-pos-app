/**
 * Status kegagalan PEMBACAAN data.
 *
 * Pasangan dari syncStatus.ts, yang menangani kegagalan TULIS.
 *
 * Sebelum modul ini ada, setiap kegagalan baca hanya ditulis ke Console
 * lalu layarnya menampilkan kosong — persis sama dengan "datanya memang
 * belum ada". Karyawan tidak punya cara membedakan keduanya, jadi tidak
 * pernah melaporkannya, dan di seluruh kode ada 93 console.warn/error
 * dengan pola yang sama.
 *
 * Biayanya nyata: Dashboard yang menampilkan Rp 0 bisa berarti "hari ini
 * belum ada penjualan" atau "kueri ditolak server" — dan menelusurinya
 * perlu membuka Console, yang tidak dilakukan siapa pun di lapangan.
 *
 * Kegagalan dicatat per-entitas, bukan per-kejadian. `useData` memuat
 * ulang setiap kali datanya berubah, jadi menyimpan tiap percobaan akan
 * menumpuk ratusan baris yang sama. Pemuatan yang akhirnya berhasil
 * menghapus catatannya sendiri, sehingga gangguan jaringan sesaat pulih
 * tanpa menyisakan peringatan basi.
 */

export type LoadFailure = {
  /** Kunci entitas dari useData, mis. "transactions". */
  entitas: string;
  /** Nama yang dimengerti karyawan, mis. "Transaksi penjualan". */
  nama: string;
  /** Penyebab dalam bahasa manusia, bukan pesan SDK. */
  sebab: string;
  /** Pesan asli, untuk ditempel ke laporan ke tim IT. */
  teknis: string;
  at: string;
};

/**
 * Nama koleksi tidak berarti apa-apa bagi karyawan. Kunci di sini
 * mengikuti argumen `relevantEntities` pada pemanggilan useData —
 * termasuk "storeSettings" yang ditulis beda sendiri di Settings.
 */
const NAMA_ENTITAS: Record<string, string> = {
  transactions: 'Transaksi penjualan',
  products: 'Produk',
  categories: 'Unit usaha',
  customers: 'Pelanggan',
  suppliers: 'Supplier',
  cashflow: 'Arus kas',
  purchases: 'Pembelian',
  stock_adjustments: 'Penyesuaian stok',
  visitor_logs: 'Data pengunjung',
  travel_agents: 'Agen travel',
  travel_commissions: 'Komisi agen',
  banks: 'Bank / e-wallet',
  divisions: 'Divisi',
  users: 'Pengguna',
  open_bills: 'Open bill',
  berita_acara_archives: 'Arsip Berita Acara',
  store_settings: 'Pengaturan toko',
  storeSettings: 'Pengaturan toko',
};

export const namaEntitas = (entitas: string): string =>
  NAMA_ENTITAS[entitas] || entitas;

/** Menerjemahkan galat Firestore menjadi sebab yang bisa ditindaklanjuti. */
export const sebabDari = (error: unknown): string => {
  const e = error as { code?: string; message?: string } | undefined;
  const kode = e?.code ?? '';
  const pesan = String(e?.message ?? '');

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Perangkat sedang offline dan datanya belum pernah tersimpan di perangkat ini.';
  }
  if (kode === 'permission-denied' || /insufficient permissions/i.test(pesan)) {
    return 'Ditolak aturan Firestore — akun Anda mungkin tidak berhak membaca data ini.';
  }
  if (kode === 'failed-precondition' || /requires an index/i.test(pesan)) {
    return 'Kueri butuh indeks Firestore yang belum dibuat. Laporkan ke tim IT.';
  }
  if (kode === 'unavailable' || /network|offline|transport/i.test(pesan)) {
    return 'Server tidak terjangkau. Periksa koneksi internet.';
  }
  if (kode === 'resource-exhausted') {
    return 'Kuota Firestore habis. Laporkan ke tim IT.';
  }
  return pesan || 'Penyebab tidak diketahui.';
};

type Listener = (failures: LoadFailure[]) => void;

const listeners = new Set<Listener>();
/** Satu catatan per entitas; percobaan berikutnya menimpa, bukan menumpuk. */
const failures = new Map<string, LoadFailure>();

const snapshot = (): LoadFailure[] => [...failures.values()];

const emit = () => {
  const state = snapshot();
  listeners.forEach((listener) => listener(state));
};

export const getLoadFailures = snapshot;

export const subscribeLoadFailures = (listener: Listener) => {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
};

export const recordLoadFailure = (entitas: string, error: unknown) => {
  failures.set(entitas, {
    entitas,
    nama: namaEntitas(entitas),
    sebab: sebabDari(error),
    teknis: String((error as { message?: string })?.message ?? error),
    at: new Date().toISOString(),
  });
  emit();
};

/** Pemuatan berhasil menghapus catatan gagal entitas itu. */
export const recordLoadSuccess = (entitas: string) => {
  if (failures.delete(entitas)) emit();
};

export const clearLoadFailures = () => {
  if (failures.size === 0) return;
  failures.clear();
  emit();
};
