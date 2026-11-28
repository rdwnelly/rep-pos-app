import type { Category } from '../types';
import {
  CategoryReportGroup,
  REPORT_GROUP_LABEL,
  VisitorServiceType,
} from '../types';

/**
 * Satu-satunya tempat unit usaha diterjemahkan menjadi baris laporan dan
 * jenis layanan kunjungan.
 *
 * Sebelumnya logika ini ada dalam tiga salinan — Berita Acara, Laporan
 * Bulanan, dan POS — yang masing-masing mencocokkan potongan nama
 * unit usaha. Salinan di Berita Acara dan Laporan Bulanan sudah nyaris
 * identik tetapi tidak persis, dan tidak ada yang menjamin ketiganya
 * tetap sejalan.
 *
 * Urutan penentuan:
 *   1. Pakai `reportGroup` / `visitorService` pada dokumen unit usaha.
 *   2. Bila belum disetel, jatuh kembali ke pencocokan nama LAMA.
 *
 * Langkah kedua membuat seluruh data yang sudah ada berjalan persis
 * seperti sebelumnya, sehingga penyetelan unit usaha dapat dilakukan
 * bertahap tanpa mengubah satu pun angka laporan.
 */

/** Pencocokan nama warisan. Dipertahankan apa adanya demi kesetaraan perilaku. */
export const legacyGroupFromName = (catName: string): CategoryReportGroup | null => {
  const lower = (catName || '').toLowerCase().trim();
  // Teks lama "tanpa kategori" tetap dikenali di samping istilah barunya
  // "tanpa unit usaha": data lama menyimpan teks itu pada categoryName, dan
  // mengubah pencocoknya saja akan memindahkan pendapatannya ke baris lain
  // tanpa peringatan.
  if (!lower || lower === 'umum' || lower === 'tanpa kategori' || lower === 'tanpa unit usaha') {
    return CategoryReportGroup.TOKO_SOUVENIR;
  }
  if (lower.includes('sewa kostum keluar') || lower.includes('kostum keluar')) return CategoryReportGroup.SEWA_KOSTUM_KELUAR;
  if (lower.includes('taman etnik') || lower.includes('taman') || lower.includes('tiket') || lower.includes('sewa kostum') || lower.includes('kostum')) return CategoryReportGroup.TAMAN_ETNIK;
  if (lower.includes('toko') || lower.includes('souvenir') || lower.includes('sovenir')) return CategoryReportGroup.TOKO_SOUVENIR;
  if (lower.includes('kafe') || lower.includes('cafe') || lower.includes('resto')) return CategoryReportGroup.KAFE_RESTO;
  if (lower.includes('kios')) return CategoryReportGroup.KIOS;
  if (lower.includes('sopendo') || lower.includes('saswar') || lower.includes('edukasi')) return CategoryReportGroup.PAKET_EDUKASI;
  if (lower.includes('fotografer') || lower.includes('foto')) return CategoryReportGroup.JASA_FOTOGRAFER;
  return null;
};

const findCategory = (catName: string, categories?: Category[]): Category | undefined => {
  if (!categories || categories.length === 0) return undefined;
  const lower = (catName || '').toLowerCase().trim();
  return categories.find(c => (c.name || '').toLowerCase().trim() === lower);
};

/**
 * Nama baris laporan untuk sebuah unit usaha.
 *
 * Unit usaha yang tidak dikenali tetap mengembalikan namanya sendiri,
 * sehingga muncul sebagai baris baru pada laporan — persis seperti
 * perilaku lama.
 */
export const resolveReportRowName = (catName: string, categories?: Category[]): string => {
  const explicit = findCategory(catName, categories)?.reportGroup;
  if (explicit) return REPORT_GROUP_LABEL[explicit];

  const legacy = legacyGroupFromName(catName);
  if (legacy) return REPORT_GROUP_LABEL[legacy];

  return catName;
};

/** Kelompok laporan sebagai nilai enum, untuk kebutuhan selain pencetakan. */
export const resolveReportGroup = (catName: string, categories?: Category[]): CategoryReportGroup => {
  const explicit = findCategory(catName, categories)?.reportGroup;
  if (explicit) return explicit;
  return legacyGroupFromName(catName) ?? CategoryReportGroup.LAINNYA;
};

/** Pencocokan nama warisan untuk layanan kunjungan. */
export const legacyVisitorServiceFromName = (catName: string): VisitorServiceType | null => {
  const cat = (catName || '').toLowerCase();
  // Kostum didahulukan: unit usahanya kadang memuat kata "taman", yang
  // kalau diperiksa belakangan akan terbaca sebagai tiket masuk.
  if (cat.includes('kostum')) return VisitorServiceType.SEWA_KOSTUM;
  if (cat.includes('homestay') || cat.includes('penginapan') || cat.includes('kamar')) return VisitorServiceType.HOMESTAY;
  if (cat.includes('paket') || cat.includes('sopendo') || cat.includes('saswar') || cat.includes('edukasi') || cat.includes('tour')) return VisitorServiceType.PAKET_TOUR;
  if (cat.includes('tiket') || cat.includes('taman') || cat.includes('masuk')) return VisitorServiceType.TIKET_MASUK;
  return null;
};

/**
 * Jenis layanan kunjungan untuk sebuah unit usaha, atau null bila
 * penjualannya tidak menandakan ada tamu berkunjung.
 */
export const resolveVisitorService = (
  catName: string,
  categories?: Category[],
  itemName?: string,
): VisitorServiceType | null => {
  const found = findCategory(catName, categories);

  let dariKategori: VisitorServiceType | null;
  if (found && found.visitorService) {
    dariKategori = found.visitorService;
  } else if (found && 'visitorService' in found) {
    // Unit usaha yang sudah disetel tetapi sengaja dikosongkan jenis
    // layanannya tidak boleh jatuh ke tebakan nama.
    dariKategori = null;
  } else {
    dariKategori = legacyVisitorServiceFromName(catName);
  }

  // Unit usaha yang bukan layanan kunjungan berhenti di sini. Nama produk
  // TIDAK boleh memunculkan layanan dari ketiadaan: menu "Paket Nasi
  // Goreng" di unit usaha Kafe & Resto bukan paket wisata.
  if (!dariKategori) return null;

  // Bila unit usahanya memang layanan kunjungan, nama produk dipakai untuk
  // MEMPERTAJAM jenisnya. Satu baris bernama "Sewa Kostum" adalah sewa
  // kostum, di unit usaha mana pun ia diletakkan.
  //
  // Tanpa ini, produk kostum yang dititipkan ke unit usaha "Taman Etnik"
  // terbaca sebagai tiket masuk — sehingga 3 tiket + 3 kostum dihitung
  // 6 pengunjung, padahal orangnya tiga.
  if (itemName) {
    const dariNama = legacyVisitorServiceFromName(itemName);
    if (dariNama) return dariNama;
  }

  return dariKategori;
};
