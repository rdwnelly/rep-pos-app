import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Search, Trash2, Plus, Minus, ShoppingBag, AlertTriangle,
  X, CheckCircle, FileClock, User, CreditCard,
  ChevronDown, FileText, CalendarClock, Info
} from 'lucide-react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import {
  Product, CartItem, PaymentStatus, Transaction, PaymentMethod,
  User as UserType, StoreSettings, TransactionType
} from '../types';
import { formatIDR, generateId, formatDate, toMySQLDate } from '../utils';

interface BackdateEntryProps {
  currentUser: { uid: string; email: string | null; role: string; name?: string };
}

const formatNumber = (val: number) => val.toLocaleString('id-ID');

const toDatetimeLocal = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const BackdateEntry: React.FC<BackdateEntryProps> = ({ currentUser }) => {
  const products = useData(() => StorageService.getProducts(), [], 'products') || [];
  const customers = useData(() => StorageService.getCustomers(), [], 'customers') || [];
  const banks = useData(() => StorageService.getBanks(), [], 'banks') || [];
  const categories = useData(() => StorageService.getCategories(), [], 'categories') || [];

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const nowStr = toDatetimeLocal(new Date());
  const [backdateTime, setBackdateTime] = useState(nowStr);
  const [manualReason, setManualReason] = useState('');

  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('Pelanggan Umum');
  const [customerPhone, setCustomerPhone] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('FIXED');

  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.finalPrice * item.qty, 0),
    [cart]
  );

  const discountAmountValue = useMemo(() => {
    if (discountType === 'PERCENTAGE') {
      return Math.round((subtotal * Math.min(discount, 100)) / 100);
    }
    return Math.min(discount, subtotal);
  }, [subtotal, discount, discountType]);

  const totalAmount = useMemo(
    () => Math.max(0, subtotal - discountAmountValue),
    [subtotal, discountAmountValue]
  );

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase());
      const matchCategory = selectedCategory ? p.categoryId === selectedCategory : true;
      return matchSearch && matchCategory;
    });
  }, [products, search, selectedCategory]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers.slice(0, 10);
    return customers
      .filter(
        c =>
          c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.phone.includes(customerSearch)
      )
      .slice(0, 10);
  }, [customers, customerSearch]);

  useEffect(() => { setVisibleCount(20); }, [search, selectedCategory]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setVisibleCount(prev => prev + 20); },
      { threshold: 0.5 }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => { if (loadMoreRef.current) observer.unobserve(loadMoreRef.current); };
  }, [loadMoreRef.current, filteredProducts]);

  useEffect(() => {
    if (selectedCustomerId) {
      const c = customers.find(cust => cust.id === selectedCustomerId);
      if (c) { setCustomerName(c.name); setCustomerPhone(c.phone || ''); }
    } else {
      setCustomerName('Pelanggan Umum'); setCustomerPhone('');
    }
  }, [selectedCustomerId, customers]);

  const addToCart = (product: Product) => {
    if (product.price === 0) {
      setErrorMsg(`Harga produk "${product.name}" adalah 0.`);
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { ...product, qty: 1, finalPrice: product.price }];
    });
  };

  const updateQty = (index: number, delta: number) => {
    setCart(prev => {
      const newCart = [...prev];
      const newQty = newCart[index].qty + delta;
      if (newQty <= 0) return newCart.filter((_, i) => i !== index);
      newCart[index] = { ...newCart[index], qty: newQty };
      return newCart;
    });
  };

  const updateFinalPrice = (index: number, price: number) => {
    setCart(prev => { const nc = [...prev]; nc[index] = { ...nc[index], finalPrice: price }; return nc; });
  };

  const removeFromCart = (index: number) => setCart(prev => prev.filter((_, i) => i !== index));

  const resetAll = () => {
    setCart([]); setSearch(''); setSelectedCategory(''); setSelectedCustomerId('');
    setCustomerName('Pelanggan Umum'); setCustomerPhone(''); setCustomerSearch('');
    setAmountPaid(''); setPaymentMethod(PaymentMethod.CASH); setSelectedBankId('');
    setPaymentNote(''); setDiscount(0); setDiscountType('FIXED');
    setManualReason(''); setBackdateTime(toDatetimeLocal(new Date())); setShowPaymentPanel(false);
  };

  const handleSubmit = async () => {
    if (cart.length === 0) { setErrorMsg('Keranjang masih kosong!'); return; }
    if (!manualReason.trim()) { setErrorMsg('Alasan Susulan wajib diisi!'); return; }
    if (!backdateTime) { setErrorMsg('Tanggal & waktu wajib dipilih.'); return; }
    const paid = parseFloat(amountPaid) || 0;
    const isDebt = paymentMethod === PaymentMethod.TEMPO || paymentMethod === PaymentMethod.BON;
    if (!isDebt && paid < totalAmount) { setErrorMsg(`Pembayaran kurang! Total: ${formatIDR(totalAmount)}`); return; }
    if (paymentMethod === PaymentMethod.TRANSFER && !selectedBankId) { setErrorMsg('Pilih rekening bank!'); return; }
    const status = isDebt ? (paid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.UNPAID) : PaymentStatus.PAID;
    const selectedBank = banks.find(b => b.id === selectedBankId);
    // Konversi dari datetime-local (YYYY-MM-DDTHH:mm) ke format MySQL/POS (YYYY-MM-DD HH:MM:SS)
    // Harus menggunakan local time (bukan UTC/toISOString) agar filter tanggal di Berita Acara & Riwayat akurat
    const backdateParsed = new Date(backdateTime);
    const txDate = toMySQLDate(backdateParsed); // format: "YYYY-MM-DD HH:MM:SS" local time
    const invoicePrefix = `SUSULAN-${backdateParsed.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '')}`;
    const transaction: Transaction = {
      id: '',
      type: TransactionType.SALE,
      date: txDate,
      invoiceNumber: `${invoicePrefix}-${generateId().slice(0, 6).toUpperCase()}`,
      items: cart,
      totalAmount,
      amountPaid: paid,
      change: paid - totalAmount,
      paymentStatus: status,
      paymentMethod,
      paymentNote: paymentNote || '',
      bankId: selectedBankId || '',
      bankName: selectedBank?.bankName || '',
      customerId: selectedCustomerId || '',
      customerName: customerName || 'Pelanggan Umum',
      customerPhone: customerPhone || '',
      cashierId: currentUser?.uid || 'admin',
      cashierName: currentUser?.name || currentUser?.email || 'Admin',
      discount: discount > 0 ? discount : 0,
      discountType: discount > 0 ? discountType : 'FIXED',
      discountAmount: discountAmountValue > 0 ? discountAmountValue : 0,
      subtotal,
      is_manual_entry: true,
      manual_entry_reason: manualReason.trim(),
      manual_entry_by: `${currentUser?.name || currentUser?.email || 'Admin'} (${currentUser?.uid || ''})`,
      createdAt: new Date().toISOString(),
    };

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await StorageService.addTransaction(transaction);
      setSuccessMsg('Transaksi Susulan berhasil disimpan!');
      resetAll();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Backdate Entry error:', err);
      setErrorMsg('Gagal menyimpan transaksi. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentMethods = [
    { value: PaymentMethod.CASH, label: 'Tunai', icon: '💵' },
    { value: PaymentMethod.TRANSFER, label: 'Transfer', icon: '🏦' },
    { value: PaymentMethod.QRIS, label: 'QRIS', icon: '📱' },
    { value: PaymentMethod.TEMPO, label: 'Tempo', icon: '📋' },
    { value: PaymentMethod.BON, label: 'BON', icon: '📄' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-fade-in">

      {/* TOP BANNER */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 text-white px-4 sm:px-6 py-3 flex items-center gap-3 shadow-lg shadow-orange-500/20 print:hidden flex-shrink-0">
        <div className="flex items-center justify-center w-9 h-9 bg-white/20 rounded-xl border border-white/30 flex-shrink-0">
          <FileClock size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-sm sm:text-base tracking-tight">MODE TRANSAKSI SUSULAN</span>
            <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/30">KASIR & ADMIN</span>
          </div>
          <p className="text-white/80 text-[10px] sm:text-xs mt-0.5 hidden sm:block">
            Gunakan untuk menginput transaksi yang tertinggal. Semua entri diberi flag audit trail otomatis.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-xl px-2.5 py-1.5 text-xs font-bold">
          <Info size={12} />
          <span>Audit Trail ON</span>
        </div>
      </div>

      {/* TOAST */}
      {successMsg && (
        <div className="mx-4 mt-3 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2.5 text-green-800 text-sm font-semibold shadow-sm flex-shrink-0">
          <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-red-800 text-sm font-semibold shadow-sm flex-shrink-0">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden gap-0 min-h-0">

        {/* LEFT: Product Catalog */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-200 bg-white min-h-0">

          {/* Search */}
          <div className="p-3 sm:p-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Cari nama produk atau SKU..."
                className="w-full pl-9 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-xs sm:text-sm font-medium text-slate-800 transition-all"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter */}
          <div className="px-3 py-2 border-b border-slate-100 overflow-x-auto no-scrollbar flex-shrink-0">
            <div className="flex gap-2 min-w-max">
              <button
                onClick={() => setSelectedCategory('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${selectedCategory === '' ? 'bg-orange-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Semua ({products.length})
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${selectedCategory === cat.id ? 'bg-orange-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {visibleProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <ShoppingBag size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">Produk tidak ditemukan</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
                {visibleProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="group flex flex-col bg-white border border-slate-200 rounded-2xl p-3 hover:border-orange-400 hover:shadow-lg hover:shadow-orange-500/10 transition-all duration-200 active:scale-95 text-left"
                  >
                    <div className="w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50 mb-2.5 flex items-center justify-center border border-slate-100">
                      {product.image && !product.image.includes('picsum.photos') ? (
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <ShoppingBag size={24} className="text-slate-300" />
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs font-bold text-slate-800 line-clamp-2 leading-tight mb-1">{product.name}</p>
                    <p className="text-orange-600 font-extrabold text-xs sm:text-sm mt-auto">{formatIDR(product.price)}</p>
                    <p className="text-slate-400 text-[10px] mt-0.5">Stok: {product.stock}</p>
                  </button>
                ))}
              </div>
            )}
            <div ref={loadMoreRef} className="h-6" />
          </div>
        </div>

        {/* RIGHT: Order Panel */}
        <div className="w-full lg:w-96 xl:w-[420px] flex flex-col bg-white border-t lg:border-t-0 border-slate-200 shadow-xl overflow-hidden min-h-0">

          {/* Backdate Fields */}
          <div className="p-4 border-b border-slate-100 bg-gradient-to-b from-orange-50 to-amber-50 space-y-3 flex-shrink-0">
            <h3 className="text-xs font-black text-orange-800 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarClock size={13} />
              Waktu & Alasan Susulan
            </h3>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Tanggal & Jam Transaksi <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                max={nowStr}
                value={backdateTime}
                onChange={e => setBackdateTime(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
              />
              <p className="text-[10px] text-orange-600/80 mt-1 flex items-center gap-1">
                <AlertTriangle size={10} />
                Pilih waktu di masa lalu (atau sekarang)
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Alasan Transaksi Susulan <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Cth: Nota tertinggal di laci, tablet lowbat, internet putus..."
                value={manualReason}
                onChange={e => setManualReason(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-xs font-medium text-slate-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all resize-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-300 px-6">
                <ShoppingBag size={48} className="mb-3 opacity-30" />
                <p className="text-sm font-semibold text-center text-slate-400">Belum ada item</p>
                <p className="text-xs text-slate-400 text-center mt-1">Klik produk di sebelah kiri untuk menambah</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {cart.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex gap-3 items-start">
                    <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.image && !item.image.includes('picsum.photos') ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <ShoppingBag size={16} className="text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 leading-tight truncate">{item.name}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-slate-500">Rp</span>
                        <input
                          type="number"
                          value={item.finalPrice}
                          onChange={e => updateFinalPrice(index, Number(e.target.value))}
                          className="w-24 text-xs font-bold text-orange-600 border-b border-dashed border-orange-300 bg-transparent outline-none focus:border-orange-500"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        Subtotal: {formatIDR(item.finalPrice * item.qty)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button onClick={() => removeFromCart(index)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-lg transition-colors">
                        <Trash2 size={13} />
                      </button>
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-1 py-0.5">
                        <button onClick={() => updateQty(index, -1)} className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded">
                          <Minus size={12} />
                        </button>
                        <span className="text-xs font-black text-slate-800 w-5 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(index, 1)} className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded">
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order Summary & Payment */}
          {cart.length > 0 && (
            <div className="border-t border-slate-200 bg-white flex-shrink-0">

              {/* Toggle Payment Panel */}
              <button
                onClick={() => setShowPaymentPanel(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-xs font-bold text-slate-600 border-b border-slate-100"
              >
                <span className="flex items-center gap-2">
                  <CreditCard size={14} className="text-orange-500" />
                  Detail Pembayaran & Pelanggan
                </span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${showPaymentPanel ? 'rotate-180' : ''}`} />
              </button>

              {showPaymentPanel && (
                <div className="px-4 pb-4 space-y-3 border-b border-slate-100 max-h-64 overflow-y-auto">

                  {/* Customer */}
                  <div className="relative pt-3">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Pelanggan</label>
                    <div className="relative">
                      <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Cari atau ketik nama pelanggan..."
                        className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 outline-none transition-all"
                        value={customerSearch || (selectedCustomerId ? customerName : '')}
                        onChange={e => { setCustomerSearch(e.target.value); setSelectedCustomerId(''); setCustomerName(e.target.value || 'Pelanggan Umum'); setShowCustomerDropdown(true); }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                      />
                    </div>
                    {showCustomerDropdown && filteredCustomers.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-36 overflow-y-auto">
                        {filteredCustomers.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2.5 hover:bg-orange-50 text-xs font-medium text-slate-700 transition-colors border-b border-slate-50 last:border-0"
                            onMouseDown={() => { setSelectedCustomerId(c.id); setCustomerSearch(''); setShowCustomerDropdown(false); }}
                          >
                            <div className="font-bold">{c.name}</div>
                            <div className="text-slate-400 text-[10px]">{c.phone}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Discount */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Diskon (Opsional)</label>
                    <div className="flex gap-2">
                      <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                        <button onClick={() => setDiscountType('FIXED')} className={`px-2.5 py-1.5 text-[10px] font-bold transition-all ${discountType === 'FIXED' ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>Rp</button>
                        <button onClick={() => setDiscountType('PERCENTAGE')} className={`px-2.5 py-1.5 text-[10px] font-bold transition-all ${discountType === 'PERCENTAGE' ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>%</button>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={discount || ''}
                        onChange={e => setDiscount(Number(e.target.value))}
                        placeholder="0"
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:border-orange-400 outline-none"
                      />
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Metode Bayar</label>
                    <div className="grid grid-cols-5 gap-1">
                      {paymentMethods.map(pm => (
                        <button
                          key={pm.value}
                          onClick={() => setPaymentMethod(pm.value)}
                          className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-[9px] font-bold transition-all ${paymentMethod === pm.value ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/30' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-orange-300 hover:bg-orange-50'}`}
                        >
                          <span className="text-sm">{pm.icon}</span>
                          <span className="text-center leading-tight">{pm.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {paymentMethod === PaymentMethod.TRANSFER && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Rekening Bank</label>
                      <select
                        value={selectedBankId}
                        onChange={e => setSelectedBankId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:border-orange-400 outline-none"
                      >
                        <option value="">-- Pilih Rekening --</option>
                        {banks.map(b => (
                          <option key={b.id} value={b.id}>{b.bankName} — {b.accountNumber} ({b.holderName})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {paymentMethod !== PaymentMethod.TEMPO && paymentMethod !== PaymentMethod.BON && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Jumlah Dibayar</label>
                      <input
                        type="number"
                        value={amountPaid}
                        onChange={e => setAmountPaid(e.target.value)}
                        placeholder={formatNumber(totalAmount)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:border-orange-400 outline-none"
                      />
                      {parseFloat(amountPaid) >= totalAmount && totalAmount > 0 && (
                        <p className="text-[10px] text-green-600 font-bold mt-1">
                          Kembalian: {formatIDR(parseFloat(amountPaid) - totalAmount)}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Catatan (Opsional)</label>
                    <input
                      type="text"
                      value={paymentNote}
                      onChange={e => setPaymentNote(e.target.value)}
                      placeholder="Catatan tambahan..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:border-orange-400 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Subtotal ({cart.reduce((s, i) => s + i.qty, 0)} item)</span>
                  <span className="font-semibold">{formatIDR(subtotal)}</span>
                </div>
                {discountAmountValue > 0 && (
                  <div className="flex justify-between text-xs text-green-600 font-semibold">
                    <span>Diskon</span>
                    <span>− {formatIDR(discountAmountValue)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                  <span className="text-sm font-black text-slate-800">TOTAL</span>
                  <span className="text-lg font-black text-orange-600">{formatIDR(totalAmount)}</span>
                </div>
              </div>

              {/* Audit Preview */}
              {manualReason && (
                <div className="mx-4 mb-3 p-2.5 bg-orange-50 border border-orange-200 rounded-xl text-[10px] text-orange-700">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <FileText size={11} />
                    Audit trail yang akan disimpan:
                  </div>
                  <div className="space-y-0.5 text-orange-600/90">
                    <div><span className="font-bold">Waktu Tx:</span> {backdateTime ? new Date(backdateTime).toLocaleString('id-ID') : '-'}</div>
                    <div><span className="font-bold">Alasan:</span> {manualReason}</div>
                    <div><span className="font-bold">Diinput oleh:</span> {currentUser?.name || currentUser?.email}</div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <div className="px-4 pb-4 flex gap-2">
                <button onClick={resetAll} className="w-1/3 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs transition-colors">
                  Reset
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || cart.length === 0 || !manualReason.trim()}
                  className="w-2/3 py-3 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white rounded-xl font-extrabold text-xs shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                  ) : (
                    <><FileClock size={15} />Simpan Transaksi Susulan</>
                  )}
                </button>
              </div>
            </div>
          )}

          {cart.length === 0 && (
            <div className="p-4 flex-shrink-0">
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-center">
                <AlertTriangle size={20} className="mx-auto mb-2 text-orange-400" />
                <p className="text-xs font-bold text-orange-700">Pilih produk dari katalog di kiri</p>
                <p className="text-[10px] text-orange-500 mt-0.5">untuk membuat transaksi susulan</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
