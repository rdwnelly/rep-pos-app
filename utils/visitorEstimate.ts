import type { Category, CartItem, Transaction, VisitorLog } from '../types';
import {
  TransactionType,
  VisitorOrigin,
  VisitorSegment,
  VisitorServiceType,
} from '../types';
import { resolveVisitorService } from './categoryMapping';

/**
 * Menurunkan jumlah pengunjung dari penjualan tiket.
 *
 * Dipakai dua tempat: POS (saat transaksi berjalan) dan layar Data
 * Pengunjung (merekap periode yang sudah lewat). Keduanya WAJIB memakai
 * rumus yang sama — kalau tidak, angka kunjungan hasil rekap tidak akan
 * cocok dengan yang dicatat kasir pada hari yang sama.
 */

/**
 * HANYA tiket masuk yang menjadi dasar jumlah pengunjung.
 *
 * Satu tiket masuk = satu orang yang benar-benar datang, dan itulah
 * satu-satunya penjualan yang bisa dibaca begitu. Layanan lain tidak
 * memenuhi syarat itu, masing-masing dengan alasannya sendiri:
 *
 * - Sewa kostum adalah layanan TAMBAHAN bagi tamu yang sudah masuk.
 *   Menghitungnya sebagai pengunjung berarti menghitung orang yang
 *   sama dua kali — sekali dari tiketnya, sekali dari kostumnya.
 * - Satu paket tour atau paket edukasi bisa untuk 30 peserta; qty-nya
 *   menghitung paket, bukan orang.
 * - Satu baris homestay berarti malam atau kamar, bukan jumlah tamu.
 *
 * Untuk semua itu, petugas yang mengisi jumlah sebenarnya lewat
 * pencatatan kunjungan.
 */
export const PAX_FROM_QTY: VisitorServiceType[] = [
  VisitorServiceType.TIKET_MASUK,
];

export interface VisitorServiceAnalysis {
  serviceTypes: VisitorServiceType[];
  suggestedPax: number;
  revenue: number;
  soldSummary: string;
}

/** Analisis satu keranjang / daftar item transaksi. */
export const analyzeVisitorServices = (
  items: CartItem[],
  categories: Category[],
): VisitorServiceAnalysis => {
  const services = new Set<VisitorServiceType>();
  const terjual: string[] = [];
  let suggestedPax = 0;
  let revenue = 0;

  items.forEach(item => {
    const jenis = resolveVisitorService(item.categoryName || '', categories);
    if (!jenis) return;

    const qty = Number(item.qty) || 0;
    services.add(jenis);
    revenue += (Number(item.finalPrice) || 0) * qty;
    terjual.push(`${item.name} ×${qty}`);
    if (PAX_FROM_QTY.includes(jenis)) suggestedPax += qty;
  });

  return {
    serviceTypes: [...services],
    suggestedPax,
    revenue,
    soldSummary: terjual.join(', '),
  };
};

/**
 * Tiket anak dikenali dari nama produknya. Hanya ini satu-satunya
 * petunjuk dewasa/anak yang ada pada data transaksi; bila penamaan
 * produk tidak membedakannya, seluruh pax dihitung dewasa.
 */
const CHILD_HINTS = ['anak', 'child', 'balita', 'pelajar', 'siswa'];

export const isChildTicketName = (name: string): boolean => {
  const lower = (name || '').toLowerCase();
  return CHILD_HINTS.some(h => lower.includes(h));
};

export interface DailyVisitorEstimate {
  /** "YYYY-MM-DD" */
  day: string;
  /** Pengunjung yang akan dicatat: tiket hari itu DIKURANGI yang sudah dicatat petugas. */
  paxTotal: number;
  paxAdult: number;
  paxChild: number;
  ticketRevenue: number;
  transactionCount: number;
  serviceTypes: VisitorServiceType[];
  /** Ringkasan item tiket yang menjadi dasar angka ini. */
  soldSummary: string;
  /** Seluruh pengunjung menurut tiket yang terjual hari itu. */
  paxFromTickets: number;
  /** Sudah dicatat petugas pada hari itu, di luar baris estimasi. */
  paxAlreadyLogged: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Ambil bagian tanggal dari nilai `date` apa pun yang dipakai aplikasi. */
export const dayOf = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

/**
 * Rekap estimasi pengunjung per hari dari transaksi penjualan.
 *
 * Retur dikurangkan, bukan diabaikan: tiket yang dibatalkan berarti
 * tamunya tidak jadi berkunjung.
 */
export const estimateVisitorsFromTransactions = ({
  transactions,
  categories,
  existingLogs = [],
}: {
  transactions: Transaction[];
  categories: Category[];
  existingLogs?: VisitorLog[];
}): DailyVisitorEstimate[] => {
  /**
   * Pengunjung yang SUDAH dicatat petugas per hari.
   *
   * Baris hasil estimasi sendiri sengaja tidak dihitung: id-nya
   * deterministik per hari, jadi penyimpanan ulang memperbarui baris
   * yang sama. Kalau ikut dihitung, setiap penyimpanan ulang akan
   * mengurangi angkanya sendiri sampai habis.
   */
  const loggedPerDay = new Map<string, number>();
  existingLogs.forEach(l => {
    if (l?.source === VISITOR_SOURCE_ESTIMATE) return;
    const day = dayOf(l?.date);
    if (!day) return;
    loggedPerDay.set(day, (loggedPerDay.get(day) || 0) + (Number(l?.paxTotal) || 0));
  });

  const byDay = new Map<string, DailyVisitorEstimate & { services: Set<VisitorServiceType>; sold: string[] }>();

  transactions.forEach(tx => {
    const day = dayOf(tx?.date);
    if (!day || !Array.isArray(tx.items)) return;

    const isReturn = tx.type === TransactionType.RETURN;
    const sign = isReturn ? -1 : 1;

    let paxAdult = 0;
    let paxChild = 0;
    let revenue = 0;
    const services = new Set<VisitorServiceType>();
    const sold: string[] = [];

    tx.items.forEach((item: any) => {
      const jenis = resolveVisitorService(item?.categoryName || '', categories);
      // Baris estimasi mewakili orang yang masuk lewat tiket, jadi
      // layanan lain tidak ikut — baik jumlah, pendapatan, maupun
      // jenis layanannya.
      if (!jenis || !PAX_FROM_QTY.includes(jenis)) return;

      const qty = Number(item?.qty) || 0;
      if (qty <= 0) return;

      services.add(jenis);
      revenue += (Number(item?.finalPrice) || 0) * qty * sign;
      sold.push(`${item?.name ?? 'Item'} ×${qty}`);

      if (isChildTicketName(item?.name || '')) paxChild += qty * sign;
      else paxAdult += qty * sign;
    });

    if (paxAdult === 0 && paxChild === 0 && revenue === 0) return;

    const entry = byDay.get(day) ?? {
      day,
      paxTotal: 0,
      paxAdult: 0,
      paxChild: 0,
      ticketRevenue: 0,
      transactionCount: 0,
      serviceTypes: [],
      soldSummary: '',
      paxFromTickets: 0,
      paxAlreadyLogged: 0,
      services: new Set<VisitorServiceType>(),
      sold: [],
    };

    entry.paxAdult += paxAdult;
    entry.paxChild += paxChild;
    entry.ticketRevenue += revenue;
    entry.transactionCount += 1;
    services.forEach(s => entry.services.add(s));
    entry.sold.push(...sold);
    byDay.set(day, entry);
  });

  return Array.from(byDay.values())
    .map(e => {
      // Retur bisa membuat salah satu sisi negatif; angka pengunjung
      // tidak boleh negatif.
      const adultTiket = Math.max(0, e.paxAdult);
      const childTiket = Math.max(0, e.paxChild);
      const paxFromTickets = adultTiket + childTiket;

      // Yang dicatat hanyalah SELISIHNYA terhadap catatan petugas.
      // Melewati hari itu sepenuhnya — seperti perilaku sebelumnya —
      // membuang tiket yang belum terwakili; memasukkan seluruhnya
      // menghitung tamu yang sama dua kali. Selisih menjawab keduanya.
      const paxAlreadyLogged = loggedPerDay.get(e.day) || 0;
      const sisa = Math.max(0, paxFromTickets - paxAlreadyLogged);

      // Rincian usia dibagi menurut proporsi tiketnya, dan sisanya
      // dilimpahkan ke anak supaya jumlahnya persis sama dengan total
      // — syarat keras firestore.rules.
      const adult = paxFromTickets > 0 ? Math.round((sisa * adultTiket) / paxFromTickets) : 0;
      const paxAdultSisa = Math.min(adult, sisa);

      return {
        day: e.day,
        paxTotal: sisa,
        paxAdult: paxAdultSisa,
        paxChild: sisa - paxAdultSisa,
        ticketRevenue: Math.max(0, e.ticketRevenue),
        transactionCount: e.transactionCount,
        serviceTypes: [...e.services],
        soldSummary: e.sold.slice(0, 6).join(', ') + (e.sold.length > 6 ? `, +${e.sold.length - 6} lainnya` : ''),
        paxFromTickets,
        paxAlreadyLogged,
      };
    })
    .filter(e => e.paxTotal > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
};

/** Penanda bahwa baris kunjungan berasal dari estimasi, bukan pencatatan. */
export const VISITOR_SOURCE_ESTIMATE = 'ESTIMASI_TIKET';

/**
 * Asal daerah dan segmentasi TIDAK ADA pada data transaksi, padahal
 * keduanya wajib pada laporan kunjungan. Nilainya diisi penanda
 * eksplisit, bukan ditebak: mengisi "Papua Barat Daya" atau "UMUM"
 * seolah-olah itu fakta akan merusak rekap asal pengunjung tanpa ada
 * yang menyadarinya.
 *
 * Teksnya sengaja pendek dan netral, karena ikut tercetak sebagai
 * baris daerah asal pada laporan resmi yang diserahkan ke instansi.
 */
export const ESTIMATE_UNKNOWN_REGION = 'BELUM DIDATA';

/** Ubah satu baris estimasi harian menjadi dokumen VisitorLog. */
export const estimateToVisitorLog = (
  estimate: DailyVisitorEstimate,
  recordedBy: { id: string; name: string },
): VisitorLog => ({
  // Id deterministik per hari: menyimpan ulang memperbarui baris yang
  // sama, tidak menumpuk duplikat.
  id: `est_${estimate.day}`,
  date: `${estimate.day} 12:00:00`,
  groupName: `Estimasi dari penjualan tiket (${estimate.transactionCount} transaksi)`,
  originType: VisitorOrigin.NUSANTARA,
  originRegion: ESTIMATE_UNKNOWN_REGION,
  segment: VisitorSegment.UMUM,
  paxTotal: estimate.paxTotal,
  paxAdult: estimate.paxAdult,
  paxChild: estimate.paxChild,
  serviceTypes: estimate.serviceTypes,
  ticketRevenue: estimate.ticketRevenue,
  recordedById: recordedBy.id,
  recordedByName: recordedBy.name,
  source: VISITOR_SOURCE_ESTIMATE,
});
