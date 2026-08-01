import React, { useEffect, useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, AreaChart, Area } from 'recharts';
import { Brain, TrendingUp, AlertCircle, Wallet, RefreshCw, Calendar, Package, User as UserIcon, LayoutDashboard, Printer } from 'lucide-react';
import { StorageService } from '../services/storage';
import { getBusinessInsights } from '../services/geminiService';
import { formatIDR } from '../utils';
import { generatePrintDashboard } from '../utils/printHelpers';
import { Transaction, Product, CartItem, User, TransactionType } from '../types';
import { useData } from '../hooks/useData';

export const Dashboard: React.FC = () => {
  const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];
  const products = useData(() => StorageService.getProducts(), [], 'products') || [];
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Load current user from localStorage
  useEffect(() => {
    const userStr = localStorage.getItem('pos_current_user');
    if (userStr) {
      setCurrentUser(JSON.parse(userStr));
    }
  }, []);

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
      const isValid = validStarts.some(t => Math.abs(t - currentMilli) < 1000 * 60 * 60 * 12); // Tolerance

      if (!isValid && validStarts.length > 0) {
        setSelectedWeekStart(new Date(validStarts[0]));
      }
    }
  }, [selectedMonth, selectedYear, timeFilter, selectedWeekStart]);

  // --- Data Processing ---


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
      // Use selectedWeekStart
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
    }

    return transactions.filter(t => {
      const tTime = new Date(t.date).getTime();
      return tTime >= startTime && tTime <= endTime;
    });
  }, [transactions, timeFilter, selectedDate, selectedWeekStart, selectedMonth, selectedYear]);

  // Stats
  const totalRevenue = useMemo(() => filteredTxs.reduce((sum, t) => sum + t.totalAmount, 0), [filteredTxs]);
  const totalTransactions = useMemo(() => filteredTxs.length, [filteredTxs]);

  // Total Piutang: Calculate from beginning up to end of selected year
  const totalReceivables = useMemo(() => {
    const endOfSelectedYear = new Date(selectedYear, 11, 31, 23, 59, 59).getTime();
    return transactions
      .filter(t => {
        const txTime = new Date(t.date).getTime();
        return t.paymentStatus !== 'LUNAS' && txTime <= endOfSelectedYear;
      })
      .reduce((sum, t) => sum + (t.totalAmount - t.amountPaid), 0);
  }, [transactions, selectedYear]);

  const lowStockItems = useMemo(() => products.filter(p => p.stock < 10).length, [products]);
  const totalItemsSold = useMemo(() => {
    return filteredTxs.reduce((sum, t) => {
      const itemQty = t.items.reduce((itemSum, item) => itemSum + item.qty, 0);
      // Subtract quantity for RETURN transactions, add for normal SALE transactions
      return sum + (t.type === TransactionType.RETURN ? -itemQty : itemQty);
    }, 0);
  }, [filteredTxs]);

  // Chart Data: Revenue Trend (Daily/Weekly/Monthly/Yearly)
  const revenueTrendData = useMemo(() => {
    if (timeFilter === 'daily') {
      const data = Array.from({ length: 24 }, (_, i) => ({
        name: `${i}:00`,
        total: 0
      }));
      filteredTxs.forEach(t => {
        const hour = new Date(t.date).getHours();
        data[hour].total += t.totalAmount;
      });
      return data;
    } else if (timeFilter === 'weekly') {
      const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const data = days.map(d => ({ name: d, total: 0 }));

      filteredTxs.forEach(t => {
        const dayIndex = new Date(t.date).getDay();
        data[dayIndex].total += t.totalAmount;
      });

      const sunday = data.shift();
      if (sunday) data.push(sunday);

      return data;
    } else if (timeFilter === 'monthly') {
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

      const data = Array.from({ length: daysInMonth }, (_, i) => ({
        name: (i + 1).toString(),
        total: 0
      }));

      filteredTxs.forEach(t => {
        const date = new Date(t.date).getDate();
        if (date <= daysInMonth) {
          data[date - 1].total += t.totalAmount;
        }
      });
      return data;
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const data = months.map(m => ({ name: m, total: 0 }));

      filteredTxs.forEach(t => {
        const month = new Date(t.date).getMonth();
        data[month].total += t.totalAmount;
      });

      return data;
    }
  }, [filteredTxs, timeFilter]);

  // Chart Data: Top Products
  const topProductsData = useMemo(() => {
    const itemMap = new Map<string, number>();
    filteredTxs.forEach(tx => {
      tx.items.forEach(item => {
        const current = itemMap.get(item.name) || 0;
        // Subtract for RETURN transactions
        const qty = tx.type === TransactionType.RETURN ? -item.qty : item.qty;
        itemMap.set(item.name, current + qty);
      });
    });

    return Array.from(itemMap.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [filteredTxs]);

  // Chart Data: Category Performance
  const categoryPerformanceData = useMemo(() => {
    const catMap = new Map<string, number>();
    filteredTxs.forEach(tx => {
      tx.items.forEach(item => {
        const catName = item.categoryName || 'Lainnya';
        const current = catMap.get(catName) || 0;
        // Subtract for RETURN transactions
        const value = tx.type === TransactionType.RETURN ? -(item.finalPrice * item.qty) : (item.finalPrice * item.qty);
        catMap.set(catName, current + value);
      });
    });

    return Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTxs]);

  // Chart Data: Top Categories by Quantity
  const topCategoriesData = useMemo(() => {
    const catMap = new Map<string, number>();
    filteredTxs.forEach(tx => {
      tx.items.forEach(item => {
        const catName = item.categoryName || 'Lainnya';
        const current = catMap.get(catName) || 0;
        // Subtract for RETURN transactions
        const qty = tx.type === TransactionType.RETURN ? -item.qty : item.qty;
        catMap.set(catName, current + qty);
      });
    });

    return Array.from(catMap.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [filteredTxs]);

  // Chart Data: Items Sold Trend (similar to revenue trend but for quantity)
  const itemsSoldTrendData = useMemo(() => {
    if (timeFilter === 'daily') {
      const data = Array.from({ length: 24 }, (_, i) => ({
        name: `${i}:00`,
        total: 0
      }));
      filteredTxs.forEach(t => {
        const hour = new Date(t.date).getHours();
        const itemCount = t.items.reduce((sum, item) => sum + item.qty, 0);
        // Subtract for RETURN transactions
        data[hour].total += (t.type === TransactionType.RETURN ? -itemCount : itemCount);
      });
      return data;
    } else if (timeFilter === 'weekly') {
      const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const data = days.map(d => ({ name: d, total: 0 }));

      filteredTxs.forEach(t => {
        const dayIndex = new Date(t.date).getDay();
        const itemCount = t.items.reduce((sum, item) => sum + item.qty, 0);
        // Subtract for RETURN transactions
        data[dayIndex].total += (t.type === TransactionType.RETURN ? -itemCount : itemCount);
      });

      const sunday = data.shift();
      if (sunday) data.push(sunday);

      return data;
    } else if (timeFilter === 'monthly') {
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

      const data = Array.from({ length: daysInMonth }, (_, i) => ({
        name: (i + 1).toString(),
        total: 0
      }));

      filteredTxs.forEach(t => {
        const date = new Date(t.date).getDate();
        const itemCount = t.items.reduce((sum, item) => sum + item.qty, 0);
        if (date <= daysInMonth) {
          // Subtract for RETURN transactions
          data[date - 1].total += (t.type === TransactionType.RETURN ? -itemCount : itemCount);
        }
      });
      return data;
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const data = months.map(m => ({ name: m, total: 0 }));

      filteredTxs.forEach(t => {
        const month = new Date(t.date).getMonth();
        const itemCount = t.items.reduce((sum, item) => sum + item.qty, 0);
        // Subtract for RETURN transactions
        data[month].total += (t.type === TransactionType.RETURN ? -itemCount : itemCount);
      });

      return data;
    }
  }, [filteredTxs, timeFilter]);

  // Get monthly revenue for yearly view
  const monthlyRevenueData = useMemo(() => {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return months.map((month, index) => {
      const monthTotal = filteredTxs
        .filter(t => new Date(t.date).getMonth() === index)
        .reduce((sum, t) => sum + t.totalAmount, 0);
      return { month, total: monthTotal };
    });
  }, [filteredTxs]);

  const COLORS = ['#FFD700', '#1B4D3E', '#9B2226', '#E67E22', '#5A3B22', '#2C3E50'];

  const handleGenerateInsight = async () => {
    setLoadingAI(true);
    const result = await getBusinessInsights(filteredTxs, products);
    setAiInsight(result);
    setLoadingAI(false);
  };


  const timeLabel = timeFilter === 'daily' ? 'Hari Ini' : (timeFilter === 'weekly' ? 'Minggu Ini' : (timeFilter === 'monthly' ? 'Bulan Ini' : 'Tahun Ini'));

  const handlePrint = async () => {
    const storeSettings = await StorageService.getStoreSettings();
    if (!storeSettings) return;

    // Generate specific period details string
    let periodDetails = '';
    if (timeFilter === 'daily') {
      periodDetails = selectedDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } else if (timeFilter === 'weekly') {
      const end = new Date(selectedWeekStart);
      end.setDate(end.getDate() + 6);
      periodDetails = `${selectedWeekStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else if (timeFilter === 'monthly') {
      periodDetails = new Date(selectedYear, selectedMonth).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } else {
      periodDetails = `Tahun ${selectedYear}`;
    }

    const dashboardData = {
      totalRevenue,
      totalTransactions,
      totalReceivables,
      totalItemsSold,
      lowStockItems,
      revenueTrend: revenueTrendData,
      itemsSoldTrend: itemsSoldTrendData,
      topProducts: topProductsData,
      topCategories: topCategoriesData,
      categoryPerformance: categoryPerformanceData,
      monthlyRevenue: timeFilter === 'yearly' ? monthlyRevenueData : undefined,
      timeLabel,
      periodDetails
    };

    const themeHue = localStorage.getItem('theme_hue') || '348';
    const themeSaturation = localStorage.getItem('theme_saturation') || '90%';
    const themeLightness = '56%'; // Standard lightness

    const printHtml = generatePrintDashboard(
      dashboardData,
      storeSettings,
      formatIDR,
      { h: themeHue, s: themeSaturation, l: themeLightness }
    );

    // Create iframe to print
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(printHtml);
      doc.close();
    }

    // The printHelpers script handles the printing and closing, 
    // but since we are using an iframe approach here (cleaner for SPA), 
    // we might need to adjust or rely on the script inside `generatePrintDashboard` which does window.print()
    // However, the `generatePrintDashboard` returns a full HTML string with <script>window.print()</script>.
    // Writing it to an iframe works well.
    // Note: The helper's script attempts to close the window. Inside an iframe `window.close()` does nothing, which is fine.
    // We should remove the iframe after printing, but since we don't know when it finishes, we can leave it or set a timeout.
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 5000);
  };

  // Calculate Gross Profit (Omzet - HPP)
  const grossProfit = useMemo(() => {
    return filteredTxs.reduce((sum, t) => {
      const txProfit = t.items.reduce((itemSum, item) => {
        const hpp = item.hpp || 0;
        const profitPerUnit = item.finalPrice - hpp;
        const itemProfit = profitPerUnit * item.qty;
        return itemSum + itemProfit;
      }, 0);
      return sum + (t.type === TransactionType.RETURN ? -txProfit : txProfit);
    }, 0);
  }, [filteredTxs]);

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-0">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <LayoutDashboard className="text-amber-600" />
            Dashboard Performa Bisnis
          </h1>
          <p className="text-slate-500 text-sm mt-1">Ringkasan statistik penjualan, omzet, laba kotor, piutang, dan tren produk</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Filter Tabs */}
          <div className="bg-slate-100/80 p-1 rounded-xl flex gap-1">
            <button
              onClick={() => setTimeFilter('daily')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${timeFilter === 'daily' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setTimeFilter('weekly')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${timeFilter === 'weekly' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Minggu Ini
            </button>
            <button
              onClick={() => setTimeFilter('monthly')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${timeFilter === 'monthly' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Bulan Ini
            </button>
            <button
              onClick={() => setTimeFilter('yearly')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${timeFilter === 'yearly' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Tahun Ini
            </button>
          </div>

          {/* AI Insight Button */}
          <button
            onClick={handleGenerateInsight}
            disabled={loadingAI}
            className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3.5 py-2 rounded-xl hover:bg-indigo-100 transition-all text-xs font-bold shadow-sm"
          >
            <Brain size={16} className={loadingAI ? 'animate-spin' : ''} />
            {loadingAI ? 'Analisis...' : 'Analisis AI'}
          </button>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-white border border-slate-300 text-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 transition-all text-xs font-medium shadow-sm"
            title="Cetak Laporan Dashboard"
          >
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {/* Metric Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Omzet Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Omzet ({timeLabel})</p>
            <h3 className="text-lg font-extrabold text-slate-900 mt-1">{formatIDR(totalRevenue)}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{totalTransactions} Transaksi</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <TrendingUp size={22} />
          </div>
        </div>

        {/* Est. Laba Kotor Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Laba Kotor Est.</p>
            <h3 className="text-lg font-extrabold text-emerald-600 mt-1">{formatIDR(grossProfit)}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Omzet dikurangi HPP</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <Wallet size={22} />
          </div>
        </div>

        {/* Total Piutang Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Piutang</p>
            <h3 className="text-lg font-extrabold text-rose-600 mt-1">{formatIDR(totalReceivables)}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Belum Terbayar</p>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
            <AlertCircle size={22} />
          </div>
        </div>

        {/* Item Terjual Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Item Terjual</p>
            <h3 className="text-lg font-extrabold text-amber-700 mt-1">{totalItemsSold.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">unit</span></h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Total Kuantitas</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <Package size={22} />
          </div>
        </div>

        {/* Stok Menipis Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Stok Menipis</p>
            <h3 className="text-lg font-extrabold text-purple-700 mt-1">{lowStockItems} <span className="text-xs font-normal text-slate-400">produk</span></h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Stok dibawah 10</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
            <RefreshCw size={22} />
          </div>
        </div>
      </div>

      {/* AI Insights Section */}
      {aiInsight && (
        <div className="bg-indigo-900 text-white p-5 rounded-2xl shadow-md border border-indigo-700 animate-fade-in">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-800 rounded-xl">
              <Brain size={20} className="text-indigo-300" />
            </div>
            <h3 className="font-bold text-sm text-indigo-100">Rekomendasi Cerdas AI Gemini</h3>
          </div>
          <div className="prose prose-invert max-w-none text-xs text-indigo-100 bg-indigo-950/60 p-4 rounded-xl border border-indigo-800/80 leading-relaxed whitespace-pre-line">
            {aiInsight}
          </div>
        </div>
      )}

      {/* Main Trend Chart */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 h-[380px] flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h3 className="font-extrabold text-sm text-slate-800">Grafik Tren Pendapatan ({timeLabel})</h3>

          <div className="flex flex-wrap items-center gap-2">
            {timeFilter === 'daily' && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 text-xs">
                <span className="font-semibold text-slate-500">Tanggal:</span>
                <div className="relative flex items-center">
                  <span className="font-bold text-slate-800 pr-6">
                    {selectedDate.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                  <input
                    id="dateFilter"
                    name="dateFilter"
                    type="date"
                    value={selectedDate.toLocaleDateString('en-CA')}
                    onChange={(e) => {
                      const parts = e.target.value.split('-');
                      const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                      if (!isNaN(date.getTime())) setSelectedDate(date);
                    }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                  <Calendar size={14} className="absolute right-0 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            {timeFilter === 'weekly' && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="weekSelect"
                  name="weekSelect"
                  value={selectedWeekStart.toISOString()}
                  onChange={(e) => setSelectedWeekStart(new Date(e.target.value))}
                  className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-800 outline-none"
                >
                  {(() => {
                    const weeks = [];
                    const firstDay = new Date(selectedYear, selectedMonth, 1);
                    const lastDay = new Date(selectedYear, selectedMonth + 1, 0);

                    const firstDayDay = firstDay.getDay() || 7;
                    let iterDate = new Date(firstDay);
                    iterDate.setDate(firstDay.getDate() - (firstDayDay - 1));

                    let weekNum = 1;
                    while (iterDate <= lastDay) {
                      const wStart = new Date(iterDate);
                      const wEnd = new Date(iterDate);
                      wEnd.setDate(wEnd.getDate() + 6);

                      const label = `Minggu ${weekNum} (${wStart.getDate()} ${wStart.toLocaleDateString('id-ID', { month: 'short' })} - ${wEnd.getDate()} ${wEnd.toLocaleDateString('id-ID', { month: 'short' })})`;
                      weeks.push(
                        <option key={wStart.toISOString()} value={wStart.toISOString()}>{label}</option>
                      );

                      iterDate.setDate(iterDate.getDate() + 7);
                      weekNum++;
                    }
                    return weeks;
                  })()}
                </select>
                <select
                  id="monthSelectWeekly"
                  name="monthSelectWeekly"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-800 outline-none"
                >
                  {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
                <select
                  id="yearSelectWeekly"
                  name="yearSelectWeekly"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-800 outline-none"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {timeFilter === 'monthly' && (
              <div className="flex items-center gap-2">
                <select
                  id="monthSelectMonthly"
                  name="monthSelectMonthly"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-800 outline-none"
                >
                  {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
                <select
                  id="yearSelectMonthly"
                  name="yearSelectMonthly"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-800 outline-none"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {timeFilter === 'yearly' && (
              <div className="flex items-center gap-2">
                <select
                  id="yearSelectYearly"
                  name="yearSelectYearly"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-800 outline-none"
                >
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d97706" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value / 1000}k`} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <Tooltip
                formatter={(value: number) => [formatIDR(value), 'Pendapatan']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#b45309"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorTotal)"
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Items Sold Trend Chart */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 h-[320px] flex flex-col">
        <h3 className="font-extrabold text-sm text-slate-800 mb-3">Kuantitas Item Terjual ({timeLabel})</h3>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={itemsSoldTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorItems" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <Tooltip
                formatter={(value: number) => [value, 'Item Terjual']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#047857"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorItems)"
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Revenue Boxes for Yearly View */}
      {timeFilter === 'yearly' && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-extrabold text-sm text-slate-800 mb-3">Rincian Omzet Bulanan - Tahun {selectedYear}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {monthlyRevenueData.map((item, index) => (
              <div
                key={index}
                className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-100 hover:shadow-md transition-shadow"
              >
                <p className="text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">{item.month}</p>
                <p className="text-sm font-extrabold text-amber-800">{formatIDR(item.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart: Top Products */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 h-[360px] flex flex-col">
          <h3 className="font-extrabold text-sm text-slate-800 mb-4">5 Produk Terlaris ({timeLabel})</h3>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProductsData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={110} tick={{ fill: '#475569', fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="qty" fill="#d97706" radius={[0, 4, 4, 0]} barSize={24} name="Terjual" isAnimationActive={true} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart: Top Categories */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 h-[360px] flex flex-col">
          <h3 className="font-extrabold text-sm text-slate-800 mb-4">5 Kategori Terlaris ({timeLabel})</h3>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCategoriesData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={110} tick={{ fill: '#475569', fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="qty" fill="#059669" radius={[0, 4, 4, 0]} barSize={24} name="Terjual" isAnimationActive={true} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart: Categories Revenue */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 h-[360px] flex flex-col">
          <h3 className="font-extrabold text-sm text-slate-800 mb-4">Pendapatan per Kategori ({timeLabel})</h3>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryPerformanceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  fill="#8884d8"
                  paddingAngle={4}
                  dataKey="value"
                  isAnimationActive={true}
                >
                  {categoryPerformanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatIDR(value)} contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};