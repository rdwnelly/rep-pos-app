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

export interface Category {
  id: string;
  name: string;
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
  status: CommissionStatus;
  paymentDate?: string;
  paymentMethod?: PaymentMethod;
  bankId?: string;
  bankName?: string;
  notes?: string;
  createdAt?: string;
}
