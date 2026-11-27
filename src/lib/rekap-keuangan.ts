/**
 * Rekap keuangan harian per unit usaha untuk Sistem Informasi Keuangan REP (SIK-REP).
 *
 * Modul ini MURNI (tanpa Firestore) agar mudah diuji. Endpoint
 * app/api/portal/rekap-keuangan memuat data lalu memanggil susunRekapKeuangan().
 *
 * Aturan perhitungan:
 * - Unit usaha = kelompok laporan kategori (resolveReportGroup), sama dengan Laporan Bulanan POS.
 * - Pendapatan bersih transaksi = totalAmount (sudah setelah diskon), dibagi ke unit
 *   sebanding nilai item (finalPrice × qty) masing-masing unit.
 * - Pembayaran diambil dari paymentHistory (memuat pembayaran awal dan cicilan),
 *   dibatasi kumulatif sebesar total tagihan agar uang kembalian tidak ikut terhitung.
 * - Pembayaran pada hari transaksi = "dibayar langsung" (tunai / non-tunai);
 *   sisanya = "piutang baru" (BON/tempo).
 * - Pembayaran pada hari setelahnya = "pelunasan piutang" di tanggal pembayaran.
 * - Retur (type RETURN) = pengurangan pendapatan unit pada tanggal retur.
 */

export const REKAP_CONTRACT_VERSION = 1;

export interface ItemLite {
  categoryName?: string;
  finalPrice?: number;
  price?: number;
  qty?: number;
}

export interface PaymentLite {
  date?: string;
  amount?: number;
  method?: string;
}

export interface TxLite {
  id: string;
  type?: string;
  date?: string;
  items?: ItemLite[];
  totalAmount?: number;
  paymentMethod?: string;
  paymentHistory?: PaymentLite[];
}

export interface RekapUnit {
  kode: string;
  label: string;
  /** Nilai item sebelum diskon transaksi */
  kotor: number;
  diskon: number;
  retur: number;
  /** kotor − diskon − retur */
  bersih: number;
  /** Dibayar pada hari transaksi */
  tunai: number;
  nonTunai: number;
  /** Belum dibayar pada hari transaksi (BON / tempo) */
  piutangBaru: number;
  jumlahTransaksi: number;
}

export interface RekapHari {
  tanggal: string;
  unit: RekapUnit[];
  pelunasanPiutang: { tunai: number; nonTunai: number; total: number };
}

const TOKO_TZ = 'Asia/Jayapura';

/** Hari kalender toko (WIT) dari string tanggal POS: format kanonik "YYYY-MM-DD HH:mm:ss" atau ISO lama. */
export const hariToko = (s?: string): string => {
  if (!s) return '';
  const str = String(s).trim();
  // ISO dengan zona (format lama, mis. "2026-08-31T14:00:00.000Z"): konversi ke WIT
  if (/T.*(Z|[+-]\d\d:?\d\d)$/.test(str)) {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str.slice(0, 10);
    return new Intl.DateTimeFormat('en-CA', { timeZone: TOKO_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  return str.slice(0, 10);
};

const kelompokMetode = (m?: string): 'tunai' | 'nonTunai' => {
  const x = (m || '').toString().toUpperCase();
  if (x.includes('QRIS') || x.includes('TRANSFER') || x.includes('BANK') || x.includes('WALLET')) return 'nonTunai';
  return 'tunai'; // CASH, TUNAI, kosong, dan DP pada transaksi BON dianggap tunai
};

/** Bagi `total` ke kunci-kunci sebanding `bobot`, hasil bilangan bulat yang jumlahnya tepat `total`. */
export const bagiProporsional = (total: number, bobot: Map<string, number>): Map<string, number> => {
  const hasil = new Map<string, number>();
  const kunci = [...bobot.keys()];
  const sumBobot = kunci.reduce((a, k) => a + (bobot.get(k) || 0), 0);
  if (kunci.length === 0) return hasil;
  if (sumBobot <= 0) {
    hasil.set(kunci[0], total);
    kunci.slice(1).forEach((k) => hasil.set(k, 0));
    return hasil;
  }
  let terpakai = 0;
  let terbesar = kunci[0];
  kunci.forEach((k) => {
    const v = Math.round((total * (bobot.get(k) || 0)) / sumBobot);
    hasil.set(k, v);
    terpakai += v;
    if ((bobot.get(k) || 0) > (bobot.get(terbesar) || 0)) terbesar = k;
  });
  hasil.set(terbesar, (hasil.get(terbesar) || 0) + (total - terpakai)); // sisa pembulatan
  return hasil;
};

/** Pembayaran efektif (dibatasi total tagihan), urut tanggal. */
const pembayaranEfektif = (t: TxLite, total: number) => {
  const urut = [...(t.paymentHistory || [])]
    .filter((p) => p && (Number(p.amount) || 0) > 0)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let kumulatif = 0;
  const out: { hari: string; jumlah: number; metode: 'tunai' | 'nonTunai' }[] = [];
  for (const p of urut) {
    const sisa = total - kumulatif;
    if (sisa <= 0) break;
    const jumlah = Math.min(Number(p.amount) || 0, sisa);
    kumulatif += jumlah;
    out.push({ hari: hariToko(p.date || t.date), jumlah, metode: kelompokMetode(p.method || t.paymentMethod) });
  }
  return out;
};

const unitKosong = (kode: string, label: string): RekapUnit => ({
  kode, label, kotor: 0, diskon: 0, retur: 0, bersih: 0, tunai: 0, nonTunai: 0, piutangBaru: 0, jumlahTransaksi: 0,
});

/**
 * @param transaksiPeriode transaksi (SALE & RETURN) bertanggal di dalam rentang
 * @param transaksiPiutang transaksi BON/tempo (tanggal berapa pun) untuk mencari pelunasan di dalam rentang
 * @param dari, sampai      rentang hari "YYYY-MM-DD" inklusif (zona toko)
 * @param kelompokDari      memetakan nama kategori → { kode, label } unit usaha
 */
export const susunRekapKeuangan = (
  transaksiPeriode: TxLite[],
  transaksiPiutang: TxLite[],
  dari: string,
  sampai: string,
  kelompokDari: (namaKategori: string) => { kode: string; label: string },
): RekapHari[] => {
  const hari = new Map<string, { unit: Map<string, RekapUnit>; pelunasan: { tunai: number; nonTunai: number } }>();
  const ambilHari = (tgl: string) => {
    if (!hari.has(tgl)) hari.set(tgl, { unit: new Map(), pelunasan: { tunai: 0, nonTunai: 0 } });
    return hari.get(tgl)!;
  };
  const dalamRentang = (tgl: string) => tgl >= dari && tgl <= sampai;
  const label = new Map<string, string>();

  // Bobot nilai item per unit untuk satu transaksi
  const bobotUnit = (t: TxLite) => {
    const bobot = new Map<string, number>();
    (t.items || []).forEach((it) => {
      const k = kelompokDari((it.categoryName || '').trim());
      label.set(k.kode, k.label);
      const nilai = (Number(it.finalPrice ?? it.price) || 0) * (Number(it.qty) || 1);
      bobot.set(k.kode, (bobot.get(k.kode) || 0) + nilai);
    });
    if (bobot.size === 0) {
      const k = kelompokDari('');
      label.set(k.kode, k.label);
      bobot.set(k.kode, 0);
    }
    return bobot;
  };

  const sudah = new Set<string>();
  for (const t of transaksiPeriode) {
    if (!t?.id || sudah.has(t.id)) continue;
    sudah.add(t.id);
    const tgl = hariToko(t.date);
    if (!dalamRentang(tgl)) continue;
    const h = ambilHari(tgl);
    const bobot = bobotUnit(t);
    const unit = (kode: string) => {
      if (!h.unit.has(kode)) h.unit.set(kode, unitKosong(kode, label.get(kode) || kode));
      return h.unit.get(kode)!;
    };

    if ((t.type || 'SALE') === 'RETURN') {
      const nilaiRetur = Math.abs(Number(t.totalAmount) || 0);
      bagiProporsional(nilaiRetur, bobot).forEach((v, k) => {
        unit(k).retur += v;
      });
      continue;
    }

    const total = Math.max(0, Number(t.totalAmount) || 0);
    const bersihPerUnit = bagiProporsional(total, bobot);
    const sumBobot = [...bobot.values()].reduce((a, b) => a + b, 0);
    bobot.forEach((nilaiItem, k) => {
      const u = unit(k);
      const kotor = sumBobot > 0 ? Math.round(nilaiItem) : bersihPerUnit.get(k) || 0;
      u.kotor += kotor;
      u.diskon += kotor - (bersihPerUnit.get(k) || 0);
      u.jumlahTransaksi += 1;
    });

    // Pembayaran pada hari transaksi (atau sebelumnya, mis. DP)
    const bayar = pembayaranEfektif(t, total);
    const langsung = { tunai: 0, nonTunai: 0 };
    bayar.filter((p) => p.hari <= tgl).forEach((p) => {
      langsung[p.metode] += p.jumlah;
    });
    const piutang = total - langsung.tunai - langsung.nonTunai;
    bagiProporsional(langsung.tunai, bersihPerUnit).forEach((v, k) => { unit(k).tunai += v; });
    bagiProporsional(langsung.nonTunai, bersihPerUnit).forEach((v, k) => { unit(k).nonTunai += v; });
    bagiProporsional(piutang, bersihPerUnit).forEach((v, k) => { unit(k).piutangBaru += v; });
  }

  // Pelunasan piutang: pembayaran setelah hari transaksi yang jatuh di dalam rentang
  const sudahPiutang = new Set<string>();
  for (const t of [...transaksiPeriode, ...transaksiPiutang]) {
    if (!t?.id || sudahPiutang.has(t.id) || (t.type || 'SALE') === 'RETURN') continue;
    sudahPiutang.add(t.id);
    const tglJual = hariToko(t.date);
    const total = Math.max(0, Number(t.totalAmount) || 0);
    pembayaranEfektif(t, total)
      .filter((p) => p.hari > tglJual && dalamRentang(p.hari))
      .forEach((p) => {
        ambilHari(p.hari).pelunasan[p.metode] += p.jumlah;
      });
  }

  return [...hari.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tanggal, h]) => ({
      tanggal,
      unit: [...h.unit.values()]
        .map((u) => ({ ...u, bersih: u.kotor - u.diskon - u.retur }))
        .sort((a, b) => b.bersih - a.bersih),
      pelunasanPiutang: { ...h.pelunasan, total: h.pelunasan.tunai + h.pelunasan.nonTunai },
    }));
};

// ============================================================================
// PENGELUARAN (kas keluar) — biaya operasional Berita Acara & kas keluar manual
// ============================================================================

export interface KasLite {
  id: string;
  type?: string;
  date?: string;
  category?: string;
  description?: string;
  amount?: number;
  paymentMethod?: string;
  source?: string;
}

export interface Pengeluaran {
  /** ID dokumen cashflow (stabil; baris Berita Acara: ba_<tanggal>_<baris>) */
  id: string;
  tanggal: string;
  kategori: string;
  keterangan: string;
  jumlah: number;
  metode: 'tunai' | 'nonTunai';
  /** true bila baris dialirkan dari "Rincian Pengeluaran Operasional" Berita Acara */
  beritaAcara: boolean;
}

/**
 * Kas keluar (type KELUAR) dalam rentang, apa adanya per dokumen.
 * Klasifikasi ke akun biaya dilakukan di sisi SIK-REP agar pemetaannya bisa diatur di sana.
 */
export const susunPengeluaran = (kas: KasLite[], dari: string, sampai: string): Pengeluaran[] =>
  kas
    .filter((c) => c && (c.type || '').toUpperCase() === 'KELUAR' && (Number(c.amount) || 0) > 0)
    .map((c) => ({
      id: c.id,
      tanggal: hariToko(c.date),
      kategori: String(c.category || '').replace(/^\d+\)\s*/, '').trim() || 'Operasional Lain-lain',
      keterangan: String(c.description || '').trim(),
      jumlah: Math.round(Number(c.amount) || 0),
      metode: kelompokMetode(c.paymentMethod),
      beritaAcara: c.source === 'BERITA_ACARA' || String(c.id).startsWith('ba_'),
    }))
    .filter((p) => p.tanggal >= dari && p.tanggal <= sampai)
    .sort((a, b) => (a.tanggal === b.tanggal ? a.id.localeCompare(b.id) : a.tanggal.localeCompare(b.tanggal)));
