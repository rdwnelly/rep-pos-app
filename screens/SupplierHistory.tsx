import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { Purchase, PaymentStatus, Supplier, UserRole, User, PaymentMethod, StoreSettings, PurchaseType } from '../types';
import { formatIDR, formatDate, exportToCSV, exportToExcel } from '../utils';
import { generatePrintPurchaseDetail } from '../utils/printHelpers';
import { Download, Search, Filter, RotateCcw, X, Eye, Printer, FileSpreadsheet, Truck as TruckIcon, Calendar } from 'lucide-react';

interface SupplierHistoryProps {
    currentUser: User | null;
}

export const SupplierHistory: React.FC<SupplierHistoryProps> = ({ currentUser }) => {
    const purchases = useData(() => StorageService.getPurchases(), [], 'purchases') || [];
    const suppliers = useData(() => StorageService.getSuppliers(), [], 'suppliers') || [];
    const banks = useData(() => StorageService.getBanks(), [], 'banks') || [];

    // State
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null);
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

    // Pagination State
    const [visibleCount, setVisibleCount] = useState(20);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    // Reset pagination on filter change
    useEffect(() => {
        setVisibleCount(20);
    }, [selectedSupplierId, startDate, endDate, searchQuery]);

    // Load store settings
    useEffect(() => {
        StorageService.getStoreSettings().then(setStoreSettings);
    }, []);

    // Helper for WIT Date
    const getWITDateStr = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jayapura' });
    };

    // Get selected supplier
    const selectedSupplier = useMemo(() => {
        return suppliers.find(s => s.id === selectedSupplierId) || null;
    }, [suppliers, selectedSupplierId]);

    // Helper for exact timestamp parsing (hour, minute, second)
    const getExactTimestamp = (item: any): number => {
        if (item.date) {
            const dateStr = typeof item.date === 'string' ? item.date.replace(' ', 'T') : item.date;
            const time = new Date(dateStr).getTime();
            if (!isNaN(time) && time > 0) {
                const hasTime = typeof item.date === 'string' ? item.date.includes(':') : true;
                if (hasTime || !item.createdAt) return time;
            }
        }
        if (item.createdAt) {
            const createdStr = typeof item.createdAt === 'string' ? item.createdAt.replace(' ', 'T') : item.createdAt;
            const createdTime = new Date(createdStr).getTime();
            if (!isNaN(createdTime) && createdTime > 0) return createdTime;
        }
        if (item.id) {
            const num = Number(item.id);
            if (!isNaN(num) && num > 1000000000000) return num;
        }
        return 0;
    };

    // Filter Logic
    const filteredPurchases = useMemo(() => {
        let items = [...purchases];

        // Filter by supplier
        if (selectedSupplierId) {
            items = items.filter(p => p.supplierId === selectedSupplierId);
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
            items = items.filter(p =>
                p.id.toLowerCase().includes(query) ||
                (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(query)) ||
                p.supplierName.toLowerCase().includes(query) ||
                p.description.toLowerCase().includes(query)
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
    }, [purchases, selectedSupplierId, startDate, endDate, searchQuery]);

    const visiblePurchases = useMemo(() => filteredPurchases.slice(0, visibleCount), [filteredPurchases, visibleCount]);

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
    }, [loadMoreRef.current, filteredPurchases]);

    // Calculate totals
    const totals = useMemo(() => {
        const totalPurchases = filteredPurchases.reduce((sum, p) => sum + p.totalAmount, 0);
        const totalPaid = filteredPurchases.reduce((sum, p) => sum + p.amountPaid, 0);
        const totalDebt = filteredPurchases
            .filter(p => p.paymentStatus !== PaymentStatus.PAID)
            .reduce((sum, p) => sum + (p.totalAmount - p.amountPaid), 0);

        return { totalPurchases, totalPaid, totalDebt };
    }, [filteredPurchases]);



    const handleExport = () => {
        const headers = ['ID Pembelian', 'No Faktur', 'Tanggal', 'Supplier', 'Deskripsi', 'Total', 'Dibayar', 'Sisa', 'Status', 'Metode'];
        const rows = filteredPurchases.map(p => [
            p.id,
            p.invoiceNumber || '-',
            formatDate(p.date),
            p.supplierName,
            p.description,
            p.totalAmount,
            p.amountPaid,
            p.totalAmount - p.amountPaid,
            p.type === PurchaseType.RETURN ? 'RETUR' : (p.paymentStatus === 'BELUM_LUNAS' ? 'BELUM LUNAS' : p.paymentStatus) + (p.isReturned ? ' (Ada Retur)' : ''),
            p.paymentMethod
        ]);
        exportToCSV(`riwayat-supplier-${selectedSupplier?.name || 'all'}.csv`, headers, rows);
    };

    const handleExportExcel = () => {
        const data = filteredPurchases.map(p => ({
            'ID Pembelian': p.id,
            'No Faktur': p.invoiceNumber || '-',
            'Tanggal': formatDate(p.date),
            'Supplier': p.supplierName,
            'Deskripsi': p.description,
            'Total': p.totalAmount,
            'Dibayar': p.amountPaid,
            'Sisa': p.totalAmount - p.amountPaid,
            'Status': p.type === PurchaseType.RETURN ? 'RETUR' : (p.paymentStatus === 'BELUM_LUNAS' ? 'BELUM LUNAS' : p.paymentStatus) + (p.isReturned ? ' (Ada Retur)' : ''),
            'Metode': p.paymentMethod
        }));

        const cols = [
            { wch: 15 }, // ID
            { wch: 20 }, // Faktur
            { wch: 15 }, // Tanggal
            { wch: 20 }, // Supplier
            { wch: 30 }, // Deskripsi
            { wch: 15 }, // Total
            { wch: 15 }, // Dibayar
            { wch: 15 }, // Sisa
            { wch: 15 }, // Status
            { wch: 15 }  // Metode
        ];

        exportToExcel(data, `Riwayat_Supplier_${selectedSupplier?.name || 'All'}`, "Riwayat Supplier", cols);
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const rows = filteredPurchases.map((p, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${formatDate(p.date)}</td>
                <td>${p.id.substring(0, 8)}</td>
                <td>${p.invoiceNumber || '-'}</td>
                <td>${p.supplierName}</td>
                <td>${p.description}</td>
                <td style="text-align:right">${formatIDR(p.totalAmount)}</td>
                <td style="text-align:right">${formatIDR(p.amountPaid)}</td>
                <td style="text-align:right">${formatIDR(p.totalAmount - p.amountPaid)}</td>
                <td>${p.type === PurchaseType.RETURN ? 'RETUR' : (p.paymentStatus === 'BELUM_LUNAS' ? 'BELUM LUNAS' : p.paymentStatus) + (p.isReturned ? ' (Ada Retur)' : '')}</td>
            </tr>
        `).join('');

        const html = `
            <html>
                <head>
                    <title>Riwayat Supplier</title>
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
                    <h2>Riwayat Pembelian dari Supplier</h2>
                    <div class="summary">
                        <p><strong>Supplier:</strong> ${selectedSupplier?.name || 'Semua Supplier'}</p>
                        <p><strong>Periode:</strong> ${startDate ? new Date(startDate).toLocaleDateString('id-ID') : 'Semua'} - ${endDate ? new Date(endDate).toLocaleDateString('id-ID') : 'Semua'}</p>
                        <p><strong>Total Pembelian:</strong> ${formatIDR(totals.totalPurchases)}</p>
                        <p><strong>Total Dibayar:</strong> ${formatIDR(totals.totalPaid)}</p>
                        <p><strong>Total Utang:</strong> ${formatIDR(totals.totalDebt)}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>No</th>
                                <th>Tanggal</th>
                                <th>ID</th>
                                <th>Faktur</th>
                                <th>Supplier</th>
                                <th>Deskripsi</th>
                                <th>Total</th>
                                <th>Dibayar</th>
                                <th>Sisa</th>
                                <th>Status</th>
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

    const printPurchaseDetail = (purchase: Purchase) => {
        const settings = storeSettings || { name: 'Kasir REP' } as StoreSettings;
        const w = window.open('', '', 'width=800,height=600');
        if (!w) return;

        const html = generatePrintPurchaseDetail(purchase, settings, formatIDR, formatDate);
        w.document.write(html);
        w.document.close();
    };

    return (
        <div className="space-y-6 animate-fade-in p-2 md:p-0">
            {/* Header Bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <TruckIcon className="text-amber-600" />
                        Riwayat Pembelian & Aktivitas Supplier
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Lacak transaksi pengadaan barang, sisa utang supplier, dan riwayat retur produk</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={handlePrint} className="text-xs font-semibold flex items-center gap-1.5 bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
                        <Printer size={15} /> Print
                    </button>
                    <button onClick={handleExportExcel} className="text-xs font-semibold flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl text-emerald-700 hover:bg-emerald-100 shadow-sm transition-all">
                        <FileSpreadsheet size={15} /> Export Excel
                    </button>
                    <button onClick={handleExport} className="text-xs font-semibold flex items-center gap-1.5 bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
                        <Download size={15} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Metric Summary Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Pembelian</p>
                        <h3 className="text-lg font-extrabold text-slate-900 mt-1">{formatIDR(totals.totalPurchases)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{filteredPurchases.length} Transaksi Pembelian</p>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                        <TruckIcon size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Terbayar</p>
                        <h3 className="text-lg font-extrabold text-emerald-600 mt-1">{formatIDR(totals.totalPaid)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Sudah Dilunasi</p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                        <TruckIcon size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sisa Utang Supplier</p>
                        <h3 className="text-lg font-extrabold text-rose-600 mt-1">{formatIDR(totals.totalDebt)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Belum Lunas</p>
                    </div>
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                        <TruckIcon size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Supplier Terpilih</p>
                        <h3 className="text-sm font-extrabold text-amber-700 mt-1 truncate max-w-[140px]">
                            {selectedSupplier?.name || 'Semua Supplier'}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{suppliers.length} Supplier Master Data</p>
                    </div>
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                        <TruckIcon size={22} />
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    {/* Supplier Selector */}
                    <div className="relative min-w-[200px]">
                        <label htmlFor="supplierFilter" className="sr-only">Filter Supplier</label>
                        <select
                            id="supplierFilter"
                            name="supplierFilter"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 font-semibold text-slate-800 outline-none focus:bg-white focus:border-amber-500"
                            value={selectedSupplierId}
                            onChange={e => setSelectedSupplierId(e.target.value)}
                        >
                            <option value="">-- Semua Supplier ({suppliers.length}) --</option>
                            {suppliers.sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Filters */}
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                        <Filter size={14} className="text-slate-400" />
                        <span className="font-semibold text-slate-600">Tanggal:</span>
                        <div className="relative flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1">
                            <span className="font-medium text-slate-700 pr-5">
                                {startDate ? new Date(startDate).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Mulai'}
                            </span>
                            <input
                                id="startDate"
                                name="startDate"
                                type="date"
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                            <Calendar size={13} className="absolute right-2 text-slate-400 pointer-events-none" />
                        </div>
                        <span className="text-slate-400">-</span>
                        <div className="relative flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1">
                            <span className="font-medium text-slate-700 pr-5">
                                {endDate ? new Date(endDate).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Sampai'}
                            </span>
                            <input
                                id="endDate"
                                name="endDate"
                                type="date"
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                            <Calendar size={13} className="absolute right-2 text-slate-400 pointer-events-none" />
                        </div>
                        {(startDate || endDate) && (
                            <button
                                onClick={() => { setStartDate(''); setEndDate(''); }}
                                className="p-1 text-slate-400 hover:text-slate-600 bg-slate-200 rounded-lg ml-1"
                                title="Reset Filter Tanggal"
                            >
                                <RotateCcw size={13} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Search Input */}
                <div className="relative w-full lg:w-80">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        id="searchPurchase"
                        name="searchPurchase"
                        type="text"
                        placeholder="Cari ID, no faktur, supplier, deskripsi..."
                        className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none text-slate-800 text-xs font-medium"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                            title="Hapus pencarian"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Main Purchase Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-xs text-slate-700 uppercase tracking-wider">Daftar Pembelian Supplier ({filteredPurchases.length})</h3>
                    {selectedSupplier && (
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                            Supplier: {selectedSupplier.name}
                        </span>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100">
                            <tr>
                                <th className="p-3.5">Waktu Pembelian</th>
                                <th className="p-3.5">No. Faktur / ID</th>
                                <th className="p-3.5">Supplier</th>
                                <th className="p-3.5">Keterangan Barang</th>
                                <th className="p-3.5">Total Belanja</th>
                                <th className="p-3.5">Jumlah Terbayar</th>
                                <th className="p-3.5">Sisa Utang</th>
                                <th className="p-3.5">Status Pembayaran</th>
                                <th className="p-3.5">Metode</th>
                                <th className="p-3.5 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredPurchases.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="p-12 text-center text-slate-400 italic">Tidak ada riwayat pembelian supplier ditemukan.</td>
                                </tr>
                            )}
                            {visiblePurchases.map(p => (
                                <tr key={p.id} onClick={() => setDetailPurchase(p)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                                    <td className="p-3.5 whitespace-nowrap text-slate-700">
                                        <div className="font-semibold">{new Date(p.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                        <div className="text-[10px] text-slate-400">{new Date(p.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
                                    </td>
                                    <td className="p-3.5 whitespace-nowrap">
                                        <div className="font-mono font-bold text-slate-900">{p.invoiceNumber || `#${p.id.substring(0, 8)}`}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">#{p.id.substring(0, 8)}</div>
                                    </td>
                                    <td className="p-3.5 font-bold text-slate-800 whitespace-nowrap">{p.supplierName}</td>
                                    <td className="p-3.5 text-slate-600 max-w-[200px] truncate">{p.description}</td>
                                    <td className="p-3.5 font-extrabold text-slate-900 whitespace-nowrap">{formatIDR(p.totalAmount)}</td>
                                    <td className="p-3.5 font-bold text-emerald-600 whitespace-nowrap">{formatIDR(p.amountPaid)}</td>
                                    <td className="p-3.5 font-bold text-rose-600 whitespace-nowrap">{formatIDR(p.totalAmount - p.amountPaid)}</td>
                                    <td className="p-3.5 whitespace-nowrap">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${p.type === PurchaseType.RETURN
                                            ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                            : p.paymentStatus === PaymentStatus.PAID
                                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                : p.paymentStatus === PaymentStatus.PARTIAL
                                                    ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                                    : 'bg-rose-100 text-rose-700 border border-rose-200'
                                            }`}>
                                            {p.type === PurchaseType.RETURN
                                                ? 'RETUR SUPPLIER'
                                                : (p.paymentStatus === 'BELUM_LUNAS' ? 'BELUM LUNAS' : p.paymentStatus) + (p.isReturned ? ' (RETUR)' : '')}
                                        </span>
                                    </td>
                                    <td className="p-3.5 font-semibold text-slate-600 uppercase whitespace-nowrap">{p.paymentMethod}</td>
                                    <td className="p-3.5 text-center whitespace-nowrap">
                                        <button onClick={(e) => { e.stopPropagation(); setDetailPurchase(p); }} className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 mx-auto" title="Detail">
                                            <Eye size={13} /> Detail
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {visiblePurchases.length < filteredPurchases.length && (
                                <tr>
                                    <td colSpan={10} className="p-4 text-center text-slate-400 text-xs">
                                        <div ref={loadMoreRef}>Memuat lebih banyak pembelian...</div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Purchase Modal */}
            {detailPurchase && createPortal(
                <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in border border-slate-100">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                                <TruckIcon size={16} className="text-amber-600" />
                                Detail Pembelian Supplier {detailPurchase.invoiceNumber ? `(${detailPurchase.invoiceNumber})` : `#${detailPurchase.id.substring(0, 8)}`}
                            </h3>
                            <button onClick={() => setDetailPurchase(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Waktu Pembelian</span>
                                    <span className="font-bold text-slate-800">{formatDate(detailPurchase.date)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Supplier</span>
                                    <span className="font-bold text-slate-800">{detailPurchase.supplierName}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Metode Pembayaran</span>
                                    <span className="font-bold text-slate-800">{detailPurchase.paymentMethod}</span>
                                    {(() => {
                                        if (detailPurchase.bankId) {
                                            const bank = banks.find(b => b.id === detailPurchase.bankId);
                                            if (bank) return <span className="block text-[11px] text-amber-700 font-semibold">via {bank.bankName} {bank.accountNumber}</span>;
                                        }
                                        if (detailPurchase.bankName) return <span className="block text-[11px] text-amber-700 font-semibold">via {detailPurchase.bankName}</span>;
                                        return null;
                                    })()}
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Status Pembayaran</span>
                                    <span className={`font-extrabold ${detailPurchase.paymentStatus === 'LUNAS' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {detailPurchase.paymentStatus === 'BELUM_LUNAS' ? 'BELUM LUNAS' : detailPurchase.paymentStatus}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold text-slate-800 mb-1.5">Keterangan Barang</h4>
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
                                    {detailPurchase.description}
                                </div>
                            </div>

                            {detailPurchase.items && detailPurchase.items.length > 0 ? (
                                <div>
                                    <h4 className="font-bold text-slate-800 mb-1.5">Rincian Barang Stok</h4>
                                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                                        {detailPurchase.items.map((item, i) => (
                                            <div key={i} className="flex justify-between p-3 text-xs">
                                                <div>
                                                    <span className="block font-bold text-slate-800">{item.name}</span>
                                                    <span className="text-[10px] text-slate-500">{item.qty} {item.unit || 'Pcs'} x {formatIDR(item.finalPrice)}</span>
                                                </div>
                                                <span className="font-bold text-slate-900">{formatIDR(item.finalPrice * item.qty)}</span>
                                            </div>
                                        ))}
                                        <div className="bg-slate-50 p-3 flex justify-between font-extrabold text-slate-900">
                                            <span>Total Pembelian</span>
                                            <span>{formatIDR(detailPurchase.totalAmount)}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex justify-between font-extrabold text-slate-900 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                    <span>Total Pembelian</span>
                                    <span>{formatIDR(detailPurchase.totalAmount)}</span>
                                </div>
                            )}

                            {/* Return History */}
                            {purchases.filter(p => p.type === PurchaseType.RETURN && (p.originalPurchaseId === detailPurchase.id || p.description.includes(detailPurchase.id))).length > 0 && (
                                <div>
                                    <h4 className="font-bold text-slate-800 mb-1.5">Riwayat Retur ke Supplier</h4>
                                    <div className="bg-amber-50/60 rounded-xl p-3 space-y-2 border border-amber-200">
                                        {purchases
                                            .filter(p => p.type === PurchaseType.RETURN && (p.originalPurchaseId === detailPurchase.id || p.description.includes(detailPurchase.id)))
                                            .map((ret, i) => (
                                                <div key={i} className="flex justify-between border-b border-amber-200/60 last:border-0 pb-2">
                                                    <div>
                                                        <div className="flex gap-1 text-[10px] text-slate-500 font-semibold">
                                                            <span>{new Date(ret.date).toLocaleDateString('id-ID')}</span>
                                                        </div>
                                                        <span className="text-slate-800 font-bold">Retur #{ret.id.substring(0, 6)}</span>
                                                        <div className="text-[11px] text-slate-600 italic mt-0.5">{ret.description}</div>
                                                    </div>
                                                    <span className="font-extrabold text-rose-600">{formatIDR(ret.totalAmount)}</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* Payment History */}
                            <div>
                                <h4 className="font-bold text-slate-800 mb-1.5">Riwayat Pelunasan Pembayaran</h4>
                                <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-200">
                                    {detailPurchase.paymentHistory?.map((ph, i) => (
                                        <div key={i} className="flex justify-between border-b border-slate-200 last:border-0 pb-1.5">
                                            <div>
                                                <div className="flex gap-1 text-[10px] text-slate-500">
                                                    <span>{new Date(ph.date).toLocaleDateString('id-ID')}</span>
                                                    <span className="font-mono text-[9px] bg-slate-200 px-1 rounded">{new Date(ph.date).toLocaleTimeString('id-ID')}</span>
                                                </div>
                                                <span className="text-slate-800 font-medium">{ph.note || 'Pembayaran'} ({ph.method})</span>
                                            </div>
                                            <span className="font-bold text-emerald-600">{formatIDR(ph.amount)}</span>
                                        </div>
                                    ))}
                                    {!detailPurchase.paymentHistory && (
                                        <div className="flex justify-between">
                                            <span className="font-medium text-slate-600">Pembayaran Awal</span>
                                            <span className="font-bold text-emerald-600">{formatIDR(detailPurchase.amountPaid)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between pt-2 font-bold border-t border-slate-200 text-slate-900">
                                        <span>Total Terbayar</span>
                                        <span className="text-emerald-600">{formatIDR(detailPurchase.amountPaid)}</span>
                                    </div>
                                    <div className="flex justify-between text-rose-600 font-extrabold">
                                        <span>Sisa Utang</span>
                                        <span>{formatIDR(detailPurchase.totalAmount - detailPurchase.amountPaid)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                            <button onClick={() => printPurchaseDetail(detailPurchase)} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 shadow-sm">
                                <Printer size={15} /> Cetak Detail
                            </button>
                            <button onClick={() => setDetailPurchase(null)} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold">Tutup</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
