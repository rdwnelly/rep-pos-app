import {
  LayoutDashboard, ShoppingCart, Package, Receipt, Settings, Users,
  Barcode, ShoppingBag, UserCheck, Truck, ArrowRightLeft, Undo2, ClipboardCheck,
  Info, FileText, UsersRound, Building2, BadgePercent, FileClock,
  type LucideIcon,
} from 'lucide-react';
import { UserRole } from '../types';

export interface NavItem {
  id: string;
  label: string;
  /** Label pendek untuk bilah navigasi bawah di HP (maks ~9 huruf). */
  short?: string;
  icon: LucideIcon;
}

/**
 * Satu-satunya daftar menu aplikasi.
 *
 * Sidebar dan bilah navigasi bawah membacanya dari sini. Sebelumnya
 * daftarnya ditulis di dalam Layout, jadi menambah bilah bawah berarti
 * membuat salinan kedua — pola yang sudah pernah menyusahkan di
 * `pageMap` (salinannya melenceng: tiga halaman hilang tanpa ada yang
 * sadar). Sekali tulis di sini, keduanya pasti sepakat.
 */
const SEMUA: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Dasbor', icon: LayoutDashboard },
  { id: 'pos', label: 'Kasir (POS)', short: 'Kasir', icon: ShoppingCart },
  { id: 'berita-acara', label: 'Berita Acara', short: 'Setoran', icon: FileText },
  { id: 'products', label: 'Produk', short: 'Produk', icon: Package },
  { id: 'transactions', label: 'Riwayat & Utang', short: 'Riwayat', icon: Receipt },
  { id: 'people', label: 'Kontak', short: 'Kontak', icon: Users },
  { id: 'monthly_report', label: 'Laporan Bulanan', short: 'Laporan', icon: Building2 },
  { id: 'travel_commission', label: 'Komisi Agen', short: 'Komisi', icon: BadgePercent },
  { id: 'visitor_data', label: 'Data Pengunjung', short: 'Tamu', icon: UsersRound },
  { id: 'customer_history', label: 'Riwayat Pelanggan', short: 'Pelanggan', icon: UserCheck },
  { id: 'supplier_history', label: 'Riwayat Supplier', short: 'Supplier', icon: Truck },
  { id: 'real_stock_check', label: 'Pengecekan Stok', short: 'Cek Stok', icon: ClipboardCheck },
  { id: 'sold_items', label: 'Barang Terjual', short: 'Terjual', icon: ShoppingBag },
];

const TAMBAHAN_ADMIN: NavItem[] = [
  { id: 'transfer_history', label: 'Riwayat Transfer', short: 'Transfer', icon: ArrowRightLeft },
  { id: 'return_history', label: 'Riwayat Retur', short: 'Retur', icon: Undo2 },
  { id: 'barcode', label: 'Cetak Barcode', short: 'Barcode', icon: Barcode },
];

/**
 * Urutan prioritas untuk bilah navigasi bawah di HP. Yang pertama
 * tersedia bagi peran tersebut dipakai, maksimal empat; sisanya masuk
 * tombol "Menu". Diurutkan menurut yang paling sering disentuh karyawan
 * saat berjaga, bukan menurut urutan sidebar.
 */
const PRIORITAS_BAWAH = ['pos', 'berita-acara', 'visitor_data', 'products', 'transactions', 'dashboard', 'real_stock_check'];

/** Daftar menu sesuai peran. Aturan perannya dipindahkan apa adanya dari Layout. */
export const navItemsFor = (userRole: UserRole): NavItem[] => {
  let items = [...SEMUA];

  // Kasir (POS) dan Data Pengunjung terbuka untuk SEMUA peran, termasuk
  // Superadmin dan Gudang. Keduanya dipakai bergantian oleh siapa pun
  // yang sedang berjaga di depan, jadi tidak dibatasi per peran.
  // Aturan Firestore tetap yang menentukan apa yang boleh disimpan
  // (lihat firestore.rules: transactions & visitor_logs).
  const ALL_ROLE_PAGES = ['pos', 'visitor_data'];

  // Selain dua halaman di atas, role GUDANG hanya bisa akses Produk
  // dan Pengecekan Stok.
  if (userRole === UserRole.WAREHOUSE) {
    items = items.filter(
      (item) =>
        ALL_ROLE_PAGES.includes(item.id) ||
        item.id === 'products' ||
        item.id === 'real_stock_check',
    );
  }

  if (userRole === UserRole.OWNER || userRole === UserRole.SUPERADMIN || userRole === UserRole.ADMIN) {
    items.push(...TAMBAHAN_ADMIN);
  }

  // Transaksi Susulan: Kasir (POS) juga bisa akses, bukan hanya Admin
  if (userRole !== UserRole.WAREHOUSE && userRole !== UserRole.SUPERADMIN) {
    items.push({ id: 'backdate_entry', label: 'Transaksi Susulan', short: 'Susulan', icon: FileClock });
  }

  items.push({ id: 'settings', label: 'Pengaturan', short: 'Setelan', icon: Settings });
  items.push({ id: 'about', label: 'Tentang Aplikasi', short: 'Tentang', icon: Info });

  return items;
};

/** Empat tujuan utama untuk bilah bawah di HP. */
export const bottomNavItemsFor = (userRole: UserRole): NavItem[] => {
  const tersedia = navItemsFor(userRole);
  const pilihan: NavItem[] = [];
  for (const id of PRIORITAS_BAWAH) {
    const found = tersedia.find((i) => i.id === id);
    if (found) pilihan.push(found);
    if (pilihan.length === 4) break;
  }
  return pilihan;
};
