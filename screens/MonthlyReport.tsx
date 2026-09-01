import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { formatIDR, formatDate, formatDateDateOnly, exportToCSV, exportToExcel, generateId, toMySQLDate } from '../utils';
import {
    Calculator, Calendar, Tag, TrendingDown, TrendingUp, PiggyBank, Printer,
    FileSpreadsheet, Download, ChevronLeft, ChevronRight, DollarSign,
    Layers, ArrowUpRight, ArrowDownRight, CheckCircle2, Percent,
    CreditCard, Wallet, QrCode, BarChart3, CalendarDays, Building2,
    ShieldCheck, Activity, Award, FileText, Share2, Info, Clock,
    Users, AlertCircle, Sparkles, Receipt, RefreshCw, Check, Search, Filter, Phone, UserCheck,
    PlusCircle, Plus, Trash2, X, Edit3, Loader2
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { CashFlowType, PaymentMethod, TransactionType, StoreSettings, StockAdjustment, PaymentStatus, Transaction, CashFlow, BankAccount } from '../types';

// WhatsApp Icon SVG
const WhatsAppIcon = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.932 9.932 0 001.332 4.982L2 22l5.237-1.343a9.96 9.96 0 004.775 1.216h.004c5.505 0 9.988-4.478 9.989-9.984 0-2.667-1.037-5.176-2.922-7.062A9.923 9.923 0 0012.012 2zm5.834 14.164c-.247.692-1.246 1.34-1.745 1.408-.475.064-1.077.096-1.724-.112-.417-.133-.96-.31-1.666-.615-2.949-1.272-4.869-4.28-5.016-4.476-.146-.197-1.196-1.591-1.196-3.036 0-1.445.758-2.158 1.026-2.45.247-.269.544-.336.726-.336.183 0 .366.002.525.009.17.008.396-.065.62.472.247.592.84 2.052.913 2.2.073.149.122.323.024.518-.098.196-.147.32-.293.491-.146.172-.307.385-.438.518-.146.147-.298.307-.128.598.17.292.756 1.248 1.626 2.024 1.12.998 2.062 1.308 2.355 1.455.293.147.464.123.635-.073.17-.197.733-.853.929-1.147.196-.293.391-.245.659-.147.269.098 1.708.805 2.001.951.293.147.488.221.561.344.073.123.073.715-.174 1.407z" />
    </svg>
);

// Standard OPEX Categories for quick dropdown & aggregation
const OPEX_CATEGORIES = [
    'Beban Gaji & Upah',
    'Beban Listrik, Air & Internet',
    'Beban Operasional Kasir & Toko',
    'Beban Sewa & Pemeliharaan',
    'Beban Transportasi & Logistik',
    'Beban Pemasaran & Promosi',
    'Beban Konsumsi & Makan Siang Karyawan',
    'Beban Reparasi & Servis',
    'Beban Perlengkapan & ATK',
    'Beban Panjar',
    'Beban Operasional Lain-lain',
];

// Baseline categories for Berita Acara report
const BASE_SALES_CATEGORIES = [
    "Tiket Masuk",
    "Sewa Kostum",
    "Toko / Souvenir",
    "Kafe & Resto",
    "Kios",
    "Paket Sopendo / Saswar / Edukasi",
    "Jasa Fotografer",
    "Sewa kostum keluar",
];

// Robust Date Parsing for any format (MySQL 'YYYY-MM-DD HH:mm:ss' or ISO 8601)
const parseSafeDate = (d: any): Date => {
    if (!d) return new Date(0);
    if (d instanceof Date) return d;
    const str = typeof d === 'string' ? d.replace(' ', 'T') : String(d);
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed;
    const fallback = new Date(d);
    return isNaN(fallback.getTime()) ? new Date(0) : fallback;
};

// Helper to map category name to standardized display name
const mapCategoryNameToSalesRow = (catName: string): string => {
    const lower = (catName || '').toLowerCase().trim();
    if (lower.includes("tiket")) return "Tiket Masuk";
    if (lower.includes("sewa kostum keluar") || lower.includes("kostum keluar") || lower === "sewa kostum keluar") return "Sewa kostum keluar";
    if (lower.includes("sewa kostum") || lower.includes("kostum")) return "Sewa Kostum";
    if (lower.includes("toko") || lower.includes("souvenir") || lower.includes("sovenir")) return "Toko / Souvenir";
    if (lower.includes("kafe") || lower.includes("cafe") || lower.includes("resto")) return "Kafe & Resto";
    if (lower.includes("kios")) return "Kios";
    if (lower.includes("sopendo") || lower.includes("saswar") || lower.includes("edukasi")) return "Paket Sopendo / Saswar / Edukasi";
    if (lower.includes("fotografer") || lower.includes("foto")) return "Jasa Fotografer";
    return catName;
};

// Helper to reliably check if a transaction is a Piutang / BON / Hutang
const isDebtTransaction = (t: Transaction): boolean => {
    if (!t || t.type === TransactionType.RETURN) return false;
    const method = (t.paymentMethod || '').toString().toUpperCase();
    const status = (t.paymentStatus || '').toString().toUpperCase();
    const note = (t.paymentNote || '').toString().toUpperCase();

    const isBonMethod = method === 'BON' || method === 'TEMPO' || method === 'HUTANG' || method.includes('BON') || method.includes('TEMPO') || method.includes('HUTANG');
    const isUnpaidStatus = status === 'BELUM_LUNAS' || status === 'BELUM LUNAS' || status === 'SEBAGIAN' || status === 'UNPAID' || status === 'PARTIAL' || status !== 'LUNAS';
    const hasRemainingDebt = (t.totalAmount || 0) > (t.amountPaid || 0);
    const hasDebtNote = note.includes('BON') || note.includes('HUTANG') || note.includes('PIUTANG');

    return isBonMethod || isUnpaidStatus || hasRemainingDebt || hasDebtNote;
};

export const MonthlyReport: React.FC = () => {
    // Data Loading
    const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];
    const cashFlows = useData(() => StorageService.getCashFlow(), [], 'cashflow') || [];
    const stockAdjustments = useData(() => StorageService.getStockAdjustments(), [], 'stock_adjustments') || [];
    const categories = useData(() => StorageService.getCategories(), [], 'categories') || [];
    const banks = useData(() => StorageService.getBanks(), [], 'banks') || [];
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

    useEffect(() => {
        StorageService.getStoreSettings().then(setStoreSettings).catch(console.error);
    }, []);

    // Current User Info
    const [currentUser, setCurrentUser] = useState<any>(null);
    useEffect(() => {
        const userStr = typeof window !== 'undefined' ? localStorage.getItem('pos_current_user') : null;
        if (userStr) {
            try {
                setCurrentUser(JSON.parse(userStr));
            } catch (e) {
                console.error(e);
            }
        }
    }, []);

    // Period Mode: 'tutup_buku' (18 s/d 17) | 'calendar' (1 s/d Akhir Bulan)
    const [periodMode, setPeriodMode] = useState<'tutup_buku' | 'calendar'>('tutup_buku');

    // Month & Year State (Tutup Buku cutoff 18: date 18+ belongs to next month's closing period)
    const today = new Date();
    const defaultInitialMonth = today.getDate() >= 18 ? (today.getMonth() + 1) % 12 : today.getMonth();
    const defaultInitialYear = (today.getDate() >= 18 && today.getMonth() === 11) ? today.getFullYear() + 1 : today.getFullYear();
    const [selectedMonth, setSelectedMonth] = useState(defaultInitialMonth); // 0-11
    const [selectedYear, setSelectedYear] = useState(defaultInitialYear);

    // Active View Tab: 'berita_acara' | 'income_statement' | 'category_breakdown' | 'receivables' | 'cash_flow' | 'daily_trend'
    const [activeTab, setActiveTab] = useState<'berita_acara' | 'income_statement' | 'category_breakdown' | 'receivables' | 'cash_flow' | 'daily_trend'>('berita_acara');

    // Sub-view in Tab 4 (Receivables Ledger)
    const [receivablesViewMode, setReceivablesViewMode] = useState<'all_active' | 'period_new' | 'repayments' | 'ledger'>('all_active');
    const [receivablesSearch, setReceivablesSearch] = useState<string>('');

    // Custom Note for Berita Acara
    const [customNote, setCustomNote] = useState<string>('');
    const [isNoteEdited, setIsNoteEdited] = useState<boolean>(false);

    // Manual OPEX & WhatsApp State
    const [isSharingWA, setIsSharingWA] = useState<boolean>(false);
    const [showExpenseModal, setShowExpenseModal] = useState<boolean>(false);
    const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
    const [categoryDetailsModal, setCategoryDetailsModal] = useState<{
        categoryName: string;
        items: CashFlow[];
    } | null>(null);
    const [expenseForm, setExpenseForm] = useState<{
        date: string;
        category: string;
        customCategory: string;
        description: string;
        amount: string;
        paymentMethod: PaymentMethod;
        bankId: string;
    }>({
        date: toMySQLDate(new Date()).slice(0, 10),
        category: 'Beban Operasional Kasir & Toko',
        customCategory: '',
        description: '',
        amount: '',
        paymentMethod: PaymentMethod.CASH,
        bankId: ''
    });
    const [isSubmittingExpense, setIsSubmittingExpense] = useState<boolean>(false);

    // Months Array
    const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];

    // Generate available years for dropdown
    const years = useMemo(() => {
        const y = new Set<number>([today.getFullYear()]);
        transactions.forEach(t => {
            const dt = parseSafeDate(t.date);
            if (!isNaN(dt.getFullYear())) y.add(dt.getFullYear());
        });
        cashFlows.forEach(c => {
            const dt = parseSafeDate(c.date);
            if (!isNaN(dt.getFullYear())) y.add(dt.getFullYear());
        });
        return Array.from(y).sort((a, b) => b - a);
    }, [transactions, cashFlows]);

    // Quick Month Navigation
    const handlePrevMonth = () => {
        if (selectedMonth === 0) {
            setSelectedMonth(11);
            setSelectedYear(prev => prev - 1);
        } else {
            setSelectedMonth(prev => prev - 1);
        }
    };

    const handleNextMonth = () => {
        if (selectedMonth === 11) {
            setSelectedMonth(0);
            setSelectedYear(prev => prev + 1);
        } else {
            setSelectedMonth(prev => prev + 1);
        }
    };

    // Calculate Date Range according to periodMode
    const periodRange = useMemo(() => {
        if (periodMode === 'tutup_buku') {
            // Tutup Buku: 18 bulan sebelumnya s/d 17 bulan berjalan
            const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
            const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;

            const start = new Date(prevYear, prevMonth, 18, 0, 0, 0, 0);
            const end = new Date(selectedYear, selectedMonth, 17, 23, 59, 59, 999);

            const label = `18 ${months[prevMonth]} ${prevYear} s/d 17 ${months[selectedMonth]} ${selectedYear}`;
            const shortLabel = `18/${String(prevMonth + 1).padStart(2, '0')}/${prevYear} - 17/${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`;
            const title = `Periode Tutup Buku ${months[selectedMonth]} ${selectedYear}`;

            return {
                start,
                end,
                startTime: start.getTime(),
                endTime: end.getTime(),
                label,
                shortLabel,
                title,
                prevMonth,
                prevYear
            };
        } else {
            // Calendar: 1 s/d Akhir Bulan berjalan
            const start = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
            const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
            const end = new Date(selectedYear, selectedMonth, lastDay, 23, 59, 59, 999);

            const label = `1 ${months[selectedMonth]} ${selectedYear} s/d ${lastDay} ${months[selectedMonth]} ${selectedYear}`;
            const shortLabel = `01/${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear} - ${lastDay}/${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`;
            const title = `Periode Kalender ${months[selectedMonth]} ${selectedYear}`;

            return {
                start,
                end,
                startTime: start.getTime(),
                endTime: end.getTime(),
                label,
                shortLabel,
                title,
                prevMonth: selectedMonth,
                prevYear: selectedYear
            };
        }
    }, [periodMode, selectedMonth, selectedYear]);

    // Filter Data by calculated period range
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (!t || !t.date) return false;
            const tTime = parseSafeDate(t.date).getTime();
            return tTime >= periodRange.startTime && tTime <= periodRange.endTime;
        });
    }, [transactions, periodRange]);

    const filteredCashFlows = useMemo(() => {
        return cashFlows.filter(c => {
            if (!c || !c.date) return false;
            const cTime = parseSafeDate(c.date).getTime();
            return cTime >= periodRange.startTime && cTime <= periodRange.endTime;
        });
    }, [cashFlows, periodRange]);

    const filteredStockAdjustments = useMemo(() => {
        return stockAdjustments.filter(a => {
            if (!a || !a.date) return false;
            const aTime = parseSafeDate(a.date).getTime();
            return aTime >= periodRange.startTime && aTime <= periodRange.endTime;
        });
    }, [stockAdjustments, periodRange]);

    // ========================================================
    // 1. REVENUE & SALES CALCULATIONS (PENDAPATAN USAHA)
    // ========================================================
    const salesMetrics = useMemo(() => {
        let grossSales = 0;
        let returnsAmount = 0;
        let discountAmount = 0;
        let totalItemsSold = 0;
        let totalHppCost = 0;
        let cashSales = 0;
        let qrSales = 0;
        let transferSales = 0;
        let debtSales = 0;

        filteredTransactions.forEach(t => {
            if (t.type === TransactionType.RETURN) {
                returnsAmount += Math.abs(t.totalAmount || 0);
            } else {
                const totalAmt = t.subtotal || t.totalAmount || 0;
                grossSales += totalAmt;
                if (t.discountAmount) discountAmount += t.discountAmount;

                // Payment Method Breakdown with exact mathematical consistency
                const amt = t.totalAmount || 0;
                const paid = t.amountPaid || 0;
                const methodStr = (t.paymentMethod || '').toString().toUpperCase();
                const isBon = methodStr === 'BON' || methodStr === 'TEMPO' || methodStr.includes('BON') || methodStr.includes('TEMPO') || methodStr.includes('HUTANG') || (t.paymentStatus !== PaymentStatus.PAID && (amt > paid));

                if (isBon) {
                    const unpaid = Math.max(0, amt - paid);
                    debtSales += unpaid;
                    // If customer paid DP or partial cash at checkout
                    if (paid > 0) {
                        if (methodStr === 'TRANSFER' || methodStr.includes('TRANSFER') || methodStr.includes('BANK')) {
                            transferSales += paid;
                        } else if (methodStr === 'QRIS' || methodStr.includes('QRIS')) {
                            qrSales += paid;
                        } else {
                            cashSales += paid;
                        }
                    }
                } else if (methodStr === 'CASH' || methodStr === 'TUNAI') {
                    cashSales += amt;
                } else if (methodStr === 'QRIS' || methodStr.includes('QRIS') || methodStr.includes('WALLET')) {
                    qrSales += amt;
                } else if (methodStr === 'TRANSFER' || methodStr.includes('TRANSFER') || methodStr.includes('BANK')) {
                    transferSales += amt;
                } else {
                    cashSales += amt;
                }

                // Item & HPP Cost
                if (Array.isArray(t.items)) {
                    t.items.forEach(item => {
                        totalItemsSold += item.qty;
                        totalHppCost += (item.hpp || 0) * item.qty;
                    });
                }
            }
        });

        const netSales = grossSales - returnsAmount - discountAmount;

        return {
            grossSales,
            returnsAmount,
            discountAmount,
            netSales,
            totalItemsSold,
            totalHppCost,
            cashSales,
            qrSales,
            transferSales,
            debtSales,
            totalTransactionsCount: filteredTransactions.length
        };
    }, [filteredTransactions]);

    // ========================================================
    // 2. DETAILED CATEGORY MATRIX (TUNAI vs NON-TUNAI vs TEMPO)
    // ========================================================
    const categoryRows = useMemo(() => {
        const catMap = new Map<string, {
            name: string;
            tunai: number;
            hppTunai: number;
            nonTunai: number;
            hppNonTunai: number;
            tempo: number;
            hppTempo: number;
            itemsSold: number;
            txCount: number;
        }>();

        // Initialize base categories
        BASE_SALES_CATEGORIES.forEach(name => {
            catMap.set(name, {
                name,
                tunai: 0,
                hppTunai: 0,
                nonTunai: 0,
                hppNonTunai: 0,
                tempo: 0,
                hppTempo: 0,
                itemsSold: 0,
                txCount: 0
            });
        });

        // Initialize master categories
        categories.forEach(c => {
            if (c && c.name && c.name.trim()) {
                const mappedName = mapCategoryNameToSalesRow(c.name.trim());
                if (!catMap.has(mappedName)) {
                    catMap.set(mappedName, {
                        name: mappedName,
                        tunai: 0,
                        hppTunai: 0,
                        nonTunai: 0,
                        hppNonTunai: 0,
                        tempo: 0,
                        hppTempo: 0,
                        itemsSold: 0,
                        txCount: 0
                    });
                }
            }
        });

        // Populate from transactions
        filteredTransactions.forEach(t => {
            if (t.type === TransactionType.RETURN) return;
            const methodStr = (t.paymentMethod || '').toString().toUpperCase();
            const isCash = methodStr === 'CASH' || methodStr === 'TUNAI';
            const isNonCash = methodStr === 'QRIS' || methodStr === 'TRANSFER' || methodStr.includes('QRIS') || methodStr.includes('TRANSFER') || methodStr.includes('BANK');
            const isTempo = methodStr === 'TEMPO' || methodStr === 'BON' || methodStr.includes('BON') || methodStr.includes('TEMPO') || methodStr.includes('HUTANG');

            const seenInTx = new Set<string>();

            (t.items || []).forEach(item => {
                const rawName = item.categoryName || 'Lain-lain';
                const rowName = mapCategoryNameToSalesRow(rawName);

                if (!catMap.has(rowName)) {
                    catMap.set(rowName, {
                        name: rowName,
                        tunai: 0,
                        hppTunai: 0,
                        nonTunai: 0,
                        hppNonTunai: 0,
                        tempo: 0,
                        hppTempo: 0,
                        itemsSold: 0,
                        txCount: 0
                    });
                }

                const row = catMap.get(rowName)!;
                const itemRevenue = (item.finalPrice || item.price || 0) * (item.qty || 1);
                const itemHpp = (item.hpp || 0) * (item.qty || 1);

                row.itemsSold += item.qty;

                if (isCash) {
                    row.tunai += itemRevenue;
                    row.hppTunai += itemHpp;
                } else if (isNonCash) {
                    row.nonTunai += itemRevenue;
                    row.hppNonTunai += itemHpp;
                } else if (isTempo) {
                    row.tempo += itemRevenue;
                    row.hppTempo += itemHpp;
                } else {
                    row.tunai += itemRevenue;
                    row.hppTunai += itemHpp;
                }

                seenInTx.add(rowName);
            });

            seenInTx.forEach(rowName => {
                if (catMap.has(rowName)) {
                    catMap.get(rowName)!.txCount += 1;
                }
            });
        });

        return Array.from(catMap.values());
    }, [filteredTransactions, categories]);

    // Category Summary Totals
    const categoryTotals = useMemo(() => {
        let totalTunai = 0;
        let totalHppTunai = 0;
        let totalNonTunai = 0;
        let totalHppNonTunai = 0;
        let totalTempo = 0;
        let totalHppTempo = 0;

        categoryRows.forEach(r => {
            totalTunai += r.tunai;
            totalHppTunai += r.hppTunai;
            totalNonTunai += r.nonTunai;
            totalHppNonTunai += r.hppNonTunai;
            totalTempo += r.tempo;
            totalHppTempo += r.hppTempo;
        });

        const profitTunai = totalTunai - totalHppTunai;
        const profitNonTunai = totalNonTunai - totalHppNonTunai;
        const profitTempo = totalTempo - totalHppTempo;
        const grandTotalRevenue = totalTunai + totalNonTunai + totalTempo;
        const grandTotalHpp = totalHppTunai + totalHppNonTunai + totalHppTempo;
        const grandTotalProfit = grandTotalRevenue - grandTotalHpp;

        return {
            totalTunai,
            totalHppTunai,
            profitTunai,
            totalNonTunai,
            totalHppNonTunai,
            profitNonTunai,
            totalTempo,
            totalHppTempo,
            profitTempo,
            grandTotalRevenue,
            grandTotalHpp,
            grandTotalProfit
        };
    }, [categoryRows]);

    // ========================================================
    // 3. PIUTANG (ACCOUNTS RECEIVABLE / BON PELANGGAN)
    // ========================================================
    const receivablesData = useMemo(() => {
        // 1. All Active Unpaid Debt Transactions in the entire database (Outstanding)
        const allActiveDebts: {
            id: string;
            date: string;
            invoiceNumber: string;
            customerName: string;
            customerPhone?: string;
            totalAmount: number;
            amountPaid: number;
            remainingDebt: number;
            paymentStatus: PaymentStatus | string;
            paymentMethod: PaymentMethod | string;
            itemsSummary: string;
            isPeriodNew: boolean;
        }[] = [];

        // 2. New Debt Transactions issued in this Tutup Buku Period (18 s/d 17)
        const periodNewDebtTransactions: typeof allActiveDebts = [];

        // 3. Combined List for Berita Acara Section IV:
        // Includes debt transactions created in this period, PLUS all active debts that remain unpaid!
        const beritaAcaraDebtTransactions: typeof allActiveDebts = [];
        const seenTxIds = new Set<string>();

        let totalNewDebtIssued = 0;
        let totalAllActiveDebtRemaining = 0;
        let totalPeriodDebtRemaining = 0;

        transactions.forEach(t => {
            if (!t || t.type === TransactionType.RETURN) return;
            if (!isDebtTransaction(t)) return;

            const tTime = parseSafeDate(t.date).getTime();
            const isInPeriod = tTime >= periodRange.startTime && tTime <= periodRange.endTime;
            const totalAmt = t.totalAmount || 0;
            const paidAmt = t.amountPaid || 0;
            const remaining = Math.max(0, totalAmt - paidAmt);
            const itemsSummary = (t.items || []).map(i => `${i.name} (${i.qty})`).join(', ') || 'Item Belanja';

            const record = {
                id: t.id,
                date: t.date,
                invoiceNumber: t.invoiceNumber || `INV-${t.id.slice(-6).toUpperCase()}`,
                customerName: t.customerName || 'Pelanggan Umum',
                customerPhone: t.customerPhone,
                totalAmount: totalAmt,
                amountPaid: paidAmt,
                remainingDebt: remaining,
                paymentStatus: t.paymentStatus || (remaining === 0 ? 'LUNAS' : (paidAmt > 0 ? 'SEBAGIAN' : 'BELUM_LUNAS')),
                paymentMethod: t.paymentMethod || 'BON',
                itemsSummary,
                isPeriodNew: isInPeriod
            };

            if (remaining > 0) {
                allActiveDebts.push(record);
                totalAllActiveDebtRemaining += remaining;
            }

            if (isInPeriod) {
                periodNewDebtTransactions.push(record);
                totalNewDebtIssued += totalAmt;
                totalPeriodDebtRemaining += remaining;
            }

            // Include in Berita Acara Section IV if created in period OR if currently active unpaid
            if ((isInPeriod || remaining > 0) && !seenTxIds.has(t.id)) {
                beritaAcaraDebtTransactions.push(record);
                seenTxIds.add(t.id);
            }
        });

        // 4. Repayments (Pelunasan / Cicilan Piutang) received during this period (18 s/d 17)
        let totalRepaymentsReceived = 0;
        let repaymentsCash = 0;
        let repaymentsNonCash = 0;
        const periodRepaymentList: {
            id: string;
            date: string;
            customerName: string;
            invoiceNumber: string;
            amount: number;
            method: string;
            note: string;
        }[] = [];

        // Check paymentHistory in all transactions for repayments occurring in this period
        transactions.forEach(t => {
            if (!t || !Array.isArray(t.paymentHistory)) return;
            t.paymentHistory.forEach((ph, idx) => {
                if (!ph || !ph.date) return;
                const phTime = parseSafeDate(ph.date).getTime();
                if (phTime >= periodRange.startTime && phTime <= periodRange.endTime) {
                    const isInitialPaid = (ph.note || '').toLowerCase().includes('pembayaran awal') && t.paymentMethod !== PaymentMethod.BON && t.paymentMethod !== PaymentMethod.TEMPO;
                    if (!isInitialPaid && (ph.note?.toLowerCase().includes('cicilan') || ph.note?.toLowerCase().includes('pelunasan') || ph.note?.toLowerCase().includes('piutang') || t.paymentMethod === PaymentMethod.BON || t.paymentMethod === PaymentMethod.TEMPO || idx > 0)) {
                        const amt = ph.amount || 0;
                        totalRepaymentsReceived += amt;
                        const m = (ph.method || '').toString().toUpperCase();
                        if (m === 'CASH' || m === 'TUNAI' || !ph.method) {
                            repaymentsCash += amt;
                        } else {
                            repaymentsNonCash += amt;
                        }
                        periodRepaymentList.push({
                            id: `${t.id}-${idx}`,
                            date: ph.date,
                            customerName: t.customerName || 'Pelanggan Umum',
                            invoiceNumber: t.invoiceNumber || t.id.slice(-6).toUpperCase(),
                            amount: amt,
                            method: ph.method || 'CASH',
                            note: ph.note || 'Pelunasan Piutang'
                        });
                    }
                }
            });
        });

        // Also check filteredCashFlows for any external pelunasan entries
        filteredCashFlows.forEach(cf => {
            const catLower = (cf.category || '').toLowerCase();
            const descLower = (cf.description || '').toLowerCase();
            if (cf.type === CashFlowType.IN && (catLower.includes('piutang') || descLower.includes('pelunasan piutang') || descLower.includes('cicilan piutang') || descLower.includes('pelunasan bon'))) {
                const alreadyCounted = periodRepaymentList.some(r => Math.abs(r.amount - cf.amount) < 1 && parseSafeDate(r.date).toDateString() === parseSafeDate(cf.date).toDateString());
                if (!alreadyCounted) {
                    totalRepaymentsReceived += cf.amount;
                    if (cf.paymentMethod === PaymentMethod.CASH || !cf.paymentMethod) {
                        repaymentsCash += cf.amount;
                    } else {
                        repaymentsNonCash += cf.amount;
                    }
                    periodRepaymentList.push({
                        id: cf.id,
                        date: cf.date,
                        customerName: cf.description || 'Pelanggan Umum',
                        invoiceNumber: cf.referenceId || '-',
                        amount: cf.amount,
                        method: (cf.paymentMethod as string) || 'CASH',
                        note: cf.category || 'Pelunasan Piutang'
                    });
                }
            }
        });

        // Use the comprehensive list for Section IV table
        const displayTableTransactions = beritaAcaraDebtTransactions.length > 0
            ? beritaAcaraDebtTransactions
            : periodNewDebtTransactions;

        const tableSumTotalAmount = displayTableTransactions.reduce((s, it) => s + it.totalAmount, 0);
        const tableSumPaid = displayTableTransactions.reduce((s, it) => s + it.amountPaid, 0);
        const tableSumRemaining = displayTableTransactions.reduce((s, it) => s + it.remainingDebt, 0);

        // Customer ledger (Buku Pembantu Piutang)
        const customerDebtsMap = new Map<string, {
            customerName: string;
            customerPhone?: string;
            txCount: number;
            totalDebt: number;
            totalPaid: number;
            remainingDebt: number;
            transactions: typeof allActiveDebts;
        }>();

        allActiveDebts.forEach(dt => {
            const name = dt.customerName || 'Pelanggan Umum';
            if (!customerDebtsMap.has(name)) {
                customerDebtsMap.set(name, {
                    customerName: name,
                    customerPhone: dt.customerPhone,
                    txCount: 0,
                    totalDebt: 0,
                    totalPaid: 0,
                    remainingDebt: 0,
                    transactions: []
                });
            }
            const cust = customerDebtsMap.get(name)!;
            cust.txCount += 1;
            cust.totalDebt += dt.totalAmount;
            cust.totalPaid += dt.amountPaid;
            cust.remainingDebt += dt.remainingDebt;
            cust.transactions.push(dt);
        });

        return {
            periodDebtTransactions: periodNewDebtTransactions,
            allActiveDebts,
            beritaAcaraDebtTransactions: displayTableTransactions,
            tableSumTotalAmount,
            tableSumPaid,
            tableSumRemaining,
            totalNewDebtIssued,
            totalPeriodDebtRemaining,
            totalAllActiveDebtRemaining,
            totalDebtRemaining: totalAllActiveDebtRemaining > 0 ? totalAllActiveDebtRemaining : totalPeriodDebtRemaining,
            totalRepaymentsReceived,
            repaymentsCash,
            repaymentsNonCash,
            periodRepaymentList,
            customerLedger: Array.from(customerDebtsMap.values()).sort((a, b) => b.remainingDebt - a.remainingDebt),
            debtCount: displayTableTransactions.length || allActiveDebts.length
        };
    }, [transactions, filteredTransactions, filteredCashFlows, periodRange]);

    // ========================================================
    // 4. OPERATING EXPENSES (BEBAN OPERASIONAL / OPEX)
    // ========================================================
    const expenseBreakdown = useMemo(() => {
        const categoriesMap: Record<string, number> = {
            'Beban Gaji & Upah': 0,
            'Beban Listrik, Air & Internet': 0,
            'Beban Operasional Kasir & Toko': 0,
            'Beban Sewa & Pemeliharaan': 0,
            'Beban Transportasi & Logistik': 0,
            'Beban Pemasaran & Promosi': 0,
            'Beban Konsumsi & Makan Siang Karyawan': 0,
            'Beban Reparasi & Servis': 0,
            'Beban Perlengkapan & ATK': 0,
            'Beban Panjar': 0,
            'Beban Operasional Lain-lain': 0,
        };

        const categoryItemsMap: Record<string, CashFlow[]> = {};
        Object.keys(categoriesMap).forEach(k => {
            categoryItemsMap[k] = [];
        });

        let cashExpenses = 0;
        let nonCashExpenses = 0;
        const periodExpenseList: CashFlow[] = [];

        filteredCashFlows.forEach(c => {
            if (!c) return;
            const catStr = (c.category || '').trim();
            const catLower = catStr.toLowerCase();
            const descLower = (c.description || '').toLowerCase();
            const text = catLower + " " + descLower;

            if (c.type === CashFlowType.OUT) {
                periodExpenseList.push(c);

                let targetCategory = '';
                if (text.includes('gaji') || text.includes('upah') || text.includes('salary') || text.includes('lembur') || text.includes('bonus')) {
                    targetCategory = 'Beban Gaji & Upah';
                } else if (text.includes('listrik') || text.includes('pln') || text.includes('pdam') || text.includes('air') || text.includes('internet') || text.includes('wifi') || text.includes('pulsa') || text.includes('token')) {
                    targetCategory = 'Beban Listrik, Air & Internet';
                } else if (text.includes('makan') || text.includes('lunch') || text.includes('snack') || text.includes('konsumsi')) {
                    targetCategory = 'Beban Konsumsi & Makan Siang Karyawan';
                } else if (text.includes('reparasi') || text.includes('service') || text.includes('servis') || text.includes('bengkel') || text.includes('rusak')) {
                    targetCategory = 'Beban Reparasi & Servis';
                } else if (text.includes('perlengkapan') || text.includes('atk') || text.includes('kertas') || text.includes('nota') || text.includes('kresek') || text.includes('plastik')) {
                    targetCategory = 'Beban Perlengkapan & ATK';
                } else if (text.includes('panjar') || text.includes('kasbon') || text.includes('pinjaman')) {
                    targetCategory = 'Beban Panjar';
                } else if (text.includes('sewa') || text.includes('renovasi') || text.includes('gedung') || text.includes('pemeliharaan')) {
                    targetCategory = 'Beban Sewa & Pemeliharaan';
                } else if (text.includes('bensin') || text.includes('transport') || text.includes('bbm') || text.includes('ongkir') || text.includes('kurir') || text.includes('ekspedisi')) {
                    targetCategory = 'Beban Transportasi & Logistik';
                } else if (text.includes('iklan') || text.includes('promo') || text.includes('ads') || text.includes('brosur') || text.includes('marketing')) {
                    targetCategory = 'Beban Pemasaran & Promosi';
                } else if (text.includes('operasional') || text.includes('kebersihan') || text.includes('toko') || text.includes('kasir')) {
                    targetCategory = 'Beban Operasional Kasir & Toko';
                } else if (catStr && catStr !== 'Operasional' && catStr !== 'Lain-lain') {
                    targetCategory = catStr;
                } else {
                    targetCategory = 'Beban Operasional Lain-lain';
                }

                if (!categoriesMap[targetCategory]) {
                    categoriesMap[targetCategory] = 0;
                }
                if (!categoryItemsMap[targetCategory]) {
                    categoryItemsMap[targetCategory] = [];
                }

                categoriesMap[targetCategory] += (c.amount || 0);
                categoryItemsMap[targetCategory].push(c);

                if (c.paymentMethod === PaymentMethod.CASH || !c.paymentMethod) {
                    cashExpenses += (c.amount || 0);
                } else {
                    nonCashExpenses += (c.amount || 0);
                }
            }
        });

        const list = Object.entries(categoriesMap).map(([name, amount]) => ({
            name,
            amount,
            items: categoryItemsMap[name] || []
        }));
        const activeList = list.filter(item => item.amount > 0);
        const totalOperatingExpenses = list.reduce((sum, item) => sum + item.amount, 0);

        return {
            list,
            activeList,
            totalOperatingExpenses,
            cashExpenses,
            nonCashExpenses,
            periodExpenseList,
            categoryItemsMap
        };
    }, [filteredCashFlows]);

    // ========================================================
    // 5. INVENTORY ADJUSTMENT & COGS
    // ========================================================
    const stockAdjustmentMetrics = useMemo(() => {
        let opnameShrinkageLoss = 0;
        let opnameSurplusGain = 0;

        filteredStockAdjustments.forEach(adj => {
            const estHpp = (adj as any).hpp || 0;
            const val = adj.qty * estHpp;
            if (adj.type === 'DECREASE') {
                opnameShrinkageLoss += val;
            } else {
                opnameSurplusGain += val;
            }
        });

        const netInventoryAdjustment = opnameShrinkageLoss - opnameSurplusGain;
        return {
            opnameShrinkageLoss,
            opnameSurplusGain,
            netInventoryAdjustment
        };
    }, [filteredStockAdjustments]);

    // Total Cost of Goods Sold (Total HPP)
    const totalCOGS = salesMetrics.totalHppCost + stockAdjustmentMetrics.netInventoryAdjustment;
    // Gross Profit (Laba Kotor)
    const grossProfit = salesMetrics.netSales - totalCOGS;
    const grossProfitMargin = salesMetrics.netSales > 0 ? (grossProfit / salesMetrics.netSales) * 100 : 0;

    // Operating Profit (Laba Usaha Operasional / EBIT)
    const operatingProfit = grossProfit - expenseBreakdown.totalOperatingExpenses;
    const operatingProfitMargin = salesMetrics.netSales > 0 ? (operatingProfit / salesMetrics.netSales) * 100 : 0;

    // Non-operating items
    const nonOperatingMetrics = useMemo(() => {
        let otherIncome = 0;
        let otherExpense = 0;

        filteredCashFlows.forEach(c => {
            if (c.type === CashFlowType.IN && !c.referenceId && c.category !== 'Pelunasan Piutang') {
                otherIncome += c.amount;
            }
            if (c.type === CashFlowType.OUT && c.category === 'Dividen') {
                otherExpense += c.amount;
            }
        });

        const netNonOperating = otherIncome - otherExpense;
        return {
            otherIncome,
            otherExpense,
            netNonOperating
        };
    }, [filteredCashFlows]);

    // Net Profit (Laba Bersih Akhir)
    const netProfit = operatingProfit + nonOperatingMetrics.netNonOperating;
    const netProfitMargin = salesMetrics.netSales > 0 ? (netProfit / salesMetrics.netSales) * 100 : 0;

    // ========================================================
    // 6. NET PHYSICAL CASH IN HAND (SETORAN FISIK KASIR)
    // ========================================================
    const physicalCashSettlement = useMemo(() => {
        const cashIn = salesMetrics.cashSales + receivablesData.repaymentsCash;
        const cashOut = expenseBreakdown.cashExpenses;
        const nettoCash = cashIn - cashOut;

        return {
            cashIn,
            cashOut,
            nettoCash
        };
    }, [salesMetrics.cashSales, receivablesData.repaymentsCash, expenseBreakdown.cashExpenses]);

    // ========================================================
    // 7. DAILY PERFORMANCE BREAKDOWN
    // ========================================================
    const dailyMetrics = useMemo(() => {
        const daysMap = new Map<string, {
            dateStr: string;
            dayName: string;
            txCount: number;
            cashRevenue: number;
            nonCashRevenue: number;
            totalRevenue: number;
            totalHpp: number;
            expenses: number;
            netProfit: number;
        }>();

        const curr = new Date(periodRange.start);
        while (curr <= periodRange.end) {
            const dateStr = curr.toISOString().split('T')[0];
            const dayName = curr.toLocaleDateString('id-ID', { weekday: 'long' });
            daysMap.set(dateStr, {
                dateStr,
                dayName,
                txCount: 0,
                cashRevenue: 0,
                nonCashRevenue: 0,
                totalRevenue: 0,
                totalHpp: 0,
                expenses: 0,
                netProfit: 0
            });
            curr.setDate(curr.getDate() + 1);
        }

        filteredTransactions.forEach(t => {
            const dStr = parseSafeDate(t.date).toISOString().split('T')[0];
            if (daysMap.has(dStr)) {
                const day = daysMap.get(dStr)!;
                if (t.type === TransactionType.RETURN) {
                    day.totalRevenue -= Math.abs(t.totalAmount || 0);
                } else {
                    day.txCount++;
                    const amt = t.totalAmount || 0;
                    if (t.paymentMethod === PaymentMethod.CASH) {
                        day.cashRevenue += amt;
                    } else {
                        day.nonCashRevenue += amt;
                    }
                    day.totalRevenue += amt;

                    (t.items || []).forEach(item => {
                        day.totalHpp += (item.hpp || 0) * (item.qty || 1);
                    });
                }
            }
        });

        filteredCashFlows.forEach(c => {
            const dStr = parseSafeDate(c.date).toISOString().split('T')[0];
            if (daysMap.has(dStr) && c.type === CashFlowType.OUT && (!c.referenceId || c.category === 'Operasional' || c.category === 'Beban Gaji')) {
                const day = daysMap.get(dStr)!;
                day.expenses += c.amount;
            }
        });

        let bestDaySales = 0;
        let bestDayDate = '';
        const daysArray = Array.from(daysMap.values()).map(day => {
            day.netProfit = day.totalRevenue - day.totalHpp - day.expenses;
            if (day.totalRevenue > bestDaySales) {
                bestDaySales = day.totalRevenue;
                bestDayDate = `${day.dayName}, ${day.dateStr.split('-').reverse().join('/')}`;
            }
            return day;
        });

        const activeDaysCount = daysArray.filter(d => d.totalRevenue > 0).length || 1;
        const avgDailySales = salesMetrics.netSales / (activeDaysCount || 1);

        return {
            daysArray,
            bestDaySales,
            bestDayDate,
            avgDailySales,
            activeDaysCount,
            totalDays: daysArray.length
        };
    }, [periodRange, filteredTransactions, filteredCashFlows, salesMetrics.netSales]);

    // Default Note Auto Generator
    const defaultAutoNote = useMemo(() => {
        return `Telah dilaksanakan Rekapitulasi Keuangan & Tutup Buku untuk ${periodRange.title} (${periodRange.label}). ` +
            `Total Pemasukan Bruto tercatat sebesar ${formatIDR(salesMetrics.grossSales)}, dengan Laba Bersih Operasional sebesar ${formatIDR(netProfit)}. ` +
            `Total Piutang Berjalan toko saat ini tercatat sebesar ${formatIDR(receivablesData.totalAllActiveDebtRemaining)} (${receivablesData.debtCount} transaksi tempo/bon). ` +
            `Seluruh uang fisik kasir telah diverifikasi dengan setoran tunai netto sebesar ${formatIDR(physicalCashSettlement.nettoCash)}.`;
    }, [periodRange, salesMetrics.grossSales, netProfit, receivablesData, physicalCashSettlement]);

    const activeNote = isNoteEdited ? customNote : defaultAutoNote;

    // Helper for formatting zero / nominal nicely
    const renderNominal = (val: number, colorClass: string = 'text-slate-900', isNegative: boolean = false) => {
        if (!val || val === 0) {
            return <span className="text-slate-300 font-light">-</span>;
        }
        return <span className={colorClass}>{isNegative ? `- ${formatIDR(val)}` : formatIDR(val)}</span>;
    };

    // Current cashier name
    const cashierDisplayName = useMemo(() => {
        return (currentUser?.name || currentUser?.username || 'RIDWAN ELLY').toUpperCase();
    }, [currentUser]);

    // Helper to get default date for form within currently viewed periodRange
    const getPeriodDefaultDate = (range: typeof periodRange) => {
        const now = new Date();
        const nowTime = now.getTime();
        if (nowTime >= range.startTime && nowTime <= range.endTime) {
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        const d = range.end;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const handleOpenExpenseModal = () => {
        setEditingExpenseId(null);
        setExpenseForm(prev => ({
            ...prev,
            date: getPeriodDefaultDate(periodRange),
            amount: '',
            description: '',
            category: 'Beban Operasional Kasir & Toko',
            customCategory: '',
            paymentMethod: PaymentMethod.CASH,
            bankId: ''
        }));
        setShowExpenseModal(true);
    };

    const handleEditExpense = (cf: CashFlow) => {
        setEditingExpenseId(cf.id);
        const isStandard = OPEX_CATEGORIES.includes(cf.category);
        const numAmount = cf.amount || 0;
        setExpenseForm({
            date: cf.date ? cf.date.slice(0, 10) : getPeriodDefaultDate(periodRange),
            category: isStandard ? cf.category : 'LAINNYA',
            customCategory: isStandard ? '' : cf.category,
            description: cf.description || '',
            amount: numAmount > 0 ? new Intl.NumberFormat('id-ID').format(numAmount) : '',
            paymentMethod: (cf.paymentMethod as PaymentMethod) || PaymentMethod.CASH,
            bankId: cf.bankId || ''
        });
        setCategoryDetailsModal(null);
        setShowExpenseModal(true);
    };

    // ========================================================
    // MANUAL EXPENSE HANDLERS
    // ========================================================
    const handleSaveExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        const numAmount = parseFloat(expenseForm.amount.replace(/[^0-9]/g, '')) || 0;
        if (numAmount <= 0) {
            alert('Silakan masukkan nominal pengeluaran yang valid.');
            return;
        }
        if (!expenseForm.description.trim()) {
            alert('Silakan masukkan keterangan pengeluaran operasional.');
            return;
        }

        const chosenCategory = expenseForm.category === 'LAINNYA'
            ? (expenseForm.customCategory.trim() || 'Beban Operasional Lain-lain')
            : expenseForm.category;

        setIsSubmittingExpense(true);
        try {
            const selectedBank = banks.find(b => b.id === expenseForm.bankId);
            const entryTime = new Date().toTimeString().split(' ')[0];
            const entryDate = expenseForm.date ? `${expenseForm.date} ${entryTime}` : toMySQLDate(new Date());

            if (editingExpenseId) {
                const updatedCf: CashFlow = {
                    id: editingExpenseId,
                    date: entryDate,
                    type: CashFlowType.OUT,
                    category: chosenCategory,
                    description: expenseForm.description.trim(),
                    amount: numAmount,
                    paymentMethod: expenseForm.paymentMethod,
                    bankId: expenseForm.bankId || undefined,
                    bankName: selectedBank?.bankName || undefined,
                    userId: currentUser?.id || undefined,
                    userName: currentUser?.name || currentUser?.username || 'Kasir'
                };
                await StorageService.updateCashFlow(updatedCf);
            } else {
                const newCf: CashFlow = {
                    id: generateId(),
                    date: entryDate,
                    type: CashFlowType.OUT,
                    category: chosenCategory,
                    description: expenseForm.description.trim(),
                    amount: numAmount,
                    paymentMethod: expenseForm.paymentMethod,
                    bankId: expenseForm.bankId || undefined,
                    bankName: selectedBank?.bankName || undefined,
                    userId: currentUser?.id || undefined,
                    userName: currentUser?.name || currentUser?.username || 'Kasir'
                };
                await StorageService.addCashFlow(newCf);
            }

            // Check if the saved expense falls in the current view
            const expParsed = parseSafeDate(entryDate);
            const expTime = expParsed.getTime();
            const isInCurrentPeriod = expTime >= periodRange.startTime && expTime <= periodRange.endTime;

            if (!isInCurrentPeriod) {
                if (periodMode === 'tutup_buku') {
                    const targetMonth = expParsed.getDate() >= 18 ? (expParsed.getMonth() + 1) % 12 : expParsed.getMonth();
                    const targetYear = (expParsed.getDate() >= 18 && expParsed.getMonth() === 11) ? expParsed.getFullYear() + 1 : expParsed.getFullYear();
                    setSelectedMonth(targetMonth);
                    setSelectedYear(targetYear);
                } else {
                    setSelectedMonth(expParsed.getMonth());
                    setSelectedYear(expParsed.getFullYear());
                }
            }

            // Reset form
            setEditingExpenseId(null);
            setExpenseForm({
                date: getPeriodDefaultDate(periodRange),
                category: 'Beban Operasional Kasir & Toko',
                customCategory: '',
                description: '',
                amount: '',
                paymentMethod: PaymentMethod.CASH,
                bankId: ''
            });
            setShowExpenseModal(false);
        } catch (err: any) {
            console.error(err);
            alert(`Gagal menyimpan pengeluaran: ${err.message || err}`);
        } finally {
            setIsSubmittingExpense(false);
        }
    };

    const handleDeleteExpense = async (id: string) => {
        if (!confirm('Yakin ingin menghapus catatan pengeluaran ini?')) return;
        try {
            await StorageService.deleteCashFlow(id);
        } catch (err: any) {
            console.error(err);
            alert(`Gagal menghapus pengeluaran: ${err.message || err}`);
        }
    };

    // Actions
    const handlePrint = () => {
        window.print();
    };

    const handleExportExcel = () => {
        const storeName = storeSettings?.name || 'RUMAH ETNIK PAPUA';
        const closingTitle = `BERITA ACARA REKAPITULASI KEUANGAN & TUTUP BUKU - ${storeName.toUpperCase()}`;

        const mainSheetData: any[] = [
            { 'A': closingTitle, 'B': '', 'C': '', 'D': '' },
            { 'A': `Periode: ${periodRange.label}`, 'B': '', 'C': '', 'D': '' },
            { 'A': `Kasir / Admin: ${cashierDisplayName}`, 'B': '', 'C': '', 'D': '' },
            { 'A': `Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 'B': '', 'C': '', 'D': '' },
            { 'A': '', 'B': '', 'C': '', 'D': '' },
            { 'A': 'I. REKAPITULASI PENDAPATAN PENJUALAN', 'B': 'TUNAI (Rp)', 'C': 'NON-TUNAI/QR (Rp)', 'D': 'TOTAL (Rp)' },
            ...categoryRows.map(r => ({
                'A': r.name,
                'B': r.tunai,
                'C': r.nonTunai,
                'D': r.tunai + r.nonTunai + r.tempo
            })),
            { 'A': 'TOTAL PENDAPATAN PENJUALAN', 'B': categoryTotals.totalTunai, 'C': categoryTotals.totalNonTunai, 'D': categoryTotals.grandTotalRevenue },
            { 'A': '', 'B': '', 'C': '', 'D': '' },
            { 'A': 'II. REKAPITULASI HPP & LABA KOTOR', 'B': 'Jumlah (Rp)', 'C': 'Rasio (%)', 'D': '' },
            { 'A': 'Penjualan Bersih (Net Sales)', 'B': salesMetrics.netSales, 'C': '100.0%', 'D': '' },
            { 'A': 'Total Modal HPP Barang', 'B': totalCOGS, 'C': `${((totalCOGS / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%`, 'D': '' },
            { 'A': 'Laba Kotor (Gross Profit)', 'B': grossProfit, 'C': `${grossProfitMargin.toFixed(1)}%`, 'D': '' },
            { 'A': '', 'B': '', 'C': '', 'D': '' },
            { 'A': 'III. BEBAN OPERASIONAL (OPEX)', 'B': 'Jumlah (Rp)', 'C': 'Rasio (%)', 'D': '' },
            ...(expenseBreakdown.activeList.length > 0
                ? expenseBreakdown.activeList.map(exp => ({
                    'A': exp.name,
                    'B': exp.amount,
                    'C': `${((exp.amount / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%`,
                    'D': ''
                }))
                : [{ 'A': 'Belum ada pengeluaran terinput', 'B': 0, 'C': '0.0%', 'D': '' }]
            ),
            { 'A': 'TOTAL BEBAN OPERASIONAL', 'B': expenseBreakdown.totalOperatingExpenses, 'C': `${((expenseBreakdown.totalOperatingExpenses / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%`, 'D': '' },
            { 'A': '', 'B': '', 'C': '', 'D': '' },
            { 'A': 'IV. LABA BERSIH (NET PROFIT)', 'B': netProfit, 'C': `${netProfitMargin.toFixed(1)}%`, 'D': '' },
            { 'A': 'V. SETORAN FISIK KASIR (NETTO)', 'B': physicalCashSettlement.nettoCash, 'C': 'Uang Fisik Kasir', 'D': '' },
            { 'A': '', 'B': '', 'C': '', 'D': '' },
            { 'A': 'VI. RINGKASAN PIUTANG PERIODE TUTUP BUKU', 'B': 'Jumlah (Rp)', 'C': '', 'D': '' },
            { 'A': 'Total Penjualan Tempo / Bon Baru', 'B': receivablesData.totalNewDebtIssued, 'C': '', 'D': '' },
            { 'A': 'Total Pelunasan Piutang Masuk', 'B': receivablesData.totalRepaymentsReceived, 'C': '', 'D': '' },
            { 'A': 'Sisa Piutang Berjalan Toko Belum Lunas', 'B': receivablesData.totalAllActiveDebtRemaining, 'C': '', 'D': '' }
        ];

        exportToExcel(
            mainSheetData,
            `Berita_Acara_Tutup_Buku_${months[selectedMonth]}_${selectedYear}`,
            'Berita Acara',
            [{ wch: 42 }, { wch: 20 }, { wch: 20 }, { wch: 20 }]
        );
    };

    const handleExportCSV = () => {
        const headers = ['Komponen Keuangan', 'Tunai (Rp)', 'Non-Tunai (Rp)', 'Total (Rp)'];
        const rows = [
            ['Total Penjualan Bruto', salesMetrics.cashSales, salesMetrics.qrSales + salesMetrics.transferSales, salesMetrics.grossSales],
            ['Total HPP / Modal', categoryTotals.totalHppTunai, categoryTotals.totalHppNonTunai, totalCOGS],
            ['Laba Kotor (Gross Profit)', categoryTotals.profitTunai, categoryTotals.profitNonTunai, grossProfit],
            ['Total Beban Operasional', expenseBreakdown.cashExpenses, expenseBreakdown.nonCashExpenses, expenseBreakdown.totalOperatingExpenses],
            ['Laba Bersih (Net Profit)', '-', '-', netProfit],
            ['Setoran Kasir Tunai Netto', physicalCashSettlement.nettoCash, '-', physicalCashSettlement.nettoCash],
            ['Total Piutang Baru Terbit', '-', '-', receivablesData.totalNewDebtIssued],
            ['Total Pelunasan Piutang Diterima', '-', '-', receivablesData.totalRepaymentsReceived],
            ['Total Sisa Piutang Berjalan', '-', '-', receivablesData.totalAllActiveDebtRemaining]
        ];

        exportToCSV(`berita-acara-tutup-buku-${months[selectedMonth]}-${selectedYear}.csv`, headers, rows);
    };

    const handleShareWhatsApp = async () => {
        try {
            setIsSharingWA(true);
            const storeName = storeSettings?.name || 'RUMAH ETNIK PAPUA';
            const docEl = document.getElementById("printable-berita-acara-document");

            const fileName = `Berita_Acara_Tutup_Buku_${months[selectedMonth]}_${selectedYear}.pdf`;

            // 1. Generate & auto-download official PDF document
            if (docEl) {
                const canvas = await html2canvas(docEl, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: "#ffffff"
                });
                const imgData = canvas.toDataURL("image/png");
                const pdf = new jsPDF({
                    orientation: "portrait",
                    unit: "mm",
                    format: "a4"
                });
                const pdfWidth = 210;
                const pdfHeight = 297;
                const imgHeight = (canvas.height * pdfWidth) / canvas.width;
                pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, Math.min(pdfHeight, imgHeight));
                pdf.save(fileName);
            }

            // 2. Prepare WhatsApp message
            const message = `*BERITA ACARA REKAPITULASI KEUANGAN & TUTUP BUKU*
*${storeName.toUpperCase()} - WISATA BUDAYA PAPUA*
📅 *Periode:* ${periodRange.label}
🏛️ *Siklus:* ${periodRange.title}

*1. REKAPITULASI PENDAPATAN*
- Penjualan Tunai: ${formatIDR(salesMetrics.cashSales)}
- Penjualan QRIS: ${formatIDR(salesMetrics.qrSales)}
- Penjualan Transfer: ${formatIDR(salesMetrics.transferSales)}
- Penjualan Tempo/Bon: ${formatIDR(salesMetrics.debtSales)}
👉 *TOTAL OMZET BRUTO: ${formatIDR(salesMetrics.grossSales)}*

*2. MODAL & LABA KOTOR*
- Total HPP / Modal Produk: ${formatIDR(totalCOGS)}
👉 *LABA KOTOR (GROSS PROFIT): ${formatIDR(grossProfit)} (${grossProfitMargin.toFixed(1)}%)*

*3. BEBAN OPERASIONAL (OPEX)*
- Total Pengeluaran: ${formatIDR(expenseBreakdown.totalOperatingExpenses)}

*4. LABA BERSIH AKHIR (NET PROFIT)*
💰 *LABA BERSIH NETTO: ${formatIDR(netProfit)} (${netProfitMargin.toFixed(1)}%)*

*5. REKAPITULASI PIUTANG TOKO (BON)*
- Total Piutang Baru: ${formatIDR(receivablesData.totalNewDebtIssued)}
- Pelunasan Diterima: ${formatIDR(receivablesData.totalRepaymentsReceived)}
- Sisa Piutang Berjalan: ${formatIDR(receivablesData.totalAllActiveDebtRemaining)} (${receivablesData.debtCount} transaksi)

*6. SETORAN FISIK KASIR*
💵 *SETORAN TUNAI BERSIH (NETTO): ${formatIDR(physicalCashSettlement.nettoCash)}*

_Laporan resmi dibuat oleh: ${cashierDisplayName}_
_Tanggal cetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}_

📄 _Dokumen PDF resmi Berita Acara telah otomatis diunduh ke perangkat Anda. Silakan lampirkan file PDF tersebut pada chat WhatsApp Web ini._`;

            const encoded = encodeURIComponent(message);
            const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const waUrl = isMobile
                ? `https://api.whatsapp.com/send?text=${encoded}`
                : `https://web.whatsapp.com/send?text=${encoded}`;

            window.open(waUrl, '_blank');
        } catch (err) {
            console.error("Error sharing to WhatsApp Web:", err);
            alert("Gagal membagikan ke WhatsApp Web: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsSharingWA(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in print:bg-white print:p-0 p-2 md:p-0">
            {/* Custom Print Stylesheet: Single A4 Page Perfect Fit with Executive Typography */}
            <style jsx global>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 4.5mm 6.5mm 4.5mm 6.5mm;
                    }
                    *, *::before, *::after {
                        box-sizing: border-box !important;
                    }
                    html, body {
                        background: #ffffff !important;
                        color: #0f172a !important;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                        font-size: 7.4pt !important;
                        line-height: 1.2 !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    aside, nav, header, .print-hidden, .print\\:hidden {
                        display: none !important;
                    }
                    main, main > div {
                        padding: 0 !important;
                        margin: 0 !important;
                        max-width: 100% !important;
                        overflow: visible !important;
                        border: none !important;
                        box-shadow: none !important;
                        background: transparent !important;
                    }
                    #printable-berita-acara-document {
                        width: 100% !important;
                        max-width: 100% !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        page-break-after: avoid !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .ba-header-bar {
                        background-color: #3b1604 !important;
                        color: #ffffff !important;
                        font-weight: 800 !important;
                        font-size: 7.5pt !important;
                        padding: 2.5px 6px !important;
                        border-radius: 3px !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.3px !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .ba-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        font-size: 7.1pt !important;
                        line-height: 1.18 !important;
                    }
                    .ba-table th, .ba-table td {
                        border: 1px solid #cbd5e1 !important;
                        padding: 1.6px 4px !important;
                        vertical-align: middle !important;
                    }
                    .ba-table th {
                        background-color: #f1f5f9 !important;
                        font-weight: 800 !important;
                        text-align: center !important;
                        color: #1e293b !important;
                        font-size: 7pt !important;
                    }
                    .ba-highlight-yellow {
                        background-color: #fef08a !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .ba-highlight-green {
                        background-color: #dcfce7 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .ba-highlight-pink {
                        background-color: #fee2e2 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
            `}</style>

            {/* Top Toolbar & Header Banner */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-200 pb-4 print:hidden">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-gradient-to-br from-amber-700 to-amber-900 text-white rounded-xl shadow-md shadow-amber-800/20">
                            <FileText size={22} />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                Laporan Pemasukan & Tutup Buku
                                <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-bold border border-amber-300">
                                    {periodMode === 'tutup_buku' ? 'Tgl 18 s/d 17' : 'Bulan Kalender'}
                                </span>
                            </h1>
                            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                                Rekapitulasi keuangan, pemasukan tunai & non-tunai, piutang, pengeluaran, serta laba bersih periode tutup buku berformat Berita Acara
                            </p>
                        </div>
                    </div>
                </div>

                {/* Period Selector & Action Controls */}
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    {/* Period Mode Switch (18 s/d 17 vs Kalender) */}
                    <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl border border-slate-300 text-xs font-bold shadow-2xs">
                        <button
                            type="button"
                            onClick={() => setPeriodMode('tutup_buku')}
                            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${periodMode === 'tutup_buku'
                                ? 'bg-amber-800 text-white shadow-xs'
                                : 'text-slate-700 hover:text-slate-900'}`}
                            title="Siklus Tutup Buku (Tgl 18 bulan lalu s/d 17 bulan ini)"
                        >
                            <Sparkles size={13} />
                            Tutup Buku (18 s/d 17)
                        </button>
                        <button
                            type="button"
                            onClick={() => setPeriodMode('calendar')}
                            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${periodMode === 'calendar'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-700 hover:text-slate-900'}`}
                            title="Siklus Bulan Kalender (Tgl 1 s/d Akhir Bulan)"
                        >
                            <Calendar size={13} />
                            Kalender (1 s/d 31)
                        </button>
                    </div>

                    {/* Month Year Navigator Box */}
                    <div className="flex items-center bg-white border border-slate-300 rounded-xl p-1 shadow-xs">
                        <button
                            type="button"
                            onClick={handlePrevMonth}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Periode Sebelumnya"
                        >
                            <ChevronLeft size={16} />
                        </button>

                        <div className="flex items-center gap-1 px-2">
                            <Calendar size={14} className="text-amber-700" />
                            <select
                                className="bg-transparent font-extrabold text-xs text-slate-800 outline-none cursor-pointer"
                                value={selectedMonth}
                                onChange={e => setSelectedMonth(Number(e.target.value))}
                            >
                                {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                            <span className="text-slate-300 font-light">/</span>
                            <select
                                className="bg-transparent font-extrabold text-xs text-slate-800 outline-none cursor-pointer"
                                value={selectedYear}
                                onChange={e => setSelectedYear(Number(e.target.value))}
                            >
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={handleNextMonth}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Periode Berikutnya"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {/* Button Input Manual Pengeluaran (OPEX) */}
                    <button
                        onClick={handleOpenExpenseModal}
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
                        title="Input Manual Beban Operasional / Pengeluaran (OPEX)"
                    >
                        <PlusCircle size={15} /> + Input Biaya (OPEX)
                    </button>

                    {/* Action Buttons Toolbar */}
                    <button
                        onClick={handlePrint}
                        className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                        title="Cetak Dokumen Berita Acara A4"
                    >
                        <Printer size={15} className="text-slate-600" /> Cetak Berita Acara
                    </button>
                    <button
                        onClick={handleExportExcel}
                        className="px-3.5 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                        title="Ekspor Spreadsheet Excel"
                    >
                        <FileSpreadsheet size={15} className="text-emerald-700" /> Excel
                    </button>
                    <button
                        onClick={handleShareWhatsApp}
                        disabled={isSharingWA}
                        className="px-3.5 py-2 bg-[#25D366] hover:bg-[#20ba5a] disabled:bg-green-300 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
                        title="Ekspor PDF Dokumen & Otomatis Buka WhatsApp Web"
                    >
                        {isSharingWA ? <Loader2 size={14} className="animate-spin" /> : <WhatsAppIcon size={14} />} WhatsApp Web
                    </button>
                </div>
            </div>

            {/* Active Period Notification Bar */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-3 flex flex-wrap justify-between items-center gap-3 print:hidden shadow-2xs">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-amber-200/70 text-amber-900 rounded-xl">
                        <Clock size={16} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-amber-950 uppercase tracking-wider">{periodRange.title}</span>
                            <span className="bg-amber-600 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                                {periodRange.shortLabel}
                            </span>
                        </div>
                        <p className="text-xs text-amber-800/90 mt-0.5">
                            Rentang waktu resmi: <strong>{periodRange.label}</strong> ({dailyMetrics.totalDays} hari siklus pembukuan)
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                        <span className="text-slate-500 block text-[10px]">Total Transaksi</span>
                        <strong className="text-slate-800 text-sm">{salesMetrics.totalTransactionsCount} Trx</strong>
                    </div>
                    <div className="h-6 w-px bg-amber-300"></div>
                    <div className="text-right">
                        <span className="text-slate-500 block text-[10px]">Hari Aktif Penjualan</span>
                        <strong className="text-amber-900 text-sm">{dailyMetrics.activeDaysCount} Hari</strong>
                    </div>
                </div>
            </div>

            {/* Executive KPI Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 print:hidden">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Pemasukan (Omzet)</p>
                        <h3 className="text-lg font-black text-slate-900 mt-1 font-mono">{formatIDR(salesMetrics.grossSales)}</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Tunai: {formatIDR(salesMetrics.cashSales)}</p>
                    </div>
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                        <TrendingUp size={20} />
                    </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-1">
                            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Laba Kotor</p>
                            <span className="bg-emerald-100 text-emerald-800 text-[9px] font-mono font-bold px-1 rounded">
                                {grossProfitMargin.toFixed(1)}%
                            </span>
                        </div>
                        <h3 className="text-lg font-black text-emerald-600 mt-1 font-mono">{formatIDR(grossProfit)}</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">HPP: {formatIDR(totalCOGS)}</p>
                    </div>
                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                        <Percent size={20} />
                    </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Pengeluaran (Opex)</p>
                            <button
                                onClick={handleOpenExpenseModal}
                                className="text-[10px] text-rose-600 hover:text-rose-800 font-bold flex items-center gap-0.5 ml-1"
                            >
                                <Plus size={12} /> Input
                            </button>
                        </div>
                        <h3 className="text-lg font-black text-rose-600 mt-1 font-mono">{formatIDR(expenseBreakdown.totalOperatingExpenses)}</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Rasio: {((expenseBreakdown.totalOperatingExpenses / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%</p>
                    </div>
                    <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                        <TrendingDown size={20} />
                    </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-1">
                            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Piutang Toko</p>
                            <span className="bg-amber-100 text-amber-800 text-[9px] font-mono font-bold px-1 rounded">
                                {receivablesData.debtCount} Trx
                            </span>
                        </div>
                        <h3 className="text-lg font-black text-amber-700 mt-1 font-mono">{formatIDR(receivablesData.totalAllActiveDebtRemaining)}</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Lunas Diterima: {formatIDR(receivablesData.totalRepaymentsReceived)}</p>
                    </div>
                    <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl shrink-0">
                        <CreditCard size={20} />
                    </div>
                </div>

                <div className="bg-gradient-to-br from-amber-800 to-amber-950 p-3.5 rounded-2xl border border-amber-700 shadow-md text-white flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-1 text-amber-200">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider">Laba Bersih Netto</p>
                            <span className="bg-white/20 text-white text-[9px] font-mono font-bold px-1 rounded">
                                {netProfitMargin.toFixed(1)}%
                            </span>
                        </div>
                        <h3 className="text-xl font-black mt-1 font-mono text-white">{formatIDR(netProfit)}</h3>
                        <p className="text-[10px] text-amber-200 mt-0.5">Setoran Kasir: {formatIDR(physicalCashSettlement.nettoCash)}</p>
                    </div>
                    <div className="p-2.5 bg-white/15 rounded-xl shrink-0 text-white">
                        <PiggyBank size={22} />
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden print:border-none print:shadow-none">
                <div className="p-2 bg-slate-100/90 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2 print:hidden">
                    <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                        <button
                            type="button"
                            onClick={() => setActiveTab('berita_acara')}
                            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'berita_acara'
                                ? 'bg-amber-800 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                        >
                            <FileText size={14} />
                            1. Dokumen Berita Acara
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('income_statement')}
                            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'income_statement'
                                ? 'bg-amber-800 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                        >
                            <Calculator size={14} />
                            2. Laba Rugi (Income Statement)
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('category_breakdown')}
                            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'category_breakdown'
                                ? 'bg-amber-800 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                        >
                            <Tag size={14} />
                            3. Kinerja per Kategori
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('receivables')}
                            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'receivables'
                                ? 'bg-amber-800 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                        >
                            <CreditCard size={14} />
                            4. Rekap Piutang Pelanggan (BON)
                            {receivablesData.debtCount > 0 && (
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${activeTab === 'receivables' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                                    {receivablesData.debtCount}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('cash_flow')}
                            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'cash_flow'
                                ? 'bg-amber-800 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                        >
                            <Wallet size={14} />
                            5. Rincian Arus Kas & Biaya
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('daily_trend')}
                            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'daily_trend'
                                ? 'bg-amber-800 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                        >
                            <CalendarDays size={14} />
                            6. Rekap Kalender Harian
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleOpenExpenseModal}
                            className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1"
                        >
                            <Plus size={13} /> Input Biaya
                        </button>
                        <div className="text-xs font-extrabold text-amber-900 font-mono bg-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-200">
                            {periodRange.shortLabel}
                        </div>
                    </div>
                </div>

                {/* ======================================================== */}
                {/* TAB 1: DOKUMEN RESMI BERITA ACARA TUTUP BUKU (EXACT MATCH) */}
                {/* ======================================================== */}
                {(activeTab === 'berita_acara' || typeof window !== 'undefined') && (
                    <div className={`p-2 sm:p-5 ${activeTab !== 'berita_acara' ? 'hidden print:block' : ''}`}>
                        <div
                            id="printable-berita-acara-document"
                            className="bg-white p-3 sm:p-5 border border-slate-200 print:border-none rounded-xl shadow-xs print:shadow-none space-y-2.5 print:space-y-1.5 text-[11px] print:text-[7pt]"
                        >
                            {/* Kop Surat Berita Acara Resmi */}
                            <div className="border-b-2 border-[#3b1604] pb-1.5 mb-1.5 print:pb-1 print:mb-1">
                                <div className="flex items-center justify-between">
                                    <div className="w-[18%] flex items-center justify-start">
                                        <img
                                            src="/logokasir.jpg"
                                            alt="Logo Kasir"
                                            style={{ height: '46px', objectFit: 'contain' }}
                                            onError={(e: any) => {
                                                e.target.onerror = null;
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                    </div>
                                    <div className="w-[82%] text-center">
                                        <h1 className="text-sm sm:text-base print:text-[10.5pt] font-black uppercase tracking-wide text-slate-900 leading-tight">
                                            BERITA ACARA REKAPITULASI KEUANGAN & TUTUP BUKU
                                        </h1>
                                        <h2 className="text-[10px] print:text-[7.2pt] font-extrabold uppercase text-slate-800 tracking-normal mt-0.5">
                                            LAPORAN PEMASUKAN, PENGELUARAN, DAN PIUTANG USAHA
                                        </h2>
                                        <h3 className="text-[10px] print:text-[7.5pt] font-bold text-amber-950 uppercase italic mt-0.5">
                                            {storeSettings?.name || 'RUMAH ETNIK PAPUA'} - {storeSettings?.jargon || 'WISATA BUDAYA PAPUA'}
                                        </h3>
                                        <p className="text-[9px] print:text-[6.2pt] text-slate-600 mt-0.5">
                                            {storeSettings?.address || 'Jalan Raya Aimas-Klamono, KM 21, Malawili, Kecamatan Aimas, Kabupaten Sorong, Papua Barat Daya'} • Telp: {storeSettings?.phone || '082199867918'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Section I: IDENTITAS LAPORAN & SIKLUS TUTUP BUKU */}
                            <div className="border border-slate-300 rounded-md overflow-hidden text-[10.5px] print:text-[6.8pt]">
                                <div className="bg-[#3b1604] text-white font-extrabold px-2.5 py-1 uppercase tracking-wider text-[11px] print:text-[7.4pt] flex justify-between items-center ba-header-bar">
                                    <span>I. IDENTITAS LAPORAN & SIKLUS TUTUP BUKU</span>
                                    <span className="text-[8.5px] print:text-[6pt] font-mono bg-white/20 px-2 py-0.2 rounded font-bold">
                                        NO: BA-TB/{selectedYear}/{String(selectedMonth + 1).padStart(2, '0')}/01
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 p-2 print:p-1.5 font-medium bg-white">
                                    <div className="space-y-1">
                                        <div className="flex items-center">
                                            <span className="w-28 text-slate-600 shrink-0">Siklus Pembukuan</span>
                                            <span className="mr-2">:</span>
                                            <span className="font-bold text-slate-900">{periodRange.title}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <span className="w-28 text-slate-600 shrink-0">Rentang Tanggal</span>
                                            <span className="mr-2">:</span>
                                            <span className="font-bold text-amber-950 font-mono bg-yellow-100/90 px-1.5 py-0.5 rounded border border-yellow-300 text-[10px] print:text-[6.8pt]">
                                                {periodRange.label}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center">
                                            <span className="w-24 text-slate-600 shrink-0">Kasir / Admin</span>
                                            <span className="mr-2">:</span>
                                            <span className="font-extrabold text-slate-900 uppercase">{cashierDisplayName}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <span className="w-24 text-slate-600 shrink-0">Tanggal Cetak</span>
                                            <span className="mr-2">:</span>
                                            <span className="font-medium text-slate-800">
                                                {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RINGKASAN EKSEKUTIF PIMPINAN (EXECUTIVE HIGHLIGHT CARDS) */}
                            <div className="grid grid-cols-4 gap-1.5 print:gap-1.5 text-center">
                                <div className="p-1.5 bg-blue-50/70 border border-blue-200 rounded text-slate-900">
                                    <span className="text-[8px] print:text-[5.5pt] font-extrabold text-blue-800 uppercase block">1. OMZET BRUTO</span>
                                    <strong className="text-[11px] print:text-[7.6pt] font-mono font-black text-slate-900">{formatIDR(salesMetrics.grossSales)}</strong>
                                </div>
                                <div className="p-1.5 bg-red-50/70 border border-red-200 rounded text-slate-900">
                                    <span className="text-[8px] print:text-[5.5pt] font-extrabold text-red-800 uppercase block">2. MODAL HPP</span>
                                    <strong className="text-[11px] print:text-[7.6pt] font-mono font-black text-red-700">{formatIDR(totalCOGS)}</strong>
                                </div>
                                <div className="p-1.5 bg-[#dcfce7] border border-emerald-300 rounded text-slate-900 ba-highlight-green">
                                    <span className="text-[8px] print:text-[5.5pt] font-extrabold text-emerald-800 uppercase block">3. LABA BERSIH (NET)</span>
                                    <strong className="text-[11.5px] print:text-[8pt] font-mono font-black text-emerald-800">{formatIDR(netProfit)}</strong>
                                </div>
                                <div className="p-1.5 bg-[#fef08a] border border-yellow-400 rounded text-slate-900 ba-highlight-yellow">
                                    <span className="text-[8px] print:text-[5.5pt] font-extrabold text-amber-900 uppercase block">4. SETORAN TUNAI KASIR</span>
                                    <strong className="text-[11.5px] print:text-[8pt] font-mono font-black text-slate-950">{formatIDR(physicalCashSettlement.nettoCash)}</strong>
                                </div>
                            </div>

                            {/* Section II & III: LAPORAN PENJUALAN TUNAI & NON-TUNAI (SIDE BY SIDE) */}
                            <div className="grid grid-cols-2 gap-2.5 print:gap-2">
                                {/* Section II: TUNAI */}
                                <div className="border border-slate-300 rounded-md overflow-hidden">
                                    <div className="bg-[#3b1604] text-white font-extrabold px-2 py-1 uppercase tracking-wider text-[10px] print:text-[7pt] ba-header-bar">
                                        II. LAPORAN PENJUALAN (TUNAI / CASH)
                                    </div>
                                    <table className="w-full text-left border-collapse ba-table text-[10px] print:text-[6.6pt]">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '6%' }}>No</th>
                                                <th style={{ width: '38%' }}>Sumber Pendapatan</th>
                                                <th style={{ width: '18%' }}>Pendapatan</th>
                                                <th style={{ width: '18%' }}>Modal</th>
                                                <th style={{ width: '20%' }}>Keuntungan</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categoryRows.map((row, idx) => {
                                                const laba = row.tunai - row.hppTunai;
                                                const isEmpty = row.tunai === 0 && row.hppTunai === 0;
                                                return (
                                                    <tr key={`tunai-${idx}`} className="hover:bg-slate-50">
                                                        <td className="text-center font-mono text-slate-600">{idx + 1}</td>
                                                        <td className="font-medium text-slate-800">{row.name}</td>
                                                        <td className="text-right font-mono font-bold text-slate-900">
                                                            {renderNominal(row.tunai, 'font-bold text-slate-900')}
                                                        </td>
                                                        <td className="text-right font-mono font-bold text-red-600">
                                                            {renderNominal(row.hppTunai, 'font-bold text-red-600')}
                                                        </td>
                                                        <td className="text-right font-mono font-bold text-emerald-600">
                                                            {isEmpty ? <span className="text-slate-300 font-light">-</span> : formatIDR(laba)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="bg-[#fef08a] font-extrabold text-slate-900 ba-highlight-yellow border-t border-slate-300">
                                                <td colSpan={2} className="text-right uppercase">TOTAL PENJUALAN TUNAI</td>
                                                <td className="text-right font-mono font-black">{formatIDR(categoryTotals.totalTunai)}</td>
                                                <td className="text-right font-mono text-red-600 font-black">{formatIDR(categoryTotals.totalHppTunai)}</td>
                                                <td className="text-right font-mono text-emerald-700 font-black">{formatIDR(categoryTotals.profitTunai)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* Section III: NON-TUNAI */}
                                <div className="border border-slate-300 rounded-md overflow-hidden">
                                    <div className="bg-[#3b1604] text-white font-extrabold px-2 py-1 uppercase tracking-wider text-[10px] print:text-[7pt] ba-header-bar">
                                        III. LAPORAN PENJUALAN (QRIS & TRANSFER BANK)
                                    </div>
                                    <table className="w-full text-left border-collapse ba-table text-[10px] print:text-[6.6pt]">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '6%' }}>No</th>
                                                <th style={{ width: '38%' }}>Sumber Pendapatan</th>
                                                <th style={{ width: '18%' }}>Pendapatan</th>
                                                <th style={{ width: '18%' }}>Modal</th>
                                                <th style={{ width: '20%' }}>Keuntungan</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categoryRows.map((row, idx) => {
                                                const laba = row.nonTunai - row.hppNonTunai;
                                                const isEmpty = row.nonTunai === 0 && row.hppNonTunai === 0;
                                                return (
                                                    <tr key={`nontunai-${idx}`} className="hover:bg-slate-50">
                                                        <td className="text-center font-mono text-slate-600">{idx + 1}</td>
                                                        <td className="font-medium text-slate-800">{row.name}</td>
                                                        <td className="text-right font-mono font-bold text-purple-900">
                                                            {renderNominal(row.nonTunai, 'font-bold text-purple-900')}
                                                        </td>
                                                        <td className="text-right font-mono font-bold text-red-600">
                                                            {renderNominal(row.hppNonTunai, 'font-bold text-red-600')}
                                                        </td>
                                                        <td className="text-right font-mono font-bold text-emerald-600">
                                                            {isEmpty ? <span className="text-slate-300 font-light">-</span> : formatIDR(laba)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="bg-[#fef08a] font-extrabold text-slate-900 ba-highlight-yellow border-t border-slate-300">
                                                <td colSpan={2} className="text-right uppercase">TOTAL PENJUALAN NON-TUNAI</td>
                                                <td className="text-right font-mono font-black text-purple-950">{formatIDR(categoryTotals.totalNonTunai)}</td>
                                                <td className="text-right font-mono text-red-600 font-black">{formatIDR(categoryTotals.totalHppNonTunai)}</td>
                                                <td className="text-right font-mono text-emerald-700 font-black">{formatIDR(categoryTotals.profitNonTunai)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Section IV: REKAPITULASI PIUTANG USAHA (PENJUALAN TEMPO / BON) */}
                            <div className="border border-slate-300 rounded-md overflow-hidden">
                                <div className="bg-[#3b1604] text-white font-extrabold px-2.5 py-1 uppercase tracking-wider text-[10px] print:text-[7pt] flex justify-between items-center ba-header-bar">
                                    <span>IV. REKAPITULASI PIUTANG USAHA (PENJUALAN TEMPO / BON)</span>
                                    <span className="text-[9px] print:text-[6.2pt] font-mono bg-black/30 px-2 py-0.2 rounded">
                                        TOTAL PIUTANG BERJALAN: {formatIDR(receivablesData.totalAllActiveDebtRemaining)}
                                    </span>
                                </div>
                                <table className="w-full text-left border-collapse ba-table text-[10px] print:text-[6.6pt]">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '8%' }}>No</th>
                                            <th style={{ width: '52%' }}>Uraian Rekapitulasi Piutang Pelanggan</th>
                                            <th style={{ width: '22%' }}>Jumlah (Rp)</th>
                                            <th style={{ width: '18%' }}>Keterangan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="hover:bg-slate-50">
                                            <td className="text-center font-mono text-slate-600">1</td>
                                            <td className="font-medium text-slate-800">Total Piutang Baru Terbit (Periode {periodRange.shortLabel})</td>
                                            <td className="text-right font-mono font-bold text-slate-900">{formatIDR(receivablesData.totalNewDebtIssued)}</td>
                                            <td className="text-center text-slate-600 text-[9px] print:text-[6.2pt] font-mono">{receivablesData.periodDebtTransactions.length} Transaksi Baru</td>
                                        </tr>
                                        <tr className="hover:bg-slate-50">
                                            <td className="text-center font-mono text-slate-600">2</td>
                                            <td className="font-medium text-slate-800">Total Pelunasan Piutang Diterima (Cicilan Masuk)</td>
                                            <td className="text-right font-mono font-bold text-emerald-700">{formatIDR(receivablesData.totalRepaymentsReceived)}</td>
                                            <td className="text-center text-emerald-700 text-[9px] print:text-[6.2pt] font-mono">{receivablesData.periodRepaymentList.length}x Pembayaran</td>
                                        </tr>
                                        <tr className="hover:bg-slate-50">
                                            <td className="text-center font-mono text-slate-600">3</td>
                                            <td className="font-medium text-slate-800">Piutang Pelanggan (BON)</td>
                                            <td className="text-right font-mono font-extrabold text-red-600">{formatIDR(receivablesData.totalAllActiveDebtRemaining)}</td>
                                            <td className="text-center text-amber-800 text-[9px] print:text-[6.2pt] font-mono">{receivablesData.allActiveDebts.length} Faktur Aktif</td>
                                        </tr>
                                        <tr className="bg-[#fef08a] font-extrabold text-slate-900 ba-highlight-yellow border-t border-slate-300">
                                            <td colSpan={2} className="text-right uppercase">TOTAL SALDO PIUTANG AKTIF TOKO</td>
                                            <td className="text-right font-mono text-red-700 font-black">{formatIDR(receivablesData.totalAllActiveDebtRemaining)}</td>
                                            <td className="text-center text-slate-800 text-[9px] print:text-[6.2pt] font-bold">STATUS AKTIF</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Section V & VI: PENGELUARAN & REKAPITULASI KEUANGAN (SIDE BY SIDE) */}
                            <div className="grid grid-cols-2 gap-2.5 print:gap-2">
                                {/* Section V: PENGELUARAN OPERASIONAL */}
                                <div className="border border-slate-300 rounded-md overflow-hidden">
                                    <div className="bg-[#3b1604] text-white font-extrabold px-2 py-1 uppercase tracking-wider text-[10px] print:text-[7pt] flex justify-between items-center ba-header-bar">
                                        <span>V. LAPORAN PENGELUARAN OPERASIONAL (BIAYA / OPEX)</span>
                                        <button
                                            type="button"
                                            onClick={handleOpenExpenseModal}
                                            className="text-[8.5px] bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded font-bold transition-all print:hidden flex items-center gap-1"
                                            title="Input Tambah Beban / Biaya Operasional"
                                        >
                                            <Plus size={11} /> + Input Biaya
                                        </button>
                                    </div>
                                    <table className="w-full text-left border-collapse ba-table text-[10px] print:text-[6.6pt]">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '8%' }} className="text-center">No</th>
                                                <th style={{ width: '56%' }}>Pos Pengeluaran</th>
                                                <th style={{ width: '24%' }} className="text-right">Jumlah (Rp)</th>
                                                <th style={{ width: '12%' }} className="text-center print:hidden">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {expenseBreakdown.activeList.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="p-3 text-center text-slate-400 italic text-[9.5px] print:text-[6.2pt]">
                                                        Belum ada catatan pengeluaran operasional (biaya) yang terinput pada periode ini.
                                                    </td>
                                                </tr>
                                            ) : (
                                                expenseBreakdown.activeList.map((exp, idx) => (
                                                    <tr key={exp.name} className="hover:bg-slate-50 group">
                                                        <td className="text-center font-mono text-slate-600">{idx + 1}</td>
                                                        <td className="font-medium text-slate-800">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold">{exp.name}</span>
                                                                {exp.items && exp.items.length === 1 && exp.items[0].description && exp.items[0].description !== exp.name && (
                                                                    <span className="text-[8.5px] text-slate-500 font-normal italic">
                                                                        {exp.items[0].description} ({exp.items[0].paymentMethod || 'CASH'})
                                                                    </span>
                                                                )}
                                                                {exp.items && exp.items.length > 1 && (
                                                                    <span className="text-[8.5px] text-amber-700 font-semibold">
                                                                        {exp.items.length} transaksi terkelompok
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="text-right font-mono font-bold text-red-600">
                                                            {formatIDR(exp.amount)}
                                                        </td>
                                                        <td className="text-center print:hidden p-1">
                                                            <div className="flex items-center justify-center gap-1">
                                                                {exp.items && exp.items.length === 1 ? (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleEditExpense(exp.items[0])}
                                                                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                                                            title="Edit Catatan Pengeluaran"
                                                                        >
                                                                            <Edit3 size={12} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteExpense(exp.items[0].id)}
                                                                            className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                                                                            title="Hapus Catatan Pengeluaran"
                                                                        >
                                                                            <Trash2 size={12} />
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setCategoryDetailsModal({ categoryName: exp.name, items: exp.items || [] })}
                                                                        className="px-1.5 py-0.5 text-[8.5px] bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-slate-200 font-bold rounded flex items-center gap-1 transition-all"
                                                                        title="Kelola & Edit Rincian Transaksi"
                                                                    >
                                                                        <Edit3 size={10} /> Kelola ({exp.items?.length || 0})
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                            <tr className="bg-[#fee2e2] font-extrabold text-red-950 ba-highlight-pink border-t border-slate-300">
                                                <td colSpan={2} className="text-right uppercase">TOTAL PENGELUARAN OPERASIONAL</td>
                                                <td className="text-right font-mono text-red-700 font-black">{formatIDR(expenseBreakdown.totalOperatingExpenses)}</td>
                                                <td className="print:hidden"></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* Section VI: REKAPITULASI KEUANGAN & SETORAN KASIR */}
                                <div className="border border-slate-300 rounded-md overflow-hidden">
                                    <div className="bg-[#3b1604] text-white font-extrabold px-2 py-1 uppercase tracking-wider text-[10px] print:text-[7pt] ba-header-bar">
                                        VI. REKAPITULASI KEUANGAN & SETORAN FISIK KASIR
                                    </div>
                                    <div className="p-1.5 space-y-2 bg-white text-[10px] print:text-[6.6pt]">
                                        {/* 1. Laba Penjualan */}
                                        <table className="w-full text-left border-collapse ba-table">
                                            <thead>
                                                <tr>
                                                    <th colSpan={2} className="text-left font-extrabold uppercase text-slate-800 p-1 text-[9px] print:text-[6.2pt]">
                                                        1. REKAPITULASI LABA PENJUALAN (NET PROFIT)
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td className="text-slate-700">Total Pemasukan Bruto (Omzet)</td>
                                                    <td className="text-right font-mono font-black text-slate-900">{formatIDR(salesMetrics.grossSales)}</td>
                                                </tr>
                                                <tr>
                                                    <td className="text-slate-700">Total Modal Pokok (HPP)</td>
                                                    <td className="text-right font-mono font-bold text-red-600">- {formatIDR(totalCOGS)}</td>
                                                </tr>
                                                <tr>
                                                    <td className="text-slate-700">Total Pengeluaran Operasional (V)</td>
                                                    <td className="text-right font-mono font-bold text-red-600">- {formatIDR(expenseBreakdown.totalOperatingExpenses)}</td>
                                                </tr>
                                                <tr className="bg-[#dcfce7] font-black text-emerald-950 ba-highlight-green border-t border-slate-300">
                                                    <td className="uppercase">KEUNTUNGAN BERSIH (NETTO)</td>
                                                    <td className="text-right font-mono text-emerald-800 font-black">{formatIDR(netProfit)}</td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        {/* 2. Setoran Fisik Kasir */}
                                        <table className="w-full text-left border-collapse ba-table">
                                            <thead>
                                                <tr>
                                                    <th colSpan={2} className="text-left font-extrabold uppercase text-slate-800 p-1 text-[9px] print:text-[6.2pt]">
                                                        2. SETORAN FISIK KASIR (UANG TUNAI CASH)
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td className="text-slate-700">Penjualan Tunai Kasir (II)</td>
                                                    <td className="text-right font-mono font-black text-slate-900">{formatIDR(salesMetrics.cashSales)}</td>
                                                </tr>
                                                {receivablesData.repaymentsCash > 0 && (
                                                    <tr>
                                                        <td className="text-emerald-700 font-medium">(+) Pelunasan Piutang Kasir (Tunai)</td>
                                                        <td className="text-right font-mono font-bold text-emerald-700">+ {formatIDR(receivablesData.repaymentsCash)}</td>
                                                    </tr>
                                                )}
                                                <tr>
                                                    <td className="text-slate-700">(-) Pengeluaran Kasir Tunai (V)</td>
                                                    <td className="text-right font-mono font-bold text-red-600">- {formatIDR(expenseBreakdown.cashExpenses)}</td>
                                                </tr>
                                                <tr className="bg-[#fef08a] font-black text-slate-950 ba-highlight-yellow border-t border-slate-300">
                                                    <td className="uppercase">SETORAN TUNAI BERSIH KASIR</td>
                                                    <td className="text-right font-mono text-slate-950 font-black">
                                                        {formatIDR(physicalCashSettlement.nettoCash)}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Section VII: CATATAN & KETERANGAN EVALUASI TUTUP BUKU */}
                            <div className="border border-slate-300 rounded-md overflow-hidden">
                                <div className="bg-[#3b1604] text-white font-extrabold px-2.5 py-1 uppercase tracking-wider text-[10px] print:text-[7pt] flex justify-between items-center ba-header-bar">
                                    <span>VII. CATATAN & KETERANGAN EVALUASI TUTUP BUKU</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCustomNote(defaultAutoNote);
                                            setIsNoteEdited(true);
                                        }}
                                        className="text-[9px] bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded font-bold transition-all print:hidden"
                                    >
                                        Auto Generate Catatan
                                    </button>
                                </div>
                                <div className="p-2 bg-white">
                                    <textarea
                                        value={activeNote}
                                        onChange={(e) => {
                                            setCustomNote(e.target.value);
                                            setIsNoteEdited(true);
                                        }}
                                        className="w-full p-1.5 border border-slate-200 rounded text-[10px] print:text-[6.8pt] leading-snug text-slate-800 bg-white resize-y outline-none focus:border-amber-700 min-h-[50px] print:min-h-[40px] print:border-none print:p-0"
                                        placeholder="Tulis catatan evaluasi atau keterangan khusus berita acara di sini..."
                                    />
                                </div>
                            </div>

                            {/* Section VIII: LEMBAR PENGESAHAN & TANDA TANGAN BERITA ACARA */}
                            <div className="pt-2 border-t border-slate-300 text-[10px] print:text-[6.8pt] space-y-3 print:space-y-2">
                                <p className="text-center italic text-slate-600 font-serif text-[9.5px] print:text-[6.3pt]">
                                    Demikian Berita Acara Rekapitulasi Keuangan, Pemasukan, dan Tutup Buku ini dibuat dengan sebenar-benarnya sesuai data transaksi operasional.
                                </p>
                                <div className="grid grid-cols-3 gap-4 text-center font-serif">
                                    <div>
                                        <p className="font-bold text-slate-900">Dibuat Oleh,</p>
                                        <p className="text-[9px] print:text-[5.8pt] text-slate-500 mb-8 print:mb-6">Kasir / Staf Administrasi</p>
                                        <p className="font-bold border-t border-black inline-block px-6 pt-0.5 text-slate-900 uppercase">
                                            ( {cashierDisplayName} )
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900">Diperiksa Oleh,</p>
                                        <p className="text-[9px] print:text-[5.8pt] text-slate-500 mb-8 print:mb-6">Supervisor / Bendahara</p>
                                        <p className="font-bold border-t border-black inline-block px-6 pt-0.5 text-slate-900">
                                            ( ........................................... )
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900">Mengetahui & Menyetujui,</p>
                                        <p className="text-[9px] print:text-[5.8pt] text-slate-500 mb-8 print:mb-6">Pemilik / Direktur</p>
                                        <p className="font-bold border-t border-black inline-block px-6 pt-0.5 text-slate-900">
                                            ( ........................................... )
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* TAB 2: STANDAR LAPORAN LABA RUGI (INCOME STATEMENT) */}
                {/* ======================================================== */}
                {activeTab === 'income_statement' && (
                    <div className="p-4 sm:p-6 space-y-6">
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-100 text-slate-700 uppercase font-black tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-3.5 w-3/5">Komponen Laporan Keuangan</th>
                                        <th className="p-3.5 text-right w-1/5">Jumlah (Rp)</th>
                                        <th className="p-3.5 text-right w-1/5">Rasio (%)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {/* SECTION I: PENDAPATAN */}
                                    <tr className="bg-slate-50 font-black text-slate-900">
                                        <td colSpan={3} className="p-3 uppercase tracking-wider text-xs">
                                            I. PENDAPATAN PENJUALAN (REVENUE)
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 pl-6 text-slate-700">Penjualan Kotor (Gross Sales)</td>
                                        <td className="p-3 text-right font-mono font-bold text-slate-800">{formatIDR(salesMetrics.grossSales)}</td>
                                        <td className="p-3 text-right font-mono text-slate-500">100.0%</td>
                                    </tr>
                                    {salesMetrics.returnsAmount > 0 && (
                                        <tr>
                                            <td className="p-3 pl-6 text-slate-700">(-) Retur Penjualan (Sales Returns)</td>
                                            <td className="p-3 text-right font-mono font-bold text-rose-600">-{formatIDR(salesMetrics.returnsAmount)}</td>
                                            <td className="p-3 text-right font-mono text-rose-600">-{((salesMetrics.returnsAmount / (salesMetrics.grossSales || 1)) * 100).toFixed(1)}%</td>
                                        </tr>
                                    )}
                                    {salesMetrics.discountAmount > 0 && (
                                        <tr>
                                            <td className="p-3 pl-6 text-slate-700">(-) Potongan & Diskon Penjualan (Discounts)</td>
                                            <td className="p-3 text-right font-mono font-bold text-rose-600">-{formatIDR(salesMetrics.discountAmount)}</td>
                                            <td className="p-3 text-right font-mono text-rose-600">-{((salesMetrics.discountAmount / (salesMetrics.grossSales || 1)) * 100).toFixed(1)}%</td>
                                        </tr>
                                    )}
                                    <tr className="bg-blue-50/70 font-black text-slate-900 border-t border-blue-200">
                                        <td className="p-3 pl-6">TOTAL PENDAPATAN BERSIH (NET REVENUE)</td>
                                        <td className="p-3 text-right font-mono text-blue-900">{formatIDR(salesMetrics.netSales)}</td>
                                        <td className="p-3 text-right font-mono text-blue-900">100.0%</td>
                                    </tr>

                                    {/* SECTION II: HPP */}
                                    <tr className="bg-slate-50 font-black text-slate-900">
                                        <td colSpan={3} className="p-3 uppercase tracking-wider text-xs">
                                            II. HARGA POKOK PENJUALAN (COST OF GOODS SOLD / HPP)
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 pl-6 text-slate-700">Modal Pokok Barang Terjual (HPP Produk)</td>
                                        <td className="p-3 text-right font-mono font-bold text-slate-800">{formatIDR(salesMetrics.totalHppCost)}</td>
                                        <td className="p-3 text-right font-mono text-slate-500">{((salesMetrics.totalHppCost / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%</td>
                                    </tr>
                                    {stockAdjustmentMetrics.netInventoryAdjustment !== 0 && (
                                        <tr>
                                            <td className="p-3 pl-6 text-slate-700">
                                                {stockAdjustmentMetrics.netInventoryAdjustment > 0
                                                    ? '(+) Kerugian Selisih Stok Opname (Inventory Shrinkage)'
                                                    : '(-) Keuntungan Penyesuaian Stok Opname (Surplus)'}
                                            </td>
                                            <td className={`p-3 text-right font-mono font-bold ${stockAdjustmentMetrics.netInventoryAdjustment > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                {stockAdjustmentMetrics.netInventoryAdjustment > 0 ? `+${formatIDR(stockAdjustmentMetrics.netInventoryAdjustment)}` : formatIDR(stockAdjustmentMetrics.netInventoryAdjustment)}
                                            </td>
                                            <td className="p-3 text-right font-mono text-slate-500">{((Math.abs(stockAdjustmentMetrics.netInventoryAdjustment) / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%</td>
                                        </tr>
                                    )}
                                    <tr className="bg-rose-50/70 font-black text-rose-950 border-t border-rose-200">
                                        <td className="p-3 pl-6">TOTAL HARGA POKOK PENJUALAN (COGS)</td>
                                        <td className="p-3 text-right font-mono text-rose-700 font-bold">{formatIDR(totalCOGS)}</td>
                                        <td className="p-3 text-right font-mono text-rose-700">{((totalCOGS / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%</td>
                                    </tr>

                                    {/* SECTION III: LABA KOTOR */}
                                    <tr className="bg-emerald-100 font-black text-emerald-950 border-y-2 border-emerald-300 text-sm">
                                        <td className="p-3.5">III. LABA KOTOR (GROSS PROFIT)</td>
                                        <td className="p-3.5 text-right font-mono text-emerald-800">{formatIDR(grossProfit)}</td>
                                        <td className="p-3.5 text-right font-mono text-emerald-800">{grossProfitMargin.toFixed(1)}%</td>
                                    </tr>

                                    {/* SECTION IV: BEBAN OPERASIONAL */}
                                    <tr className="bg-slate-50 font-black text-slate-900">
                                        <td colSpan={3} className="p-3 uppercase tracking-wider text-xs">
                                            IV. BEBAN OPERASIONAL USAHA (OPERATING EXPENSES / OPEX)
                                        </td>
                                    </tr>
                                    {expenseBreakdown.activeList.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="p-3 pl-6 text-slate-400 italic">
                                                Belum ada catatan beban operasional yang terinput pada periode ini.
                                            </td>
                                        </tr>
                                    ) : (
                                        expenseBreakdown.activeList.map(exp => (
                                            <tr key={exp.name}>
                                                <td className="p-2.5 pl-6 text-slate-700">{exp.name}</td>
                                                <td className="p-2.5 text-right font-mono text-slate-800">{formatIDR(exp.amount)}</td>
                                                <td className="p-2.5 text-right font-mono text-slate-500">
                                                    {((exp.amount / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                    <tr className="bg-rose-50/70 font-black text-rose-950 border-t border-rose-200">
                                        <td className="p-3 pl-6">TOTAL BEBAN OPERASIONAL (TOTAL OPEX)</td>
                                        <td className="p-3 text-right font-mono text-rose-700 font-bold">{formatIDR(expenseBreakdown.totalOperatingExpenses)}</td>
                                        <td className="p-3 text-right font-mono text-rose-700">{((expenseBreakdown.totalOperatingExpenses / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%</td>
                                    </tr>

                                    {/* SECTION V: LABA OPERASIONAL */}
                                    <tr className="bg-amber-100 font-black text-amber-950 border-y border-amber-300">
                                        <td className="p-3 pl-4">V. LABA USAHA OPERASIONAL (OPERATING INCOME / EBIT)</td>
                                        <td className={`p-3 text-right font-mono font-bold ${operatingProfit >= 0 ? 'text-amber-900' : 'text-rose-700'}`}>
                                            {formatIDR(operatingProfit)}
                                        </td>
                                        <td className="p-3 text-right font-mono text-amber-900">{operatingProfitMargin.toFixed(1)}%</td>
                                    </tr>

                                    {/* SECTION VI: NON OPERASIONAL */}
                                    <tr className="bg-slate-50 font-black text-slate-900">
                                        <td colSpan={3} className="p-3 uppercase tracking-wider text-xs">
                                            VI. PENDAPATAN & BEBAN NON-OPERASIONAL
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="p-2.5 pl-6 text-slate-700">Pendapatan Lain-lain (Non-Penjualan)</td>
                                        <td className="p-2.5 text-right font-mono text-emerald-600 font-bold">+{formatIDR(nonOperatingMetrics.otherIncome)}</td>
                                        <td className="p-2.5 text-right font-mono text-slate-500">-</td>
                                    </tr>
                                    {nonOperatingMetrics.otherExpense > 0 && (
                                        <tr>
                                            <td className="p-2.5 pl-6 text-slate-700">Beban Lain-lain / Dividen</td>
                                            <td className="p-2.5 text-right font-mono text-rose-600 font-bold">-{formatIDR(nonOperatingMetrics.otherExpense)}</td>
                                            <td className="p-2.5 text-right font-mono text-slate-500">-</td>
                                        </tr>
                                    )}

                                    {/* SECTION VII: LABA BERSIH AKHIR */}
                                    <tr className="bg-gradient-to-r from-amber-700 to-amber-900 text-white font-black text-sm border-t-2 border-amber-950">
                                        <td className="p-4 uppercase tracking-wide">VII. LABA BERSIH PERIODE (NET PROFIT / INCOME)</td>
                                        <td className="p-4 text-right font-mono text-white text-base">{formatIDR(netProfit)}</td>
                                        <td className="p-4 text-right font-mono text-white text-base">{netProfitMargin.toFixed(1)}%</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* TAB 3: KINERJA PENJUALAN PER KATEGORI & MARGIN */}
                {/* ======================================================== */}
                {activeTab === 'category_breakdown' && (
                    <div className="p-4 sm:p-6 space-y-4">
                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <span className="text-xs font-bold text-slate-700">Total Kategori: {categoryRows.length} Kategori</span>
                            <span className="text-xs font-mono font-bold text-emerald-700">Total Omzet Bruto: {formatIDR(salesMetrics.grossSales)}</span>
                        </div>

                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase tracking-wider border-b border-slate-200">
                                        <tr>
                                            <th className="p-3 text-center w-12">No</th>
                                            <th className="p-3 min-w-[180px]">Nama Kategori</th>
                                            <th className="p-3 text-center w-20">Unit</th>
                                            <th className="p-3 text-right w-28">Omzet Tunai</th>
                                            <th className="p-3 text-right w-28">Omzet Non-Tunai</th>
                                            <th className="p-3 text-right w-28 text-amber-900">Omzet BON</th>
                                            <th className="p-3 text-right w-32 bg-amber-50/50">Total Omzet</th>
                                            <th className="p-3 text-right w-28 text-rose-600">Total HPP</th>
                                            <th className="p-3 text-right w-28 text-emerald-800">Laba Kotor</th>
                                            <th className="p-3 text-center w-20">Margin</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {categoryRows.map((cat, idx) => {
                                            const totalRevenue = cat.tunai + cat.nonTunai + cat.tempo;
                                            const totalHpp = cat.hppTunai + cat.hppNonTunai + cat.hppTempo;
                                            const grossProfit = totalRevenue - totalHpp;
                                            const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

                                            return (
                                                <tr key={cat.name} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                                    <td className="p-3">
                                                        <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                                                            <Tag size={13} className="text-amber-700 shrink-0" />
                                                            {cat.name}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-mono">{cat.txCount} kali transaksi</div>
                                                    </td>
                                                    <td className="p-3 text-center font-mono font-bold text-slate-700">{cat.itemsSold}</td>
                                                    <td className="p-3 text-right font-mono text-slate-700">{cat.tunai > 0 ? formatIDR(cat.tunai) : '-'}</td>
                                                    <td className="p-3 text-right font-mono text-purple-700">{cat.nonTunai > 0 ? formatIDR(cat.nonTunai) : '-'}</td>
                                                    <td className="p-3 text-right font-mono text-amber-700 font-bold">{cat.tempo > 0 ? formatIDR(cat.tempo) : '-'}</td>
                                                    <td className="p-3 text-right font-mono font-extrabold text-slate-900 bg-amber-50/30">{totalRevenue > 0 ? formatIDR(totalRevenue) : '-'}</td>
                                                    <td className="p-3 text-right font-mono text-rose-600 font-bold">{totalHpp > 0 ? formatIDR(totalHpp) : '-'}</td>
                                                    <td className="p-3 text-right font-mono font-extrabold text-emerald-600">{totalRevenue > 0 ? formatIDR(grossProfit) : '-'}</td>
                                                    <td className="p-3 text-center font-mono">
                                                        {totalRevenue > 0 ? (
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${margin >= 30 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                                {margin.toFixed(1)}%
                                                            </span>
                                                        ) : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* TAB 4: REKAPITULASI PIUTANG & PELANGGAN (BON) */}
                {/* ======================================================== */}
                {activeTab === 'receivables' && (
                    <div className="p-4 sm:p-6 space-y-6">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                            <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-200 flex items-center gap-3 shadow-2xs">
                                <div className="p-3 bg-amber-200/80 text-amber-900 rounded-xl">
                                    <CreditCard size={22} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Piutang Baru Terbit</p>
                                    <h4 className="text-lg font-black text-amber-950 font-mono mt-0.5">
                                        {formatIDR(receivablesData.totalNewDebtIssued)}
                                    </h4>
                                    <span className="text-[10px] text-amber-800">{receivablesData.periodDebtTransactions.length} transaksi di periode ini</span>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-4 rounded-2xl border border-emerald-200 flex items-center gap-3 shadow-2xs">
                                <div className="p-3 bg-emerald-200/80 text-emerald-900 rounded-xl">
                                    <CheckCircle2 size={22} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Pelunasan Masuk</p>
                                    <h4 className="text-lg font-black text-emerald-900 font-mono mt-0.5">
                                        {formatIDR(receivablesData.totalRepaymentsReceived)}
                                    </h4>
                                    <span className="text-[10px] text-emerald-800">{receivablesData.periodRepaymentList.length} kali pembayaran</span>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-rose-50 to-pink-50 p-4 rounded-2xl border border-rose-200 flex items-center gap-3 shadow-2xs">
                                <div className="p-3 bg-rose-200/80 text-rose-900 rounded-xl">
                                    <AlertCircle size={22} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Total Piutang Berjalan Toko</p>
                                    <h4 className="text-lg font-black text-rose-900 font-mono mt-0.5">
                                        {formatIDR(receivablesData.totalAllActiveDebtRemaining)}
                                    </h4>
                                    <span className="text-[10px] text-rose-800">{receivablesData.allActiveDebts.length} transaksi total aktif</span>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-4 rounded-2xl border border-indigo-200 flex items-center gap-3 shadow-2xs">
                                <div className="p-3 bg-indigo-200/80 text-indigo-900 rounded-xl">
                                    <Users size={22} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Pelanggan Penunggak</p>
                                    <h4 className="text-lg font-black text-indigo-950 font-mono mt-0.5">
                                        {receivablesData.customerLedger.length} Orang
                                    </h4>
                                    <span className="text-[10px] text-indigo-800">Buku pembantu piutang</span>
                                </div>
                            </div>
                        </div>

                        {/* View Mode Toggle & Search Toolbar */}
                        <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                            <div className="flex flex-wrap items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                                <button
                                    type="button"
                                    onClick={() => setReceivablesViewMode('all_active')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${receivablesViewMode === 'all_active' ? 'bg-amber-800 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    Semua Piutang Aktif Toko ({receivablesData.allActiveDebts.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setReceivablesViewMode('period_new')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${receivablesViewMode === 'period_new' ? 'bg-amber-800 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    Piutang Baru Periode Ini ({receivablesData.periodDebtTransactions.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setReceivablesViewMode('repayments')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${receivablesViewMode === 'repayments' ? 'bg-amber-800 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    Riwayat Pelunasan Masuk ({receivablesData.periodRepaymentList.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setReceivablesViewMode('ledger')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${receivablesViewMode === 'ledger' ? 'bg-amber-800 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    Buku Besar Pelanggan ({receivablesData.customerLedger.length})
                                </button>
                            </div>

                            <div className="relative min-w-[240px]">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Cari faktur / nama pelanggan..."
                                    value={receivablesSearch}
                                    onChange={e => setReceivablesSearch(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-amber-700 shadow-2xs"
                                />
                            </div>
                        </div>

                        {/* MODE 1 & 2: TRANSACTION TABLES */}
                        {(receivablesViewMode === 'all_active' || receivablesViewMode === 'period_new') && (
                            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                                <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-800 text-xs flex justify-between items-center">
                                    <span className="flex items-center gap-2">
                                        <Receipt size={16} className="text-amber-700" />
                                        {receivablesViewMode === 'all_active'
                                            ? 'Daftar Seluruh Piutang Pelanggan Toko Belum Lunas (Outstanding)'
                                            : `Daftar Piutang (BON) Periode Tutup Buku ${periodRange.shortLabel}`}
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase tracking-wider border-b border-slate-200">
                                            <tr>
                                                <th className="p-3 text-center w-12">No</th>
                                                <th className="p-3 w-28">Tanggal</th>
                                                <th className="p-3 w-32">No Faktur</th>
                                                <th className="p-3 min-w-[160px]">Pelanggan</th>
                                                <th className="p-3 min-w-[200px]">Rincian Barang</th>
                                                <th className="p-3 text-right w-32">Total Transaksi</th>
                                                <th className="p-3 text-right w-32">Sudah Dibayar</th>
                                                <th className="p-3 text-right w-32 text-rose-700 font-bold">Sisa Piutang</th>
                                                <th className="p-3 text-center w-28">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-medium">
                                            {(() => {
                                                const list = (receivablesViewMode === 'all_active' ? receivablesData.allActiveDebts : receivablesData.periodDebtTransactions)
                                                    .filter(d => !receivablesSearch || d.customerName.toLowerCase().includes(receivablesSearch.toLowerCase()) || d.invoiceNumber.toLowerCase().includes(receivablesSearch.toLowerCase()));

                                                if (list.length === 0) {
                                                    return (
                                                        <tr>
                                                            <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                                                                Tidak ada catatan piutang yang sesuai filter.
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return list.map((dt, idx) => (
                                                    <tr key={dt.id} className="hover:bg-slate-50/80 transition-colors">
                                                        <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                                        <td className="p-3 font-mono text-slate-600">{new Date(dt.date).toLocaleDateString('id-ID')}</td>
                                                        <td className="p-3 font-mono font-extrabold text-slate-900">{dt.invoiceNumber}</td>
                                                        <td className="p-3">
                                                            <div className="font-extrabold text-slate-900">{dt.customerName}</div>
                                                            {dt.customerPhone && <div className="text-[10px] text-slate-400 font-mono">{dt.customerPhone}</div>}
                                                        </td>
                                                        <td className="p-3 text-slate-600 text-[11px]">{dt.itemsSummary}</td>
                                                        <td className="p-3 text-right font-mono font-bold">{formatIDR(dt.totalAmount)}</td>
                                                        <td className="p-3 text-right font-mono text-emerald-700">{formatIDR(dt.amountPaid)}</td>
                                                        <td className="p-3 text-right font-mono font-black text-rose-700">{formatIDR(dt.remainingDebt)}</td>
                                                        <td className="p-3 text-center">
                                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${dt.remainingDebt === 0
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : dt.amountPaid > 0
                                                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                                    : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                                                {dt.paymentStatus}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* MODE 3: REPAYMENTS HISTORY TABLE */}
                        {receivablesViewMode === 'repayments' && (
                            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                                <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-800 text-xs flex justify-between items-center">
                                    <span className="flex items-center gap-2">
                                        <CheckCircle2 size={16} className="text-emerald-700" />
                                        Riwayat Pelunasan & Cicilan Piutang Diterima Periode {periodRange.shortLabel}
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase tracking-wider border-b border-slate-200">
                                            <tr>
                                                <th className="p-3 text-center w-12">No</th>
                                                <th className="p-3 w-32">Tanggal Bayar</th>
                                                <th className="p-3 w-36">No Faktur</th>
                                                <th className="p-3 min-w-[180px]">Nama Pelanggan</th>
                                                <th className="p-3 text-center w-28">Metode</th>
                                                <th className="p-3 min-w-[160px]">Catatan Pelunasan</th>
                                                <th className="p-3 text-right w-36 text-emerald-800 font-black">Nominal Diterima</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-medium">
                                            {receivablesData.periodRepaymentList.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                                                        Tidak ada catatan pelunasan piutang pada periode ini.
                                                    </td>
                                                </tr>
                                            ) : (
                                                receivablesData.periodRepaymentList
                                                    .filter(r => !receivablesSearch || r.customerName.toLowerCase().includes(receivablesSearch.toLowerCase()) || r.invoiceNumber.toLowerCase().includes(receivablesSearch.toLowerCase()))
                                                    .map((r, idx) => (
                                                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                                                            <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                                            <td className="p-3 font-mono text-slate-600">{new Date(r.date).toLocaleString('id-ID')}</td>
                                                            <td className="p-3 font-mono font-extrabold text-slate-900">{r.invoiceNumber}</td>
                                                            <td className="p-3 font-bold text-slate-900">{r.customerName}</td>
                                                            <td className="p-3 text-center font-mono font-bold text-slate-700">
                                                                <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] border border-slate-200">{r.method}</span>
                                                            </td>
                                                            <td className="p-3 text-slate-600 text-[11px]">{r.note}</td>
                                                            <td className="p-3 text-right font-mono font-black text-emerald-700">+{formatIDR(r.amount)}</td>
                                                        </tr>
                                                    ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* MODE 4: CUSTOMER LEDGER (BUKU BESAR PELANGGAN) */}
                        {receivablesViewMode === 'ledger' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {receivablesData.customerLedger
                                    .filter(c => !receivablesSearch || c.customerName.toLowerCase().includes(receivablesSearch.toLowerCase()))
                                    .map(cust => (
                                        <div key={cust.customerName} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3 hover:border-amber-400 transition-colors">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                                                        <UserCheck size={16} className="text-amber-800" />
                                                        {cust.customerName}
                                                    </h4>
                                                    {cust.customerPhone && (
                                                        <p className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                                                            <Phone size={11} /> {cust.customerPhone}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                                                    {cust.txCount} Transaksi
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center border border-slate-100">
                                                <div>
                                                    <span className="text-[9px] text-slate-400 uppercase block font-bold">Total Bon</span>
                                                    <strong className="text-xs font-mono text-slate-800">{formatIDR(cust.totalDebt)}</strong>
                                                </div>
                                                <div>
                                                    <span className="text-[9px] text-emerald-600 uppercase block font-bold">Dibayar</span>
                                                    <strong className="text-xs font-mono text-emerald-700">{formatIDR(cust.totalPaid)}</strong>
                                                </div>
                                                <div>
                                                    <span className="text-[9px] text-rose-600 uppercase block font-bold">Sisa Tagihan</span>
                                                    <strong className="text-xs font-mono text-rose-700">{formatIDR(cust.remainingDebt)}</strong>
                                                </div>
                                            </div>

                                            <div className="space-y-1 text-[11px]">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">Faktur Aktif:</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {cust.transactions.map(tx => (
                                                        <span key={tx.id} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-200">
                                                            {tx.invoiceNumber} ({formatIDR(tx.remainingDebt)})
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ======================================================== */}
                {/* TAB 5: RINCIAN ARUS KAS & BIAYA (CASH FLOW STATEMENT) */}
                {/* ======================================================== */}
                {activeTab === 'cash_flow' && (
                    <div className="p-4 sm:p-6 space-y-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-sm font-black text-slate-900">Rincian Arus Kas & Pos Beban Operasional</h3>
                                <p className="text-xs text-slate-500">Kelola dan input seluruh arus kas masuk serta pengeluaran biaya operasional toko</p>
                            </div>
                            <button
                                onClick={handleOpenExpenseModal}
                                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                            >
                                <PlusCircle size={15} /> + Input Pengeluaran (OPEX)
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                                    <Wallet size={20} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase">Total Arus Kas Masuk</p>
                                    <h4 className="text-lg font-black text-emerald-700 font-mono mt-0.5">
                                        {formatIDR(salesMetrics.netSales + nonOperatingMetrics.otherIncome)}
                                    </h4>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                                <div className="p-3 bg-rose-100 text-rose-700 rounded-xl">
                                    <TrendingDown size={20} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase">Total Arus Kas Keluar (Beban)</p>
                                    <h4 className="text-lg font-black text-rose-700 font-mono mt-0.5">
                                        {formatIDR(expenseBreakdown.totalOperatingExpenses + nonOperatingMetrics.otherExpense)}
                                    </h4>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                                <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
                                    <DollarSign size={20} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase">Arus Kas Bersih (Net Cash Flow)</p>
                                    <h4 className="text-lg font-black text-blue-700 font-mono mt-0.5">
                                        {formatIDR((salesMetrics.netSales + nonOperatingMetrics.otherIncome) - (expenseBreakdown.totalOperatingExpenses + nonOperatingMetrics.otherExpense))}
                                    </h4>
                                </div>
                            </div>
                        </div>

                        {/* List of Recent Operational Expenses in this Period */}
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                            <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-800 text-xs flex justify-between items-center">
                                <span className="flex items-center gap-2">
                                    <TrendingDown size={16} className="text-rose-600" />
                                    Daftar Pengeluaran Operasional (OPEX) Periode {periodRange.shortLabel}
                                </span>
                                <span className="font-mono text-xs font-black text-rose-700">
                                    Total: {formatIDR(expenseBreakdown.totalOperatingExpenses)}
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase tracking-wider border-b border-slate-200">
                                        <tr>
                                            <th className="p-3 text-center w-12">No</th>
                                            <th className="p-3 w-32">Tanggal</th>
                                            <th className="p-3 w-48">Pos Kategori Beban</th>
                                            <th className="p-3 min-w-[220px]">Keterangan / Rincian Pengeluaran</th>
                                            <th className="p-3 text-center w-28">Metode</th>
                                            <th className="p-3 text-right w-36 text-rose-700 font-bold">Nominal (Rp)</th>
                                            <th className="p-3 text-center w-20">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-medium">
                                        {expenseBreakdown.periodExpenseList.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                                                    Belum ada catatan pengeluaran operasional di periode ini. Klik <strong>"+ Input Biaya (OPEX)"</strong> untuk menambahkan.
                                                </td>
                                            </tr>
                                        ) : (
                                            expenseBreakdown.periodExpenseList.map((exp, idx) => (
                                                <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                                    <td className="p-3 font-mono text-slate-600">{new Date(exp.date).toLocaleDateString('id-ID')}</td>
                                                    <td className="p-3">
                                                        <span className="bg-rose-50 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-200">
                                                            {exp.category}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-slate-800">{exp.description}</td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${exp.paymentMethod === PaymentMethod.CASH ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}`}>
                                                            {exp.paymentMethod || 'CASH'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right font-mono font-black text-rose-700">
                                                        - {formatIDR(exp.amount)}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <button
                                                                onClick={() => handleEditExpense(exp)}
                                                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                                title="Edit Catatan Pengeluaran Ini"
                                                            >
                                                                <Edit3 size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteExpense(exp.id)}
                                                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                                title="Hapus Catatan Pengeluaran Ini"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* TAB 6: REKAPITULASI KALENDER & TREN HARIAN */}
                {/* ======================================================== */}
                {activeTab === 'daily_trend' && (
                    <div className="p-4 sm:p-6 space-y-4">
                        {/* Daily Highlights */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl">
                                <span className="text-[10px] font-bold text-emerald-800 uppercase">Rata-rata Omzet / Hari</span>
                                <p className="text-lg font-black text-emerald-950 font-mono mt-1">{formatIDR(dailyMetrics.avgDailySales)}</p>
                                <span className="text-[10px] text-emerald-700">dari {dailyMetrics.activeDaysCount} hari aktif jualan</span>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl">
                                <span className="text-[10px] font-bold text-amber-800 uppercase">Penjualan Tertinggi (Peak Day)</span>
                                <p className="text-lg font-black text-amber-950 font-mono mt-1">{formatIDR(dailyMetrics.bestDaySales)}</p>
                                <span className="text-[10px] text-amber-700">{dailyMetrics.bestDayDate || '-'}</span>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl">
                                <span className="text-[10px] font-bold text-blue-800 uppercase">Total Hari dalam Periode</span>
                                <p className="text-lg font-black text-blue-950 font-mono mt-1">{dailyMetrics.totalDays} Hari</p>
                                <span className="text-[10px] text-blue-700">{periodRange.shortLabel}</span>
                            </div>
                        </div>

                        {/* Daily Run Table */}
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                            <div className="overflow-x-auto max-h-[500px]">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                                        <tr>
                                            <th className="p-3 text-center w-12">Tgl</th>
                                            <th className="p-3 w-28">Hari</th>
                                            <th className="p-3 text-center w-20">Trx</th>
                                            <th className="p-3 text-right w-28">Omzet Tunai</th>
                                            <th className="p-3 text-right w-28">Omzet Non-Tunai</th>
                                            <th className="p-3 text-right w-32 bg-amber-50/50">Total Omzet</th>
                                            <th className="p-3 text-right w-28 text-rose-600">HPP Modal</th>
                                            <th className="p-3 text-right w-28 text-rose-700">Pengeluaran</th>
                                            <th className="p-3 text-right w-32 font-black text-emerald-800">Laba Harian</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {dailyMetrics.daysArray.map(day => (
                                            <tr key={day.dateStr} className={`hover:bg-slate-50/80 transition-colors ${day.totalRevenue > 0 ? '' : 'text-slate-300 opacity-60'}`}>
                                                <td className="p-2.5 text-center font-mono font-bold text-slate-600">{day.dateStr.split('-')[2]}</td>
                                                <td className="p-2.5 font-bold text-slate-800">{day.dayName}</td>
                                                <td className="p-2.5 text-center font-mono">{day.txCount || '-'}</td>
                                                <td className="p-2.5 text-right font-mono text-slate-700">{day.cashRevenue > 0 ? formatIDR(day.cashRevenue) : '-'}</td>
                                                <td className="p-2.5 text-right font-mono text-purple-700">{day.nonCashRevenue > 0 ? formatIDR(day.nonCashRevenue) : '-'}</td>
                                                <td className="p-2.5 text-right font-mono font-extrabold text-slate-900 bg-amber-50/30">{day.totalRevenue > 0 ? formatIDR(day.totalRevenue) : '-'}</td>
                                                <td className="p-2.5 text-right font-mono text-rose-600 font-bold">{day.totalHpp > 0 ? formatIDR(day.totalHpp) : '-'}</td>
                                                <td className="p-2.5 text-right font-mono text-rose-700">{day.expenses > 0 ? formatIDR(day.expenses) : '-'}</td>
                                                <td className={`p-2.5 text-right font-mono font-extrabold ${day.netProfit > 0 ? 'text-emerald-700' : day.netProfit < 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                                                    {day.totalRevenue > 0 || day.expenses > 0 ? formatIDR(day.netProfit) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ======================================================== */}
            {/* MODAL INPUT MANUAL PENGELUARAN OPERASIONAL (OPEX) */}
            {/* ======================================================== */}
            {showExpenseModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 animate-fade-in print:hidden">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
                        {/* Modal Header */}
                        <div className="px-5 py-4 bg-gradient-to-r from-rose-700 to-rose-900 text-white flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-white/20 rounded-xl">
                                    {editingExpenseId ? <Edit3 size={20} /> : <TrendingDown size={20} />}
                                </div>
                                <div>
                                    <h3 className="text-base font-black tracking-tight">
                                        {editingExpenseId ? 'Edit Beban Operasional (OPEX)' : 'Input Beban Operasional (OPEX)'}
                                    </h3>
                                    <p className="text-[11px] text-rose-100">
                                        {editingExpenseId ? 'Perbarui data catatan pengeluaran operasional toko' : 'Catat pengeluaran operasional toko untuk Tutup Buku'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowExpenseModal(false)}
                                className="p-1 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Form Body */}
                        <form onSubmit={handleSaveExpense} className="p-5 space-y-4 overflow-y-auto flex-1">
                            {/* Pos Kategori Pengeluaran */}
                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Pos Beban / Kategori Biaya <span className="text-rose-600">*</span>
                                </label>
                                <select
                                    value={expenseForm.category}
                                    onChange={e => setExpenseForm(prev => ({ ...prev, category: e.target.value }))}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-rose-600 focus:bg-white transition-all cursor-pointer"
                                >
                                    {OPEX_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                    <option value="LAINNYA">+ Kategori Lainnya (Ketik Manual)...</option>
                                </select>
                            </div>

                            {/* Custom Category Input if 'LAINNYA' is selected */}
                            {expenseForm.category === 'LAINNYA' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">
                                        Nama Kategori Kustom
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: Beban Servis AC Toko"
                                        value={expenseForm.customCategory}
                                        onChange={e => setExpenseForm(prev => ({ ...prev, customCategory: e.target.value }))}
                                        className="w-full px-3.5 py-2 bg-white border border-rose-300 rounded-xl text-xs outline-none focus:border-rose-600"
                                        required
                                    />
                                </div>
                            )}

                            {/* Nominal Pengeluaran */}
                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Nominal Pengeluaran (Rp) <span className="text-rose-600">*</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-sm">Rp</span>
                                    <input
                                        type="text"
                                        placeholder="0"
                                        value={expenseForm.amount}
                                        onChange={e => {
                                            const raw = e.target.value.replace(/[^0-9]/g, '');
                                            setExpenseForm(prev => ({
                                                ...prev,
                                                amount: raw ? new Intl.NumberFormat('id-ID').format(parseInt(raw, 10)) : ''
                                            }));
                                        }}
                                        className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base font-black font-mono text-rose-700 outline-none focus:border-rose-600 focus:bg-white transition-all"
                                        required
                                        autoFocus
                                    />
                                </div>

                                {/* Quick Preset Buttons */}
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {[10000, 20000, 50000, 100000, 200000, 500000, 1000000].map(val => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => {
                                                const currentVal = parseFloat(expenseForm.amount.replace(/[^0-9]/g, '')) || 0;
                                                const nextVal = currentVal + val;
                                                setExpenseForm(prev => ({
                                                    ...prev,
                                                    amount: new Intl.NumberFormat('id-ID').format(nextVal)
                                                }));
                                            }}
                                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] font-bold rounded-lg transition-colors border border-slate-200"
                                        >
                                            +{formatIDR(val)}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setExpenseForm(prev => ({ ...prev, amount: '' }))}
                                        className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-mono text-[10px] font-bold rounded-lg transition-colors border border-rose-200"
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>

                            {/* Keterangan / Deskripsi */}
                            <div>
                                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Keterangan / Rincian Pengeluaran <span className="text-rose-600">*</span>
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Contoh: Beli token listrik PLN 500rb, makan siang shift pagi, dll."
                                    value={expenseForm.description}
                                    onChange={e => setExpenseForm(prev => ({ ...prev, description: e.target.value }))}
                                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 outline-none focus:border-rose-600 focus:bg-white transition-all resize-none"
                                    required
                                />
                            </div>

                            {/* Tanggal & Metode Pembayaran (Grid 2 Kolom) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                                        <span>Tanggal Pengeluaran <span className="text-rose-600">*</span></span>
                                        <span className="text-[10px] text-amber-700 font-mono font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="Periode Aktif">
                                            {periodRange.shortLabel}
                                        </span>
                                    </label>
                                    <input
                                        type="date"
                                        value={expenseForm.date}
                                        onChange={e => setExpenseForm(prev => ({ ...prev, date: e.target.value }))}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:border-rose-600 focus:bg-white transition-all"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                                        Sumber Pembayaran <span className="text-rose-600">*</span>
                                    </label>
                                    <select
                                        value={expenseForm.paymentMethod}
                                        onChange={e => setExpenseForm(prev => ({ ...prev, paymentMethod: e.target.value as PaymentMethod }))}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-rose-600 focus:bg-white transition-all cursor-pointer"
                                    >
                                        <option value={PaymentMethod.CASH}>💵 TUNAI / CASH FISIK KASIR</option>
                                        <option value={PaymentMethod.TRANSFER}>🏦 TRANSFER BANK</option>
                                        <option value={PaymentMethod.QRIS}>📱 QRIS / DIGITAL</option>
                                    </select>
                                </div>
                            </div>

                            {/* Bank Selection if Transfer */}
                            {expenseForm.paymentMethod === PaymentMethod.TRANSFER && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">
                                        Rekening Bank Pengirim / Sumber
                                    </label>
                                    <select
                                        value={expenseForm.bankId}
                                        onChange={e => setExpenseForm(prev => ({ ...prev, bankId: e.target.value }))}
                                        className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs outline-none focus:border-blue-600 cursor-pointer"
                                    >
                                        <option value="">-- Pilih Rekening Bank (Opsional) --</option>
                                        {banks.map(b => (
                                            <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber} ({b.holderName})</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Impact Notice */}
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 space-y-1">
                                <div className="font-bold flex items-center gap-1.5">
                                    <Info size={14} className="text-amber-700 shrink-0" />
                                    Dampak Perhitungan Berita Acara:
                                </div>
                                <p className="text-[10.5px] leading-relaxed">
                                    Pengeluaran ini akan langsung menambah <strong>Section V (Laporan Pengeluaran Operasional)</strong>, mengurangi <strong>Laba Bersih Toko</strong>, dan jika metode <strong>Tunai Kasir</strong> akan langsung memotong <strong>Setoran Tunai Bersih Kasir</strong> di Section VI.
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setShowExpenseModal(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingExpense}
                                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all shadow-md shadow-rose-600/20 active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {isSubmittingExpense ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                                    {editingExpenseId ? 'Simpan Perubahan' : 'Simpan Pengeluaran'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Category Details Modal for Multiple Items */}
            {categoryDetailsModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 animate-fade-in print:hidden">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="px-5 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                                    <Edit3 size={18} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black tracking-tight">Rincian Pos: {categoryDetailsModal.categoryName}</h3>
                                    <p className="text-[11px] text-slate-300">Pilih transaksi untuk mengedit atau menghapus data pengeluaran</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setCategoryDetailsModal(null)}
                                className="p-1 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="p-2.5 text-center w-10">No</th>
                                        <th className="p-2.5 w-28">Tanggal</th>
                                        <th className="p-2.5">Keterangan</th>
                                        <th className="p-2.5 text-center w-24">Metode</th>
                                        <th className="p-2.5 text-right w-32 text-rose-700 font-bold">Nominal</th>
                                        <th className="p-2.5 text-center w-20">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                    {categoryDetailsModal.items.map((item, idx) => (
                                        <tr key={item.id} className="hover:bg-slate-50">
                                            <td className="p-2.5 text-center font-mono text-slate-500">{idx + 1}</td>
                                            <td className="p-2.5 font-mono text-slate-600">{new Date(item.date).toLocaleDateString('id-ID')}</td>
                                            <td className="p-2.5 text-slate-800">{item.description}</td>
                                            <td className="p-2.5 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.paymentMethod === PaymentMethod.CASH ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}`}>
                                                    {item.paymentMethod || 'CASH'}
                                                </span>
                                            </td>
                                            <td className="p-2.5 text-right font-mono font-bold text-rose-700">{formatIDR(item.amount)}</td>
                                            <td className="p-2.5 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditExpense(item)}
                                                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Edit Pengeluaran Ini"
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            await handleDeleteExpense(item.id);
                                                            setCategoryDetailsModal(prev => prev ? {
                                                                ...prev,
                                                                items: prev.items.filter(i => i.id !== item.id)
                                                            } : null);
                                                        }}
                                                        className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                                                        title="Hapus Pengeluaran Ini"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-600">Total: {formatIDR(categoryDetailsModal.items.reduce((s, i) => s + (i.amount || 0), 0))}</span>
                            <button
                                onClick={() => setCategoryDetailsModal(null)}
                                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
