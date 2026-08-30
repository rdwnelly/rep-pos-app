import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, AreaChart, Area
} from 'recharts';
import {
  LayoutDashboard, TrendingUp, TrendingDown, Wallet, AlertCircle, Package,
  RefreshCw, Calendar, CalendarDays, Printer, Brain, CreditCard, ShoppingBag,
  DollarSign, Percent, Clock, ArrowUpRight, FileSpreadsheet, Download,
  Layers, ChevronLeft, ChevronRight, Sparkles, AlertTriangle, CheckCircle2,
  User as UserIcon, Store, Activity, ArrowRight, Filter
} from 'lucide-react';
import { StorageService } from '../services/storage';
import { getBusinessInsights } from '../services/geminiService';
import { formatIDR, exportToExcel, exportToCSV, formatDate } from '../utils';
import { generatePrintDashboard } from '../utils/printHelpers';
import { Transaction, Product, CartItem, User, TransactionType, PaymentMethod, PaymentStatus, StoreSettings } from '../types';
import { useData } from '../hooks/useData';

export const Dashboard: React.FC = () => {
  // Data Fetching
  const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];
  const products = useData(() => StorageService.getProducts(), [], 'products') || [];
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  useEffect(() => {
    StorageService.getStoreSettings().then(setStoreSettings).catch(console.error);
  }, []);

  // UI & Filter States
  const [timeFilter, setTimeFilter] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'>('daily');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [customStartDate, setCustomStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(now);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    return start;
  });

  // AI & Interactive States
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Load user
  useEffect(() => {
    const userStr = localStorage.getItem('pos_current_user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true);
    setLastRefreshed(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Sync selectedWeekStart when Month/Year changes in Weekly view
  useEffect(() => {
    if (timeFilter === 'weekly') {
      const firstDay = new Date(selectedYear, selectedMonth, 1);
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0);

      const validStarts: number[] = [];
      const firstDayDay = firstDay.getDay() || 7;
      const iterDate = new Date(firstDay);
      iterDate.setDate(firstDay.getDate() - (firstDayDay - 1));
      iterDate.setHours(0, 0, 0, 0);

      while (iterDate <= lastDay) {
        validStarts.push(iterDate.getTime());
        iterDate.setDate(iterDate.getDate() + 7);
      }

      const currentMilli = new Date(selectedWeekStart).setHours(0, 0, 0, 0);
      const isValid = validStarts.some(t => Math.abs(t - currentMilli) < 1000 * 60 * 60 * 12);

      if (!isValid && validStarts.length > 0) {
        setSelectedWeekStart(new Date(validStarts[0]));
      }
    }
  }, [selectedMonth, selectedYear, timeFilter, selectedWeekStart]);

  // ========================================================
  // 1. DATA FILTERING & TIME SCOPE
  // ========================================================
  const filteredTxs = useMemo(() => {
    let startTime = new Date().getTime();
    let endTime = new Date().getTime();

    if (timeFilter === 'daily') {
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      startTime = start.getTime();

      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);
      endTime = end.getTime();
    } else if (timeFilter === 'weekly') {
      startTime = selectedWeekStart.getTime();
      const end = new Date(selectedWeekStart);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      endTime = end.getTime();
    } else if (timeFilter === 'monthly') {
      const start = new Date(selectedYear, selectedMonth, 1);
      start.setHours(0, 0, 0, 0);
      startTime = start.getTime();

      const end = new Date(selectedYear, selectedMonth + 1, 0);
      end.setHours(23, 59, 59, 999);
      endTime = end.getTime();
    } else if (timeFilter === 'yearly') {
      const start = new Date(selectedYear, 0, 1);
      start.setHours(0, 0, 0, 0);
      startTime = start.getTime();

      const end = new Date(selectedYear, 11, 31, 23, 59, 59);
      endTime = end.getTime();
    } else if (timeFilter === 'custom') {
      const start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      startTime = start.getTime();

      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      endTime = end.getTime();
    }

    return transactions.filter(t => {
      if (!t || !t.date) return false;
      const tTime = new Date(t.date).getTime();
      return tTime >= startTime && tTime <= endTime;
    });
  }, [transactions, timeFilter, selectedDate, selectedWeekStart, selectedMonth, selectedYear, customStartDate, customEndDate]);

  // ========================================================
  // 2. CORE FINANCIAL & OPERATIONAL KPIS
  // ========================================================
  const kpiMetrics = useMemo(() => {
    let grossSales = 0;
    let returnsAmount = 0;
    let totalHppCost = 0;
    let totalItemsSold = 0;
    let cashSales = 0;
    let qrSales = 0;
    let transferSales = 0;
    let debtSales = 0;

    filteredTxs.forEach(t => {
      if (t.type === TransactionType.RETURN) {
        returnsAmount += Math.abs(t.totalAmount || 0);
      } else {
        grossSales += (t.totalAmount || 0);

        const amt = t.totalAmount || 0;
        if (t.paymentMethod === PaymentMethod.CASH) cashSales += amt;
        else if (t.paymentMethod === PaymentMethod.QRIS) qrSales += amt;
        else if (t.paymentMethod === PaymentMethod.TRANSFER) transferSales += amt;
        else debtSales += amt;

        if (Array.isArray(t.items)) {
          t.items.forEach(item => {
            totalItemsSold += item.qty;
            totalHppCost += ((item.hpp || 0) * item.qty);
          });
        }
      }
    });

    const netRevenue = grossSales - returnsAmount;
    const grossProfit = netRevenue - totalHppCost;
    const grossProfitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
    const avgBasketSize = filteredTxs.length > 0 ? netRevenue / filteredTxs.length : 0;

    return {
      grossSales,
      returnsAmount,
      netRevenue,
      totalHppCost,
      grossProfit,
      grossProfitMargin,
      avgBasketSize,
      totalItemsSold,
      totalTransactions: filteredTxs.length,
      cashSales,
      qrSales,
      transferSales,
      debtSales
    };
  }, [filteredTxs]);

  // Unpaid Receivables (Piutang)
  const totalReceivables = useMemo(() => {
    const endOfSelectedYear = new Date(selectedYear, 11, 31, 23, 59, 59).getTime();
    return transactions
      .filter(t => {
        const txTime = new Date(t.date).getTime();
        return t.paymentStatus !== PaymentStatus.PAID && txTime <= endOfSelectedYear;
      })
      .reduce((sum, t) => sum + (t.totalAmount - (t.amountPaid || 0)), 0);
  }, [transactions, selectedYear]);

  // Low Stock Items (< 10)
  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.stock < 10).sort((a, b) => a.stock - b.stock);
  }, [products]);

  // ========================================================
  // 3. CHART DATA GENERATION
  // ========================================================

  // Revenue & Profit Trend Chart
  const revenueTrendData = useMemo(() => {
    if (timeFilter === 'daily') {
      const data = Array.from({ length: 24 }, (_, i) => ({
        name: `${String(i).padStart(2, '0')}:00`,
        omzet: 0,
        laba: 0
      }));
      filteredTxs.forEach(t => {
        const hour = new Date(t.date).getHours();
        const amt = t.type === TransactionType.RETURN ? -Math.abs(t.totalAmount) : t.totalAmount;
        const hpp = t.items.reduce((s, it) => s + ((it.hpp || 0) * it.qty), 0);
        data[hour].omzet += amt;
        data[hour].laba += (amt - (t.type === TransactionType.RETURN ? -hpp : hpp));
      });
      return data;
    } else if (timeFilter === 'weekly') {
      const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
      const data = days.map(d => ({ name: d, omzet: 0, laba: 0 }));

      filteredTxs.forEach(t => {
        const day = new Date(t.date).getDay();
        const adjustedIdx = day === 0 ? 6 : day - 1; // Mon = 0, Sun = 6
        const amt = t.type === TransactionType.RETURN ? -Math.abs(t.totalAmount) : t.totalAmount;
        const hpp = t.items.reduce((s, it) => s + ((it.hpp || 0) * it.qty), 0);
        data[adjustedIdx].omzet += amt;
        data[adjustedIdx].laba += (amt - (t.type === TransactionType.RETURN ? -hpp : hpp));
      });
      return data;
    } else if (timeFilter === 'monthly') {
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const data = Array.from({ length: daysInMonth }, (_, i) => ({
        name: `${i + 1}`,
        omzet: 0,
        laba: 0
      }));

      filteredTxs.forEach(t => {
        const date = new Date(t.date).getDate();
        if (date <= daysInMonth) {
          const amt = t.type === TransactionType.RETURN ? -Math.abs(t.totalAmount) : t.totalAmount;
          const hpp = t.items.reduce((s, it) => s + ((it.hpp || 0) * it.qty), 0);
          data[date - 1].omzet += amt;
          data[date - 1].laba += (amt - (t.type === TransactionType.RETURN ? -hpp : hpp));
        }
      });
      return data;
    } else {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const data = monthNames.map(m => ({ name: m, omzet: 0, laba: 0 }));

      filteredTxs.forEach(t => {
        const month = new Date(t.date).getMonth();
        const amt = t.type === TransactionType.RETURN ? -Math.abs(t.totalAmount) : t.totalAmount;
        const hpp = t.items.reduce((s, it) => s + ((it.hpp || 0) * it.qty), 0);
        data[month].omzet += amt;
        data[month].laba += (amt - (t.type === TransactionType.RETURN ? -hpp : hpp));
      });
      return data;
    }
  }, [filteredTxs, timeFilter, selectedYear, selectedMonth]);

  // Hourly Traffic / Peak Hours Distribution (24 Hours)
  const hourlyTrafficData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      txCount: 0,
      revenue: 0
    }));

    filteredTxs.forEach(t => {
      if (t.type !== TransactionType.RETURN) {
        const hr = new Date(t.date).getHours();
        hours[hr].txCount += 1;
        hours[hr].revenue += t.totalAmount;
      }
    });

    return hours;
  }, [filteredTxs]);

  // Payment Method Breakdown
  const paymentMethodData = useMemo(() => {
    const total = kpiMetrics.netRevenue || 1;
    return [
      { name: 'Tunai (Cash)', value: kpiMetrics.cashSales, color: '#059669', share: (kpiMetrics.cashSales / total) * 100 },
      { name: 'QRIS / Digital', value: kpiMetrics.qrSales, color: '#7c3aed', share: (kpiMetrics.qrSales / total) * 100 },
      { name: 'Transfer Bank', value: kpiMetrics.transferSales, color: '#2563eb', share: (kpiMetrics.transferSales / total) * 100 },
      { name: 'Tempo / Piutang', value: kpiMetrics.debtSales, color: '#d97706', share: (kpiMetrics.debtSales / total) * 100 },
    ].filter(item => item.value > 0);
  }, [kpiMetrics]);

  // Top 5 Best Selling Products
  const topProductsData = useMemo(() => {
    const itemMap = new Map<string, { qty: number; revenue: number }>();
    filteredTxs.forEach(tx => {
      if (tx.type === TransactionType.RETURN) return;
      tx.items.forEach(item => {
        const curr = itemMap.get(item.name) || { qty: 0, revenue: 0 };
        itemMap.set(item.name, {
          qty: curr.qty + item.qty,
          revenue: curr.revenue + (item.finalPrice * item.qty)
        });
      });
    });

    return Array.from(itemMap.entries())
      .map(([name, vals]) => ({ name, qty: vals.qty, revenue: vals.revenue }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [filteredTxs]);

  // Category Revenue Performance
  const categoryPerformanceData = useMemo(() => {
    const catMap = new Map<string, number>();
    filteredTxs.forEach(tx => {
      if (tx.type === TransactionType.RETURN) return;
      tx.items.forEach(item => {
        const catName = item.categoryName || 'Lainnya';
        const curr = catMap.get(catName) || 0;
        catMap.set(catName, curr + (item.finalPrice * item.qty));
      });
    });

    const totalRev = kpiMetrics.netRevenue || 1;
    return Array.from(catMap.entries())
      .map(([name, value]) => ({
        name,
        value,
        share: (value / totalRev) * 100
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTxs, kpiMetrics.netRevenue]);

  // Monthly Revenue for Yearly View
  const monthlyRevenueData = useMemo(() => {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return months.map((month, index) => {
      const monthTotal = filteredTxs
        .filter(t => new Date(t.date).getMonth() === index)
        .reduce((sum, t) => sum + (t.type === TransactionType.RETURN ? -Math.abs(t.totalAmount) : t.totalAmount), 0);
      return { month, total: Math.max(0, monthTotal) };
    });
  }, [filteredTxs]);

  // Color Palette for Pie Chart
  const CHART_COLORS = ['#059669', '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#475569'];

  // ========================================================
  // 4. ACTION HANDLERS (AI, EXPORT, PRINT)
  // ========================================================
  const handleGenerateInsight = async () => {
    setLoadingAI(true);
    try {
      const result = await getBusinessInsights(filteredTxs, products);
      setAiInsight(result);
    } catch (err) {
      console.error(err);
      setAiInsight("Gagal memuat analisis AI saat ini.");
    } finally {
      setLoadingAI(false);
    }
  };

  const timeLabel = timeFilter === 'daily'
    ? 'Hari Ini'
    : (timeFilter === 'weekly'
      ? 'Minggu Ini'
      : (timeFilter === 'monthly'
        ? 'Bulan Ini'
        : (timeFilter === 'yearly' ? 'Tahun Ini' : 'Rentang Kustom')));

  const handlePrint = async () => {
    const settings = storeSettings || await StorageService.getStoreSettings();
    if (!settings) return;

    let periodDetails = '';
    if (timeFilter === 'daily') {
      periodDetails = selectedDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } else if (timeFilter === 'weekly') {
      const end = new Date(selectedWeekStart);
      end.setDate(end.getDate() + 6);
      periodDetails = `${selectedWeekStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else if (timeFilter === 'monthly') {
      periodDetails = new Date(selectedYear, selectedMonth).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } else if (timeFilter === 'yearly') {
      periodDetails = `Tahun ${selectedYear}`;
    } else {
      periodDetails = `${customStartDate} s/d ${customEndDate}`;
    }

    const dashboardData = {
      totalRevenue: kpiMetrics.netRevenue,
      totalTransactions: kpiMetrics.totalTransactions,
      totalReceivables,
      totalItemsSold: kpiMetrics.totalItemsSold,
      lowStockItems: lowStockProducts.length,
      revenueTrend: revenueTrendData.map(d => ({ name: d.name, total: d.omzet })),
      itemsSoldTrend: revenueTrendData.map(d => ({ name: d.name, total: d.laba })),
      topProducts: topProductsData.map(p => ({ name: p.name, qty: p.qty })),
      topCategories: categoryPerformanceData.map(c => ({ name: c.name, qty: c.value })),
      categoryPerformance: categoryPerformanceData,
      monthlyRevenue: timeFilter === 'yearly' ? monthlyRevenueData : undefined,
      timeLabel,
      periodDetails
    };

    const themeHue = localStorage.getItem('theme_hue') || '158';
    const themeSaturation = localStorage.getItem('theme_saturation') || '64%';
    const themeLightness = '40%';

    const printHtml = generatePrintDashboard(
      dashboardData,
      settings,
      formatIDR,
      { h: themeHue, s: themeSaturation, l: themeLightness }
    );

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(printHtml);
      doc.close();
    }

    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch (e) { }
    }, 5000);
  };

  const handleExportExcel = () => {
    const kpiData = [
      { 'Indikator Kinerja Bisnis': 'Omzet Penjualan Bersih', 'Nilai': kpiMetrics.netRevenue, 'Satuan / Keterangan': 'Rupiah' },
      { 'Indikator Kinerja Bisnis': 'Total HPP (Modal Pokok)', 'Nilai': kpiMetrics.totalHppCost, 'Satuan / Keterangan': 'Rupiah' },
      { 'Indikator Kinerja Bisnis': 'Estimasi Laba Kotor', 'Nilai': kpiMetrics.grossProfit, 'Satuan / Keterangan': 'Rupiah' },
      { 'Indikator Kinerja Bisnis': 'Gross Profit Margin', 'Nilai': `${kpiMetrics.grossProfitMargin.toFixed(1)}%`, 'Satuan / Keterangan': 'Persentase' },
      { 'Indikator Kinerja Bisnis': 'Total Transaksi', 'Nilai': kpiMetrics.totalTransactions, 'Satuan / Keterangan': 'Struk' },
      { 'Indikator Kinerja Bisnis': 'Rata-rata Belanja (AOV)', 'Nilai': kpiMetrics.avgBasketSize, 'Satuan / Keterangan': 'Rupiah / Transaksi' },
      { 'Indikator Kinerja Bisnis': 'Item Terjual', 'Nilai': kpiMetrics.totalItemsSold, 'Satuan / Keterangan': 'Unit' },
      { 'Indikator Kinerja Bisnis': 'Total Piutang Belum Lunas', 'Nilai': totalReceivables, 'Satuan / Keterangan': 'Rupiah' },
      { 'Indikator Kinerja Bisnis': 'Jumlah Produk Stok Menipis', 'Nilai': lowStockProducts.length, 'Satuan / Keterangan': 'Produk (< 10 unit)' }
    ];

    exportToExcel(
      kpiData,
      `Dashboard_Performa_Bisnis_${timeFilter}_${new Date().toISOString().slice(0, 10)}`,
      'Performa Bisnis',
      [{ wch: 35 }, { wch: 20 }, { wch: 25 }]
    );
  };

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-0">
      {/* Top Header & Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-600/20">
              <LayoutDashboard size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Dashboard Performa Bisnis
                <span className="text-[11px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Live Analytics
                </span>
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                Pemantauan real-time omzet, laba kotor, piutang, tren penjualan, dan wawasan cerdas toko
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Period Selector */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-0.5 border border-slate-200 shadow-2xs">
            <button
              onClick={() => setTimeFilter('daily')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${timeFilter === 'daily' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'}`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setTimeFilter('weekly')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${timeFilter === 'weekly' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'}`}
            >
              Minggu Ini
            </button>
            <button
              onClick={() => setTimeFilter('monthly')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${timeFilter === 'monthly' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'}`}
            >
              Bulan Ini
            </button>
            <button
              onClick={() => setTimeFilter('yearly')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${timeFilter === 'yearly' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'}`}
            >
              Tahun Ini
            </button>
            <button
              onClick={() => setTimeFilter('custom')}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${timeFilter === 'custom' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'}`}
            >
              Kustom
            </button>
          </div>

          {/* AI Insights Button */}
          <button
            onClick={handleGenerateInsight}
            disabled={loadingAI}
            className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-3.5 py-2 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all text-xs font-black shadow-md shadow-indigo-600/20 active:scale-95"
          >
            <Sparkles size={14} className={loadingAI ? 'animate-spin' : ''} />
            {loadingAI ? 'Menganalisis...' : 'Analisis AI'}
          </button>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-xl hover:bg-slate-50 transition-all text-xs font-bold shadow-2xs"
            title="Cetak Laporan Dashboard Resmi"
          >
            <Printer size={14} className="text-slate-600" /> Cetak
          </button>

          {/* Excel Export */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 text-emerald-800 px-3 py-2 rounded-xl hover:bg-emerald-100 transition-all text-xs font-bold shadow-2xs"
            title="Ekspor Data ke Excel"
          >
            <FileSpreadsheet size={14} className="text-emerald-700" /> Excel
          </button>

          {/* Live Refresh Button */}
          <button
            onClick={handleRefresh}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all shadow-2xs"
            title={`Diperbarui ${lastRefreshed}`}
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-emerald-600' : ''} />
          </button>
        </div>
      </div>

      {/* Interactive Date Sub-filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 p-3 rounded-2xl print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar size={15} className="text-emerald-700" />
          <span className="text-xs font-bold text-slate-600">Filter Aktif:</span>
          <span className="text-xs font-black text-slate-900 font-mono bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
            {timeLabel}
          </span>

          {/* Specific Filters per Mode */}
          {timeFilter === 'daily' && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs shadow-2xs">
              <span className="text-slate-500 font-semibold">Pilih Hari:</span>
              <input
                type="date"
                value={selectedDate.toLocaleDateString('en-CA')}
                onChange={(e) => {
                  const parts = e.target.value.split('-');
                  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                  if (!isNaN(date.getTime())) setSelectedDate(date);
                }}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              />
            </div>
          )}

          {timeFilter === 'weekly' && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-800 outline-none shadow-2xs"
              >
                {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-800 outline-none shadow-2xs"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {timeFilter === 'monthly' && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-800 outline-none shadow-2xs"
              >
                {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-800 outline-none shadow-2xs"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}

          {timeFilter === 'yearly' && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-2.5 py-1 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-800 outline-none shadow-2xs"
            >
              {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}

          {timeFilter === 'custom' && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs shadow-2xs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              />
              <span className="text-slate-400">s/d</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              />
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-500 font-mono">
          Terakhir sinkron: <strong className="text-slate-700">{lastRefreshed} WIB</strong>
        </div>
      </div>

      {/* AI Business Insights Banner */}
      {aiInsight && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white p-5 rounded-2xl shadow-xl border border-indigo-700/60 animate-fade-in relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
            <Brain size={180} />
          </div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="font-black text-sm text-indigo-100 flex items-center gap-2">
                  Wawasan Bisnis Cerdas Gemini AI
                  <span className="bg-indigo-500/30 text-indigo-200 text-[10px] px-2 py-0.5 rounded-full font-mono">
                    AI Advisor
                  </span>
                </h3>
                <p className="text-[11px] text-indigo-300">Analisis taktis performa penjualan & rekomendasi otomatis</p>
              </div>
            </div>
            <button
              onClick={() => setAiInsight(null)}
              className="text-xs text-indigo-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-colors"
            >
              Tutup
            </button>
          </div>
          <div className="text-xs text-indigo-100 bg-black/30 p-4 rounded-xl border border-indigo-800/60 leading-relaxed whitespace-pre-line font-sans">
            {aiInsight}
          </div>
        </div>
      )}

      {/* 6 Executive KPI Metric Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* 1. Omzet Penjualan Bersih */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider">Omzet Bersih</span>
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <TrendingUp size={16} />
              </div>
            </div>
            <h3 className="text-lg font-black text-slate-900 font-mono">{formatIDR(kpiMetrics.netRevenue)}</h3>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">
            {kpiMetrics.totalTransactions} Trx • {kpiMetrics.totalItemsSold} Unit
          </p>
        </div>

        {/* 2. Estimasi Laba Kotor */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Laba Kotor</span>
                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-mono font-extrabold px-1 rounded">
                  {kpiMetrics.grossProfitMargin.toFixed(0)}%
                </span>
              </div>
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <Percent size={16} />
              </div>
            </div>
            <h3 className="text-lg font-black text-emerald-600 font-mono">{formatIDR(kpiMetrics.grossProfit)}</h3>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">
            HPP: {formatIDR(kpiMetrics.totalHppCost)}
          </p>
        </div>

        {/* 3. Average Basket Size (AOV) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider">Rata-rata Belanja</span>
              <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
                <ShoppingBag size={16} />
              </div>
            </div>
            <h3 className="text-lg font-black text-purple-700 font-mono">{formatIDR(kpiMetrics.avgBasketSize)}</h3>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">
            Rata-rata per struk belanja
          </p>
        </div>

        {/* 4. Total Volume Item Terjual */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider">Volume Terjual</span>
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <Package size={16} />
              </div>
            </div>
            <h3 className="text-lg font-black text-amber-800 font-mono">
              {kpiMetrics.totalItemsSold.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-500">pcs</span>
            </h3>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">
            Total unit keluar
          </p>
        </div>

        {/* 5. Total Piutang Berjalan */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider">Piutang Tertahan</span>
              <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                <AlertCircle size={16} />
              </div>
            </div>
            <h3 className="text-lg font-black text-rose-600 font-mono">{formatIDR(totalReceivables)}</h3>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">
            Belum diselesaikan
          </p>
        </div>

        {/* 6. Stok Kritis / Menipis */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider">Stok Kritis</span>
              <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                <AlertTriangle size={16} />
              </div>
            </div>
            <h3 className="text-lg font-black text-rose-700 font-mono">
              {lowStockProducts.length} <span className="text-xs font-normal text-slate-500">produk</span>
            </h3>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">
            Stok &lt; 10 unit
          </p>
        </div>
      </div>

      {/* Main Trends & Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Main Dual Trend Chart (Omzet vs Laba Kotor) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex flex-col h-[400px]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Activity size={16} className="text-emerald-600" />
                Grafik Tren Omzet & Estimasi Laba Kotor ({timeLabel})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Pergerakan omzet bruto dan keuntungan bersih harian</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold font-mono">
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Omzet
              </span>
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Laba Kotor
              </span>
            </div>
          </div>

          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOmzet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorLaba" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}jt` : `${(val / 1000).toFixed(0)}k`}
                />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <Tooltip
                  formatter={(val: number, name: string) => [formatIDR(val), name === 'omzet' ? 'Omzet Penjualan' : 'Laba Kotor']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="omzet" stroke="#059669" strokeWidth={2.5} fillOpacity={1} fill="url(#colorOmzet)" name="omzet" />
                <Area type="monotone" dataKey="laba" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorLaba)" name="laba" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right 1 Col: Payment Methods Donut Chart */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex flex-col h-[400px]">
          <div className="mb-2">
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <CreditCard size={16} className="text-purple-600" />
              Komposisi Metode Pembayaran
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Proporsi penerimaan kas & non-tunai</p>
          </div>

          <div className="flex-1 w-full min-h-0 flex items-center justify-center">
            {paymentMethodData.length === 0 ? (
              <div className="text-center text-slate-400 text-xs py-8">Belum ada transaksi</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [formatIDR(val), 'Penerimaan']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }}
                  />
                  <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Hourly Peak Traffic Chart & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly Traffic Chart (Peak Hours) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-xs border border-slate-200 h-[340px] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Clock size={16} className="text-amber-600" />
                Distribusi Jam Sibuk Toko (Peak Hours Traffic)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Jumlah transaksi berdasarkan jam dalam periode terpilih</p>
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyTrafficData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(val: number, name: string) => [val, 'Jumlah Transaksi']}
                  contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px' }}
                />
                <Bar dataKey="txCount" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Categories Ranking */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 h-[340px] flex flex-col">
          <div className="mb-3">
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <Layers size={16} className="text-indigo-600" />
              Kontribusi Kategori Teratas
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Omzet per kelompok produk</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 touch-scroll">
            {categoryPerformanceData.length === 0 ? (
              <div className="text-center text-slate-400 text-xs py-8">Belum ada data penjualan</div>
            ) : categoryPerformanceData.map((cat, idx) => (
              <div key={cat.name} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800 truncate max-w-[160px]">{idx + 1}. {cat.name}</span>
                  <span className="font-mono font-extrabold text-slate-900">{formatIDR(cat.value)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, cat.share)}%` }}
                  />
                </div>
                <div className="text-right text-[10px] text-slate-400 font-mono">{cat.share.toFixed(1)}% dari total omzet</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Yearly View Specific Monthly Boxes */}
      {timeFilter === 'yearly' && (
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200">
          <h3 className="font-extrabold text-sm text-slate-900 mb-3 flex items-center gap-2">
            <CalendarDays size={16} className="text-emerald-600" />
            Rekapitulasi Omzet Bulanan - Tahun {selectedYear}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {monthlyRevenueData.map((item, index) => (
              <div
                key={index}
                className="bg-slate-50 p-3 rounded-xl border border-slate-200 hover:border-emerald-300 transition-colors"
              >
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.month}</p>
                <p className="text-sm font-black text-slate-900 font-mono mt-1">{formatIDR(item.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Operational Grid: Top 5 Best Sellers & Critical Low Stock Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 5 Produk Terlaris */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <ShoppingBag size={16} className="text-emerald-600" />
                5 Produk Terlaris ({timeLabel})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Produk dengan volume penjualan tertinggi</p>
            </div>
            <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
              Top 5 Volume
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {topProductsData.length === 0 ? (
              <div className="text-center text-slate-400 py-6">Belum ada data produk terjual</div>
            ) : topProductsData.map((prod, idx) => (
              <div key={prod.name} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] font-mono">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-bold text-slate-800">{prod.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">Total Omzet: {formatIDR(prod.revenue)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                    {prod.qty} unit
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Peringatan Stok Menipis */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-600" />
                Peringatan Stok Menipis & Restok Mendesak
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Produk dengan stok tersisa di bawah 10 unit</p>
            </div>
            <span className="text-[10px] font-mono bg-rose-50 text-rose-800 font-bold px-2 py-0.5 rounded-full">
              {lowStockProducts.length} Produk
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {lowStockProducts.length === 0 ? (
              <div className="text-center text-emerald-600 py-6 flex items-center justify-center gap-2 font-bold">
                <CheckCircle2 size={16} /> Seluruh stok produk dalam kondisi aman!
              </div>
            ) : lowStockProducts.slice(0, 5).map(prod => (
              <div key={prod.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">{prod.name}</p>
                  <p className="text-[10px] text-slate-400">Kategori: {prod.categoryName || 'Umum'} • HPP: {formatIDR(prod.hpp || 0)}</p>
                </div>
                <div className="text-right">
                  <span className={`font-mono font-black px-2 py-0.5 rounded-lg ${prod.stock <= 3 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                    Sisa: {prod.stock} {prod.unit || 'pcs'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};