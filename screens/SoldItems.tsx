import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { TransactionType, UserRole, User } from '../types';
import { formatIDR, exportToCSV, exportToExcel } from '../utils';
import { Download, Search, Filter, RotateCcw, X, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, ShoppingBag, Printer, Calendar, Trash2, Folder, Layers } from 'lucide-react';

interface SoldItemsProps {
    currentUser: User | null;
}

export const SoldItems: React.FC<SoldItemsProps> = ({ currentUser }) => {
    const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];

    // Filter State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [groupByCategory, setGroupByCategory] = useState<boolean>(true);

    // Sort State
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    // Pagination State
    const [visibleCount, setVisibleCount] = useState(50);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    // Reset pagination on filter change
    useEffect(() => {
        setVisibleCount(50);
    }, [startDate, endDate, searchQuery, selectedCategory, sortConfig]);

    // Helper for Jakarta Date
    const getJakartaDateStr = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    };

    // Filter Logic
    const filteredTransactions = useMemo(() => {
        let items = transactions;

        if (startDate || endDate) {
            items = items.filter(item => {
                const itemDateStr = getJakartaDateStr(item.date);
                if (startDate && itemDateStr < startDate) return false;
                if (endDate && itemDateStr > endDate) return false;
                return true;
            });
        }

        return items;
    }, [transactions, startDate, endDate]);

    const soldItems = useMemo(() => {
        let items = filteredTransactions
            .flatMap(t => t.items.map(item => ({
                ...item,
                transactionId: t.id,
                transactionType: t.type,
                date: t.date,
                cashierName: t.cashierName,
                customerName: t.customerName,
                isReturned: t.isReturned,
                transactionInvoiceNumber: t.invoiceNumber
            })))
            .filter(item => {
                if (!searchQuery) return true;
                const query = searchQuery.toLowerCase();
                return (
                    item.name.toLowerCase().includes(query) ||
                    item.transactionId.toLowerCase().includes(query) ||
                    (item.transactionInvoiceNumber && item.transactionInvoiceNumber.toLowerCase().includes(query)) ||
                    item.cashierName.toLowerCase().includes(query) ||
                    (item.categoryName && item.categoryName.toLowerCase().includes(query))
                );
            });

        // Sorting
        if (sortConfig) {
            items.sort((a, b) => {
                if (sortConfig.key === 'date') {
                    const aTime = new Date(a.date).getTime();
                    const bTime = new Date(b.date).getTime();
                    return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime;
                }

                let aVal = a[sortConfig.key as keyof typeof a];
                let bVal = b[sortConfig.key as keyof typeof b];

                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    aVal = aVal.toLowerCase() as any;
                    bVal = bVal.toLowerCase() as any;
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return items;
    }, [filteredTransactions, searchQuery, sortConfig]);

    // Distinct Available Categories
    const availableCategories = useMemo(() => {
        const set = new Set<string>();
        soldItems.forEach(item => {
            const cat = item.categoryName && item.categoryName.trim() ? item.categoryName.trim() : 'Tanpa Kategori';
            set.add(cat);
        });
        return Array.from(set).sort();
    }, [soldItems]);

    // Category Summaries Calculation
    const categorySummaries = useMemo(() => {
        const summaries: { [cat: string]: { totalQty: number; totalRevenue: number; count: number } } = {};
        soldItems.forEach(item => {
            const cat = item.categoryName && item.categoryName.trim() ? item.categoryName.trim() : 'Tanpa Kategori';
            if (!summaries[cat]) {
                summaries[cat] = { totalQty: 0, totalRevenue: 0, count: 0 };
            }
            const qtyVal = item.transactionType === TransactionType.RETURN ? -item.qty : item.qty;
            const revVal = item.transactionType === TransactionType.RETURN ? -(item.finalPrice * item.qty) : (item.finalPrice * item.qty);
            summaries[cat].totalQty += qtyVal;
            summaries[cat].totalRevenue += revVal;
            summaries[cat].count += 1;
        });
        return summaries;
    }, [soldItems]);

    // Grouped Sold Items by Category
    const groupedSoldItems = useMemo(() => {
        let filtered = soldItems;
        if (selectedCategory !== 'ALL') {
            filtered = filtered.filter(item => {
                const cat = item.categoryName && item.categoryName.trim() ? item.categoryName.trim() : 'Tanpa Kategori';
                return cat === selectedCategory;
            });
        }

        const groups: { [catName: string]: typeof soldItems } = {};
        filtered.forEach(item => {
            const cat = item.categoryName && item.categoryName.trim() ? item.categoryName.trim() : 'Tanpa Kategori';
            if (!groups[cat]) {
                groups[cat] = [];
            }
            groups[cat].push(item);
        });
        return groups;
    }, [soldItems, selectedCategory]);

    const visibleSoldItems = useMemo(() => soldItems.slice(0, visibleCount), [soldItems, visibleCount]);

    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => prev + 30);
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
    }, [loadMoreRef.current, soldItems]);

    const handleDeleteTransaction = async (transactionId: string) => {
        if (!confirm('Yakin ingin menghapus transaksi ini? Seluruh item dalam transaksi ini akan ikut terhapus. Aksi ini tidak dapat dibatalkan.')) return;
        try {
            await StorageService.deleteTransaction(transactionId);
            window.dispatchEvent(new Event('transactions_updated'));
            window.dispatchEvent(new Event('products_updated'));
            alert('Transaksi berhasil dihapus.');
        } catch (error) {
            console.error("Failed to delete transaction:", error);
            alert("Gagal menghapus transaksi.");
        }
    };

    const handleSort = (key: string) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig.key !== column) return <ArrowUpDown size={14} className="ml-1 text-slate-400" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={14} className="ml-1 text-primary" />
            : <ArrowDown size={14} className="ml-1 text-primary" />;
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const showHPP = currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER;

        let contentHtml = '';

        if (groupByCategory) {
            contentHtml = Object.entries(groupedSoldItems).map(([catName, items]) => {
                const subTotalQty = items.reduce((s, i) => s + (i.transactionType === TransactionType.RETURN ? -i.qty : i.qty), 0);
                const subTotalRev = items.reduce((s, i) => s + (i.transactionType === TransactionType.RETURN ? -(i.finalPrice * i.qty) : (i.finalPrice * i.qty)), 0);

                const itemRows = items.map((i, idx) => `
                    <tr>
                        <td>${idx + 1}</td>
                        <td>${new Date(i.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${new Date(i.date).toLocaleTimeString('id-ID')}</td>
                        <td>${i.transactionInvoiceNumber || i.transactionId.substring(0, 6)}</td>
                        <td>${i.name}</td>
                        <td style="text-align:center">${i.unit || 'Pcs'}</td>
                        <td style="text-align:center">${i.qty}</td>
                        ${showHPP ? `<td style="text-align:right">${formatIDR(i.hpp || 0)}</td>` : ''}
                        <td style="text-align:right">${formatIDR(i.finalPrice)}</td>
                        <td>${i.customerName}</td>
                        <td>${i.cashierName}</td>
                        <td>${i.transactionType === TransactionType.RETURN ? 'RETUR' : i.isReturned ? 'Retur Sebagian' : 'Normal'}</td>
                    </tr>
                `).join('');

                return `
                    <div style="margin-bottom: 20px;">
                        <h3 style="background-color: #f8fafc; padding: 8px 12px; margin: 10px 0 5px 0; border: 1px solid #cbd5e1; font-size: 13px; color: #1e293b;">
                            📁 Kategori: <strong>${catName}</strong> (${items.length} transaksi item)
                        </h3>
                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 35px;">No</th>
                                    <th>Tanggal</th>
                                    <th>Faktur</th>
                                    <th>Item</th>
                                    <th>Satuan</th>
                                    <th>Qty</th>
                                    ${showHPP ? '<th>HPP</th>' : ''}
                                    <th>Harga Jual</th>
                                    <th>Pembeli</th>
                                    <th>Kasir</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemRows}
                            </tbody>
                            <tfoot>
                                <tr style="background-color: #f1f5f9; font-weight: bold;">
                                    <td colSpan="5" style="text-align:right;">Subtotal ${catName}:</td>
                                    <td style="text-align:center;">${subTotalQty}</td>
                                    ${showHPP ? '<td></td>' : ''}
                                    <td style="text-align:right;">${formatIDR(subTotalRev)}</td>
                                    <td colSpan="3"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                `;
            }).join('');
        } else {
            const rows = soldItems.map((i, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${new Date(i.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${new Date(i.date).toLocaleTimeString('id-ID')}</td>
                    <td>${i.transactionInvoiceNumber || i.transactionId.substring(0, 6)}</td>
                    <td>${i.name}</td>
                    <td style="text-align:center">${i.unit || 'Pcs'}</td>
                    <td style="text-align:center">${i.qty}</td>
                    ${showHPP ? `<td style="text-align:right">${formatIDR(i.hpp || 0)}</td>` : ''}
                    <td style="text-align:right">${formatIDR(i.finalPrice)}</td>
                    <td>${i.categoryName || '-'}</td>
                    <td>${i.customerName}</td>
                    <td>${i.cashierName}</td>
                    <td>${i.transactionType === TransactionType.RETURN ? 'RETUR' : i.isReturned ? 'Retur Sebagian' : 'Normal'}</td>
                </tr>
            `).join('');

            contentHtml = `
                <table>
                    <thead>
                        <tr>
                            <th style="width: 35px;">No</th>
                            <th>Tanggal</th>
                            <th>Faktur</th>
                            <th>Item</th>
                            <th>Satuan</th>
                            <th>Qty</th>
                            ${showHPP ? '<th>HPP</th>' : ''}
                            <th>Harga Jual</th>
                            <th>Kategori Produk</th>
                            <th>Pembeli</th>
                            <th>Kasir</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
        }

        const html = `
            <html>
                <head>
                    <title>Laporan Barang Terjual Per Kategori</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; color: #333; }
                        h2 { text-align: center; margin-bottom: 5px; }
                        p.subtitle { text-align: center; color: #666; margin-bottom: 20px; font-size: 11px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
                        th { background-color: #f1f5f9; font-weight: bold; text-align: center; font-size: 11px; }
                    </style>
                </head>
                <body>
                    <h2>Laporan Barang Terjual Per Kategori</h2>
                    <p class="subtitle">Periode: ${startDate ? new Date(startDate).toLocaleDateString('id-ID') : 'Semua'} - ${endDate ? new Date(endDate).toLocaleDateString('id-ID') : 'Semua'}</p>
                    ${contentHtml}
                    <script>window.print();</script>
                </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handleExport = () => {
        const showHPP = currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN;
        let headers = ['Kategori Produk', 'ID Transaksi', 'No Faktur', 'Tanggal', 'Waktu', 'Item', 'Satuan', 'Qty', 'Harga Jual', 'Pembeli', 'Kasir', 'Status'];
        if (showHPP) {
            headers.splice(8, 0, 'HPP');
        }

        const rows = soldItems.map(i => {
            const d = new Date(i.date);
            const row = [
                i.categoryName || 'Tanpa Kategori',
                i.transactionId,
                i.transactionInvoiceNumber || '-',
                d.toLocaleDateString('id-ID'),
                d.toLocaleTimeString('id-ID'),
                i.name,
                i.unit || 'Pcs',
                i.qty,
                i.finalPrice,
                i.customerName,
                i.cashierName,
                i.transactionType === TransactionType.RETURN ? 'RETUR' : i.isReturned ? 'Retur Sebagian' : 'Normal'
            ];
            if (showHPP) {
                row.splice(8, 0, i.hpp || 0);
            }
            return row;
        });
        exportToCSV('laporan-barang-terjual.csv', headers, rows);
    };

    const handleExportExcel = () => {
        const showHPP = currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN;
        const data = soldItems.map(i => {
            const d = new Date(i.date);
            const item: any = {
                'Kategori Produk': i.categoryName || 'Tanpa Kategori',
                'ID Transaksi': i.transactionId,
                'No Faktur': i.transactionInvoiceNumber || '-',
                'Tanggal': d.toLocaleDateString('id-ID'),
                'Waktu': d.toLocaleTimeString('id-ID'),
                'Item': i.name,
                'Satuan': i.unit || 'Pcs',
                'Qty': i.qty,
                'Harga Jual': i.finalPrice,
                'Pembeli': i.customerName,
                'Kasir': i.cashierName,
                'Status': i.transactionType === TransactionType.RETURN ? 'RETUR' : i.isReturned ? 'Retur Sebagian' : 'Normal'
            };
            if (showHPP) {
                item['HPP'] = i.hpp || 0;
            }
            return item;
        });

        const cols = [
            { wch: 20 }, // Kategori
            { wch: 15 }, // ID
            { wch: 20 }, // Faktur
            { wch: 12 }, // Tanggal
            { wch: 10 }, // Waktu
            { wch: 30 }, // Item
            { wch: 10 }, // Satuan
            { wch: 8 },  // Qty
            ...(showHPP ? [{ wch: 15 }] : []), // HPP
            { wch: 15 }, // Harga Jual
            { wch: 20 }, // Pembeli
            { wch: 15 }, // Kasir
            { wch: 15 }  // Status
        ];

        exportToExcel(data, "Laporan_Barang_Terjual_Per_Kategori", "Barang Terjual", cols);
    };

    const totalGlobalQty = soldItems.reduce((s, i) => s + (i.transactionType === TransactionType.RETURN ? -i.qty : i.qty), 0);
    const totalGlobalRevenue = soldItems.reduce((s, i) => s + (i.transactionType === TransactionType.RETURN ? -(i.finalPrice * i.qty) : (i.finalPrice * i.qty)), 0);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
                <div className="flex flex-wrap justify-between items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <ShoppingBag className="text-primary" />
                            Laporan Barang Terjual Per Kategori
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">Laporan detail penjualan barang yang dikelompokkan berdasarkan kategori produk</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="text-sm flex items-center gap-2 bg-white border border-slate-300 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
                            <Printer size={16} /> Print
                        </button>
                        <button onClick={handleExportExcel} className="text-sm flex items-center gap-2 bg-green-50 border border-green-200 px-3 py-2 rounded-lg text-green-700 hover:bg-green-100 shadow-sm transition-colors">
                            <FileSpreadsheet size={16} /> Excel
                        </button>
                        <button onClick={handleExport} className="text-sm flex items-center gap-2 bg-white border border-slate-300 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
                            <Download size={16} /> CSV
                        </button>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Category Filter */}
                    <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <Folder size={16} className="text-amber-600" />
                        <span className="text-sm font-medium text-slate-600">Kategori:</span>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
                        >
                            <option value="ALL">Semua Kategori ({availableCategories.length})</option>
                            {availableCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    {/* Group Mode Toggle */}
                    <button
                        onClick={() => setGroupByCategory(prev => !prev)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${groupByCategory ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-sm' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}`}
                    >
                        <Layers size={14} />
                        {groupByCategory ? 'Tampilan Per Kategori' : 'Tampilan Flat'}
                    </button>

                    {/* Date Filters */}
                    <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <Filter size={16} className="text-slate-400" />
                        <span className="text-sm font-medium text-slate-600">Tanggal:</span>
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
                    <div className="relative flex-1 max-w-xs">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Cari barang, faktur, kasir..."
                            className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all text-xs text-slate-700"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Category Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 pt-2">
                    {Object.entries(categorySummaries).map(([catName, summary]) => (
                        <div
                            key={catName}
                            onClick={() => setSelectedCategory(selectedCategory === catName ? 'ALL' : catName)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer ${selectedCategory === catName ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/30' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                        >
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 truncate mb-1">
                                <span className="truncate" title={catName}>{catName}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold shrink-0">{summary.count}</span>
                            </div>
                            <div className="text-sm font-bold text-slate-800">{summary.totalQty} <span className="text-[10px] font-normal text-slate-500">terjual</span></div>
                            <div className="text-xs font-bold text-emerald-600 mt-0.5">{formatIDR(summary.totalRevenue)}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Table Container */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
                <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700 flex flex-wrap justify-between items-center gap-2 text-sm">
                    <div className="flex items-center gap-2">
                        <Folder size={18} className="text-amber-600" />
                        <span>Daftar Barang Terjual ({groupByCategory ? `${Object.keys(groupedSoldItems).length} Kategori` : `${soldItems.length} Item`})</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
                        <span>Total Qty Terjual: <strong className="text-slate-900 text-sm">{totalGlobalQty}</strong></span>
                        <span>Total Pendapatan: <strong className="text-emerald-700 text-sm">{formatIDR(totalGlobalRevenue)}</strong></span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th className="p-3 font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('date')}>
                                    <div className="flex items-center">Tanggal <SortIcon column="date" /></div>
                                </th>
                                <th className="p-3 font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('transactionId')}>
                                    <div className="flex items-center">Faktur / ID <SortIcon column="transactionId" /></div>
                                </th>
                                <th className="p-3 font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('name')}>
                                    <div className="flex items-center">Nama Barang <SortIcon column="name" /></div>
                                </th>
                                <th className="p-3 font-medium text-center">Satuan</th>
                                <th className="p-3 font-medium text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('qty')}>
                                    <div className="flex items-center justify-center">Qty <SortIcon column="qty" /></div>
                                </th>
                                {currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER && (
                                    <th className="p-3 font-medium text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('hpp')}>
                                        <div className="flex items-center justify-end">HPP <SortIcon column="hpp" /></div>
                                    </th>
                                )}
                                <th className="p-3 font-medium text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('finalPrice')}>
                                    <div className="flex items-center justify-end">Harga Jual <SortIcon column="finalPrice" /></div>
                                </th>
                                <th className="p-3 font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('categoryName')}>
                                    <div className="flex items-center">Kategori <SortIcon column="categoryName" /></div>
                                </th>
                                <th className="p-3 font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('customerName')}>
                                    <div className="flex items-center">Pembeli <SortIcon column="customerName" /></div>
                                </th>
                                <th className="p-3 font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('cashierName')}>
                                    <div className="flex items-center">Kasir <SortIcon column="cashierName" /></div>
                                </th>
                                <th className="p-3 font-medium text-center">Status</th>
                                <th className="p-3 font-medium text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {soldItems.length === 0 && (
                                <tr>
                                    <td colSpan={12} className="p-8 text-center text-slate-400">Tidak ada data barang terjual.</td>
                                </tr>
                            )}

                            {groupByCategory ? (
                                Object.entries(groupedSoldItems).map(([catName, items]) => {
                                    const subTotalQty = items.reduce((s, i) => s + (i.transactionType === TransactionType.RETURN ? -i.qty : i.qty), 0);
                                    const subTotalRevenue = items.reduce((s, i) => s + (i.transactionType === TransactionType.RETURN ? -(i.finalPrice * i.qty) : (i.finalPrice * i.qty)), 0);

                                    return (
                                        <React.Fragment key={catName}>
                                            {/* Category Section Header Row */}
                                            <tr className="bg-amber-50/90 text-amber-950 font-bold border-y border-amber-200">
                                                <td colSpan={12} className="px-4 py-2.5">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                                                            <Folder size={16} className="text-amber-600" />
                                                            Kategori: <span className="underline decoration-amber-500 uppercase tracking-wide">{catName}</span>
                                                            <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-mono">{items.length} item</span>
                                                        </span>
                                                        <div className="flex items-center gap-4 text-xs font-semibold">
                                                            <span>Total Qty: <strong className="text-amber-900 font-extrabold">{subTotalQty}</strong></span>
                                                            <span>Subtotal: <strong className="text-emerald-700 font-extrabold">{formatIDR(subTotalRevenue)}</strong></span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Item Rows */}
                                            {items.map((item, idx) => (
                                                <tr key={`${catName}-${item.transactionId}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-3 text-slate-600">
                                                        <div className="flex flex-col">
                                                            <span>{new Date(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                            <span className="text-[10px] text-slate-400">{new Date(item.date).toLocaleTimeString('id-ID')}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 font-mono text-xs text-slate-700">
                                                        {item.transactionInvoiceNumber || `#${item.transactionId.substring(0, 6)}`}
                                                    </td>
                                                    <td className="p-3 font-semibold text-slate-800">{item.name}</td>
                                                    <td className="p-3 text-center text-slate-500 text-xs">{item.unit || 'Pcs'}</td>
                                                    <td className="p-3 text-center font-bold text-slate-800">{item.qty}</td>
                                                    {currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER && (
                                                        <td className="p-3 text-right text-slate-500">{formatIDR(item.hpp || 0)}</td>
                                                    )}
                                                    <td className="p-3 text-right font-medium text-slate-800">{formatIDR(item.finalPrice)}</td>
                                                    <td className="p-3 text-slate-600 font-medium">{item.categoryName || '-'}</td>
                                                    <td className="p-3 text-slate-600">{item.customerName}</td>
                                                    <td className="p-3 text-slate-600">{item.cashierName}</td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.transactionType === TransactionType.RETURN
                                                            ? 'bg-purple-100 text-purple-600'
                                                            : item.isReturned
                                                                ? 'bg-orange-100 text-orange-600'
                                                                : 'bg-green-100 text-green-600'
                                                            }`}>
                                                            {item.transactionType === TransactionType.RETURN ? 'RETUR' : item.isReturned ? 'Retur Sebagian' : 'Normal'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(item.transactionId); }} className="text-[11px] bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded transition-colors inline-flex items-center gap-1 font-medium" title="Hapus Transaksi">
                                                            <Trash2 size={12} /> Hapus
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}

                                            {/* Subtotal Row per Category */}
                                            <tr className="bg-slate-100/70 font-semibold border-b-2 border-slate-200">
                                                <td colSpan={4} className="p-2.5 text-right text-slate-600 text-xs italic">
                                                    Subtotal Kategori {catName}:
                                                </td>
                                                <td className="p-2.5 text-center font-bold text-slate-900 text-xs">{subTotalQty}</td>
                                                {currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER && (
                                                    <td className="p-2.5"></td>
                                                )}
                                                <td className="p-2.5 text-right font-bold text-emerald-700 text-xs">{formatIDR(subTotalRevenue)}</td>
                                                <td colSpan={5} className="p-2.5"></td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })
                            ) : (
                                visibleSoldItems.map((item, idx) => (
                                    <tr key={`${item.transactionId}-${idx}`} className="hover:bg-slate-50">
                                        <td className="p-3 text-slate-600">
                                            <div className="flex flex-col">
                                                <span>{new Date(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                <span className="text-[10px] text-slate-400">{new Date(item.date).toLocaleTimeString('id-ID')}</span>
                                            </div>
                                        </td>
                                        <td className="p-3 font-mono text-xs text-slate-700">{item.transactionInvoiceNumber || `#${item.transactionId.substring(0, 6)}`}</td>
                                        <td className="p-3 font-semibold text-slate-800">{item.name}</td>
                                        <td className="p-3 text-center text-slate-500 text-xs">{item.unit || 'Pcs'}</td>
                                        <td className="p-3 text-center font-bold text-slate-800">{item.qty}</td>
                                        {currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER && (
                                            <td className="p-3 text-right text-slate-500">{formatIDR(item.hpp || 0)}</td>
                                        )}
                                        <td className="p-3 text-right text-slate-800">{formatIDR(item.finalPrice)}</td>
                                        <td className="p-3 text-slate-600">{item.categoryName || '-'}</td>
                                        <td className="p-3 text-slate-600">{item.customerName}</td>
                                        <td className="p-3 text-slate-600">{item.cashierName}</td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.transactionType === TransactionType.RETURN
                                                ? 'bg-purple-100 text-purple-600'
                                                : item.isReturned
                                                    ? 'bg-orange-100 text-orange-600'
                                                    : 'bg-green-100 text-green-600'
                                                }`}>
                                                {item.transactionType === TransactionType.RETURN ? 'RETUR' : item.isReturned ? 'Retur Sebagian' : 'Normal'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(item.transactionId); }} className="text-[11px] bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded transition-colors inline-flex items-center gap-1 font-medium" title="Hapus Transaksi">
                                                <Trash2 size={12} /> Hapus
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}

                            {visibleSoldItems.length < soldItems.length && !groupByCategory && (
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
        </div>
    );
};
