"use client";

import { useState, useMemo, useEffect } from "react";
import { useData } from "../../../hooks/useData";
import { StorageService } from "../../../services/storage";
import { CashFlowType, PaymentMethod, TransactionType } from "../../../types";
import { Plus, Trash2, Info, Save, Archive, FileText, X, Printer, Eye } from "lucide-react";

const FIXED_SALES_CATEGORIES = [
    "Tiket Masuk & Sewa Kostum",
    "Toko / Souvenir",
    "Kafe & Resto",
    "Kios",
    "Paket Sopendo / Saswar / Edukasi",
    "Jasa Fotografer",
    "Sewa kostum keluar",
    "", "", ""
];

const FIXED_EXPENSE_CATEGORIES = [
    "CAFÉ",
    "KIOS",
    "REPARASI",
    "LISTRIK PLN",
    "TRANSPORTASI",
    "SOVENIR",
    "LAIN-LAIN",
    "PERLENGKAPAN",
    "Makan Siang Karyawan (MSK)",
    "PANJAR"
];

const DETAILED_EXPENSE_CONFIG = [
    { title: "V. URAIAN PENGELUARAN (Pembelanjaan Café)", rows: 21 },
    { title: "V. URAIAN PENGELUARAN (REPARASI)", rows: 3 },
    { title: "V. URAIAN PENGELUARAN (Transportasi)", rows: 2 },
    { title: "V. URAIAN PENGELUARAN (Listrik)", rows: 2 },
    { title: "V. URAIAN PENGELUARAN (Biaya Kios)", rows: 10 },
    { title: "V. URAIAN PENGELUARAN (Makan Siang Karyawan)", rows: 4 },
    { title: "V. URAIAN PENGELUARAN (Sovenir)", rows: 1 },
    { title: "V. URAIAN PENGELUARAN (Perlengkapan)", rows: 1 },
    { title: "V. URAIAN PENGELUARAN (Panjar)", rows: 1 },
    { title: "V. URAIAN PENGELUARAN (Lain-lain)", rows: 1 }
];

const CATEGORY_OPTIONS = [
    "1) CAFÉ", 
    "2) KIOS", 
    "3) REPARASI", 
    "4) LISTRIK PLN", 
    "5) TRANSPORTASI",
    "6) SOVENIR", 
    "7) LAIN-LAIN", 
    "8) PERLENGKAPAN", 
    "9) Makan Siang Karyawan (MSK)", 
    "10) PANJAR"
];

// Helper to map category dropdown to the correct printable table
const mapCategoryToSection = (cat) => {
    if (cat.includes("CAFÉ")) return "V. URAIAN PENGELUARAN (Pembelanjaan Café)";
    if (cat.includes("REPARASI")) return "V. URAIAN PENGELUARAN (REPARASI)";
    if (cat.includes("TRANSPORTASI")) return "V. URAIAN PENGELUARAN (Transportasi)";
    if (cat.includes("LISTRIK")) return "V. URAIAN PENGELUARAN (Listrik)";
    if (cat.includes("KIOS")) return "V. URAIAN PENGELUARAN (Biaya Kios)";
    if (cat.includes("Makan Siang")) return "V. URAIAN PENGELUARAN (Makan Siang Karyawan)";
    if (cat.includes("SOVENIR")) return "V. URAIAN PENGELUARAN (Sovenir)";
    if (cat.includes("PERLENGKAPAN")) return "V. URAIAN PENGELUARAN (Perlengkapan)";
    if (cat.includes("PANJAR")) return "V. URAIAN PENGELUARAN (Panjar)";
    return "V. URAIAN PENGELUARAN (Lain-lain)";
};

export default function BeritaAcaraPage() {
    const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
    const [periode, setPeriode] = useState("");
    const [kasir, setKasir] = useState("");
    const [lokasi, setLokasi] = useState("Aimas - Klamono KM 21, Kabupaten Sorong, Papua Barat Daya");

    const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];
    const cashflows = useData(() => StorageService.getCashFlow(), [], 'cashflow') || [];
    const archives = useData(() => StorageService.getBeritaAcaraArchives(), [], 'berita_acara_archives') || [];
    const [activeTab, setActiveTab] = useState("input");
    const [viewingArchive, setViewingArchive] = useState(null);

    // States for editable tables
    const [salesTunai, setSalesTunai] = useState(Array(10).fill(""));
    const [hppTunai, setHppTunai] = useState(Array(10).fill(""));
    const [salesQR, setSalesQR] = useState(Array(10).fill(""));
    const [hppQR, setHppQR] = useState(Array(10).fill(""));
    const [salesTunaiNames, setSalesTunaiNames] = useState([...FIXED_SALES_CATEGORIES]);
    const [salesQRNames, setSalesQRNames] = useState([...FIXED_SALES_CATEGORIES]);

    // Summary Expense Table (Page 1)
    const [expenses, setExpenses] = useState(Array(10).fill(""));
    const [expenseNames, setExpenseNames] = useState([...FIXED_EXPENSE_CATEGORIES]);

    // Modern Dynamic Expenses (Hidden on print)
    const [customExpenses, setCustomExpenses] = useState([
        { id: Date.now(), category: '1) CAFÉ', keterangan: '', qty: '', harga: '', total: '' }
    ]);

    const [catatan, setCatatan] = useState("");

    // Auto-calculate logic from transactions
    const transactionsStr = JSON.stringify(transactions);
    const cashflowsStr = JSON.stringify(cashflows);

    useEffect(() => {
        if (!tanggal) return;

        const startDate = new Date(tanggal);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(tanggal);
        endDate.setHours(23, 59, 59, 999);

        // Reset to predefined
        const newSalesTunai = Array(10).fill(0);
        const newHppTunai = Array(10).fill(0);
        const newSalesQR = Array(10).fill(0);
        const newHppQR = Array(10).fill(0);
        const newExpenses = Array(10).fill(0);
        
        let hasData = false;

        const currentTransactions = JSON.parse(transactionsStr);
        const currentCashflows = JSON.parse(cashflowsStr);

        currentTransactions.forEach(t => {
            const tDate = new Date(t.date);
            if (tDate >= startDate && tDate <= endDate) {
                hasData = true;
                t.items.forEach(item => {
                    const catName = item.categoryName?.toLowerCase() || '';
                    let itemTotal = item.finalPrice * item.qty;
                    let itemHpp = (item.hpp || 0) * item.qty;
                    if (t.type === TransactionType.RETURN) {
                        itemTotal = -itemTotal;
                        itemHpp = -itemHpp;
                    }

                    // Try to map to fixed categories roughly
                    let targetIndex = -1;
                    if (catName.includes("tiket") || catName.includes("kostum")) targetIndex = 0;
                    else if (catName.includes("toko") || catName.includes("souvenir") || catName.includes("sovenir")) targetIndex = 1;
                    else if (catName.includes("kafe") || catName.includes("cafe") || catName.includes("resto")) targetIndex = 2;
                    else if (catName.includes("kios")) targetIndex = 3;
                    else if (catName.includes("sopendo") || catName.includes("saswar") || catName.includes("edukasi")) targetIndex = 4;
                    else if (catName.includes("fotografer") || catName.includes("foto")) targetIndex = 5;

                    if (targetIndex === -1) {
                        // Find first empty slot
                        targetIndex = 7; // Just put in the 8th row as a fallback
                    }

                    if (t.paymentMethod === PaymentMethod.CASH) {
                        newSalesTunai[targetIndex] += itemTotal;
                        newHppTunai[targetIndex] += itemHpp;
                    } else {
                        newSalesQR[targetIndex] += itemTotal;
                        newHppQR[targetIndex] += itemHpp;
                    }
                });
            }
        });

        currentCashflows.forEach(cf => {
            const cfDate = new Date(cf.date);
            if (cfDate >= startDate && cfDate <= endDate && cf.type === CashFlowType.OUT) {
                hasData = true;
                const desc = cf.description?.toLowerCase() || '';
                let targetIndex = 6; // Default to Lain-lain (index 6)

                if (desc.includes("cafe") || desc.includes("kafe")) targetIndex = 0;
                else if (desc.includes("kios")) targetIndex = 1;
                else if (desc.includes("reparasi")) targetIndex = 2;
                else if (desc.includes("listrik")) targetIndex = 3;
                else if (desc.includes("transport")) targetIndex = 4;
                else if (desc.includes("sovenir") || desc.includes("souvenir")) targetIndex = 5;
                // 6 is Lain-lain
                else if (desc.includes("lengkap")) targetIndex = 7;
                else if (desc.includes("makan") || desc.includes("msk")) targetIndex = 8;
                else if (desc.includes("panjar")) targetIndex = 9;

                newExpenses[targetIndex] += cf.amount;
            }
        });

        // Add manual custom expenses
        customExpenses.forEach(item => {
            const val = Number(item.total) || 0;
            if (val > 0) {
                hasData = true;
                if (item.category.includes("CAFÉ")) newExpenses[0] += val;
                else if (item.category.includes("KIOS")) newExpenses[1] += val;
                else if (item.category.includes("REPARASI")) newExpenses[2] += val;
                else if (item.category.includes("LISTRIK")) newExpenses[3] += val;
                else if (item.category.includes("TRANSPORTASI")) newExpenses[4] += val;
                else if (item.category.includes("SOVENIR")) newExpenses[5] += val;
                else if (item.category.includes("LAIN-LAIN")) newExpenses[6] += val;
                else if (item.category.includes("PERLENGKAPAN")) newExpenses[7] += val;
                else if (item.category.includes("Makan Siang")) newExpenses[8] += val;
                else if (item.category.includes("PANJAR")) newExpenses[9] += val;
            }
        });

        if (hasData) {
            setSalesTunai(newSalesTunai.map(v => v === 0 ? "" : String(v)));
            setHppTunai(newHppTunai.map(v => v === 0 ? "" : String(v)));
            setSalesQR(newSalesQR.map(v => v === 0 ? "" : String(v)));
            setHppQR(newHppQR.map(v => v === 0 ? "" : String(v)));
            setExpenses(newExpenses.map(v => v === 0 ? "" : String(v)));
        } else {
            setSalesTunai(Array(10).fill(""));
            setHppTunai(Array(10).fill(""));
            setSalesQR(Array(10).fill(""));
            setHppQR(Array(10).fill(""));
            setExpenses(Array(10).fill(""));
        }
    }, [tanggal, transactionsStr, cashflowsStr, JSON.stringify(customExpenses)]);

    const handlePrint = () => {
        window.print();
    };


    const handleSaveArchive = async () => {
        const title = prompt("Masukkan nama/judul untuk arsip ini:", `Berita Acara - ${tanggal}`);
        if (!title) return;

        const totalTunai = salesTunai.reduce((sum, val) => sum + (Number(val) || 0), 0);
        const totalQR = salesQR.reduce((sum, val) => sum + (Number(val) || 0), 0);
        const totalExpenses = expenses.reduce((sum, val) => sum + (Number(val) || 0), 0);

        const archive = {
            id: Date.now().toString(),
            title,
            date: tanggal,
            periode,
            kasir,
            lokasi,
            salesTunai,
            hppTunai,
            salesQR,
            hppQR,
            expenses,
            customExpenses,
            catatan,
            totalIncome: totalTunai + totalQR,
            totalExpense: totalExpenses,
            totalClean: (totalTunai + totalQR) - totalExpenses,
            createdAt: Date.now()
        };

        await StorageService.saveBeritaAcaraArchive(archive);
        alert("Arsip berhasil disimpan!");
        setActiveTab("archives");
    };

    const handleDeleteArchive = async (id) => {
        if (confirm("Yakin ingin menghapus arsip ini?")) {
            await StorageService.deleteBeritaAcaraArchive(id);
            if (viewingArchive?.id === id) setViewingArchive(null);
        }
    };

    const currentTanggal = viewingArchive ? viewingArchive.date : tanggal;
    const currentPeriode = viewingArchive ? viewingArchive.periode : periode;
    const currentKasir = viewingArchive ? viewingArchive.kasir : kasir;
    const currentLokasi = viewingArchive ? viewingArchive.lokasi : lokasi;
    const currentSalesTunai = viewingArchive ? viewingArchive.salesTunai : salesTunai;
    const currentHppTunai = viewingArchive && viewingArchive.hppTunai ? viewingArchive.hppTunai : hppTunai;
    const currentSalesQR = viewingArchive ? viewingArchive.salesQR : salesQR;
    const currentHppQR = viewingArchive && viewingArchive.hppQR ? viewingArchive.hppQR : hppQR;
    const currentExpenses = viewingArchive ? viewingArchive.expenses : expenses;
    const currentCustomExpenses = viewingArchive ? viewingArchive.customExpenses : customExpenses;
    const currentCatatan = viewingArchive ? viewingArchive.catatan : catatan;

    // Redefine derivedDetailedExpenses using currentCustomExpenses
    const derivedDetailedExpensesCurrent = useMemo(() => {
        const result = {};
        DETAILED_EXPENSE_CONFIG.forEach(config => {
            result[config.title] = [];
        });

        currentCustomExpenses.forEach(item => {
            if (item.keterangan || item.qty || item.harga || item.total) {
                const section = mapCategoryToSection(item.category);
                result[section].push(item);
            }
        });

        return result;
    }, [currentCustomExpenses]);

    const handleSalesChange = (type, index, value) => {
        const val = value.replace(/[^0-9]/g, "");
        if (type === 'tunai') {
            const newData = [...salesTunai];
            newData[index] = val;
            setSalesTunai(newData);
        } else {
            const newData = [...salesQR];
            newData[index] = val;
            setSalesQR(newData);
        }
    };

    const handleHppChange = (type, index, value) => {
        const val = value.replace(/[^0-9]/g, "");
        if (type === 'tunai') {
            const newData = [...hppTunai];
            newData[index] = val;
            setHppTunai(newData);
        } else {
            const newData = [...hppQR];
            newData[index] = val;
            setHppQR(newData);
        }
    };

    const handleSalesNameChange = (type, index, value) => {
        if (type === 'tunai') {
            const newData = [...salesTunaiNames];
            newData[index] = value;
            setSalesTunaiNames(newData);
        } else {
            const newData = [...salesQRNames];
            newData[index] = value;
            setSalesQRNames(newData);
        }
    };

    const handleExpenseChange = (index, value) => {
        const newData = [...expenses];
        newData[index] = value;
        setExpenses(newData);
    };

    const handleExpenseNameChange = (index, value) => {
        const newData = [...expenseNames];
        newData[index] = value;
        setExpenseNames(newData);
    };

    // Modern Table Handlers
    const addCustomExpense = () => {
        setCustomExpenses([...customExpenses, { id: Date.now(), category: '1) CAFÉ', keterangan: '', qty: '', harga: '', total: '' }]);
    };

    const removeCustomExpense = (id) => {
        setCustomExpenses(customExpenses.filter(e => e.id !== id));
    };

    const updateCustomExpense = (id, field, value) => {
        setCustomExpenses(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, [field]: value };
                if (field === 'qty' || field === 'harga') {
                    const q = Number(field === 'qty' ? value : item.qty) || 0;
                    const h = Number(field === 'harga' ? value : item.harga) || 0;
                    if (q > 0 && h > 0) {
                        updated.total = String(q * h);
                    } else if (value === '') {
                        updated.total = '';
                    }
                }
                return updated;
            }
            return item;
        }));
    };

    // Derive printable detailed tables from customExpenses
    const derivedDetailedExpenses = useMemo(() => {
        const result = {};
        DETAILED_EXPENSE_CONFIG.forEach(config => {
            result[config.title] = [];
        });

        customExpenses.forEach(item => {
            if (item.keterangan || item.qty || item.harga || item.total) {
                const section = mapCategoryToSection(item.category);
                result[section].push(item);
            }
        });

        return result;
    }, [customExpenses]);

    const totalSalesTunai = currentSalesTunai.reduce((sum, val) => sum + (Number(val) || 0), 0);
    const totalHppTunai = currentHppTunai.reduce((sum, val) => sum + (Number(val) || 0), 0);
    const totalProfitTunai = totalSalesTunai - totalHppTunai;
    const totalSalesQR = currentSalesQR.reduce((sum, val) => sum + (Number(val) || 0), 0);
    const totalHppQR = currentHppQR.reduce((sum, val) => sum + (Number(val) || 0), 0);
    const totalProfitQR = totalSalesQR - totalHppQR;
    const totalAllSales = totalSalesTunai + totalSalesQR;
    const totalPengeluaran = currentExpenses.reduce((sum, val) => sum + (Number(val) || 0), 0);
    const netto = totalSalesTunai - totalPengeluaran;

    return (
        <div className="min-h-screen print:min-h-0 print:h-auto print:overflow-visible bg-gray-100 p-2 md:p-4 lg:p-8 print:bg-white print:p-0">
            <div className="flex flex-wrap gap-4 mb-6 print:hidden">
                <button 
                    onClick={() => { setActiveTab('input'); setViewingArchive(null); }} 
                    className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${activeTab === 'input' ? 'bg-primary text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                >
                    <Plus size={18} /> Input Baru
                </button>
                <button 
                    onClick={() => setActiveTab('archives')} 
                    className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${activeTab === 'archives' ? 'bg-primary text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                >
                    <Archive size={18} /> Daftar Arsip
                </button>
            </div>

            {activeTab === 'archives' && !viewingArchive && (
                <div className="bg-white p-6 rounded-xl shadow-md print:hidden">
                    <h2 className="text-xl font-bold mb-4 text-gray-800 border-b pb-3">Daftar Arsip Rekapan Berita Acara</h2>
                    {archives.length === 0 ? (
                        <p className="text-gray-500 py-8 text-center italic">Belum ada arsip yang tersimpan.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 text-gray-600 text-sm">
                                        <th className="p-3 border-b font-semibold">Tanggal Arsip</th>
                                        <th className="p-3 border-b font-semibold">Judul</th>
                                        <th className="p-3 border-b font-semibold">Total Pendapatan</th>
                                        <th className="p-3 border-b font-semibold">Total Pengeluaran</th>
                                        <th className="p-3 border-b font-semibold text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {archives.map(arch => (
                                        <tr key={arch.id} className="hover:bg-gray-50 transition-colors border-b last:border-b-0">
                                            <td className="p-3 text-sm text-gray-800">{new Date(arch.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</td>
                                            <td className="p-3 font-medium text-gray-800">{arch.title}</td>
                                            <td className="p-3 text-emerald-600 font-bold">Rp {arch.totalIncome?.toLocaleString('id-ID')}</td>
                                            <td className="p-3 text-red-600 font-bold">Rp {arch.totalExpense?.toLocaleString('id-ID')}</td>
                                            <td className="p-3 text-center flex justify-center gap-2">
                                                <button onClick={() => setViewingArchive(arch)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors tooltip" title="Lihat & Cetak">
                                                    <Eye size={16} />
                                                </button>
                                                <button onClick={() => handleDeleteArchive(arch.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors tooltip" title="Hapus Arsip">
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {(activeTab === 'input' || viewingArchive) && (
                <>
                {viewingArchive && (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6 flex justify-between items-center print:hidden shadow-sm">
                        <div>
                            <h3 className="font-bold text-amber-800 flex items-center gap-2"><Eye size={18} /> Sedang Melihat Arsip: {viewingArchive.title}</h3>
                            <p className="text-sm text-amber-700 mt-1">Anda dalam mode Read-Only. Untuk mengubah data, silakan kembali ke tab Input Baru.</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handlePrint} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold flex items-center gap-2 shadow-md"><Printer size={16}/> Cetak Arsip</button>
                            <button onClick={() => setViewingArchive(null)} className="p-2 bg-amber-200 hover:bg-amber-300 text-amber-800 rounded-lg"><X size={20}/></button>
                        </div>
                    </div>
                )}

            {/* Control Panel (Hidden on Print) */}
            <div className="bg-white p-6 rounded-xl shadow-md mb-8 print:hidden flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                    <input
                        type="date"
                        value={tanggal}
                        onChange={(e) => setTanggal(e.target.value)}
                        className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Periode</label>
                    <input
                        type="text"
                        value={periode}
                        onChange={(e) => setPeriode(e.target.value)}
                        placeholder="Contoh: 1 - 7 Juli 2026"
                        className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kasir</label>
                    <input
                        type="text"
                        value={kasir}
                        onChange={(e) => setKasir(e.target.value)}
                        placeholder="Nama Kasir"
                        className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                </div>
                <div className="ml-auto flex gap-3">
                    <button
                        onClick={handleSaveArchive}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-md flex items-center gap-2"
                    >
                        <Save size={18} /> Simpan sebagai Arsip
                    </button>
                    <button
                        onClick={handlePrint}
                        className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-md flex items-center gap-2"
                    >
                        <Printer size={18} /> Cetak Berita Acara
                    </button>
                </div>
            </div>

            {/* Modern Expense Input Section (Hidden on Print) */}
            <div className="bg-white p-6 rounded-xl shadow-md mb-8 print:hidden border-t-4 border-amber-600">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Input Rincian Pengeluaran</h3>
                        <p className="text-sm text-gray-500">Tabel ini akan otomatis mengisi tabel rincian (Halaman 2) dan laporan utama (Halaman 1) di format cetak.</p>
                    </div>
                </div>
                
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm text-left text-gray-600">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 w-48">Kategori</th>
                                <th className="px-4 py-3">Keterangan</th>
                                <th className="px-4 py-3 w-24">QTY</th>
                                <th className="px-4 py-3 w-32">Harga</th>
                                <th className="px-4 py-3 w-32">Total</th>
                                <th className="px-4 py-3 w-16 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customExpenses.map((exp) => (
                                <tr key={exp.id} className="border-b hover:bg-gray-50 transition-colors">
                                    <td className="p-2">
                                        <select 
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                                            value={exp.category}
                                            onChange={(e) => updateCustomExpense(exp.id, 'category', e.target.value)}
                                        >
                                            {CATEGORY_OPTIONS.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="text" 
                                            placeholder="Keterangan pengeluaran..."
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                                            value={exp.keterangan}
                                            onChange={(e) => updateCustomExpense(exp.id, 'keterangan', e.target.value)}
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            placeholder="0"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm text-center"
                                            value={exp.qty}
                                            onChange={(e) => updateCustomExpense(exp.id, 'qty', e.target.value)}
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            placeholder="0"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm text-right"
                                            value={exp.harga}
                                            onChange={(e) => updateCustomExpense(exp.id, 'harga', e.target.value)}
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="number" 
                                            placeholder="0"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm text-right font-bold text-gray-800"
                                            value={exp.total}
                                            onChange={(e) => updateCustomExpense(exp.id, 'total', e.target.value)}
                                        />
                                    </td>
                                    <td className="p-2 text-center">
                                        <button 
                                            onClick={() => removeCustomExpense(exp.id)}
                                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Hapus"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <button 
                        onClick={addCustomExpense}
                        className="flex items-center gap-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
                    >
                        <Plus size={16} /> Tambah Pengeluaran
                    </button>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100">
                        <Info size={16} className="text-blue-500 flex-shrink-0" />
                        <span>Kategori yang sama akan dikelompokkan otomatis di halaman cetak.</span>
                    </div>
                </div>
            </div>

            {/* Printable Area */}
            <div className="w-full overflow-x-auto pb-8 print:pb-0">
                <div className="bg-white mx-auto print:shadow-none text-black w-[210mm] min-w-[210mm] shadow-lg mb-8 print:mb-0">
                <style>{`
                    @media print {
                        @page {
                            size: A4 portrait;
                            margin: 10mm;
                        }
                        html, body {
                            height: auto;
                            min-height: 100%;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        .page-break {
                            page-break-before: always;
                            break-before: page;
                        }
                        /* Ensure flex containers don't force page cuts */
                        .print-page {
                            page-break-inside: avoid;
                        }
                    }
                    .brown-header {
                        background-color: #8B4513 !important;
                        color: white !important;
                        font-weight: bold;
                        padding: 4px 8px;
                        font-size: 12px;
                    }
                    .report-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 10px;
                    }
                    .report-table th, .report-table td {
                        border: 1px solid #d1d5db;
                        padding: 2px 4px;
                    }
                    .report-table th {
                        background-color: #f3f4f6;
                        text-align: center;
                        font-weight: bold;
                    }
                    .editable-cell {
                        width: 100%;
                        background: transparent;
                        outline: none;
                    }
                    .editable-cell:focus {
                        background: #fef08a;
                    }
                `}</style>

                {/* Page 1 */}
                <div className="print-page mb-4">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b-2 border-amber-900 pb-4 mb-4">
                        <div className="w-1/4">
                            <img src="/logokasir.jpg" alt="Logo" style={{ height: '70px', objectFit: 'contain' }} onError={(e) => e.target.style.display='none'} />
                        </div>
                        <div className="w-3/4 text-center">
                            <h1 className="text-xl font-bold uppercase tracking-wider mb-1">BERITA ACARA</h1>
                            <h2 className="text-sm font-bold uppercase">LAPORAN PENJUALAN DAN PENGELUARAN</h2>
                            <h3 className="text-sm font-bold text-amber-900 italic">RUMAH ETNIK PAPUA - WISATA BUDAYA PAPUA</h3>
                        </div>
                    </div>

                    {/* Section I */}
                    <div className="mb-4">
                        <div className="brown-header">I. IDENTITAS LAPORAN</div>
                        <div className="grid grid-cols-2 gap-4 mt-2 px-2 text-sm font-medium">
                            <div>
                                <div className="flex mb-1">
                                    <span className="w-24">Date</span>
                                    <span className="mr-2">:</span>
                                    <span className="border-b border-black flex-1">{tanggal.split("-").reverse().join("/")}</span>
                                </div>
                                <div className="flex">
                                    <span className="w-24">Periode</span>
                                    <span className="mr-2">:</span>
                                    <span className="border-b border-black flex-1">{periode}</span>
                                </div>
                            </div>
                            <div>
                                <div className="flex mb-1">
                                    <span className="w-24">Kasir</span>
                                    <span className="mr-2">:</span>
                                    <span className="flex-1">{kasir}</span>
                                </div>
                                <div className="flex">
                                    <span className="w-24">Lokasi</span>
                                    <span className="mr-2">:</span>
                                    <span className="flex-1">{lokasi}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section II & III */}
                    <div className="flex flex-col gap-6 mb-6">
                        {/* Section II */}
                        <div className="w-full">
                            <div className="brown-header">II. LAPORAN PENJUALAN</div>
                            <table className="report-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '5%' }}>No</th>
                                        <th style={{ width: '35%' }}>Sumber Pendapatan</th>
                                        <th style={{ width: '20%' }}>Pendapatan (Rp)</th>
                                        <th style={{ width: '20%' }}>Modal (Rp)</th>
                                        <th style={{ width: '20%' }}>Keuntungan (Rp)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentSalesTunai.map((val, idx) => {
                                        const pendapatan = Number(val) || 0;
                                        const modal = Number(currentHppTunai[idx]) || 0;
                                        const keuntungan = pendapatan - modal;
                                        const isRowEmpty = !val && !currentHppTunai[idx];
                                        return (
                                            <tr key={`sales-${idx}`}>
                                                <td className="text-center">{idx + 1}</td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        className="editable-cell" 
                                                        value={salesTunaiNames[idx]} 
                                                        onChange={(e) => handleSalesNameChange('tunai', idx, e.target.value)} 
                                                    />
                                                </td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        className="editable-cell text-right" 
                                                        value={val} 
                                                        onChange={(e) => handleSalesChange('tunai', idx, e.target.value)} 
                                                        placeholder="0"
                                                    />
                                                </td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        className="editable-cell text-right text-red-700/80" 
                                                        value={currentHppTunai[idx]} 
                                                        onChange={(e) => handleHppChange('tunai', idx, e.target.value)} 
                                                        placeholder="0"
                                                    />
                                                </td>
                                                <td className="text-right font-medium text-green-700 bg-slate-50/50 pr-2">
                                                    {isRowEmpty ? '' : keuntungan.toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="bg-[#f5e6d3] font-bold">
                                        <td colSpan={2} className="text-right">TOTAL PENJUALAN</td>
                                        <td className="text-right">Rp {totalSalesTunai.toLocaleString('id-ID')}</td>
                                        <td className="text-right text-red-700">Rp {totalHppTunai.toLocaleString('id-ID')}</td>
                                        <td className="text-right text-green-700">Rp {totalProfitTunai.toLocaleString('id-ID')}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Section III */}
                        <div className="w-full">
                            <div className="brown-header">III. LAPORAN PENJUALAN (QR)</div>
                            <table className="report-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '5%' }}>No</th>
                                        <th style={{ width: '35%' }}>Sumber Pendapatan (QR)</th>
                                        <th style={{ width: '20%' }}>Pendapatan (Rp)</th>
                                        <th style={{ width: '20%' }}>Modal (Rp)</th>
                                        <th style={{ width: '20%' }}>Keuntungan (Rp)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentSalesQR.map((val, idx) => {
                                        const pendapatan = Number(val) || 0;
                                        const modal = Number(currentHppQR[idx]) || 0;
                                        const keuntungan = pendapatan - modal;
                                        const isRowEmpty = !val && !currentHppQR[idx];
                                        return (
                                            <tr key={`salesQR-${idx}`}>
                                                <td className="text-center">{idx + 1}</td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        className="editable-cell" 
                                                        value={salesQRNames[idx]} 
                                                        onChange={(e) => handleSalesNameChange('qr', idx, e.target.value)} 
                                                    />
                                                </td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        className="editable-cell text-right" 
                                                        value={val} 
                                                        onChange={(e) => handleSalesChange('qr', idx, e.target.value)} 
                                                        placeholder="0"
                                                    />
                                                </td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        className="editable-cell text-right text-red-700/80" 
                                                        value={currentHppQR[idx]} 
                                                        onChange={(e) => handleHppChange('qr', idx, e.target.value)} 
                                                        placeholder="0"
                                                    />
                                                </td>
                                                <td className="text-right font-medium text-green-700 bg-slate-50/50 pr-2">
                                                    {isRowEmpty ? '' : keuntungan.toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="bg-[#f5e6d3] font-bold">
                                        <td colSpan={2} className="text-right">TOTAL PENJUALAN (QR)</td>
                                        <td className="text-right">Rp {totalSalesQR.toLocaleString('id-ID')}</td>
                                        <td className="text-right text-red-700">Rp {totalHppQR.toLocaleString('id-ID')}</td>
                                        <td className="text-right text-green-700">Rp {totalProfitQR.toLocaleString('id-ID')}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section IV (Rekapitulasi) */}
                    <div className="mb-4">
                        <div className="brown-header">IV. REKAPITULASI</div>
                        <div className="border border-[#d1d5db] p-4 flex flex-col md:flex-row justify-between gap-8 text-sm font-bold">
                            <div className="w-full md:w-1/3">
                                <div className="text-center bg-slate-100 p-1 mb-2">Pemasukan</div>
                                <div className="flex justify-between mb-2">
                                    <span>Penjualan Tunai</span>
                                    <span className="border-b border-black w-32 text-right text-gray-700 font-medium">Rp {totalSalesTunai.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between mb-2">
                                    <span>Penjualan QR</span>
                                    <span className="border-b border-black w-32 text-right text-gray-700 font-medium">Rp {totalSalesQR.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between text-amber-900 mt-4">
                                    <span>TOTAL</span>
                                    <span>Rp {totalAllSales.toLocaleString('id-ID')}</span>
                                </div>
                            </div>
                            
                            <div className="w-full md:w-1/3 border-t md:border-t-0 md:border-l border-slate-300 pt-4 md:pt-0 md:pl-8">
                                <div className="text-center bg-blue-50 text-blue-900 p-1 mb-2">Laba Penjualan</div>
                                <div className="flex justify-between mb-2">
                                    <span>Total Pendapatan</span>
                                    <span className="border-b border-black w-32 text-right text-gray-700 font-medium">Rp {totalAllSales.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between mb-2">
                                    <span>Total HPP (Modal)</span>
                                    <span className="border-b border-black w-32 text-right text-red-700 font-medium">Rp {(totalHppTunai + totalHppQR).toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between text-green-700 mt-4">
                                    <span>KEUNTUNGAN</span>
                                    <span className="border-b border-black w-32 text-right">Rp {((totalSalesTunai + totalSalesQR) - (totalHppTunai + totalHppQR)).toLocaleString('id-ID')}</span>
                                </div>
                            </div>

                            <div className="w-full md:w-1/3 border-t md:border-t-0 md:border-l border-slate-300 pt-4 md:pt-0 md:pl-8">
                                <div className="text-center bg-slate-100 p-1 mb-2">Setoran Fisik (Tunai)</div>
                                <div className="flex justify-between mb-2">
                                    <span>Penjualan Tunai</span>
                                    <span className="border-b border-black w-32 text-right text-gray-700 font-medium">Rp {totalSalesTunai.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between mb-2">
                                    <span>Pengeluaran</span>
                                    <span className="border-b border-black w-32 text-right text-red-700 font-medium">Rp {totalPengeluaran.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between mt-4 text-slate-800">
                                    <span>NETTO (Uang Kasir)</span>
                                    <span className="border-b border-black w-32 text-right">Rp {netto.toLocaleString('id-ID')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section V (Pengeluaran) */}
                    <div className="flex gap-4 mb-8">
                        <div className="w-1/2">
                            <div className="brown-header">IV. LAPORAN PENGELUARAN</div>
                            <table className="report-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '10%' }}>No</th>
                                        <th style={{ width: '60%' }}>SUB. KATEGORI PENGELUARAN</th>
                                        <th style={{ width: '30%' }}>Jumlah (Rp)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.map((val, idx) => (
                                        <tr key={`expense-${idx}`}>
                                            <td className="text-center">{idx + 1}</td>
                                            <td>
                                                <input 
                                                    type="text" 
                                                    className="editable-cell" 
                                                    value={expenseNames[idx]} 
                                                    onChange={(e) => handleExpenseNameChange(idx, e.target.value)} 
                                                />
                                            </td>
                                            <td>
                                                <input 
                                                    type="text" 
                                                    className="editable-cell text-right" 
                                                    value={val} 
                                                    onChange={(e) => handleExpenseChange(idx, e.target.value)} 
                                                    placeholder="0"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-[#f5e6d3] font-bold">
                                        <td colSpan={2} className="text-right">TOTAL PENGELUARAN</td>
                                        <td className="text-right">Rp {totalPengeluaran.toLocaleString('id-ID')}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="w-1/2 pt-6 pl-4">
                            <h4 className="font-bold text-sm mb-2">KATEGORI PENGELUARAN :</h4>
                            <div className="text-xs space-y-1 font-medium">
                                <p>1) CAFÉ</p>
                                <p>2) KIOS</p>
                                <p>3) REPARASI</p>
                                <p>4) LISTRIK PLN</p>
                                <p>5) TRANSPORTASI</p>
                                <p>6) SOVENIR</p>
                                <p>7) LAIN-LAIN</p>
                                <p>8) PERLENGKAPAN</p>
                                <p>9) Makan Siang Karyawan (MSK)</p>
                                <p>10) PANJAR</p>
                            </div>
                        </div>
                    </div>

                    {/* Signatures */}
                    <div className="flex justify-between text-sm mt-12 mb-12 px-8 font-medium">
                        <div className="text-center">
                            <p className="mb-16">Dibuat oleh,<br/>Kasir / Administrasi</p>
                            <p>( ................................................. )</p>
                        </div>
                        <div className="text-center">
                            <p className="mb-16">Sorong, ......./......../.............<br/>Mengetahui,<br/>Staff Keuangan</p>
                            <p>( ................................................. )</p>
                        </div>
                    </div>

                    {/* Catatan */}
                    <div className="text-sm font-bold flex gap-2">
                        <span>CATATAN :</span>
                        <textarea 
                            className="flex-1 outline-none min-h-[60px] resize-none"
                            value={catatan}
                            onChange={(e) => setCatatan(e.target.value)}
                        />
                    </div>
                </div>

                {/* Page Break for Detailed Expenses */}
                <div className="page-break"></div>

                {/* Page 2: Detailed Expenses (Dynamic Masonry Layout) */}
                <div className="print-page pb-8">
                    {(() => {
                        const activeTables = DETAILED_EXPENSE_CONFIG.map(config => ({
                            config,
                            dataRows: derivedDetailedExpensesCurrent[config.title]
                        })).filter(t => t.dataRows && t.dataRows.length > 0);

                        if (activeTables.length === 0) return null;

                        const leftTables = [];
                        const rightTables = [];
                        let leftRows = 0;
                        let rightRows = 0;

                        activeTables.forEach(t => {
                            const weight = t.dataRows.length + 3; // +3 for headers/total row
                            if (leftRows <= rightRows) {
                                leftTables.push(t);
                                leftRows += weight;
                            } else {
                                rightTables.push(t);
                                rightRows += weight;
                            }
                        });

                        const renderTable = (t) => {
                            const colTotal = t.dataRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
                            return (
                                <div key={t.config.title} className="w-full">
                                    <h4 className="font-bold text-[10px] mb-1 text-center">{t.config.title}</h4>
                                    <table className="report-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '10%' }}>NO</th>
                                                <th style={{ width: '40%' }}>KETERANGAN</th>
                                                <th style={{ width: '15%' }}>QTY</th>
                                                <th style={{ width: '15%' }}>HARGA</th>
                                                <th style={{ width: '20%' }}>TOTAL</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {t.dataRows.map((row, rowIdx) => (
                                                <tr key={`row-${t.config.title}-${rowIdx}`}>
                                                    <td className="text-center">{rowIdx + 1}</td>
                                                    <td className="font-medium text-gray-700 p-0.5 px-2 leading-tight">{row.keterangan}</td>
                                                    <td className="text-center font-medium text-gray-700 p-0.5 px-2 leading-tight">{row.qty}</td>
                                                    <td className="text-right font-medium text-gray-700 p-0.5 px-2 leading-tight">{row.harga ? Number(row.harga).toLocaleString('id-ID') : ''}</td>
                                                    <td className="text-right font-bold text-gray-800 p-0.5 px-2 leading-tight">{row.total ? Number(row.total).toLocaleString('id-ID') : ''}</td>
                                                </tr>
                                            ))}
                                            <tr>
                                                <td colSpan={4} className="font-bold text-center bg-[#f3f4f6]">TOTAL</td>
                                                <td className="text-right font-bold bg-[#f3f4f6] p-0.5 px-2">
                                                    {colTotal > 0 ? colTotal.toLocaleString('id-ID') : ''}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            );
                        };

                        return (
                            <div className="flex gap-x-6 items-start w-full">
                                <div className="w-1/2 flex flex-col gap-y-4">
                                    {leftTables.map(renderTable)}
                                </div>
                                <div className="w-1/2 flex flex-col gap-y-4">
                                    {rightTables.map(renderTable)}
                                </div>
                            </div>
                        );
                    })()}
                </div>

            </div>
            </div>
                </>
            )}
        </div>
    );
}
