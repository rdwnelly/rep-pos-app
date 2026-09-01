"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useData } from "../../../hooks/useData";
import { StorageService, notifyListeners } from "../../../services/storage";
import { CashFlowType, PaymentMethod, TransactionType } from "../../../types";
import { formatIDR, formatNumber } from "../../../utils";
import {
    Plus, PlusCircle, Trash2, Info, Save, Archive, FileText, X, Printer, Eye,
    FolderPlus, Download, Loader2, CheckCircle2, RefreshCw, AlertCircle, Sparkles, Check,
    CloudUpload, CheckCheck
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const WhatsAppIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.932 9.932 0 001.332 4.982L2 22l5.237-1.343a9.96 9.96 0 004.775 1.216h.004c5.505 0 9.988-4.478 9.989-9.984 0-2.667-1.037-5.176-2.922-7.062A9.923 9.923 0 0012.012 2zm5.834 14.164c-.247.692-1.246 1.34-1.745 1.408-.475.064-1.077.096-1.724-.112-.417-.133-.96-.31-1.666-.615-2.949-1.272-4.869-4.28-5.016-4.476-.146-.197-1.196-1.591-1.196-3.036 0-1.445.758-2.158 1.026-2.45.247-.269.544-.336.726-.336.183 0 .366.002.525.009.17.008.396-.065.62.472.247.592.84 2.052.913 2.2.073.149.122.323.024.518-.098.196-.147.32-.293.491-.146.172-.307.385-.438.518-.146.147-.298.307-.128.598.17.292.756 1.248 1.626 2.024 1.12.998 2.062 1.308 2.355 1.455.293.147.464.123.635-.073.17-.197.733-.853.929-1.147.196-.293.391-.245.659-.147.269.098 1.708.805 2.001.951.293.147.488.221.561.344.073.123.073.715-.174 1.407z" />
    </svg>
);

// Kategori penjualan dasar yang selalu muncul (urutan tampilan default)
// Tiket Masuk dan Sewa Kostum digabungkan ke kategori "Taman Etnik"
const BASE_SALES_CATEGORIES = [
    "Taman Etnik",
    "TOKO SOUVENIR",
    "Kafe & Resto",
    "Kios",
    "Paket Sopendo / Saswar / Edukasi",
    "Jasa Fotografer",
    "Sewa kostum keluar",
];

// Mapping dari categoryName (lowercase) ke nama tampilan pada Berita Acara
// Tiket Masuk dan Sewa Kostum digabung ke kategori "Taman Etnik"
const mapCategoryNameToSalesRow = (catName) => {
    const lower = (catName || "").toLowerCase().trim();
    if (!lower || lower === "umum" || lower === "tanpa kategori") return "TOKO SOUVENIR";
    if (lower.includes("sewa kostum keluar") || lower.includes("kostum keluar") || lower === "sewa kostum keluar") return "Sewa kostum keluar";
    if (lower.includes("taman etnik") || lower.includes("taman") || lower.includes("tiket") || lower.includes("sewa kostum") || lower.includes("kostum")) return "Taman Etnik";
    if (lower.includes("toko") || lower.includes("souvenir") || lower.includes("sovenir")) return "TOKO SOUVENIR";
    if (lower.includes("kafe") || lower.includes("cafe") || lower.includes("resto")) return "Kafe & Resto";
    if (lower.includes("kios")) return "Kios";
    if (lower.includes("sopendo") || lower.includes("saswar") || lower.includes("edukasi")) return "Paket Sopendo / Saswar / Edukasi";
    if (lower.includes("fotografer") || lower.includes("foto")) return "Jasa Fotografer";
    // Kembalikan nama asli kategori agar muncul sebagai baris baru otomatis
    return catName;
};

const FIXED_EXPENSE_CATEGORIES = BASE_SALES_CATEGORIES;

const OPEX_STANDARD_CATEGORIES = [
    "Pembelanjaan Café",
    "Listrik / PLN",
    "Transportasi / BBM",
    "Makan Siang Karyawan",
    "Perlengkapan & ATK",
    "REPARASI & Servis",
    "Panjar / Kasbon",
    "Beban Sewa & Pemeliharaan",
    "Beban Gaji & Upah",
    "Operasional Kasir & Toko",
    "Operasional Lain-lain"
];

const buildDefaultCategoryOptions = (salesCategories = BASE_SALES_CATEGORIES) => {
    const list = salesCategories.map((cat, idx) => `${idx + 1}) ${cat}`);
    OPEX_STANDARD_CATEGORIES.forEach(opCat => {
        if (!list.includes(opCat)) {
            list.push(opCat);
        }
    });
    return list;
};

const DEFAULT_CATEGORY_OPTIONS = buildDefaultCategoryOptions(BASE_SALES_CATEGORIES);

const DETAILED_EXPENSE_CONFIG = [
    { title: "VI. URAIAN PENGELUARAN (Taman Etnik)", rows: 10 },
    { title: "VI. URAIAN PENGELUARAN (TOKO SOUVENIR)", rows: 10 },
    { title: "VI. URAIAN PENGELUARAN (Pembelanjaan Café)", rows: 21 },
    { title: "VI. URAIAN PENGELUARAN (Biaya Kios)", rows: 10 },
    { title: "VI. URAIAN PENGELUARAN (Paket Sopendo / Saswar / Edukasi)", rows: 5 },
    { title: "VI. URAIAN PENGELUARAN (Jasa Fotografer)", rows: 5 },
    { title: "VI. URAIAN PENGELUARAN (Sewa kostum keluar)", rows: 5 },
    { title: "VI. URAIAN PENGELUARAN (REPARASI)", rows: 3 },
    { title: "VI. URAIAN PENGELUARAN (Transportasi)", rows: 2 },
    { title: "VI. URAIAN PENGELUARAN (Listrik)", rows: 2 },
    { title: "VI. URAIAN PENGELUARAN (Makan Siang Karyawan)", rows: 4 },
    { title: "VI. URAIAN PENGELUARAN (Perlengkapan)", rows: 1 },
    { title: "VI. URAIAN PENGELUARAN (Panjar)", rows: 1 },
    { title: "VI. URAIAN PENGELUARAN (Lain-lain)", rows: 5 }
];

// Helper to map category dropdown to the correct printable table
const mapCategoryToSection = (cat) => {
    if (!cat) return "VI. URAIAN PENGELUARAN (Lain-lain)";
    const lower = cat.toLowerCase().trim();
    if (lower.includes("sewa kostum keluar") || lower.includes("kostum keluar")) return "VI. URAIAN PENGELUARAN (Sewa kostum keluar)";
    if (lower.includes("taman etnik") || lower.includes("taman") || lower.includes("tiket") || lower.includes("sewa kostum") || lower.includes("kostum")) return "VI. URAIAN PENGELUARAN (Taman Etnik)";
    if (lower.includes("toko") || lower.includes("souvenir") || lower.includes("sovenir")) return "VI. URAIAN PENGELUARAN (TOKO SOUVENIR)";
    if (lower.includes("café") || lower.includes("cafe") || lower.includes("kafe") || lower.includes("resto")) return "VI. URAIAN PENGELUARAN (Pembelanjaan Café)";
    if (lower.includes("kios")) return "VI. URAIAN PENGELUARAN (Biaya Kios)";
    if (lower.includes("sopendo") || lower.includes("saswar") || lower.includes("edukasi")) return "VI. URAIAN PENGELUARAN (Paket Sopendo / Saswar / Edukasi)";
    if (lower.includes("fotografer") || lower.includes("foto")) return "VI. URAIAN PENGELUARAN (Jasa Fotografer)";
    if (lower.includes("reparasi") || lower.includes("service") || lower.includes("servis") || lower.includes("bengkel")) return "VI. URAIAN PENGELUARAN (REPARASI)";
    if (lower.includes("transportasi") || lower.includes("transport") || lower.includes("bbm") || lower.includes("bensin") || lower.includes("ongkir")) return "VI. URAIAN PENGELUARAN (Transportasi)";
    if (lower.includes("listrik") || lower.includes("pln") || lower.includes("token") || lower.includes("pdam") || lower.includes("air") || lower.includes("internet") || lower.includes("wifi")) return "VI. URAIAN PENGELUARAN (Listrik)";
    if (lower.includes("makan") || lower.includes("konsumsi") || lower.includes("lunch") || lower.includes("snack")) return "VI. URAIAN PENGELUARAN (Makan Siang Karyawan)";
    if (lower.includes("perlengkapan") || lower.includes("atk") || lower.includes("kertas") || lower.includes("nota") || lower.includes("kresek") || lower.includes("plastik")) return "VI. URAIAN PENGELUARAN (Perlengkapan)";
    if (lower.includes("panjar") || lower.includes("kasbon") || lower.includes("pinjaman")) return "VI. URAIAN PENGELUARAN (Panjar)";
    if (lower.includes("lain-lain") || lower.includes("lainnya")) return "VI. URAIAN PENGELUARAN (Lain-lain)";
    const cleaned = cat.replace(/^\d+\)\s*/, '');
    return `VI. URAIAN PENGELUARAN (${cleaned})`;
};

// Date Matching Helper (Timezone-safe & format-safe)
const isTransactionOnDate = (t, targetDate) => {
    if (!t || !t.date || !targetDate) return false;
    const rawDateStr = typeof t.date === 'string' ? t.date : '';
    const tDateOnly = rawDateStr.slice(0, 10);
    if (tDateOnly === targetDate) return true;

    const tDate = new Date(rawDateStr.includes('T') ? rawDateStr : rawDateStr.replace(' ', 'T'));
    if (isNaN(tDate.getTime())) return false;

    const year = tDate.getFullYear();
    const month = String(tDate.getMonth() + 1).padStart(2, '0');
    const day = String(tDate.getDate()).padStart(2, '0');
    const localDateOnly = `${year}-${month}-${day}`;
    if (localDateOnly === targetDate) return true;

    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);
    return tDate >= startDate && tDate <= endDate;
};

// Pure function to calculate Sales Rows from live transactions
const calculateSalesRowsForDate = (allTransactions, targetDate, salesCategories = BASE_SALES_CATEGORIES, allCategories = [], allProducts = []) => {
    if (!targetDate) {
        return {
            rows: salesCategories.map(name => ({ name, tunai: "", hppTunai: "", qr: "", hppQR: "" })),
            totalTunai: 0,
            totalQR: 0,
            matchingTxCount: 0
        };
    }

    const salesMap = {};
    salesCategories.forEach(name => {
        salesMap[name] = { tunai: 0, hppTunai: 0, qr: 0, hppQR: 0 };
    });

    let matchingTxCount = 0;
    let totalTunai = 0;
    let totalQR = 0;

    const catIdToName = {};
    (allCategories || []).forEach(c => {
        if (c && c.id && c.name) catIdToName[c.id] = c.name;
    });

    const prodIdToCatName = {};
    (allProducts || []).forEach(p => {
        if (p && p.id && (p.categoryName || p.categoryId)) {
            prodIdToCatName[p.id] = p.categoryName || catIdToName[p.categoryId] || 'Lainnya';
        }
    });

    (allTransactions || []).forEach(t => {
        if (!isTransactionOnDate(t, targetDate)) return;
        matchingTxCount++;

        if (Array.isArray(t.items)) {
            t.items.forEach(item => {
                const originalCatName = (item.categoryName ||
                    (item.categoryId ? catIdToName[item.categoryId] : null) ||
                    (item.id ? prodIdToCatName[item.id] : null) ||
                    '').trim();
                
                const mappedRowName = mapCategoryNameToSalesRow(originalCatName);
                
                // Match to registered salesCategories
                const matchedName = salesCategories.find(c => c.toLowerCase().trim() === mappedRowName.toLowerCase())
                    || salesCategories.find(c => c.toLowerCase().trim() === originalCatName.toLowerCase())
                    || (salesCategories.length > 0 ? salesCategories[0] : 'Lainnya');

                let itemTotal = (Number(item.finalPrice) || Number(item.price) || 0) * (Number(item.qty) || 1);
                let itemHpp = (Number(item.hpp) || 0) * (Number(item.qty) || 1);

                if (t.type === TransactionType.RETURN || t.type === 'RETURN') {
                    itemTotal = -itemTotal;
                    itemHpp = -itemHpp;
                }

                if (!salesMap[matchedName]) {
                    salesMap[matchedName] = { tunai: 0, hppTunai: 0, qr: 0, hppQR: 0 };
                }

                const isCash = t.paymentMethod === PaymentMethod.CASH || t.paymentMethod === 'CASH' || t.paymentMethod === 'TUNAI';

                if (isCash) {
                    salesMap[matchedName].tunai += itemTotal;
                    salesMap[matchedName].hppTunai += itemHpp;
                    totalTunai += itemTotal;
                } else {
                    salesMap[matchedName].qr += itemTotal;
                    salesMap[matchedName].hppQR += itemHpp;
                    totalQR += itemTotal;
                }
            });
        }
    });

    const rows = salesCategories
        .filter(name => name && name.trim().toLowerCase() !== 'umum')
        .map(name => {
            const vals = salesMap[name] || { tunai: 0, hppTunai: 0, qr: 0, hppQR: 0 };
            return {
                name,
                tunai: vals.tunai === 0 ? "" : String(vals.tunai),
                hppTunai: vals.hppTunai === 0 ? "" : String(vals.hppTunai),
                qr: vals.qr === 0 ? "" : String(vals.qr),
                hppQR: vals.hppQR === 0 ? "" : String(vals.hppQR),
            };
        });

    return { rows, totalTunai, totalQR, matchingTxCount };
};

// Helper to format date into readable Indonesian period name automatically
const formatPeriodeFromDate = (dateStr) => {
    if (!dateStr) return "";
    try {
        const d = new Date(dateStr + "T00:00:00");
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
        return dateStr;
    }
};

export default function BeritaAcaraPage() {
    const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
    // Periode otomatis mengikuti Tanggal Laporan yang dipilih
    const periode = useMemo(() => formatPeriodeFromDate(tanggal), [tanggal]);
    const [kasir, setKasir] = useState("");
    const [lokasi, setLokasi] = useState("Aimas - Klamono KM 21, Kabupaten Sorong, Papua Barat Daya");

    const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];
    const categories = useData(() => StorageService.getCategories(), [], 'categories') || [];
    const products = useData(() => StorageService.getProducts(), [], 'products') || [];
    const cashflows = useData(() => StorageService.getCashFlow(), [], 'cashflow') || [];
    const archives = useData(() => StorageService.getBeritaAcaraArchives(), [], 'berita_acara_archives') || [];
    const [activeTab, setActiveTab] = useState("input");
    const [viewingArchive, setViewingArchive] = useState(null);

    // Sync state
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncFeedback, setSyncFeedback] = useState(null);
    const [lastSyncedTime, setLastSyncedTime] = useState(() =>
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );

    // Kategori penjualan murni mengikuti kategori yang terdaftar pada Kelola Kategori Master (POS)
    const allSalesCategories = useMemo(() => {
        if (!categories || categories.length === 0) {
            return BASE_SALES_CATEGORIES;
        }
        const list = [];
        categories.forEach(cat => {
            if (cat && cat.name && cat.name.trim() && cat.name.trim().toLowerCase() !== 'umum') {
                const rowName = cat.name.trim();
                if (!list.includes(rowName)) {
                    list.push(rowName);
                }
            }
        });
        return list.length > 0 ? list : BASE_SALES_CATEGORIES;
    }, [categories]);

    // States for editable tables
    // State penjualan kini dinamis: array of { name, tunai, hppTunai, qr, hppQR }
    const [salesRows, setSalesRows] = useState(() =>
        allSalesCategories.map(name => ({ name, tunai: "", hppTunai: "", qr: "", hppQR: "" }))
    );

    // Summary Expense Table (Page 1) - Murni input & tulis manual kosong
    const [expenseRows, setExpenseRows] = useState(() => [
        { name: "", amount: "" },
        { name: "", amount: "" },
        { name: "", amount: "" },
        { name: "", amount: "" },
        { name: "", amount: "" },
        { name: "", amount: "" }
    ]);

    // Custom Categories State & Management
    const [categoryOptions, setCategoryOptions] = useState(() => {
        const defaultList = buildDefaultCategoryOptions(BASE_SALES_CATEGORIES);
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('custom_expense_categories');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        return parsed;
                    }
                }
            } catch (e) {
                console.error('Error loading custom expense categories:', e);
            }
        }
        return defaultList;
    });

    // Otomatis sinkronkan kategori master ke salesRows (hanya tampilkan kategori yang terdaftar di Kelola Kategori Master)
    const salesCategoriesKey = useMemo(() => allSalesCategories.join(','), [allSalesCategories]);

    useEffect(() => {
        setSalesRows(prevRows => {
            const prevMap = new Map(prevRows.map(r => [r.name.toLowerCase().trim(), r]));

            // Bangun baris penjualan murni berdasarkan kategori master saat ini
            const updatedRows = allSalesCategories.map(catName => {
                const lower = catName.toLowerCase().trim();
                if (prevMap.has(lower)) {
                    return { ...prevMap.get(lower), name: catName };
                }
                return { name: catName, tunai: "", hppTunai: "", qr: "", hppQR: "" };
            });

            return updatedRows;
        });
    }, [salesCategoriesKey]);

    // Otomatis sinkronkan kategori master baru ke categoryOptions dropdown
    useEffect(() => {
        setCategoryOptions(prevOptions => {
            const currentClean = new Set(prevOptions.map(opt => opt.replace(/^\d+\)\s*/, '').toLowerCase().trim()));
            const missing = allSalesCategories.filter(cat => !currentClean.has(cat.toLowerCase().trim()));
            if (missing.length === 0) return prevOptions;

            const newOptions = [...prevOptions];
            missing.forEach(cat => {
                newOptions.push(`${newOptions.length + 1}) ${cat}`);
            });
            try {
                localStorage.setItem('custom_expense_categories', JSON.stringify(newOptions));
            } catch (e) { }
            return newOptions;
        });
    }, [salesCategoriesKey]);

    // Modern Dynamic Expenses (Hidden on print)
    const [customExpenses, setCustomExpenses] = useState([
        { id: Date.now(), category: '1) Tiket Masuk', keterangan: '', qty: '', harga: '', total: '' }
    ]);

    // Live listener untuk perubahan/rename nama kategori dari Master Data POS
    useEffect(() => {
        const handleCategoryRenamed = (e) => {
            const { oldName, newName } = e.detail || {};
            if (!oldName || !newName || oldName.toLowerCase().trim() === newName.toLowerCase().trim()) return;
            const oldLower = oldName.toLowerCase().trim();

            // 1. Update salesRows
            setSalesRows(prev => prev.map(r => {
                if (r && r.name && r.name.toLowerCase().trim() === oldLower) {
                    return { ...r, name: newName };
                }
                return r;
            }));

            // 2. Update categoryOptions
            setCategoryOptions(prev => prev.map(opt => {
                const clean = opt.replace(/^\d+\)\s*/, '').toLowerCase().trim();
                if (clean === oldLower) {
                    const numMatch = opt.match(/^(\d+\)\s*)/);
                    return numMatch ? `${numMatch[1]}${newName}` : newName;
                }
                return opt;
            }));

            // 3. Update customExpenses
            setCustomExpenses(prev => prev.map(item => {
                if (item && item.category) {
                    const clean = item.category.replace(/^\d+\)\s*/, '').toLowerCase().trim();
                    if (clean === oldLower) {
                        const numMatch = item.category.match(/^(\d+\)\s*)/);
                        return { ...item, category: numMatch ? `${numMatch[1]}${newName}` : newName };
                    }
                }
                return item;
            }));

            // 4. Update expenseRows
            setExpenseRows(prev => prev.map(r => {
                if (r && r.name && r.name.toLowerCase().trim() === oldLower) {
                    return { ...r, name: newName };
                }
                return r;
            }));
        };

        window.addEventListener('category_renamed', handleCategoryRenamed);
        return () => {
            window.removeEventListener('category_renamed', handleCategoryRenamed);
        };
    }, []);

    const [catatan, setCatatan] = useState("");

    const loadedDateRef = useRef(null);
    const lastLocalEditTimeRef = useRef(0);

    // Compute default sales rows from transactions for current `tanggal`
    const computedSalesRows = useMemo(() => {
        if (!tanggal) return allSalesCategories.map(name => ({ name, tunai: "", hppTunai: "", qr: "", hppQR: "" }));

        return calculateSalesRowsForDate(transactions, tanggal, allSalesCategories, categories, products).rows;
    }, [tanggal, transactions, allSalesCategories, categories, products]);

    // Helper to get matching cashflow expenses for a given target date (timezone-safe)
    const getMatchingCashflowsForDate = (allCashflows, targetDate) => {
        if (!targetDate || !Array.isArray(allCashflows)) return [];

        const startDate = new Date(targetDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(targetDate);
        endDate.setHours(23, 59, 59, 999);

        return allCashflows.filter(c => {
            if (!c) return false;
            // Match Cash OUT (expenses / pengeluaran kas)
            const typeStr = (c.type || '').toString().toUpperCase();
            const isOut = typeStr === 'OUT' || typeStr === 'EXPENSE' || typeStr === 'KAS_KELUAR' || typeStr === CashFlowType.OUT;
            if (!isOut) return false;

            const rawDateStr = typeof c.date === 'string' ? c.date : '';
            const cDateOnly = rawDateStr.slice(0, 10);
            const cDate = new Date(rawDateStr.replace(' ', 'T'));
            return cDateOnly === targetDate || (!isNaN(cDate.getTime()) && cDate >= startDate && cDate <= endDate);
        });
    };

    const mapCashflowCategoryToOption = (rawCat, availableOptions) => {
        if (!rawCat) return availableOptions[0] || '1) Tiket Masuk';
        const lower = rawCat.toLowerCase().trim();

        const directMatch = availableOptions.find(opt => {
            const cleaned = opt.replace(/^\d+\)\s*/, '').toLowerCase().trim();
            return cleaned === lower || opt.toLowerCase().trim() === lower;
        });
        if (directMatch) return directMatch;

        if (lower.includes("sewa kostum keluar") || lower.includes("kostum keluar")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("sewa kostum keluar"));
            if (found) return found;
        }
        if (lower.includes("sewa kostum") || lower.includes("kostum")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("sewa kostum"));
            if (found) return found;
        }
        if (lower.includes("tiket")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("tiket"));
            if (found) return found;
        }
        if (lower.includes("kafe") || lower.includes("cafe") || lower.includes("resto")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("café") || o.toLowerCase().includes("cafe") || o.toLowerCase().includes("kafe"));
            if (found) return found;
        }
        if (lower.includes("toko") || lower.includes("souvenir")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("toko") || o.toLowerCase().includes("souvenir"));
            if (found) return found;
        }
        if (lower.includes("kios")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("kios"));
            if (found) return found;
        }
        if (lower.includes("listrik") || lower.includes("pln")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("listrik") || o.toLowerCase().includes("pln"));
            if (found) return found;
        }
        if (lower.includes("transport") || lower.includes("bbm") || lower.includes("bensin")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("transport"));
            if (found) return found;
        }
        if (lower.includes("makan") || lower.includes("konsumsi") || lower.includes("lunch")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("makan"));
            if (found) return found;
        }
        if (lower.includes("reparasi") || lower.includes("servis") || lower.includes("service")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("reparasi"));
            if (found) return found;
        }
        if (lower.includes("panjar") || lower.includes("kasbon")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("panjar"));
            if (found) return found;
        }
        if (lower.includes("perlengkapan") || lower.includes("atk")) {
            const found = availableOptions.find(o => o.toLowerCase().includes("perlengkapan"));
            if (found) return found;
        }

        return rawCat;
    };

    // Hydration & Loading Effect: Restore saved cloud archive or draft for `tanggal` (Runs ONCE per date)
    useEffect(() => {
        if (!tanggal || viewingArchive) return;
        if (loadedDateRef.current === tanggal) return;
        loadedDateRef.current = tanggal;

        let isCancelled = false;

        const hydrateData = async () => {
            // 1. Try reading draft from localStorage
            let loadedDraft = null;
            try {
                const rawDraft = localStorage.getItem(`rep_ba_draft_${tanggal}`);
                if (rawDraft) {
                    loadedDraft = JSON.parse(rawDraft);
                }
            } catch (e) {
                console.error("Failed to read local draft:", e);
            }

            // 2. Fetch fresh archive directly from Firebase Firestore
            let cloudArchive = null;
            try {
                cloudArchive = await StorageService.getBeritaAcaraByDate(tanggal);
            } catch (e) {
                console.warn("Failed to read cloud archive:", e);
            }

            if (isCancelled) return;

            const hasRealCustomExpenses = (items) => {
                return Array.isArray(items) && items.some(c => (c.keterangan && c.keterangan.trim()) || Number(c.total) > 0 || Number(c.harga) > 0);
            };

            // Prefer cloudArchive if it exists and has real expenses or is newer than local draft
            const draftUpdatedAt = loadedDraft?.updatedAt || 0;
            const cloudUpdatedAt = cloudArchive?.updatedAt || 0;

            let source = loadedDraft || cloudArchive;
            if (cloudArchive) {
                if (!loadedDraft || cloudUpdatedAt >= draftUpdatedAt || hasRealCustomExpenses(cloudArchive.customExpenses)) {
                    source = cloudArchive;
                }
            }

            if (source) {
                if (source.kasir !== undefined && source.kasir !== "") setKasir(source.kasir);
                if (source.lokasi !== undefined && source.lokasi !== "") setLokasi(source.lokasi);
                if (source.catatan !== undefined && source.catatan !== "") setCatatan(source.catatan);

                // Custom Expenses: prioritize non-empty customExpenses with actual data
                if (hasRealCustomExpenses(source.customExpenses)) {
                    setCustomExpenses(source.customExpenses);
                } else if (cloudArchive && hasRealCustomExpenses(cloudArchive.customExpenses)) {
                    setCustomExpenses(cloudArchive.customExpenses);
                } else {
                    // If draft/archive is empty or placeholder, check cashflows for this date
                    const matchingExpenses = getMatchingCashflowsForDate(cashflows, tanggal);
                    if (matchingExpenses.length > 0) {
                        setCustomExpenses(matchingExpenses.map((c, idx) => ({
                            id: c.id || Date.now() + idx,
                            category: mapCashflowCategoryToOption(c.category, categoryOptions),
                            keterangan: c.description || c.category || 'Pengeluaran Kasir',
                            qty: '1',
                            harga: String(c.amount || ''),
                            total: String(c.amount || '')
                        })));
                    } else if (!Array.isArray(source.customExpenses) || source.customExpenses.length === 0) {
                        setCustomExpenses([
                            { id: Date.now(), category: categoryOptions[0] || '1) Taman Etnik', keterangan: '', qty: '', harga: '', total: '' }
                        ]);
                    }
                }

                // Sales Rows: if live computed sales from transactions has positive values, use it to ensure no data is missed!
                const hasComputedSales = computedSalesRows.some(r => Number(r.tunai) > 0 || Number(r.qr) > 0);
                let baseRows = computedSalesRows;
                if (Array.isArray(source.salesRows) && source.salesRows.length > 0) {
                    const hasManualSales = source.salesRows.some(r => Number(r.tunai) > 0 || Number(r.qr) > 0);
                    if (!hasComputedSales && hasManualSales) {
                        baseRows = source.salesRows;
                    }
                }

                // Saring dan petakan murni ke kategori master aktif (allSalesCategories)
                const existingMap = new Map(baseRows.map(r => [r.name.toLowerCase().trim(), r]));
                const mergedSalesRows = allSalesCategories.map(name => {
                    const found = existingMap.get(name.toLowerCase().trim());
                    return found ? { ...found, name } : { name, tunai: "", hppTunai: "", qr: "", hppQR: "" };
                });
                setSalesRows(mergedSalesRows);

                // Expense Rows:
                if (Array.isArray(source.expenseRows) && source.expenseRows.length > 0) {
                    setExpenseRows(source.expenseRows);
                }
            } else {
                // Completely fresh date with no draft/archive:
                setSalesRows(computedSalesRows);

                // Check cashflows for this date
                const matchingExpenses = getMatchingCashflowsForDate(cashflows, tanggal);
                if (matchingExpenses.length > 0) {
                    setCustomExpenses(matchingExpenses.map((c, idx) => ({
                        id: c.id || Date.now() + idx,
                        category: mapCashflowCategoryToOption(c.category, categoryOptions),
                        keterangan: c.description || c.category || 'Pengeluaran Kasir',
                        qty: '1',
                        harga: String(c.amount || ''),
                        total: String(c.amount || '')
                    })));
                } else {
                    setCustomExpenses([
                        { id: Date.now(), category: categoryOptions[0] || '1) Taman Etnik', keterangan: '', qty: '', harga: '', total: '' }
                    ]);
                }
            }
        };

        hydrateData();

        return () => {
            isCancelled = true;
        };
    }, [tanggal, viewingArchive]);

    // Real-time Cloud Synchronization from Firebase Firestore (Multi-user sync)
    useEffect(() => {
        if (!tanggal || viewingArchive) return;

        const unsubscribe = StorageService.subscribeBeritaAcaraByDate(tanggal, (remoteArchive) => {
            if (!remoteArchive) return;

            // Prevent remote data from overwriting local edits if user is actively typing in the last 1.5 seconds
            const now = Date.now();
            const isActivelyEditing = (now - (lastLocalEditTimeRef.current || 0)) < 1500;
            if (isActivelyEditing) return;

            // Sync Custom Expenses live from Firestore
            if (Array.isArray(remoteArchive.customExpenses) && remoteArchive.customExpenses.length > 0) {
                const hasValidItems = remoteArchive.customExpenses.some(c => (c.keterangan && c.keterangan.trim()) || Number(c.total) > 0 || Number(c.harga) > 0);
                if (hasValidItems) {
                    setCustomExpenses(remoteArchive.customExpenses);
                }
            }

            // Sync Summary Expense Table live from Firestore
            if (Array.isArray(remoteArchive.expenseRows) && remoteArchive.expenseRows.length > 0) {
                setExpenseRows(remoteArchive.expenseRows);
            }

            // Sync header fields if not set locally
            if (remoteArchive.kasir && !kasir) setKasir(remoteArchive.kasir);
            if (remoteArchive.lokasi && !lokasi) setLokasi(remoteArchive.lokasi);
            if (remoteArchive.catatan && !catatan) setCatatan(remoteArchive.catatan);

            // Update local storage draft to keep it in sync with Cloud
            try {
                localStorage.setItem(`rep_ba_draft_${tanggal}`, JSON.stringify(remoteArchive));
            } catch (e) {
                // ignore
            }
        });

        return () => {
            if (typeof unsubscribe === 'function') unsubscribe();
        };
    }, [tanggal, viewingArchive]);

    // Automatic Synchronization: Custom Expenses -> Section V (expenseRows)
    useEffect(() => {
        if (viewingArchive) return;

        const activeItems = customExpenses.filter(item =>
            (item.keterangan && item.keterangan.trim()) ||
            (Number(item.total) > 0) ||
            (Number(item.harga) > 0 && Number(item.qty) > 0)
        );

        if (activeItems.length > 0) {
            const categoryMap = new Map();
            activeItems.forEach(item => {
                const rawCat = (item.category || 'Operasional Lain-lain').trim();
                const displayCat = rawCat.replace(/^\d+\)\s*/, '').trim() || rawCat;
                const itemTotal = Number(item.total) || (Number(item.qty || 1) * Number(item.harga || 0)) || 0;

                categoryMap.set(displayCat, (categoryMap.get(displayCat) || 0) + itemTotal);
            });

            const newRows = Array.from(categoryMap.entries()).map(([name, amount]) => ({
                name,
                amount: amount > 0 ? String(amount) : ''
            }));

            setExpenseRows(prev => {
                if (JSON.stringify(prev) === JSON.stringify(newRows)) return prev;
                return newRows;
            });
        } else {
            // Check if customExpenses was intentionally cleared or reset to empty
            const isCompletelyEmpty = customExpenses.length === 0 || (customExpenses.length === 1 && !customExpenses[0].keterangan && !customExpenses[0].total && !customExpenses[0].harga);
            if (isCompletelyEmpty) {
                setExpenseRows(prev => {
                    const hasData = prev.some(r => r.name || (Number(r.amount) > 0));
                    if (!hasData) return prev;
                    return [
                        { name: "", amount: "" },
                        { name: "", amount: "" },
                        { name: "", amount: "" },
                        { name: "", amount: "" },
                        { name: "", amount: "" },
                        { name: "", amount: "" }
                    ];
                });
            }
        }
    }, [JSON.stringify(customExpenses), viewingArchive]);

    // Master Synchronization Handler: Forces direct re-fetch from Storage/DB and live recalculation
    const handleSyncData = async ({ syncCashflow = false, silent = false } = {}) => {
        if (!tanggal) return;
        try {
            setIsSyncing(true);
            if (!silent) setSyncFeedback(null);

            // 1. Fetch fresh data directly from backend
            const [freshTx, freshCats, freshCf, freshProds, freshArch] = await Promise.all([
                StorageService.getTransactions(),
                StorageService.getCategories(),
                StorageService.getCashFlow(),
                StorageService.getProducts(),
                StorageService.getBeritaAcaraArchives()
            ]);

            // 2. Notify storage change listeners to update any active hooks
            notifyListeners();

            // 3. Build dynamic categories list strictly from fresh master categories
            const dynamicSalesCats = [];
            (freshCats || []).forEach(cat => {
                if (cat && cat.name && cat.name.trim() && cat.name.trim().toLowerCase() !== 'umum') {
                    const rowName = cat.name.trim();
                    if (!dynamicSalesCats.includes(rowName)) {
                        dynamicSalesCats.push(rowName);
                    }
                }
            });
            const finalSalesCats = dynamicSalesCats.length > 0 ? dynamicSalesCats : BASE_SALES_CATEGORIES;

            // 4. Calculate fresh sales rows
            const calculation = calculateSalesRowsForDate(freshTx, tanggal, finalSalesCats, freshCats, freshProds);
            setSalesRows(calculation.rows);

            // 5. Match Cloud Archive & Cashflow / Expenses
            const matchingExpenses = getMatchingCashflowsForDate(freshCf, tanggal);
            let cashflowUpdated = false;

            let cloudArchive = (freshArch || []).find(a => a && (a.date === tanggal || a.id === `ba_${tanggal}`));
            if (!cloudArchive) {
                try {
                    cloudArchive = await StorageService.getBeritaAcaraByDate(tanggal);
                } catch (e) {
                    console.warn("Error fetching direct cloud archive:", e);
                }
            }

            const hasCloudCustomExpenses = cloudArchive && Array.isArray(cloudArchive.customExpenses) && cloudArchive.customExpenses.some(c => (c.keterangan && c.keterangan.trim()) || Number(c.total) > 0 || Number(c.harga) > 0);

            let finalCustomExpenses = customExpenses;
            let finalExpenseRows = expenseRows;

            if (hasCloudCustomExpenses) {
                // Priority 1: Use cloud custom expenses saved in Firebase
                finalCustomExpenses = cloudArchive.customExpenses;
                setCustomExpenses(cloudArchive.customExpenses);

                if (Array.isArray(cloudArchive.expenseRows) && cloudArchive.expenseRows.length > 0) {
                    finalExpenseRows = cloudArchive.expenseRows;
                    setExpenseRows(cloudArchive.expenseRows);
                }
                if (cloudArchive.kasir && !kasir) setKasir(cloudArchive.kasir);
                if (cloudArchive.lokasi && !lokasi) setLokasi(cloudArchive.lokasi);
                if (cloudArchive.catatan && !catatan) setCatatan(cloudArchive.catatan);
            } else {
                // Priority 2: Match Cashflow expenses
                const isCustomExpensesEmpty = customExpenses.length === 0 || (customExpenses.length === 1 && !customExpenses[0].keterangan && !customExpenses[0].total && !customExpenses[0].harga);

                if ((syncCashflow || isCustomExpensesEmpty) && matchingExpenses.length > 0) {
                    finalCustomExpenses = matchingExpenses.map((c, idx) => ({
                        id: c.id || Date.now() + idx,
                        category: mapCashflowCategoryToOption(c.category, categoryOptions),
                        keterangan: c.description || c.category || 'Pengeluaran Kasir',
                        qty: '1',
                        harga: String(c.amount || ''),
                        total: String(c.amount || '')
                    }));
                    setCustomExpenses(finalCustomExpenses);
                    cashflowUpdated = true;
                }
            }

            // 6. Update draft in localStorage with live data
            const draftData = {
                id: cloudArchive?.id || `ba_${tanggal}`,
                date: tanggal,
                periode,
                kasir: kasir || cloudArchive?.kasir || '',
                lokasi: lokasi || cloudArchive?.lokasi || '',
                salesRows: calculation.rows,
                expenseRows: finalExpenseRows,
                customExpenses: finalCustomExpenses,
                catatan: catatan || cloudArchive?.catatan || '',
                updatedAt: Date.now()
            };
            try {
                localStorage.setItem(`rep_ba_draft_${tanggal}`, JSON.stringify(draftData));
            } catch (e) {
                console.error("Draft update error:", e);
            }

            const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setLastSyncedTime(nowStr);

            if (!silent) {
                const dateFmt = new Date(tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                if (calculation.matchingTxCount === 0 && matchingExpenses.length === 0) {
                    setSyncFeedback({
                        type: 'info',
                        title: 'Sinkronisasi Selesai (Tidak Ada Data)',
                        message: `Database berhasil diperiksa. Belum ada transaksi penjualan maupun arus kas keluar yang tercatat pada tanggal ${dateFmt}.`,
                        details: 'Pastikan tanggal transaksi di kasir POS sesuai dengan tanggal laporan.',
                        time: nowStr,
                        txCount: 0,
                        totalSales: 0,
                        expCount: 0
                    });
                } else {
                    setSyncFeedback({
                        type: 'success',
                        title: 'Sinkronisasi Data Berhasil!',
                        message: `Data transaksi untuk ${dateFmt} berhasil disinkronkan langsung dari sistem POS.`,
                        details: `Ditemukan ${calculation.matchingTxCount} transaksi penjualan (Tunai: ${formatIDR(calculation.totalTunai)}, Non-Tunai: ${formatIDR(calculation.totalQR)})${matchingExpenses.length > 0 ? ` & ${matchingExpenses.length} catatan pengeluaran kasir.` : '.'}`,
                        time: nowStr,
                        txCount: calculation.matchingTxCount,
                        totalSales: calculation.totalTunai + calculation.totalQR,
                        expCount: matchingExpenses.length,
                        hasPendingCashflow: matchingExpenses.length > 0 && !cashflowUpdated
                    });
                }
            }

        } catch (err) {
            console.error("Error syncing Berita Acara data:", err);
            setSyncFeedback({
                type: 'error',
                title: 'Gagal Menyinkronkan Data',
                message: 'Terjadi kesalahan saat memuat data dari database: ' + (err.message || err),
                time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            });
        } finally {
            setIsSyncing(false);
        }
    };

    const [autoSaveStatus, setAutoSaveStatus] = useState("idle");

    // Auto-save Berita Acara to localStorage (immediate) & StorageService (debounced)
    useEffect(() => {
        if (viewingArchive) return;
        if (!tanggal) return;
        if (loadedDateRef.current !== tanggal) return; // Prevent saving unhydrated initial state over real data

        const totalTunai = salesRows.reduce((sum, row) => sum + (Number(row.tunai) || 0), 0);
        const totalQR = salesRows.reduce((sum, row) => sum + (Number(row.qr) || 0), 0);
        const totalExp = expenseRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
        const totalInc = totalTunai + totalQR;

        const hasCustomExpenseData = customExpenses.some(c => c.keterangan || Number(c.total) > 0 || Number(c.harga) > 0);
        const hasData = totalInc > 0 || totalExp > 0 || kasir || periode || catatan || hasCustomExpenseData;
        if (!hasData) return;

        // Immediate LocalStorage Draft save for instant persistence
        const draftData = {
            date: tanggal,
            periode,
            kasir,
            lokasi,
            salesRows,
            expenseRows,
            customExpenses,
            catatan,
            updatedAt: Date.now()
        };
        try {
            localStorage.setItem(`rep_ba_draft_${tanggal}`, JSON.stringify(draftData));
        } catch (e) {
            console.error("Failed to save local draft:", e);
        }

        // Debounced StorageService / Firebase Firestore save (Fast auto-sync)
        const timer = setTimeout(async () => {
            try {
                setAutoSaveStatus("saving");
                const existingArchives = await StorageService.getBeritaAcaraArchives();
                const existingForDate = existingArchives.find(arch => arch.date === tanggal);

                const docId = existingForDate ? existingForDate.id : `ba_${tanggal}`;
                const nowTimestamp = Date.now();

                const archiveData = {
                    id: docId,
                    title: existingForDate ? existingForDate.title : `Berita Acara - ${tanggal}`,
                    date: tanggal,
                    periode,
                    kasir,
                    lokasi,
                    salesRows,
                    expenseRows,
                    expenses: expenseRows.map(r => r.amount),
                    customExpenses,
                    catatan,
                    totalIncome: totalInc,
                    totalExpense: totalExp,
                    totalClean: totalInc - totalExp,
                    createdAt: existingForDate ? (existingForDate.createdAt || nowTimestamp) : nowTimestamp,
                    updatedAt: nowTimestamp
                };

                await StorageService.saveBeritaAcaraArchive(archiveData, false);
                setAutoSaveStatus("saved");
            } catch (err) {
                console.error("Auto save archive error:", err);
                setAutoSaveStatus("idle");
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [tanggal, periode, kasir, lokasi, JSON.stringify(salesRows), JSON.stringify(expenseRows), JSON.stringify(customExpenses), catatan, viewingArchive]);

    const [isSavingExpenses, setIsSavingExpenses] = useState(false);
    const [expenseSaveFeedback, setExpenseSaveFeedback] = useState(null);

    // Explicit Manual Save: Saves Operational Expenses to Firebase Cloud & syncs to all devices
    const handleSaveExpensesToCloud = async () => {
        if (!tanggal) return;
        try {
            setIsSavingExpenses(true);
            setExpenseSaveFeedback(null);

            const totalTunai = salesRows.reduce((sum, row) => sum + (Number(row.tunai) || 0), 0);
            const totalQR = salesRows.reduce((sum, row) => sum + (Number(row.qr) || 0), 0);
            const totalExp = expenseRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
            const totalInc = totalTunai + totalQR;

            const existingArchives = await StorageService.getBeritaAcaraArchives();
            const existingForDate = existingArchives.find(arch => arch.date === tanggal);

            const docId = existingForDate ? existingForDate.id : `ba_${tanggal}`;
            const nowTimestamp = Date.now();

            const archiveData = {
                id: docId,
                title: existingForDate ? existingForDate.title : `Berita Acara - ${tanggal}`,
                date: tanggal,
                periode,
                kasir: kasir || '',
                lokasi: lokasi || '',
                salesRows,
                expenseRows,
                expenses: expenseRows.map(r => r.amount),
                customExpenses,
                catatan: catatan || '',
                totalIncome: totalInc,
                totalExpense: totalExp,
                totalClean: totalInc - totalExp,
                createdAt: existingForDate ? (existingForDate.createdAt || nowTimestamp) : nowTimestamp,
                updatedAt: nowTimestamp,
                lastSavedAt: new Date().toISOString(),
                syncedToCloud: true
            };

            // 1. Save directly to Firebase Firestore with notify=true to trigger real-time updates
            await StorageService.saveBeritaAcaraArchive(archiveData, true);

            // 2. Save local draft
            try {
                localStorage.setItem(`rep_ba_draft_${tanggal}`, JSON.stringify(archiveData));
            } catch (e) {
                console.error("Failed to save local draft:", e);
            }

            setAutoSaveStatus("saved");
            setExpenseSaveFeedback({
                type: 'success',
                message: `Data Rincian Pengeluaran Operasional (${customExpenses.length} baris) berhasil disimpan ke Firebase Cloud & siap dilihat di semua perangkat!`
            });

            setTimeout(() => {
                setExpenseSaveFeedback(null);
            }, 4500);
        } catch (err) {
            console.error("Gagal menyimpan pengeluaran ke cloud:", err);
            setExpenseSaveFeedback({
                type: 'error',
                message: 'Gagal menyimpan ke Firebase Cloud: ' + (err.message || err)
            });
        } finally {
            setIsSavingExpenses(false);
        }
    };

    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    const handlePrint = () => {
        window.print();
    };

    const generateBeritaAcaraPdf = async () => {
        const page1El = document.getElementById("berita-acara-page-1");
        if (!page1El) return null;

        const pdf = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });

        const pdfWidth = 210;
        const pdfHeight = 297;

        const canvasOptions = {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: "#ffffff",
            windowWidth: 794,
            onclone: (clonedDoc) => {
                const p1 = clonedDoc.getElementById("berita-acara-page-1");
                const p2 = clonedDoc.getElementById("berita-acara-page-2");
                [p1, p2].forEach(container => {
                    if (!container) return;
                    container.style.width = "794px";
                    container.style.maxWidth = "794px";
                    container.style.boxSizing = "border-box";
                    container.style.padding = "20px";
                    container.style.margin = "0 auto";
                    container.style.background = "#ffffff";

                    const inputs = container.querySelectorAll("input, textarea");
                    inputs.forEach(input => {
                        const parent = input.parentNode;
                        if (!parent) return;
                        const replacement = clonedDoc.createElement("div");
                        replacement.textContent = input.value || "";
                        replacement.className = input.className;
                        replacement.style.cssText = window.getComputedStyle(input).cssText;
                        replacement.style.border = "none";
                        replacement.style.background = "transparent";
                        replacement.style.padding = "0";
                        replacement.style.margin = "0";
                        replacement.style.lineHeight = "1.25";
                        replacement.style.minHeight = "14px";
                        replacement.style.boxSizing = "border-box";
                        if (input.classList.contains("text-right")) {
                            replacement.style.textAlign = "right";
                        } else if (input.classList.contains("text-center")) {
                            replacement.style.textAlign = "center";
                        }
                        if (input.tagName.toLowerCase() === "textarea") {
                            replacement.style.whiteSpace = "pre-wrap";
                        }
                        parent.replaceChild(replacement, input);
                    });
                });
            }
        };

        // Render Halaman 1
        const canvas1 = await html2canvas(page1El, canvasOptions);
        const imgData1 = canvas1.toDataURL("image/jpeg", 0.98);
        const imgHeight1 = (canvas1.height * pdfWidth) / canvas1.width;
        pdf.addImage(imgData1, "JPEG", 0, 0, pdfWidth, Math.min(pdfHeight, imgHeight1));

        // Render Halaman 2 jika ada rincian pengeluaran
        const page2El = document.getElementById("berita-acara-page-2");
        const hasExpenses = (currentCustomExpenses || []).some(r => (r.keterangan && r.keterangan.trim()) || Number(r.total) > 0 || Number(r.harga) > 0);
        if (page2El && hasExpenses) {
            const canvas2 = await html2canvas(page2El, canvasOptions);
            const imgData2 = canvas2.toDataURL("image/jpeg", 0.98);
            const imgHeight2 = (canvas2.height * pdfWidth) / canvas2.width;
            pdf.addPage("a4", "portrait");
            pdf.addImage(imgData2, "JPEG", 0, 0, pdfWidth, Math.min(pdfHeight, imgHeight2));
        }

        return pdf;
    };

    const handleDownloadPdf = async () => {
        try {
            setIsGeneratingPdf(true);
            const pdf = await generateBeritaAcaraPdf();
            if (pdf) {
                const fileName = `Berita_Acara_${currentTanggal}.pdf`;
                pdf.save(fileName);
            } else {
                alert("Gagal membuat dokumen PDF. Silakan coba lagi.");
            }
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Terjadi kesalahan saat mengunduh PDF: " + (error.message || error));
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handleShareWhatsApp = async () => {
        try {
            setIsGeneratingPdf(true);
            const pdf = await generateBeritaAcaraPdf();
            if (!pdf) {
                alert("Gagal membuat dokumen PDF.");
                return;
            }

            const fileName = `Berita_Acara_${currentTanggal}.pdf`;
            pdf.save(fileName);

            const textMessage =
                `*BERITA ACARA REKAPAN PENJUALAN & PENGELUARAN*
📅 Tanggal: ${currentTanggal}
👤 Kasir: ${currentKasir || '-'}
📍 Lokasi: ${currentLokasi || '-'}

💰 Total Pendapatan: ${formatIDR(totalAllSales)}
💸 Total Pengeluaran: ${formatIDR(totalPengeluaran)}
💵 Netto (Kas Bersih): ${formatIDR(netto)}

📄 _Dokumen PDF resmi Berita Acara telah otomatis diunduh ke perangkat Anda. Silakan lampirkan file PDF tersebut ke pesan WhatsApp Web ini._`;

            const encodedText = encodeURIComponent(textMessage);
            const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const waUrl = isMobile
                ? `https://api.whatsapp.com/send?text=${encodedText}`
                : `https://web.whatsapp.com/send?text=${encodedText}`;

            window.open(waUrl, "_blank");
        } catch (error) {
            console.error("Error sharing PDF to WhatsApp Web:", error);
            alert("Gagal membagikan ke WhatsApp Web: " + (error.message || error));
        } finally {
            setIsGeneratingPdf(false);
        }
    };


    const handleSaveArchive = async () => {
        const title = prompt("Masukkan nama/judul untuk arsip ini:", `Berita Acara - ${tanggal}`);
        if (!title) return;

        const totalTunai = salesRows.reduce((sum, row) => sum + (Number(row.tunai) || 0), 0);
        const totalQR = salesRows.reduce((sum, row) => sum + (Number(row.qr) || 0), 0);
        const totalExpenses = expenseRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

        const archive = {
            id: Date.now().toString(),
            title,
            date: tanggal,
            periode,
            kasir,
            lokasi,
            salesRows,
            expenseRows,
            expenses: expenseRows.map(r => r.amount),
            customExpenses,
            catatan,
            totalIncome: totalTunai + totalQR,
            totalExpense: totalExpenses,
            totalClean: (totalTunai + totalQR) - totalExpenses,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        try {
            localStorage.setItem(`rep_ba_draft_${tanggal}`, JSON.stringify(archive));
        } catch (e) { }

        await StorageService.saveBeritaAcaraArchive(archive);
        alert("Arsip berhasil disimpan!");
        setActiveTab("archives");
    };

    const handleDeleteArchive = async (id) => {
        if (confirm("Yakin ingin menghapus arsip ini?")) {
            const toDelete = (archives || []).find(a => a.id === id);
            await StorageService.deleteBeritaAcaraArchive(id);
            if (toDelete?.date) {
                try {
                    localStorage.removeItem(`rep_ba_draft_${toDelete.date}`);
                } catch (e) { }
            }
            if (viewingArchive?.id === id) setViewingArchive(null);
        }
    };

    const handleArchiveDownloadPdf = (arch) => {
        setViewingArchive(arch);
        setTimeout(() => {
            handleDownloadPdf();
        }, 150);
    };

    const handleArchivePrint = (arch) => {
        setViewingArchive(arch);
        setTimeout(() => {
            handlePrint();
        }, 150);
    };

    const handleArchiveShareWhatsApp = (arch) => {
        setViewingArchive(arch);
        setTimeout(() => {
            handleShareWhatsApp();
        }, 150);
    };

    const currentTanggal = viewingArchive ? viewingArchive.date : tanggal;
    const currentPeriode = viewingArchive ? viewingArchive.periode : periode;
    const currentKasir = viewingArchive ? viewingArchive.kasir : kasir;
    const currentLokasi = viewingArchive ? viewingArchive.lokasi : lokasi;
    // Support arsip lama (salesTunai/salesQR array) dan arsip baru (salesRows)
    const currentSalesRows = viewingArchive
        ? (viewingArchive.salesRows
            ? viewingArchive.salesRows
            : allSalesCategories.map((name, idx) => ({
                name,
                tunai: viewingArchive.salesTunai?.[idx] ?? "",
                hppTunai: viewingArchive.hppTunai?.[idx] ?? "",
                qr: viewingArchive.salesQR?.[idx] ?? "",
                hppQR: viewingArchive.hppQR?.[idx] ?? "",
            })))
        : salesRows;

    const addSalesRow = () => {
        const name = prompt("Masukkan nama kategori penjualan baru:");
        if (name && name.trim()) {
            const trimmedName = name.trim();
            setSalesRows(prev => {
                if (prev.some(r => r.name.toLowerCase() === trimmedName.toLowerCase())) return prev;
                return [...prev, { name: trimmedName, tunai: "", hppTunai: "", qr: "", hppQR: "" }];
            });
        }
    };

    const deleteSalesRow = (index) => {
        if (confirm("Hapus baris kategori penjualan ini?")) {
            setSalesRows(prev => prev.filter((_, i) => i !== index));
        }
    };

    const addExpenseRow = () => {
        setExpenseRows(prev => [...prev, { name: "", amount: "" }]);
    };

    const deleteExpenseRow = (index) => {
        setExpenseRows(prev => {
            if (prev.length <= 1) {
                return [{ name: "", amount: "" }];
            }
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleClearExpenses = () => {
        if (confirm("Kosongkan semua isian pada tabel pengeluaran?")) {
            const cleanExpenseRows = [
                { name: "", amount: "" },
                { name: "", amount: "" },
                { name: "", amount: "" },
                { name: "", amount: "" },
                { name: "", amount: "" },
                { name: "", amount: "" }
            ];
            const cleanCustomExpenses = [
                { id: Date.now(), category: categoryOptions[0] || '1) Tiket Masuk', keterangan: '', qty: '', harga: '', total: '' }
            ];
            setExpenseRows(cleanExpenseRows);
            setCustomExpenses(cleanCustomExpenses);
            try {
                const rawDraft = localStorage.getItem(`rep_ba_draft_${tanggal}`);
                if (rawDraft) {
                    const parsed = JSON.parse(rawDraft);
                    parsed.expenseRows = cleanExpenseRows;
                    parsed.customExpenses = cleanCustomExpenses;
                    localStorage.setItem(`rep_ba_draft_${tanggal}`, JSON.stringify(parsed));
                }
            } catch (e) { }
        }
    };

    const currentExpenseRows = viewingArchive
        ? (viewingArchive.expenseRows
            ? viewingArchive.expenseRows
            : (viewingArchive.expenses
                ? (viewingArchive.expenseNames
                    ? viewingArchive.expenseNames.map((name, idx) => ({ name, amount: viewingArchive.expenses[idx] ?? "" }))
                    : [
                        { name: "", amount: "" },
                        { name: "", amount: "" },
                        { name: "", amount: "" },
                        { name: "", amount: "" },
                        { name: "", amount: "" },
                        { name: "", amount: "" }
                    ])
                : [
                    { name: "", amount: "" },
                    { name: "", amount: "" },
                    { name: "", amount: "" },
                    { name: "", amount: "" },
                    { name: "", amount: "" },
                    { name: "", amount: "" }
                ]))
        : expenseRows;
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
                if (!result[section]) {
                    result[section] = [];
                }
                result[section].push(item);
            }
        });

        return result;
    }, [currentCustomExpenses]);

    // Handler untuk edit nama / nilai di baris penjualan (dinamis)
    const handleSalesRowChange = (index, field, value) => {
        const val = field === 'name' ? value : value.replace(/[^0-9-]/g, "");
        setSalesRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: val } : row));
    };

    const handleExpenseRowChange = (index, field, value) => {
        const val = field === 'name' ? value : value.replace(/[^0-9-]/g, "");
        setExpenseRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: val } : row));
    };

    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [newCatInput, setNewCatInput] = useState("");

    const handleAddCategory = (catNameInput, targetExpId = null) => {
        const trimmed = (catNameInput || "").trim();
        if (!trimmed) return;

        setCategoryOptions(prev => {
            if (prev.includes(trimmed)) return prev;
            const updated = [...prev, trimmed];
            try {
                localStorage.setItem('custom_expense_categories', JSON.stringify(updated));
            } catch (e) {
                console.error('Error saving custom categories:', e);
            }
            return updated;
        });

        if (targetExpId) {
            updateCustomExpense(targetExpId, 'category', trimmed);
        }
    };

    const handleDeleteCategory = (catName) => {
        if (confirm(`Apakah Anda yakin ingin menghapus kategori "${catName}"?`)) {
            setCategoryOptions(prev => {
                const updated = prev.filter(c => c !== catName);
                try {
                    localStorage.setItem('custom_expense_categories', JSON.stringify(updated));
                } catch (e) {
                    console.error('Error deleting category:', e);
                }
                return updated;
            });
        }
    };

    const handleResetCategories = () => {
        if (confirm("Kembalikan daftar kategori pengeluaran ke kategori bawaan?")) {
            const defaultList = buildDefaultCategoryOptions(allSalesCategories);
            setCategoryOptions(defaultList);
            try {
                localStorage.removeItem('custom_expense_categories');
            } catch (e) {
                console.error('Error resetting categories:', e);
            }
        }
    };

    const handleCategorySelect = (expId, selectedVal) => {
        lastLocalEditTimeRef.current = Date.now();
        if (selectedVal === '__ADD_NEW__') {
            const input = prompt("Masukkan nama kategori pengeluaran baru:");
            if (input && input.trim()) {
                handleAddCategory(input.trim(), expId);
            }
        } else {
            updateCustomExpense(expId, 'category', selectedVal);
        }
    };

    // Modern Table Handlers
    const addCustomExpense = () => {
        lastLocalEditTimeRef.current = Date.now();
        const defaultCat = categoryOptions[0] || '1) Taman Etnik';
        setCustomExpenses([...customExpenses, { id: Date.now(), category: defaultCat, keterangan: '', qty: '', harga: '', total: '' }]);
    };

    const removeCustomExpense = (id) => {
        lastLocalEditTimeRef.current = Date.now();
        setCustomExpenses(customExpenses.filter(e => e.id !== id));
    };

    const updateCustomExpense = (id, field, value) => {
        lastLocalEditTimeRef.current = Date.now();
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

    const totalSalesTunai = currentSalesRows.reduce((sum, row) => sum + (Number(row.tunai) || 0), 0);
    const totalHppTunai = currentSalesRows.reduce((sum, row) => sum + (Number(row.hppTunai) || 0), 0);
    const totalModalTunai = totalHppTunai;
    const totalProfitTunai = totalSalesTunai - totalHppTunai;
    const totalLabaTunai = totalProfitTunai;
    const totalSalesQR = currentSalesRows.reduce((sum, row) => sum + (Number(row.qr) || 0), 0);
    const totalHppQR = currentSalesRows.reduce((sum, row) => sum + (Number(row.hppQR) || 0), 0);
    const totalModalQR = totalHppQR;
    const totalProfitQR = totalSalesQR - totalHppQR;
    const totalLabaQR = totalProfitQR;
    const totalAllSales = totalSalesTunai + totalSalesQR;
    const totalPengeluaran = currentExpenseRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const netto = totalSalesTunai - totalPengeluaran;
    const totalLabaNetto = (totalProfitTunai + totalProfitQR) - totalPengeluaran;

    return (
        <div className="min-h-screen print:min-h-0 print:h-auto print:overflow-visible bg-slate-100 p-2 md:p-6 lg:p-8 print:bg-white print:p-0">
            {/* Header Title & Navigation Bar (Hidden on Print) */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4 mb-6 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="text-amber-600" />
                        Berita Acara & Laporan Setoran Sesi
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Rekapitulasi resmi pendapatan penjualan, pengeluaran operasional, dan setoran kasir</p>
                </div>

                <div className="flex gap-2 py-1 px-1 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <button
                        onClick={() => { setActiveTab('input'); setViewingArchive(null); }}
                        className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-lg transition-all ${activeTab === 'input' && !viewingArchive
                            ? 'bg-amber-600 text-white shadow-md'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            }`}
                    >
                        <Plus size={15} /> Form Berita Acara
                    </button>
                    <button
                        onClick={() => setActiveTab('archives')}
                        className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-lg transition-all ${activeTab === 'archives' || viewingArchive
                            ? 'bg-amber-600 text-white shadow-md'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            }`}
                    >
                        <Archive size={15} /> Daftar Arsip ({archives.length})
                    </button>
                </div>
            </div>

            {/* Metric Summary Cards Banner (Hidden on Print) */}
            {activeTab === 'input' && !viewingArchive && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6 print:hidden">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Penjualan Tunai</p>
                            <h3 className="text-lg font-extrabold text-slate-900 mt-1">{formatIDR(totalSalesTunai)}</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Penerimaan Tunai Kasir</p>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                            <FileText size={22} />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Non-Tunai / QR</p>
                            <h3 className="text-lg font-extrabold text-purple-700 mt-1">{formatIDR(totalSalesQR)}</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Transfer & QRIS Bank</p>
                        </div>
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                            <Info size={22} />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Pendapatan Kotor</p>
                            <h3 className="text-lg font-extrabold text-emerald-600 mt-1">{formatIDR(totalAllSales)}</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Tunai + Non-Tunai</p>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                            <CheckCircle2 size={22} />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pengeluaran Sesi</p>
                            <h3 className="text-lg font-extrabold text-rose-600 mt-1">{formatIDR(totalPengeluaran)}</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Operasional Kasir</p>
                        </div>
                        <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                            <Trash2 size={22} />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Setoran Bersih (Netto)</p>
                            <h3 className="text-lg font-extrabold text-amber-700 mt-1">{formatIDR(netto)}</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Tunai Dikurangi Pengeluaran</p>
                        </div>
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                            <Save size={22} />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'archives' && !viewingArchive && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:hidden">
                    <h2 className="text-lg font-bold mb-4 text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
                        <Archive size={18} className="text-amber-600" />
                        Daftar Arsip Rekapan Berita Acara
                    </h2>
                    {archives.length === 0 ? (
                        <p className="text-slate-400 py-12 text-center text-xs italic">Belum ada arsip Berita Acara yang tersimpan.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100">
                                    <tr>
                                        <th className="p-3.5">Tanggal Arsip</th>
                                        <th className="p-3.5">Judul Berita Acara</th>
                                        <th className="p-3.5">Total Pendapatan</th>
                                        <th className="p-3.5">Total Pengeluaran</th>
                                        <th className="p-3.5 text-center">Aksi Dokumen</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {archives.map(arch => (
                                        <tr key={arch.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-3.5 font-semibold text-slate-800 whitespace-nowrap">
                                                {new Date(arch.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </td>
                                            <td className="p-3.5 font-bold text-slate-800">{arch.title}</td>
                                            <td className="p-3.5 text-emerald-600 font-extrabold whitespace-nowrap">{formatIDR(arch.totalIncome)}</td>
                                            <td className="p-3.5 text-rose-600 font-extrabold whitespace-nowrap">{formatIDR(arch.totalExpense)}</td>
                                            <td className="p-3.5 text-center whitespace-nowrap">
                                                <div className="flex justify-center gap-1.5">
                                                    <button onClick={() => setViewingArchive(arch)} className="px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-[11px] font-semibold border border-amber-200 flex items-center gap-1" title="Lihat Detail">
                                                        <Eye size={13} /> Lihat
                                                    </button>
                                                    <button onClick={() => handleArchiveDownloadPdf(arch)} disabled={isGeneratingPdf} className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[11px] font-semibold border border-blue-200 flex items-center gap-1" title="Download PDF">
                                                        {isGeneratingPdf && viewingArchive?.id === arch.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PDF
                                                    </button>
                                                    <button onClick={() => handleArchivePrint(arch)} className="px-2 py-1 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-lg text-[11px] font-semibold border border-slate-200 flex items-center gap-1" title="Cetak Dokumen">
                                                        <Printer size={13} /> Cetak
                                                    </button>
                                                    <button onClick={() => handleArchiveShareWhatsApp(arch)} disabled={isGeneratingPdf} className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[11px] font-semibold border border-emerald-200 flex items-center gap-1" title="Kirim Dokumen via WhatsApp Web">
                                                        <WhatsAppIcon size={13} /> WA Web
                                                    </button>
                                                    <button onClick={() => handleDeleteArchive(arch.id)} className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg" title="Hapus Arsip">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
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
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden shadow-sm">
                            <div>
                                <h3 className="font-bold text-amber-900 flex items-center gap-2 text-sm"><Eye size={18} /> Sedang Melihat Arsip: {viewingArchive.title}</h3>
                                <p className="text-xs text-amber-700 mt-1">Mode Read-Only. Untuk mengubah data, silakan kembali ke tab Form Berita Acara.</p>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center shrink-0">
                                <button onClick={handleDownloadPdf} disabled={isGeneratingPdf} className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors">
                                    {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download PDF
                                </button>
                                <button onClick={handleShareWhatsApp} disabled={isGeneratingPdf} className="px-3.5 py-2 bg-[#25D366] hover:bg-[#20ba5a] disabled:bg-green-300 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors" title="Ekspor PDF Dokumen & Otomatis Buka WhatsApp Web">
                                    {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <WhatsAppIcon size={14} />} WhatsApp Web
                                </button>
                                <button onClick={handlePrint} className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors">
                                    <Printer size={14} /> Cetak
                                </button>
                                <button onClick={() => setViewingArchive(null)} className="p-2 bg-amber-200 hover:bg-amber-300 text-amber-800 rounded-xl transition-colors">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Control Panel (Hidden on Print) */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 print:hidden flex flex-wrap gap-4 items-end text-xs">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">Tanggal Laporan</label>
                            <input
                                type="date"
                                value={tanggal}
                                onChange={(e) => {
                                    setTanggal(e.target.value);
                                    loadedDateRef.current = null;
                                }}
                                className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-semibold text-slate-800"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">Nama Kasir</label>
                            <input
                                type="text"
                                value={kasir}
                                onChange={(e) => setKasir(e.target.value)}
                                placeholder="Nama Kasir Tugas"
                                className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none text-slate-800 font-medium"
                            />
                        </div>

                        {/* Synchronization Controls & Live Status */}
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => handleSyncData({ syncCashflow: false })}
                                disabled={isSyncing}
                                className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 hover:from-amber-700 hover:to-amber-900 disabled:opacity-60 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2 text-xs active:scale-95 shrink-0"
                                title="Sinkronkan seluruh data transaksi penjualan POS untuk tanggal ini agar tidak ada data yang tertinggal"
                            >
                                <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                                <span>{isSyncing ? "Menyinkronkan..." : "Sinkronkan Data POS"}</span>
                            </button>

                            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-600 font-medium bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 shrink-0 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span>Sinkron: <strong className="text-slate-800">{lastSyncedTime}</strong></span>
                            </div>
                        </div>

                        <div className="ml-auto flex flex-wrap gap-2 sm:gap-3 items-center">
                            {autoSaveStatus === "saving" && (
                                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl flex items-center gap-1.5 font-semibold animate-pulse">
                                    <Loader2 size={14} className="animate-spin text-amber-600" /> Menyimpan Otomatis...
                                </span>
                            )}
                            {autoSaveStatus === "saved" && (
                                <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl flex items-center gap-1.5 font-semibold">
                                    <CheckCircle2 size={14} className="text-emerald-600" /> Otomatis Tersimpan ke Arsip
                                </span>
                            )}
                            <button
                                onClick={handleDownloadPdf}
                                disabled={isGeneratingPdf}
                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-md flex items-center gap-1.5 text-xs"
                            >
                                {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                Download PDF
                            </button>
                            <button
                                onClick={handleShareWhatsApp}
                                disabled={isGeneratingPdf}
                                className="bg-[#25D366] hover:bg-[#20ba5a] disabled:bg-green-300 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-md flex items-center gap-1.5 text-xs active:scale-95"
                                title="Ekspor PDF Dokumen & Otomatis Buka WhatsApp Web"
                            >
                                {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <WhatsAppIcon size={14} />}
                                WhatsApp Web
                            </button>
                            <button
                                onClick={handlePrint}
                                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-md flex items-center gap-1.5 text-xs"
                            >
                                <Printer size={14} /> Cetak
                            </button>
                        </div>
                    </div>

                    {/* Sync Feedback Notification Banner (Hidden on Print) */}
                    {syncFeedback && (
                        <div className={`p-4 rounded-2xl border mb-6 print:hidden shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all duration-300 ${
                            syncFeedback.type === 'success' ? 'bg-emerald-50/95 border-emerald-200 text-emerald-950' :
                            syncFeedback.type === 'error' ? 'bg-rose-50/95 border-rose-200 text-rose-950' :
                            'bg-blue-50/95 border-blue-200 text-blue-950'
                        }`}>
                            <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                                    syncFeedback.type === 'success' ? 'bg-emerald-100 text-emerald-700' :
                                    syncFeedback.type === 'error' ? 'bg-rose-100 text-rose-700' :
                                    'bg-blue-100 text-blue-700'
                                }`}>
                                    {syncFeedback.type === 'success' ? <CheckCircle2 size={20} /> :
                                     syncFeedback.type === 'error' ? <AlertCircle size={20} /> :
                                     <Info size={20} />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-xs sm:text-sm">{syncFeedback.title}</h4>
                                        <span className="text-[10px] opacity-75 font-mono">({syncFeedback.time})</span>
                                    </div>
                                    <p className="text-xs mt-0.5 font-medium opacity-90">{syncFeedback.message}</p>
                                    {syncFeedback.details && (
                                        <p className="text-[11px] mt-1 font-semibold text-slate-700 bg-white/80 px-2.5 py-1 rounded-lg inline-block border border-slate-200/60 shadow-2xs">
                                            {syncFeedback.details}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0">
                                {syncFeedback.hasPendingCashflow && (
                                    <button
                                        onClick={() => handleSyncData({ syncCashflow: true })}
                                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
                                    >
                                        <RefreshCw size={12} /> Muat {syncFeedback.expCount} Arus Kas
                                    </button>
                                )}
                                <button
                                    onClick={() => setSyncFeedback(null)}
                                    className="p-1.5 hover:bg-black/5 rounded-lg transition-colors text-slate-500 hover:text-slate-800"
                                    title="Tutup Notifikasi"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Modern Expense Input Section (Hidden on Print) */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm mb-6 print:hidden border border-slate-200">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                        <FileText size={16} className="text-amber-600" />
                                        Input Rincian Pengeluaran Operasional
                                    </h3>
                                    {autoSaveStatus === "saving" ? (
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full animate-pulse">
                                            <RefreshCw size={11} className="animate-spin" /> Menyimpan ke Firebase...
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                                            <CheckCircle2 size={11} className="text-emerald-600" /> Tersimpan di Firebase (Auto-Sync)
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">Tabel ini tersimpan ke Cloud Firebase dan dapat langsung dilihat di semua perangkat kasir/admin.</p>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                                <button
                                    onClick={handleSaveExpensesToCloud}
                                    disabled={isSavingExpenses}
                                    className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-75 disabled:cursor-not-allowed text-white border border-emerald-600 px-4 py-2 rounded-xl transition-all shadow-sm shrink-0"
                                    title="Simpan data rincian pengeluaran langsung ke Firebase Cloud agar sinkron ke perangkat lain"
                                >
                                    {isSavingExpenses ? (
                                        <>
                                            <Loader2 size={15} className="animate-spin" /> Menyimpan ke Cloud...
                                        </>
                                    ) : (
                                        <>
                                            <CloudUpload size={15} /> Simpan Data Pengeluaran (Cloud)
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowCategoryModal(true)}
                                    className="flex items-center gap-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-3.5 py-2 rounded-xl transition-colors shadow-sm shrink-0"
                                >
                                    <FolderPlus size={15} className="text-amber-700" /> Kelola Kategori Pengeluaran
                                </button>
                            </div>
                        </div>

                        {expenseSaveFeedback && (
                            <div className={`p-3.5 mb-4 rounded-xl flex items-center justify-between gap-3 text-xs font-medium border ${
                                expenseSaveFeedback.type === 'success'
                                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                    : 'bg-red-50 text-red-900 border-red-200'
                            }`}>
                                <div className="flex items-center gap-2">
                                    {expenseSaveFeedback.type === 'success' ? (
                                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                                    ) : (
                                        <AlertCircle size={18} className="text-red-600 shrink-0" />
                                    )}
                                    <span>{expenseSaveFeedback.message}</span>
                                </div>
                                <button
                                    onClick={() => setExpenseSaveFeedback(null)}
                                    className="p-1 hover:bg-black/5 rounded-lg text-slate-500 hover:text-slate-800 shrink-0"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-sm text-left text-gray-600">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 w-56">Kategori</th>
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
                                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm font-medium text-gray-700"
                                                    value={exp.category}
                                                    onChange={(e) => handleCategorySelect(exp.id, e.target.value)}
                                                >
                                                    <optgroup label="Pilih Kategori">
                                                        {categoryOptions.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                        {exp.category && !categoryOptions.includes(exp.category) && (
                                                            <option value={exp.category}>{exp.category}</option>
                                                        )}
                                                    </optgroup>
                                                    <optgroup label="Opsi Tambahan">
                                                        <option value="__ADD_NEW__">➕ + Tambah Kategori Baru...</option>
                                                    </optgroup>
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
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={addCustomExpense}
                                    className="flex items-center gap-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                                >
                                    <Plus size={16} /> Tambah Pengeluaran
                                </button>
                                <button
                                    onClick={handleSaveExpensesToCloud}
                                    disabled={isSavingExpenses}
                                    className="flex items-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-75 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl transition-all shadow-sm"
                                >
                                    {isSavingExpenses ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" /> Menyimpan ke Cloud...
                                        </>
                                    ) : (
                                        <>
                                            <CloudUpload size={16} /> Simpan Data Pengeluaran
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-600 bg-blue-50 px-3.5 py-2 rounded-xl border border-blue-100">
                                <Info size={15} className="text-blue-500 flex-shrink-0" />
                                <span>Kategori yang sama akan dikelompokkan otomatis di halaman cetak.</span>
                            </div>
                        </div>
                    </div>

                    {/* Printable Area */}
                    <div className="w-full overflow-x-auto no-scrollbar pb-8 print:pb-0 bg-slate-100/60 print:bg-transparent py-4 print:py-0">
                        <style>{`
                    .no-scrollbar::-webkit-scrollbar,
                    .no-scrollbar::-webkit-scrollbar-thumb,
                    .no-scrollbar::-webkit-scrollbar-track {
                        display: none !important;
                        width: 0 !important;
                        height: 0 !important;
                        background: transparent !important;
                    }
                    .no-scrollbar {
                        -ms-overflow-style: none !important;
                        scrollbar-width: none !important;
                    }
                    @media print {
                        @page {
                            size: A4 portrait;
                            margin: 5mm;
                        }
                        html, body {
                            height: auto !important;
                            min-height: 100% !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                            background: white !important;
                            margin: 0 !important;
                            padding: 0 !important;
                        }
                        .page-break {
                            page-break-before: always !important;
                            break-before: page !important;
                            height: 0 !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            border: none !important;
                            display: block !important;
                        }
                        .print-page {
                            width: 100% !important;
                            max-width: 100% !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            box-shadow: none !important;
                            border: none !important;
                            page-break-inside: avoid !important;
                            break-inside: avoid !important;
                        }
                        #berita-acara-page-1 {
                            page-break-after: always !important;
                            break-after: page !important;
                        }
                        #berita-acara-page-2 {
                            page-break-before: always !important;
                            break-before: page !important;
                        }
                        input, textarea {
                            border: none !important;
                            box-shadow: none !important;
                            outline: none !important;
                            background: transparent !important;
                        }
                    }
                    .brown-header {
                        background-color: #8B4513 !important;
                        color: white !important;
                        font-weight: bold;
                        padding: 3px 6px;
                        font-size: 9.5px;
                        line-height: 1.3;
                    }
                    .report-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 8.5px;
                        table-layout: fixed;
                    }
                    .report-table th, .report-table td {
                        border: 1px solid #94a3b8;
                        padding: 2.5px 3.5px;
                        line-height: 1.25;
                        vertical-align: middle;
                        box-sizing: border-box;
                    }
                    .report-table th {
                        background-color: #f1f5f9;
                        text-align: center;
                        font-weight: 700;
                        color: #0f172a;
                        font-size: 8px;
                    }
                    .editable-cell {
                        width: 100%;
                        background: transparent;
                        border: none !important;
                        outline: none !important;
                        font-family: inherit;
                        font-size: 8.5px;
                        line-height: 1.25;
                        color: inherit;
                        padding: 0 !important;
                        margin: 0 !important;
                        box-sizing: border-box;
                        vertical-align: middle;
                    }
                    .editable-cell:focus {
                        background: #fef08a;
                    }
                `}</style>

                        {/* ======================================================== */}
                        {/* HALAMAN 1: BERITA ACARA UTAMA (A4 PORTRAIT) */}
                        {/* ======================================================== */}
                        <div id="berita-acara-page-1" className="print-page bg-white mx-auto text-black w-[210mm] max-w-full p-6 print:p-0 shadow-lg mb-8 print:mb-0 box-border">
                            {/* Header */}
                            <div className="flex items-center justify-between border-b-2 border-amber-900 pb-2 mb-3">
                                <div className="w-1/4">
                                    <img src="/logokasir.jpg" alt="Logo" style={{ height: '55px', objectFit: 'contain' }} onError={(e) => e.target.style.display = 'none'} />
                                </div>
                                <div className="w-3/4 text-center">
                                    <h1 className="text-lg font-bold uppercase tracking-wider mb-0.5">BERITA ACARA</h1>
                                    <h2 className="text-xs font-bold uppercase">LAPORAN PENJUALAN DAN PENGELUARAN</h2>
                                    <h3 className="text-xs font-bold text-amber-900 italic">RUMAH ETNIK PAPUA - WISATA BUDAYA PAPUA</h3>
                                </div>
                            </div>

                            {/* Section I */}
                            <div className="mb-3">
                                <div className="brown-header">I. IDENTITAS LAPORAN</div>
                                <div className="grid grid-cols-2 gap-4 mt-1.5 px-2 text-xs font-medium">
                                    <div>
                                        <div className="flex items-center mb-1">
                                            <span className="w-16 shrink-0">Date</span>
                                            <span className="mr-2">:</span>
                                            <div className="flex-1 border-b border-black pb-0.5 font-semibold text-gray-900">{currentTanggal ? currentTanggal.split("-").reverse().join("/") : ''}</div>
                                        </div>
                                        <div className="flex items-center">
                                            <span className="w-16 shrink-0">Periode</span>
                                            <span className="mr-2">:</span>
                                            <div className="flex-1 border-b border-black pb-0.5 font-semibold text-gray-900">{currentPeriode}</div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center mb-1">
                                            <span className="w-16 shrink-0">Kasir</span>
                                            <span className="mr-2">:</span>
                                            <div className="flex-1 pb-0.5 font-semibold text-gray-900">{currentKasir}</div>
                                        </div>
                                        <div className="flex items-center">
                                            <span className="w-16 shrink-0">Lokasi</span>
                                            <span className="mr-2">:</span>
                                            <div className="flex-1 pb-0.5 font-semibold text-gray-900">{currentLokasi}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section II & III - Berdampingan (Side by Side) */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                {/* Section II - Tunai */}
                                <div>
                                    <div className="brown-header flex justify-between items-center">
                                        <span>II. LAPORAN PENJUALAN (TUNAI)</span>
                                        {!viewingArchive && (
                                            <button
                                                type="button"
                                                onClick={() => handleSyncData({ syncCashflow: false })}
                                                disabled={isSyncing}
                                                className="print:hidden text-[8px] bg-amber-950/70 hover:bg-amber-950 text-amber-100 px-1.5 py-0.5 rounded flex items-center gap-1 font-normal transition-colors cursor-pointer"
                                                title="Sinkronkan data penjualan tunai dari POS"
                                            >
                                                <RefreshCw size={9} className={isSyncing ? "animate-spin" : ""} />
                                                <span>Sinkron POS</span>
                                            </button>
                                        )}
                                    </div>
                                    <table className="report-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '6%' }}>No</th>
                                                <th style={{ width: '38%' }}>Sumber Pendapatan</th>
                                                <th style={{ width: '18%' }}>Pendapatan</th>
                                                <th style={{ width: '18%' }}>Modal</th>
                                                <th style={{ width: '20%' }}>Keuntungan</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentSalesRows.map((row, idx) => {
                                                const pendapatan = Number(row.tunai) || 0;
                                                const modal = Number(row.hppTunai) || 0;
                                                const keuntungan = pendapatan - modal;
                                                const isRowEmpty = !row.tunai && !row.hppTunai;
                                                return (
                                                    <tr key={`sales-${idx}`}>
                                                        <td className="text-center">{idx + 1}</td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                className="editable-cell"
                                                                value={row.name}
                                                                onChange={(e) => handleSalesRowChange(idx, 'name', e.target.value)}
                                                                readOnly={!!viewingArchive}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                className="editable-cell text-right"
                                                                value={row.tunai ? (isNaN(Number(row.tunai)) ? row.tunai : formatNumber(row.tunai)) : ''}
                                                                onChange={(e) => handleSalesRowChange(idx, 'tunai', e.target.value)}
                                                                placeholder="0"
                                                                readOnly={!!viewingArchive}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                className="editable-cell text-right text-red-700/80"
                                                                value={row.hppTunai ? (isNaN(Number(row.hppTunai)) ? row.hppTunai : formatNumber(row.hppTunai)) : ''}
                                                                onChange={(e) => handleSalesRowChange(idx, 'hppTunai', e.target.value)}
                                                                placeholder="0"
                                                                readOnly={!!viewingArchive}
                                                            />
                                                        </td>
                                                        <td className="text-right font-medium text-green-700 bg-slate-50/50 pr-1">
                                                            {isRowEmpty ? '' : formatIDR(keuntungan)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="bg-[#f5e6d3] font-bold">
                                                <td colSpan={2} className="text-right">TOTAL PENJUALAN (TUNAI)</td>
                                                <td className="text-right">{formatIDR(totalSalesTunai)}</td>
                                                <td className="text-right text-red-700">{formatIDR(totalModalTunai)}</td>
                                                <td className="text-right text-green-700 font-bold">{formatIDR(totalLabaTunai)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    {!viewingArchive && (
                                        <button
                                            onClick={addSalesRow}
                                            className="mt-1 text-[9px] text-amber-800 hover:text-amber-950 font-bold flex items-center gap-1 print:hidden"
                                        >
                                            <PlusCircle size={10} /> Tambah Baris Penjualan
                                        </button>
                                    )}
                                </div>

                                {/* Section III - Setoran Tunai Kasir */}
                                <div>
                                    <div className="brown-header">III. LAPORAN SETORAN TUNAI KASIR</div>
                                    <table className="report-table">
                                        <thead>
                                            <tr>
                                                <th colSpan={3} className="text-left font-bold text-gray-800 bg-gray-100">
                                                    1. Total Pendapatan Penjualan Tunai
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td style={{ width: '8%' }} className="text-center">1</td>
                                                <td style={{ width: '52%' }}>Penjualan Tunai Hari ini</td>
                                                <td style={{ width: '40%' }} className="text-right font-medium text-green-700">
                                                    {formatIDR(totalSalesTunai)}
                                                </td>
                                            </tr>
                                            <tr className="bg-[#f5e6d3] font-bold">
                                                <td colSpan={2} className="text-right">JUMLAH (1)</td>
                                                <td className="text-right text-green-800">{formatIDR(totalSalesTunai)}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <table className="report-table mt-1.5">
                                        <thead>
                                            <tr>
                                                <th colSpan={3} className="text-left font-bold text-gray-800 bg-gray-100">
                                                    2. Pengeluaran Operasional Toko Hari ini
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td style={{ width: '8%' }} className="text-center">1</td>
                                                <td style={{ width: '52%' }}>Dipotong Pengeluaran (V)</td>
                                                <td style={{ width: '40%' }} className="text-right font-medium text-red-700">
                                                    - {formatIDR(totalPengeluaran)}
                                                </td>
                                            </tr>
                                            <tr className="bg-[#fee2e2] font-bold text-red-950">
                                                <td colSpan={2} className="text-right">JUMLAH (2)</td>
                                                <td className="text-right text-red-700">- {formatIDR(totalPengeluaran)}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <table className="report-table mt-1.5">
                                        <thead>
                                            <tr>
                                                <th colSpan={3} className="text-left font-bold text-gray-800 bg-gray-100">
                                                    3. SETORAN FISIK (TUNAI) = (1 - 2)
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td style={{ width: '8%' }} className="text-center">1</td>
                                                <td style={{ width: '52%' }}>Setoran Bruto</td>
                                                <td style={{ width: '40%' }} className="text-right font-medium">{formatIDR(totalSalesTunai)}</td>
                                            </tr>
                                            <tr>
                                                <td className="text-center">2</td>
                                                <td>Dipotong Pengeluaran (V)</td>
                                                <td className="text-right font-medium text-red-700">- {formatIDR(totalPengeluaran)}</td>
                                            </tr>
                                            <tr className="bg-[#dcfce7] font-extrabold text-green-950">
                                                <td colSpan={2} className="text-right">NETTO (UANG FISIK KASIR)</td>
                                                <td className="text-right font-mono text-green-800 text-[10px]">{formatIDR(netto)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Section IV & V - Berdampingan (Side by Side) */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                {/* Section IV - QR Code */}
                                <div>
                                    <div className="brown-header flex justify-between items-center">
                                        <span>IV. LAPORAN PENJUALAN (NON-TUNAI / QR)</span>
                                        {!viewingArchive && (
                                            <button
                                                type="button"
                                                onClick={() => handleSyncData({ syncCashflow: false })}
                                                disabled={isSyncing}
                                                className="print:hidden text-[8px] bg-amber-950/70 hover:bg-amber-950 text-amber-100 px-1.5 py-0.5 rounded flex items-center gap-1 font-normal transition-colors cursor-pointer"
                                                title="Sinkronkan data penjualan non-tunai dari POS"
                                            >
                                                <RefreshCw size={9} className={isSyncing ? "animate-spin" : ""} />
                                                <span>Sinkron POS</span>
                                            </button>
                                        )}
                                    </div>
                                    <table className="report-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '6%' }}>No</th>
                                                <th style={{ width: '38%' }}>Sumber Pendapatan</th>
                                                <th style={{ width: '18%' }}>Pendapatan</th>
                                                <th style={{ width: '18%' }}>Modal</th>
                                                <th style={{ width: '20%' }}>Keuntungan</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentSalesRows.map((row, idx) => {
                                                const pendapatan = Number(row.qr) || 0;
                                                const modal = Number(row.hppQR) || 0;
                                                const keuntungan = pendapatan - modal;
                                                const isRowEmpty = !row.qr && !row.hppQR;
                                                return (
                                                    <tr key={`sales-qr-${idx}`}>
                                                        <td className="text-center">{idx + 1}</td>
                                                        <td className="font-medium text-gray-800">{row.name}</td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                className="editable-cell text-right"
                                                                value={row.qr ? (isNaN(Number(row.qr)) ? row.qr : formatNumber(row.qr)) : ''}
                                                                onChange={(e) => handleSalesRowChange(idx, 'qr', e.target.value)}
                                                                placeholder="0"
                                                                readOnly={!!viewingArchive}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                className="editable-cell text-right text-red-700/80"
                                                                value={row.hppQR ? (isNaN(Number(row.hppQR)) ? row.hppQR : formatNumber(row.hppQR)) : ''}
                                                                onChange={(e) => handleSalesRowChange(idx, 'hppQR', e.target.value)}
                                                                placeholder="0"
                                                                readOnly={!!viewingArchive}
                                                            />
                                                        </td>
                                                        <td className="text-right font-medium text-blue-700 bg-slate-50/50 pr-1">
                                                            {isRowEmpty ? '' : formatIDR(keuntungan)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="bg-[#e0f2fe] font-bold">
                                                <td colSpan={2} className="text-right">TOTAL PENJUALAN (QR)</td>
                                                <td className="text-right">{formatIDR(totalSalesQR)}</td>
                                                <td className="text-right text-red-700">{formatIDR(totalModalQR)}</td>
                                                <td className="text-right text-blue-700 font-bold">{formatIDR(totalLabaQR)}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {/* Rekapitulasi Laba Rugi Penjualan */}
                                    <table className="report-table mt-2">
                                        <thead>
                                            <tr>
                                                <th colSpan={3} className="text-left font-bold text-gray-800 bg-gray-100">
                                                    2. REKAPITULASI LABA PENJUALAN (NETTO PROFIT)
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td style={{ width: '8%' }} className="text-center">1</td>
                                                <td style={{ width: '52%' }}>Keuntungan Laba Penjualan (Tunai)</td>
                                                <td style={{ width: '40%' }} className="text-right font-medium text-green-700">{formatIDR(totalLabaTunai)}</td>
                                            </tr>
                                            <tr>
                                                <td className="text-center">2</td>
                                                <td>Keuntungan Laba Penjualan (QR)</td>
                                                <td className="text-right font-medium text-blue-700">{formatIDR(totalLabaQR)}</td>
                                            </tr>
                                            <tr className="bg-slate-100 font-bold">
                                                <td colSpan={2} className="text-right">TOTAL LABA KOTOR</td>
                                                <td className="text-right font-mono">{formatIDR(totalLabaTunai + totalLabaQR)}</td>
                                            </tr>
                                            <tr>
                                                <td className="text-center">3</td>
                                                <td>Dipotong Beban Pengeluaran (V)</td>
                                                <td className="text-right font-medium text-red-700">- {formatIDR(totalPengeluaran)}</td>
                                            </tr>
                                            <tr className="bg-[#fef08a] font-extrabold text-amber-950">
                                                <td colSpan={2} className="text-right">KEUNTUNGAN BERSIH (NETTO)</td>
                                                <td className="text-right font-mono text-amber-900 text-[10px]">{formatIDR(totalLabaNetto)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* Section V - Pengeluaran */}
                                <div>
                                    <div className="brown-header">V. LAPORAN PENGELUARAN</div>
                                    <table className="report-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '8%' }}>No</th>
                                                <th style={{ width: '58%' }}>KATEGORI PENGELUARAN</th>
                                                <th style={{ width: '28%' }}>Jumlah (Rp)</th>
                                                {!viewingArchive && <th style={{ width: '6%' }} className="print:hidden">Aksi</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const activeRows = currentExpenseRows.filter(r => (r.name && r.name.trim()) || (Number(r.amount) > 0));
                                                if (activeRows.length === 0) {
                                                    return (
                                                        <tr>
                                                            <td colSpan={!viewingArchive ? 4 : 3} className="p-3 text-center text-slate-400 italic text-[9px] print:text-[6.5pt]">
                                                                Belum ada catatan pengeluaran operasional (biaya) yang terinput pada hari ini.
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return activeRows.map((row, idx) => (
                                                    <tr key={`expense-${idx}`}>
                                                        <td className="text-center font-mono">{idx + 1}</td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                className="editable-cell"
                                                                value={row.name}
                                                                onChange={(e) => handleExpenseRowChange(idx, 'name', e.target.value)}
                                                                placeholder="Tulis kategori pengeluaran..."
                                                                readOnly={!!viewingArchive}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                className="editable-cell text-right font-mono font-bold text-red-700"
                                                                value={row.amount ? (isNaN(Number(row.amount)) ? row.amount : formatNumber(row.amount)) : ''}
                                                                onChange={(e) => handleExpenseRowChange(idx, 'amount', e.target.value)}
                                                                placeholder="0"
                                                                readOnly={!!viewingArchive}
                                                            />
                                                        </td>
                                                        {!viewingArchive && (
                                                            <td className="text-center print:hidden p-0.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => deleteExpenseRow(idx)}
                                                                    className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-50"
                                                                    title="Hapus Baris Ini"
                                                                >
                                                                    <Trash2 size={11} />
                                                                </button>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ));
                                            })()}
                                            <tr className="bg-[#fee2e2] font-extrabold text-red-950">
                                                <td colSpan={!viewingArchive ? 2 : 2} className="text-right uppercase">TOTAL PENGELUARAN</td>
                                                <td className="text-right text-red-700 font-bold font-mono">{formatIDR(totalPengeluaran)}</td>
                                                {!viewingArchive && <td className="print:hidden"></td>}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Signatures */}
                            <div className="flex justify-between text-xs mt-4 mb-4 px-8 font-medium">
                                <div className="text-center">
                                    <p className="mb-10">Dibuat oleh,<br />Kasir / Administrasi</p>
                                    <p>( ................................................. )</p>
                                </div>
                                <div className="text-center">
                                    <p className="mb-10">Sorong, ......./......../.............<br />Mengetahui,<br />Staff Keuangan</p>
                                    <p>( ................................................. )</p>
                                </div>
                            </div>

                            {/* Catatan */}
                            <div className="text-xs font-bold flex gap-2 items-start border-t border-gray-200 pt-2">
                                <span className="shrink-0 pt-0.5">CATATAN :</span>
                                <textarea
                                    className="flex-1 outline-none min-h-[36px] resize-none border border-gray-200 rounded p-1 text-xs print:border-none print:p-0"
                                    value={catatan}
                                    onChange={(e) => setCatatan(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* ======================================================== */}
                        {/* HALAMAN 2: LAMPIRAN VI. URAIAN PENGELUARAN (A4 PORTRAIT) */}
                        {/* ======================================================== */}
                        {(() => {
                            const allSectionTitles = [
                                ...DETAILED_EXPENSE_CONFIG.map(c => c.title),
                                ...Object.keys(derivedDetailedExpensesCurrent).filter(t => !DETAILED_EXPENSE_CONFIG.some(c => c.title === t))
                            ];

                            const activeTables = allSectionTitles.map(title => {
                                const allRows = derivedDetailedExpensesCurrent[title] || [];
                                const validRows = allRows.filter(r => (r.keterangan && r.keterangan.trim()) || Number(r.total) > 0 || Number(r.harga) > 0);
                                return {
                                    config: { title },
                                    dataRows: validRows
                                };
                            }).filter(t => t.dataRows && t.dataRows.length > 0);

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
                                const categoryCleanName = t.config.title.replace(/^VI\.\s*URAIAN\s*PENGELUARAN\s*\(?/i, '').replace(/\)?$/, '').trim() || t.config.title;
                                return (
                                    <div key={t.config.title} className="w-full border border-slate-300 rounded overflow-hidden shadow-2xs mb-2.5 break-inside-avoid">
                                        <div className="brown-header text-[9.5px] text-center font-bold uppercase tracking-wider py-1">
                                            POS: {categoryCleanName.toUpperCase()}
                                        </div>
                                        <table className="report-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '8%' }} className="text-center">NO</th>
                                                    <th style={{ width: '44%' }} className="text-left px-1.5">KETERANGAN</th>
                                                    <th style={{ width: '12%' }} className="text-center">QTY</th>
                                                    <th style={{ width: '18%' }} className="text-right px-1.5">HARGA (Rp)</th>
                                                    <th style={{ width: '18%' }} className="text-right px-1.5">TOTAL (Rp)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {t.dataRows.map((row, rowIdx) => (
                                                    <tr key={`row-${t.config.title}-${rowIdx}`} className="odd:bg-white even:bg-slate-50/70">
                                                        <td className="text-center font-mono text-slate-600">{rowIdx + 1}</td>
                                                        <td className="font-semibold text-slate-800 p-1 px-1.5 leading-tight">{row.keterangan}</td>
                                                        <td className="text-center font-mono text-slate-700 p-1 px-1 leading-tight">{row.qty || '1'}</td>
                                                        <td className="text-right font-mono text-slate-700 p-1 px-1.5 leading-tight">{row.harga ? formatIDR(row.harga) : '-'}</td>
                                                        <td className="text-right font-mono font-bold text-red-700 p-1 px-1.5 leading-tight">{row.total ? formatIDR(row.total) : '-'}</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-[#fee2e2] font-extrabold text-red-950 border-t border-slate-300">
                                                    <td colSpan={4} className="text-right uppercase px-2 py-0.5 text-[8px]">SUBTOTAL ({categoryCleanName})</td>
                                                    <td className="text-right font-mono text-red-700 font-black p-1 px-1.5 text-[8.5px]">
                                                        {colTotal > 0 ? formatIDR(colTotal) : 'Rp 0'}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            };

                            return (
                                <>
                                    <div className="page-break"></div>
                                    <div id="berita-acara-page-2" className="print-page bg-white mx-auto text-black w-[210mm] max-w-full p-6 print:p-0 shadow-lg mb-8 print:mb-0 box-border">
                                        {/* Formal Page 2 Header */}
                                        <div className="flex items-center justify-between border-b-2 border-amber-900 pb-2 mb-3">
                                            <div className="w-1/4">
                                                <img src="/logokasir.jpg" alt="Logo" style={{ height: '48px', objectFit: 'contain' }} onError={(e) => e.target.style.display = 'none'} />
                                            </div>
                                            <div className="w-3/4 text-center">
                                                <h1 className="text-base font-bold uppercase tracking-wider mb-0.5">BERITA ACARA - LAMPIRAN</h1>
                                                <h2 className="text-xs font-bold uppercase text-amber-900">VI. URAIAN RINCIAN PENGELUARAN OPERASIONAL</h2>
                                                <h3 className="text-[10px] font-medium text-gray-600">RUMAH ETNIK PAPUA - WISATA BUDAYA PAPUA</h3>
                                            </div>
                                        </div>

                                        {/* Sub-bar Info */}
                                        <div className="bg-amber-50/80 border border-amber-200 rounded px-3 py-1.5 mb-3 flex justify-between items-center text-[10px] font-medium text-gray-800">
                                            <div><strong>Tanggal:</strong> {currentTanggal ? currentTanggal.split("-").reverse().join("/") : ''}</div>
                                            <div><strong>Periode:</strong> {currentPeriode}</div>
                                            <div><strong>Kasir:</strong> {currentKasir || '-'}</div>
                                            <div><strong>Lokasi:</strong> {currentLokasi || '-'}</div>
                                        </div>

                                        {/* 2 Column Layout */}
                                        <div className="flex gap-x-4 items-start w-full mb-4">
                                            <div className="w-1/2 flex flex-col">
                                                {leftTables.map(renderTable)}
                                            </div>
                                            <div className="w-1/2 flex flex-col">
                                                {rightTables.map(renderTable)}
                                            </div>
                                        </div>

                                        {/* Grand Total Footer */}
                                        <div className="border border-red-300 bg-[#fee2e2] rounded p-2 flex justify-between items-center text-xs font-extrabold text-red-950 mb-4">
                                            <span className="uppercase tracking-wider">TOTAL KESELURUHAN PENGELUARAN (VI. URAIAN OPERASIONAL)</span>
                                            <span className="font-mono text-sm text-red-700 font-black">{formatIDR(totalPengeluaran)}</span>
                                        </div>

                                        {/* Page 2 Validation Signatures */}
                                        <div className="flex justify-between text-xs mt-6 px-8 font-medium">
                                            <div className="text-center">
                                                <p className="mb-8">Dibuat oleh,<br />Kasir / Administrasi</p>
                                                <p className="font-bold">(&nbsp;&nbsp;{kasir || '........................................'}&nbsp;&nbsp;)</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="mb-8">Sorong, {tanggal.split("-").reverse().join("/")}<br />Mengetahui,<br />Staff Keuangan</p>
                                                <p>( ................................................. )</p>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </>
            )}

            {/* Category Management Modal */}
            {showCategoryModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-fadeIn">
                        <div className="flex justify-between items-center pb-4 border-b">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <FolderPlus className="text-amber-600" size={20} /> Kelola Kategori Pengeluaran
                            </h3>
                            <button
                                onClick={() => setShowCategoryModal(false)}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="my-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tambah Kategori Baru</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Contoh: BBM & Transportasi Khusus"
                                    className="flex-1 border border-gray-300 rounded-lg px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                    value={newCatInput}
                                    onChange={(e) => setNewCatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAddCategory(newCatInput);
                                            setNewCatInput("");
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        handleAddCategory(newCatInput);
                                        setNewCatInput("");
                                    }}
                                    className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-1 shrink-0"
                                >
                                    <Plus size={16} /> Tambah
                                </button>
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Daftar Kategori Saat Ini ({categoryOptions.length})
                                </h4>
                                <button
                                    onClick={handleResetCategories}
                                    className="text-xs text-amber-700 hover:text-amber-900 underline font-medium"
                                >
                                    Reset Bawaan
                                </button>
                            </div>
                            {categoryOptions.length === 0 ? (
                                <p className="text-center text-xs text-gray-400 py-6 italic border border-dashed rounded-lg">
                                    Belum ada kategori pengeluaran. Silakan tambah kategori baru di atas.
                                </p>
                            ) : (
                                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                                    {categoryOptions.map((cat, idx) => (
                                        <div key={cat} className="flex justify-between items-center p-2.5 text-sm hover:bg-gray-50 transition-colors">
                                            <span className="font-medium text-gray-800 flex items-center gap-2">
                                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">{idx + 1}</span>
                                                {cat}
                                            </span>
                                            <button
                                                onClick={() => handleDeleteCategory(cat)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                                                title="Hapus Kategori"
                                            >
                                                <Trash2 size={14} /> Hapus
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t flex justify-end">
                            <button
                                onClick={() => setShowCategoryModal(false)}
                                className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors"
                            >
                                Selesai
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
