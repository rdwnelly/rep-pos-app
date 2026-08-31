import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { Customer, Supplier, UserRole } from '../types';
import { Plus, Edit2, Trash2, Phone, MapPin, Search, User, Truck, Download, Printer, Upload, X, FileSpreadsheet, Users, Mail, ArrowUpDown } from 'lucide-react';
import { exportToCSV, generateUUID, compressImage, exportToExcel } from '../utils';

export const People: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
    const customers = useData(() => StorageService.getCustomers(), [], 'customers') || [];
    const suppliers = useData(() => StorageService.getSuppliers(), [], 'suppliers') || [];
    const [search, setSearch] = useState('');
    const [sortOrder, setSortOrder] = useState<'name_asc' | 'name_desc'>('name_asc');

    // Pagination State
    const [visibleCount, setVisibleCount] = useState(20);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    // Reset pagination on tab/search change
    useEffect(() => {
        setVisibleCount(20);
    }, [activeTab, search]);

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<{ name: string, phone: string, address: string, email: string, image: string }>({ name: '', phone: '', address: '', email: '', image: '' });



    const handleOpenModal = (data?: Customer | Supplier) => {
        if (data) {
            setEditingId(data.id);
            const isCust = activeTab === 'customers';
            setFormData({
                name: data.name,
                phone: data.phone,
                address: data.address || '',
                email: data.email || '',
                image: data.image || ''
            });
        } else {
            setEditingId(null);
            setFormData({ name: '', phone: '', address: '', email: '', image: '' });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name) return;

        const payload = {
            id: editingId || undefined,
            name: formData.name,
            phone: formData.phone,
            address: formData.address,
            email: formData.email,
            image: formData.image,

        };

        if (activeTab === 'customers') {
            await StorageService.saveCustomer(payload as Customer);
        } else {
            await StorageService.saveSupplier(payload as Supplier);
        }

        setIsModalOpen(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Yakin hapus kontak ini?')) return;

        if (activeTab === 'customers') {
            await StorageService.deleteCustomer(id);
        } else {
            await StorageService.deleteSupplier(id);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const compressed = await compressImage(file);
                setFormData({ ...formData, image: compressed });
            } catch (error) {
                console.error("Gagal memproses gambar", error);
            }
        }
    };

    const handleRemoveImage = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setFormData({ ...formData, image: '' });
    };

    const handleExport = () => {
        const data = activeTab === 'customers' ? customers : suppliers;
        const filename = activeTab === 'customers' ? 'data-pelanggan.csv' : 'data-supplier.csv';
        const headers = ['ID', 'Nama', 'Telepon', 'Alamat', 'Email'];
        const rows = data.map(d => {
            const row = [d.id, d.name, d.phone, d.address || '', d.email || ''];

            return row;
        });
        exportToCSV(filename, headers, rows);
    };

    const handleExportExcel = () => {
        const data = activeTab === 'customers' ? customers : suppliers;
        const sheetName = activeTab === 'customers' ? 'Data Pelanggan' : 'Data Supplier';
        const fileNamePrefix = activeTab === 'customers' ? 'Data_Pelanggan' : 'Data_Supplier';

        const exportData = data.map(d => ({
            'ID': d.id,
            'Nama': d.name,
            'Telepon': d.phone,
            'Alamat': d.address || '',
            'Email': d.email || '',

        }));

        const cols = [
            { wch: 15 }, // ID
            { wch: 30 }, // Nama
            { wch: 15 }, // Telepon
            { wch: 40 }, // Alamat
            { wch: 25 }, // Email

        ];

        exportToExcel(exportData, fileNamePrefix, sheetName, cols);
    };

    const handlePrint = () => {
        const data = activeTab === 'customers' ? customers : suppliers;
        const title = activeTab === 'customers' ? 'Laporan Data Pelanggan' : 'Laporan Data Supplier';
        const isCustomer = activeTab === 'customers';

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const rowsHtml = data.map((item, idx) => `
          <tr>
              <td style="text-align:center">${idx + 1}</td>
              <td>${item.name}</td>
              <td>${item.phone}</td>
              <td>${item.address || '-'}</td>
              <td>${item.email || '-'}</td>

          </tr>
      `).join('');

        printWindow.document.write(`
          <html>
            <head>
                <title>${title}</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #000; padding: 8px; font-size: 12px; }
                    th { background-color: #f0f0f0; }
                    h2 { text-align: center; margin-bottom: 5px; }
                    .date { text-align: center; font-size: 12px; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <h2>${title}</h2>
                <p class="date">Dicetak pada: ${new Date().toLocaleString('id-ID')}</p>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 40px">No</th>
                            <th>Nama</th>
                            <th>Telepon</th>
                            <th>Alamat</th>
                            <th>Email</th>
                            ${isCustomer ? '<th>Harga Default</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
                <script>window.print();</script>
            </body>
          </html>
      `);
        printWindow.document.close();
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            let text = event.target?.result as string;

            // Remove BOM if present
            if (text.charCodeAt(0) === 0xFEFF) {
                text = text.slice(1);
            }

            // Split by newline, handling \r\n and \n
            const lines = text.split(/\r?\n/).filter(l => l.trim());

            if (lines.length < 2) {
                alert('Format CSV tidak valid atau kosong.');
                return;
            }

            // Detect Delimiter (priority to semicolon if more common in header)
            const firstLine = lines[0];
            const commaCount = (firstLine.match(/,/g) || []).length;
            const semiCount = (firstLine.match(/;/g) || []).length;
            const delimiter = semiCount > commaCount ? ';' : ',';

            console.log('CSV Import Debug:', { delimiter, firstLine });

            // Parse Headers
            const headers = firstLine.split(delimiter).map(h => h.replace(/"/g, '').trim().toLowerCase());
            console.log('Parsed Headers:', headers);

            // Column Mapping
            const colMap = {
                id: headers.findIndex(h => h === 'id'),
                name: headers.findIndex(h => h.includes('nama') || h.includes('name') || h === 'supplier' || h === 'pelanggan' || h.includes('toko') || h.includes('pemasok')),
                phone: headers.findIndex(h => h.includes('telepon') || h.includes('phone') || h.includes('hp') || h.includes('telp') || h.includes('wa')),
                address: headers.findIndex(h => h.includes('alamat') || h.includes('address') || h.includes('lokasi')),
                email: headers.findIndex(h => h.includes('email') || h.includes('e-mail') || h.includes('surat') || h.includes('mail')),
                priceType: headers.findIndex(h => h.includes('harga') || h.includes('price') || h.includes('tipe') || h.includes('level'))
            };

            console.log('Column Map:', colMap);

            // Basic Validation
            if (colMap.name === -1) {
                alert(`Kolom "Nama" tidak ditemukan dalam CSV (Delimiter: "${delimiter}", Header: "${headers.join(', ')}"). Pastikan ada kolom nama/name/supplier.`);
                return;
            }

            const newItems: any[] = [];

            // Skip header, start from 1
            for (let i = 1; i < lines.length; i++) {
                // Robust CSV split handling quoted fields
                const rowLine = lines[i];
                const cols: string[] = [];
                let current = '';
                let inQuote = false;

                for (let j = 0; j < rowLine.length; j++) {
                    const char = rowLine[j];
                    if (char === '"') {
                        inQuote = !inQuote;
                        current += char;
                    } else if (char === delimiter && !inQuote) {
                        cols.push(current);
                        current = '';
                    } else {
                        current += char;
                    }
                }
                cols.push(current);

                if (cols.length < headers.length && cols.length === 1 && cols[0] === '') continue; // Skip empty rows

                const getValue = (index: number) => {
                    if (index === -1) return '';
                    let val = cols[index]?.trim() || '';
                    // Remove surrounding quotes if present and unescape double quotes
                    if (val.startsWith('"') && val.endsWith('"')) {
                        val = val.slice(1, -1).replace(/""/g, '"');
                    } else {
                        val = val.replace(/"/g, ''); // Fallback cleanup
                    }
                    return val;
                };

                const existingId = getValue(colMap.id);

                const item: any = {
                    id: existingId || generateUUID(),
                    name: getValue(colMap.name),
                    phone: getValue(colMap.phone),
                    address: getValue(colMap.address),
                    email: getValue(colMap.email),
                    image: ''
                };

                if (activeTab === 'customers') {
                    // Default Price Type mapping

                    newItems.push(item as Customer);
                } else {
                    newItems.push(item as Supplier);
                }
            }

            if (newItems.length > 0) {
                if (activeTab === 'customers') {
                    StorageService.saveCustomersBulk(newItems as Customer[])
                        .then(() => {
                            alert(`Berhasil memproses ${newItems.length} pelanggan (Tambah/Update).`);
                            window.location.reload();
                        })
                        .catch(err => {
                            console.error(err);
                            alert('Gagal menyimpan data pelanggan: ' + err.message);
                        });
                } else {
                    StorageService.saveSuppliersBulk(newItems as Supplier[])
                        .then(() => {
                            alert(`Berhasil memproses ${newItems.length} supplier (Tambah/Update).`);
                            window.location.reload();
                        })
                        .catch(err => {
                            console.error(err);
                            alert('Gagal menyimpan data supplier: ' + err.message);
                        });
                }
            } else {
                alert('Tidak ada data yang dapat diproses.');
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    };

    const dataList = activeTab === 'customers' ? customers : suppliers;
    const filteredList = useMemo(() => {
        const filtered = dataList.filter(item =>
            item.name.toLowerCase().includes(search.toLowerCase()) ||
            item.phone.includes(search) ||
            (item.email && item.email.toLowerCase().includes(search.toLowerCase())) ||
            (item.address && item.address.toLowerCase().includes(search.toLowerCase()))
        );

        return filtered.sort((a, b) => {
            if (sortOrder === 'name_asc') return a.name.localeCompare(b.name);
            if (sortOrder === 'name_desc') return b.name.localeCompare(a.name);
            return 0;
        });
    }, [dataList, search, sortOrder]);

    const visibleList = useMemo(() => filteredList.slice(0, visibleCount), [filteredList, visibleCount]);

    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => prev + 20);
                }
            },
            { threshold: 0.5 }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => {
            if (loadMoreRef.current) {
                observer.unobserve(loadMoreRef.current);
            }
        };
    }, [loadMoreRef.current, filteredList]);

    return (
        <div className="space-y-6 animate-fade-in p-2 md:p-0">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="text-amber-600" />
                        Daftar Kontak (Pelanggan & Supplier)
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Kelola direktori kontak pelanggan dan supplier beserta akses cepat WhatsApp</p>
                </div>

                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    {/* Hide Import CSV for Cashier and Admin */}
                    {['CASHIER', 'ADMIN'].indexOf((JSON.parse(localStorage.getItem('pos_current_user') || '{}') as any).role) === -1 && (
                        <label className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-white border border-slate-300 px-3.5 py-2 rounded-xl text-slate-700 hover:bg-slate-50 transition-all flex text-xs font-medium shadow-sm cursor-pointer">
                            <Upload size={15} /> Import CSV
                            <input id="csvImport" name="csvImport" type="file" accept=".csv" className="hidden" onChange={handleImport} />
                        </label>
                    )}
                    <button onClick={handlePrint} className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-white border border-slate-300 px-3.5 py-2 rounded-xl text-slate-700 hover:bg-slate-50 transition-all flex text-xs font-medium shadow-sm">
                        <Printer size={15} /> Print
                    </button>
                    <button onClick={handleExportExcel} className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl text-emerald-700 hover:bg-emerald-100 transition-all flex text-xs font-medium shadow-sm">
                        <FileSpreadsheet size={15} /> Excel
                    </button>
                    <button onClick={handleExport} className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-white border border-slate-300 px-3.5 py-2 rounded-xl text-slate-700 hover:bg-slate-50 transition-all flex text-xs font-medium shadow-sm">
                        <Download size={15} /> CSV
                    </button>
                    <button onClick={() => handleOpenModal()} className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md">
                        <Plus size={16} /> Tambah Kontak
                    </button>
                </div>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Pelanggan</p>
                        <h3 className="text-lg font-extrabold text-slate-900 mt-1">{customers.length} <span className="text-xs font-normal text-slate-400">kontak</span></h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Pelanggan Terdaftar</p>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                        <User size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Supplier</p>
                        <h3 className="text-lg font-extrabold text-amber-600 mt-1">{suppliers.length} <span className="text-xs font-normal text-slate-400">supplier</span></h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Mitra Pemasok</p>
                    </div>
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                        <Truck size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Terhubung Telepon/WA</p>
                        <h3 className="text-lg font-extrabold text-emerald-600 mt-1">
                            {customers.filter(c => c.phone).length + suppliers.filter(s => s.phone).length} <span className="text-xs font-normal text-slate-400">nomor</span>
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Akses Kontak Langsung</p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                        <Phone size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Kategori Terpilih</p>
                        <h3 className="text-lg font-extrabold text-purple-700 mt-1 capitalize">{activeTab === 'customers' ? 'Pelanggan' : 'Supplier'}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{filteredList.length} Kontak Tampil</p>
                    </div>
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                        <Users size={22} />
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar Container */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                {/* Tab Pill Navigation */}
                <div className="flex gap-2 py-1 px-1 bg-slate-100/80 rounded-xl">
                    <button
                        onClick={() => setActiveTab('customers')}
                        className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-lg transition-all ${
                            activeTab === 'customers'
                                ? 'bg-amber-600 text-white shadow-md'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                        }`}
                    >
                        <User size={15} />
                        Pelanggan ({customers.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('suppliers')}
                        className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-lg transition-all ${
                            activeTab === 'suppliers'
                                ? 'bg-amber-600 text-white shadow-md'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                        }`}
                    >
                        <Truck size={15} />
                        Supplier ({suppliers.length})
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                    {/* Sort Selector */}
                    <div className="relative">
                        <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <select
                            id="peopleSort"
                            name="peopleSort"
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as any)}
                            className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none text-xs font-semibold text-slate-700 appearance-none cursor-pointer"
                        >
                            <option value="name_asc">Urutkan: A-Z</option>
                            <option value="name_desc">Urutkan: Z-A</option>
                        </select>
                    </div>

                    {/* Search Input */}
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            id="peopleSearch"
                            name="peopleSearch"
                            type="text"
                            placeholder="Cari nama, HP, email, alamat..."
                            className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all text-xs text-slate-800"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Card View */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredList.length === 0 && (
                    <div className="col-span-full text-center py-12 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                        Tidak ada data kontak ditemukan.
                    </div>
                )}
                {visibleList.map(item => {
                    const formattedWa = item.phone ? item.phone.replace(/^0/, '62').replace(/[^0-9]/g, '') : '';
                    return (
                        <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:border-amber-500/50 transition-colors group flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-100 flex-shrink-0">
                                            {item.image ? (
                                                <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
                                            ) : (
                                                <div className={`w-full h-full flex items-center justify-center text-lg font-bold ${activeTab === 'customers' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                                                    {item.name.substring(0, 1).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-sm">{item.name}</h4>
                                            <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 bg-slate-100 rounded-full">
                                                {activeTab === 'customers' ? 'Pelanggan' : 'Supplier'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => handleOpenModal(item)} className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg transition-colors" title="Edit Kontak"><Edit2 size={15} /></button>
                                        <button onClick={() => handleDelete(item.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Hapus Kontak"><Trash2 size={15} /></button>
                                    </div>
                                </div>
                                <div className="space-y-2 text-xs text-slate-600 my-3">
                                    <div className="flex items-center gap-2">
                                        <Phone size={14} className="text-slate-400 shrink-0" />
                                        <span className="font-medium text-slate-800">{item.phone || '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <MapPin size={14} className="text-slate-400 shrink-0" />
                                        <span className="line-clamp-1">{item.address || '-'}</span>
                                    </div>
                                    {item.email && (
                                        <div className="flex items-center gap-2">
                                            <Mail size={14} className="text-slate-400 shrink-0" />
                                            <span className="line-clamp-1">{item.email}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Direct Call & WhatsApp Action Buttons */}
                            {item.phone && (
                                <div className="pt-3 border-t border-slate-100 flex gap-2">
                                    <a
                                        href={`https://web.whatsapp.com/send?phone=${formattedWa}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-1.5 px-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                                        title="Buka Chat di WhatsApp Web"
                                    >
                                        <Phone size={12} /> WhatsApp Web
                                    </a>
                                    <a
                                        href={`tel:${item.phone}`}
                                        className="py-1.5 px-3 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 transition-colors"
                                    >
                                        Telepon
                                    </a>
                                </div>
                            )}
                        </div>
                    );
                })}
                {visibleList.length < filteredList.length && (
                    <div className="col-span-full text-center py-4 text-slate-400 text-xs">
                        <div ref={loadMoreRef}>Memuat data kontak berikutnya...</div>
                    </div>
                )}
            </div>

            {/* Modal Tambah/Edit Kontak */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-up">
                        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                            <h3 className="font-bold text-sm">
                                {editingId ? 'Edit Data' : 'Tambah'} {activeTab === 'customers' ? 'Pelanggan' : 'Supplier'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 text-xs">
                            <div className="flex justify-center mb-2 relative">
                                <label className="relative w-20 h-20 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-amber-500 overflow-hidden group">
                                    {formData.image ? (
                                        <img src={formData.image} className="w-full h-full object-cover" alt="Preview" />
                                    ) : (
                                        <Upload className="text-slate-400 group-hover:text-amber-600" size={20} />
                                    )}
                                    <input id="imageUpload" name="imageUpload" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                                    <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity text-white text-[10px] font-bold ${formData.image ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'}`}>
                                        Ubah Foto
                                    </div>
                                </label>
                                {formData.image && (
                                    <button
                                        onClick={handleRemoveImage}
                                        className="absolute top-0 right-1/3 bg-white text-rose-600 p-1 rounded-full shadow border border-slate-200 hover:bg-rose-50 z-10"
                                        title="Hapus Foto"
                                        type="button"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                            <div>
                                <label htmlFor="name" className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">Nama Lengkap</label>
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    autoComplete="name"
                                    className="w-full border border-slate-300 p-2.5 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-slate-800"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Contoh: Toko Berkah / Bpk. Ahmad"
                                />
                            </div>
                            <div>
                                <label htmlFor="phone" className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">No. Telepon / WhatsApp</label>
                                <input
                                    id="phone"
                                    name="phone"
                                    type="text"
                                    autoComplete="tel"
                                    className="w-full border border-slate-300 p-2.5 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-slate-800 font-mono"
                                    value={formData.phone}
                                    onChange={e => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        setFormData({ ...formData, phone: val });
                                    }}
                                    placeholder="0812..."
                                />
                            </div>
                            <div>
                                <label htmlFor="email" className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">Email (Opsional)</label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    className="w-full border border-slate-300 p-2.5 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-slate-800"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="nama@email.com"
                                />
                            </div>
                            <div>
                                <label htmlFor="address" className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wider">Alamat (Opsional)</label>
                                <textarea
                                    id="address"
                                    name="address"
                                    autoComplete="street-address"
                                    className="w-full border border-slate-300 p-2.5 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-slate-800"
                                    rows={2}
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="Jl. Utama No. 12..."
                                />
                            </div>

                            <div className="flex gap-3 pt-2 border-t border-slate-100">
                                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors">Batal</button>
                                <button onClick={handleSave} className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-colors shadow-md">Simpan Kontak</button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};