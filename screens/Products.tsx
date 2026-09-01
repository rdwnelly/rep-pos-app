import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { Product, Category, UserRole } from '../types';
import { formatIDR, formatNumber, exportToCSV, generateSKU, compressImage, exportToExcel } from '../utils';
import { Edit2, Trash2, Plus, X, Download, Upload, Tag, Barcode, Image as ImageIcon, Search, Printer, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, FileSpreadsheet, Package, Sparkles } from 'lucide-react';
import { HPPCalculatorModal } from '../components/HPPCalculatorModal';

export const Products: React.FC = () => {
  const products = useData(() => StorageService.getProducts(), [], 'products') || [];
  const categories = useData(() => StorageService.getCategories(), [], 'categories') || [];

  // Filters
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isHPPModalOpen, setIsHPPModalOpen] = useState(false);

  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Pagination State
  const [visibleCount, setVisibleCount] = useState(20);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { current } = scrollContainerRef;
      const scrollAmount = 200;
      if (direction === 'left') {
        current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryFormName, setCategoryFormName] = useState('');

  // Product Form State
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '', sku: '', stock: 0, hpp: 0, price: 0, categoryId: '', categoryName: '', image: '', unit: 'Pcs'
  });



  // --- PRODUCT ACTIONS ---

  const handleSaveProduct = async () => {
    // 1. Validasi Nama Produk
    if (!formData.name || !formData.name.trim()) {
      alert("Nama produk wajib diisi!");
      return;
    }

    // 2. Validasi Kode SKU / Barcode
    if (!formData.sku || !formData.sku.trim()) {
      alert("Kode SKU / Barcode wajib diisi! Silakan scan barcode atau gunakan tombol generate.");
      return;
    }

    // 3. Validasi Kategori Produk (Wajib dipilih kategori resmi)
    if (!formData.categoryId || !formData.categoryId.trim()) {
      alert("Kategori produk wajib dipilih! Silakan pilih salah satu kategori yang tersedia pada pilihan kategori.");
      return;
    }

    const availableCategories = categories.filter(c => c && c.name && c.name.trim().toLowerCase() !== 'umum');
    const selectedCat = availableCategories.find(c => c.id === formData.categoryId);
    if (!selectedCat || !selectedCat.name || selectedCat.name.trim().toLowerCase() === 'umum') {
      alert("Kategori produk yang dipilih tidak valid. Silakan pilih kategori resmi yang tersedia.");
      return;
    }

    // 4. Validasi Satuan Produk
    if (!formData.unit || !formData.unit.trim()) {
      alert("Satuan produk wajib diisi (Contoh: Pcs, Box, Porsi, dll)!");
      return;
    }

    // 5. Validasi Stok Awal
    if (formData.stock === undefined || formData.stock === null || isNaN(Number(formData.stock)) || Number(formData.stock) < 0) {
      alert("Stok awal wajib diisi dengan angka minimal 0!");
      return;
    }

    // 6. Validasi HPP (Harga Modal)
    if (formData.hpp === undefined || formData.hpp === null || isNaN(Number(formData.hpp)) || Number(formData.hpp) < 0) {
      alert("HPP (Harga Modal) wajib diisi dengan nominal angka minimal 0!");
      return;
    }

    // 7. Validasi Harga Jual (Eceran)
    if (!formData.price || isNaN(Number(formData.price)) || Number(formData.price) <= 0) {
      alert("Harga jual wajib diisi dengan nominal lebih dari Rp 0!");
      return;
    }

    // Cegah duplikat saat mode tambah baru (bukan edit)
    if (!editingId) {
      const skuExists = products.some(
        p => p.sku && p.sku.trim().toLowerCase() === formData.sku!.trim().toLowerCase()
      );
      if (skuExists) {
        alert(`Produk dengan SKU "${formData.sku}" sudah ada!\nGunakan tombol Edit untuk mengubah produk yang sudah ada.`);
        return;
      }

      const nameExists = products.some(
        p => p.name && p.name.trim().toLowerCase() === formData.name!.trim().toLowerCase()
      );
      if (nameExists) {
        const confirmAnyway = confirm(
          `Produk dengan nama "${formData.name}" sudah ada.\n\nApakah Anda yakin ingin menambahkan produk baru dengan nama yang sama?`
        );
        if (!confirmAnyway) return;
      }
    }

    const payload = {
      ...formData,
      id: editingId || undefined,
      categoryName: selectedCat.name.trim(),
      categoryId: selectedCat.id,
      image: formData.image || '',
      stock: Number(formData.stock) || 0,
      hpp: Number(formData.hpp) || 0,
      price: Number(formData.price) || 0,
      unit: formData.unit.trim()
    } as Product;

    await StorageService.saveProduct(payload);
    setIsProductModalOpen(false);
    setEditingId(null);
    resetProductForm();
  };

  const handleEditProduct = (p: Product) => {
    setFormData(p);
    setEditingId(p.id);
    setIsProductModalOpen(true);
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Yakin hapus produk ini?')) {
      await StorageService.deleteProduct(id);
    }
  };

  const handleGenerateCode = () => {
    setFormData({ ...formData, sku: generateSKU() });
  };

  const resetProductForm = () => {
    setFormData({ name: '', sku: '', stock: 0, hpp: 0, price: 0, categoryId: '', categoryName: '', image: '', unit: 'Pcs' });
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

  const handleApplyHPP = (hpp: number, selectedPrice: number, allSuggestions: any[]) => {
    const eko = allSuggestions.find(s => s.tier === 'Ekonomis')?.price || selectedPrice;
    const std = allSuggestions.find(s => s.tier === 'Standar')?.price || selectedPrice;
    const prem = allSuggestions.find(s => s.tier === 'Premium')?.price || 0;

    setFormData(prev => ({
      ...prev,
      hpp: hpp,
      price: std
    }));
    setIsHPPModalOpen(false);
  };

  // Helper for numeric input
  const handleNumericInput = (key: keyof Product, value: string) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    setFormData({ ...formData, [key]: parseInt(numericValue) || 0 });
  };

  // --- CATEGORY ACTIONS ---

  const handleSaveCategory = async () => {
    if (!categoryFormName) return;
    await StorageService.saveCategory({ id: editingId || '', name: categoryFormName });
    setCategoryFormName('');
    setEditingId(null);
  };

  const handleDeleteCategory = async (id: string) => {
    if (confirm('Yakin hapus kategori? Produk dalam kategori ini akan tetap ada namun tanpa kategori.')) {
      await StorageService.deleteCategory(id);
    }
  };

  // --- SORTING ---
  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key === key && current.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown size={14} className="ml-1 text-slate-400 inline" />;
    return sortConfig.direction === 'asc'
      ? <ArrowUp size={14} className="ml-1 text-primary inline" />
      : <ArrowDown size={14} className="ml-1 text-primary inline" />;
  };

  // --- IMPORT / EXPORT ---

  const handleExport = () => {
    const currentUser = JSON.parse(localStorage.getItem('pos_current_user') || '{}');
    const showHPP = currentUser.role !== UserRole.CASHIER && currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.WAREHOUSE;

    const headers = ['ID', 'Nama Produk', 'SKU', 'Kategori', 'Satuan', 'Stok'];
    if (showHPP) headers.push('HPP');
    headers.push('Harga Jual');

    const rows = products.map(p => {
      const row = [p.id, p.name, p.sku, p.categoryName, p.unit || 'Pcs', p.stock];
      if (showHPP) row.push(p.hpp);
      row.push(p.price);
      return row;
    });

    exportToCSV(`produk-${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const handleExportExcel = () => {
    const currentUser = JSON.parse(localStorage.getItem('pos_current_user') || '{}');
    const showHPP = currentUser.role !== UserRole.CASHIER && currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.WAREHOUSE;

    const data = filteredProducts.map(p => {
      const row: any = {
        'ID': p.id,
        'Nama Produk': p.name,
        'SKU': p.sku,
        'Kategori': p.categoryName,
        'Satuan': p.unit || 'Pcs',
        'Stok': p.stock,
      };
      if (showHPP) {
        row['HPP'] = p.hpp;
      }
      row['Harga Jual'] = p.price;
      return row;
    });

    // Auto-width columns
    const cols = [
      { wch: 15 }, // ID
      { wch: 30 }, // Nama
      { wch: 15 }, // SKU
      { wch: 15 }, // Kategori
      { wch: 10 }, // Satuan
      { wch: 10 }, // Stok
    ];
    if (showHPP) {
      cols.push({ wch: 15 }); // HPP
    }
    cols.push(
      { wch: 15 }  // Harga Jual
    );

    exportToExcel(data, "Produk", "Daftar Produk", cols);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const currentUser = JSON.parse(localStorage.getItem('pos_current_user') || '{}');
    const showHPP = currentUser.role !== UserRole.CASHIER && currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.WAREHOUSE;

    const rows = filteredProducts.map(p => `
      <tr>
        <td>${p.name}</td>
        <td style="font-family: monospace; font-size: 11px;">${p.sku}</td>
        <td>${p.categoryName}</td>
        <td style="text-align: center;">${p.unit || 'Pcs'}</td>
        <td style="text-align: center;">${p.stock}</td>
        ${showHPP ? `<td style="text-align: right;">${formatIDR(p.hpp || 0)}</td>` : ''}
        <td style="text-align: right;">
          <div style="font-size: 11px;">
            <div style="color: #1d4ed8; font-weight: bold;">${formatIDR(p.price)}</div>
          </div>
        </td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Daftar Produk</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h2 { text-align: center; margin-bottom: 5px; }
            .subtitle { text-align: center; color: #666; font-size: 12px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #000; padding: 8px; font-size: 12px; }
            th { background-color: #eee; font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>Daftar Produk</h2>
          <p class="subtitle">Total: ${filteredProducts.length} produk${filterCategory !== 'ALL' ? ` - Kategori: ${categories.find(c => c.id === filterCategory)?.name || 'Semua'}` : ''}</p>
          <table>
            <thead>
              <tr>
                <th>Nama Produk</th>
                <th>SKU</th>
                <th>Kategori</th>
                <th>Satuan</th>
                <th>Stok</th>
                ${showHPP ? '<th>HPP (Modal)</th>' : ''}
                <th>Harga Jual</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
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

      console.log('CSV Import Debug (Products):', { delimiter, firstLine });

      // Parse Headers
      const headers = firstLine.split(delimiter).map(h => h.replace(/"/g, '').trim().toLowerCase());
      console.log('Parsed Headers (Products):', headers);

      const colMap = {
        id: headers.findIndex(h => h === 'id'),
        name: headers.findIndex(h => h.includes('nama') || h.includes('name')),
        sku: headers.findIndex(h => h.includes('sku') || h.includes('kode')),
        category: headers.findIndex(h => h.includes('kategori') || h.includes('category')),
        stock: headers.findIndex(h => h.includes('stok') || h.includes('stock')),
        hpp: headers.findIndex(h => h.includes('hpp') || h.includes('modal')),
        retail: headers.findIndex(h => h.includes('eceran') || h.includes('retail')),
        employee: headers.findIndex(h => h.includes('karyawan') || h.includes('employee')),
        unit: headers.findIndex(h => h.includes('satuan') || h.includes('unit')),
        wholesale: headers.findIndex(h => h.includes('grosir') || h.includes('wholesale'))
      };

      // Basic validation: Name is required
      if (colMap.name === -1) {
        alert(`Kolom "Nama Produk" tidak ditemukan dalam CSV (Delimiter terdeteksi: "${delimiter}").`);
        return;
      }

      const newProducts: Product[] = [];

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

        const getValue = (index: number, type: 'string' | 'float' | 'int' = 'string') => {
          if (index === -1) return type === 'string' ? '' : 0;
          let val = cols[index]?.trim() || '';

          // Remove surrounding quotes if present and unescape double quotes
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1).replace(/""/g, '"');
          } else {
            val = val.replace(/"/g, ''); // Fallback cleanup
          }

          if (type === 'int') return parseInt(val) || 0;
          if (type === 'float') return parseFloat(val) || 0;
          return val;
        };

        const existingId = getValue(colMap.id);
        const rawCatName = (getValue(colMap.category) as string) || '';
        const validCatName = (!rawCatName || rawCatName.trim().toLowerCase() === 'umum') ? 'Toko / Souvenir' : rawCatName.trim();
        const foundCat = categories.find(c => c && c.name && c.name.toLowerCase() === validCatName.toLowerCase()) || categories[0];

        newProducts.push({
          id: (existingId as string) || generateSKU(), // Use existing ID if present (update), else generate
          name: getValue(colMap.name) as string,
          sku: (getValue(colMap.sku) as string) || generateSKU(),
          categoryId: foundCat ? foundCat.id : '',
          categoryName: foundCat ? foundCat.name : validCatName,
          unit: (getValue(colMap.unit) as string) || 'Pcs',
          stock: getValue(colMap.stock, 'int') as number,
          hpp: getValue(colMap.hpp, 'float') as number,
          price: getValue(colMap.retail, 'float') as number,
          image: ''
        });
      }

      if (newProducts.length > 0) {
        StorageService.saveProductsBulk(newProducts).then(() => {
          alert(`Berhasil memproses ${newProducts.length} produk (Tambah/Update).`);
          window.location.reload(); // Reload to refresh list
        });
      } else {
        alert('Tidak ada data yang dapat diproses.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // --- RENDER ---
  // --- RENDER ---
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => filterCategory === 'ALL' || p.categoryId === filterCategory)
      .filter(p => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          p.categoryName.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (!sortConfig) return 0;

        let aVal: any = a[sortConfig.key as keyof Product];
        let bVal: any = b[sortConfig.key as keyof Product];

        // Handle numeric vs string
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
  }, [products, filterCategory, searchQuery, sortConfig]);

  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(20);
  }, [filterCategory, searchQuery, sortConfig]);

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
  }, [loadMoreRef.current, filteredProducts]);

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-0">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-amber-600" />
            Daftar Produk & Inventaris
          </h1>
          <p className="text-slate-500 text-sm mt-1">Kelola stok barang, harga modal (HPP), harga jual eceran & grosir</p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button onClick={() => setIsCategoryModalOpen(true)} className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-white border border-slate-300 px-3.5 py-2 rounded-xl text-slate-700 hover:bg-slate-50 transition-all flex text-xs font-medium shadow-sm">
            <Tag size={15} /> Kategori
          </button>

          {/* Hide Import CSV for Cashier and Warehouse */}
          {['CASHIER', 'GUDANG'].indexOf((JSON.parse(localStorage.getItem('pos_current_user') || '{}') as any).role) === -1 && (
            <label className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-white border border-slate-300 px-3.5 py-2 rounded-xl text-slate-700 hover:bg-slate-50 transition-all flex text-xs font-medium shadow-sm cursor-pointer">
              <Upload size={15} /> Import CSV
              <input id="csvProductImport" name="csvProductImport" type="file" accept=".csv" className="hidden" onChange={handleImport} />
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
          {/* Hide Add Button for Warehouse */}
          {(JSON.parse(localStorage.getItem('pos_current_user') || '{}') as any).role !== UserRole.WAREHOUSE && (
            <button onClick={() => { resetProductForm(); setIsProductModalOpen(true); }} className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md">
              <Plus size={16} /> Tambah Produk
            </button>
          )}
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Jenis Produk</p>
            <h3 className="text-lg font-extrabold text-slate-900 mt-1">{products.length} <span className="text-xs font-normal text-slate-400">item</span></h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{categories.length} Kategori Terdaftar</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <Package size={22} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Stok Produk</p>
            <h3 className="text-lg font-extrabold text-emerald-600 mt-1">
              {formatNumber(products.reduce((acc, p) => acc + (p.stock || 0), 0))} <span className="text-xs font-normal text-slate-400">unit</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Semua Stok Fisik</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <Tag size={22} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Aset Modal (HPP)</p>
            <h3 className="text-lg font-extrabold text-amber-700 mt-1">
              {formatIDR(products.reduce((acc, p) => acc + ((p.hpp || 0) * (p.stock || 0)), 0))}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Nilai Total Modal Stok</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <FileSpreadsheet size={22} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Stok Menipis (&lt; 10)</p>
            <h3 className="text-lg font-extrabold text-rose-600 mt-1">
              {formatNumber(products.filter(p => (p.stock || 0) < 10).length)} <span className="text-xs font-normal text-slate-400">produk</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Perlu Restok Segera</p>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
            <Trash2 size={22} />
          </div>
        </div>
      </div>

      {/* Filter Category & Search Bar Container */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Category Carousel Chips */}
        <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
          <button
            onClick={() => scroll('left')}
            className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
          >
            <ChevronLeft size={16} />
          </button>

          <div
            ref={scrollContainerRef}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 scroll-smooth py-1"
          >
            <button
              onClick={() => setFilterCategory('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterCategory === 'ALL'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Semua ({products.length})
            </button>
            {categories.map(c => {
              const count = products.filter(p => p.categoryId === c.id).length;
              return (
                <button
                  key={c.id}
                  onClick={() => setFilterCategory(c.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    filterCategory === c.id
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {c.name} ({count})
                </button>
              );
            })}
          </div>

          <button
            onClick={() => scroll('right')}
            className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="productSearchMain"
            name="productSearchMain"
            type="text"
            placeholder="Cari nama produk, SKU, atau kategori..."
            className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all text-xs text-slate-800"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              title="Hapus pencarian"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700 text-xs flex justify-between items-center">
          <span>Daftar Produk ({filteredProducts.length})</span>
          <span className="text-emerald-700 font-bold">Total Stok Tampil: {filteredProducts.reduce((acc, p) => acc + (p.stock || 0), 0)} unit</span>
        </div>
        <div className="overflow-x-auto touch-scroll">
          <table className="w-full text-left text-xs min-w-[640px]">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="p-3.5 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('name')}>
                  Produk <SortIcon column="name" />
                </th>
                <th className="p-3.5 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('sku')}>
                  SKU / Barcode <SortIcon column="sku" />
                </th>
                <th className="p-3.5 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('stock')}>
                  Stok <SortIcon column="stock" />
                </th>
                <th className="p-3.5 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('hpp')}>
                  HPP (Modal) <SortIcon column="hpp" />
                </th>
                <th className="p-3.5 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('unit')}>
                  Satuan <SortIcon column="unit" />
                </th>
                <th className="p-3.5 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('price')}>
                  Harga Jual <SortIcon column="price" />
                </th>
                <th className="p-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">Tidak ada produk yang ditemukan.</td>
                </tr>
              )}
              {visibleProducts.map(p => {
                const marginPercent = p.price > 0 && p.hpp ? Math.round(((p.price - p.hpp) / p.price) * 100) : 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50 cursor-pointer transition-colors group">
                    <td className="p-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {p.image && !p.image.includes('picsum.photos') ? (
                          <img src={p.image} alt="" loading="lazy" className="w-10 h-10 rounded-xl object-cover bg-slate-100 border border-slate-200 shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 text-amber-600 font-bold">
                            <Package size={18} />
                          </div>
                        )}
                        <div>
                          <span className="font-bold text-slate-800 text-xs block">{p.name}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {p.categoryName ? (
                              <span className="text-[10px] font-semibold text-slate-500 px-1.5 py-0.5 bg-slate-100 rounded-md border border-slate-200">{p.categoryName}</span>
                            ) : null}
                            {marginPercent > 0 && (
                              <span className="text-[10px] font-extrabold text-emerald-700 px-1.5 py-0.5 bg-emerald-50 rounded-md border border-emerald-200">
                                Margin: +{marginPercent}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-600 font-mono text-xs font-bold whitespace-nowrap">{p.sku}</td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-lg font-extrabold text-xs border ${
                        p.stock < 10 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {formatNumber(p.stock)}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-700 font-semibold whitespace-nowrap">{formatIDR(p.hpp || 0)}</td>
                    <td className="p-3.5 text-center text-slate-600 font-medium whitespace-nowrap">{p.unit || 'Pcs'}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="text-amber-700 font-extrabold text-xs">{formatIDR(p.price)}</span>
                    </td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      {/* Actions - Block for Warehouse */}
                      {(JSON.parse(localStorage.getItem('pos_current_user') || '{}') as any).role !== UserRole.WAREHOUSE && (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleEditProduct(p)} className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg transition-colors" title="Edit Produk">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Hapus Produk">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* Sentinel for Infinite Scroll */}
              {visibleProducts.length < filteredProducts.length && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-400">
                    <div ref={loadMoreRef}>Memuat produk berikutnya...</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PRODUCT MODAL */}
      {isProductModalOpen && createPortal(
        <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/40 backdrop-blur-md z-[99999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="font-bold text-lg text-slate-800">{editingId ? 'Edit Produk' : 'Produk Baru'}</h3>
              <button onClick={() => setIsProductModalOpen(false)}><X size={24} className="text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Image Uploader */}
              <div className="col-span-2 flex justify-center relative group-container">
                <label className="relative w-full max-w-xs aspect-video bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 group overflow-hidden">
                  {formData.image ? (
                    <img src={formData.image} className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <ImageIcon className="text-slate-400 mb-2 group-hover:text-primary" size={32} />
                      <span className="text-xs text-slate-500">Upload Gambar Produk (Auto-Crop 150px)</span>
                    </>
                  )}
                  <input id="productImage" name="productImage" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />

                  {/* Overlay for Change Image */}
                  <div className={`absolute inset-0 bg-black/40 flex items-center justify-center text-white font-bold transition-opacity ${formData.image ? 'opacity-0 group-hover:opacity-100' : 'hidden'}`}>
                    Ganti Gambar
                  </div>
                </label>

                {/* Delete Button - Outside the label or absolutely positioned but handling click event carefully */}
                {formData.image && (
                  <button
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 md:right-32 bg-white text-red-600 p-2 rounded-full shadow-lg hover:bg-red-50 z-10 transition-transform hover:scale-110"
                    title="Hapus Gambar"
                    type="button"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              <div className="col-span-2 md:col-span-1">
                <label htmlFor="productName" className="block text-sm font-medium text-slate-700 mb-1">
                  Nama Produk <span className="text-rose-500 font-bold">*</span>
                </label>
                <input id="productName" name="productName" type="text" className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={formData.name ?? ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Contoh: Keripik Singkong..." />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label htmlFor="sku" className="block text-sm font-medium text-slate-700 mb-1">
                  Kode SKU / Barcode <span className="text-rose-500 font-bold">*</span>
                </label>
                <div className="flex gap-2">
                  <input id="sku" name="sku" type="text" className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none font-mono" value={formData.sku ?? ''} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="Scan atau ketik..." />
                  <button onClick={handleGenerateCode} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg" title="Generate Code"><Barcode size={20} /></button>
                </div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
                  Kategori Produk <span className="text-rose-500 font-bold">*</span>
                </label>
                <select
                  id="category"
                  name="category"
                  className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white font-medium"
                  value={formData.categoryId ?? ''}
                  onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                >
                  <option value="">-- Pilih Kategori (Wajib) --</option>
                  {categories
                    .filter(c => c && c.name && c.name.trim().toLowerCase() !== 'umum')
                    .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label htmlFor="unit" className="block text-sm font-medium text-slate-700 mb-1">
                  Satuan Produk <span className="text-rose-500 font-bold">*</span>
                </label>
                <input id="unit" name="unit" type="text" className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={formData.unit || 'Pcs'} onChange={e => setFormData({ ...formData, unit: e.target.value })} placeholder="Pcs, Box, Porsi, dll..." />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label htmlFor="stock" className="block text-sm font-medium text-slate-700 mb-1">
                  Stok Awal <span className="text-rose-500 font-bold">*</span>
                </label>
                <input id="stock" name="stock" type="text" className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={formData.stock ?? ''} onChange={e => handleNumericInput('stock', e.target.value)} />
              </div>

              <div className="col-span-2 my-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <Tag size={18} className="text-primary" />
                  <p className="text-sm font-bold text-slate-800">Harga & Modal</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {true && (
                    <div className="col-span-2 md:col-span-2 mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="hpp" className="block text-xs font-bold text-red-500">
                          HPP (Harga Modal) <span className="text-rose-500 font-bold">*</span>
                        </label>
                        <button onClick={(e) => { e.preventDefault(); setIsHPPModalOpen(true); }} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md font-bold hover:bg-indigo-200 flex items-center gap-1 transition-colors">
                          <Sparkles size={12} /> Kalkulator AI
                        </button>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">Rp</span>
                        <input id="hpp" name="hpp" type="text" className="w-full border border-red-200 bg-red-50/50 p-2 pl-8 rounded-lg focus:ring-2 focus:ring-red-500 outline-none" value={formData.hpp ?? ''} onChange={e => handleNumericInput('hpp', e.target.value)} />
                      </div>
                    </div>
                  )}
                  <div className="col-span-2 md:col-span-2">
                    <label htmlFor="price" className="block text-xs font-bold text-slate-700 mb-1">
                      Harga Jual (Eceran) <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <input id="price" name="price" type="text" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-primary outline-none font-semibold text-slate-900" value={formData.price ?? ''} onChange={e => handleNumericInput('price', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="col-span-2 text-[11px] text-slate-500 flex items-center gap-1 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200/60">
                <span className="text-amber-700 font-bold">Catatan:</span> Semua kolom bertanda bintang merah (<span className="text-rose-600 font-bold">*</span>) wajib diisi lengkap sebelum produk disimpan.
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setIsProductModalOpen(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium">Batal</button>
              <button onClick={handleSaveProduct} className="px-5 py-2.5 bg-primary text-white rounded-lg font-semibold hover:bg-primary-hover shadow-lg shadow-primary/20">Simpan Produk</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CATEGORY MODAL */}
      {isCategoryModalOpen && createPortal(
        <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/40 backdrop-blur-md z-[99999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Kelola Kategori</h3>
              <button onClick={() => setIsCategoryModalOpen(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex gap-2">
              <label htmlFor="newCategoryName" className="sr-only">Nama Kategori Baru</label>
              <input id="newCategoryName" name="newCategoryName" type="text" className="flex-1 border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none" value={categoryFormName} onChange={e => setCategoryFormName(e.target.value)} placeholder="Nama kategori baru..." onKeyDown={e => e.key === 'Enter' && handleSaveCategory()} />
              <button onClick={handleSaveCategory} className="px-4 bg-primary text-white rounded-lg hover:bg-primary-hover font-bold shadow-md shadow-primary/20 transition-all"><Plus size={20} /></button>
            </div>
            <div className="max-h-64 overflow-y-auto p-4 space-y-2">
              {categories.map(c => (
                <div key={c.id} className="flex justify-between items-center border border-slate-100 p-3 rounded-lg bg-white shadow-sm group">
                  <span className="font-medium text-slate-700">{c.name}</span>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setCategoryFormName(c.name); setEditingId(c.id); }} className="text-primary hover:bg-primary/10 p-1 rounded"><Edit2 size={14} /></button>
                    <button onClick={() => handleDeleteCategory(c.id)} className="text-red-600 hover:bg-red-100 p-1 rounded"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* HPP Calculator Modal */}
      <HPPCalculatorModal 
        isOpen={isHPPModalOpen}
        onClose={() => setIsHPPModalOpen(false)}
        productName={formData.name || ''}
        categoryName={categories.find(c => c.id === formData.categoryId)?.name || ''}
        onApply={handleApplyHPP}
      />
    </div>
  );
};