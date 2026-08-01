import React, { useState, useEffect } from 'react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { Product } from '../types';
import { Barcode, Search, Printer, X } from 'lucide-react';
import { formatIDR } from '../utils';
import JsBarcode from 'jsbarcode';

export const BarcodeGenerator: React.FC = () => {
    const products = useData(() => StorageService.getProducts(), [], 'products') || [];
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProducts, setSelectedProducts] = useState<{ product: Product; count: number }[]>([]);

    const filteredProducts = React.useMemo(() => products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    ), [products, searchQuery]);

    const handleAddProduct = (product: Product) => {
        const existing = selectedProducts.find(p => p.product.id === product.id);
        if (existing) {
            setSelectedProducts(selectedProducts.map(p =>
                p.product.id === product.id ? { ...p, count: p.count + 1 } : p
            ));
        } else {
            setSelectedProducts([...selectedProducts, { product, count: 1 }]);
        }
    };

    const handleRemoveProduct = (productId: string) => {
        setSelectedProducts(selectedProducts.filter(p => p.product.id !== productId));
    };

    const handleUpdateCount = (productId: string, count: number) => {
        if (count < 1) return;
        setSelectedProducts(selectedProducts.map(p =>
            p.product.id === productId ? { ...p, count } : p
        ));
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const barcodeItems = selectedProducts.flatMap(item =>
            Array(item.count).fill(item.product)
        );

        const itemsHtml = barcodeItems.map((p) => {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            try {
                JsBarcode(svg, p.sku, {
                    format: "CODE128",
                    displayValue: true,
                    fontSize: 12,
                    height: 30,
                    margin: 0
                });
            } catch (error) {
                console.error(`Failed to generate barcode for SKU ${p.sku}`, error);
            }
            return `
              <div class="barcode-item">
                <div class="product-name">${p.name}</div>
                ${svg.outerHTML}
                <div class="product-price">${formatIDR(p.price)} / ${p.unit || 'Pcs'}</div>
              </div>
            `;
        }).join('');

        const html = `
      <html>
        <head>
          <title>Cetak Barcode</title>
          <style>
            @page { size: A4; margin: 10mm; }
            body { font-family: sans-serif; padding: 0; margin: 0; }
            .barcode-container { 
              display: flex; 
              flex-wrap: wrap; 
              justify-content: flex-start; 
            }
            .barcode-item { 
              border: 1px dashed #ccc; 
              padding: 5px; 
              text-align: center; 
              width: 19%; 
              height: 80px;
              margin: 0.5%;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            .product-name { 
              font-size: 10px; 
              margin-bottom: 5px; 
              white-space: nowrap; 
              overflow: hidden; 
              text-overflow: ellipsis; 
              max-width: 100%;
            }
            .product-price { font-size: 10px; font-weight: bold; margin-top: 2px; }
            svg { width: 100%; height: 50px; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; }
              .barcode-item { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="barcode-container">
            ${itemsHtml}
          </div>
          <script>
            window.onload = () => {
              window.print();
            }
          </script>
        </body>
      </html>
    `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handleSelectAllFiltered = () => {
        const newQueue = [...selectedProducts];
        filteredProducts.forEach(p => {
            if (!newQueue.some(item => item.product.id === p.id)) {
                newQueue.push({ product: p, count: 1 });
            }
        });
        setSelectedProducts(newQueue);
    };

    const handleClearQueue = () => {
        if (selectedProducts.length === 0) return;
        if (confirm('Kosongkan semua antrian cetak barcode?')) {
            setSelectedProducts([]);
        }
    };

    const totalLabelsCount = React.useMemo(() => {
        return selectedProducts.reduce((acc, curr) => acc + curr.count, 0);
    }, [selectedProducts]);

    return (
        <div className="space-y-6 animate-fade-in p-2 md:p-0">
            {/* Header Bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Barcode className="text-amber-600" />
                        Cetak Label & Barcode Produk
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Pilih produk dari katalog, atur kuantitas cetak label, dan cetak secara massal</p>
                </div>

                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    {selectedProducts.length > 0 && (
                        <button
                            onClick={handleClearQueue}
                            className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-700 px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-rose-100 transition-all"
                        >
                            <X size={15} /> Kosongkan Antrian
                        </button>
                    )}
                    <button
                        onClick={handlePrint}
                        disabled={selectedProducts.length === 0}
                        className="flex-1 md:flex-none items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md"
                    >
                        <Printer size={16} /> Cetak {totalLabelsCount > 0 ? `${totalLabelsCount} Label` : ''}
                    </button>
                </div>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Produk Katalog</p>
                        <h3 className="text-lg font-extrabold text-slate-900 mt-1">{products.length} <span className="text-xs font-normal text-slate-400">item</span></h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{filteredProducts.length} Tampil Hasil Filter</p>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                        <Barcode size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Produk Antrian Cetak</p>
                        <h3 className="text-lg font-extrabold text-amber-600 mt-1">{selectedProducts.length} <span className="text-xs font-normal text-slate-400">jenis</span></h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Produk Dipilih</p>
                    </div>
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                        <Printer size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Stiker Label</p>
                        <h3 className="text-lg font-extrabold text-emerald-600 mt-1">{totalLabelsCount} <span className="text-xs font-normal text-slate-400">lembar</span></h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Siap Dicetak</p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                        <Barcode size={22} />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Format Kertas</p>
                        <h3 className="text-base font-extrabold text-purple-700 mt-1">A4 Sticker Grid</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">CODE128 Auto Layout</p>
                    </div>
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                        <Printer size={22} />
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Product Catalog Picker */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col h-[620px]">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                id="productSearch"
                                name="productSearch"
                                type="text"
                                placeholder="Cari nama produk atau kode SKU / Barcode..."
                                className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none text-xs text-slate-800"
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

                        {filteredProducts.length > 0 && (
                            <button
                                onClick={handleSelectAllFiltered}
                                className="px-3.5 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs font-bold shrink-0 transition-colors"
                            >
                                + Pilih Semua ({filteredProducts.length})
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
                        {filteredProducts.length === 0 ? (
                            <div className="text-center text-slate-400 py-16 text-xs">
                                Tidak ada produk ditemukan.
                            </div>
                        ) : (
                            filteredProducts.map(p => {
                                const inQueue = selectedProducts.find(item => item.product.id === p.id);
                                return (
                                    <div key={p.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:border-amber-200 hover:bg-slate-50/80 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 font-bold shrink-0">
                                                <Barcode size={18} />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 text-xs">{p.name}</div>
                                                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                                    <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold">{p.sku}</span>
                                                    <span>•</span>
                                                    <span>Stok: {p.stock} {p.unit || 'Pcs'}</span>
                                                    <span>•</span>
                                                    <span className="font-bold text-amber-700">{formatIDR(p.price)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleAddProduct(p)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                                                inQueue
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                                    : 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm'
                                            }`}
                                        >
                                            {inQueue ? `+1 (${inQueue.count})` : 'Tambah'}
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Print Queue Container */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col h-[620px]">
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <Printer size={16} className="text-amber-600" /> Antrian Cetak Label
                        </h3>
                        <span className="text-xs font-extrabold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                            {totalLabelsCount} Label
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                        {selectedProducts.length === 0 ? (
                            <div className="text-center text-slate-400 py-20 text-xs">
                                Belum ada produk dipilih.<br />Klik <strong>Tambah</strong> pada produk untuk masuk antrian.
                            </div>
                        ) : (
                            selectedProducts.map((item) => (
                                <div key={item.product.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="font-bold text-xs text-slate-800 block line-clamp-1">{item.product.name}</span>
                                            <span className="text-[10px] font-mono text-slate-500">{item.product.sku} | {formatIDR(item.product.price)}</span>
                                        </div>
                                        <button onClick={() => handleRemoveProduct(item.product.id)} className="p-1 text-slate-400 hover:text-rose-600 transition-colors">
                                            <X size={15} />
                                        </button>
                                    </div>

                                    {/* Label Quantity Controls */}
                                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-xs">
                                        <span className="text-[11px] font-medium text-slate-500">Jumlah Cetak:</span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => handleUpdateCount(item.product.id, item.count - 1)}
                                                className="w-6 h-6 flex items-center justify-center bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-bold shadow-sm"
                                            >-</button>
                                            <input
                                                type="number"
                                                className="w-10 text-center font-bold text-xs bg-white border border-slate-300 rounded-lg py-0.5 outline-none"
                                                value={item.count}
                                                onChange={(e) => handleUpdateCount(item.product.id, parseInt(e.target.value) || 1)}
                                                min={1}
                                            />
                                            <button
                                                onClick={() => handleUpdateCount(item.product.id, item.count + 1)}
                                                className="w-6 h-6 flex items-center justify-center bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-bold shadow-sm"
                                            >+</button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                        <div className="flex justify-between mb-3 text-xs font-bold text-slate-700">
                            <span>Total Kuantitas Label:</span>
                            <span className="text-amber-700 font-extrabold">{totalLabelsCount} Stiker</span>
                        </div>
                        <button
                            onClick={handlePrint}
                            disabled={selectedProducts.length === 0}
                            className="w-full py-2.5 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md transition-all text-xs"
                        >
                            <Printer size={16} /> Cetak {totalLabelsCount} Label Barcode
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
