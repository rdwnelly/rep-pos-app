"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../../../src/lib/firebase"; 
import { KATEGORI_KASIR } from "../../../utils/constants";

export default function LaporanRekapanPage() {
    const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0]);
    const [namaKasir, setNamaKasir] = useState("");
    const [modalDisetor, setModalDisetor] = useState("");
    const [catatan, setCatatan] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [rekapan, setRekapan] = useState(null);

    const fetchLaporan = async () => {
        if (!tanggal) return;
        
        setIsLoading(true);
        try {
            const startDate = new Date(tanggal);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(tanggal);
            endDate.setHours(23, 59, 59, 999);

            const q = query(
                collection(db, "transaksi_harian"),
                where("tanggal_transaksi", ">=", Timestamp.fromDate(startDate)),
                where("tanggal_transaksi", "<=", Timestamp.fromDate(endDate))
            );

            const querySnapshot = await getDocs(q);

            let totalTunai = 0;
            let totalQris = 0;
            let totalPengeluaran = 0;
            const ringkasanKategori = {};
            const pengeluaranList = [];

            // Inisialisasi semua kategori agar selalu muncul di tabel
            KATEGORI_KASIR.forEach(kat => {
                ringkasanKategori[kat.id] = { tunai: 0, qris: 0 };
            });

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const nominal = Number(data.nominal) || 0;

                if (data.tipe === "pengeluaran") {
                    totalPengeluaran += nominal;
                    pengeluaranList.push({
                        catatan: data.catatan || 'Pengeluaran',
                        nominal: nominal
                    });
                } else if (data.tipe === "pendapatan") {
                    if (ringkasanKategori[data.kategori_kasir]) {
                        if (data.metode_pembayaran === "tunai") {
                            ringkasanKategori[data.kategori_kasir].tunai += nominal;
                            totalTunai += nominal;
                        } else if (data.metode_pembayaran === "qris") {
                            ringkasanKategori[data.kategori_kasir].qris += nominal;
                            totalQris += nominal;
                        }
                    }
                }
            });

            setRekapan({
                kategori: ringkasanKategori,
                totalTunai,
                totalQris,
                totalPengeluaran,
                pengeluaran: pengeluaranList
            });

        } catch (error) {
            console.error("Gagal menarik data:", error);
            alert("Terjadi kesalahan saat menarik data dari Firestore.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLaporan();
    }, [tanggal]);

    const handlePrint = () => {
        window.print();
    };

    const uangYangAda = Number(modalDisetor || 0) + (rekapan?.totalTunai || 0) - (rekapan?.totalPengeluaran || 0);

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
            {isLoading || !rekapan ? (
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
                                            {KATEGORI_KASIR.map(kat => (
                                                <tr key={`tunai-${kat.id}`}>
                                                    <td style={{ border: '1px solid black', padding: '2px 4px', fontWeight: '500' }}>Pendapatan {kat.label}</td>
                                                    <td style={{ border: '1px solid black', padding: '2px 4px', textAlign: 'right', width: '70px', fontWeight: '500' }}>
                                                        {rekapan.kategori[kat.id].tunai > 0 ? rekapan.kategori[kat.id].tunai.toLocaleString('id-ID') : ''}
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
                                            {KATEGORI_KASIR.map(kat => (
                                                <tr key={`qris-${kat.id}`}>
                                                    <td style={{ border: '1px solid black', padding: '2px 4px', fontWeight: '500' }}>Pendapatan {kat.label}</td>
                                                    <td style={{ border: '1px solid black', padding: '2px 4px', textAlign: 'right', width: '70px', fontWeight: '500' }}>
                                                        {rekapan.kategori[kat.id].qris > 0 ? rekapan.kategori[kat.id].qris.toLocaleString('id-ID') : ''}
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
                                                    {rekapan.totalPengeluaran.toLocaleString('id-ID')}
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
                                            {/* Render 18 baris pengeluaran */}
                                            {Array.from({ length: Math.max(18, rekapan.pengeluaran.length) }).map((_, i) => {
                                                const item = rekapan.pengeluaran[i];
                                                return (
                                                    <tr key={`pengeluaran-${i}`} style={{ height: '18px' }}>
                                                        <td style={{ border: '1px solid black', padding: '2px 4px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                                            {item ? item.catatan : ''}
                                                        </td>
                                                        <td style={{ border: '1px solid black', padding: '2px 4px', textAlign: 'right', width: '70px' }}>
                                                            {item ? item.nominal.toLocaleString('id-ID') : ''}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr>
                                                <td style={{ border: '2px solid black', padding: '4px', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#ffff00' }}>TOTAL</td>
                                                <td style={{ border: '2px solid black', padding: '4px', fontWeight: 'bold', textAlign: 'right', backgroundColor: '#ffff00' }}>
                                                    {rekapan.totalPengeluaran > 0 ? rekapan.totalPengeluaran.toLocaleString('id-ID') : ''}
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