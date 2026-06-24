"use client";

import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../src/lib/firebase"; // Updated path
import { KATEGORI_KASIR, METODE_PEMBAYARAN } from "../../../utils/constants";

export default function InputKasirPage() {
    const [formData, setFormData] = useState({
        namaKasir: "",
        kategoriKasir: KATEGORI_KASIR[0].id,
        metodePembayaran: METODE_PEMBAYARAN[0].id,
        nominal: "",
        catatan: "",
        tipe: "pendapatan",
    });

    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage({ type: "", text: "" });

        try {
            await addDoc(collection(db, "transaksi_harian"), {
                nama_kasir: formData.namaKasir,
                kategori_kasir: formData.kategoriKasir,
                metode_pembayaran: formData.metodePembayaran,
                nominal: Number(formData.nominal),
                catatan: formData.catatan,
                tipe: formData.tipe,
                tanggal_transaksi: serverTimestamp(),
            });

            setMessage({ type: "success", text: "Transaksi berhasil disimpan!" });
            setFormData((prev) => ({ ...prev, nominal: "", catatan: "" }));
        } catch (error) {
            console.error("Error adding document: ", error);
            setMessage({ type: "error", text: "Gagal menyimpan transaksi. Coba lagi." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
            <div className="max-w-xl w-full bg-white rounded-xl shadow-md p-8">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-amber-900">Input Transaksi Kasir</h1>
                    <p className="text-sm text-gray-500">Yayasan Rumah Etnik Papua</p>
                </div>

                {message.text && (
                    <div className={`p-4 mb-6 rounded-md text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kasir</label>
                        <input
                            type="text"
                            name="namaKasir"
                            value={formData.namaKasir}
                            onChange={handleChange}
                            required
                            placeholder="Contoh: Mitshi"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Kasir</label>
                            <select
                                name="kategoriKasir"
                                value={formData.kategoriKasir}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors"
                            >
                                {KATEGORI_KASIR.map((kategori) => (
                                    <option key={kategori.id} value={kategori.id}>
                                        {kategori.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Metode Pembayaran</label>
                            <select
                                name="metodePembayaran"
                                value={formData.metodePembayaran}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors"
                            >
                                {METODE_PEMBAYARAN.map((metode) => (
                                    <option key={metode.id} value={metode.id}>
                                        {metode.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Transaksi</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2">
                                <input type="radio" name="tipe" value="pendapatan" checked={formData.tipe === 'pendapatan'} onChange={handleChange} className="text-amber-600 focus:ring-amber-500" />
                                <span className="text-sm text-gray-700">Pendapatan</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="radio" name="tipe" value="pengeluaran" checked={formData.tipe === 'pengeluaran'} onChange={handleChange} className="text-amber-600 focus:ring-amber-500" />
                                <span className="text-sm text-gray-700">Pengeluaran</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp)</label>
                        <input
                            type="number"
                            name="nominal"
                            value={formData.nominal}
                            onChange={handleChange}
                            required
                            min="0"
                            placeholder="Contoh: 25000"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Catatan {formData.tipe === 'pendapatan' && <span className="text-red-500">*</span>}
                        </label>
                        <textarea
                            name="catatan"
                            value={formData.catatan}
                            onChange={handleChange}
                            required={formData.tipe === 'pendapatan'}
                            rows="3"
                            placeholder="Contoh: 1 Tiket Dewasa Domestik"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-amber-500 focus:border-amber-500 outline-none transition-colors resize-none"
                        ></textarea>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full py-3 px-4 text-white font-medium rounded-lg transition-colors ${isLoading ? "bg-amber-400 cursor-not-allowed" : "bg-amber-700 hover:bg-amber-800"
                            }`}
                    >
                        {isLoading ? "Menyimpan Data..." : "Simpan Transaksi"}
                    </button>
                </form>
            </div>
        </div>
    );
}