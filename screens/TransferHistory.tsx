import React, { useState, useEffect, useMemo } from 'react';
import { ApiService } from '../services/api';
import { PaymentMethod, User, Transaction, Purchase, StoreSettings } from '../types';
import { Loading } from '../components/Loading';
import { ArrowRightLeft, Search, Calendar, ArrowUpRight, ArrowDownLeft, Printer, FileSpreadsheet, Download, Filter, RotateCcw, X, Building2, CreditCard, DollarSign, Eye, FileText, CheckCircle2 } from 'lucide-react';
import { formatIDR, formatDate, exportToCSV, exportToExcel } from '../utils';
import { generatePrintInvoice, generatePrintPurchaseDetail } from '../utils/printHelpers';

interface TransferHistoryProps {
    currentUser: User;
}

interface TransferItem {
    id: string;
    date: string;
    type: 'TRANSACTION' | 'PURCHASE' | 'CASHFLOW';
    subType: string; // e.g. 'Penjualan', 'Pelunasan Piutang', 'Pembelian', 'Beban Operasional'
    description: string;
    amount: number;
    flow: 'IN' | 'OUT';
    bankName: string;
    bankAccountNumber?: string;
    bankId?: string;
    referenceId?: string;
}

export const TransferHistory: React.FC<TransferHistoryProps> = ({ currentUser }) => {
    const [items, setItems] = useState<TransferItem[]>([]);
    const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]);
    const [rawPurchases, setRawPurchases] = useState<Purchase[]>([]);
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedBankFilter, setSelectedBankFilter] = useState('');
    const [flowFilter, setFlowFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

    // Receipt Modal State
    const [selectedReceipt, setSelectedReceipt] = useState<{
        item: TransferItem;
        transaction?: Transaction;
        purchase?: Purchase;
    } | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [cashflows, banks, transactions, purchases, settings] = await Promise.all([
                ApiService.getCashFlow(),
                ApiService.getBanks(),
                ApiService.getTransactions(),
                ApiService.getPurchases(),
                ApiService.getStoreSettings()
            ]);

            setRawTransactions(transactions);
            setRawPurchases(purchases);
            setStoreSettings(settings);

            const bankMap = new Map<string, string>(banks.map(b => [b.id, b.accountNumber]));
            const processedIds = new Set<string>();
            const transferItems: TransferItem[] = [];

            // 1. Process Cashflows via TRANSFER
            cashflows
                .filter(c => c.paymentMethod === PaymentMethod.TRANSFER)
                .forEach(c => {
                    let type: 'TRANSACTION' | 'PURCHASE' | 'CASHFLOW' = 'CASHFLOW';
                    const catLower = c.category.toLowerCase();
                    if (catLower.includes('penjualan') || catLower.includes('piutang')) {
                        type = 'TRANSACTION';
                    } else if (catLower.includes('pembelian') || catLower.includes('utang')) {
                        type = 'PURCHASE';
                    }

                    let description = c.description;
                    let invoiceRef = '';

                    if (c.referenceId) {
                        processedIds.add(c.referenceId);
                        if (type === 'TRANSACTION') {
                            const tx = transactions.find(t => t.id === c.referenceId);
                            if (tx && tx.invoiceNumber) {
                                invoiceRef = tx.invoiceNumber;
                            }
                        } else if (type === 'PURCHASE') {
                            const pur = purchases.find(p => p.id === c.referenceId);
                            if (pur && pur.invoiceNumber) {
                                invoiceRef = pur.invoiceNumber;
                            }
                        }
                    }

                    if (invoiceRef && !description.includes(invoiceRef)) {
                        description += ` (Faktur: ${invoiceRef})`;
                    }

                    transferItems.push({
                        id: c.id,
                        date: c.date,
                        type: type,
                        subType: c.category,
                        description: description,
                        amount: c.amount,
                        flow: c.type === 'MASUK' ? 'IN' : 'OUT',
                        bankName: c.bankName || 'Transfer Bank / E-Wallet',
                        bankAccountNumber: c.bankId ? bankMap.get(c.bankId) : undefined,
                        bankId: c.bankId,
                        referenceId: c.referenceId
                    });
                });

            // 2. Direct Sales Transactions via TRANSFER (if not already captured in cashflow reference)
            transactions
                .filter(t => t.paymentMethod === PaymentMethod.TRANSFER && !processedIds.has(t.id))
                .forEach(t => {
                    transferItems.push({
                        id: t.id,
                        date: t.date,
                        type: 'TRANSACTION',
                        subType: 'Penjualan Non-Tunai',
                        description: `Penjualan Kasir - ${t.customerName || 'Pelanggan Umum'} ${t.invoiceNumber ? `(Faktur: ${t.invoiceNumber})` : ''}`,
                        amount: t.totalAmount,
                        flow: 'IN',
                        bankName: t.bankName || 'Transfer Bank / E-Wallet',
                        bankAccountNumber: t.bankId ? bankMap.get(t.bankId) : undefined,
                        bankId: t.bankId,
                        referenceId: t.id
                    });
                });

            // 3. Direct Purchases via TRANSFER (if not already captured in cashflow reference)
            purchases
                .filter(p => p.paymentMethod === PaymentMethod.TRANSFER && !processedIds.has(p.id))
                .forEach(p => {
                    transferItems.push({
                        id: p.id,
                        date: p.date,
                        type: 'PURCHASE',
                        subType: 'Pembelian Stok Non-Tunai',
                        description: `Pembelian ke ${p.supplierName} ${p.invoiceNumber ? `(Faktur: ${p.invoiceNumber})` : ''}`,
                        amount: p.totalAmount,
                        flow: 'OUT',
                        bankName: p.bankName || 'Transfer Bank / E-Wallet',
                        bankAccountNumber: p.bankId ? bankMap.get(p.bankId) : undefined,
                        bankId: p.bankId,
                        referenceId: p.id
                    });
                });

            transferItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setItems(transferItems);
        } catch (error) {
            console.error("Error fetching transfer history:", error);
        } finally {
            setLoading(false);
        }
    };

    // Open Receipt Preview Modal
    const handleViewReceipt = (item: TransferItem) => {
        let matchedTx: Transaction | undefined;
        let matchedPur: Purchase | undefined;

        if (item.referenceId) {
            matchedTx = rawTransactions.find(t => t.id === item.referenceId);
            matchedPur = rawPurchases.find(p => p.id === item.referenceId);
        }

        if (!matchedTx && !matchedPur) {
            matchedTx = rawTransactions.find(t => t.id === item.id);
            matchedPur = rawPurchases.find(p => p.id === item.id);
        }

        setSelectedReceipt({
            item,
            transaction: matchedTx,
            purchase: matchedPur
        });
    };

    // Print Receipt from Modal
    const handlePrintReceiptModal = () => {
        if (!selectedReceipt) return;
        const { item, transaction, purchase } = selectedReceipt;

        const defaultSettings: StoreSettings = storeSettings || {
            name: 'KASIR POS TOKO',
            address: 'Jl. Raya Utama No. 123',
            phone: '081234567890',
            bankAccount: 'BCA 1234567890',
            footerMessage: 'Terima Kasih Atas Kunjungan Anda'
        };

        if (transaction) {
            generatePrintInvoice(transaction, defaultSettings, formatIDR, formatDate);
        } else if (purchase) {
            generatePrintPurchaseDetail(purchase, defaultSettings, formatIDR, formatDate);
        } else {
            // Print Custom Cashflow Transfer Receipt
            const printWindow = window.open('', '_blank');
            if (!printWindow) return;

            const html = `
                <html>
                    <head>
                        <title>Nota Mutasi Transfer #${item.id.substring(0, 8)}</title>
                        <style>
                            body { font-family: monospace, Arial, sans-serif; padding: 20px; font-size: 12px; color: #1e293b; max-width: 400px; margin: 0 auto; border: 1px solid #cbd5e1; }
                            .header { text-align: center; border-bottom: 2px dashed #94a3b8; padding-bottom: 10px; margin-bottom: 12px; }
                            .header h3 { margin: 0; font-size: 16px; text-transform: uppercase; }
                            .header p { margin: 2px 0; font-size: 11px; color: #64748b; }
                            .row { display: flex; justify-content: space-between; margin-bottom: 6px; }
                            .label { color: #64748b; font-size: 11px; }
                            .val { font-weight: bold; text-align: right; }
                            .divider { border-bottom: 1px dashed #cbd5e1; margin: 10px 0; }
                            .total-box { bg-color: #f8fafc; padding: 8px; border-radius: 6px; text-align: center; margin-top: 10px; border: 1px solid #e2e8f0; }
                            .total-val { font-size: 18px; font-weight: bold; color: ${item.flow === 'IN' ? '#16a34a' : '#dc2626'}; }
                            .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 15px; border-top: 1px dashed #94a3b8; padding-top: 8px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h3>${defaultSettings.name}</h3>
                            <p>${defaultSettings.address}</p>
                            <p>Telp: ${defaultSettings.phone}</p>
                            <p style="margin-top:6px; font-weight:bold; color:#d97706">BUKTI MUTASI TRANSFER</p>
                        </div>
                        <div class="row"><span class="label">ID Mutasi:</span><span class="val">#${item.id.substring(0, 8)}</span></div>
                        <div class="row"><span class="label">Tanggal:</span><span class="val">${formatDate(item.date)}</span></div>
                        <div class="row"><span class="label">Tipe Mutasi:</span><span class="val">${item.subType}</span></div>
                        <div class="row"><span class="label">Bank / E-Wallet:</span><span class="val">${item.bankName}</span></div>
                        ${item.bankAccountNumber ? `<div class="row"><span class="label">No. Rekening:</span><span class="val">${item.bankAccountNumber}</span></div>` : ''}
                        <div class="divider"></div>
                        <div class="row"><span class="label">Keterangan:</span></div>
                        <p style="margin: 2px 0 10px 0; font-size: 11px;">${item.description}</p>
                        <div class="total-box">
                            <span class="label" style="display:block">TOTAL MUTASI (${item.flow === 'IN' ? 'UANG MASUK' : 'UANG KELUAR'})</span>
                            <span class="total-val">${formatIDR(item.amount)}</span>
                        </div>
                        <div class="footer">
                            <p>Status: LUNAS / BERHASIL DITERIMA</p>
                            <p>Simpan nota ini sebagai bukti transaksi sah</p>
                        </div>
                        <script>window.print();</script>
                    </body>
                </html>
            `;

            printWindow.document.write(html);
            printWindow.document.close();
        }
    };

    // Filtered Transfer List
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchesSearch = item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.subType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.bankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.bankAccountNumber && item.bankAccountNumber.toLowerCase().includes(searchTerm.toLowerCase()));

            const itemDate = new Date(item.date).toISOString().split('T')[0];
            if (startDate && itemDate < startDate) return false;
            if (endDate && itemDate > endDate) return false;

            if (selectedBankFilter && item.bankName !== selectedBankFilter) return false;
            if (flowFilter === 'IN' && item.flow !== 'IN') return false;
            if (flowFilter === 'OUT' && item.flow !== 'OUT') return false;

            return matchesSearch;
        });
    }, [items, searchTerm, startDate, endDate, selectedBankFilter, flowFilter]);

    // Bank list for dropdown filter
    const bankOptions = useMemo(() => {
        const uniqueBanks = new Set<string>();
        items.forEach(item => {
            if (item.bankName) uniqueBanks.add(item.bankName);
        });
        return Array.from(uniqueBanks).sort();
    }, [items]);

    // Summary Statistics
    const summaryStats = useMemo(() => {
        let totalIn = 0;
        let countIn = 0;
        let totalOut = 0;
        let countOut = 0;

        filteredItems.forEach(item => {
            if (item.flow === 'IN') {
                totalIn += item.amount;
                countIn++;
            } else {
                totalOut += item.amount;
                countOut++;
            }
        });

        return {
            totalIn,
            countIn,
            totalOut,
            countOut,
            netTransfer: totalIn - totalOut,
            totalItems: filteredItems.length
        };
    }, [filteredItems]);

    const handleExport = () => {
        const headers = ['Tanggal', 'ID', 'Tipe', 'Deskripsi', 'Bank/E-Wallet', 'Alur', 'Jumlah'];
        const rows = filteredItems.map(item => [
            formatDate(item.date),
            item.id,
            item.subType,
            item.description,
            item.bankAccountNumber ? `${item.bankName} - ${item.bankAccountNumber}` : item.bankName,
            item.flow === 'IN' ? 'Masuk' : 'Keluar',
            item.amount
        ]);
        exportToCSV('riwayat-transfer.csv', headers, rows);
    };

    const handleExportExcel = () => {
        const data = filteredItems.map(item => ({
            'Tanggal': formatDate(item.date),
            'ID': item.id,
            'Tipe': item.subType,
            'Deskripsi': item.description,
            'Bank/E-Wallet': item.bankAccountNumber ? `${item.bankName} - ${item.bankAccountNumber}` : item.bankName,
            'Alur': item.flow === 'IN' ? 'Uang Masuk (+)' : 'Uang Keluar (-)',
            'Jumlah': item.amount
        }));

        const cols = [
            { wch: 20 },
            { wch: 15 },
            { wch: 22 },
            { wch: 45 },
            { wch: 25 },
            { wch: 18 },
            { wch: 15 }
        ];

        exportToExcel(data, "Riwayat_Transfer_Bank", "Riwayat Transfer", cols);
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const rows = filteredItems.map((item, idx) => `
            <tr>
                <td style="text-align:center">${idx + 1}</td>
                <td>${formatDate(item.date)}</td>
                <td>#${item.id.substring(0, 8)}</td>
                <td><strong>${item.subType}</strong></td>
                <td>${item.description}</td>
                <td>${item.bankAccountNumber ? `${item.bankName}<br/><small style="color:#666">${item.bankAccountNumber}</small>` : item.bankName}</td>
                <td style="text-align:center; font-weight:bold; color:${item.flow === 'IN' ? '#16a34a' : '#dc2626'}">${item.flow === 'IN' ? 'MASUK (+)' : 'KELUAR (-)'}</td>
                <td style="text-align:right; font-weight:bold; color:${item.flow === 'IN' ? '#16a34a' : '#dc2626'}">${formatIDR(item.amount)}</td>
            </tr>
        `).join('');

        const html = `
            <html>
                <head>
                    <title>Laporan Riwayat Transfer Bank & E-Wallet</title>
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
                    <h2>Laporan Riwayat Transfer Bank & E-Wallet</h2>
                    <p class="subtitle">Dicetak pada: ${new Date().toLocaleString('id-ID')} | Periode: ${startDate ? formatDate(startDate) : 'Semua'} - ${endDate ? formatDate(endDate) : 'Semua'}</p>
                    <table>
                        <thead>
                            <tr>
                                <th style="width:30px">No</th>
                                <th>Tanggal</th>
                                <th>ID</th>
                                <th>Tipe Kategori</th>
                                <th>Deskripsi Transaksi</th>
                                <th>Bank / E-Wallet</th>
                                <th>Alur Kas</th>
                                <th>Jumlah Total</th>
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
                        <ArrowRightLeft className="text-amber-600" />
                        Riwayat Transfer (Bank & E-Wallet)
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Lacak semua mutasi transaksi non-tunai via Transfer Bank, QRIS, dan E-Wallet</p>
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

            {/* Dashboard Summary Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Transfer Masuk (IN)</p>
                        <h3 className="text-lg font-extrabold text-emerald-600 mt-1">{formatIDR(summaryStats.totalIn)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{summaryStats.countIn} Transaksi Uang Masuk</p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                        <ArrowDownLeft size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Transfer Keluar (OUT)</p>
                        <h3 className="text-lg font-extrabold text-rose-600 mt-1">{formatIDR(summaryStats.totalOut)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{summaryStats.countOut} Transaksi Uang Keluar</p>
                    </div>
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                        <ArrowUpRight size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Net Transfer (Bersih)</p>
                        <h3 className={`text-lg font-extrabold mt-1 ${summaryStats.netTransfer >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatIDR(summaryStats.netTransfer)}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Uang Masuk - Uang Keluar</p>
                    </div>
                    <div className={`p-3 rounded-xl shrink-0 ${summaryStats.netTransfer >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        <DollarSign size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Mutasi Transfer</p>
                        <h3 className="text-lg font-extrabold text-slate-900 mt-1">{summaryStats.totalItems} <span className="text-xs font-normal text-slate-400">transaksi</span></h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{bankOptions.length} Bank / E-Wallet Terkait</p>
                    </div>
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                        <CreditCard size={22} />
                    </div>
                </div>
            </div>

            {/* Filter Bar Controls Card */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
                {/* Date Filter */}
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

                {/* Bank / E-Wallet Filter Dropdown */}
                {bankOptions.length > 0 && (
                    <div className="relative min-w-[180px]">
                        <select
                            id="bankFilter"
                            name="bankFilter"
                            className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none text-xs font-semibold text-slate-700 pr-8 appearance-none cursor-pointer"
                            value={selectedBankFilter}
                            onChange={e => setSelectedBankFilter(e.target.value)}
                        >
                            <option value="">Semua Bank / E-Wallet</option>
                            {bankOptions.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                )}

                {/* Flow Filter Dropdown (Uang Masuk / Uang Keluar) */}
                <div className="relative min-w-[150px]">
                    <select
                        id="flowFilter"
                        name="flowFilter"
                        className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none text-xs font-semibold text-slate-700 pr-8 appearance-none cursor-pointer"
                        value={flowFilter}
                        onChange={e => setFlowFilter(e.target.value as any)}
                    >
                        <option value="ALL">Semua Alur Kas</option>
                        <option value="IN">Uang Masuk (+)</option>
                        <option value="OUT">Uang Keluar (-)</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>

                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        id="searchTransfer"
                        name="searchTransfer"
                        type="text"
                        placeholder="Cari ID, faktur, deskripsi, bank, nomor rekening..."
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

            {/* Table Container */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700 text-xs flex justify-between items-center">
                    <span>Daftar Mutasi Transfer ({filteredItems.length})</span>
                    <span className="text-amber-700 font-bold">Net Selisih: {formatIDR(summaryStats.netTransfer)}</span>
                </div>
                <div className="overflow-x-auto touch-scroll">
                    <table className="w-full text-left text-xs min-w-[640px]">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-semibold">
                            <tr>
                                <th className="p-3.5">Tanggal & Ref</th>
                                <th className="p-3.5">Kategori / Tipe</th>
                                <th className="p-3.5">Deskripsi Mutasi</th>
                                <th className="p-3.5">Bank / E-Wallet</th>
                                <th className="p-3.5 text-right">Jumlah Total</th>
                                <th className="p-3.5 text-center">Aksi Nota</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-400">
                                        Tidak ada data mutasi transfer yang ditemukan.
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="p-3.5 whitespace-nowrap">
                                            <div className="font-semibold text-slate-800">{formatDate(item.date)}</div>
                                            <div className="text-[10px] font-mono text-slate-400">#{item.id.substring(0, 8)}</div>
                                        </td>
                                        <td className="p-3.5 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                item.type === 'TRANSACTION' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                                item.type === 'PURCHASE' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                                                'bg-amber-100 text-amber-800 border border-amber-200'
                                            }`}>
                                                {item.subType}
                                            </span>
                                        </td>
                                        <td className="p-3.5 text-slate-800 font-semibold max-w-xs leading-relaxed">
                                            {item.description}
                                        </td>
                                        <td className="p-3.5 whitespace-nowrap text-slate-700">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                                                    <Building2 size={16} />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800">{item.bankName}</div>
                                                    {item.bankAccountNumber && (
                                                        <div className="text-[10px] font-mono text-slate-400">{item.bankAccountNumber}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className={`p-3.5 whitespace-nowrap text-right font-extrabold text-sm ${
                                            item.flow === 'IN' ? 'text-emerald-600' : 'text-rose-600'
                                        }`}>
                                            <div className="flex items-center justify-end gap-1">
                                                {item.flow === 'IN' ? (
                                                    <span className="flex items-center gap-0.5"><ArrowDownLeft size={14} /> +</span>
                                                ) : (
                                                    <span className="flex items-center gap-0.5"><ArrowUpRight size={14} /> -</span>
                                                )}
                                                {formatIDR(item.amount)}
                                            </div>
                                        </td>
                                        <td className="p-3.5 text-center whitespace-nowrap">
                                            <button
                                                onClick={() => handleViewReceipt(item)}
                                                className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg font-semibold transition-colors inline-flex items-center gap-1 text-[11px] border border-amber-200 shadow-sm"
                                            >
                                                <FileText size={12} /> Lihat Nota
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Receipt Modal (Pop-up Lihat Nota Transfer) */}
            {selectedReceipt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-up">
                        {/* Header Modal */}
                        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <FileText className="text-amber-400" size={18} />
                                <h3 className="font-bold text-sm">Nota Transfer Bank / E-Wallet</h3>
                            </div>
                            <button
                                onClick={() => setSelectedReceipt(null)}
                                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
                            {/* Toko Info & Badge Status */}
                            <div className="text-center pb-3 border-b border-slate-200">
                                <h2 className="text-base font-extrabold text-slate-800 uppercase tracking-wide">
                                    {storeSettings?.name || 'KASIR POS TOKO'}
                                </h2>
                                <p className="text-[11px] text-slate-500">{storeSettings?.address || 'Jl. Utama No. 123'}</p>
                                <span className="inline-flex items-center gap-1 px-3 py-0.5 mt-2 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 size={12} /> TRANSFER BERHASIL ({selectedReceipt.item.flow === 'IN' ? 'UANG MASUK' : 'UANG KELUAR'})
                                </span>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Ref Mutasi</span>
                                    <span className="font-mono font-bold text-slate-800">#{selectedReceipt.item.id.substring(0, 8)}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Tanggal</span>
                                    <span className="font-medium text-slate-800">{formatDate(selectedReceipt.item.date)}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Bank / E-Wallet</span>
                                    <span className="font-bold text-slate-800">{selectedReceipt.item.bankName}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Kategori</span>
                                    <span className="font-bold text-amber-700">{selectedReceipt.item.subType}</span>
                                </div>
                            </div>

                            {/* Description Box */}
                            <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/80">
                                <span className="text-[10px] font-bold text-amber-800 uppercase block mb-0.5">Keterangan Mutasi</span>
                                <p className="text-slate-700 text-xs leading-relaxed">{selectedReceipt.item.description}</p>
                            </div>

                            {/* Items List (if associated with sale or purchase) */}
                            {selectedReceipt.transaction && selectedReceipt.transaction.items && selectedReceipt.transaction.items.length > 0 && (
                                <div>
                                    <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2">Rincian Barang Penjualan</h4>
                                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-36 overflow-y-auto">
                                        {selectedReceipt.transaction.items.map((i: any, idx: number) => (
                                            <div key={idx} className="p-2.5 flex justify-between items-center hover:bg-slate-50">
                                                <div>
                                                    <div className="font-bold text-slate-800">{i.name}</div>
                                                    <div className="text-[10px] text-slate-400">{formatIDR(i.price || i.finalPrice || 0)} x {i.qty}</div>
                                                </div>
                                                <div className="font-bold text-slate-900">{formatIDR((i.price || i.finalPrice || 0) * (i.qty || 1))}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedReceipt.purchase && selectedReceipt.purchase.items && selectedReceipt.purchase.items.length > 0 && (
                                <div>
                                    <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2">Rincian Barang Pembelian</h4>
                                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-36 overflow-y-auto">
                                        {selectedReceipt.purchase.items.map((i: any, idx: number) => (
                                            <div key={idx} className="p-2.5 flex justify-between items-center hover:bg-slate-50">
                                                <div>
                                                    <div className="font-bold text-slate-800">{i.name}</div>
                                                    <div className="text-[10px] text-slate-400">{formatIDR(i.costPrice || i.price || 0)} x {i.qty}</div>
                                                </div>
                                                <div className="font-bold text-slate-900">{formatIDR((i.costPrice || i.price || 0) * (i.qty || 1))}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Total Amount Card */}
                            <div className="p-3.5 bg-slate-900 rounded-xl text-white flex justify-between items-center">
                                <div>
                                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Nominal Transfer</span>
                                    <span className="text-xs font-semibold text-emerald-400">{selectedReceipt.item.flow === 'IN' ? 'Uang Masuk (+)' : 'Uang Keluar (-)'}</span>
                                </div>
                                <span className={`text-xl font-extrabold ${selectedReceipt.item.flow === 'IN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {formatIDR(selectedReceipt.item.amount)}
                                </span>
                            </div>
                        </div>

                        {/* Modal Footer Buttons */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-2">
                            <button
                                onClick={handlePrintReceiptModal}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-colors text-xs flex items-center gap-1.5 shadow-sm"
                            >
                                <Printer size={15} /> Cetak Nota Transfer
                            </button>
                            <button
                                onClick={() => setSelectedReceipt(null)}
                                className="px-4 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 font-bold rounded-xl transition-colors text-xs"
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
