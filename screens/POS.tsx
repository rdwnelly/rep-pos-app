import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Trash2, User, Plus, Minus, ShoppingBag, Printer, CreditCard, Banknote, Clock, ScanLine, StickyNote, Image as ImageIcon, X, ChevronLeft, ClipboardList } from 'lucide-react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { Product, CartItem, PriceType, PaymentStatus, Transaction, PaymentMethod, User as UserType, Customer, StoreSettings, TransactionType, Category } from '../types';
import { formatIDR, getPriceByType, generateId, formatDate, toMySQLDate } from '../utils';
import { generatePrintInvoice } from '../utils/printHelpers';
import { useBluetoothPrinter } from '../hooks/useBluetoothPrinter';
import { generateESCPOSReceipt } from '../utils/escposEncoder';
import { playBeep } from '../utils/soundEffect';
import { PaymentQRCode } from '../components/ui/PaymentQRCode';

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

  // Settings
  const [defaultPriceType, setDefaultPriceType] = useState<PriceType>(PriceType.RETAIL);

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
        if (c.defaultPriceType) {
          setDefaultPriceType(c.defaultPriceType);
        }
      }
    } else {
      setCustomerName('Pelanggan Umum');
      setDefaultPriceType(PriceType.RETAIL); // Default back to Retail for walk-in
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
    // Validate Price: Prevent adding items with 0 price
    const price = getPriceByType(product, defaultPriceType);
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

      const existing = prev.find(item => item.id === product.id && item.selectedPriceType === defaultPriceType);
      if (existing) {
        return prev.map(item =>
          (item.id === product.id && item.selectedPriceType === defaultPriceType)
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }
      // price calculated above is used here
      return [...prev, { ...product, qty: 1, selectedPriceType: defaultPriceType, finalPrice: price }];
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
      if (updates.selectedPriceType) {
        newCart[index].finalPrice = getPriceByType(newCart[index], updates.selectedPriceType as PriceType);
      }
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

      printReceipt(txToPrint, settings);

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

  const printReceipt = async (tx: Transaction, settings: StoreSettings) => {
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

    const html = generatePrintInvoice(tx, settings, formatIDR, formatDate);
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
          <label htmlFor="priceTypeSelect" className="sr-only">Pilih Tipe Harga</label>
          <select
            id="priceTypeSelect"
            name="priceTypeSelect"
            className="hidden sm:block px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600"
            value={defaultPriceType}
            onChange={(e) => setDefaultPriceType(e.target.value as PriceType)}
          >
            <option value={PriceType.RETAIL}>Eceran</option>
            <option value={PriceType.WHOLESALE}>Grosir</option>
            <option value={PriceType.EMPLOYEE}>Karyawan</option>
          </select>
        </div>

        {/* Mobile Price Type Selector (Visible only on small screens) */}
        <div className="sm:hidden px-4 pb-4 border-b border-slate-100 bg-white">
          <label htmlFor="priceTypeSelectMobile" className="sr-only">Pilih Tipe Harga</label>
          <select
            id="priceTypeSelectMobile"
            name="priceTypeSelectMobile"
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600"
            value={defaultPriceType}
            onChange={(e) => setDefaultPriceType(e.target.value as PriceType)}
          >
            <option value={PriceType.RETAIL}>Harga Eceran</option>
            <option value={PriceType.WHOLESALE}>Harga Grosir</option>
            <option value={PriceType.EMPLOYEE}>Harga Karyawan</option>
          </select>
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
                <span className={`block font-bold ${defaultPriceType === PriceType.RETAIL ? 'text-primary' :
                  defaultPriceType === PriceType.WHOLESALE ? 'text-blue-600' :
                    defaultPriceType === PriceType.EMPLOYEE ? 'text-purple-600' : 'text-slate-800'
                  }`}>
                  {getPriceByType(product, defaultPriceType) === 0 ? '0' : formatIDR(getPriceByType(product, defaultPriceType))}
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
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col h-full lg:h-full overflow-hidden">

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
                    <label htmlFor={`priceType-${idx}`} className="sr-only">Price Type</label>
                    <select
                      id={`priceType-${idx}`}
                      name={`priceType-${idx}`}
                      className="text-xs bg-slate-100 border-none rounded px-1 py-0.5 text-slate-600"
                      value={item.selectedPriceType}
                      onChange={(e) => updateCartItem(idx, { selectedPriceType: e.target.value as PriceType })}
                    >
                      <option value={PriceType.RETAIL}>Eceran</option>
                      <option value={PriceType.WHOLESALE}>Grosir</option>
                      <option value={PriceType.EMPLOYEE}>Karyawan</option>
                    </select>
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

          <div className="pt-4 mt-auto border-t border-slate-100">
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
              className="w-full bg-primary text-white py-3 rounded-xl font-semibold shadow-lg shadow-primary/20 hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Printer size={20} />
              Bayar & Cetak
            </button>
          </div>
        </div>
      </div>


      {/* Payment Modal */}
      {
        showPaymentModal && createPortal(
          <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/40 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white/85 backdrop-blur-2xl border border-white/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-primary/90 p-6 text-white shrink-0">
                <h3 className="text-lg font-semibold">Konfirmasi Pembayaran</h3>
                <p className="text-white/80 text-sm mt-1">Total: {formatIDR(totalAmount)}</p>
              </div>
              <div className="p-6 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="customerNameInput" className="block text-sm font-medium text-slate-600 mb-1">Nama Pelanggan (Opsional)</label>
                    <input
                      id="customerNameInput"
                      type="text"
                      className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                      placeholder="Cth: Budi"
                      value={customerName === 'Pelanggan Umum' ? '' : customerName}
                      onChange={(e) => setCustomerName(e.target.value || 'Pelanggan Umum')}
                      disabled={!!selectedCustomerId} // Kalo pilih dari db, jangan bisa diedit
                    />
                  </div>
                  <div>
                    <label htmlFor="tableNumberInput" className="block text-sm font-medium text-slate-600 mb-1">Pesanan Meja (Opsional)</label>
                    <input
                      id="tableNumberInput"
                      type="text"
                      className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                      placeholder="Cth: Meja 04"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-sm font-medium text-slate-600 mb-2">Metode Pembayaran</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        setPaymentMethod(PaymentMethod.CASH);
                        setSelectedBankId('');
                        if (paymentMethod === PaymentMethod.TEMPO && paymentNote === 'Max 1 minggu dari transaksi.') {
                          setPaymentNote('');
                        }
                      }}
                      className={`p-2 rounded-lg border text-sm font-medium flex flex-col items-center gap-1 ${paymentMethod === PaymentMethod.CASH ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-500'}`}
                    >
                      <Banknote size={20} /> Tunai
                    </button>
                    <button
                      onClick={() => {
                        setPaymentMethod(PaymentMethod.TRANSFER);
                        setAmountPaid(totalAmount.toString());
                        if (paymentMethod === PaymentMethod.TEMPO && paymentNote === 'Max 1 minggu dari transaksi.') {
                          setPaymentNote('');
                        }
                      }}
                      className={`p-2 rounded-lg border text-sm font-medium flex flex-col items-center gap-1 ${paymentMethod === PaymentMethod.TRANSFER ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-500'}`}
                    >
                      <CreditCard size={20} /> Transfer
                    </button>
                    <button
                      onClick={() => {
                        if (paymentMethod !== PaymentMethod.TEMPO) {
                          setPaymentNote('Max 1 minggu dari transaksi.');
                        }
                        setPaymentMethod(PaymentMethod.TEMPO);
                        setAmountPaid('0');
                        setSelectedBankId('');
                      }}
                      className={`p-2 rounded-lg border text-sm font-medium flex flex-col items-center gap-1 ${paymentMethod === PaymentMethod.TEMPO ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-500'}`}
                    >
                      <Clock size={20} /> Tempo
                    </button>
                  </div>
                </div>

                {/* Bank Selector for Transfer or Tempo (Partial Transfer) */}
                {(paymentMethod === PaymentMethod.TRANSFER || paymentMethod === PaymentMethod.TEMPO) && (
                  <div>
                    <label htmlFor="bankSelect" className="block text-sm font-medium text-slate-600 mb-1">
                      {paymentMethod === PaymentMethod.TRANSFER ? 'Pilih Rekening Tujuan' : 'Rekening Tujuan (Jika DP Transfer)'}
                    </label>
                    <select
                      id="bankSelect"
                      name="bankSelect"
                      className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white"
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

                {/* QR Code for Transfer Payment */}
                {paymentMethod === PaymentMethod.TRANSFER && selectedBankId && (() => {
                  const selectedBank = banks.find(b => b.id === selectedBankId);
                  return selectedBank ? (
                    <PaymentQRCode
                      amount={totalAmount}
                      bank={selectedBank}
                      storeName={storeSettings?.name}
                    />
                  ) : null;
                })()}

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor="amountPaid" className="block text-sm font-medium text-slate-600">Jumlah Diterima</label>
                    {paymentMethod === PaymentMethod.CASH && (
                      <button
                        onClick={() => setAmountPaid(totalAmount.toString())}
                        className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-bold hover:bg-primary/20 transition-colors"
                      >
                        Uang Pas
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Rp</span>
                    <input
                      id="amountPaid"
                      name="amountPaid"
                      type="text"
                      className="w-full pl-12 pr-4 py-3 text-xl font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary outline-none"
                      value={amountPaid}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setAmountPaid(val);
                      }}
                      placeholder="0"
                      autoFocus
                    />
                  </div>
                  {/* Warning for Tempo payment if amount exceeds total */}
                  {paymentMethod === PaymentMethod.TEMPO && parseFloat(amountPaid) > totalAmount && (
                    <div className="mt-2 p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                        <span className="font-bold">⚠</span> Peringatan: Jumlah yang diterima melebihi total tagihan!
                      </p>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label htmlFor="paymentNote" className="block text-sm font-medium text-slate-600 mb-1">Catatan (Opsional)</label>
                  <div className="relative">
                    <StickyNote size={16} className="absolute left-3 top-3 text-slate-400" />
                    <textarea
                      id="paymentNote"
                      name="paymentNote"
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary outline-none text-sm"
                      rows={2}
                      placeholder="Catatan tambahan..."
                      value={paymentNote}
                      onChange={e => setPaymentNote(e.target.value)}
                    ></textarea>
                  </div>
                </div>

                {/* Summary Logic */}
                {(paymentMethod === PaymentMethod.CASH || paymentMethod === PaymentMethod.TRANSFER) && parseFloat(amountPaid) >= totalAmount && (
                  <div className="p-4 bg-green-50 rounded-xl border border-green-100 text-center">
                    <p className="text-sm text-green-600">Kembalian</p>
                    <p className="text-2xl font-bold text-green-700">{formatIDR(parseFloat(amountPaid) - totalAmount)}</p>
                  </div>
                )}

                {(paymentMethod === PaymentMethod.TEMPO || parseFloat(amountPaid) < totalAmount) && (paymentMethod !== PaymentMethod.TRANSFER && paymentMethod !== PaymentMethod.CASH) && (
                  <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                    <p className="text-sm text-orange-600 font-medium">Sisa Hutang</p>
                    <p className="text-xl font-bold text-orange-700">{formatIDR(totalAmount - (parseFloat(amountPaid) || 0))}</p>
                    <p className="text-xs text-orange-500 mt-1">Akan dicatat sebagai piutang {customerName}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-3 text-slate-600 hover:bg-slate-50 rounded-xl font-medium">Batal</button>
                  <button onClick={handleCheckout} className="flex-1 py-3 bg-primary text-white rounded-xl font-semibold shadow-lg hover:bg-primary-hover transition-colors">
                    Proses
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

    </div>
  );
};