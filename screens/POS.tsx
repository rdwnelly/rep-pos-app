import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Trash2, User, Plus, Minus, ShoppingBag, Printer, CreditCard, Banknote, Clock, ScanLine, StickyNote, Image as ImageIcon, X, ChevronLeft, ClipboardList } from 'lucide-react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { Product, CartItem, PaymentStatus, Transaction, PaymentMethod, User as UserType, Customer, StoreSettings, TransactionType, Category } from '../types';
import { formatIDR, getPriceByType, generateId, formatDate, toMySQLDate } from '../utils';
import { generatePrintInvoice, PrintInvoiceOptions } from '../utils/printHelpers';
import { useBluetoothPrinter } from '../hooks/useBluetoothPrinter';
import { generateESCPOSReceipt } from '../utils/escposEncoder';
import { playBeep } from '../utils/soundEffect';
import { PaymentQRCode } from '../components/ui/PaymentQRCode';

const formatNumber = (val: number) => val.toLocaleString('id-ID');

const FlyingItem = ({ item, cartRect }: { item: any, cartRect?: DOMRect }) => {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimate(true));
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const endX = cartRect ? cartRect.left + cartRect.width / 2 : window.innerWidth;
  const endY = cartRect ? cartRect.top + cartRect.height / 2 : 0;

  return (
    <div
      className="fixed z-[9999] pointer-events-none transition-all duration-500 ease-in-out"
      style={{
        left: item.startX - 25,
        top: item.startY - 25,
        transform: animate ? `translate(${endX - item.startX}px, ${endY - item.startY}px) scale(0.1)` : 'translate(0px, 0px) scale(1)',
        opacity: animate ? 0.3 : 1
      }}
    >
      {item.image && !item.image.includes('picsum.photos') ? (
        <img src={item.image} alt="" className="w-[50px] h-[50px] object-cover rounded-full shadow-lg border-2 border-primary" />
      ) : (
        <div className="w-[50px] h-[50px] bg-primary rounded-full shadow-lg flex items-center justify-center">
          <ShoppingBag size={24} className="text-white" />
        </div>
      )}
    </div>
  );
};
export const POS: React.FC = () => {
  const bluetooth = useBluetoothPrinter();
  const products = useData(() => StorageService.getProducts(), [], 'products') || [];
  const customers = useData(() => StorageService.getCustomers(), [], 'customers') || [];
  const banks = useData(() => StorageService.getBanks(), [], 'banks') || [];
  const categories = useData(() => StorageService.getCategories(), [], 'categories') || [];
  const storeSettings = useData(() => StorageService.getStoreSettings(), [], 'store_settings');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Customer State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('Pelanggan Umum'); // Still used for display or custom walk-in name
  const [tableNumber, setTableNumber] = useState('');

  // Payment State
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('FIXED');
  const [showQrisModal, setShowQrisModal] = useState(false);

  // Settings

  const currentUser = JSON.parse(localStorage.getItem('pos_current_user') || '{}') as UserType; // Need to grab current user
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Pagination / Virtualization State
  const [visibleCount, setVisibleCount] = useState(20);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Mobile State
  const [showMobileCart, setShowMobileCart] = useState(false);

  // Micro-animations State
  const cartIconRef = useRef<HTMLDivElement>(null);
  const [flyingItems, setFlyingItems] = useState<Array<{ id: string, startX: number, startY: number, image?: string }>>([]);

  useEffect(() => {
    // Auto focus search for scanner
    searchInputRef.current?.focus();
  }, []);

  // Update customer name when ID changes & Auto set Price Type
  useEffect(() => {
    if (selectedCustomerId) {
      const c = customers.find(cust => cust.id === selectedCustomerId);
      if (c) {
        setCustomerName(c.name);
      }
    } else {
      setCustomerName('Pelanggan Umum');
    }
  }, [selectedCustomerId, customers]);

  // Scan Logic (Enter Key)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search) {
      // Try to find exact match first (Scanner behavior)
      const exactMatch = products.find(p => p.sku.toLowerCase() === search.toLowerCase());
      if (exactMatch) {
        playBeep();
        addToCart(exactMatch);
        setSearch(''); // Clear for next scan
      }
    }
  };

  const addToCart = (product: Product, event?: React.MouseEvent) => {
    const price = product.price;
    if (price === 0) {
      alert(`Peringatan: Harga produk "${product.name}" adalah 0 / belum diset untuk tipe harga ini. Item tidak dapat ditambahkan.`);
      return;
    }

    setCart(prev => {
      // Validate Stock: Check total quantity of this product across all cart items (mixed price types)
      const currentTotalQty = prev
        .filter(item => item.id === product.id)
        .reduce((sum, item) => sum + item.qty, 0);

      if (currentTotalQty >= product.stock) {
        alert(`Gagal menambah: Stok produk "${product.name}" tersisa ${product.stock}.`);
        return prev;
      }

      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          (item.id === product.id)
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }
      // price calculated above is used here
      return [...prev, { ...product, qty: 1, finalPrice: price }];
    });

    if (event && cartIconRef.current) {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        const id = Date.now().toString() + Math.random().toString();
        setFlyingItems(prev => [...prev, { id, startX, startY, image: product.image }]);
        setTimeout(() => {
            setFlyingItems(prev => prev.filter(item => item.id !== id));
        }, 500);
    }
  };

  const updateCartItem = (index: number, updates: Partial<CartItem>) => {
    setCart(prev => {
      const newCart = [...prev];
      newCart[index] = { ...newCart[index], ...updates };
      return newCart;
    });
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };


  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.finalPrice * item.qty), 0);
  }, [cart]);

  const discountAmountValue = useMemo(() => {
    if (discountType === 'PERCENTAGE') {
      // Limit max 100%
      const val = Math.min(discount, 100);
      return Math.round((subtotal * val) / 100);
    }
    // Limit max to subtotal
    return Math.min(discount, subtotal);
  }, [subtotal, discount, discountType]);

  const totalAmount = useMemo(() => {
    return Math.max(0, subtotal - discountAmountValue);
  }, [subtotal, discountAmountValue]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
      const matchCategory = selectedCategory ? p.categoryId === selectedCategory : true;
      return matchSearch && matchCategory;
    });
  }, [products, search, selectedCategory]);

  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  // Reset visible count when search or category changes
  useEffect(() => {
    setVisibleCount(20);
  }, [search, selectedCategory]);

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

  const handleCheckout = async () => {
    let paid = parseFloat(amountPaid) || 0;

    // Validation: Check for zero price items
    const zeroPriceItems = cart.filter(item => item.finalPrice === 0);
    if (zeroPriceItems.length > 0) {
      alert(`Peringatan: Terdapat item dengan harga 0 / tanpa harga di keranjang. Mohon periksa kembali.`);
      return;
    }

    // Validation: Ensure no items exceed stock
    // Group quantities by Product ID
    const productQuantities: Record<string, number> = {};
    cart.forEach(item => {
      productQuantities[item.id] = (productQuantities[item.id] || 0) + item.qty;
    });

    const stockErrors: string[] = [];
    Object.keys(productQuantities).forEach(productId => {
      const item = cart.find(i => i.id === productId);
      if (item) {
        if (productQuantities[productId] > item.stock) {
          stockErrors.push(`- ${item.name}: Pesan ${productQuantities[productId]}, Stok tersedia ${item.stock}`);
        }
      }
    });

    if (stockErrors.length > 0) {
      alert(`Transaksi tidak dapat diproses! Item berikut melebihi stok:\n${stockErrors.join('\n')}`);
      return;
    }

    // Validation
    if (paymentMethod === PaymentMethod.TEMPO && paid === 0) {
      paid = 0;
    } else if (paymentMethod === PaymentMethod.TEMPO && paid > totalAmount) {
      alert('Peringatan: Jumlah pembayaran tidak boleh melebihi total harga barang untuk metode pembayaran tempo!');
      return;
    } else if (paymentMethod !== PaymentMethod.TEMPO && paid < totalAmount) {
      alert('Pembayaran kurang!');
      return;
    }

    if (paymentMethod === PaymentMethod.TRANSFER && !selectedBankId) {
      alert('Silakan pilih rekening bank tujuan transfer.');
      return;
    }

    const isDebt = paid < totalAmount;
    const status = isDebt ? (paid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.UNPAID) : PaymentStatus.PAID;
    const selectedBank = banks.find(b => b.id === selectedBankId);

    const transaction: Transaction = {
      // id: generateId(), // Handled by backend (F3)
      id: '', // Send empty or handle in backend logic
      type: TransactionType.SALE,
      date: toMySQLDate(new Date()),
      items: cart,
      totalAmount,
      amountPaid: paid,
      change: paid - totalAmount,
      paymentStatus: status,
      paymentMethod: paymentMethod,
      paymentNote: paymentNote || '',
      bankId: selectedBankId || '',
      bankName: selectedBank?.bankName || '',
      customerId: selectedCustomerId || '',
      customerName: customerName || 'Pelanggan Umum',
      customerAddress: selectedCustomerId ? customers.find(c => c.id === selectedCustomerId)?.address || '' : '',
      cashierId: currentUser.id || 'unknown',
      cashierName: currentUser.name || 'Kasir',
      discount: discount > 0 ? discount : 0,
      discountType: discount > 0 ? discountType : 'FIXED',
      discountAmount: discountAmountValue > 0 ? discountAmountValue : 0,
      tableNumber: tableNumber || undefined,
    };

    try {
      const savedTransaction = await StorageService.addTransaction(transaction);

      // Print Logic
      const settings = await StorageService.getStoreSettings();
      // Use the saved transaction which contains the generated invoice number and ID
      // If savedTransaction is the full object (which assume it is based on logic), use it.
      // If it's just ID/invoiceNumber, merge it. 
      // Based on PHP logic, it returns the full $data array.
      // However, we need to be careful with type handling if the returned object is plain JSON vs typed object.
      // But printReceipt mostly needs fields like id, invoiceNumber, items, totalAmount etc.

      const txToPrint = savedTransaction ? { ...transaction, ...savedTransaction } : transaction;

      // Ensure invoiceNumber is set if available in savedTransaction
      if (savedTransaction && savedTransaction.invoiceNumber && !txToPrint.invoiceNumber) {
        txToPrint.invoiceNumber = savedTransaction.invoiceNumber;
      }

      // Build print options with QRIS code from the selected bank
      const printOptions: PrintInvoiceOptions = {
        qrisCode: selectedBank?.qrisCode,
        bankName: selectedBank?.bankName,
      };

      printReceipt(txToPrint, settings, printOptions);

      // Reset
      setCart([]);
      setAmountPaid('');
      setDiscount(0);
      setDiscountType('FIXED');
      setPaymentNote('');
      setSelectedBankId('');
      setSelectedCustomerId('');
      setCustomerName('Pelanggan Umum');
      setTableNumber('');
      setShowPaymentModal(false);
      searchInputRef.current?.focus();
      alert('Transaksi Kasir REP Berhasil!');
    } catch (error) {
      console.error(error);
      alert('Gagal memproses transaksi. Silakan coba lagi.');
    }
  };

  const printReceipt = async (tx: Transaction, settings: StoreSettings, printOptions?: PrintInvoiceOptions) => {
    if (settings.useBluetoothPrinter) {
      try {
        if (!bluetooth.isConnected) {
          console.log("Mencoba koneksi bluetooth sebelum cetak...");
          await bluetooth.connect();
        }
        
        const escposData = generateESCPOSReceipt(tx, settings);
        await bluetooth.print(escposData);
        console.log("Cetak via Bluetooth berhasil.");
        return;
      } catch (error: any) {
        console.error("Bluetooth print error:", error);
        alert("Gagal cetak via Bluetooth: " + error.message + ".\nSistem akan menggunakan cetak standar browser.");
        // Fallback to browser print below
      }
    }

    // Default Browser Print
    const w = window.open('', '', 'width=800,height=600');
    if (!w) {
      alert("Popup blocker mencegah cetak struk. Mohon izinkan popup untuk website ini.");
      return;
    }

    const html = generatePrintInvoice(tx, settings, formatIDR, formatDate, printOptions);
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="flex flex-col lg:flex-row flex-1 h-full w-full gap-0 animate-fade-in relative bg-white">
      {flyingItems.map(item => (
        <FlyingItem key={item.id} item={item} cartRect={cartIconRef.current?.getBoundingClientRect()} />
      ))}
      
      {/* Product Grid */}
      <div className="flex-1 flex flex-col bg-white border-r border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-white z-10">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <label htmlFor="posSearch" className="sr-only">Cari Produk</label>
            <input
              id="posSearch"
              name="posSearch"
              ref={searchInputRef}
              type="text"
              placeholder="Scan Barcode atau Cari Nama..."
              className="w-full pl-10 pr-20 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-200 rounded"
                title="Hapus pencarian"
              >
                <X size={16} />
              </button>
            )}
            <ScanLine className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          </div>
        </div>



        {/* Category Filter Horizontal Scroll */}
        <div className="bg-white border-b border-slate-100 px-4 py-3 sticky top-0 z-10 overflow-x-auto hide-scrollbar">
          <div className="flex items-center gap-2 min-w-max">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedCategory === '' ? 'bg-primary text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Semua Menu
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${selectedCategory === cat.id ? 'bg-primary text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 content-start pb-20 lg:pb-2">
          {visibleProducts.map(product => (
            <button
              key={product.id}
              onClick={(e) => addToCart(product, e)}
              className="group flex flex-col items-start text-left bg-white border border-slate-100 rounded-xl p-3 hover:shadow-md hover:border-primary/50 transition-all active:scale-95"
            >
              <div className="w-full aspect-square bg-slate-100 rounded-lg mb-3 overflow-hidden relative">
                {product.image && !product.image.includes('picsum.photos') ? (
                  <img src={product.image} alt={product.name} loading="lazy" className="w-full h-full object-cover mix-blend-multiply" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon size={32} className="text-slate-300" />
                  </div>
                )}
                <span className="absolute bottom-1 right-1 text-[10px] bg-black/50 text-white px-1 rounded backdrop-blur-sm">{product.stock} {product.unit || 'Pcs'}</span>
              </div>
              <h4 className="font-semibold text-slate-800 line-clamp-2 text-sm h-10">{product.name}</h4>
              <div className="mt-2 w-full">
                <span className="block font-bold text-primary">
                  {product.price === 0 ? '0' : formatIDR(product.price)}
                </span>
              </div>
            </button>
          ))}
          {/* Sentinel for Infinite Scroll */}
          {visibleProducts.length < filteredProducts.length && (
            <div ref={loadMoreRef} className="col-span-full h-10 flex items-center justify-center text-slate-400">
              Loading more...
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-40 flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">{cart.reduce((acc, item) => acc + item.qty, 0)} Item di Keranjang</span>
          <span className="text-lg font-bold text-primary">{formatIDR(totalAmount)}</span>
        </div>
        <button
          onClick={() => setShowMobileCart(true)}
          className="bg-primary text-white px-6 py-3 rounded-xl font-bold hover:bg-primary-hover transition-colors shadow-lg shadow-primary/30 flex items-center gap-2"
        >
          <ShoppingBag size={20} />
          Lihat Keranjang
        </button>
      </div>

      {/* Cart Sidebar / Mobile Modal */}
      <div ref={cartIconRef} className={`
        flex flex-col bg-white
        lg:w-96 lg:static lg:h-full lg:overflow-hidden
        fixed inset-0 z-[60] transition-transform duration-300 ease-in-out
        ${showMobileCart ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col flex-1 overflow-hidden">

          {/* Mobile Header for Cart */}
          <div className="lg:hidden flex items-center gap-3 mb-4 pb-4 border-b border-slate-200">
            <button
              onClick={() => setShowMobileCart(false)}
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-600"
            >
              <ChevronLeft size={24} />
            </button>
            <h3 className="font-bold text-lg text-slate-800">Keranjang Belanja</h3>
          </div>

          <div className="mb-3">
            <div className="relative mb-2">
              <label htmlFor="customerSearch" className="sr-only">Cari Pelanggan</label>
              <input
                id="customerSearch"
                name="customerSearch"
                type="text"
                placeholder="Cari nama pelanggan..."
                className="w-full px-3 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              {customerSearch && (
                <button
                  onClick={() => setCustomerSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded"
                  title="Hapus pencarian"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <User size={18} className="text-slate-400" />
              <label htmlFor="customerSelect" className="sr-only">Pilih Pelanggan</label>
              <select
                id="customerSelect"
                name="customerSelect"
                className="bg-transparent font-medium text-slate-700 focus:outline-none border-b border-dashed border-slate-300 w-full focus:border-primary transition-colors"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
              >
                <option value="">Pelanggan Umum (Walk-in)</option>
                {customers
                  .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm text-slate-500">
              <span>Subtotal</span>
              <span>{formatIDR(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <span>Diskon</span>
                <div className="flex items-center bg-white border border-slate-300 rounded overflow-hidden">
                  <button
                    onClick={() => { setDiscountType('FIXED'); setDiscount(0); }}
                    className={`px-1.5 py-0.5 text-[10px] font-bold ${discountType === 'FIXED' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    Rp
                  </button>
                  <button
                    onClick={() => { setDiscountType('PERCENTAGE'); setDiscount(0); }}
                    className={`px-1.5 py-0.5 text-[10px] font-bold ${discountType === 'PERCENTAGE' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    %
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1 w-24">
                <label htmlFor="discountInput" className="sr-only">Diskon</label>
                <input
                  id="discountInput"
                  name="discountInput"
                  type="text"
                  className={`w-full text-right bg-transparent border-b border-dashed outline-none font-medium pb-0.5 ${(discountType === 'PERCENTAGE' && discount > 100) || (discountType === 'FIXED' && discount > subtotal)
                    ? 'border-red-500 text-red-600'
                    : 'border-slate-300 focus:border-primary text-slate-900'
                    }`}
                  value={discount === 0 ? '' : discount}
                  placeholder="0"
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setDiscount(val ? parseFloat(val) : 0);
                  }}
                />
              </div>
            </div>

            {/* Validation Warning */}
            {discountType === 'PERCENTAGE' && discount > 100 && (
              <div className="text-right mb-1">
                <span className="text-[10px] text-red-500 font-bold">
                  ⚠ Tidak boleh lebih dari 100%
                </span>
              </div>
            )}
            {discountType === 'FIXED' && discount > subtotal && (
              <div className="text-right mb-1">
                <span className="text-[10px] text-red-500 font-bold">
                  ⚠ Tidak boleh melebihi subtotal
                </span>
              </div>
            )}

            {discount > 0 && (
              <div className="flex justify-between items-center text-xs text-red-500 font-medium">
                <span>Potongan</span>
                <span>-{formatIDR(discountAmountValue)}</span>
              </div>
            )}
            <div className="flex justify-between items-end pt-2 border-t border-slate-100">
              <span className="text-slate-600 font-bold">Total Tagihan</span>
              <span className="text-2xl font-bold text-slate-900">{formatIDR(totalAmount)}</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {cart.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Hapus semua item di keranjang?')) {
                    setCart([]);
                  }
                }}
                className="py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2 w-full"
              >
                <Trash2 size={16} />
                Kosongkan Keranjang
              </button>
            )}
          </div>

          {/* Cart Items List - Enhanced for Mobile Scrolling inside Fixed Div */}
          <div className="flex-1 overflow-y-auto mt-4 -mr-4 pr-4 space-y-4">
            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 min-h-[200px]">
                <ShoppingBag size={48} className="mb-2 opacity-20" />
                <p>Keranjang Kosong</p>
              </div>
            )}
            {cart.map((item, idx) => (
              <div key={idx} className="flex gap-3 items-start border-b border-slate-50 pb-3 last:border-0">
                <div className="flex-1">
                  <h5 className="font-medium text-slate-800 text-sm">{item.name} <span className="text-xs text-slate-400 font-normal">({item.unit || 'Pcs'})</span></h5>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-400">@{formatIDR(item.finalPrice)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-semibold text-slate-700">{formatIDR(item.finalPrice * item.qty)}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200">
                      <button onClick={() => item.qty > 1 ? updateCartItem(idx, { qty: item.qty - 1 }) : removeFromCart(idx)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Minus size={14} /></button>
                      <label htmlFor={`qty-${idx}`} className="sr-only">Quantity</label>
                      <input
                        id={`qty-${idx}`}
                        name={`qty-${idx}`}
                        type="text"
                        className="text-sm font-bold w-12 text-center bg-transparent outline-none p-0"
                        value={item.qty === 0 ? '' : item.qty}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          if (val === '') {
                            updateCartItem(idx, { qty: 0 });
                            return;
                          }
                          let newQty = parseInt(val);

                          // Check total quantity for this product across all cart items
                          const otherEntriesQty = cart.reduce((sum, cItem, cIdx) => (cItem.id === item.id && cIdx !== idx) ? sum + cItem.qty : sum, 0);

                          if (newQty + otherEntriesQty > item.stock) {
                            alert(`Jumlah melebihi stok! Stok tersedia: ${item.stock}. (Sudah ada ${otherEntriesQty} di baris lain)`);
                            newQty = Math.max(0, item.stock - otherEntriesQty);
                          }
                          updateCartItem(idx, { qty: newQty });
                        }}
                        onBlur={() => {
                          if (item.qty === 0) updateCartItem(idx, { qty: 1 });
                        }}
                      />
                      <button
                        onClick={() => {
                          const totalQty = cart.filter(cItem => cItem.id === item.id).reduce((sum, cItem) => sum + cItem.qty, 0);
                          if (totalQty < item.stock) {
                            updateCartItem(idx, { qty: item.qty + 1 });
                          } else {
                            alert(`Stok habis! Maksimal ${item.stock}`);
                          }
                        }}
                        className={`p-1 rounded ${cart.filter(cItem => cItem.id === item.id).reduce((sum, cItem) => sum + cItem.qty, 0) >= item.stock ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-slate-200 text-slate-500'}`}
                        disabled={cart.filter(cItem => cItem.id === item.id).reduce((sum, cItem) => sum + cItem.qty, 0) >= item.stock}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    {/* Delete Item Button */}
                    <button
                      onClick={() => removeFromCart(idx)}
                      className="p-1.5 hover:bg-red-50 rounded text-red-500 hover:text-red-600 transition-colors"
                      title="Hapus item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>

            ))}
          </div>
          </div>

        {/* Sticky Pay Button Area */}
        <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-4px_15px_rgba(0,0,0,0.05)] shrink-0 z-20 sticky bottom-0 mt-auto">
          <button
            onClick={() => {
              if (discountType === 'PERCENTAGE' && discount > 100) {
                alert('Diskon tidak valid: Tidak boleh lebih dari 100%');
                return;
              }
              if (discountType === 'FIXED' && discount > subtotal) {
                alert('Diskon tidak valid: Tidak boleh melebihi subtotal');
                return;
              }
              setAmountPaid(''); // Reset on open
              setShowPaymentModal(true);
            }}
            disabled={cart.length === 0}
            className="w-full bg-primary text-white py-3.5 rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary-hover active:translate-y-0 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2 text-lg"
          >
            <Printer size={22} />
            Bayar & Cetak
          </button>
        </div>
      </div>


      {/* Payment Modal */}
      {
        showPaymentModal && createPortal(
          <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
              
              {/* Sisi Kiri: Receipt Preview */}
              <div className="w-full md:w-5/12 bg-slate-50 border-r border-slate-200 p-6 flex flex-col relative overflow-hidden">
                <div className="text-center mb-4 pb-4 border-b border-dashed border-slate-300 shrink-0">
                  <h4 className="font-bold text-lg text-slate-800">{storeSettings?.name || 'Toko'}</h4>
                  <p className="text-xs text-slate-500">Preview Struk Pembayaran</p>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 space-y-3 font-mono text-sm text-slate-700">
                  {cart.map((item, idx) => (
                    <div key={idx}>
                      <div className="font-semibold">{item.name}</div>
                      <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                        <span>{item.qty} x {formatIDR(item.finalPrice)}</span>
                        <span className="font-medium text-slate-700">{formatIDR(item.finalPrice * item.qty)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-4 mt-4 border-t border-dashed border-slate-300 font-mono text-sm shrink-0">
                  <div className="flex justify-between mb-1 text-slate-600">
                    <span>Subtotal</span>
                    <span>{formatIDR(subtotal)}</span>
                  </div>
                  {discountAmountValue > 0 && (
                    <div className="flex justify-between mb-1 text-red-500">
                      <span>Diskon</span>
                      <span>-{formatIDR(discountAmountValue)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg mt-3 pt-3 border-t border-slate-300 text-slate-900">
                    <span>TOTAL</span>
                    <span>{formatIDR(totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Sisi Kanan: Input Pembayaran & Numpad */}
              <div className="w-full md:w-7/12 p-6 flex flex-col bg-white overflow-y-auto">
                <div className="flex justify-between items-center mb-6 shrink-0">
                  <h3 className="text-xl font-bold text-slate-800">Detail Pembayaran</h3>
                  <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-5 flex-1 shrink-0">
                  {/* Customer & Table */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="customerNameInput" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Pelanggan</label>
                      <input
                        id="customerNameInput"
                        type="text"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        placeholder="Nama (Opsional)"
                        value={customerName === 'Pelanggan Umum' ? '' : customerName}
                        onChange={(e) => setCustomerName(e.target.value || 'Pelanggan Umum')}
                        disabled={!!selectedCustomerId}
                      />
                    </div>
                    <div>
                      <label htmlFor="tableNumberInput" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Meja</label>
                      <input
                        id="tableNumberInput"
                        type="text"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        placeholder="Cth: 04"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div>
                    <span className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Metode Pembayaran</span>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => {
                          setPaymentMethod(PaymentMethod.CASH);
                          setSelectedBankId('');
                          if (paymentMethod === PaymentMethod.TEMPO && paymentNote === 'Max 1 minggu dari transaksi.') setPaymentNote('');
                        }}
                        className={`p-3 rounded-xl border-2 text-sm font-bold flex flex-col items-center gap-1.5 transition-all ${paymentMethod === PaymentMethod.CASH ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                      >
                        <Banknote size={22} /> TUNAI
                      </button>
                      <button
                        onClick={() => {
                          setPaymentMethod(PaymentMethod.TRANSFER);
                          setAmountPaid(totalAmount.toString());
                          if (paymentMethod === PaymentMethod.TEMPO && paymentNote === 'Max 1 minggu dari transaksi.') setPaymentNote('');
                        }}
                        className={`p-3 rounded-xl border-2 text-sm font-bold flex flex-col items-center gap-1.5 transition-all ${paymentMethod === PaymentMethod.TRANSFER ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                      >
                        <CreditCard size={22} /> TRANSFER
                      </button>
                      <button
                        onClick={() => {
                          if (paymentMethod !== PaymentMethod.TEMPO) setPaymentNote('Max 1 minggu dari transaksi.');
                          setPaymentMethod(PaymentMethod.TEMPO);
                          setAmountPaid('0');
                          setSelectedBankId('');
                        }}
                        className={`p-3 rounded-xl border-2 text-sm font-bold flex flex-col items-center gap-1.5 transition-all ${paymentMethod === PaymentMethod.TEMPO ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                      >
                        <Clock size={22} /> TEMPO
                      </button>
                    </div>
                  </div>

                  {/* Bank Selector */}
                  {(paymentMethod === PaymentMethod.TRANSFER || paymentMethod === PaymentMethod.TEMPO) && (
                    <div className="animate-fade-in">
                      <label htmlFor="bankSelect" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                        {paymentMethod === PaymentMethod.TRANSFER ? 'Rekening / E-Wallet Tujuan' : 'Rekening Tujuan (Jika DP)'}
                      </label>
                      <select
                        id="bankSelect"
                        name="bankSelect"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium text-slate-700"
                        value={selectedBankId}
                        onChange={e => setSelectedBankId(e.target.value)}
                      >
                        <option value="">-- Pilih Bank / E-Wallet --</option>
                        {banks.sort((a, b) => a.bankName.localeCompare(b.bankName)).map(b => (
                          <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Amount & Numpad (Only for Cash or Tempo) */}
                  {(paymentMethod === PaymentMethod.CASH || paymentMethod === PaymentMethod.TEMPO) && (
                    <div className="animate-fade-in space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Jumlah Diterima</label>
                        </div>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl">Rp</span>
                          <input
                            type="text"
                            readOnly
                            className="w-full pl-12 pr-4 py-3 text-2xl font-bold text-slate-900 bg-white border-2 border-slate-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            value={formatNumber(parseFloat(amountPaid || '0'))}
                            placeholder="0"
                          />
                        </div>
                        
                        {/* Quick Cash Buttons */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          <button onClick={() => setAmountPaid(totalAmount.toString())} className="py-2 bg-primary/10 text-primary font-bold rounded-lg text-sm hover:bg-primary/20 transition-colors">Uang Pas</button>
                          <button onClick={() => setAmountPaid((parseInt(amountPaid || '0') + 50000).toString())} className="py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-200 transition-colors">+50k</button>
                          <button onClick={() => setAmountPaid((parseInt(amountPaid || '0') + 100000).toString())} className="py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-200 transition-colors">+100k</button>
                          <button onClick={() => setAmountPaid('')} className="py-2 bg-red-100 text-red-600 font-bold rounded-lg text-sm hover:bg-red-200 transition-colors">Clear</button>
                        </div>
                      </div>

                      {/* Numeric Keypad */}
                      <div className="grid grid-cols-3 gap-2 select-none">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                          <button key={num} onClick={() => setAmountPaid(prev => (prev === '0' || !prev ? num.toString() : prev + num))} className="py-3 text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors">
                            {num}
                          </button>
                        ))}
                        <button onClick={() => setAmountPaid(prev => prev ? prev + '000' : '0')} className="py-3 text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors">000</button>
                        <button onClick={() => setAmountPaid(prev => (prev === '0' || !prev ? '0' : prev + '0'))} className="py-3 text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors">0</button>
                        <button onClick={() => setAmountPaid(prev => prev.slice(0, -1))} className="py-3 text-xl font-bold bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 active:bg-slate-300 transition-colors flex justify-center items-center">
                          ⌫
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Catatan</label>
                    <div className="relative">
                      <StickyNote size={18} className="absolute left-3.5 top-3.5 text-slate-400" />
                      <input
                        type="text"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        placeholder="Catatan opsional..."
                        value={paymentNote}
                        onChange={e => setPaymentNote(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Summary / Change */}
                  {(paymentMethod === PaymentMethod.CASH) && parseFloat(amountPaid) >= totalAmount && (
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center animate-fade-in mt-2">
                      <span className="text-emerald-700 font-bold uppercase tracking-wider text-sm">Kembalian</span>
                      <span className="text-2xl font-black text-emerald-600">{formatIDR(parseFloat(amountPaid) - totalAmount)}</span>
                    </div>
                  )}

                  {(paymentMethod === PaymentMethod.TEMPO || (paymentMethod === PaymentMethod.CASH && parseFloat(amountPaid) < totalAmount)) && (
                    <div className="p-4 bg-orange-50 rounded-xl border border-orange-200 flex justify-between items-center animate-fade-in mt-2">
                      <span className="text-orange-700 font-bold uppercase tracking-wider text-sm">Sisa Hutang</span>
                      <span className="text-2xl font-black text-orange-600">{formatIDR(totalAmount - (parseFloat(amountPaid) || 0))}</span>
                    </div>
                  )}
                </div>

                {/* Footer Action */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex gap-3 shrink-0">
                  <button onClick={() => setShowPaymentModal(false)} className="px-6 py-4 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors">Batal</button>
                  <button 
                    onClick={() => {
                      if (paymentMethod === PaymentMethod.TRANSFER) {
                        if (!selectedBankId) {
                          alert("Pilih rekening bank tujuan terlebih dahulu!");
                          return;
                        }
                        setShowQrisModal(true);
                      } else {
                        handleCheckout();
                      }
                    }} 
                    className="flex-1 py-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/30 hover:bg-primary-hover hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 text-lg"
                  >
                    {paymentMethod === PaymentMethod.TRANSFER ? (
                      <>Generate QRIS <ScanLine size={22}/></>
                    ) : (
                      <>Proses & Cetak <Printer size={22}/></>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* QRIS Dedicated Popup Modal */}
      {
        showQrisModal && paymentMethod === PaymentMethod.TRANSFER && selectedBankId && createPortal(
          <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-slate-900/95 backdrop-blur-md z-[10000] flex items-center justify-center p-4 md:p-8 animate-fade-in">
            <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative animate-scale-in">
              <button 
                onClick={() => setShowQrisModal(false)} 
                className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors z-10"
              >
                <X size={24} />
              </button>

              {/* Left Side: QR Code Area */}
              <div className="w-full md:w-1/2 bg-slate-50 p-4 md:p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-200">
                <div className="w-full max-w-[320px] origin-center mx-auto">
                  {(() => {
                    const selectedBank = banks.find(b => b.id === selectedBankId);
                    return selectedBank ? (
                      <PaymentQRCode
                        amount={totalAmount}
                        bank={selectedBank}
                        storeName={storeSettings?.name}
                        size={280}
                      />
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Right Side: Details and Action */}
              <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
                <h3 className="text-3xl font-black text-slate-800 mb-2">Selesaikan Pembayaran</h3>
                <p className="text-slate-500 mb-10 text-lg">Mohon tunjukkan layar ini kepada pelanggan untuk dipindai.</p>
                
                <div className="mb-12">
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Total Tagihan</p>
                  <p className="text-5xl font-black text-primary">{formatIDR(totalAmount)}</p>
                </div>
                
                <button 
                  onClick={() => {
                    setShowQrisModal(false);
                    handleCheckout(); // Actually process the transaction
                  }} 
                  className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-bold shadow-xl shadow-emerald-500/30 hover:bg-emerald-600 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-3 text-xl"
                >
                  Konfirmasi Sukses <Printer size={28}/>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      }

    </div>
  );
};