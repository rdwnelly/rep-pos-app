const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/(protected)/berita-acara/page.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove the dangling syntax at the end of the file
content = content.replace(
    `            </div>
                </>
            )}
        </div>
    );
}`,
    `            </div>
        </div>
    );
}`
);

// 2. Wrap the UI and add the Tabs
const originalStart = `<div className="min-h-screen bg-gray-100 p-4 md:p-8 print:bg-white print:p-0">`;

const newStart = `<div className="min-h-screen bg-gray-100 p-4 md:p-8 print:bg-white print:p-0">
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
`;

content = content.replace(originalStart, newStart);

// 3. Close the Fragment for the input/viewing section
// The original file ended with:
//         </div>
//     );
// }
// So we just prepend the `</> )}` to the closing tag of `min-h-screen`.
content = content.replace(
    `        </div>
    );
}`,
    `                </>
            )}
        </div>
    );
}`
);

fs.writeFileSync(filePath, content);
console.log('Fix success');
