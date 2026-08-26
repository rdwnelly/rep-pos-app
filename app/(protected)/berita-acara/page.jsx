"use client";

import { useState, useMemo, useEffect } from "react";
import { useData } from "../../../hooks/useData";
import { StorageService } from "../../../services/storage";
import { CashFlowType, PaymentMethod, TransactionType } from "../../../types";
import { Plus, Trash2, Info, Save, Archive, FileText, X, Printer, Eye, FolderPlus, Download, Loader2, CheckCircle2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const WhatsAppIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.932 9.932 0 001.332 4.982L2 22l5.237-1.343a9.96 9.96 0 004.775 1.216h.004c5.505 0 9.988-4.478 9.989-9.984 0-2.667-1.037-5.176-2.922-7.062A9.923 9.923 0 0012.012 2zm5.834 14.164c-.247.692-1.246 1.34-1.745 1.408-.475.064-1.077.096-1.724-.112-.417-.133-.96-.31-1.666-.615-2.949-1.272-4.869-4.28-5.016-4.476-.146-.197-1.196-1.591-1.196-3.036 0-1.445.758-2.158 1.026-2.45.247-.269.544-.336.726-.336.183 0 .366.002.525.009.17.008.396-.065.62.472.247.592.84 2.052.913 2.2.073.149.122.323.024.518-.098.196-.147.32-.293.491-.146.172-.307.385-.438.518-.146.147-.298.307-.128.598.17.292.756 1.248 1.626 2.024 1.12.998 2.062 1.308 2.355 1.455.293.147.464.123.635-.073.17-.197.733-.853.929-1.147.196-.293.391-.245.659-.147.269.098 1.708.805 2.001.951.293.147.488.221.561.344.073.123.073.715-.174 1.407z"/>
    </svg>
);

// Kategori penjualan dasar yang selalu muncul (urutan tampilan default)
// Tiket Masuk dan Sewa Kostum kini dipisah menjadi 2 kategori berbeda
const BASE_SALES_CATEGORIES = [
    "Tiket Masuk",
    "Sewa Kostum",
    "Toko / Souvenir",
    "Kafe & Resto",
    "Kios",
    "Paket Sopendo / Saswar / Edukasi",
    "Jasa Fotografer",
    "Sewa kostum keluar",
];

// Mapping dari categoryName (lowercase) ke nama tampilan pada Berita Acara
// Jika kategori tidak cocok dengan pola ini, akan ditambahkan sebagai baris baru secara otomatis
const mapCategoryNameToSalesRow = (catName) => {
    const lower = catName.toLowerCase();
    if (lower.includes("tiket")) return "Tiket Masuk";
    if (lower.includes("sewa kostum") || lower.includes("kostum")) return "Sewa Kostum";
    if (lower.includes("toko") || lower.includes("souvenir") || lower.includes("sovenir")) return "Toko / Souvenir";
    if (lower.includes("kafe") || lower.includes("cafe") || lower.includes("resto")) return "Kafe & Resto";
    if (lower.includes("kios")) return "Kios";
    if (lower.includes("sopendo") || lower.includes("saswar") || lower.includes("edukasi")) return "Paket Sopendo / Saswar / Edukasi";
    if (lower.includes("fotografer") || lower.includes("foto")) return "Jasa Fotografer";
    // Kembalikan nama asli kategori agar muncul sebagai baris baru otomatis
    return catName;
};

const FIXED_EXPENSE_CATEGORIES = BASE_SALES_CATEGORIES;

const DEFAULT_CATEGORY_OPTIONS = BASE_SALES_CATEGORIES.map((cat, idx) => `${idx + 1}) ${cat}`);

const DETAILED_EXPENSE_CONFIG = [
    { title: "VI. URAIAN PENGELUARAN (Tiket Masuk)", rows: 10 },
    { title: "VI. URAIAN PENGELUARAN (Sewa Kostum)", rows: 10 },
    { title: "VI. URAIAN PENGELUARAN (Toko / Souvenir)", rows: 10 },
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
    if (cat.includes("Tiket")) return "VI. URAIAN PENGELUARAN (Tiket Masuk)";
    if (cat.includes("Sewa Kostum") || cat.includes("Kostum")) return "VI. URAIAN PENGELUARAN (Sewa Kostum)";
    if (cat.includes("Toko") || cat.includes("Souvenir") || cat.includes("Sovenir")) return "VI. URAIAN PENGELUARAN (Toko / Souvenir)";
    if (cat.includes("CAFÉ") || cat.includes("Kafe") || cat.includes("Resto")) return "VI. URAIAN PENGELUARAN (Pembelanjaan Café)";
    if (cat.includes("KIOS") || cat.includes("Kios")) return "VI. URAIAN PENGELUARAN (Biaya Kios)";
    if (cat.includes("Sopendo") || cat.includes("Saswar") || cat.includes("Edukasi")) return "VI. URAIAN PENGELUARAN (Paket Sopendo / Saswar / Edukasi)";
    if (cat.includes("Fotografer") || cat.includes("Foto")) return "VI. URAIAN PENGELUARAN (Jasa Fotografer)";
    if (cat.includes("Sewa kostum keluar")) return "VI. URAIAN PENGELUARAN (Sewa kostum keluar)";
    if (cat.includes("REPARASI") || cat.includes("Reparasi")) return "VI. URAIAN PENGELUARAN (REPARASI)";
    if (cat.includes("TRANSPORTASI") || cat.includes("Transportasi")) return "VI. URAIAN PENGELUARAN (Transportasi)";
    if (cat.includes("LISTRIK") || cat.includes("Listrik")) return "VI. URAIAN PENGELUARAN (Listrik)";
    if (cat.includes("Makan Siang")) return "VI. URAIAN PENGELUARAN (Makan Siang Karyawan)";
    if (cat.includes("PERLENGKAPAN") || cat.includes("Perlengkapan")) return "VI. URAIAN PENGELUARAN (Perlengkapan)";
    if (cat.includes("PANJAR") || cat.includes("Panjar")) return "VI. URAIAN PENGELUARAN (Panjar)";
    if (cat.includes("LAIN-LAIN") || cat.includes("Lain-lain")) return "VI. URAIAN PENGELUARAN (Lain-lain)";
    const cleaned = cat.replace(/^\d+\)\s*/, '');
    return `VI. URAIAN PENGELUARAN (${cleaned})`;
};

export default function BeritaAcaraPage() {
    const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
    const [periode, setPeriode] = useState("");
    const [kasir, setKasir] = useState("");
    const [lokasi, setLokasi] = useState("Aimas - Klamono KM 21, Kabupaten Sorong, Papua Barat Daya");

    const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];
    const categories = useData(() => StorageService.getCategories(), [], 'categories') || [];
    const cashflows = useData(() => StorageService.getCashFlow(), [], 'cashflow') || [];
    const archives = useData(() => StorageService.getBeritaAcaraArchives(), [], 'berita_acara_archives') || [];
    const [activeTab, setActiveTab] = useState("input");
    const [viewingArchive, setViewingArchive] = useState(null);

    // Gabungkan kategori penjualan dasar dengan seluruh kategori penjualan dari POS master data
    const allSalesCategories = useMemo(() => {
        const list = [...BASE_SALES_CATEGORIES];
        categories.forEach(cat => {
            if (cat && cat.name && cat.name.trim()) {
                const rowName = mapCategoryNameToSalesRow(cat.name.trim());
                if (!list.includes(rowName)) {
                    list.push(rowName);
                }
            }
        });
        return list;
    }, [categories]);

    // States for editable tables
    // State penjualan kini dinamis: array of { name, tunai, hppTunai, qr, hppQR }
    // Setiap kategori dari master data & transaksi otomatis dimasukkan
    const [salesRows, setSalesRows] = useState(() =>
        allSalesCategories.map(name => ({ name, tunai: "", hppTunai: "", qr: "", hppQR: "" }))
    );

    // Summary Expense Table (Page 1) - disamakan dengan kategori Sumber Pendapatan
    const [expenseRows, setExpenseRows] = useState(() =>
        allSalesCategories.map(name => ({ name, amount: "" }))
    );

    // Modern Dynamic Expenses (Hidden on print)
    const [customExpenses, setCustomExpenses] = useState([
        { id: Date.now(), category: '1) Tiket Masuk', keterangan: '', qty: '', harga: '', total: '' }
    ]);

    const [catatan, setCatatan] = useState("");

    // Auto-calculate logic from transactions
    const transactionsStr = JSON.stringify(transactions);
    const cashflowsStr = JSON.stringify(cashflows);
    const categoriesStr = JSON.stringify(allSalesCategories);

    useEffect(() => {
        if (!tanggal) return;

        const startDate = new Date(tanggal);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(tanggal);
        endDate.setHours(23, 59, 59, 999);

        let hasData = false;

        const currentTransactions = JSON.parse(transactionsStr);
        const currentCashflows = JSON.parse(cashflowsStr);

        // === LOGIKA PENJUALAN DINAMIS BERBASIS KATEGORI ===
        const salesMap = {};
        allSalesCategories.forEach(name => {
            salesMap[name] = { tunai: 0, hppTunai: 0, qr: 0, hppQR: 0 };
        });

        currentTransactions.forEach(t => {
            if (!t || !t.date) return;
            const rawDateStr = typeof t.date === 'string' ? t.date : '';
            const tDateOnly = rawDateStr.slice(0, 10);
            const tDate = new Date(rawDateStr.replace(' ', 'T'));
            const isMatch = tDateOnly === tanggal || (!isNaN(tDate.getTime()) && tDate >= startDate && tDate <= endDate);

            if (isMatch) {
                hasData = true;
                t.items.forEach(item => {
                    const originalCatName = item.categoryName || 'Lainnya';
                    const rowName = mapCategoryNameToSalesRow(originalCatName);

                    let itemTotal = item.finalPrice * item.qty;
                    let itemHpp = (item.hpp || 0) * item.qty;
                    if (t.type === TransactionType.RETURN) {
                        itemTotal = -itemTotal;
                        itemHpp = -itemHpp;
                    }

                    if (!salesMap[rowName]) {
                        salesMap[rowName] = { tunai: 0, hppTunai: 0, qr: 0, hppQR: 0 };
                    }

                    if (t.paymentMethod === PaymentMethod.CASH) {
                        salesMap[rowName].tunai += itemTotal;
                        salesMap[rowName].hppTunai += itemHpp;
                    } else {
                        salesMap[rowName].qr += itemTotal;
                        salesMap[rowName].hppQR += itemHpp;
                    }
                });
            }
        });

        const newSalesRows = Object.entries(salesMap).map(([name, vals]) => ({
            name,
            tunai: vals.tunai === 0 ? "" : String(vals.tunai),
            hppTunai: vals.hppTunai === 0 ? "" : String(vals.hppTunai),
            qr: vals.qr === 0 ? "" : String(vals.qr),
            hppQR: vals.hppQR === 0 ? "" : String(vals.hppQR),
        }));

        // === LOGIKA PENGELUARAN (DISAMAKAN DENGAN KATEGORI SUMBER PENDAPATAN) ===
        const expenseMap = {};
        allSalesCategories.forEach(name => {
            expenseMap[name] = 0;
        });

        currentCashflows.forEach(cf => {
            if (!cf || !cf.date) return;
            const rawCfDateStr = typeof cf.date === 'string' ? cf.date : '';
            const cfDateOnly = rawCfDateStr.slice(0, 10);
            const cfDate = new Date(rawCfDateStr.replace(' ', 'T'));
            const isMatch = cfDateOnly === tanggal || (!isNaN(cfDate.getTime()) && cfDate >= startDate && cfDate <= endDate);

            if (isMatch && cf.type === CashFlowType.OUT) {
                hasData = true;
                const desc = (cf.description || '').toLowerCase();
                const cfCat = (cf.category || '').toLowerCase();
                const searchStr = cfCat + " " + desc;

                let matchedCategory = null;
                if (searchStr.includes("tiket")) matchedCategory = "Tiket Masuk";
                else if (searchStr.includes("sewa kostum") || searchStr.includes("kostum")) matchedCategory = "Sewa Kostum";
                else if (searchStr.includes("toko") || searchStr.includes("souvenir") || searchStr.includes("sovenir")) matchedCategory = "Toko / Souvenir";
                else if (searchStr.includes("kafe") || searchStr.includes("cafe") || searchStr.includes("resto")) matchedCategory = "Kafe & Resto";
                else if (searchStr.includes("kios")) matchedCategory = "Kios";
                else if (searchStr.includes("sopendo") || searchStr.includes("saswar") || searchStr.includes("edukasi")) matchedCategory = "Paket Sopendo / Saswar / Edukasi";
                else if (searchStr.includes("fotografer") || searchStr.includes("foto")) matchedCategory = "Jasa Fotografer";
                else if (searchStr.includes("sewa kostum keluar")) matchedCategory = "Sewa kostum keluar";
                else {
                    const found = allSalesCategories.find(c => searchStr.includes(c.toLowerCase()));
                    matchedCategory = found || (allSalesCategories[0] || "Lainnya");
                }

                if (expenseMap[matchedCategory] !== undefined) {
                    expenseMap[matchedCategory] += cf.amount;
                } else {
                    expenseMap[matchedCategory] = cf.amount;
                }
            }
        });

        // Tambahkan pengeluaran custom manual
        customExpenses.forEach(item => {
            const val = Number(item.total) || 0;
            if (val > 0) {
                hasData = true;
                const itemCat = (item.category || '').toLowerCase();
                let matchedCategory = null;

                if (itemCat.includes("tiket")) matchedCategory = "Tiket Masuk";
                else if (itemCat.includes("sewa kostum") || itemCat.includes("kostum")) matchedCategory = "Sewa Kostum";
                else if (itemCat.includes("toko") || itemCat.includes("souvenir") || itemCat.includes("sovenir")) matchedCategory = "Toko / Souvenir";
                else if (itemCat.includes("kafe") || itemCat.includes("cafe") || itemCat.includes("resto")) matchedCategory = "Kafe & Resto";
                else if (itemCat.includes("kios")) matchedCategory = "Kios";
                else if (itemCat.includes("sopendo") || itemCat.includes("saswar") || itemCat.includes("edukasi")) matchedCategory = "Paket Sopendo / Saswar / Edukasi";
                else if (itemCat.includes("fotografer") || itemCat.includes("foto")) matchedCategory = "Jasa Fotografer";
                else if (itemCat.includes("sewa kostum keluar")) matchedCategory = "Sewa kostum keluar";
                else {
                    const cleanCat = item.category.replace(/^\d+\)\s*/, '');
                    const found = allSalesCategories.find(c => cleanCat.toLowerCase().includes(c.toLowerCase()));
                    matchedCategory = found || cleanCat;
                }

                if (expenseMap[matchedCategory] !== undefined) {
                    expenseMap[matchedCategory] += val;
                } else {
                    expenseMap[matchedCategory] = val;
                }
            }
        });

        const newExpenseRows = Object.entries(expenseMap).map(([name, val]) => ({
            name,
            amount: val === 0 ? "" : String(val)
        }));

        if (hasData) {
            setSalesRows(newSalesRows);
            setExpenseRows(newExpenseRows);
        } else {
            setSalesRows(allSalesCategories.map(name => ({ name, tunai: "", hppTunai: "", qr: "", hppQR: "" })));
            setExpenseRows(allSalesCategories.map(name => ({ name, amount: "" })));
        }
    }, [tanggal, transactionsStr, cashflowsStr, categoriesStr, JSON.stringify(customExpenses)]);

    const [autoSaveStatus, setAutoSaveStatus] = useState("idle");

    // Auto-save Berita Acara to Archives whenever data for a date changes
    useEffect(() => {
        if (viewingArchive) return;
        if (!tanggal) return;

        const totalTunai = salesRows.reduce((sum, row) => sum + (Number(row.tunai) || 0), 0);
        const totalQR = salesRows.reduce((sum, row) => sum + (Number(row.qr) || 0), 0);
        const totalExp = expenseRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
        const totalInc = totalTunai + totalQR;

        const hasData = totalInc > 0 || totalExp > 0 || kasir || periode || catatan || customExpenses.some(c => c.keterangan || c.total);
        if (!hasData) return;

        const timer = setTimeout(async () => {
            try {
                setAutoSaveStatus("saving");
                const existingArchives = await StorageService.getBeritaAcaraArchives();
                const existingForDate = existingArchives.find(arch => arch.date === tanggal);

                const archiveData = {
                    id: existingForDate ? existingForDate.id : Date.now().toString(),
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
                    createdAt: existingForDate ? (existingForDate.createdAt || Date.now()) : Date.now(),
                    updatedAt: Date.now()
                };

                await StorageService.saveBeritaAcaraArchive(archiveData);
                setAutoSaveStatus("saved");
            } catch (err) {
                console.error("Auto save archive error:", err);
                setAutoSaveStatus("idle");
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [tanggal, periode, kasir, lokasi, JSON.stringify(salesRows), JSON.stringify(expenseRows), JSON.stringify(customExpenses), catatan, viewingArchive]);

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
            format: "a4"
        });

        const pdfWidth = 210;
        const pdfHeight = 297;

        const canvasOptions = {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: "#ffffff",
            onclone: (clonedDoc) => {
                const p1 = clonedDoc.getElementById("berita-acara-page-1");
                const p2 = clonedDoc.getElementById("berita-acara-page-2");
                [p1, p2].forEach(container => {
                    if (!container) return;
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
                        replacement.style.lineHeight = "1.3";
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
        const imgData1 = canvas1.toDataURL("image/png");
        const imgHeight1 = (canvas1.height * pdfWidth) / canvas1.width;
        pdf.addImage(imgData1, "PNG", 0, 0, pdfWidth, Math.min(pdfHeight, imgHeight1));

        // Render Halaman 2 jika ada rincian pengeluaran
        const page2El = document.getElementById("berita-acara-page-2");
        if (page2El && page2El.clientHeight > 10) {
            const canvas2 = await html2canvas(page2El, canvasOptions);
            const imgData2 = canvas2.toDataURL("image/png");
            const imgHeight2 = (canvas2.height * pdfWidth) / canvas2.width;
            pdf.addPage();
            pdf.addImage(imgData2, "PNG", 0, 0, pdfWidth, Math.min(pdfHeight, imgHeight2));
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
            const pdfBlob = pdf.output("blob");
            const file = new File([pdfBlob], fileName, { type: "application/pdf" });

            const textMessage = 
`*BERITA ACARA REKAPAN PENJUALAN & PENGELUARAN*
📅 Tanggal: ${currentTanggal}
👤 Kasir: ${currentKasir || '-'}
📍 Lokasi: ${currentLokasi || '-'}

💰 Total Pendapatan: Rp ${totalAllSales.toLocaleString('id-ID')}
💸 Total Pengeluaran: Rp ${totalPengeluaran.toLocaleString('id-ID')}
💵 Netto (Kas Bersih): Rp ${netto.toLocaleString('id-ID')}

📌 Dokumen lengkap Berita Acara terlampir dalam file PDF.`;

            // 1. Coba fitur Web Share API langsung ke aplikasi WhatsApp (Perangkat Seluler)
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: `Berita Acara - ${currentTanggal}`,
                        text: textMessage,
                        files: [file]
                    });
                    return;
                } catch (shareError) {
                    console.log("Web Share dibatalkan/tidak didukung, beralih ke fallback download", shareError);
                }
            }

            // 2. Fallback untuk browser PC/Desktop atau browser tanpa dukungan Berkas Web Share
            pdf.save(fileName);

            const encodedText = encodeURIComponent(
                textMessage + "\n\n(File PDF telah otomatis diunduh ke perangkat Anda. Silakan lampirkan berkas PDF tersebut ke pesan WhatsApp)."
            );

            const targetPhone = prompt("Masukkan nomor WhatsApp tujuan (opsional, kosongkan jika ingin memilih di aplikasi WhatsApp):", "");
            let waUrl = "";
            if (targetPhone && targetPhone.trim()) {
                const cleanPhone = targetPhone.trim().replace(/[^0-9]/g, "");
                const formattedPhone = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;
                waUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`;
            } else {
                waUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
            }

            window.open(waUrl, "_blank");
            alert("File PDF Berita Acara telah diunduh ke perangkat Anda. Silakan lampirkan file PDF tersebut pada jendela WhatsApp yang baru saja dibuka!");
        } catch (error) {
            console.error("Error sharing PDF to WhatsApp:", error);
            alert("Gagal membagikan ke WhatsApp: " + (error.message || error));
        } finally {
            setIsGeneratingPdf(false);
        }
    };


    const handleSaveArchive = async () => {
        const title = prompt("Masukkan nama/judul untuk arsip ini:", `Berita Acara - ${tanggal}`);
        if (!title) return;

        const totalTunai = salesRows.reduce((sum, row) => sum + (Number(row.tunai) || 0), 0);
        const totalQR = salesRows.reduce((sum, row) => sum + (Number(row.qr) || 0), 0);
        const totalExpenses = expenses.reduce((sum, val) => sum + (Number(val) || 0), 0);

        const archive = {
            id: Date.now().toString(),
            title,
            date: tanggal,
            periode,
            kasir,
            lokasi,
            salesRows,
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
    const currentExpenseRows = viewingArchive
        ? (viewingArchive.expenseRows
            ? viewingArchive.expenseRows
            : (viewingArchive.expenses
                ? (viewingArchive.expenseNames
                    ? viewingArchive.expenseNames.map((name, idx) => ({ name, amount: viewingArchive.expenses[idx] ?? "" }))
                    : allSalesCategories.map((name, idx) => ({ name, amount: viewingArchive.expenses[idx] ?? "" })))
                : allSalesCategories.map(name => ({ name, amount: "" }))))
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

    // Custom Categories State & Management - disamakan dengan kategori Sumber Pendapatan
    const [categoryOptions, setCategoryOptions] = useState(() => {
        const defaultList = BASE_SALES_CATEGORIES.map((cat, idx) => `${idx + 1}) ${cat}`);
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('custom_expense_categories');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const hasOldLegacy = parsed.some(c => c.includes("CAFÉ") || c.includes("REPARASI") || c.includes("LISTRIK PLN") || c.includes("PANJAR"));
                        if (!hasOldLegacy) {
                            return parsed;
                        }
                    }
                }
            } catch (e) {
                console.error('Error loading custom expense categories:', e);
            }
        }
        return defaultList;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('custom_expense_categories');
            if (!saved) {
                const newList = allSalesCategories.map((cat, idx) => `${idx + 1}) ${cat}`);
                setCategoryOptions(prev => {
                    if (JSON.stringify(prev) === JSON.stringify(newList)) return prev;
                    return newList;
                });
            }
        }
    }, [categoriesStr]);

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
        if (confirm("Kembalikan daftar kategori pengeluaran ke kategori bawaan (Sumber Pendapatan)?")) {
            const defaultList = allSalesCategories.map((cat, idx) => `${idx + 1}) ${cat}`);
            setCategoryOptions(defaultList);
            try {
                localStorage.removeItem('custom_expense_categories');
            } catch (e) {
                console.error('Error resetting categories:', e);
            }
        }
    };

    const handleCategorySelect = (expId, selectedVal) => {
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
        const defaultCat = categoryOptions[0] || '1) CAFÉ';
        setCustomExpenses([...customExpenses, { id: Date.now(), category: defaultCat, keterangan: '', qty: '', harga: '', total: '' }]);
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

    const totalSalesTunai = currentSalesRows.reduce((sum, row) => sum + (Number(row.tunai) || 0), 0);
    const totalHppTunai = currentSalesRows.reduce((sum, row) => sum + (Number(row.hppTunai) || 0), 0);
    const totalProfitTunai = totalSalesTunai - totalHppTunai;
    const totalSalesQR = currentSalesRows.reduce((sum, row) => sum + (Number(row.qr) || 0), 0);
    const totalHppQR = currentSalesRows.reduce((sum, row) => sum + (Number(row.hppQR) || 0), 0);
    const totalProfitQR = totalSalesQR - totalHppQR;
    const totalAllSales = totalSalesTunai + totalSalesQR;
    const totalPengeluaran = currentExpenseRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const netto = totalSalesTunai - totalPengeluaran;

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
                        className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-lg transition-all ${
                            activeTab === 'input' && !viewingArchive
                                ? 'bg-amber-600 text-white shadow-md'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                        <Plus size={15} /> Form Berita Acara
                    </button>
                    <button
                        onClick={() => setActiveTab('archives')}
                        className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-lg transition-all ${
                            activeTab === 'archives' || viewingArchive
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
                            <h3 className="text-lg font-extrabold text-slate-900 mt-1">Rp {totalSalesTunai.toLocaleString('id-ID')}</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Penerimaan Tunai Kasir</p>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                            <FileText size={22} />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Non-Tunai / QR</p>
                            <h3 className="text-lg font-extrabold text-purple-700 mt-1">Rp {totalSalesQR.toLocaleString('id-ID')}</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Transfer & QRIS Bank</p>
                        </div>
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                            <Info size={22} />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Pendapatan Kotor</p>
                            <h3 className="text-lg font-extrabold text-emerald-600 mt-1">Rp {totalAllSales.toLocaleString('id-ID')}</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Tunai + Non-Tunai</p>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                            <CheckCircle2 size={22} />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pengeluaran Sesi</p>
                            <h3 className="text-lg font-extrabold text-rose-600 mt-1">Rp {totalPengeluaran.toLocaleString('id-ID')}</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Operasional Kasir</p>
                        </div>
                        <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                            <Trash2 size={22} />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Setoran Bersih (Netto)</p>
                            <h3 className="text-lg font-extrabold text-amber-700 mt-1">Rp {netto.toLocaleString('id-ID')}</h3>
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
                                                {new Date(arch.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}
                                            </td>
                                            <td className="p-3.5 font-bold text-slate-800">{arch.title}</td>
                                            <td className="p-3.5 text-emerald-600 font-extrabold whitespace-nowrap">Rp {arch.totalIncome?.toLocaleString('id-ID')}</td>
                                            <td className="p-3.5 text-rose-600 font-extrabold whitespace-nowrap">Rp {arch.totalExpense?.toLocaleString('id-ID')}</td>
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
                                                    <button onClick={() => handleArchiveShareWhatsApp(arch)} disabled={isGeneratingPdf} className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[11px] font-semibold border border-emerald-200 flex items-center gap-1" title="Kirim WA">
                                                        <WhatsAppIcon size={13} /> WA
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
                            <button onClick={handleShareWhatsApp} disabled={isGeneratingPdf} className="px-3.5 py-2 bg-[#25D366] hover:bg-[#20ba5a] disabled:bg-green-300 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors">
                                {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <WhatsAppIcon size={14} />} Kirim WhatsApp
                            </button>
                            <button onClick={handlePrint} className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors">
                                <Printer size={14}/> Cetak
                            </button>
                            <button onClick={() => setViewingArchive(null)} className="p-2 bg-amber-200 hover:bg-amber-300 text-amber-800 rounded-xl transition-colors">
                                <X size={18}/>
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
                        onChange={(e) => setTanggal(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-semibold text-slate-800"
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">Periode Sesi</label>
                    <input
                        type="text"
                        value={periode}
                        onChange={(e) => setPeriode(e.target.value)}
                        placeholder="Cth: 1 - 7 Juli 2026"
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none text-slate-800 font-medium min-w-[200px]"
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
                        className="bg-[#25D366] hover:bg-[#20ba5a] disabled:bg-green-300 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-md flex items-center gap-1.5 text-xs"
                    >
                        {isGeneratingPdf ? <Loader2 size={14} className="animate-spin" /> : <WhatsAppIcon size={14} />} 
                        Kirim WA
                    </button>
                    <button
                        onClick={handlePrint}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-md flex items-center gap-1.5 text-xs"
                    >
                        <Printer size={14} /> Cetak
                    </button>
                </div>
            </div>

            {/* Modern Expense Input Section (Hidden on Print) */}
            <div className="bg-white p-5 rounded-2xl shadow-sm mb-6 print:hidden border border-slate-200">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <FileText size={16} className="text-amber-600" />
                            Input Rincian Pengeluaran Operasional
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Tabel ini otomatis merekapitulasi uraian pengeluaran pada cetakan Berita Acara.</p>
                    </div>
                    <button
                        onClick={() => setShowCategoryModal(true)}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 px-3.5 py-2 rounded-xl transition-colors shadow-sm shrink-0"
                    >
                        <FolderPlus size={15} className="text-amber-700" /> Kelola Kategori Pengeluaran
                    </button>
                </div>
                
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
            <div className="w-full overflow-x-auto no-scrollbar pb-8 print:pb-0">
                <div className="bg-white mx-auto print:shadow-none text-black w-[210mm] max-w-full p-4 print:p-2 shadow-lg mb-8 print:mb-0">
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
                            margin: 6mm;
                        }
                        html, body {
                            height: auto;
                            min-height: 100%;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                            background: white !important;
                        }
                        .page-break {
                            page-break-before: always;
                            break-before: page;
                        }
                        /* Ensure flex containers don't force page cuts */
                        .print-page {
                            page-break-inside: avoid;
                            break-inside: avoid;
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
                        font-size: 11px;
                    }
                    .report-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 9.5px;
                        table-layout: fixed;
                    }
                    .report-table th, .report-table td {
                        border: 1px solid #94a3b8;
                        padding: 3px 4px;
                        line-height: 1.3;
                        vertical-align: middle;
                        box-sizing: border-box;
                    }
                    .report-table th {
                        background-color: #f1f5f9;
                        text-align: center;
                        font-weight: 700;
                        color: #0f172a;
                    }
                    .editable-cell {
                        width: 100%;
                        background: transparent;
                        border: none !important;
                        outline: none !important;
                        font-family: inherit;
                        font-size: 9.5px;
                        line-height: 1.3;
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

                {/* Page 1 */}
                <div id="berita-acara-page-1" className="print-page mb-2">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b-2 border-amber-900 pb-2 mb-3">
                        <div className="w-1/4">
                            <img src="/logokasir.jpg" alt="Logo" style={{ height: '55px', objectFit: 'contain' }} onError={(e) => e.target.style.display='none'} />
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
                                    <div className="flex-1 border-b border-black pb-0.5 font-semibold text-gray-900">{tanggal.split("-").reverse().join("/")}</div>
                                </div>
                                <div className="flex items-center">
                                    <span className="w-16 shrink-0">Periode</span>
                                    <span className="mr-2">:</span>
                                    <div className="flex-1 border-b border-black pb-0.5 font-semibold text-gray-900">{periode}</div>
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center mb-1">
                                    <span className="w-16 shrink-0">Kasir</span>
                                    <span className="mr-2">:</span>
                                    <div className="flex-1 pb-0.5 font-semibold text-gray-900">{kasir}</div>
                                </div>
                                <div className="flex items-center">
                                    <span className="w-16 shrink-0">Lokasi</span>
                                    <span className="mr-2">:</span>
                                    <div className="flex-1 pb-0.5 font-semibold text-gray-900">{lokasi}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section II & III - Berdampingan (Side by Side) */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        {/* Section II - Tunai */}
                        <div>
                            <div className="brown-header">II. LAPORAN PENJUALAN (TUNAI)</div>
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
                                                        value={row.tunai} 
                                                        onChange={(e) => handleSalesRowChange(idx, 'tunai', e.target.value)} 
                                                        placeholder="0"
                                                        readOnly={!!viewingArchive}
                                                    />
                                                </td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        className="editable-cell text-right text-red-700/80" 
                                                        value={row.hppTunai} 
                                                        onChange={(e) => handleSalesRowChange(idx, 'hppTunai', e.target.value)} 
                                                        placeholder="0"
                                                        readOnly={!!viewingArchive}
                                                    />
                                                </td>
                                                <td className="text-right font-medium text-green-700 bg-slate-50/50 pr-1">
                                                    {isRowEmpty ? '' : keuntungan.toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="bg-[#f5e6d3] font-bold">
                                        <td colSpan={2} className="text-right">TOTAL PENJUALAN (TUNAI)</td>
                                        <td className="text-right">Rp {totalSalesTunai.toLocaleString('id-ID')}</td>
                                        <td className="text-right text-red-700">Rp {totalHppTunai.toLocaleString('id-ID')}</td>
                                        <td className="text-right text-green-700">Rp {totalProfitTunai.toLocaleString('id-ID')}</td>
                                    </tr>
                                    <tr className="bg-red-50/80 font-semibold text-red-700 text-xs">
                                        <td colSpan={2} className="text-right">DIPOTONG PENGELUARAN (V)</td>
                                        <td className="text-right font-bold text-red-700">- Rp {totalPengeluaran.toLocaleString('id-ID')}</td>
                                        <td colSpan={2} className="text-gray-500 font-normal italic text-[9px] text-center">Terpotong Otomatis</td>
                                    </tr>
                                    <tr className="bg-emerald-100 font-bold text-emerald-900">
                                        <td colSpan={2} className="text-right">SETORAN TUNAI BERSIH (NETTO)</td>
                                        <td className="text-right text-emerald-800 text-xs font-bold">Rp {netto.toLocaleString('id-ID')}</td>
                                        <td colSpan={2} className="text-right text-[10px] text-emerald-700">Uang Kasir</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Section III - QR */}
                        <div>
                            <div className="brown-header">III. LAPORAN PENJUALAN (QR / TRANSFER)</div>
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
                                            <tr key={`salesQR-${idx}`}>
                                                <td className="text-center">{idx + 1}</td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        className="editable-cell" 
                                                        value={row.name} 
                                                        readOnly
                                                    />
                                                </td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        className="editable-cell text-right" 
                                                        value={row.qr} 
                                                        onChange={(e) => handleSalesRowChange(idx, 'qr', e.target.value)} 
                                                        placeholder="0"
                                                        readOnly={!!viewingArchive}
                                                    />
                                                </td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        className="editable-cell text-right text-red-700/80" 
                                                        value={row.hppQR} 
                                                        onChange={(e) => handleSalesRowChange(idx, 'hppQR', e.target.value)} 
                                                        placeholder="0"
                                                        readOnly={!!viewingArchive}
                                                    />
                                                </td>
                                                <td className="text-right font-medium text-green-700 bg-slate-50/50 pr-1">
                                                    {isRowEmpty ? '' : keuntungan.toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="bg-[#f5e6d3] font-bold">
                                        <td colSpan={2} className="text-right">TOTAL (QR)</td>
                                        <td className="text-right">Rp {totalSalesQR.toLocaleString('id-ID')}</td>
                                        <td className="text-right text-red-700">Rp {totalHppQR.toLocaleString('id-ID')}</td>
                                        <td className="text-right text-green-700">Rp {totalProfitQR.toLocaleString('id-ID')}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Section IV & V - Berdampingan (Side by Side) */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        {/* Section IV (Rekapitulasi) */}
                        <div>
                            <div className="brown-header">IV. REKAPITULASI</div>
                            <div className="border border-[#d1d5db] p-2 space-y-2 text-xs">
                                {/* 1. Pemasukan */}
                                <table className="report-table w-full">
                                    <thead>
                                        <tr>
                                            <th colSpan={2} className="bg-slate-100 text-slate-800 text-left px-2 py-0.5 font-bold text-[10px]">1. PEMASUKAN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="w-3/5 text-gray-700">Penjualan Tunai (II)</td>
                                            <td className="w-2/5 text-right font-medium">Rp {totalSalesTunai.toLocaleString('id-ID')}</td>
                                        </tr>
                                        <tr>
                                            <td className="text-gray-700">Penjualan QR (III)</td>
                                            <td className="text-right font-medium">Rp {totalSalesQR.toLocaleString('id-ID')}</td>
                                        </tr>
                                        <tr className="bg-amber-50/60 font-bold text-amber-900">
                                            <td>TOTAL PEMASUKAN (BRUTO)</td>
                                            <td className="text-right">Rp {totalAllSales.toLocaleString('id-ID')}</td>
                                        </tr>
                                    </tbody>
                                </table>

                                {/* 2. Laba Penjualan */}
                                <table className="report-table w-full">
                                    <thead>
                                        <tr>
                                            <th colSpan={2} className="bg-slate-100 text-slate-800 text-left px-2 py-0.5 font-bold text-[10px]">2. LABA PENJUALAN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="w-3/5 text-gray-700">Total Pendapatan</td>
                                            <td className="w-2/5 text-right font-medium">Rp {totalAllSales.toLocaleString('id-ID')}</td>
                                        </tr>
                                        <tr>
                                            <td className="text-gray-700">Total HPP (Modal)</td>
                                            <td className="text-right font-medium text-red-600">Rp {(totalHppTunai + totalHppQR).toLocaleString('id-ID')}</td>
                                        </tr>
                                        <tr>
                                            <td className="text-gray-700">Dipotong Pengeluaran (V)</td>
                                            <td className="text-right font-medium text-red-600">- Rp {totalPengeluaran.toLocaleString('id-ID')}</td>
                                        </tr>
                                        <tr className="bg-green-50/60 font-bold text-green-700">
                                            <td>KEUNTUNGAN BERSIH (NETTO)</td>
                                            <td className="text-right">Rp {((totalSalesTunai + totalSalesQR) - (totalHppTunai + totalHppQR) - totalPengeluaran).toLocaleString('id-ID')}</td>
                                        </tr>
                                    </tbody>
                                </table>

                                {/* 3. Setoran Fisik (Tunai) */}
                                <table className="report-table w-full">
                                    <thead>
                                        <tr>
                                            <th colSpan={2} className="bg-slate-100 text-slate-800 text-left px-2 py-0.5 font-bold text-[10px]">3. SETORAN FISIK (TUNAI)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="w-3/5 text-gray-700">Penjualan Tunai (II)</td>
                                            <td className="w-2/5 text-right font-medium">Rp {totalSalesTunai.toLocaleString('id-ID')}</td>
                                        </tr>
                                        <tr>
                                            <td className="text-gray-700">Dipotong Pengeluaran (V)</td>
                                            <td className="text-right font-medium text-red-600">- Rp {totalPengeluaran.toLocaleString('id-ID')}</td>
                                        </tr>
                                        <tr className="bg-emerald-100 font-bold text-slate-900">
                                            <td>NETTO (UANG FISIK KASIR)</td>
                                            <td className="text-right text-emerald-800 font-extrabold text-[11px]">Rp {netto.toLocaleString('id-ID')}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Section V (Pengeluaran) */}
                        <div>
                            <div className="brown-header">V. LAPORAN PENGELUARAN</div>
                            <table className="report-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '10%' }}>No</th>
                                        <th style={{ width: '60%' }}>KATEGORI PENGELUARAN</th>
                                        <th style={{ width: '30%' }}>Jumlah (Rp)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentExpenseRows.map((row, idx) => (
                                        <tr key={`expense-${idx}`}>
                                            <td className="text-center">{idx + 1}</td>
                                            <td>
                                                <input 
                                                    type="text" 
                                                    className="editable-cell" 
                                                    value={row.name} 
                                                    onChange={(e) => handleExpenseRowChange(idx, 'name', e.target.value)} 
                                                    readOnly={!!viewingArchive}
                                                />
                                            </td>
                                            <td>
                                                <input 
                                                    type="text" 
                                                    className="editable-cell text-right" 
                                                    value={row.amount} 
                                                    onChange={(e) => handleExpenseRowChange(idx, 'amount', e.target.value)} 
                                                    placeholder="0"
                                                    readOnly={!!viewingArchive}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-[#f5e6d3] font-bold">
                                        <td colSpan={2} className="text-right">TOTAL PENGELUARAN</td>
                                        <td className="text-right text-red-700">Rp {totalPengeluaran.toLocaleString('id-ID')}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Signatures */}
                    <div className="flex justify-between text-xs mt-4 mb-4 px-8 font-medium">
                        <div className="text-center">
                            <p className="mb-10">Dibuat oleh,<br/>Kasir / Administrasi</p>
                            <p>( ................................................. )</p>
                        </div>
                        <div className="text-center">
                            <p className="mb-10">Sorong, ......./......../.............<br/>Mengetahui,<br/>Staff Keuangan</p>
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

                {/* Page Break for Detailed Expenses */}
                <div className="page-break"></div>

                {/* Page 2: Detailed Expenses (Dynamic Masonry Layout) */}
                <div id="berita-acara-page-2" className="print-page pb-8">
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
