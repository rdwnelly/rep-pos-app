import { ApiService } from "./api";
import {
  BA_EXPENSE_SOURCE,
  BeritaAcaraExpenseRow,
  BeritaAcaraSyncUser,
  planBeritaAcaraExpenseSync,
} from "./beritaAcaraExpensePlan";
import type { CashFlow } from "../types";

/**
 * Jembatan data: "Rincian Pengeluaran Operasional" (Berita Acara harian)
 * ──> koleksi `cashflow`.
 *
 * MASALAH YANG DIPERBAIKI
 * Berita Acara menyimpan rincian pengeluaran HANYA sebagai array
 * `customExpenses` di dalam dokumen `berita_acara_archives/ba_<tanggal>`,
 * sedangkan Laporan Bulanan ("Laporan Pemasukan & Tutup Buku") membaca
 * beban operasionalnya dari koleksi `cashflow`. Akibatnya biaya yang
 * diketik petugas di Berita Acara tidak pernah muncul di Laporan
 * Bulanan — Section V selalu nol dan laba bersihnya kelihatan lebih
 * besar dari kenyataan.
 *
 * Arah alirannya sebetulnya sudah dirancang satu arah: Berita Acara
 * MENGIMPOR kas keluar hari itu ke `customExpenses` (lihat
 * getMatchingCashflowsForDate di halaman Berita Acara). Yang belum ada
 * adalah arah baliknya. Modul ini melengkapinya sehingga `cashflow`
 * benar-benar menjadi satu sumber kebenaran untuk semua laporan.
 *
 * Perencanaannya ada di ./beritaAcaraExpensePlan.ts; di sini hanya
 * eksekusi tulis/hapusnya.
 */

export { BA_EXPENSE_SOURCE };
export type { BeritaAcaraExpenseRow };

export interface BeritaAcaraExpenseSyncResult {
  /** Dokumen kas yang benar-benar ditulis (baru atau berubah nilainya). */
  written: number;
  /** Baris yang isinya sudah sama di `cashflow`, jadi tidak ditulis ulang. */
  unchanged: number;
  removed: number;
  /** Baris yang dilewati karena bukan catatan kas milik pengguna ini. */
  skipped: number;
  /** Dokumen sisa yang perlu dibersihkan tapi di luar wewenang pengguna ini. */
  blockedRemovals: number;
  /** Tulisan/penghapusan yang ditolak server. */
  failed: number;
  /** Jumlah seluruh baris aktif yang kini ada di `cashflow`. */
  totalAmount: number;
}

/**
 * Tulis rincian pengeluaran Berita Acara satu tanggal ke `cashflow`,
 * lalu bersihkan dokumen milik tanggal itu yang barisnya sudah dihapus.
 *
 * Idempoten: id dokumen diturunkan dari tanggal + id baris, jadi
 * menyimpan berulang kali memperbarui dokumen yang sama.
 *
 * Tidak memanggil notifyListeners sendiri supaya pemanggil bisa
 * memberi tahu sekali saja setelah semua tulisan selesai.
 */
export const syncBeritaAcaraExpensesToCashFlow = async ({
  date,
  rows,
  existingCashFlows = [],
  user = null,
}: {
  date: string;
  rows: BeritaAcaraExpenseRow[];
  existingCashFlows?: CashFlow[];
  user?: BeritaAcaraSyncUser | null;
}): Promise<BeritaAcaraExpenseSyncResult> => {
  const plan = planBeritaAcaraExpenseSync({
    date,
    rows,
    existingCashFlows,
    user,
  });

  const outcomes = await Promise.allSettled([
    ...plan.upserts.map((cf) => ApiService.addCashFlow(cf)),
    ...plan.orphanIds.map((id) => ApiService.deleteCashFlow(id)),
  ]);

  let failed = 0;
  outcomes.forEach((outcome, index) => {
    if (outcome.status !== "rejected") return;
    failed += 1;

    const target =
      index < plan.upserts.length
        ? `tulis ${plan.upserts[index].id}`
        : `hapus ${plan.orphanIds[index - plan.upserts.length]}`;
    const reason: any = outcome.reason;
    const isPermission =
      reason?.code === "permission-denied" ||
      /insufficient permissions/i.test(String(reason?.message ?? ""));

    // console.warn, bukan console.error: kegagalan di sini sudah
    // ditangani (dilaporkan lewat `failed` ke pemanggil, yang
    // menampilkannya di layar), jadi tidak perlu memunculkan overlay
    // error di mode pengembangan.
    console.warn(
      `[Berita Acara → arus kas] ${date}: gagal ${target}.` +
        (isPermission
          ? " Izin ditolak — aturan Firestore belum ter-deploy" +
            " (jalankan: firebase deploy --only firestore:rules)" +
            " atau peran pengguna ini tidak berwenang atas catatan kas tersebut."
          : ""),
      reason,
    );
  });

  return {
    written: plan.upserts.length,
    unchanged: plan.unchanged,
    removed: plan.orphanIds.length,
    skipped: plan.skipped,
    blockedRemovals: plan.blockedRemovals.length,
    failed,
    totalAmount: plan.totalAmount,
  };
};
