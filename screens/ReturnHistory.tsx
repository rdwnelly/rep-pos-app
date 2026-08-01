import React, { useState, useEffect, useMemo } from 'react';
import { ApiService } from '../services/api';
import { Transaction, Purchase, User, TransactionType, PurchaseType } from '../types';
import { Loading } from '../components/Loading';
import { Undo2, Search, Calendar, Package, ShoppingCart, Printer, FileSpreadsheet, Download, Filter, RotateCcw, X, Eye, FileText, ArrowRightLeft, DollarSign, Tag } from 'lucide-react';
import { formatIDR, formatDate, exportToCSV, exportToExcel } from '../utils';

interface ReturnHistoryProps {
    currentUser: User;
}

export const ReturnHistory: React.FC<ReturnHistoryProps> = ({ currentUser }) => {
    const [activeTab, setActiveTab] = useState<'sales' | 'purchases'>('sales');
    const [salesReturns, setSalesReturns] = useState<Transaction[]>([]);
    const [purchaseReturns, setPurchaseReturns] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Detail Modal State
    const [selectedReturnItem, setSelectedReturnItem] = useState<Transaction | Purchase | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [transactions, purchases] = await Promise.all([
                ApiService.getTransactions(),
                ApiService.getPurchases()
            ]);

            setSalesReturns(transactions.filter(t => t.type === TransactionType.RETURN || t.isReturned || Boolean(t.returnNote && t.returnNote.trim())));
            setPurchaseReturns(purchases.filter(p => p.type === PurchaseType.RETURN || (p as any).isReturned || Boolean(p.returnNote && p.returnNote.trim())));
        } catch (error) {
            console.error("Error fetching return history:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredSales = useMemo(() => {
        return salesReturns.filter(item => {
            const matchesSearch = item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
                item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.returnNote || item.paymentNote || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.items || []).some((i: any) => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

            const itemDate = new Date(item.date).toISOString().split('T')[0];
            if (startDate && itemDate < startDate) return false;
            if (endDate && itemDate > endDate) return false;

            return matchesSearch;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [salesReturns, searchTerm, startDate, endDate]);

    const filteredPurchases = useMemo(() => {
        return purchaseReturns.filter(item => {
            const matchesSearch = item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
                item.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.returnNote || (item as any).paymentNote || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.items || []).some((i: any) => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

            const itemDate = new Date(item.date).toISOString().split('T')[0];
            if (startDate && itemDate < startDate) return false;
            if (endDate && itemDate > endDate) return false;

            return matchesSearch;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [purchaseReturns, searchTerm, startDate, endDate]);

    // Summary Statistics
    const summaryStats = useMemo(() => {
        const totalSalesAmount = filteredSales.reduce((acc, item) => acc + Math.abs(item.totalAmount), 0);
        const totalSalesQty = filteredSales.reduce((acc, item) => acc + (item.items || []).reduce((sum: number, i: any) => sum + (i.qty || 0), 0), 0);

        const totalPurchaseAmount = filteredPurchases.reduce((acc, item) => acc + Math.abs(item.totalAmount), 0);
        const totalPurchaseQty = filteredPurchases.reduce((acc, item) => acc + (item.items || []).reduce((sum: number, i: any) => sum + (i.qty || 0), 0), 0);

        return {
            salesCount: filteredSales.length,
            totalSalesAmount,
            totalSalesQty,
            purchaseCount: filteredPurchases.length,
            totalPurchaseAmount,
            totalPurchaseQty
        };
    }, [filteredSales, filteredPurchases]);

    const handleExport = () => {
        const isSales = activeTab === 'sales';
        const items = isSales ? filteredSales : filteredPurchases;
        const headers = ['Tanggal', 'ID', 'No Faktur', isSales ? 'Pelanggan' : 'Supplier', 'Barang Diretur', 'Catatan', 'Nilai Retur'];

        const rows = items.map((item: any) => [
            formatDate(item.date),
            item.id,
            item.invoiceNumber || '-',
            isSales ? item.customerName : item.supplierName,
            item.items.map((i: any) => `${i.name} (${i.qty})`).join('; '),
            item.returnNote || item.paymentNote || '-',
            Math.abs(item.totalAmount)
        ]);

        exportToCSV(`riwayat-retur-${activeTab}.csv`, headers, rows);
    };

    const handleExportExcel = () => {
        const isSales = activeTab === 'sales';
        const items = isSales ? filteredSales : filteredPurchases;

        const data = items.map((item: any) => ({
            'Tanggal': formatDate(item.date),
            'ID': item.id,
            'No Faktur': item.invoiceNumber || '-',
            [isSales ? 'Pelanggan' : 'Supplier']: isSales ? item.customerName : item.supplierName,
            'Barang Diretur': item.items.map((i: any) => `${i.name} (${i.qty})`).join('; '),
            'Catatan': item.returnNote || item.paymentNote || '-',
            'Nilai Retur': Math.abs(item.totalAmount)
        }));

        const cols = [
            { wch: 20 },
            { wch: 15 },
            { wch: 20 },
            { wch: 20 },
            { wch: 40 },
            { wch: 30 },
            { wch: 15 }
        ];

        exportToExcel(data, `Riwayat_Retur_${activeTab}`, `Retur ${isSales ? 'Penjualan' : 'Pembelian'}`, cols);
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const isSales = activeTab === 'sales';
        const items = isSales ? filteredSales : filteredPurchases;

        const rows = items.map((item: any, idx: number) => `
            <tr>
                <td style="text-align:center">${idx + 1}</td>
                <td>${formatDate(item.date)}</td>
                <td>#${item.id.substring(0, 8)}</td>
                <td><strong>${item.invoiceNumber || '-'}</strong></td>
                <td>${isSales ? item.customerName : item.supplierName}</td>
                <td>
                    <ul style="margin: 0; padding-left: 15px;">
                        ${item.items.map((i: any) => `<li>${i.name} x${i.qty}</li>`).join('')}
                    </ul>
                </td>
                <td>${item.returnNote || item.paymentNote || '-'}</td>
                <td style="text-align:right; font-weight:bold; color:#dc2626">${formatIDR(Math.abs(item.totalAmount))}</td>
            </tr>
        `).join('');

        const html = `
            <html>
                <head>
                    <title>Laporan Riwayat Retur ${isSales ? 'Penjualan' : 'Pembelian'}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; color: #333; }
                        h2 { text-align: center; margin-bottom: 5px; }
                        p.subtitle { text-align: center; color: #666; font-size: 11px; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
                        th { background-color: #f1f5f9; font-weight: bold; text-align: center; }
                    </style>
                </head>
                <body>
                    <h2>Laporan Riwayat Retur ${isSales ? 'Penjualan' : 'Pembelian'}</h2>
                    <p class="subtitle">Dicetak pada: ${new Date().toLocaleString('id-ID')} | Periode: ${startDate ? formatDate(startDate) : 'Semua'} - ${endDate ? formatDate(endDate) : 'Semua'}</p>
                    <table>
                        <thead>
                            <tr>
                                <th style="width:30px">No</th>
                                <th>Tanggal</th>
                                <th>ID</th>
                                <th>No Faktur</th>
                                <th>${isSales ? 'Pelanggan' : 'Supplier'}</th>
                                <th>Barang Diretur</th>
                                <th>Catatan</th>
                                <th>Nilai Retur</th>
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

    if (loading) return <Loading />;

    return (
        <div className="space-y-6 animate-fade-in p-2 md:p-0">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Undo2 className="text-amber-600" />
                        Riwayat Retur Transaksi
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Lacak dan pantau pengembalian barang retur penjualan maupun pembelian stok</p>
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
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Retur Penjualan</p>
                        <h3 className="text-lg font-extrabold text-rose-600 mt-1">{formatIDR(summaryStats.totalSalesAmount)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{summaryStats.salesCount} Transaksi ({summaryStats.totalSalesQty} unit)</p>
                    </div>
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                        <ShoppingCart size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Retur Pembelian Stok</p>
                        <h3 className="text-lg font-extrabold text-amber-600 mt-1">{formatIDR(summaryStats.totalPurchaseAmount)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{summaryStats.purchaseCount} Pembelian ({summaryStats.totalPurchaseQty} unit)</p>
                    </div>
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                        <Package size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Item Diretur</p>
                        <h3 className="text-lg font-extrabold text-slate-900 mt-1">{summaryStats.totalSalesQty + summaryStats.totalPurchaseQty} <span className="text-xs font-normal text-slate-400">unit</span></h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Penjualan + Pembelian</p>
                    </div>
                    <div className="p-3 bg-slate-100 text-slate-700 rounded-xl shrink-0">
                        <Tag size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Nilai Retur</p>
                        <h3 className="text-lg font-extrabold text-rose-700 mt-1">{formatIDR(summaryStats.totalSalesAmount + summaryStats.totalPurchaseAmount)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Akumulasi Seluruh Retur</p>
                    </div>
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                        <DollarSign size={22} />
                    </div>
                </div>
            </div>

            {/* Navigation Tabs & Filter Bar Card */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-3">
                    {/* Tab Navigation */}
                    <div className="flex gap-2 py-1 px-1 bg-slate-100/80 rounded-xl">
                        <button
                            onClick={() => setActiveTab('sales')}
                            className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-lg transition-all ${
                                activeTab === 'sales'
                                    ? 'bg-amber-600 text-white shadow-md'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                        >
                            <ShoppingCart size={15} />
                            Retur Penjualan ({filteredSales.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('purchases')}
                            className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-lg transition-all ${
                                activeTab === 'purchases'
                                    ? 'bg-amber-600 text-white shadow-md'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                        >
                            <Package size={15} />
                            Retur Pembelian Stok ({filteredPurchases.length})
                        </button>
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
                </div>

                {/* Search Bar */}
                <div className="relative w-full">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        id="searchReturn"
                        name="searchReturn"
                        type="text"
                        placeholder={activeTab === 'sales' ? "Cari berdasarkan ID retur, no faktur, nama pelanggan, nama barang, atau catatan retur..." : "Cari berdasarkan ID retur, no faktur, nama supplier, nama barang, atau catatan..."}
                        className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all text-xs text-slate-800"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Return Items Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700 text-xs flex justify-between items-center">
                    <span>Daftar {activeTab === 'sales' ? 'Retur Penjualan' : 'Retur Pembelian'}</span>
                    <span className="text-amber-700 font-bold">Total Nilai: {formatIDR(activeTab === 'sales' ? summaryStats.totalSalesAmount : summaryStats.totalPurchaseAmount)}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-semibold">
                            <tr>
                                <th className="p-3.5">Tanggal & Ref</th>
                                <th className="p-3.5">No Faktur</th>
                                <th className="p-3.5">Tipe Retur</th>
                                <th className="p-3.5">
                                    {activeTab === 'sales' ? 'Pelanggan' : 'Supplier'}
                                </th>
                                <th className="p-3.5">Detail Barang Diretur</th>
                                <th className="p-3.5">Catatan Retur</th>
                                <th className="p-3.5 text-right">Nilai Retur</th>
                                <th className="p-3.5 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(activeTab === 'sales' ? filteredSales : filteredPurchases).length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-slate-400">
                                        Tidak ada data riwayat retur yang ditemukan.
                                    </td>
                                </tr>
                            ) : (
                                (activeTab === 'sales' ? filteredSales : filteredPurchases).map((item: any) => {
                                    const isFullReturn = item.type === TransactionType.RETURN || item.type === PurchaseType.RETURN;
                                    return (
                                        <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="p-3.5 whitespace-nowrap">
                                                <div className="font-semibold text-slate-800">{formatDate(item.date)}</div>
                                                <div className="text-[10px] font-mono text-slate-400">#{item.id.substring(0, 8)}</div>
                                                {item.originalTransactionId && (
                                                    <div className="text-[10px] text-amber-700 font-semibold mt-0.5">Ref Transaksi: #{item.originalTransactionId.substring(0, 8)}</div>
                                                )}
                                                {item.originalPurchaseId && (
                                                    <div className="text-[10px] text-amber-700 font-semibold mt-0.5">Ref Pembelian: #{item.originalPurchaseId.substring(0, 8)}</div>
                                                )}
                                            </td>
                                            <td className="p-3.5 whitespace-nowrap font-mono text-xs font-bold text-slate-800">
                                                {item.invoiceNumber || '-'}
                                            </td>
                                            <td className="p-3.5 whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                                                    isFullReturn 
                                                        ? 'bg-purple-50 text-purple-700 border-purple-200' 
                                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                                }`}>
                                                    {isFullReturn ? 'RETUR TOTAL' : 'RETUR SEBAGIAN'}
                                                </span>
                                            </td>
                                            <td className="p-3.5 whitespace-nowrap font-semibold text-slate-800">
                                                {activeTab === 'sales' ? item.customerName : item.supplierName}
                                            </td>
                                            <td className="p-3.5 text-slate-700">
                                                {item.items && item.items.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {item.items.map((i: any, idx: number) => (
                                                            <div key={idx} className="flex items-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                                                                <span className="font-medium text-slate-800">{i.name}</span>
                                                                <span className="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.2 rounded text-[10px]">x{i.qty}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="italic text-slate-400">Detail barang tidak tersedia</span>
                                                )}
                                            </td>
                                            <td className="p-3.5 text-slate-600 italic max-w-xs truncate" title={item.returnNote || item.paymentNote}>
                                                {item.returnNote || item.paymentNote || '-'}
                                            </td>
                                            <td className="p-3.5 whitespace-nowrap font-extrabold text-right text-rose-600 text-sm">
                                                {formatIDR(Math.abs(item.totalAmount))}
                                            </td>
                                            <td className="p-3.5 text-center whitespace-nowrap">
                                                <button
                                                    onClick={() => setSelectedReturnItem(item)}
                                                    className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg font-semibold transition-colors inline-flex items-center gap-1 text-[11px]"
                                                >
                                                    <Eye size={12} /> Detail
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Return Modal */}
            {selectedReturnItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-up">
                        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Undo2 className="text-amber-400" size={18} />
                                <h3 className="font-bold text-sm">Detail Retur {activeTab === 'sales' ? 'Penjualan' : 'Pembelian'}</h3>
                            </div>
                            <button
                                onClick={() => setSelectedReturnItem(null)}
                                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                <div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">ID Retur</span>
                                    <span className="font-mono font-bold text-slate-800">#{selectedReturnItem.id}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">No Faktur</span>
                                    <span className="font-mono font-bold text-amber-700">{(selectedReturnItem as any).invoiceNumber || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Tanggal</span>
                                    <span className="font-medium text-slate-800">{formatDate(selectedReturnItem.date)}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">{activeTab === 'sales' ? 'Pelanggan' : 'Supplier'}</span>
                                    <span className="font-bold text-slate-800">{(selectedReturnItem as any).customerName || (selectedReturnItem as any).supplierName || '-'}</span>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2">Daftar Barang Diretur</h4>
                                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                                    {(selectedReturnItem.items || []).map((i: any, idx: number) => (
                                        <div key={idx} className="p-3 flex justify-between items-center hover:bg-slate-50">
                                            <div>
                                                <div className="font-bold text-slate-800">{i.name}</div>
                                                <div className="text-[10px] text-slate-400">{formatIDR(i.price || 0)} per unit</div>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-bold text-slate-900">x{i.qty}</span>
                                                <div className="text-xs font-bold text-rose-600">{formatIDR((i.price || 0) * (i.qty || 1))}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {(selectedReturnItem as any).returnNote || (selectedReturnItem as any).paymentNote ? (
                                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                                    <span className="text-[10px] font-bold uppercase text-amber-800 block mb-0.5">Catatan Retur</span>
                                    <p className="text-slate-700 italic">{(selectedReturnItem as any).returnNote || (selectedReturnItem as any).paymentNote}</p>
                                </div>
                            ) : null}

                            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                                <span className="font-bold text-slate-700 text-sm">Total Nilai Retur</span>
                                <span className="text-lg font-extrabold text-rose-600">{formatIDR(Math.abs(selectedReturnItem.totalAmount))}</span>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setSelectedReturnItem(null)}
                                className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-colors text-xs"
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
