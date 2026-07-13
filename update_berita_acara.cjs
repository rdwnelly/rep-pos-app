const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/(protected)/berita-acara/page.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add Icons
content = content.replace(
    'import { Plus, Trash2, Info } from "lucide-react";',
    'import { Plus, Trash2, Info, Save, Archive, FileText, X, Printer, Eye } from "lucide-react";'
);

// 2. Add archives state and hooks after transactions
content = content.replace(
    'const cashflows = useData(() => StorageService.getCashFlow(), [], \'cashflow\') || [];',
    `const cashflows = useData(() => StorageService.getCashFlow(), [], 'cashflow') || [];
    const archives = useData(() => StorageService.getBeritaAcaraArchives(), [], 'berita_acara_archives') || [];
    const [activeTab, setActiveTab] = useState("input");
    const [viewingArchive, setViewingArchive] = useState(null);`
);

// 3. Add handleSaveArchive and load/delete
const hooksEnd = `    const handleSalesChange = (type, index, value) => {`;
const archiveHandlers = `
    const handleSaveArchive = async () => {
        const title = prompt("Masukkan nama/judul untuk arsip ini:", \`Berita Acara - \${tanggal}\`);
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
            salesQR,
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
    const currentSalesQR = viewingArchive ? viewingArchive.salesQR : salesQR;
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

    const handleSalesChange = (type, index, value) => {`;

content = content.replace(hooksEnd, archiveHandlers);

// Now wrap the UI and change variables
content = content.replace(
    /<div className="p-4 md:p-8 max-w-\[1200px\] mx-auto bg-slate-50 min-h-screen">[\s\S]*?(?=<div className="bg-white p-6 rounded-xl shadow-md mb-8 print:hidden">)/,
    `<div className="p-4 md:p-8 max-w-[1200px] mx-auto bg-slate-50 min-h-screen">
            <div className="flex flex-wrap gap-4 mb-6 print:hidden">
                <button 
                    onClick={() => { setActiveTab('input'); setViewingArchive(null); }} 
                    className={\`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all \${activeTab === 'input' ? 'bg-primary text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}\`}
                >
                    <Plus size={18} /> Input Baru
                </button>
                <button 
                    onClick={() => setActiveTab('archives')} 
                    className={\`px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all \${activeTab === 'archives' ? 'bg-primary text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}\`}
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
`
);

// We also need to add the close tag at the end of the file.
content = content.replace(
    `            </div>
        </div>
    );
}`,
    `            </div>
                </>
            )}
        </div>
    );
}`
);

// Replace the UI variables
// We want to replace `{tanggal}` with `{currentTanggal}` in the print section ONLY.
// We also want to replace `salesTunai` with `currentSalesTunai` inside the print section ONLY!
// Actually, if activeTab === 'input' and viewingArchive == null, the form uses the editable state.
// We should disable the editable form if viewingArchive is set, OR hide the form entirely and ONLY show the print section.
// Hiding the form entirely when viewingArchive is true is brilliant!
// Let's modify the wrap:

content = content.replace(
    '<div className="bg-white p-6 rounded-xl shadow-md mb-8 print:hidden">',
    '{!viewingArchive && (<div className="bg-white p-6 rounded-xl shadow-md mb-8 print:hidden">'
);

// Close the form wrap before "Print Layout"
content = content.replace(
    '{/* --- PRINT LAYOUT --- */}',
    `</div>)}
                {/* --- PRINT LAYOUT --- */}`
);

// Add "Simpan Arsip" button to the form header
content = content.replace(
    '<button onClick={handlePrint} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary-hover transition-all shadow-lg shadow-primary/20">',
    `<button onClick={handleSaveArchive} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20">
                            <Save size={18} /> Simpan sebagai Arsip
                        </button>
                        <button onClick={handlePrint} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary-hover transition-all shadow-lg shadow-primary/20">`
);

// Replace variables in print layout
const printLayoutStart = content.indexOf('{/* --- PRINT LAYOUT --- */}');
if (printLayoutStart !== -1) {
    let beforePrint = content.substring(0, printLayoutStart);
    let afterPrint = content.substring(printLayoutStart);

    afterPrint = afterPrint.replace(/\{tanggal\}/g, '{currentTanggal}');
    afterPrint = afterPrint.replace(/\{periode\}/g, '{currentPeriode}');
    afterPrint = afterPrint.replace(/\{kasir\}/g, '{currentKasir}');
    afterPrint = afterPrint.replace(/\{lokasi\}/g, '{currentLokasi}');
    afterPrint = afterPrint.replace(/\{catatan\}/g, '{currentCatatan}');
    
    // For arrays in print
    afterPrint = afterPrint.replace(/salesTunai\[/g, 'currentSalesTunai[');
    afterPrint = afterPrint.replace(/salesQR\[/g, 'currentSalesQR[');
    afterPrint = afterPrint.replace(/expenses\[/g, 'currentExpenses[');
    afterPrint = afterPrint.replace(/derivedDetailedExpenses/g, 'derivedDetailedExpensesCurrent');
    
    content = beforePrint + afterPrint;
}

fs.writeFileSync(filePath, content);
console.log('Update success');
