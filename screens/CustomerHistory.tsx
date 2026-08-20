import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { Transaction, PaymentStatus, Customer, UserRole, User, PaymentMethod, StoreSettings, TransactionType } from '../types';
import { formatIDR, formatDate, formatDateDateOnly, formatTimeOnly, exportToCSV, exportToExcel } from '../utils';
import { generatePrintTransactionDetail, generatePrintInvoice } from '../utils/printHelpers';
import { generateESCPOSReceipt } from '../utils/escposEncoder';
import { useBluetoothPrinter } from '../hooks/useBluetoothPrinter';
import { Download, Search, Filter, RotateCcw, X, Eye, FileText, Printer, FileSpreadsheet, UserCheck, Calendar, Trash2, Bluetooth, RefreshCw } from 'lucide-react';

interface CustomerHistoryProps {
    currentUser: User | null;
}

export const CustomerHistory: React.FC<CustomerHistoryProps> = ({ currentUser }) => {
    const bluetooth = useBluetoothPrinter();
    const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];
    const customers = useData(() => StorageService.getCustomers(), [], 'customers') || [];
    const banks = useData(() => StorageService.getBanks(), [], 'banks') || [];

    // State
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [detailTransaction, setDetailTransaction] = useState<Transaction | null>(null);
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

    // Pagination State
    const [visibleCount, setVisibleCount] = useState(20);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    // Reset pagination on filter change
    useEffect(() => {
        setVisibleCount(20);
    }, [selectedCustomerId, startDate, endDate, searchQuery]);

    // Load store settings
    useEffect(() => {
        StorageService.getStoreSettings().then(setStoreSettings);
    }, []);

    // Helper for WIT Date
    const getWITDateStr = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jayapura' });
    };

    // Get selected customer
    const selectedCustomer = useMemo(() => {
        return customers.find(c => c.id === selectedCustomerId) || null;
    }, [customers, selectedCustomerId]);

    // Helper for exact timestamp parsing (hour, minute, second)
    const getExactTimestamp = (item: any): number => {
        if (item.createdAt) {
            const createdStr = typeof item.createdAt === 'string' ? item.createdAt.replace(' ', 'T') : item.createdAt;
            const createdTime = new Date(createdStr).getTime();
            if (!isNaN(createdTime) && createdTime > 0) return createdTime;
        }
        if (item.date) {
            const dateStr = typeof item.date === 'string' ? item.date.replace(' ', 'T') : item.date;
            const time = new Date(dateStr).getTime();
            if (!isNaN(time) && time > 0) return time;
        }
        if (item.id) {
            const num = Number(item.id);
            if (!isNaN(num) && num > 1000000000000) return num;
        }
        return 0;
    };

    // Filter Logic
    const filteredTransactions = useMemo(() => {
        let items = [...transactions];

        // Filter by customer
        if (selectedCustomerId) {
            items = items.filter(t => t.customerId === selectedCustomerId);
        }

        // Date Filter
        if (startDate || endDate) {
            items = items.filter(item => {
                const itemDateStr = getWITDateStr(item.date);
                if (startDate && itemDateStr < startDate) return false;
                if (endDate && itemDateStr > endDate) return false;
                return true;
            });
        }

        // Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            items = items.filter(t =>
                t.id.toLowerCase().includes(query) ||
                (t.invoiceNumber && t.invoiceNumber.toLowerCase().includes(query)) ||
                t.customerName.toLowerCase().includes(query) ||
                t.cashierName.toLowerCase().includes(query)
            );
        }

        // Sort (Waktu/Jam Paling Terbaru di Atas - Descending)
        items.sort((a, b) => {
            const aTime = getExactTimestamp(a);
            const bTime = getExactTimestamp(b);
            if (bTime !== aTime) {
                return bTime - aTime;
            }
            const aInvoice = a.invoiceNumber || a.id || '';
            const bInvoice = b.invoiceNumber || b.id || '';
            return bInvoice.localeCompare(aInvoice);
        });

        return items;
    }, [transactions, selectedCustomerId, startDate, endDate, searchQuery, currentUser]);

    const visibleTransactions = useMemo(() => filteredTransactions.slice(0, visibleCount), [filteredTransactions, visibleCount]);

    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => prev + 20);
                }
            },
            { threshold: 0.5 }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => {
            if (loadMoreRef.current) {
                observer.unobserve(loadMoreRef.current);
            }
        };
    }, [loadMoreRef.current, filteredTransactions]);

    // Calculate totals
    const totals = useMemo(() => {
        const totalSales = filteredTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
        const totalPaid = filteredTransactions.reduce((sum, t) => sum + t.amountPaid, 0);
        const totalDebt = filteredTransactions
            .filter(t => t.paymentStatus !== PaymentStatus.PAID)
            .reduce((sum, t) => sum + (t.totalAmount - t.amountPaid), 0);

        return { totalSales, totalPaid, totalDebt };
    }, [filteredTransactions]);

    const handleDeleteTransaction = async (transactionId: string) => {
        if (!confirm('Yakin ingin menghapus transaksi ini? Seluruh item dalam transaksi ini akan ikut terhapus. Aksi ini tidak dapat dibatalkan.')) return;
        try {
            await StorageService.deleteTransaction(transactionId);
            window.dispatchEvent(new Event('transactions_updated'));
            window.dispatchEvent(new Event('products_updated'));
            if (detailTransaction?.id === transactionId) {
                setDetailTransaction(null);
            }
            alert('Transaksi berhasil dihapus.');
        } catch (error) {
            console.error("Failed to delete transaction:", error);
            alert("Gagal menghapus transaksi.");
        }
    };



    const handleExport = () => {
        const headers = ['ID Transaksi', 'No Faktur', 'Tanggal', 'Waktu / Jam', 'Pelanggan', 'Total', 'Dibayar', 'Piutang', 'Kembalian', 'Status', 'Metode', 'Kasir'];
        const rows = filteredTransactions.map(t => {
            const remaining = t.totalAmount - t.amountPaid;
            const piutang = remaining > 0 ? remaining : 0;
            const kembalian = remaining < 0 ? Math.abs(remaining) : 0;
            return [
                t.id,
                t.invoiceNumber || '-',
                formatDateDateOnly(t.date),
                formatTimeOnly(t.date),
                t.customerName,
                t.totalAmount,
                t.amountPaid,
                piutang,
                kembalian,
                t.type === TransactionType.RETURN ? 'RETUR' : (t.paymentStatus === 'BELUM_LUNAS' ? 'BELUM LUNAS' : t.paymentStatus) + (t.isReturned ? ' (Ada Retur)' : ''),
                t.paymentMethod,
                t.cashierName
            ];
        });
        exportToCSV(`riwayat-pelanggan-${selectedCustomer?.name || 'all'}.csv`, headers, rows);
    };

    const handleExportExcel = () => {
        const data = filteredTransactions.map(t => {
            const remaining = t.totalAmount - t.amountPaid;
            const piutang = remaining > 0 ? remaining : 0;
            const kembalian = remaining < 0 ? Math.abs(remaining) : 0;
            return {
                'ID Transaksi': t.id,
                'No Faktur': t.invoiceNumber || '-',
                'Tanggal': formatDateDateOnly(t.date),
                'Waktu / Jam': formatTimeOnly(t.date),
                'Pelanggan': t.customerName,
                'Total': t.totalAmount,
                'Dibayar': t.amountPaid,
                'Piutang': piutang,
                'Kembalian': kembalian,
                'Status': t.type === TransactionType.RETURN ? 'RETUR' : (t.paymentStatus === 'BELUM_LUNAS' ? 'BELUM LUNAS' : t.paymentStatus) + (t.isReturned ? ' (Ada Retur)' : ''),
                'Metode': t.paymentMethod,
                'Kasir': t.cashierName
            };
        });

        const cols = [
            { wch: 15 }, // ID
            { wch: 20 }, // Faktur
            { wch: 15 }, // Tanggal
            { wch: 15 }, // Waktu Jam
            { wch: 20 }, // Pelanggan
            { wch: 15 }, // Total
            { wch: 15 }, // Dibayar
            { wch: 15 }, // Piutang
            { wch: 15 }, // Kembalian
            { wch: 15 }, // Status
            { wch: 15 }, // Metode
            { wch: 15 }  // Kasir
        ];

        exportToExcel(data, `Riwayat_Pelanggan_${selectedCustomer?.name || 'All'}`, "Riwayat Pelanggan", cols);
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const rows = filteredTransactions.map((t, idx) => {
            const remaining = t.totalAmount - t.amountPaid;
            const piutang = remaining > 0 ? remaining : 0;
            const kembalian = remaining < 0 ? Math.abs(remaining) : 0;
            return `
            <tr>
                <td>${idx + 1}</td>
                <td>${formatDateDateOnly(t.date)}</td>
                <td>${formatTimeOnly(t.date)}</td>
                <td>${t.id.substring(0, 8)}</td>
                <td>${t.invoiceNumber || '-'}</td>
                <td>${t.customerName}</td>
                <td style="text-align:right">${formatIDR(t.totalAmount)}</td>
                <td style="text-align:right">${formatIDR(t.amountPaid)}</td>
                <td style="text-align:right">${piutang > 0 ? formatIDR(piutang) : '-'}</td>
                <td style="text-align:right">${kembalian > 0 ? formatIDR(kembalian) : '-'}</td>
                <td>${t.type === TransactionType.RETURN ? 'RETUR' : (t.paymentStatus === 'BELUM_LUNAS' ? 'BELUM LUNAS' : t.paymentStatus) + (t.isReturned ? ' (Ada Retur)' : '')}</td>
                <td>${t.cashierName}</td>
            </tr>
        `;
        }).join('');

        const html = `
            <html>
                <head>
                    <title>Riwayat Pelanggan</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
                        h2 { text-align: center; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; font-weight: bold; }
                        .summary { margin-bottom: 20px; padding: 10px; background: #f9f9f9; border: 1px solid #ddd; }
                    </style>
                </head>
                <body>
                    <h2>Riwayat Transaksi Pelanggan</h2>
                    <div class="summary">
                        <p><strong>Pelanggan:</strong> ${selectedCustomer?.name || 'Semua Pelanggan'}</p>
                        <p><strong>Periode:</strong> ${startDate ? new Date(startDate).toLocaleDateString('id-ID') : 'Semua'} - ${endDate ? new Date(endDate).toLocaleDateString('id-ID') : 'Semua'}</p>
                        <p><strong>Total Penjualan:</strong> ${formatIDR(totals.totalSales)}</p>
                        <p><strong>Total Dibayar:</strong> ${formatIDR(totals.totalPaid)}</p>
                        <p><strong>Total Piutang:</strong> ${formatIDR(totals.totalDebt)}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>No</th>
                                <th>Tanggal</th>
                                <th>Waktu / Jam</th>
                                <th>ID</th>
                                <th>Faktur</th>
                                <th>Pelanggan</th>
                                <th>Total</th>
                                <th>Dibayar</th>
                                <th>Piutang</th>
                                <th>Kembalian</th>
                                <th>Status</th>
                                <th>Kasir</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                    <script>window.print();</script>
                </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const printTransactionDetail = (tx: Transaction) => {
        const settings = storeSettings || { name: 'Kasir REP' } as StoreSettings;
        const w = window.open('', '', 'width=800,height=600');
        if (!w) return;

        const html = generatePrintTransactionDetail(tx, settings, formatIDR, formatDate);
        w.document.write(html);
        w.document.close();
    };

    const handlePrintReceipt = async (tx: Transaction) => {
        try {
            const settings = storeSettings || { name: 'Kasir REP' } as StoreSettings;

            // 1. Connect bluetooth in user gesture context if not connected
            if (!bluetooth.isConnected) {
                try {
                    await bluetooth.connect();
                } catch (connErr: any) {
                    if (connErr.name === 'NotFoundError' || connErr.message?.includes('cancelled')) {
                        return;
                    }
                    console.warn("[BT Printer] Connect attempt error:", connErr);
                }
            }

            // 2. Direct print via bluetooth thermal ESC/POS without print popup dialog
            if (bluetooth.isConnected) {
                const escposData = generateESCPOSReceipt(tx, settings);
                await bluetooth.print(escposData);
                return;
            }

            // 3. Fallback if Bluetooth printer not connected
            const w = window.open('', '', 'width=800,height=600');
            if (!w) {
                alert("Popup blocker mencegah cetak struk. Mohon izinkan popup untuk website ini.");
                return;
            }
            const html = generatePrintInvoice(tx, settings, formatIDR, formatDate);
            w.document.write(html);
            w.document.close();
        } catch (error: any) {
            console.error('[BT Printer] Cetak gagal:', error);
            alert(`Gagal mencetak struk: ${error.message || 'Periksa koneksi printer.'}`);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in p-2 md:p-0">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <UserCheck className="text-amber-600" />
                        Riwayat Transaksi Pelanggan
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Lacak seluruh riwayat pembelian, status pembayaran, dan piutang pelanggan</p>
                </div>

                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <button onClick={handlePrint} className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-white border border-slate-300 px-3.5 py-2 rounded-xl text-slate-700 hover:bg-slate-50 transition-all flex text-xs font-medium shadow-sm">
                        <Printer size={15} /> Print
                    </button>
                    <button onClick={handleExportExcel} className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl text-emerald-700 hover:bg-emerald-100 transition-all flex text-xs font-medium shadow-sm">
                        <FileSpreadsheet size={15} /> Excel
                    </button>
                    <button onClick={handleExport} className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-white border border-slate-300 px-3.5 py-2 rounded-xl text-slate-700 hover:bg-slate-50 transition-all flex text-xs font-medium shadow-sm">
                        <Download size={15} /> CSV
                    </button>
                </div>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Penjualan</p>
                        <h3 className="text-lg font-extrabold text-slate-900 mt-1">{formatIDR(totals.totalSales)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{filteredTransactions.length} Transaksi</p>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                        <FileText size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Terbayar (Lunas)</p>
                        <h3 className="text-lg font-extrabold text-emerald-600 mt-1">{formatIDR(totals.totalPaid)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Sudah Diterima</p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                        <UserCheck size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sisa Piutang Pelanggan</p>
                        <h3 className="text-lg font-extrabold text-rose-600 mt-1">{formatIDR(totals.totalDebt)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {filteredTransactions.filter(t => t.paymentStatus !== PaymentStatus.PAID).length} Transaksi Belum Lunas
                        </p>
                    </div>
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                        <X size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pelanggan Terpilih</p>
                        <h3 className="text-base font-extrabold text-amber-700 mt-1 truncate max-w-[150px]">
                            {selectedCustomer ? selectedCustomer.name : 'Semua Pelanggan'}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{customers.length} Pelanggan Terdaftar</p>
                    </div>
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                        <UserCheck size={22} />
                    </div>
                </div>
            </div>

            {/* Filter Controls Card */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
                {/* Customer Selector Dropdown */}
                <div className="relative min-w-[220px]">
                    <select
                        id="customerFilter"
                        name="customerFilter"
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none text-xs font-semibold text-slate-800 pr-8 appearance-none cursor-pointer"
                        value={selectedCustomerId}
                        onChange={e => setSelectedCustomerId(e.target.value)}
                    >
                        <option value="">-- Semua Pelanggan --</option>
                        {customers.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                            <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>

                {/* Date Filters */}
                <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <Filter size={15} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">Tanggal:</span>
                    <div className="relative flex items-center bg-white border border-slate-300 rounded px-2 py-1">
                        <span className="text-xs text-slate-700 pr-6 font-medium">
                            {startDate ? new Date(startDate).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'dd/mm/yyyy'}
                        </span>
                        <input
                            id="startDate"
                            name="startDate"
                            type="date"
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                        <Calendar size={14} className="absolute right-2 text-slate-400 pointer-events-none" />
                    </div>
                    <span className="text-slate-400">-</span>
                    <div className="relative flex items-center bg-white border border-slate-300 rounded px-2 py-1">
                        <span className="text-xs text-slate-700 pr-6 font-medium">
                            {endDate ? new Date(endDate).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'dd/mm/yyyy'}
                        </span>
                        <input
                            id="endDate"
                            name="endDate"
                            type="date"
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                        <Calendar size={14} className="absolute right-2 text-slate-400 pointer-events-none" />
                    </div>
                    {(startDate || endDate) && (
                        <button
                            onClick={() => { setStartDate(''); setEndDate(''); }}
                            className="p-1 text-slate-400 hover:text-slate-600 bg-slate-200 rounded ml-1"
                            title="Reset Tanggal"
                        >
                            <RotateCcw size={14} />
                        </button>
                    )}
                </div>

                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        id="searchTransaction"
                        name="searchTransaction"
                        type="text"
                        placeholder="Cari ID transaksi, no faktur, pelanggan, kasir..."
                        className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all text-xs text-slate-800"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Table Container */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
                <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700 text-xs flex justify-between items-center">
                    <span>Daftar Transaksi Pelanggan ({filteredTransactions.length})</span>
                    <span className="text-rose-700 font-bold">Total Piutang: {formatIDR(totals.totalDebt)}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-semibold">
                            <tr>
                                <th className="p-3.5">Tanggal</th>
                                <th className="p-3.5 bg-amber-50/60 border-b-2 border-amber-500/50">
                                    <div className="flex items-center gap-1.5 text-amber-900 font-extrabold">
                                        Waktu / Jam
                                        <span className="text-[10px] bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded-md font-mono tracking-tight shadow-xs">
                                            ↓ Terbaru
                                        </span>
                                    </div>
                                </th>
                                <th className="p-3.5">No Faktur & Ref</th>
                                <th className="p-3.5">Pelanggan</th>
                                <th className="p-3.5">Total Belanja</th>
                                <th className="p-3.5">Dibayar</th>
                                <th className="p-3.5">Sisa Piutang</th>
                                <th className="p-3.5">Kembalian</th>
                                <th className="p-3.5">Status</th>
                                <th className="p-3.5">Metode</th>
                                <th className="p-3.5">Kasir</th>
                                <th className="p-3.5 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredTransactions.length === 0 && (
                                <tr>
                                    <td colSpan={12} className="p-8 text-center text-slate-400">Tidak ada riwayat transaksi pelanggan yang ditemukan.</td>
                                </tr>
                            )}
                            {visibleTransactions.map(t => {
                                const remaining = t.totalAmount - t.amountPaid;
                                const piutang = remaining > 0 ? remaining : 0;
                                const kembalian = remaining < 0 ? Math.abs(remaining) : 0;

                                return (
                                    <tr key={t.id} onClick={() => setDetailTransaction(t)} className="hover:bg-slate-50 cursor-pointer transition-colors group">
                                        <td className="p-3.5 font-semibold text-slate-800 whitespace-nowrap">
                                            {formatDateDateOnly(t.date)}
                                        </td>
                                        <td className="p-3.5 whitespace-nowrap bg-amber-50/20">
                                            <span className="font-mono text-xs font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded border border-amber-200 inline-block shadow-2xs">
                                                {formatTimeOnly(t.createdAt || t.date)}
                                            </span>
                                        </td>
                                        <td className="p-3.5 whitespace-nowrap">
                                            <div className="font-mono text-xs font-bold text-slate-800">{t.invoiceNumber || '-'}</div>
                                            <div className="text-[10px] font-mono text-slate-400">#{t.id.substring(0, 8)}</div>
                                        </td>
                                        <td className="p-3.5 font-semibold text-slate-800 whitespace-nowrap">
                                            {t.customerName}
                                        </td>
                                        <td className="p-3.5 font-extrabold text-slate-900 whitespace-nowrap">
                                            {formatIDR(t.totalAmount)}
                                        </td>
                                        <td className="p-3.5 text-emerald-600 font-bold whitespace-nowrap">
                                            {formatIDR(t.amountPaid)}
                                        </td>
                                        <td className="p-3.5 text-rose-600 font-bold whitespace-nowrap">
                                            {piutang > 0 ? formatIDR(piutang) : '-'}
                                        </td>
                                        <td className="p-3.5 text-emerald-600 font-medium whitespace-nowrap">
                                            {kembalian > 0 ? formatIDR(kembalian) : '-'}
                                        </td>
                                        <td className="p-3.5 whitespace-nowrap">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                                                t.type === TransactionType.RETURN
                                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                    : t.paymentStatus === PaymentStatus.PAID
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : t.paymentStatus === PaymentStatus.PARTIAL
                                                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                            : 'bg-rose-50 text-rose-700 border-rose-200'
                                            }`}>
                                                {t.type === TransactionType.RETURN
                                                    ? 'RETUR'
                                                    : (t.paymentStatus === 'BELUM_LUNAS' ? 'BELUM LUNAS' : t.paymentStatus) + (t.isReturned ? ' (Ada Retur)' : '')}
                                            </span>
                                        </td>
                                        <td className="p-3.5 text-slate-600 font-medium whitespace-nowrap">{((t.paymentMethod as string) === 'TEMPO' || t.paymentMethod === PaymentMethod.BON) ? 'BON (Hutang)' : t.paymentMethod}</td>
                                        <td className="p-3.5 text-slate-600 font-medium whitespace-nowrap">{t.cashierName}</td>
                                        <td className="p-3.5 text-center whitespace-nowrap">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handlePrintReceipt(t); }}
                                                    className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg font-semibold transition-colors inline-flex items-center gap-1 text-[11px] border border-emerald-200"
                                                    title="Cetak Struk Thermal Bluetooth (Langsung Otomatis Tanpa Popup)"
                                                >
                                                    <Bluetooth size={12} /> Struk
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDetailTransaction(t); }}
                                                    className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg font-semibold transition-colors inline-flex items-center gap-1 text-[11px] border border-amber-200"
                                                    title="Lihat Detail Transaksi"
                                                >
                                                    <Eye size={12} /> Detail
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(t.id); }}
                                                    className="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg font-semibold transition-colors inline-flex items-center gap-1 text-[11px] border border-rose-200"
                                                    title="Hapus Transaksi"
                                                >
                                                    <Trash2 size={12} /> Hapus
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {visibleTransactions.length < filteredTransactions.length && (
                                <tr>
                                    <td colSpan={12} className="p-4 text-center text-slate-400">
                                        <div ref={loadMoreRef}>Loading more...</div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Modal */}
            {detailTransaction && createPortal(
                <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/40 backdrop-blur-md z-[99999] flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800">
                                Detail Transaksi {detailTransaction.invoiceNumber ? `(${detailTransaction.invoiceNumber})` : `#${detailTransaction.id.substring(0, 8)}`}
                            </h3>
                            <button onClick={() => setDetailTransaction(null)}><X size={20} className="text-slate-400" /></button>
                        </div>
                        <div className="p-6 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                                <div>
                                    <span className="text-slate-500 block text-xs">Waktu Transaksi</span>
                                    <span className="font-medium text-slate-900">
                                        {formatDate(detailTransaction.date)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-xs">Pelanggan</span>
                                    <span className="font-medium text-slate-900">{detailTransaction.customerName}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-xs">Kasir</span>
                                    <span className="font-medium text-slate-900">{detailTransaction.cashierName}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-xs">Metode Awal</span>
                                    <span className="font-medium text-slate-900">
                                        {((detailTransaction.paymentMethod as string) === 'TEMPO' || detailTransaction.paymentMethod === PaymentMethod.BON) ? 'BON (Hutang)' : detailTransaction.paymentMethod}
                                    </span>
                                    {(() => {
                                        if (detailTransaction.bankId) {
                                            const bank = banks.find(b => b.id === detailTransaction.bankId);
                                            if (bank) return <span className="block text-xs text-primary">via {bank.bankName} {bank.accountNumber}</span>;
                                        }
                                        if (detailTransaction.bankName) return <span className="block text-xs text-primary">via {detailTransaction.bankName}</span>;
                                        return null;
                                    })()}
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-xs">Status</span>
                                    <span className={`font-bold ${detailTransaction.type === TransactionType.RETURN ? 'text-purple-600' : detailTransaction.paymentStatus === 'LUNAS' ? 'text-green-600' : detailTransaction.paymentStatus === 'SEBAGIAN' ? 'text-orange-600' : 'text-red-600'}`}>
                                        {detailTransaction.type === TransactionType.RETURN ? 'RETUR' : detailTransaction.paymentStatus === 'BELUM_LUNAS' ? 'BELUM LUNAS' : detailTransaction.paymentStatus}
                                    </span>
                                </div>
                            </div>

                            <h4 className="font-bold text-sm text-slate-800 mb-2">Barang</h4>
                            <div className="border border-slate-200 rounded-lg mb-6 divide-y divide-slate-100">
                                {detailTransaction.items.map((item, idx) => (
                                    <div key={idx} className="p-3 flex justify-between">
                                        <div>
                                            <span className="block font-medium text-slate-700">{item.name}</span>
                                            <span className="text-xs text-slate-500">{item.qty} {item.unit || 'Pcs'} x {formatIDR(item.finalPrice)}</span>
                                        </div>
                                        <span className="font-medium text-slate-800">{formatIDR(item.finalPrice * item.qty)}</span>
                                    </div>
                                ))}
                                {(detailTransaction.discountAmount && detailTransaction.discountAmount > 0) && (
                                    <div className="p-3 flex justify-between text-red-600 bg-slate-50">
                                        <span>Diskon</span>
                                        <span>-{formatIDR(detailTransaction.discountAmount)}</span>
                                    </div>
                                )}
                                <div className="bg-slate-50 p-3 flex justify-between font-bold text-slate-900">
                                    <span>Total</span>
                                    <span>{formatIDR(detailTransaction.totalAmount)}</span>
                                </div>
                            </div>

                            {/* Return History (If this is a Sale) */}
                            {transactions.filter(t => t.type === TransactionType.RETURN && t.originalTransactionId === detailTransaction.id).length > 0 && (
                                <div className="mt-6">
                                    <h4 className="font-bold text-sm text-slate-800 mb-2">Riwayat Retur</h4>
                                    <div className="bg-orange-50 rounded-lg p-3 space-y-2 text-sm border border-orange-100">
                                        {transactions
                                            .filter(t => t.type === TransactionType.RETURN && t.originalTransactionId === detailTransaction.id)
                                            .map((ret, i) => (
                                                <div key={i} className="flex justify-between border-b border-orange-200 last:border-0 pb-2">
                                                    <div>
                                                        <div className="flex gap-1 text-xs text-slate-500">
                                                            <span>{new Date(ret.date).toLocaleDateString('id-ID')}</span>
                                                            <span className="font-mono bg-slate-200 px-1 rounded text-[10px]">{new Date(ret.date).toLocaleTimeString('id-ID')}</span>
                                                        </div>
                                                        <span className="text-slate-700 block font-medium">Retur #{ret.id.substring(0, 6)}</span>
                                                        <div className="text-xs text-slate-500 mt-1">
                                                            {ret.items.map((item, idx) => (
                                                                <div key={idx}>- {item.name} ({item.qty}x)</div>
                                                            ))}
                                                        </div>
                                                        {ret.returnNote && (
                                                            <div className="text-xs text-slate-600 mt-1 italic bg-white/50 p-1 rounded border border-orange-200">
                                                                Catatan: {ret.returnNote}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="font-medium text-red-600">{formatIDR(ret.totalAmount)}</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* Original Transaction Info (If this is a Return) */}
                            {detailTransaction.type === TransactionType.RETURN && detailTransaction.originalTransactionId && (
                                <div className="mt-6">
                                    <h4 className="font-bold text-sm text-slate-800 mb-2">Info Transaksi Induk</h4>
                                    <div className="bg-primary/5 rounded-lg p-3 text-sm border border-primary/10">
                                        {(() => {
                                            const originalTx = transactions.find(t => t.id === detailTransaction.originalTransactionId);
                                            if (originalTx) {
                                                return (
                                                    <div className="flex justify-between items-center cursor-pointer hover:bg-primary/10 p-2 rounded transition-colors" onClick={() => setDetailTransaction(originalTx)}>
                                                        <div>
                                                            <div className="flex gap-1 text-xs text-slate-500">
                                                                <span>{new Date(originalTx.date).toLocaleDateString('id-ID')}</span>
                                                            </div>
                                                            <span className="text-slate-700 font-bold block">#{originalTx.id.substring(0, 8)}</span>
                                                            <span className="text-xs text-slate-600">Total: {formatIDR(originalTx.totalAmount)}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-xs bg-white border border-primary/20 px-2 py-1 rounded text-primary flex items-center gap-1">
                                                                <Eye size={10} /> Lihat
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return <span className="text-slate-500 italic">Transaksi induk tidak ditemukan</span>;
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* Payment History */}
                            <h4 className="font-bold text-sm text-slate-800 mb-2 mt-6">Riwayat Pembayaran</h4>
                            <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-sm">
                                {detailTransaction.paymentHistory?.map((ph, i) => (
                                    <div key={i} className="flex justify-between border-b border-slate-200 last:border-0 pb-1">
                                        <div>
                                            <div className="flex gap-1 text-xs text-slate-500">
                                                <span>{new Date(ph.date).toLocaleDateString('id-ID')}</span>
                                                <span className="font-mono bg-slate-200 px-1 rounded text-[10px]">{new Date(ph.date).toLocaleTimeString('id-ID')}</span>
                                            </div>
                                            <span className="text-slate-700 block">{ph.note || 'Pembayaran'} ({ph.method})</span>
                                            {(() => {
                                                if (ph.bankId) {
                                                    const bank = banks.find(b => b.id === ph.bankId);
                                                    if (bank) return <span className="text-[10px] text-primary italic">via {bank.bankName} {bank.accountNumber}</span>;
                                                }
                                                if (ph.bankName) return <span className="text-[10px] text-primary italic">via {ph.bankName}</span>;
                                                return null;
                                            })()}
                                        </div>
                                        <span className="font-medium text-green-600">{formatIDR(ph.amount)}</span>
                                    </div>
                                ))}
                                {!detailTransaction.paymentHistory && (
                                    <div className="flex justify-between">
                                        <span>Pembayaran Awal</span>
                                        <span>{formatIDR(detailTransaction.amountPaid)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between pt-2 font-bold border-t border-slate-200">
                                    <span>Total Dibayar</span>
                                    <span>{formatIDR(detailTransaction.amountPaid)}</span>
                                </div>
                                {(() => {
                                    const remaining = detailTransaction.totalAmount - detailTransaction.amountPaid;
                                    if (remaining > 0) {
                                        return (
                                            <div className="flex justify-between text-red-600 font-bold">
                                                <span>Sisa Tagihan</span>
                                                <span>{formatIDR(remaining)}</span>
                                            </div>
                                        );
                                    } else if (remaining < 0) {
                                        return (
                                            <div className="flex justify-between text-green-600 font-bold">
                                                <span>Kembalian</span>
                                                <span>{formatIDR(Math.abs(remaining))}</span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center flex-wrap gap-2">
                            <button
                                onClick={() => handleDeleteTransaction(detailTransaction.id)}
                                className="bg-rose-50 border border-rose-200 text-rose-600 px-3.5 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 hover:bg-rose-100 transition-colors"
                                title="Hapus Transaksi Ini"
                            >
                                <Trash2 size={16} /> Hapus Transaksi
                            </button>
                            <div className="flex flex-wrap gap-2">
                                {detailTransaction.type !== TransactionType.RETURN && (
                                    <button
                                        onClick={() => {
                                            if (confirm(`Buka kembali transaksi #${detailTransaction.invoiceNumber || detailTransaction.id.substring(0, 8)} untuk penambahan pesanan (Add-on Order / Reopen)?`)) {
                                                sessionStorage.setItem('pos_reopen_transaction', JSON.stringify(detailTransaction));
                                                window.location.href = '/pos';
                                            }
                                        }}
                                        className="bg-indigo-50 border border-indigo-300 text-indigo-700 px-3.5 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 hover:bg-indigo-100 transition-colors"
                                        title="Reopen transaksi untuk menambah pesanan barang baru"
                                    >
                                        <RefreshCw size={16} /> Reopen / Tambah Pesanan
                                    </button>
                                )}
                                <button
                                    onClick={() => handlePrintReceipt(detailTransaction)}
                                    className="bg-emerald-600 text-white border border-emerald-700 px-3.5 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 hover:bg-emerald-700 transition-colors shadow-xs"
                                    title="Cetak Langsung Struk Thermal Bluetooth (Tanpa Popup Konfirmasi)"
                                >
                                    <Bluetooth size={16} /> Cetak Struk
                                </button>
                                <button onClick={() => printTransactionDetail(detailTransaction)} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-50">
                                    <Printer size={16} /> Cetak Detail
                                </button>
                                <button onClick={() => setDetailTransaction(null)} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold">Tutup</button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
