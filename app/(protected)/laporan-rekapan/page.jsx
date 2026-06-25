"use client";

import { useState, useMemo, useEffect } from "react";
import { useData } from "../../../hooks/useData";
import { StorageService } from "../../../services/storage";
import { CashFlowType, PaymentMethod, TransactionType } from "../../../types";

export default function LaporanRekapanPage() {
    const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
    const [namaKasir, setNamaKasir] = useState("");
    const [modalDisetor, setModalDisetor] = useState("");
    const [catatan, setCatatan] = useState("");
    const [manualPengeluaran, setManualPengeluaran] = useState(Array.from({ length: 18 }, () => ({ catatan: '', nominal: '' })));

    const handleManualPengeluaranChange = (index, field, value) => {
        setManualPengeluaran(prev => {
            const newArr = [...prev];
            newArr[index] = { ...newArr[index], [field]: value };
            return newArr;
        });
    };

    const transactions = useData(() => StorageService.getTransactions(), [], 'transactions') || [];
    const cashflows = useData(() => StorageService.getCashFlow(), [], 'cashflow') || [];

    const rekapan = useMemo(() => {
        if (!tanggal) return null;

        const startDate = new Date(tanggal);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(tanggal);
        endDate.setHours(23, 59, 59, 999);

        let totalTunai = 0;
        let totalQris = 0;
        let totalPengeluaran = 0;
        const ringkasanKategori = {};
        const pengeluaranList = [];

        // Pengeluaran dari cashflows
        cashflows.forEach(cf => {
            const cfDate = new Date(cf.date);
            if (cfDate >= startDate && cfDate <= endDate && cf.type === CashFlowType.OUT) {
                totalPengeluaran += cf.amount;
                pengeluaranList.push({
                    catatan: cf.description || 'Pengeluaran',
                    nominal: cf.amount
                });
            }
        });

        // Pendapatan dari transactions
        transactions.forEach(t => {
            const tDate = new Date(t.date);
            if (tDate >= startDate && tDate <= endDate) {
                t.items.forEach(item => {
                    const catName = item.categoryName || 'Lainnya';
                    if (!ringkasanKategori[catName]) {
                        ringkasanKategori[catName] = { tunai: 0, qris: 0 };
                    }
                    
                    let itemTotal = item.finalPrice * item.qty;
                    if (t.type === TransactionType.RETURN) {
                        itemTotal = -itemTotal;
                    }

                    if (t.paymentMethod === PaymentMethod.CASH) {
                        ringkasanKategori[catName].tunai += itemTotal;
                        totalTunai += itemTotal;
                    } else {
                        ringkasanKategori[catName].qris += itemTotal;
                        totalQris += itemTotal;
                    }
                });
                
                // Jika ada diskon (Discount Amount)
                if (t.discountAmount && t.discountAmount > 0) {
                    const catName = "Diskon Penjualan";
                    if (!ringkasanKategori[catName]) {
                        ringkasanKategori[catName] = { tunai: 0, qris: 0 };
                    }
                    if (t.paymentMethod === PaymentMethod.CASH) {
                        ringkasanKategori[catName].tunai -= t.discountAmount;
                        totalTunai -= t.discountAmount;
                    } else {
                        ringkasanKategori[catName].qris -= t.discountAmount;
                        totalQris -= t.discountAmount;
                    }
                }
            }
        });

        // Get sorted category names
        const sortedCategories = Object.keys(ringkasanKategori).sort();

        return {
            kategori: ringkasanKategori,
            sortedCategories,
            totalTunai,
            totalQris,
            totalPengeluaran,
            pengeluaran: pengeluaranList
        };
    }, [tanggal, transactions, cashflows]);

    const handlePrint = () => {
        window.print();
    };

    // Auto-fill manualPengeluaran when rekapan changes (e.g. date change)
    useEffect(() => {
        if (rekapan) {
            setManualPengeluaran(Array.from({ length: 18 }, (_, i) => {
                const item = rekapan.pengeluaran[i];
                return item ? { catatan: item.catatan, nominal: String(item.nominal) } : { catatan: '', nominal: '' };
            }));
        }
    }, [rekapan?.pengeluaran]);

    const finalTotalPengeluaran = manualPengeluaran.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0);
    const uangYangAda = Number(modalDisetor || 0) + (rekapan?.totalTunai || 0) - finalTotalPengeluaran;

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 print:bg-white print:p-0">

            {/* Form Filter (Hidden on print) */}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kasir</label>
                    <input
                        type="text"
                        value={namaKasir}
                        onChange={(e) => setNamaKasir(e.target.value)}
                        placeholder="Contoh: Mitshi"
                        className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Modal Disetor (Rp)</label>
                    <input
                        type="number"
                        value={modalDisetor}
                        onChange={(e) => setModalDisetor(e.target.value)}
                        min="0"
                        className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                </div>
                <button
                    onClick={handlePrint}
                    className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded-lg font-medium transition-colors ml-auto"
                >
                    Cetak Laporan
                </button>
            </div>

            {/* Area BAP (Printed area) */}
            {!rekapan ? (
                <div className="text-center py-10 print:hidden">Memuat data rekapan...</div>
            ) : (
                <div className="bg-white p-4 print:py-8 print:px-2 print:shadow-none mx-auto text-black" style={{ width: '100%', maxWidth: '180mm' }}>
                    <style>{`
                        @media print {
                            @page {
                                size: A4 portrait;
                                margin-top: 25mm;
                                margin-bottom: 20mm;
                                margin-left: auto;
                                margin-right: auto;
                            }
                            body {
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                            }
                        }
                    `}</style>

                    {/* Header Setup dengan Table (Anti-Berantakan) */}
                    <table style={{ width: '100%', marginBottom: '15px', tableLayout: 'fixed' }}>
                        <tbody>
                            <tr>
                                <td style={{ width: '25%', verticalAlign: 'top' }}>
                                    <img src="/logokasir.jpg" alt="Logo REP" style={{ height: '45px', objectFit: 'contain' }} onError={(e) => e.target.style.display='none'} />
                                </td>
                                <td style={{ width: '50%', textAlign: 'center', verticalAlign: 'top', paddingTop: '5px' }}>
                                    <h1 style={{ fontSize: '18px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                                        Laporan Rekapan
                                    </h1>
                                </td>
                                <td style={{ width: '25%', verticalAlign: 'top' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid black', fontWeight: 'bold' }}>
                                        <tbody>
                                            <tr>
                                                <td style={{ border: '2px solid black', backgroundColor: '#ffff00', padding: '2px 4px', fontSize: '9px', textTransform: 'uppercase', width: '50%' }}>TGL/BULAN/TAHUN</td>
                                                <td style={{ border: '2px solid black', padding: '2px 4px', textAlign: 'center', fontSize: '9px', backgroundColor: 'white' }}>
                                                    {tanggal.split("-").reverse().join("/")}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={{ border: '2px solid black', backgroundColor: '#ffff00', padding: '2px 4px', fontSize: '9px', textTransform: 'uppercase' }}>NAMA KASIR</td>
                                                <td style={{ border: '2px solid black', padding: '2px 4px', textAlign: 'center', fontSize: '9px', backgroundColor: 'white' }}>
                                                    {namaKasir}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Alamat di bawah logo */}
                    <div style={{ marginBottom: '15px', fontSize: '10px', fontWeight: '500', lineHeight: '1.2' }}>
                        <p>Jalan baru. Jl. Klamono No.Km,21, Aimas,</p>
                        <p>Kabupaten Sorong. Papua Barat Daya</p>
                    </div>

                    {/* Grid Utama Menggunakan Table (100% Fixed Width) */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <tbody>
                            <tr>
                                {/* Kolom Kiri */}
                                <td style={{ width: '48%', verticalAlign: 'top', paddingRight: '8px' }}>
                                    
                                    {/* Tabel Pendapatan Tunai */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid black', marginBottom: '8px', fontSize: '9px' }}>
                                        <tbody>
                                            {rekapan.sortedCategories.map(katName => (
                                                <tr key={`tunai-${katName}`}>
                                                    <td style={{ border: '1px solid black', padding: '2px 4px', fontWeight: '500' }}>Pendapatan {katName}</td>
                                                    <td style={{ border: '1px solid black', padding: '2px 4px', textAlign: 'right', width: '70px', fontWeight: '500' }}>
                                                        {rekapan.kategori[katName].tunai > 0 ? rekapan.kategori[katName].tunai.toLocaleString('id-ID') : ''}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr>
                                                <td style={{ border: '2px solid black', padding: '2px 4px', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#ffff00' }}>TOTAL</td>
                                                <td style={{ border: '2px solid black', padding: '2px 4px', fontWeight: 'bold', textAlign: 'right', backgroundColor: '#ffff00' }}>
                                                    {rekapan.totalTunai > 0 ? rekapan.totalTunai.toLocaleString('id-ID') : ''}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {/* Tabel Pendapatan QRIS */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid black', marginBottom: '8px', fontSize: '9px' }}>
                                        <tbody>
                                            {rekapan.sortedCategories.map(katName => (
                                                <tr key={`qris-${katName}`}>
                                                    <td style={{ border: '1px solid black', padding: '2px 4px', fontWeight: '500' }}>Pendapatan {katName}</td>
                                                    <td style={{ border: '1px solid black', padding: '2px 4px', textAlign: 'right', width: '70px', fontWeight: '500' }}>
                                                        {rekapan.kategori[katName].qris > 0 ? rekapan.kategori[katName].qris.toLocaleString('id-ID') : ''}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr>
                                                <td style={{ border: '2px solid black', padding: '2px 4px', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#ffff00' }}>TOTAL</td>
                                                <td style={{ border: '2px solid black', padding: '2px 4px', fontWeight: 'bold', textAlign: 'right', backgroundColor: '#ffff00' }}>
                                                    {rekapan.totalQris > 0 ? rekapan.totalQris.toLocaleString('id-ID') : ''}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {/* Tabel Summary (Bawah Kiri) */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid black', fontWeight: 'bold', fontSize: '9px' }}>
                                        <tbody>
                                            <tr>
                                                <td style={{ border: '1px solid black', padding: '2px 4px', textTransform: 'uppercase' }}>TOTAL PENDAPATAN</td>
                                                <td style={{ border: '1px solid black', padding: '2px 4px', textAlign: 'right', width: '70px' }}>
                                                    {rekapan.totalTunai.toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={{ border: '1px solid black', padding: '2px 4px', textTransform: 'uppercase' }}>TOTAL PENDAPATAN (QR)</td>
                                                <td style={{ border: '1px solid black', padding: '2px 4px', textAlign: 'right' }}>
                                                    {rekapan.totalQris.toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={{ border: '1px solid black', padding: '2px 4px', textTransform: 'uppercase' }}>PENGELUARAN</td>
                                                <td style={{ border: '1px solid black', padding: '2px 4px', textAlign: 'right' }}>
                                                    {finalTotalPengeluaran.toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={{ border: '1px solid black', padding: '2px 4px', textTransform: 'uppercase' }}>MODAL DISETOR</td>
                                                <td style={{ border: '1px solid black', padding: '2px 4px', textAlign: 'right' }}>
                                                    {Number(modalDisetor || 0).toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style={{ border: '1px solid black', padding: '2px 4px', textTransform: 'uppercase' }}>UANG YANG ADA</td>
                                                <td style={{ border: '1px solid black', padding: '2px 4px', textAlign: 'right' }}>
                                                    {uangYangAda.toLocaleString('id-ID')}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>

                                {/* Kolom Kanan (Pengeluaran) */}
                                <td style={{ width: '48%', verticalAlign: 'top', paddingLeft: '8px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid black', fontSize: '9px', tableLayout: 'fixed' }}>
                                        <thead>
                                            <tr>
                                                <th colSpan={2} style={{ border: '2px solid black', padding: '4px', backgroundColor: '#ffff00', textAlign: 'center', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                                                    PENGELUARAN
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Render 18 baris pengeluaran (Editable) */}
                                            {manualPengeluaran.map((item, i) => (
                                                <tr key={`pengeluaran-${i}`} style={{ height: '18px' }}>
                                                    <td style={{ border: '1px solid black', padding: 0 }}>
                                                        <input 
                                                            type="text" 
                                                            className="w-full h-full px-1 text-[9px] outline-none bg-transparent print:hidden"
                                                            value={item.catatan}
                                                            onChange={(e) => handleManualPengeluaranChange(i, 'catatan', e.target.value)}
                                                            placeholder={i === 0 ? "Ketik pengeluaran..." : ""}
                                                        />
                                                        <span className="hidden print:block px-1 font-medium" style={{ fontSize: '9px', wordBreak: 'break-word' }}>
                                                            {item.catatan}
                                                        </span>
                                                    </td>
                                                    <td style={{ border: '1px solid black', padding: 0, width: '70px' }}>
                                                        <input 
                                                            type="number" 
                                                            className="w-full h-full px-1 text-[9px] outline-none text-right bg-transparent print:hidden"
                                                            value={item.nominal}
                                                            onChange={(e) => handleManualPengeluaranChange(i, 'nominal', e.target.value)}
                                                        />
                                                        <span className="hidden print:block px-1 text-right font-medium" style={{ fontSize: '9px' }}>
                                                            {item.nominal ? Number(item.nominal).toLocaleString('id-ID') : ''}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr>
                                                <td style={{ border: '2px solid black', padding: '4px', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#ffff00' }}>TOTAL</td>
                                                <td style={{ border: '2px solid black', padding: '4px', fontWeight: 'bold', textAlign: 'right', backgroundColor: '#ffff00' }}>
                                                    {finalTotalPengeluaran > 0 ? finalTotalPengeluaran.toLocaleString('id-ID') : ''}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Catatan di Bawah */}
                    <div className="mt-12 flex items-start gap-2">
                        <span className="font-medium text-sm">CATATAN : </span>
                        <div className="flex-1">
                            <textarea
                                className="w-full min-h-[100px] border border-black p-2 outline-none resize-none print:hidden"
                                value={catatan}
                                onChange={(e) => setCatatan(e.target.value)}
                                placeholder="Ketik catatan di sini..."
                            />
                            <p className="hidden print:block whitespace-pre-wrap font-medium">{catatan}</p>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}