import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { Product, StockAdjustment, User } from '../types';
import { formatDate, generateUUID, formatIDR, exportToCSV, exportToExcel } from '../utils';
import { Search, Filter, RotateCcw, Save, Package, TrendingUp, TrendingDown, FileText, Printer, Download, FileSpreadsheet, Calendar, X, Trash2, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface RealStockCheckProps {
    currentUser: User | null;
}

export const RealStockCheck: React.FC<RealStockCheckProps> = ({ currentUser }) => {
    // Data Loading
    const products = useData(() => StorageService.getProducts(), [], 'products') || [];
    const stockAdjustments = useData(() => StorageService.getStockAdjustments(), [], 'stock_adjustments') || [];

    // Form State
    const [selectedProductId, setSelectedProductId] = useState('');
    const [adjustmentType, setAdjustmentType] = useState<'INCREASE' | 'DECREASE'>('DECREASE');
    const [reason, setReason] = useState('');
    const [customReason, setCustomReason] = useState('');
    const [qty, setQty] = useState('');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Input Mode State
    const [inputMode, setInputMode] = useState<'FINAL' | 'MANUAL'>('FINAL');
    const [finalStockInput, setFinalStockInput] = useState('');

    // Product Search State
    const [productSearchTerm, setProductSearchTerm] = useState('');
    const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);

    // Filter State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Selected Product Object
    const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [products, selectedProductId]);

    // Constant Reasons
    const REDUCTION_REASONS = ['Kadaluarsa', 'Hilang', 'Rusak', 'Retur Manual', 'Hadiah', 'Pengecekan Manual (Opname)', 'Lain-lain'];
    const ADDITION_REASONS = ['Hadiah', 'Retur Manual', 'Pengecekan Manual (Opname)', 'Lain-lain'];

    // Sorted & Filtered Adjustments
    const sortedAdjustments = useMemo(() => {
        let items = [...stockAdjustments];

        if (startDate || endDate) {
            items = items.filter(item => {
                const itemDateStr = new Date(item.date).toISOString().split('T')[0];
                if (startDate && itemDateStr < startDate) return false;
                if (endDate && itemDateStr > endDate) return false;
                return true;
            });
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            items = items.filter(item =>
                item.productName?.toLowerCase().includes(q) ||
                item.reason.toLowerCase().includes(q) ||
                item.note?.toLowerCase().includes(q) ||
                item.userName?.toLowerCase().includes(q)
            );
        }

        return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [stockAdjustments, startDate, endDate, searchQuery]);

    // Summary Calculations
    const summaryStats = useMemo(() => {
        let totalIncreaseQty = 0;
        let totalDecreaseQty = 0;

        sortedAdjustments.forEach(adj => {
            if (adj.type === 'INCREASE') {
                totalIncreaseQty += adj.qty;
            } else {
                totalDecreaseQty += adj.qty;
            }
        });

        return {
            totalAdjustments: sortedAdjustments.length,
            totalIncreaseQty,
            totalDecreaseQty,
            netQtyDiff: totalIncreaseQty - totalDecreaseQty
        };
    }, [sortedAdjustments]);

    // Effect to calculate qty and type automatically when in FINAL (Stok Opname) mode
    useEffect(() => {
        if (inputMode === 'FINAL' && selectedProduct && finalStockInput !== '') {
            const finalStock = parseInt(finalStockInput);
            if (!isNaN(finalStock)) {
                const diff = finalStock - selectedProduct.stock;
                if (diff > 0) {
                    setAdjustmentType('INCREASE');
                    setQty(diff.toString());
                    setReason('Pengecekan Manual (Opname)');
                } else if (diff < 0) {
                    setAdjustmentType('DECREASE');
                    setQty(Math.abs(diff).toString());
                    setReason('Pengecekan Manual (Opname)');
                } else {
                    setQty('0');
                }
            } else {
                setQty('');
            }
        }
    }, [inputMode, finalStockInput, selectedProduct]);

    // Reset fields when selected product changes
    useEffect(() => {
        setFinalStockInput('');
        setQty('');
        setReason('');
        setCustomReason('');
    }, [selectedProductId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct || !qty || !reason) return;

        const quantity = parseInt(qty);
        if (isNaN(quantity) || quantity <= 0) {
            alert("Jumlah selisih stok harus berupa angka positif.");
            return;
        }

        if (adjustmentType === 'DECREASE' && quantity > selectedProduct.stock) {
            alert("Stok sistem tidak mencukupi untuk pengurangan ini.");
            return;
        }

        const finalReason = reason === 'Lain-lain' ? (customReason || 'Lain-lain') : reason;
        const previousStock = selectedProduct.stock;
        const currentStock = adjustmentType === 'INCREASE' ? previousStock + quantity : previousStock - quantity;

        setIsSubmitting(true);
        try {
            const adjustment: StockAdjustment = {
                id: generateUUID(),
                date: new Date().toISOString(),
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                type: adjustmentType,
                reason: finalReason,
                qty: quantity,
                previousStock: previousStock,
                currentStock: currentStock,
                note: note,
                userId: currentUser?.id,
                userName: currentUser?.name
            };

            await StorageService.addStockAdjustment(adjustment);

            // Reset Form
            setQty('');
            setNote('');
            setReason('');
            setCustomReason('');
            setFinalStockInput('');
            setProductSearchTerm('');
            setSelectedProductId('');
            setIsProductDropdownOpen(false);

            alert('✅ Penyesuaian stok real berhasil disimpan.');
        } catch (error) {
            console.error(error);
            alert('Gagal menyimpan data penyesuaian stok.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteAdjustment = async (adjustment: StockAdjustment) => {
        if (!confirm(`Apakah Anda yakin ingin membatalkan/menghapus penyesuaian stok untuk "${adjustment.productName}"? Stok produk akan dikembalikan secara otomatis.`)) {
            return;
        }

        try {
            await (StorageService as any).deleteStockAdjustment(adjustment);
            alert('✅ Penyesuaian stok berhasil dibatalkan dan stok produk telah dikembalikan.');
        } catch (error) {
            console.error(error);
            alert('Gagal membatalkan penyesuaian stok.');
        }
    };

    const handleExportExcel = () => {
        const data = sortedAdjustments.map(item => ({
            'Tanggal': new Date(item.date).toLocaleDateString('id-ID'),
            'Jam': new Date(item.date).toLocaleTimeString('id-ID'),
            'Produk': item.productName,
            'Tipe': item.type === 'INCREASE' ? 'Penambahan' : 'Pengurangan',
            'Alasan': item.reason,
            'Stok Awal': item.previousStock ?? '-',
            'Selisih Qty': item.type === 'INCREASE' ? `+${item.qty}` : `-${item.qty}`,
            'Stok Akhir': item.currentStock ?? '-',
            'Petugas': item.userName || '-',
            'Catatan': item.note || '-'
        }));

        exportToExcel(data, 'Riwayat_Cek_Stok_Real', 'Data Opname', [
            { wch: 15 },
            { wch: 10 },
            { wch: 25 },
            { wch: 15 },
            { wch: 22 },
            { wch: 12 },
            { wch: 12 },
            { wch: 12 },
            { wch: 18 },
            { wch: 25 }
        ]);
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const rows = sortedAdjustments.map((item, idx) => `
            <tr>
                <td style="text-align:center">${idx + 1}</td>
                <td>${new Date(item.date).toLocaleDateString('id-ID')} ${new Date(item.date).toLocaleTimeString('id-ID')}</td>
                <td><strong>${item.productName}</strong></td>
                <td style="color: ${item.type === 'INCREASE' ? 'green' : 'red'}; font-weight: bold; text-align:center;">${item.type === 'INCREASE' ? 'PENAMBAHAN' : 'PENGURANGAN'}</td>
                <td>${item.reason}</td>
                <td style="text-align:center">${item.previousStock ?? '-'}</td>
                <td style="text-align:center; font-weight:bold;">${item.type === 'INCREASE' ? '+' : '-'}${item.qty}</td>
                <td style="text-align:center; font-weight:bold; color:#d97706">${item.currentStock ?? '-'}</td>
                <td>${item.userName || '-'}</td>
                <td>${item.note || '-'}</td>
            </tr>
        `).join('');

        const html = `
            <html>
                <head>
                    <title>Laporan Pengecekan Stok Real (Opname)</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; color: #333; }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
                        th { background-color: #f1f5f9; font-weight: bold; text-align: center; }
                        h2 { text-align: center; margin-bottom: 5px; }
                        p.subtitle { text-align: center; color: #666; font-size: 11px; margin-bottom: 15px; }
                    </style>
                </head>
                <body>
                    <h2>Laporan Pengecekan Stok Real (Opname)</h2>
                    <p class="subtitle">Dicetak pada: ${new Date().toLocaleString('id-ID')}</p>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px;">No</th>
                                <th>Tanggal & Waktu</th>
                                <th>Produk</th>
                                <th>Tipe</th>
                                <th>Alasan</th>
                                <th>Stok Awal</th>
                                <th>Selisih Qty</th>
                                <th>Stok Akhir</th>
                                <th>Petugas</th>
                                <th>Catatan</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                    <script>window.print();</script>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    return (
        <div className="space-y-6 animate-fade-in p-2 md:p-0">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Package className="text-amber-600" />
                        Pengecekan Stok Real (Opname)
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Kelola penyesuaian stok fisik real dan riwayat opname persediaan produk</p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <button onClick={handlePrint} className="flex-1 md:flex-none items-center justify-center gap-2 bg-white border border-slate-300 px-4 py-2 rounded-xl text-slate-700 hover:bg-slate-50 transition-all flex text-sm font-medium shadow-sm">
                        <Printer size={16} /> Print
                    </button>
                    <button onClick={handleExportExcel} className="flex-1 md:flex-none items-center justify-center gap-2 bg-green-50 border border-green-200 px-4 py-2 rounded-xl text-green-700 hover:bg-green-100 transition-all flex text-sm font-medium shadow-sm">
                        <FileSpreadsheet size={16} /> Excel
                    </button>
                </div>
            </div>

            {/* Summary Dashboard Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Penyesuaian</p>
                        <h3 className="text-xl font-extrabold text-slate-900 mt-1">{summaryStats.totalAdjustments} <span className="text-xs font-normal text-slate-400">kali</span></h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Riwayat Opname</p>
                    </div>
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                        <FileText size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Penambahan (+)</p>
                        <h3 className="text-xl font-extrabold text-emerald-600 mt-1">+{summaryStats.totalIncreaseQty} <span className="text-xs font-normal text-slate-400">unit</span></h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Stok Masuk/Kelebihan</p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                        <TrendingUp size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Pengurangan (-)</p>
                        <h3 className="text-xl font-extrabold text-rose-600 mt-1">-{summaryStats.totalDecreaseQty} <span className="text-xs font-normal text-slate-400">unit</span></h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Kerusakan / Hilang / Expired</p>
                    </div>
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                        <TrendingDown size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Selisih Bersih (Net)</p>
                        <h3 className={`text-xl font-extrabold mt-1 ${summaryStats.netQtyDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {summaryStats.netQtyDiff >= 0 ? `+${summaryStats.netQtyDiff}` : summaryStats.netQtyDiff} <span className="text-xs font-normal text-slate-400">unit</span>
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Penambahan - Pengurangan</p>
                    </div>
                    <div className={`p-3 rounded-xl shrink-0 ${summaryStats.netQtyDiff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        <Package size={22} />
                    </div>
                </div>
            </div>

            {/* Form Input Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                    <FileText size={18} className="text-amber-600" />
                    Input Penyesuaian Stok Fisik Real
                </h3>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Searchable Product Selector */}
                    <div className="relative">
                        <label htmlFor="productSearchInput" className="block text-xs font-bold text-slate-600 uppercase mb-2">Pilih Produk Yang Ingin Di-Opname</label>
                        <div className="relative">
                            <input
                                id="productSearchInput"
                                name="productSearchInput"
                                type="text"
                                className="w-full px-4 py-3 pl-11 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-sm font-medium text-slate-800 placeholder:text-slate-400"
                                placeholder="Ketik nama produk atau scan barcode..."
                                value={productSearchTerm}
                                onChange={(e) => {
                                    setProductSearchTerm(e.target.value);
                                    setIsProductDropdownOpen(true);
                                    if (e.target.value === '') {
                                        setSelectedProductId('');
                                    }
                                }}
                                onFocus={() => setIsProductDropdownOpen(true)}
                            />
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />

                            {productSearchTerm && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProductSearchTerm('');
                                        setSelectedProductId('');
                                        setQty('');
                                        setIsProductDropdownOpen(true);
                                    }}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        {/* Dropdown Product Results */}
                        {isProductDropdownOpen && (
                            <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 max-h-64 overflow-y-auto divide-y divide-slate-100">
                                {products
                                    .filter(p => !productSearchTerm || p.name.toLowerCase().includes(productSearchTerm.toLowerCase()))
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .length === 0 ? (
                                    <div className="p-4 text-center text-slate-500 text-xs italic">Produk tidak ditemukan.</div>
                                ) : (
                                    products
                                        .filter(p => !productSearchTerm || p.name.toLowerCase().includes(productSearchTerm.toLowerCase()))
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedProductId(p.id);
                                                    setProductSearchTerm(p.name);
                                                    setIsProductDropdownOpen(false);
                                                }}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex justify-between items-center group"
                                            >
                                                <div>
                                                    <span className="font-semibold text-sm text-slate-800 group-hover:text-amber-700 transition-colors">{p.name}</span>
                                                    <div className="text-xs text-slate-400">{p.categoryName || 'Tanpa Kategori'} {p.unit ? `• ${p.unit}` : ''}</div>
                                                </div>
                                                <div className="bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-bold font-mono">
                                                    Stok: {p.stock}
                                                </div>
                                            </button>
                                        ))
                                )}
                            </div>
                        )}

                        {isProductDropdownOpen && (
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setIsProductDropdownOpen(false)}
                            ></div>
                        )}
                    </div>

                    {selectedProduct && (
                        <div className="flex flex-col lg:flex-row gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                            {/* Selected Product Summary Box */}
                            <div className="flex items-start gap-4 lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-200 pb-4 lg:pb-0 lg:pr-5">
                                <div className="w-20 h-20 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                    {selectedProduct.image ? (
                                        <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <Package className="text-slate-300" size={32} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-800 text-sm line-clamp-2">{selectedProduct.name}</h4>
                                    <p className="text-xs text-slate-500 mt-0.5">{selectedProduct.categoryName || 'Tanpa Kategori'}</p>
                                    <div className="mt-3 flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm w-fit">
                                        <span className="text-xs text-slate-500 font-medium">Stok Sistem Saat Ini:</span>
                                        <span className="font-extrabold text-sm text-amber-700">{selectedProduct.stock}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Adjustment Mode Controls */}
                            <div className="flex-1 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Metode Input Opname</label>
                                    <div className="flex bg-slate-200/70 p-1 rounded-xl w-full sm:w-fit gap-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setInputMode('FINAL');
                                                setFinalStockInput('');
                                                setQty('');
                                                setReason('');
                                            }}
                                            className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${inputMode === 'FINAL' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'}`}
                                        >
                                            1. Stok Fisik Akhir (Otomatis Hitung Selisih)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setInputMode('MANUAL');
                                                setQty('');
                                                setReason('');
                                            }}
                                            className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${inputMode === 'MANUAL' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'}`}
                                        >
                                            2. Selisih Manual
                                        </button>
                                    </div>
                                </div>

                                {inputMode === 'FINAL' ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                        <div>
                                            <label htmlFor="finalStock" className="block text-xs font-bold text-slate-600 uppercase mb-1">Stok Akhir Hasil Opname Fisik</label>
                                            <input
                                                id="finalStock"
                                                name="finalStock"
                                                type="number"
                                                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-bold text-base text-slate-900"
                                                placeholder={`Contoh: ${selectedProduct.stock}`}
                                                min="0"
                                                value={finalStockInput}
                                                onChange={e => setFinalStockInput(e.target.value)}
                                                required
                                            />
                                            <p className="text-slate-500 text-xs mt-1">
                                                Stok di sistem sekarang: <span className="font-bold text-slate-700">{selectedProduct.stock}</span>
                                            </p>
                                        </div>

                                        <div className="flex items-center">
                                            {finalStockInput !== '' && !isNaN(parseInt(finalStockInput)) && parseInt(qty) > 0 ? (
                                                <div className={`w-full p-3 rounded-xl border flex items-center gap-3 ${adjustmentType === 'INCREASE'
                                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                                    : 'bg-rose-50 border-rose-200 text-rose-800'
                                                    }`}>
                                                    <div className={`p-2 rounded-full ${adjustmentType === 'INCREASE' ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'}`}>
                                                        {adjustmentType === 'INCREASE' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                                                    </div>
                                                    <div>
                                                        <div className="font-extrabold text-sm flex items-center gap-2">
                                                            {selectedProduct.stock} <ArrowRight size={14} /> {finalStockInput}
                                                            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-white border border-current">
                                                                {adjustmentType === 'INCREASE' ? `+${qty}` : `-${qty}`} Unit
                                                            </span>
                                                        </div>
                                                        <div className="text-[11px] opacity-90 mt-0.5">
                                                            Kalkulasi otomatis sebagai {adjustmentType === 'INCREASE' ? 'Penambahan Stok' : 'Pengurangan Stok'}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : finalStockInput !== '' && parseInt(finalStockInput) === selectedProduct.stock ? (
                                                <div className="w-full p-3 rounded-xl border bg-white border-slate-200 text-slate-600 flex items-center gap-3">
                                                    <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                                                    <div>
                                                        <div className="font-bold text-xs">Stok Sesuai (0 Selisih)</div>
                                                        <div className="text-[11px] text-slate-400">Jumlah fisik sama persis dengan sistem.</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-full p-3 rounded-xl border bg-white border-dashed border-slate-300 text-slate-400 text-xs italic text-center">
                                                    Masukkan jumlah stok fisik hasil hitungan untuk melihat kalkulasi selisih.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Jenis Perubahan</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setAdjustmentType('DECREASE')}
                                                    className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border ${adjustmentType === 'DECREASE'
                                                        ? 'bg-rose-100 border-rose-300 text-rose-700 shadow-sm'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                                        }`}
                                                >
                                                    <TrendingDown size={15} /> Pengurangan (-)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAdjustmentType('INCREASE')}
                                                    className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border ${adjustmentType === 'INCREASE'
                                                        ? 'bg-emerald-100 border-emerald-300 text-emerald-700 shadow-sm'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                                        }`}
                                                >
                                                    <TrendingUp size={15} /> Penambahan (+)
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="manualQty" className="block text-xs font-bold text-slate-600 uppercase mb-1">Jumlah Selisih (Qty)</label>
                                            <input
                                                id="manualQty"
                                                name="manualQty"
                                                type="number"
                                                className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:border-amber-500 outline-none font-bold"
                                                placeholder="Contoh: 5"
                                                min="1"
                                                value={qty}
                                                onChange={e => setQty(e.target.value)}
                                                required
                                            />
                                            {adjustmentType === 'DECREASE' && qty && parseInt(qty) > selectedProduct.stock && (
                                                <p className="text-rose-500 text-[11px] mt-1 font-semibold">* Melebihi jumlah stok saat ini ({selectedProduct.stock})</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="stockReason" className="block text-xs font-bold text-slate-600 uppercase mb-1">Alasan Penyesuaian</label>
                                        <select
                                            id="stockReason"
                                            name="stockReason"
                                            className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:border-amber-500 outline-none font-medium"
                                            value={reason}
                                            onChange={(e) => setReason(e.target.value)}
                                            required
                                        >
                                            <option value="">-- Pilih Alasan --</option>
                                            {(adjustmentType === 'DECREASE' ? REDUCTION_REASONS : ADDITION_REASONS).map(r => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </select>
                                        {reason === 'Lain-lain' && (
                                            <input
                                                type="text"
                                                className="mt-2 w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
                                                placeholder="Tulis alasan spesifik..."
                                                value={customReason}
                                                onChange={e => setCustomReason(e.target.value)}
                                                required
                                            />
                                        )}
                                    </div>

                                    <div>
                                        <label htmlFor="stockNote" className="block text-xs font-bold text-slate-600 uppercase mb-1">Catatan Tambahan (Opsional)</label>
                                        <input
                                            id="stockNote"
                                            name="stockNote"
                                            type="text"
                                            className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:border-amber-500 outline-none"
                                            placeholder="Contoh: Barang rusak saat pengiriman..."
                                            value={note}
                                            onChange={e => setNote(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={isSubmitting || !selectedProduct || !qty || !reason || (qty === '0')}
                            className="bg-amber-600 text-white px-7 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-amber-600/20"
                        >
                            <Save size={16} />
                            Simpan Perubahan Stok
                        </button>
                    </div>
                </form>
            </div>

            {/* History Table Container */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-4 justify-between items-center text-sm font-semibold text-slate-700">
                    <div className="flex items-center gap-2">
                        <Package size={18} className="text-amber-600" />
                        <span>Riwayat Penyesuaian Stok ({sortedAdjustments.length})</span>
                    </div>

                    {/* Table Filters */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center bg-white border border-slate-300 rounded-xl px-2 py-1">
                            <input
                                type="date"
                                className="text-xs outline-none text-slate-700 bg-transparent"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                            <span className="mx-1 text-slate-400">-</span>
                            <input
                                type="date"
                                className="text-xs outline-none text-slate-700 bg-transparent"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Cari..."
                                className="pl-8 pr-7 py-1.5 border border-slate-300 rounded-xl text-xs focus:border-amber-500 outline-none w-36"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                        {(startDate || endDate || searchQuery) && (
                            <button
                                onClick={() => { setStartDate(''); setEndDate(''); setSearchQuery(''); }}
                                className="p-1.5 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-colors text-xs"
                                title="Reset Filter"
                            >
                                <RotateCcw size={14} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-medium uppercase tracking-wider border-b border-slate-100">
                            <tr>
                                <th className="p-3">Tanggal & Waktu</th>
                                <th className="p-3">Produk</th>
                                <th className="p-3">Tipe</th>
                                <th className="p-3">Alasan</th>
                                <th className="p-3 text-center">Stok Awal</th>
                                <th className="p-3 text-center">Selisih Qty</th>
                                <th className="p-3 text-center">Stok Akhir</th>
                                <th className="p-3">User</th>
                                <th className="p-3">Catatan</th>
                                <th className="p-3 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedAdjustments.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-slate-400">Belum ada data riwayat penyesuaian stok.</td>
                                </tr>
                            )}
                            {sortedAdjustments.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-3 text-slate-600">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-800">{new Date(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                            <span className="text-[10px] text-slate-400">{new Date(item.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 font-bold text-slate-900">{item.productName}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.type === 'INCREASE'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-rose-100 text-rose-700'
                                            }`}>
                                            {item.type === 'INCREASE' ? 'PENAMBAHAN' : 'PENGURANGAN'}
                                        </span>
                                    </td>
                                    <td className="p-3 text-slate-700 font-medium">{item.reason}</td>
                                    <td className="p-3 text-center text-slate-500 font-mono">{item.previousStock ?? '-'}</td>
                                    <td className="p-3 text-center font-extrabold text-slate-900">
                                        {item.type === 'INCREASE' ? `+${item.qty}` : `-${item.qty}`}
                                    </td>
                                    <td className="p-3 text-center font-extrabold text-amber-700 font-mono">{item.currentStock ?? '-'}</td>
                                    <td className="p-3 text-slate-600">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 shrink-0">
                                                {item.userName?.charAt(0) || '?'}
                                            </div>
                                            <span className="truncate max-w-[100px]">{item.userName || '-'}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 text-slate-500 italic max-w-xs truncate" title={item.note}>{item.note || '-'}</td>
                                    <td className="p-3 text-right">
                                        <button
                                            onClick={() => handleDeleteAdjustment(item)}
                                            className="text-[11px] bg-rose-50 text-rose-600 hover:bg-rose-100 px-2 py-1 rounded transition-colors inline-flex items-center gap-1 font-medium"
                                            title="Batalkan & Kembalikan Stok"
                                        >
                                            <Trash2 size={12} /> Hapus
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
