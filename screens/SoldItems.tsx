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
    const [viewMode, setViewMode] = useState<'category_grouped' | 'product_grouped' | 'all_items'>('category_grouped');

    // Sub-Report Category Modal State
    const [activeCategoryModal, setActiveCategoryModal] = useState<string | null>(null);
    const [modalSearch, setModalSearch] = useState<string>('');
    const [modalSortKey, setModalSortKey] = useState<'qty' | 'revenue' | 'profit' | 'name'>('qty');

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

    // Interface for Category Product Grouping Summary
    interface CategoryProductSummary {
        id?: string;
        name: string;
        sku: string;
        unit: string;
        categoryName: string;
        totalQty: number;
        avgPrice: number;
        totalRevenue: number;
        totalHpp: number;
        totalProfit: number;
        transactionCount: number;
    }

    // Modal Aggregated Products for Selected Category Sub-Report
    const modalCategoryProducts = useMemo(() => {
        if (!activeCategoryModal) return [];

        const itemsForCat = soldItems.filter(item => {
            const cat = item.categoryName && item.categoryName.trim() ? item.categoryName.trim() : 'Tanpa Kategori';
            return cat === activeCategoryModal;
        });

        const productMap: { [key: string]: CategoryProductSummary } = {};

        itemsForCat.forEach(item => {
            const key = item.id || item.name;
            if (!productMap[key]) {
                productMap[key] = {
                    id: item.id,
                    name: item.name,
                    sku: item.sku || '-',
                    unit: item.unit || 'Pcs',
                    categoryName: item.categoryName || 'Tanpa Kategori',
                    totalQty: 0,
                    avgPrice: item.finalPrice,
                    totalRevenue: 0,
                    totalHpp: 0,
                    totalProfit: 0,
                    transactionCount: 0
                };
            }

            const isReturn = item.transactionType === TransactionType.RETURN;
            const qtyVal = isReturn ? -item.qty : item.qty;
            const revVal = isReturn ? -(item.finalPrice * item.qty) : (item.finalPrice * item.qty);
            const hppVal = isReturn ? -((item.hpp || 0) * item.qty) : ((item.hpp || 0) * item.qty);

            productMap[key].totalQty += qtyVal;
            productMap[key].totalRevenue += revVal;
            productMap[key].totalHpp += hppVal;
            productMap[key].totalProfit += (revVal - hppVal);
            productMap[key].transactionCount += 1;
        });

        let list = Object.values(productMap);

        if (modalSearch.trim()) {
            const q = modalSearch.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
        }

        list.sort((a, b) => {
            if (modalSortKey === 'qty') return b.totalQty - a.totalQty;
            if (modalSortKey === 'revenue') return b.totalRevenue - a.totalRevenue;
            if (modalSortKey === 'profit') return b.totalProfit - a.totalProfit;
            if (modalSortKey === 'name') return a.name.localeCompare(b.name);
            return 0;
        });

        return list;
    }, [activeCategoryModal, soldItems, modalSearch, modalSortKey]);

    const modalCategoryTotals = useMemo(() => {
        if (!activeCategoryModal) return { totalQty: 0, totalRevenue: 0, totalHpp: 0, totalProfit: 0, uniqueProducts: 0 };

        const uniqueProducts = modalCategoryProducts.length;
        const totalQty = modalCategoryProducts.reduce((sum, p) => sum + p.totalQty, 0);
        const totalRevenue = modalCategoryProducts.reduce((sum, p) => sum + p.totalRevenue, 0);
        const totalHpp = modalCategoryProducts.reduce((sum, p) => sum + p.totalHpp, 0);
        const totalProfit = modalCategoryProducts.reduce((sum, p) => sum + p.totalProfit, 0);

        return { totalQty, totalRevenue, totalHpp, totalProfit, uniqueProducts };
    }, [modalCategoryProducts, activeCategoryModal]);

    // Product-level Aggregation across filtered transactions
    const allProductSummaries = useMemo(() => {
        let filtered = soldItems;
        if (selectedCategory !== 'ALL') {
            filtered = filtered.filter(item => {
                const cat = item.categoryName && item.categoryName.trim() ? item.categoryName.trim() : 'Tanpa Kategori';
                return cat === selectedCategory;
            });
        }

        const productMap: { [key: string]: CategoryProductSummary } = {};

        filtered.forEach(item => {
            const key = item.id || item.name;
            const cat = item.categoryName && item.categoryName.trim() ? item.categoryName.trim() : 'Tanpa Kategori';
            if (!productMap[key]) {
                productMap[key] = {
                    id: item.id,
                    name: item.name,
                    sku: item.sku || '-',
                    unit: item.unit || 'Pcs',
                    categoryName: cat,
                    totalQty: 0,
                    avgPrice: item.finalPrice,
                    totalRevenue: 0,
                    totalHpp: 0,
                    totalProfit: 0,
                    transactionCount: 0
                };
            }

            const isReturn = item.transactionType === TransactionType.RETURN;
            const qtyVal = isReturn ? -item.qty : item.qty;
            const revVal = isReturn ? -(item.finalPrice * item.qty) : (item.finalPrice * item.qty);
            const hppVal = isReturn ? -((item.hpp || 0) * item.qty) : ((item.hpp || 0) * item.qty);

            productMap[key].totalQty += qtyVal;
            productMap[key].totalRevenue += revVal;
            productMap[key].totalHpp += hppVal;
            productMap[key].totalProfit += (revVal - hppVal);
            productMap[key].transactionCount += 1;
        });

        return Object.values(productMap).sort((a, b) => b.totalQty - a.totalQty);
    }, [soldItems, selectedCategory]);

    const handlePrintCategorySubReport = (
        catName: string,
        products: CategoryProductSummary[],
        totals: { totalQty: number; totalRevenue: number; totalHpp: number; totalProfit: number; uniqueProducts: number }
    ) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const showHPP = currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER;

        const rowsHtml = products.map((p, idx) => `
            <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td><strong>${p.name}</strong><br/><small style="color: #64748b;">SKU: ${p.sku}</small></td>
                <td style="text-align: center;">${p.unit}</td>
                <td style="text-align: center; font-weight: bold;">${p.totalQty}</td>
                <td style="text-align: right;">${formatIDR(p.avgPrice)}</td>
                <td style="text-align: right; font-weight: bold;">${formatIDR(p.totalRevenue)}</td>
                ${showHPP ? `<td style="text-align: right;">${formatIDR(p.totalHpp)}</td>` : ''}
                ${showHPP ? `<td style="text-align: right; font-weight: bold; color: #2563eb;">${formatIDR(p.totalProfit)}</td>` : ''}
            </tr>
        `).join('');

        printWindow.document.write(`
            <html>
                <head>
                    <title>Sub-Laporan Barang Terjual - Kategori ${catName}</title>
                    <style>
                        body { font-family: 'Inter', sans-serif; font-size: 11px; padding: 20px; color: #1e293b; }
                        .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px; }
                        .title { font-size: 16px; font-weight: bold; margin: 0; text-transform: uppercase; }
                        .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
                        .metrics { display: flex; gap: 15px; margin-bottom: 15px; background-color: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; }
                        .metric-box { flex: 1; }
                        .metric-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: bold; }
                        .metric-val { font-size: 13px; font-weight: bold; margin-top: 2px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; font-size: 10px; }
                        th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; }
                        .footer { margin-top: 20px; text-align: right; font-size: 10px; color: #64748b; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1 class="title">Sub-Laporan Barang Terjual (Per Produk)</h1>
                        <div class="subtitle">Kategori: <strong>${catName}</strong> | Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    </div>

                    <div class="metrics">
                        <div class="metric-box">
                            <div class="metric-label">Jumlah Jenis Produk</div>
                            <div class="metric-val">${totals.uniqueProducts} Variasi</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">Total Qty Terjual</div>
                            <div class="metric-val">${totals.totalQty} Unit</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-label">Total Omset Penjualan</div>
                            <div class="metric-val" style="color: #059669;">${formatIDR(totals.totalRevenue)}</div>
                        </div>
                        ${showHPP ? `
                        <div class="metric-box">
                            <div class="metric-label">Total Laba Bersih</div>
                            <div class="metric-val" style="color: #2563eb;">${formatIDR(totals.totalProfit)}</div>
                        </div>
                        ` : ''}
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px; text-align: center;">No</th>
                                <th>Nama Produk & SKU</th>
                                <th style="text-align: center;">Satuan</th>
                                <th style="text-align: center;">Qty Terjual</th>
                                <th style="text-align: right;">Harga Jual</th>
                                <th style="text-align: right;">Total Omset</th>
                                ${showHPP ? '<th style="text-align: right;">Total HPP</th>' : ''}
                                ${showHPP ? '<th style="text-align: right;">Laba Bersih</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                    <div class="footer">
                        <p>Dicetak dari Sistem Kasir POS pada ${new Date().toLocaleString('id-ID')}</p>
                    </div>

                    <script>window.onafterprint = function() { window.close(); }; window.print();</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleExportCategorySubReport = (
        catName: string,
        products: CategoryProductSummary[]
    ) => {
        const showHPP = currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER;

        const headers = ['No', 'Nama Produk', 'SKU', 'Kategori', 'Satuan', 'Qty Terjual', 'Harga Jual', 'Total Omset'];
        if (showHPP) {
            headers.push('Total HPP', 'Laba Bersih');
        }

        const rows = products.map((p, idx) => {
            const row = [
                (idx + 1).toString(),
                p.name,
                p.sku,
                p.categoryName,
                p.unit,
                p.totalQty.toString(),
                p.avgPrice.toString(),
                p.totalRevenue.toString()
            ];
            if (showHPP) {
                row.push(p.totalHpp.toString(), p.totalProfit.toString());
            }
            return row;
        });

        const safeName = catName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        exportToCSV(`laporan-sub-barang-kategori-${safeName}.csv`, headers, rows);
    };

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
        if (!confirm('Yakin ingin menghapus transaksi ini? Stok barang akan otomatis dikembalikan ke inventaris toko dan catatan pendapatan/arus kas terkait akan disesuaikan.')) return;
        try {
            await StorageService.deleteTransaction(transactionId);
            alert('Transaksi berhasil dihapus. Stok barang dan pendapatan telah otomatis dikembalikan.');
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
                            onClick={() => {
                                setSelectedCategory(catName);
                                setActiveCategoryModal(catName);
                            }}
                            className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${selectedCategory === catName ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/30' : 'bg-white border-slate-200 hover:bg-amber-50/60 hover:border-amber-300 shadow-2xs'}`}
                        >
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 truncate mb-1">
                                <span className="truncate font-bold text-slate-800" title={catName}>{catName}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold shrink-0">{summary.count}</span>
                            </div>
                            <div className="text-sm font-bold text-slate-800">{summary.totalQty} <span className="text-[10px] font-normal text-slate-500">terjual</span></div>
                            <div className="text-xs font-bold text-emerald-600 mt-0.5">{formatIDR(summary.totalRevenue)}</div>
                            <div className="text-[9px] font-bold text-amber-700 mt-1 opacity-80 group-hover:opacity-100 flex items-center gap-1">
                                🔍 Sub-Laporan Barang ➔
                            </div>
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

                <div className="overflow-x-auto touch-scroll">
                    <table className="w-full text-left text-xs min-w-[640px]">
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

            {/* Sub-Report Modal for Category */}
            {activeCategoryModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
                    <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="p-4 sm:p-5 bg-slate-900 text-white flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                                    <Folder size={22} />
                                </div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                                        Sub-Laporan Barang Terjual: <span className="text-amber-400 font-extrabold uppercase tracking-wide">{activeCategoryModal}</span>
                                    </h2>
                                    <p className="text-xs text-slate-400">
                                        Rincian barang terjual dikelompokkan berdasarkan produk
                                        {startDate || endDate ? ` (Periode: ${startDate || 'Awal'} s/d ${endDate || 'Akhir'})` : ''}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setActiveCategoryModal(null)}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Metric Cards inside Modal */}
                        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Variasi Produk</div>
                                <div className="text-lg font-black text-slate-800 mt-0.5">{modalCategoryTotals.uniqueProducts} <span className="text-xs font-semibold text-slate-400">Produk</span></div>
                            </div>
                            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Qty Terjual</div>
                                <div className="text-lg font-black text-slate-800 mt-0.5">{modalCategoryTotals.totalQty} <span className="text-xs font-semibold text-slate-400">Unit</span></div>
                            </div>
                            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Omset Kategori</div>
                                <div className="text-lg font-black text-emerald-600 mt-0.5">{formatIDR(modalCategoryTotals.totalRevenue)}</div>
                            </div>
                            {currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER && (
                                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Laba Bersih</div>
                                    <div className="text-lg font-black text-blue-600 mt-0.5">{formatIDR(modalCategoryTotals.totalProfit)}</div>
                                </div>
                            )}
                        </div>

                        {/* Modal Toolbar */}
                        <div className="p-4 bg-white border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
                            <div className="relative w-full sm:w-72">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Cari barang / SKU dalam kategori..."
                                    className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                                    value={modalSearch}
                                    onChange={e => setModalSearch(e.target.value)}
                                />
                                {modalSearch && (
                                    <button onClick={() => setModalSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <span className="text-xs font-semibold text-slate-500">Urutkan:</span>
                                <select
                                    value={modalSortKey}
                                    onChange={e => setModalSortKey(e.target.value as any)}
                                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
                                >
                                    <option value="qty">🔢 Qty Terbanyak</option>
                                    <option value="revenue">💰 Omset Penjualan Terbesar</option>
                                    {currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER && (
                                        <option value="profit">📈 Laba Bersih Terbanyak</option>
                                    )}
                                    <option value="name">🔤 Nama Produk (A-Z)</option>
                                </select>
                            </div>
                        </div>

                        {/* Modal Table Body */}
                        <div className="overflow-y-auto flex-1 p-4">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase font-bold sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 text-center w-10">No</th>
                                        <th className="p-3">Nama Produk & SKU</th>
                                        <th className="p-3 text-center">Satuan</th>
                                        <th className="p-3 text-center">Qty Terjual</th>
                                        <th className="p-3 text-right">Harga Jual</th>
                                        <th className="p-3 text-right">Total Omset</th>
                                        <th className="p-3 text-center">% Kontribusi</th>
                                        {currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER && (
                                            <>
                                                <th className="p-3 text-right">Total HPP</th>
                                                <th className="p-3 text-right">Laba Bersih</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {modalCategoryProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="p-8 text-center text-slate-400 font-medium">
                                                Tidak ada produk ditemukan dalam kategori "{activeCategoryModal}".
                                            </td>
                                        </tr>
                                    ) : (
                                        modalCategoryProducts.map((prod, idx) => {
                                            const contribPct = modalCategoryTotals.totalRevenue > 0
                                                ? ((prod.totalRevenue / modalCategoryTotals.totalRevenue) * 100).toFixed(1)
                                                : '0';

                                            return (
                                                <tr key={`${prod.name}-${idx}`} className="hover:bg-amber-50/60 transition-colors">
                                                    <td className="p-3 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                                                    <td className="p-3 font-bold text-slate-800">
                                                        <div>{prod.name}</div>
                                                        <div className="text-[10px] text-slate-400 font-mono">SKU: {prod.sku}</div>
                                                    </td>
                                                    <td className="p-3 text-center font-medium text-slate-600">{prod.unit}</td>
                                                    <td className="p-3 text-center font-black text-slate-900 bg-amber-50/60">{prod.totalQty}</td>
                                                    <td className="p-3 text-right font-medium text-slate-700">{formatIDR(prod.avgPrice)}</td>
                                                    <td className="p-3 text-right font-black text-emerald-600">{formatIDR(prod.totalRevenue)}</td>
                                                    <td className="p-3 text-center">
                                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 font-mono text-[10px] font-bold text-slate-700">
                                                            {contribPct}%
                                                        </span>
                                                    </td>
                                                    {currentUser?.role !== UserRole.CASHIER && currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.OWNER && (
                                                        <>
                                                            <td className="p-3 text-right font-medium text-slate-600">{formatIDR(prod.totalHpp)}</td>
                                                            <td className="p-3 text-right font-bold text-blue-600">{formatIDR(prod.totalProfit)}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-between items-center gap-2 shrink-0">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handlePrintCategorySubReport(activeCategoryModal, modalCategoryProducts, modalCategoryTotals)}
                                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    <Printer size={14} /> Cetak Sub-Laporan Kategori
                                </button>
                                <button
                                    onClick={() => handleExportCategorySubReport(activeCategoryModal, modalCategoryProducts)}
                                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    <FileSpreadsheet size={14} /> Export CSV Sub-Kategori
                                </button>
                            </div>
                            <button
                                onClick={() => setActiveCategoryModal(null)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs transition-all cursor-pointer"
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
