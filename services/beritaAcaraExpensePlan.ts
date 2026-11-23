import type { CashFlow } from "../types";
import { CashFlowType, PaymentMethod, UserRole } from "../types";

/**
 * Perencanaan (murni, tanpa efek samping) untuk mengalirkan
 * "Rincian Pengeluaran Operasional" Berita Acara ke koleksi `cashflow`.
 *
 * Dipisah dari eksekusinya di services/beritaAcaraExpenseSync.ts supaya
 * aturan penentuan id dokumen, pembersihan baris yatim, dan batas
 * kewenangan non-admin bisa diuji tanpa menyentuh Firestore. Salah di
 * bagian ini berarti nominal beban terhitung dua kali di laporan, jadi
 * logikanya sengaja dijaga terpisah dan gamblang.
 */

export const BA_EXPENSE_SOURCE = "BERITA_ACARA";

const ADMIN_ROLES: string[] = [
  UserRole.SUPERADMIN,
  UserRole.OWNER,
  UserRole.ADMIN,
];

/** Peran yang boleh menghapus catatan kas apa pun (lihat firestore.rules). */
const OWNER_ROLES: string[] = [UserRole.SUPERADMIN, UserRole.OWNER];

export interface BeritaAcaraExpenseRow {
  id?: string | number;
  /** Diisi saat baris berasal dari impor kas keluar: id dokumen cashflow-nya. */
  cashflowId?: string;
  category?: string;
  keterangan?: string;
  qty?: string | number;
  harga?: string | number;
  total?: string | number;
}

export interface BeritaAcaraSyncUser {
  id?: string;
  name?: string;
  username?: string;
  role?: string;
}

export interface BeritaAcaraExpensePlan {
  upserts: CashFlow[];
  orphanIds: string[];
  /** Baris yang dilewati karena dokumen kasnya milik modul/pengguna lain. */
  skipped: number;
  /**
   * Dokumen sisa yang seharusnya dihapus tapi di luar kewenangan
   * pengguna ini. Tidak ikut dihapus — kalau dipaksa, Firestore
   * menolaknya dan seluruh sinkronisasi ikut tercatat gagal.
   */
  blockedRemovals: string[];
  /** Baris yang sudah identik di `cashflow`, jadi tidak perlu ditulis. */
  unchanged: number;
  /** Jumlah seluruh baris aktif, termasuk yang tidak perlu ditulis. */
  totalAmount: number;
}

/** Buang nomor urut dropdown ("3) Kafe & Resto" -> "Kafe & Resto"). */
export const cleanExpenseCategoryLabel = (raw: unknown): string =>
  String(raw ?? "")
    .replace(/^\d+\)\s*/, "")
    .trim();

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Nominal satu baris, memakai aturan yang sama dengan tampilan Berita
 * Acara: kolom total menang, kalau kosong baru dihitung qty x harga.
 */
export const resolveBeritaAcaraExpenseAmount = (
  row: BeritaAcaraExpenseRow | null | undefined,
): number => {
  const total = toNumber(row?.total);
  if (total > 0) return total;
  const derived = toNumber(row?.qty) * toNumber(row?.harga);
  return derived > 0 ? derived : 0;
};

const resolveDocId = (
  date: string,
  row: BeritaAcaraExpenseRow,
  existingById: Map<string, CashFlow>,
  index: number,
): string => {
  const linked = row?.cashflowId ? String(row.cashflowId) : "";
  if (linked) return linked;

  const rowId = row?.id === undefined || row?.id === null ? "" : String(row.id);

  // Arsip yang dibuat sebelum field `cashflowId` ada: baris hasil impor
  // memakai id dokumen cashflow sebagai id barisnya. Tanpa pengecekan
  // ini, baris itu akan dibuatkan dokumen kedua dan nilainya dobel.
  if (rowId && existingById.has(rowId)) return rowId;

  return `ba_${date}_${rowId || `idx${index}`}`;
};

const isSameEntry = (existing: CashFlow, candidate: CashFlow): boolean =>
  existing.type === candidate.type &&
  Number(existing.amount) === Number(candidate.amount) &&
  String(existing.category ?? "") === String(candidate.category ?? "") &&
  String(existing.description ?? "") === String(candidate.description ?? "") &&
  String(existing.date ?? "") === String(candidate.date ?? "") &&
  String(existing.source ?? "") === String(candidate.source ?? "") &&
  String(existing.beritaAcaraDate ?? "") === String(candidate.beritaAcaraDate ?? "");

export const planBeritaAcaraExpenseSync = ({
  date,
  rows,
  existingCashFlows = [],
  user = null,
}: {
  date: string;
  rows: BeritaAcaraExpenseRow[];
  existingCashFlows?: CashFlow[];
  user?: BeritaAcaraSyncUser | null;
}): BeritaAcaraExpensePlan => {
  const empty: BeritaAcaraExpensePlan = {
    upserts: [],
    orphanIds: [],
    skipped: 0,
    blockedRemovals: [],
    unchanged: 0,
    totalAmount: 0,
  };
  if (!date || !Array.isArray(rows)) return empty;

  const existingById = new Map<string, CashFlow>();
  existingCashFlows.forEach((cf) => {
    if (cf?.id) existingById.set(String(cf.id), cf);
  });

  const isAdmin = ADMIN_ROLES.includes(String(user?.role ?? ""));
  const uid = user?.id ? String(user.id) : "";
  const userName = user?.name || user?.username || "";

  const keptIds = new Set<string>();
  const upserts: CashFlow[] = [];
  let skipped = 0;
  let unchanged = 0;
  let totalAmount = 0;

  rows.forEach((row, index) => {
    const amount = resolveBeritaAcaraExpenseAmount(row);
    if (amount <= 0) return;

    const docId = resolveDocId(date, row, existingById, index);
    keptIds.add(docId);

    const existing = existingById.get(docId);
    const isForeignEntry = !!existing && existing.source !== BA_EXPENSE_SOURCE;

    // Aturan Firestore hanya mengizinkan non-admin mengubah catatan kas
    // miliknya sendiri yang bersumber dari Berita Acara. Baris lain
    // dilewati di sini supaya satu baris tidak menggagalkan semuanya.
    if (existing && !isAdmin) {
      const isOwnBaEntry =
        existing.source === BA_EXPENSE_SOURCE &&
        uid !== "" &&
        String(existing.userId ?? "") === uid;
      if (!isOwnBaEntry) {
        skipped += 1;
        return;
      }
    }

    const category =
      cleanExpenseCategoryLabel(row.category) || "Beban Operasional Lain-lain";
    const description = String(row.keterangan ?? "").trim() || category;

    totalAmount += amount;

    const candidate = {
      id: docId,
      // Jam dipertahankan bila dokumennya sudah ada pada tanggal yang
      // sama, supaya urutan catatan kas tidak teracak setiap simpan.
      date:
        existing?.date && String(existing.date).startsWith(date)
          ? existing.date
          : `${date} 00:00:00`,
      type: CashFlowType.OUT,
      category,
      description,
      amount,
      paymentMethod:
        (existing?.paymentMethod as PaymentMethod) || PaymentMethod.CASH,
      userId: existing?.userId || uid || undefined,
      userName: existing?.userName || userName || undefined,
      // Dokumen milik modul lain TIDAK dilabeli ulang: label inilah yang
      // menentukan apa yang boleh dihapus otomatis di bawah.
      source: isForeignEntry ? existing?.source : BA_EXPENSE_SOURCE,
      beritaAcaraDate: isForeignEntry ? existing?.beritaAcaraDate : date,
    } as CashFlow;

    // Baris yang isinya sudah sama persis tidak ditulis ulang. Tanpa
    // penyaringan ini, auto-save Berita Acara mengirim ulang SEMUA
    // baris pengeluaran setiap kali ada ketikan di halaman itu.
    if (existing && isSameEntry(existing, candidate)) {
      unchanged += 1;
      return;
    }

    upserts.push(candidate);
  });

  const isOwnerUp = OWNER_ROLES.includes(String(user?.role ?? ""));

  const orphanCandidates = existingCashFlows.filter((cf) => {
    if (!cf?.id) return false;
    const id = String(cf.id);
    if (keptIds.has(id)) return false;

    const isBaEntry =
      cf.source === BA_EXPENSE_SOURCE || id.startsWith(`ba_${date}_`);
    if (!isBaEntry) return false;

    return (
      String(cf.beritaAcaraDate ?? "") === date ||
      id.startsWith(`ba_${date}_`)
    );
  });

  // Kewenangan hapus harus diperiksa DI SINI, bukan diserahkan ke
  // server. Firestore menolak penghapusan di luar wewenang dengan
  // "Missing or insufficient permissions", dan penolakan itu muncul
  // sebagai kegagalan sinkronisasi padahal datanya sendiri tidak
  // bermasalah. Aturannya disamakan dengan firestore.rules: OWNER ke
  // atas boleh apa pun; Admin boleh membersihkan cerminan Berita
  // Acara; petugas lain hanya cerminan miliknya sendiri.
  const orphanIds: string[] = [];
  const blockedRemovals: string[] = [];
  orphanCandidates.forEach((cf) => {
    const id = String(cf.id);
    const isBaSourced = cf.source === BA_EXPENSE_SOURCE;
    const isOwnEntry = uid !== "" && String(cf.userId ?? "") === uid;
    const mayDelete =
      isOwnerUp || (isBaSourced && (isAdmin || isOwnEntry));
    if (mayDelete) {
      orphanIds.push(id);
    } else {
      blockedRemovals.push(id);
    }
  });

  return {
    upserts,
    orphanIds,
    skipped,
    blockedRemovals,
    unchanged,
    totalAmount,
  };
};

/**
 * Cari dugaan penghitungan dobel pada daftar beban operasional.
 *
 * Sebelum Beban Operasional (OPEX) terambil otomatis dari Berita
 * Acara, biaya yang sama kemungkinan diinput ulang secara manual
 * supaya muncul di Laporan Bulanan. Setelah pengambilan otomatis
 * menyala, input manual itu menjadi kembaran yang menggandakan nilai.
 *
 * Yang ditandai hanyalah baris NON-Berita-Acara yang tanggal dan
 * nominalnya sama persis dengan baris asal Berita Acara, dipasangkan
 * satu lawan satu — dua pengeluaran manual bernominal sama tidak
 * ditandai dua kali bila hanya ada satu baris Berita Acara yang cocok.
 * Baris Berita Acara sendiri tidak pernah ditandai, karena baris itulah
 * yang dianggap sumber kebenaran.
 */
export const findSuspectedDuplicateOpex = (
  entries: CashFlow[],
): { ids: Set<string>; count: number; amount: number } => {
  const list = Array.isArray(entries) ? entries : [];
  const keyOf = (cf: CashFlow) =>
    `${String(cf.date ?? "").slice(0, 10)}|${Number(cf.amount) || 0}`;

  const beritaAcaraTally = new Map<string, number>();
  list.forEach((cf) => {
    if (!cf || cf.source !== BA_EXPENSE_SOURCE) return;
    const key = keyOf(cf);
    beritaAcaraTally.set(key, (beritaAcaraTally.get(key) || 0) + 1);
  });

  const ids = new Set<string>();
  let amount = 0;
  list.forEach((cf) => {
    if (!cf?.id || cf.source === BA_EXPENSE_SOURCE) return;
    const key = keyOf(cf);
    const remaining = beritaAcaraTally.get(key) || 0;
    if (remaining > 0) {
      beritaAcaraTally.set(key, remaining - 1);
      ids.add(String(cf.id));
      amount += Number(cf.amount) || 0;
    }
  });

  return { ids, count: ids.size, amount };
};
