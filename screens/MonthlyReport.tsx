import React, { useState, useMemo } from 'react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { formatIDR } from '../utils';
import { Calculator, Calendar, Building2, TrendingDown, TrendingUp, PiggyBank, Printer } from 'lucide-react';
import { CashFlowType, TransactionType } from '../types';

export const MonthlyReport: React.FC = () => {
    const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];
    const cashFlows = useData(() => StorageService.getCashFlow(), [], 'cashflow') || [];
    const divisions = useData(() => StorageService.getDivisions(), [], 'divisions') || [];

    const today = new Date();
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth()); // 0-11
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());

    // Generate years for dropdown
    const years = useMemo(() => {
        const y = new Set<number>([today.getFullYear()]);
        transactions.forEach(t => y.add(new Date(t.date).getFullYear()));
        cashFlows.forEach(c => y.add(new Date(c.date).getFullYear()));
        return Array.from(y).sort((a, b) => b - a);
    }, [transactions, cashFlows]);

    const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];

    // Filter Data by selected month & year
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
        });
    }, [transactions, selectedMonth, selectedYear]);

    const filteredCashFlows = useMemo(() => {
        return cashFlows.filter(c => {
            const d = new Date(c.date);
            return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
        });
    }, [cashFlows, selectedMonth, selectedYear]);

    // Calculate Division Metrics
    const divisionMetrics = useMemo(() => {
        return divisions.map(div => {
            let revenue = 0;
            let hpp = 0;

            // Calculate Revenue and HPP from Transactions
            filteredTransactions.forEach(t => {
                if (t.type === TransactionType.RETURN) return; // Skip complete returns
                
                t.items.forEach(item => {
                    // Match by divisionId or fallback to divisionName if id was unlinked
                    if (item.divisionId === div.id || item.divisionName === div.name) {
                        revenue += item.finalPrice;
                        hpp += (item.hpp || 0) * item.qty;
                    }
                });
            });

            // Calculate Gross Profit
            const grossProfit = revenue - hpp;

            // Calculate Loans / Kasbon for this division
            const loans = filteredCashFlows
                .filter(c => c.type === CashFlowType.OUT && (c.divisionId === div.id || c.divisionName === div.name))
                .reduce((sum, c) => sum + c.amount, 0);

            // Net Division Contribution
            const netContribution = grossProfit - loans;

            return {
                id: div.id,
                name: div.name,
                revenue,
                hpp,
                grossProfit,
                loans,
                netContribution
            };
        });
    }, [divisions, filteredTransactions, filteredCashFlows]);

    // Calculate Operational Costs (Company-wide)
    const operationalCosts = useMemo(() => {
        // Any CashFlow OUT that is NOT assigned to a division and NOT a purchase payment (if purchases are tracked in CF, we only want manual expenses here).
        // manual expenses have no referenceId or referenceId is empty, and divisionId is empty.
        return filteredCashFlows
            .filter(c => c.type === CashFlowType.OUT && !c.divisionId && (!c.referenceId || c.category === 'Beban Gaji' || c.category === 'Operasional' || c.category === 'Dividen'))
            .reduce((sum, c) => sum + c.amount, 0);
    }, [filteredCashFlows]);

    // Totals
    const totalGrossContribution = divisionMetrics.reduce((sum, d) => sum + d.netContribution, 0);
    const netProfit = totalGrossContribution - operationalCosts;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 animate-fade-in print:bg-white print:p-0">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="text-primary" />
                        Laporan Keuangan Bulanan
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Perhitungan laba bersih antar divisi dan alokasi kas perusahaan.</p>
                </div>
                
                <div className="flex gap-3 items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                    <Calendar size={18} className="text-slate-400 ml-2" />
                    <select 
                        className="bg-transparent font-medium text-slate-700 outline-none pr-2"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(Number(e.target.value))}
                    >
                        {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <span className="text-slate-300">|</span>
                    <select 
                        className="bg-transparent font-medium text-slate-700 outline-none pr-2"
                        value={selectedYear}
                        onChange={e => setSelectedYear(Number(e.target.value))}
                    >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8">
                <h1 className="text-2xl font-bold">Laporan Keuangan Bulanan</h1>
                <p className="text-lg">Periode: {months[selectedMonth]} {selectedYear}</p>
                <div className="border-b-2 border-slate-800 mt-4"></div>
            </div>

            {/* Division Reports Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:border-none print:shadow-none">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:bg-white print:border-b-2 print:border-slate-800">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Calculator size={18} className="text-primary" />
                        Rincian Per Divisi
                    </h3>
                    <button onClick={handlePrint} className="print:hidden flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                        <Printer size={16} /> Print
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-600 print:bg-slate-100">
                            <tr>
                                <th className="p-4 font-semibold">Divisi</th>
                                <th className="p-4 font-semibold text-right">Pendapatan</th>
                                <th className="p-4 font-semibold text-right">HPP</th>
                                <th className="p-4 font-semibold text-right text-blue-600">Laba Kotor</th>
                                <th className="p-4 font-semibold text-right text-red-600">Pinjaman / Panjar</th>
                                <th className="p-4 font-semibold text-right text-green-600">Setoran Divisi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {divisionMetrics.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-400">Belum ada data divisi.</td>
                                </tr>
                            ) : divisionMetrics.map(div => (
                                <tr key={div.id} className="hover:bg-slate-50">
                                    <td className="p-4 font-medium text-slate-800">{div.name}</td>
                                    <td className="p-4 text-right text-slate-600">{formatIDR(div.revenue)}</td>
                                    <td className="p-4 text-right text-slate-600">{formatIDR(div.hpp)}</td>
                                    <td className="p-4 text-right font-semibold text-blue-600">{formatIDR(div.grossProfit)}</td>
                                    <td className="p-4 text-right text-red-600">{div.loans > 0 ? formatIDR(div.loans) : '-'}</td>
                                    <td className="p-4 text-right font-bold text-green-600">{formatIDR(div.netContribution)}</td>
                                </tr>
                            ))}
                            {/* Division Totals Row */}
                            {divisionMetrics.length > 0 && (
                                <tr className="bg-slate-50/80 font-bold border-t-2 border-slate-200">
                                    <td className="p-4 text-slate-800">TOTAL SELURUH DIVISI</td>
                                    <td className="p-4 text-right text-slate-800">{formatIDR(divisionMetrics.reduce((s,d) => s + d.revenue, 0))}</td>
                                    <td className="p-4 text-right text-slate-800">{formatIDR(divisionMetrics.reduce((s,d) => s + d.hpp, 0))}</td>
                                    <td className="p-4 text-right text-blue-700">{formatIDR(divisionMetrics.reduce((s,d) => s + d.grossProfit, 0))}</td>
                                    <td className="p-4 text-right text-red-700">{formatIDR(divisionMetrics.reduce((s,d) => s + d.loans, 0))}</td>
                                    <td className="p-4 text-right text-green-700 text-base">{formatIDR(totalGrossContribution)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Final Calculation Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:border-slate-800">
                    <div className="flex items-center gap-3 mb-2 text-slate-600">
                        <TrendingUp size={20} className="text-blue-500" />
                        <span className="font-semibold">Total Setoran Divisi</span>
                    </div>
                    <p className="text-3xl font-bold text-slate-800">{formatIDR(totalGrossContribution)}</p>
                    <p className="text-xs text-slate-400 mt-2">Akumulasi laba kotor dikurangi pinjaman seluruh divisi.</p>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:border-slate-800">
                    <div className="flex items-center gap-3 mb-2 text-slate-600">
                        <TrendingDown size={20} className="text-red-500" />
                        <span className="font-semibold">Beban Operasional</span>
                    </div>
                    <p className="text-3xl font-bold text-red-600">{formatIDR(operationalCosts)}</p>
                    <p className="text-xs text-slate-400 mt-2">Gaji, operasional kantor, dividen, dll (di luar divisi).</p>
                </div>

                <div className="bg-gradient-to-br from-primary to-blue-600 p-6 rounded-2xl shadow-lg shadow-primary/20 text-white print:border-2 print:border-slate-800 print:bg-none print:text-slate-800">
                    <div className="flex items-center gap-3 mb-2 opacity-90 print:opacity-100">
                        <PiggyBank size={20} />
                        <span className="font-semibold">Laba Bersih (Masuk Kas)</span>
                    </div>
                    <p className="text-3xl font-bold">{formatIDR(netProfit)}</p>
                    <p className="text-xs opacity-75 mt-2 print:opacity-100">Dana yang disetorkan ke kas utama perusahaan.</p>
                </div>
            </div>
        </div>
    );
};
