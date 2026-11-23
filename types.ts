export enum UserRole {
  SUPERADMIN = 'SUPERADMIN',
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  CASHIER = 'CASHIER',
  WAREHOUSE = 'GUDANG'
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  image?: string; // Base64 string
}

/**
 * Kelompok baris laporan tempat sebuah kategori dijumlahkan.
 *
 * Nilai inilah yang dipakai Berita Acara dan Laporan Bulanan, BUKAN
 * nama kategorinya. Sebelumnya pengelompokan ditebak dengan mencocokkan
 * potongan nama ("tiket", "taman", "kostum"), sehingga mengganti nama
 * kategori diam-diam memindahkan pendapatannya ke baris lain.
 */
export enum CategoryReportGroup {
  TAMAN_ETNIK = 'TAMAN_ETNIK',
  TOKO_SOUVENIR = 'TOKO_SOUVENIR',
  KAFE_RESTO = 'KAFE_RESTO',
  KIOS = 'KIOS',
  PAKET_EDUKASI = 'PAKET_EDUKASI',
  JASA_FOTOGRAFER = 'JASA_FOTOGRAFER',
  SEWA_KOSTUM_KELUAR = 'SEWA_KOSTUM_KELUAR',
  LAINNYA = 'LAINNYA',
}

/** Nama baris sebagaimana tercetak pada dokumen laporan. */
export const REPORT_GROUP_LABEL: Record<CategoryReportGroup, string> = {
  [CategoryReportGroup.TAMAN_ETNIK]: 'Taman Etnik',
  [CategoryReportGroup.TOKO_SOUVENIR]: 'TOKO SOUVENIR',
  [CategoryReportGroup.KAFE_RESTO]: 'Kafe & Resto',
  [CategoryReportGroup.KIOS]: 'Kios',
  [CategoryReportGroup.PAKET_EDUKASI]: 'Paket Sopendo / Saswar / Edukasi',
  [CategoryReportGroup.JASA_FOTOGRAFER]: 'Jasa Fotografer',
  [CategoryReportGroup.SEWA_KOSTUM_KELUAR]: 'Sewa kostum keluar',
  [CategoryReportGroup.LAINNYA]: 'Lainnya',
};

export interface Category {
  id: string;
  name: string;

  /**
   * Baris laporan tujuan. Bila kosong, sistem jatuh kembali ke
   * pencocokan nama seperti perilaku lama, sehingga kategori yang
   * belum disetel tetap berjalan sebagaimana adanya.
   */
  reportGroup?: CategoryReportGroup;

  /**
   * Menandai bahwa penjualan kategori ini berarti ada tamu berkunjung.
   * Dipakai POS untuk memunculkan pendataan pengunjung.
   */
  visitorService?: VisitorServiceType;

  /** Kategori non-aktif disembunyikan dari POS tetapi riwayatnya utuh. */
  isActive?: boolean;
  /** Urutan tampil; makin kecil makin atas. */
  sortOrder?: number;
  description?: string;
  updatedAt?: string;
}

export interface Division {
  id: string;
  name: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  email?: string;
  image?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address?: string;
  email?: string;
  image?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  categoryId: string; // Linked to Category
  categoryName: string; // Denormalized for easier display/export
  stock: number;
  hpp: number; // Harga Pokok Penjualan (Cost Price)
  price: number; // Harga Jual
  image?: string;
  unit?: string; // e.g. Pcs, Kg, Box
  divisionId?: string; // Optional: Link to Division
  divisionName?: string; // Denormalized division name
}

export interface CartItem extends Product {
  qty: number;
  finalPrice: number;
}

export enum PaymentStatus {
  PAID = 'LUNAS',
  PARTIAL = 'SEBAGIAN',
  UNPAID = 'BELUM_LUNAS'
}

export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  TEMPO = 'TEMPO',
  BON = 'BON',
  QRIS = 'QRIS'
}

export interface BankAccount {
  id: string;
  bankName: string; // e.g. BCA, GoPay, Dana
  accountNumber: string;
  holderName: string;
  qrisCode?: string; // QRIS static code string from bank for generating dynamic payment QR
}

export interface PaymentHistoryItem {
  date: string;
  amount: number;
  method: PaymentMethod;
  bankId?: string; // If transfer
  bankName?: string;
  note?: string;
}

export enum TransactionType {
  SALE = 'SALE',
  RETURN = 'RETURN'
}

export interface Transaction {
  id: string;
  type?: TransactionType; // Default: SALE
  originalTransactionId?: string; // If return
  date: string; // ISO String
  items: CartItem[];
  totalAmount: number;
  amountPaid: number;
  change: number; // Kembalian
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentNote?: string; // New: General note for the transaction
  bankId?: string; // New: If paid via transfer
  bankName?: string; // New: Snapshot of bank name
  customerId?: string; // Optional link to registered customer
  customerName: string; // Required for debt (snapshotted or manual)
  customerPhone?: string; // Snapshot of customer phone number
  customerAddress?: string; // New: Snapshot of customer address
  cashierId: string;
  cashierName: string;
  paymentHistory?: PaymentHistoryItem[]; // Track installments
  isReturned?: boolean; // Flag if transaction has been returned
  returnNote?: string; // Note for return transaction
  skipCashFlow?: boolean; // Optional flag to skip backend auto-cashflow
  invoiceNumber?: string; // New: Generated Invoice Number (INVXX-XXXX)
  discount?: number;
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountAmount?: number;
  subtotal?: number;
  tableNumber?: string; // New: Optional table number
  revisionCount?: number; // New: Revision count for Reopen / Add-on Order
  createdAt?: string;
  updatedAt?: string;
  // Backdate / Manual Entry Audit Trail
  is_manual_entry?: boolean;       // Flag: transaksi susulan (backdate)
  manual_entry_reason?: string;    // Alasan wajib diisi saat input manual
  manual_entry_by?: string;        // UID/nama admin yang menginput
}

export interface OpenBill {
  id: string;
  billNumber: string;
  tableNumber?: string;
  customerName: string;
  customerId?: string;
  customerPhone?: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountAmount?: number;
  totalAmount: number;
  cashierId: string;
  cashierName: string;
  travelAgentId?: string;
  notes?: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

export enum PurchaseType {
  PURCHASE = 'PURCHASE',
  RETURN = 'RETURN'
}

// Purchase represents buying stock from suppliers (Utang)
export interface Purchase {
  id: string;
  type?: PurchaseType; // Default: PURCHASE
  date: string;
  supplierId: string;
  supplierName: string;
  description: string; // What was bought
  items?: CartItem[]; // New: Support for itemized purchases/returns
  totalAmount: number;
  amountPaid: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  bankId?: string; // New: If paid via transfer
  bankName?: string; // New: Snapshot of bank name
  paymentHistory?: PaymentHistoryItem[];
  originalPurchaseId?: string; // Link to parent purchase for returns
  isReturned?: boolean; // Flag if purchase has been returned
  returnNote?: string; // Note for return purchase
  skipCashFlow?: boolean; // Optional flag to skip backend auto-cashflow
  invoiceNumber?: string; // New: Generated Invoice Number (POXX-XXXX)
  userId?: string; // New: User who recorded this purchase
  userName?: string; // New: Name of user who recorded this purchase
  createdAt?: string;
  updatedAt?: string;
}

export enum CashFlowType {
  IN = 'MASUK',
  OUT = 'KELUAR'
}

export interface CashFlow {
  id: string;
  date: string;
  type: CashFlowType;
  amount: number;
  category: string; // e.g., "Operasional", "Belanja Modal"
  description: string;
  paymentMethod?: PaymentMethod; // New
  bankId?: string; // New
  bankName?: string; // New
  userId?: string; // New: Track who created this record
  userName?: string; // New
  referenceId?: string; // New: Link to Transaction/Purchase ID
  divisionId?: string; // New: If related to a specific division (e.g., Kasbon)
  divisionName?: string; // New: Snapshot of division name

  /**
   * Modul asal catatan kas ini. Diisi 'BERITA_ACARA' untuk baris yang
   * dialirkan dari "Rincian Pengeluaran Operasional" Berita Acara
   * harian (lihat services/beritaAcaraExpenseSync.ts). Dipakai untuk
   * menandai asal data di Laporan Bulanan dan untuk membatasi
   * pembersihan otomatis hanya pada dokumen milik modul itu.
   */
  source?: string;
  /** Tanggal Berita Acara (YYYY-MM-DD) asal baris ini. */
  beritaAcaraDate?: string;
}

export interface DashboardStats {
  totalSalesToday: number;
  totalTransactionsToday: number;
  totalReceivables: number; // Piutang
  lowStockCount: number;
}

export type PrinterType = '58mm' | '80mm' | 'A4';

export interface StoreSettings {
  name: string;
  address: string;
  phone: string;
  bankAccount: string;
  jargon?: string;
  footerMessage?: string;
  notes?: string;
  instagram?: string;
  tiktok?: string;
  showAddress?: boolean;
  showPhone?: boolean;
  showJargon?: boolean;
  showBank?: boolean;
  showLogo?: boolean;
  showInstagram?: boolean;
  showTiktok?: boolean;
  printerType?: PrinterType;
  useBluetoothPrinter?: boolean;
  openCashDrawer?: boolean; // Buka cash drawer otomatis via RJ11 saat cetak struk
  autoSyncMySQL?: boolean; // Auto sync dari MySQL saat startup
  useMySQLPrimary?: boolean; // Gunakan MySQL sebagai database utama (read dari MySQL)
}

export interface SyncQueueItem {
  id?: number; // Auto-increment
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  table: 'products' | 'categories' | 'customers' | 'suppliers' | 'transactions' | 'purchases' | 'cashflow' | 'users' | 'banks' | 'store_settings';
  dataId: string;
  data: any;
  timestamp: number;
}

// Add updatedAt to all interfaces for sync logic
export interface BaseEntity {
  updatedAt?: string;
}

export interface StockAdjustment {
  id: string;
  date: string;
  productId: string;
  productName: string;
  type: 'INCREASE' | 'DECREASE';
  reason: string;
  qty: number;
  previousStock?: number;
  currentStock?: number;
  note?: string;
  userId?: string;
  userName?: string;
}

export interface BeritaAcaraArchive extends BaseEntity {
  id: string;
  title: string;
  date: string;
  salesTunai: string[];
  salesQR: string[];
  expenses: string[];
  customExpenses: any[]; // The detailed rows
  catatan: string;
  totalIncome: number;
  totalExpense: number;
  totalClean: number;
  createdAt: number;
}

export enum CommissionMethod {
  PERCENTAGE = 'PERCENTAGE',
  FLAT_PER_PAX = 'FLAT_PER_PAX',
  FLAT_PER_GROUP = 'FLAT_PER_GROUP'
}

export enum CommissionStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED'
}

export interface TravelAgent extends BaseEntity {
  id: string;
  name: string;
  phone: string;
  email?: string;
  category: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  notes?: string;
  createdAt?: string;
  // Target & Skema Komisi Driver / Guide
  commissionMethod?: CommissionMethod; // Skema bawaan (PERCENTAGE, FLAT_PER_PAX, FLAT_PER_GROUP)
  commissionRate?: number; // Tarif bawaan (% persentase atau nominal flat Rp)
  monthlyTargetRevenue?: number; // Target omzet belanja bulanan yang dibawa (Rp)
  monthlyTargetPax?: number; // Target jumlah wisatawan / pax bulanan
  targetBonusRate?: number; // Bonus insentif jika mencapai target (% atau nominal Rp)
}

export interface TravelBookingCommission extends BaseEntity {
  id: string;
  bookingCode: string;
  agentId: string;
  agentName: string;
  agentCategory?: string;
  customerId?: string;
  touristName: string;
  paxCount: number;
  tourPackage: string;
  departureDate: string;
  totalSales: number;
  commissionMethod: CommissionMethod;
  commissionRate: number;
  totalCommission: number;
  bonusCommission?: number; // Bonus pencapaian target jika ada
  status: CommissionStatus;
  paymentDate?: string;
  paymentMethod?: PaymentMethod;
  bankId?: string;
  bankName?: string;
  notes?: string;
  createdAt?: string;
}

// ─── Data Pengunjung Wisatawan ────────────────────────────────
// Dibuat untuk memenuhi kebutuhan pelaporan kunjungan wisata.
// Pemisahan wisatawan nusantara dan mancanegara beserta daerah
// asalnya bersifat WAJIB karena itulah inti laporan ke dinas.

export enum VisitorOrigin {
  NUSANTARA = 'NUSANTARA',
  MANCANEGARA = 'MANCANEGARA',
}

/**
 * Layanan yang membuat seseorang terhitung sebagai pengunjung.
 *
 * Satu kunjungan bisa memakai lebih dari satu layanan, misalnya tiket
 * masuk sekaligus sewa kostum, sehingga disimpan sebagai daftar.
 */
export enum VisitorServiceType {
  TIKET_MASUK = 'TIKET_MASUK',
  PAKET_TOUR = 'PAKET_TOUR',
  SEWA_KOSTUM = 'SEWA_KOSTUM',
  HOMESTAY = 'HOMESTAY',
  LAINNYA = 'LAINNYA',
}

export const VISITOR_SERVICE_LABEL: Record<VisitorServiceType, string> = {
  [VisitorServiceType.TIKET_MASUK]: 'Tiket Masuk',
  [VisitorServiceType.PAKET_TOUR]: 'Paket Tour / Edukasi',
  [VisitorServiceType.SEWA_KOSTUM]: 'Sewa Kostum',
  [VisitorServiceType.HOMESTAY]: 'Homestay',
  [VisitorServiceType.LAINNYA]: 'Lainnya',
};

/**
 * Kanal pemesanan — dari mana tamu datang.
 *
 * Dibuat terpisah dari modul Komisi Agen, karena yang dicatat di sana
 * adalah driver dan guide yang membawa wisatawan, bukan platform
 * pemesanan daring. Homestay misalnya bisa dipesan langsung di tempat
 * (lewat kasir) maupun lewat OTA yang tidak melewati kasir sama sekali.
 */
export enum VisitorBookingChannel {
  LANGSUNG = 'LANGSUNG',
  TRAVEL_AGENT = 'TRAVEL_AGENT',
  OTA = 'OTA',
}

export const VISITOR_CHANNEL_LABEL: Record<VisitorBookingChannel, string> = {
  [VisitorBookingChannel.LANGSUNG]: 'Langsung di Tempat',
  [VisitorBookingChannel.TRAVEL_AGENT]: 'Biro / Driver / Guide',
  [VisitorBookingChannel.OTA]: 'Platform Daring (OTA)',
};

/** Platform OTA yang lazim; daftar ini saran, bukan pembatas. */
export const COMMON_OTA_PLATFORMS = [
  'Airbnb', 'Booking.com', 'Traveloka', 'Agoda', 'Tiket.com',
  'Expedia', 'Trip.com', 'Pegipegi', 'OYO', 'RedDoorz',
] as const;

export enum VisitorSegment {
  UMUM = 'UMUM',
  KELUARGA = 'KELUARGA',
  PELAJAR = 'PELAJAR',
  INSTANSI = 'INSTANSI',
  KOMUNITAS = 'KOMUNITAS',
}

/** Fasilitas REP yang dapat dikunjungi dalam satu kunjungan. */
export const VISITOR_FACILITIES = [
  'Taman Etnik / Rumah Adat',
  'Museum Budaya Mini',
  'Sewa Pakaian Adat',
  'Atraksi Seni Pertunjukan',
  'Yaswar Cafe',
  'Toko Souvenir',
  'Homestay',
] as const;

export interface VisitorLog {
  id: string;
  /** Format kanonik "YYYY-MM-DD HH:mm:ss" zona Asia/Jayapura. */
  date: string;
  /** Nama rombongan, sekolah, instansi, atau tamu. Opsional untuk perorangan. */
  groupName?: string;

  // Wajib — dasar laporan kunjungan
  originType: VisitorOrigin;
  /** Provinsi untuk wisnus, negara untuk wisman. */
  originRegion: string;
  segment: VisitorSegment;
  paxTotal: number;
  paxAdult: number;
  paxChild: number;

  /** Layanan yang dipakai pada kunjungan ini. */
  serviceTypes?: VisitorServiceType[];
  /** Dari mana tamu memesan. Default LANGSUNG bila lewat kasir. */
  bookingChannel?: VisitorBookingChannel;
  /** Nama platform, hanya bila bookingChannel bernilai OTA. */
  otaName?: string;
  facilities?: string[];

  // Tautan ke sumber data lain agar jumlah pengunjung dan
  // pendapatan tiket tidak pernah saling bertentangan.
  transactionId?: string;
  invoiceNumber?: string;
  ticketRevenue?: number;
  agentId?: string;
  agentName?: string;

  notes?: string;
  recordedById: string;
  recordedByName: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 38 provinsi Indonesia, untuk pendataan asal wisatawan nusantara. */
export const INDONESIAN_PROVINCES = [
  'Papua Barat Daya', 'Papua Barat', 'Papua', 'Papua Tengah', 'Papua Pegunungan', 'Papua Selatan',
  'Maluku', 'Maluku Utara',
  'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi',
  'Sumatera Selatan', 'Kepulauan Bangka Belitung', 'Bengkulu', 'Lampung',
  'DKI Jakarta', 'Jawa Barat', 'Banten', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur',
  'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur',
  'Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara',
  'Sulawesi Utara', 'Gorontalo', 'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tenggara',
] as const;

/** Negara yang sering muncul; daftar ini hanya saran, bukan pembatas. */
export const COMMON_COUNTRIES = [
  'Australia', 'Belanda', 'Amerika Serikat', 'Jerman', 'Inggris', 'Prancis',
  'Jepang', 'Tiongkok', 'Korea Selatan', 'Singapura', 'Malaysia', 'Filipina',
  'Papua Nugini', 'Selandia Baru', 'Italia', 'Spanyol',
] as const;
