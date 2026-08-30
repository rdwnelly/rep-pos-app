import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { formatIDR, formatDate, formatDateDateOnly, exportToCSV, exportToExcel } from '../utils';
import {
    Calculator, Calendar, Tag, TrendingDown, TrendingUp, PiggyBank, Printer,
    FileSpreadsheet, Download, ChevronLeft, ChevronRight, DollarSign,
    Layers, ArrowUpRight, ArrowDownRight, CheckCircle2, Percent,
    CreditCard, Wallet, QrCode, BarChart3, CalendarDays, Building2,
    ShieldCheck, Activity, Award
} from 'lucide-react';
import { CashFlowType, PaymentMethod, TransactionType, StoreSettings, StockAdjustment } from '../types';

export const MonthlyReport: React.FC = () => {
    // Data Loading
    const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];
    const cashFlows = useData(() => StorageService.getCashFlow(), [], 'cashflow') || [];
    const stockAdjustments = useData(() => StorageService.getStockAdjustments(), [], 'stock_adjustments') || [];
    const categories = useData(() => StorageService.getCategories(), [], 'categories') || [];
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

    useEffect(() => {
        StorageService.getStoreSettings().then(setStoreSettings).catch(console.error);
    }, []);

    // Month & Year State
    const today = new Date();
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth()); // 0-11
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());

    // Active View Tab: 'income_statement' | 'category_breakdown' | 'cash_flow' | 'daily_trend'
    const [activeTab, setActiveTab] = useState<'income_statement' | 'category_breakdown' | 'cash_flow' | 'daily_trend'>('income_statement');

    // Months Array
    const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];

    // Generate available years for dropdown
    const years = useMemo(() => {
        const y = new Set<number>([today.getFullYear()]);
        transactions.forEach(t => {
            const dt = new Date(t.date);
            if (!isNaN(dt.getFullYear())) y.add(dt.getFullYear());
        });
        cashFlows.forEach(c => {
            const dt = new Date(c.date);
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

    // Days in current selected month
    const daysInMonth = useMemo(() => {
        return new Date(selectedYear, selectedMonth + 1, 0).getDate();
    }, [selectedYear, selectedMonth]);

    // Filter Data by selected month & year
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (!t || !t.date) return false;
            const d = new Date(t.date);
            return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
        });
    }, [transactions, selectedMonth, selectedYear]);

    const filteredCashFlows = useMemo(() => {
        return cashFlows.filter(c => {
            if (!c || !c.date) return false;
            const d = new Date(c.date);
            return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
        });
    }, [cashFlows, selectedMonth, selectedYear]);

    const filteredStockAdjustments = useMemo(() => {
        return stockAdjustments.filter(a => {
            if (!a || !a.date) return false;
            const d = new Date(a.date);
            return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
        });
    }, [stockAdjustments, selectedMonth, selectedYear]);

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
                grossSales += (t.subtotal || t.totalAmount || 0);
                if (t.discountAmount) discountAmount += t.discountAmount;

                // Payment Method Split
                const amt = t.totalAmount || 0;
                if (t.paymentMethod === PaymentMethod.CASH) {
                    cashSales += amt;
                } else if (t.paymentMethod === PaymentMethod.QRIS) {
                    qrSales += amt;
                } else if (t.paymentMethod === PaymentMethod.TRANSFER) {
                    transferSales += amt;
                } else {
                    debtSales += amt;
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
    // 2. INVENTORY ADJUSTMENT / OPNAME SHRINKAGE (PENYESUAIAN STOK)
    // ========================================================
    const stockAdjustmentMetrics = useMemo(() => {
        let opnameShrinkageLoss = 0;
        let opnameSurplusGain = 0;

        filteredStockAdjustments.forEach(adj => {
            const hpp = adj.previousStock !== undefined ? 0 : 0; // HPP derived from products or nominal
            // Since StockAdjustment has qty, calculate shrinkage value
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

    // ========================================================
    // 3. OPERATING EXPENSES (BEBAN OPERASIONAL / OPEX)
    // ========================================================
    const expenseBreakdown = useMemo(() => {
        const categoriesMap: Record<string, number> = {
            'Beban Gaji & Upah': 0,
            'Beban Listrik, Air & Internet': 0,
            'Beban Operasional Kasir & Toko': 0,
            'Beban Sewa & Pemeliharaan': 0,
            'Beban Transportasi & Logistik': 0,
            'Beban Pemasaran & Promosi': 0,
            'Beban Operasional Lain-lain': 0,
        };

        filteredCashFlows.forEach(c => {
            if (c.type === CashFlowType.OUT && (!c.referenceId || c.category === 'Beban Gaji' || c.category === 'Operasional' || c.category === 'Dividen')) {
                const catLower = (c.category || '').toLowerCase();
                const descLower = (c.description || '').toLowerCase();
                const text = catLower + " " + descLower;

                if (text.includes('gaji') || text.includes('upah') || text.includes('salary') || text.includes('lembur') || text.includes('bonus')) {
                    categoriesMap['Beban Gaji & Upah'] += c.amount;
                } else if (text.includes('listrik') || text.includes('pln') || text.includes('pdam') || text.includes('air') || text.includes('internet') || text.includes('wifi') || text.includes('pulsa')) {
                    categoriesMap['Beban Listrik, Air & Internet'] += c.amount;
                } else if (text.includes('sewa') || text.includes('renovasi') || text.includes('perbaikan') || text.includes('servis') || text.includes('gedung') || text.includes('pemeliharaan')) {
                    categoriesMap['Beban Sewa & Pemeliharaan'] += c.amount;
                } else if (text.includes('bensin') || text.includes('transport') || text.includes('bbm') || text.includes('ongkir') || text.includes('kurir') || text.includes('ekspedisi')) {
                    categoriesMap['Beban Transportasi & Logistik'] += c.amount;
                } else if (text.includes('iklan') || text.includes('promo') || text.includes('ads') || text.includes('brosur') || text.includes('marketing')) {
                    categoriesMap['Beban Pemasaran & Promosi'] += c.amount;
                } else if (text.includes('operasional') || text.includes('atk') || text.includes('plastik') || text.includes('kresek') || text.includes('kertas') || text.includes('kebersihan')) {
                    categoriesMap['Beban Operasional Kasir & Toko'] += c.amount;
                } else {
                    categoriesMap['Beban Operasional Lain-lain'] += c.amount;
                }
            }
        });

        const list = Object.entries(categoriesMap).map(([name, amount]) => ({ name, amount }));
        const totalOperatingExpenses = list.reduce((sum, item) => sum + item.amount, 0);

        return {
            list,
            totalOperatingExpenses
        };
    }, [filteredCashFlows]);

    // Operating Profit (Laba Usaha Operasional / EBIT)
    const operatingProfit = grossProfit - expenseBreakdown.totalOperatingExpenses;
    const operatingProfitMargin = salesMetrics.netSales > 0 ? (operatingProfit / salesMetrics.netSales) * 100 : 0;

    // ========================================================
    // 4. NON-OPERATING INCOME & EXPENSES (NON-OPERASIONAL)
    // ========================================================
    const nonOperatingMetrics = useMemo(() => {
        let otherIncome = 0;
        let otherExpense = 0;

        filteredCashFlows.forEach(c => {
            if (c.type === CashFlowType.IN && !c.referenceId) {
                // Cashflow Masuk non-penjualan (misal pendapatan bunga, titipan, penerimaan lain)
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
    // 5. CATEGORY PERFORMANCE BREAKDOWN
    // ========================================================
    const categoryMetrics = useMemo(() => {
        const catMap: Record<string, {
            revenue: number;
            hpp: number;
            itemsSold: number;
            txCount: number;
        }> = {};

        filteredTransactions.forEach(t => {
            if (t.type === TransactionType.RETURN) return;
            const seenCat = new Set<string>();

            t.items.forEach(item => {
                const catName = item.categoryName || 'Tanpa Kategori';
                if (!catMap[catName]) {
                    catMap[catName] = { revenue: 0, hpp: 0, itemsSold: 0, txCount: 0 };
                }
                catMap[catName].revenue += (item.finalPrice * item.qty);
                catMap[catName].hpp += ((item.hpp || 0) * item.qty);
                catMap[catName].itemsSold += item.qty;
                seenCat.add(catName);
            });

            seenCat.forEach(cat => {
                if (catMap[cat]) catMap[cat].txCount += 1;
            });
        });

        const totalRev = salesMetrics.grossSales || 1;

        return Object.entries(catMap)
            .map(([name, vals]) => {
                const grossProfit = vals.revenue - vals.hpp;
                const marginPercent = vals.revenue > 0 ? (grossProfit / vals.revenue) * 100 : 0;
                const sharePercent = (vals.revenue / totalRev) * 100;
                return {
                    name,
                    revenue: vals.revenue,
                    hpp: vals.hpp,
                    grossProfit,
                    marginPercent,
                    sharePercent,
                    itemsSold: vals.itemsSold,
                    txCount: vals.txCount
                };
            })
            .sort((a, b) => b.revenue - a.revenue);
    }, [filteredTransactions, salesMetrics.grossSales]);

    // ========================================================
    // 6. DAILY PERFORMANCE BREAKDOWN (TREN HARIAN)
    // ========================================================
    const dailyMetrics = useMemo(() => {
        const daysArray: {
            dayNum: number;
            dateStr: string;
            dayName: string;
            txCount: number;
            cashRevenue: number;
            nonCashRevenue: number;
            totalRevenue: number;
            totalHpp: number;
            expenses: number;
            netProfit: number;
        }[] = [];

        let bestDaySales = 0;
        let bestDayDate = '';

        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(selectedYear, selectedMonth, d);
            const dateKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });

            let txCount = 0;
            let cashRevenue = 0;
            let nonCashRevenue = 0;
            let totalRevenue = 0;
            let totalHpp = 0;
            let expenses = 0;

            // Transactions for day d
            filteredTransactions.forEach(t => {
                const tDate = new Date(t.date);
                if (tDate.getDate() === d) {
                    if (t.type === TransactionType.RETURN) {
                        totalRevenue -= Math.abs(t.totalAmount || 0);
                    } else {
                        txCount++;
                        const amt = t.totalAmount || 0;
                        if (t.paymentMethod === PaymentMethod.CASH) {
                            cashRevenue += amt;
                        } else {
                            nonCashRevenue += amt;
                        }
                        totalRevenue += amt;

                        t.items.forEach(item => {
                            totalHpp += (item.hpp || 0) * item.qty;
                        });
                    }
                }
            });

            // Cashflow out for day d
            filteredCashFlows.forEach(c => {
                const cDate = new Date(c.date);
                if (cDate.getDate() === d && c.type === CashFlowType.OUT && (!c.referenceId || c.category === 'Operasional' || c.category === 'Beban Gaji')) {
                    expenses += c.amount;
                }
            });

            const dayNetProfit = totalRevenue - totalHpp - expenses;

            if (totalRevenue > bestDaySales) {
                bestDaySales = totalRevenue;
                bestDayDate = `${dayName}, ${d} ${months[selectedMonth]}`;
            }

            daysArray.push({
                dayNum: d,
                dateStr: dateKey,
                dayName,
                txCount,
                cashRevenue,
                nonCashRevenue,
                totalRevenue,
                totalHpp,
                expenses,
                netProfit: dayNetProfit
            });
        }

        const activeDaysCount = daysArray.filter(day => day.totalRevenue > 0).length || 1;
        const avgDailySales = salesMetrics.netSales / (activeDaysCount || 1);

        return {
            daysArray,
            bestDaySales,
            bestDayDate,
            avgDailySales,
            activeDaysCount
        };
    }, [daysInMonth, selectedYear, selectedMonth, filteredTransactions, filteredCashFlows, salesMetrics.netSales]);

    // ========================================================
    // 7. PRINT & EXPORT ACTIONS
    // ========================================================
    const handlePrint = () => {
        window.print();
    };

    const handleExportExcel = () => {
        const incomeStatementData = [
            { 'Komponen Keuangan': 'I. PENDAPATAN USAHA (REVENUE)', 'Jumlah (Rp)': '', 'Persentase (%)': '' },
            { 'Komponen Keuangan': '  Penjualan Kotor (Gross Sales)', 'Jumlah (Rp)': salesMetrics.grossSales, 'Persentase (%)': '100%' },
            { 'Komponen Keuangan': '  (-) Retur Penjualan (Sales Return)', 'Jumlah (Rp)': -salesMetrics.returnsAmount, 'Persentase (%)': '' },
            { 'Komponen Keuangan': '  (-) Diskon Penjualan (Discounts)', 'Jumlah (Rp)': -salesMetrics.discountAmount, 'Persentase (%)': '' },
            { 'Komponen Keuangan': 'PENJUALAN BERSIH (NET REVENUE)', 'Jumlah (Rp)': salesMetrics.netSales, 'Persentase (%)': '100%' },
            { 'Komponen Keuangan': '', 'Jumlah (Rp)': '', 'Persentase (%)': '' },
            { 'Komponen Keuangan': 'II. HARGA POKOK PENJUALAN (HPP / COGS)', 'Jumlah (Rp)': '', 'Persentase (%)': '' },
            { 'Komponen Keuangan': '  Harga Pokok Barang Terjual', 'Jumlah (Rp)': salesMetrics.totalHppCost, 'Persentase (%)': '' },
            { 'Komponen Keuangan': '  Penyesuaian Stok Opname / Shrinkage', 'Jumlah (Rp)': stockAdjustmentMetrics.netInventoryAdjustment, 'Persentase (%)': '' },
            { 'Komponen Keuangan': 'TOTAL HARGA POKOK PENJUALAN', 'Jumlah (Rp)': totalCOGS, 'Persentase (%)': `${((totalCOGS / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%` },
            { 'Komponen Keuangan': '', 'Jumlah (Rp)': '', 'Persentase (%)': '' },
            { 'Komponen Keuangan': 'III. LABA KOTOR (GROSS PROFIT)', 'Jumlah (Rp)': grossProfit, 'Persentase (%)': `${grossProfitMargin.toFixed(1)}%` },
            { 'Komponen Keuangan': '', 'Jumlah (Rp)': '', 'Persentase (%)': '' },
            { 'Komponen Keuangan': 'IV. BEBAN OPERASIONAL (OPEX)', 'Jumlah (Rp)': '', 'Persentase (%)': '' },
            ...expenseBreakdown.list.map(exp => ({
                'Komponen Keuangan': `  ${exp.name}`,
                'Jumlah (Rp)': exp.amount,
                'Persentase (%)': `${((exp.amount / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%`
            })),
            { 'Komponen Keuangan': 'TOTAL BEBAN OPERASIONAL', 'Jumlah (Rp)': expenseBreakdown.totalOperatingExpenses, 'Persentase (%)': `${((expenseBreakdown.totalOperatingExpenses / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%` },
            { 'Komponen Keuangan': '', 'Jumlah (Rp)': '', 'Persentase (%)': '' },
            { 'Komponen Keuangan': 'V. LABA USAHA OPERASIONAL (EBIT)', 'Jumlah (Rp)': operatingProfit, 'Persentase (%)': `${operatingProfitMargin.toFixed(1)}%` },
            { 'Komponen Keuangan': '', 'Jumlah (Rp)': '', 'Persentase (%)': '' },
            { 'Komponen Keuangan': 'VI. PENDAPATAN & BEBAN LAIN-LAIN', 'Jumlah (Rp)': '', 'Persentase (%)': '' },
            { 'Komponen Keuangan': '  Pendapatan Lain-lain (Non-Sales)', 'Jumlah (Rp)': nonOperatingMetrics.otherIncome, 'Persentase (%)': '' },
            { 'Komponen Keuangan': '  Beban Lain-lain / Dividen', 'Jumlah (Rp)': -nonOperatingMetrics.otherExpense, 'Persentase (%)': '' },
            { 'Komponen Keuangan': '', 'Jumlah (Rp)': '', 'Persentase (%)': '' },
            { 'Komponen Keuangan': 'VII. LABA BERSIH BULANAN (NET PROFIT)', 'Jumlah (Rp)': netProfit, 'Persentase (%)': `${netProfitMargin.toFixed(1)}%` }
        ];

        exportToExcel(
            incomeStatementData,
            `Laporan_Keuangan_Bulanan_${months[selectedMonth]}_${selectedYear}`,
            'Laba Rugi',
            [{ wch: 45 }, { wch: 20 }, { wch: 15 }]
        );
    };

    const handleExportCSV = () => {
        const headers = ['Komponen Keuangan', 'Jumlah (Rp)', 'Persentase (%)'];
        const rows = [
            ['Penjualan Kotor (Gross Sales)', salesMetrics.grossSales, '100%'],
            ['Retur Penjualan', -salesMetrics.returnsAmount, ''],
            ['Diskon Penjualan', -salesMetrics.discountAmount, ''],
            ['PENJUALAN BERSIH', salesMetrics.netSales, '100%'],
            ['HPP Barang Terjual', salesMetrics.totalHppCost, ''],
            ['Penyesuaian Stok Opname', stockAdjustmentMetrics.netInventoryAdjustment, ''],
            ['TOTAL HPP', totalCOGS, `${((totalCOGS / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%`],
            ['LABA KOTOR', grossProfit, `${grossProfitMargin.toFixed(1)}%`],
            ['TOTAL BEBAN OPERASIONAL', expenseBreakdown.totalOperatingExpenses, `${((expenseBreakdown.totalOperatingExpenses / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%`],
            ['LABA USAHA OPERASIONAL', operatingProfit, `${operatingProfitMargin.toFixed(1)}%`],
            ['LABA BERSIH BULANAN', netProfit, `${netProfitMargin.toFixed(1)}%`]
        ];

        exportToCSV(`laporan-keuangan-${months[selectedMonth]}-${selectedYear}.csv`, headers, rows);
    };

    return (
        <div className="space-y-6 animate-fade-in print:bg-white print:p-0 p-2 md:p-0">
            {/* Top Title & Period Selector Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4 print:hidden">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5 tracking-tight">
                        <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-600/20">
                            <Building2 size={22} />
                        </div>
                        Laporan Keuangan Bulanan (Financial Statement)
                    </h1>
                    <p className="text-slate-500 text-xs sm:text-sm mt-1">
                        Laporan Laba Rugi resmi (Multi-Step), rincian HPP, kontribusi kategori, dan arus kas bulanan sesuai standar akuntansi
                    </p>
                </div>

                {/* Period Selector & Action Toolbar */}
                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                    {/* Month Year Navigator Box */}
                    <div className="flex items-center bg-white border border-slate-300 rounded-xl p-1 shadow-xs">
                        <button
                            type="button"
                            onClick={handlePrevMonth}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Bulan Sebelumnya"
                        >
                            <ChevronLeft size={16} />
                        </button>

                        <div className="flex items-center gap-1 px-2">
                            <Calendar size={14} className="text-emerald-600" />
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
                            title="Bulan Berikutnya"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {/* Print & Export Buttons */}
                    <button
                        onClick={handlePrint}
                        className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                    >
                        <Printer size={15} className="text-slate-600" /> Cetak Laporan
                    </button>
                    <button
                        onClick={handleExportExcel}
                        className="px-3.5 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                    >
                        <FileSpreadsheet size={15} className="text-emerald-700" /> Excel
                    </button>
                </div>
            </div>

            {/* Print Only Official Document Header */}
            <div className="hidden print:block text-center mb-6 border-b-2 border-slate-900 pb-4">
                <h1 className="text-xl font-black uppercase tracking-wider text-slate-900">{storeSettings?.name || 'RUMAH ETNIK PAPUA'}</h1>
                <p className="text-xs text-slate-600">{storeSettings?.address || ''} • Telp: {storeSettings?.phone || ''}</p>
                <div className="mt-3">
                    <h2 className="text-base font-extrabold uppercase tracking-wide text-slate-800">LAPORAN KEUANGAN BULANAN (LABA RUGI)</h2>
                    <p className="text-xs font-bold text-slate-500">Periode: 1 {months[selectedMonth]} s/d {daysInMonth} {months[selectedMonth]} {selectedYear}</p>
                </div>
            </div>

            {/* Executive KPI Metric Cards Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 print:hidden">
                {/* 1. Net Revenue */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Penjualan Bersih (Omzet)</p>
                        <h3 className="text-xl font-black text-slate-900 mt-1 font-mono">{formatIDR(salesMetrics.netSales)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{salesMetrics.totalTransactionsCount} transaksi • {salesMetrics.totalItemsSold} unit</p>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                        <TrendingUp size={22} />
                    </div>
                </div>

                {/* 2. Gross Profit */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-1.5">
                            <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Laba Kotor (Gross Profit)</p>
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded">
                                {grossProfitMargin.toFixed(1)}%
                            </span>
                        </div>
                        <h3 className="text-xl font-black text-emerald-600 mt-1 font-mono">{formatIDR(grossProfit)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Total HPP: {formatIDR(totalCOGS)}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                        <Percent size={22} />
                    </div>
                </div>

                {/* 3. Operating Expenses */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Beban Operasional (Opex)</p>
                        <h3 className="text-xl font-black text-rose-600 mt-1 font-mono">{formatIDR(expenseBreakdown.totalOperatingExpenses)}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Rasio Beban: {((expenseBreakdown.totalOperatingExpenses / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%</p>
                    </div>
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                        <TrendingDown size={22} />
                    </div>
                </div>

                {/* 4. Net Profit */}
                <div className="bg-gradient-to-br from-emerald-700 to-teal-800 p-4 rounded-2xl border border-emerald-600 shadow-md shadow-emerald-700/20 text-white flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-1.5 text-emerald-100">
                            <p className="text-[11px] font-extrabold uppercase tracking-wider">Laba Bersih (Net Income)</p>
                            <span className="bg-white/20 text-white text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded">
                                {netProfitMargin.toFixed(1)}%
                            </span>
                        </div>
                        <h3 className="text-2xl font-black mt-1 font-mono text-white">{formatIDR(netProfit)}</h3>
                        <p className="text-[11px] text-emerald-200 mt-0.5">Laba bersih masuk kas perusahaan</p>
                    </div>
                    <div className="p-3 bg-white/15 rounded-xl shrink-0 text-white">
                        <PiggyBank size={24} />
                    </div>
                </div>
            </div>

            {/* Navigation Tab Bar for Financial Views */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:border-none print:shadow-none">
                <div className="p-3.5 bg-slate-100/80 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3 print:hidden">
                    <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                        <button
                            type="button"
                            onClick={() => setActiveTab('income_statement')}
                            className={`px-3.5 py-2 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'income_statement'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                        >
                            <Calculator size={14} />
                            1. Laporan Laba Rugi (Income Statement)
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('category_breakdown')}
                            className={`px-3.5 py-2 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'category_breakdown'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                        >
                            <Tag size={14} />
                            2. Kinerja per Kategori & Margin
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('cash_flow')}
                            className={`px-3.5 py-2 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'cash_flow'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                        >
                            <Wallet size={14} />
                            3. Rincian Arus Kas (Cash Flow)
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('daily_trend')}
                            className={`px-3.5 py-2 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'daily_trend'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                        >
                            <CalendarDays size={14} />
                            4. Rekap Harian Kalender
                        </button>
                    </div>

                    <div className="text-xs font-semibold text-slate-500 font-mono">
                        Periode: {months[selectedMonth]} {selectedYear}
                    </div>
                </div>

                {/* ======================================================== */}
                {/* TAB 1: STANDAR LAPORAN LABA RUGI (INCOME STATEMENT) */}
                {/* ======================================================== */}
                {(activeTab === 'income_statement' || typeof window !== 'undefined') && (
                    <div className={`p-6 space-y-6 ${activeTab !== 'income_statement' ? 'hidden print:block' : ''}`}>
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
                                    {expenseBreakdown.list.map(exp => (
                                        <tr key={exp.name}>
                                            <td className="p-2.5 pl-6 text-slate-700">{exp.name}</td>
                                            <td className="p-2.5 text-right font-mono text-slate-800">{formatIDR(exp.amount)}</td>
                                            <td className="p-2.5 text-right font-mono text-slate-500">
                                                {((exp.amount / (salesMetrics.netSales || 1)) * 100).toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
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
                                    <tr className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-black text-sm border-t-2 border-emerald-800">
                                        <td className="p-4 uppercase tracking-wide">VII. LABA BERSIH BULANAN (NET PROFIT / INCOME)</td>
                                        <td className="p-4 text-right font-mono text-white text-base">{formatIDR(netProfit)}</td>
                                        <td className="p-4 text-right font-mono text-white text-base">{netProfitMargin.toFixed(1)}%</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Signatures for Print and Audit */}
                        <div className="hidden print:grid grid-cols-3 gap-6 text-center mt-12 pt-6 text-xs border-t border-slate-300">
                            <div>
                                <p className="font-bold text-slate-700">Disiapkan Oleh:</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Staf Keuangan / Kasir</p>
                                <div className="border-t border-slate-400 mt-16 pt-1 font-bold text-slate-800">( .................................................... )</div>
                            </div>
                            <div>
                                <p className="font-bold text-slate-700">Diperiksa Oleh:</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Supervisor / Kepala Toko</p>
                                <div className="border-t border-slate-400 mt-16 pt-1 font-bold text-slate-800">( .................................................... )</div>
                            </div>
                            <div>
                                <p className="font-bold text-slate-700">Disetujui Oleh:</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Pemilik / Direktur</p>
                                <div className="border-t border-slate-400 mt-16 pt-1 font-bold text-slate-800">( .................................................... )</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* TAB 2: KINERJA PENJUALAN PER KATEGORI & MARGIN */}
                {/* ======================================================== */}
                {activeTab === 'category_breakdown' && (
                    <div className="p-6 space-y-4">
                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <span className="text-xs font-bold text-slate-700">Total Kategori Aktif: {categoryMetrics.length} Kategori</span>
                            <span className="text-xs font-mono font-bold text-emerald-700">Total Omzet: {formatIDR(salesMetrics.grossSales)}</span>
                        </div>

                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase tracking-wider border-b border-slate-200">
                                        <tr>
                                            <th className="p-3 text-center w-12">No</th>
                                            <th className="p-3 min-w-[180px]">Nama Kategori</th>
                                            <th className="p-3 text-center w-24">Unit Terjual</th>
                                            <th className="p-3 text-right w-32">Total Omzet</th>
                                            <th className="p-3 text-right w-32">Total HPP</th>
                                            <th className="p-3 text-right w-32 text-emerald-800">Laba Kotor</th>
                                            <th className="p-3 text-center w-28">Margin (%)</th>
                                            <th className="p-3 min-w-[140px]">Kontribusi Omzet</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {categoryMetrics.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                                                    Belum ada transaksi penjualan pada bulan ini.
                                                </td>
                                            </tr>
                                        ) : categoryMetrics.map((cat, idx) => (
                                            <tr key={cat.name} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                                <td className="p-3">
                                                    <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                                                        <Tag size={13} className="text-emerald-600 shrink-0" />
                                                        {cat.name}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-mono">{cat.txCount} kali transaksi</div>
                                                </td>
                                                <td className="p-3 text-center font-mono font-bold text-slate-700">{cat.itemsSold}</td>
                                                <td className="p-3 text-right font-mono font-extrabold text-slate-900">{formatIDR(cat.revenue)}</td>
                                                <td className="p-3 text-right font-mono text-rose-600 font-bold">{formatIDR(cat.hpp)}</td>
                                                <td className="p-3 text-right font-mono font-extrabold text-emerald-600">{formatIDR(cat.grossProfit)}</td>
                                                <td className="p-3 text-center font-mono">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${cat.marginPercent >= 30 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                        {cat.marginPercent.toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-[10px] font-mono text-slate-500">
                                                            <span>Pangsa</span>
                                                            <strong className="text-slate-800">{cat.sharePercent.toFixed(1)}%</strong>
                                                        </div>
                                                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(100, cat.sharePercent)}%` }}></div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* TAB 3: RINCIAN ARUS KAS BULANAN (CASH FLOW STATEMENT) */}
                {/* ======================================================== */}
                {activeTab === 'cash_flow' && (
                    <div className="p-6 space-y-6">
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
                                    <p className="text-[11px] font-bold text-slate-500 uppercase">Total Arus Kas Keluar</p>
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

                        {/* Payment Methods Breakdown */}
                        <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="p-4 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-800 text-xs flex items-center gap-2">
                                <CreditCard size={16} className="text-slate-600" />
                                Rincian Penerimaan Penjualan Berdasarkan Metode Pembayaran
                            </div>
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Tunai (Cash Fisik)</span>
                                    <p className="text-base font-black text-slate-800 font-mono mt-1">{formatIDR(salesMetrics.cashSales)}</p>
                                </div>
                                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">QRIS / Digital</span>
                                    <p className="text-base font-black text-purple-700 font-mono mt-1">{formatIDR(salesMetrics.qrSales)}</p>
                                </div>
                                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Transfer Bank</span>
                                    <p className="text-base font-black text-blue-700 font-mono mt-1">{formatIDR(salesMetrics.transferSales)}</p>
                                </div>
                                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Tempo / Bon (Piutang)</span>
                                    <p className="text-base font-black text-amber-700 font-mono mt-1">{formatIDR(salesMetrics.debtSales)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* TAB 4: REKAPITULASI KALENDER & TREN HARIAN */}
                {/* ======================================================== */}
                {activeTab === 'daily_trend' && (
                    <div className="p-6 space-y-4">
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
                                <span className="text-[10px] font-bold text-blue-800 uppercase">Total Hari dalam Bulan</span>
                                <p className="text-lg font-black text-blue-950 font-mono mt-1">{daysInMonth} Hari</p>
                                <span className="text-[10px] text-blue-700">{months[selectedMonth]} {selectedYear}</span>
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
                                            <th className="p-3 text-right w-32 bg-emerald-50/50">Total Omzet</th>
                                            <th className="p-3 text-right w-28 text-rose-600">HPP Modal</th>
                                            <th className="p-3 text-right w-28 text-rose-700">Pengeluaran</th>
                                            <th className="p-3 text-right w-32 font-black text-emerald-800">Laba Harian</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {dailyMetrics.daysArray.map(day => (
                                            <tr key={day.dayNum} className={`hover:bg-slate-50/80 transition-colors ${day.totalRevenue > 0 ? '' : 'text-slate-300 opacity-60'}`}>
                                                <td className="p-2.5 text-center font-mono font-bold text-slate-600">{day.dayNum}</td>
                                                <td className="p-2.5 font-bold text-slate-800">{day.dayName}</td>
                                                <td className="p-2.5 text-center font-mono">{day.txCount || '-'}</td>
                                                <td className="p-2.5 text-right font-mono text-slate-700">{day.cashRevenue > 0 ? formatIDR(day.cashRevenue) : '-'}</td>
                                                <td className="p-2.5 text-right font-mono text-purple-700">{day.nonCashRevenue > 0 ? formatIDR(day.nonCashRevenue) : '-'}</td>
                                                <td className="p-2.5 text-right font-mono font-extrabold text-slate-900 bg-emerald-50/30">{day.totalRevenue > 0 ? formatIDR(day.totalRevenue) : '-'}</td>
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
        </div>
    );
};
