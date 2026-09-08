import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Trash2, User, Plus, Minus, ShoppingBag, Printer, CreditCard,
  Banknote, ScanLine, StickyNote, Image as ImageIcon, X, ChevronLeft,
  CheckCircle, BadgePercent, Receipt, CalendarClock, AlertTriangle,
  FileClock, Info
} from 'lucide-react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import {
  Product, CartItem, PaymentStatus, Transaction, PaymentMethod,
  StoreSettings, TransactionType, TravelBookingCommission,
  CommissionMethod, CommissionStatus
} from '../types';
import { formatIDR, formatNumber, generateId, formatDate, toMySQLDate } from '../utils';
import { generatePrintInvoice, PrintInvoiceOptions } from '../utils/printHelpers';
import { useBluetoothPrinter } from '../hooks/useBluetoothPrinter';
import { generateESCPOSReceipt } from '../utils/escposEncoder';
import { playBeep } from '../utils/soundEffect';
import { PaymentQRCode } from '../components/ui/PaymentQRCode';

interface BackdateEntryProps {
  currentUser: { uid?: string; id?: string; email: string | null; role: string; name?: string; username?: string };
}

const toDatetimeLocal = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const parseSafeDateTime = (dtStr: string): Date => {
  if (!dtStr) return new Date();
  if (dtStr.includes('T')) {
    const [datePart, timePart] = dtStr.split('T');
    const [year, month, day] = (datePart || '').split('-').map(Number);
    const [hours, minutes, seconds] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, seconds || 0);
  }
  const d = new Date(dtStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

// Flying Item Animation on Add to Cart
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
        <img src={item.image} alt="" className="w-[50px] h-[50px] object-cover rounded-full shadow-lg border-2 border-orange-500" />
      ) : (
        <div className="w-[50px] h-[50px] bg-orange-500 rounded-full shadow-lg flex items-center justify-center">
          <ShoppingBag size={24} className="text-white" />
        </div>
      )}
    </div>
  );
};

export const BackdateEntry: React.FC<BackdateEntryProps> = ({ currentUser }) => {
  const bluetooth = useBluetoothPrinter();
  const products = useData(() => StorageService.getProducts(), [], 'products') || [];
  const customers = useData(() => StorageService.getCustomers(), [], 'customers') || [];
  const banks = useData(() => StorageService.getBanks(), [], 'banks') || [];
  const categories = useData(() => StorageService.getCategories(), [], 'categories') || [];
  const travelAgents = useData(() => StorageService.getTravelAgents(), [], 'travel_agents') || [];
  const storeSettings = useData(() => StorageService.getStoreSettings(), [], 'store_settings');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Customer State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTravelAgentId, setSelectedTravelAgentId] = useState<string>('');
  const [customerName, setCustomerName] = useState('Pelanggan Umum');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableNumber, setTableNumber] = useState('');

  // Backdate Specific State
  const nowStr = toDatetimeLocal(new Date());
  const [backdateTime, setBackdateTime] = useState(nowStr);
  const [manualReason, setManualReason] = useState('');

  // Payment State
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('FIXED');
  const [showQrisModal, setShowQrisModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Mobile Drawer State
  const [showMobileCart, setShowMobileCart] = useState(false);

  // Pagination & Animations
  const [visibleCount, setVisibleCount] = useState(20);
  const [flyingItems, setFlyingItems] = useState<{ id: string; startX: number; startY: number; image?: string }[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cartIconRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Auto-sync customer name and phone when customer selected
  useEffect(() => {
    if (selectedCustomerId) {
      const c = customers.find(cust => cust.id === selectedCustomerId);
      if (c) {
        setCustomerName(c.name);
        setCustomerPhone(c.phone || '');
      }
    } else {
      setCustomerName('Pelanggan Umum');
      setCustomerPhone('');
    }
  }, [selectedCustomerId, customers]);

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + ((Number(item.finalPrice) || 0) * (Number(item.qty) || 1)), 0);
  }, [cart]);

  const discountAmountValue = useMemo(() => {
    if (discountType === 'PERCENTAGE') {
      return Math.round((subtotal * Math.min(discount, 100)) / 100);
    }
    return Math.min(discount, subtotal);
  }, [subtotal, discount, discountType]);

  const totalAmount = useMemo(() => {
    return Math.max(0, subtotal - discountAmountValue);
  }, [subtotal, discountAmountValue]);

  // Filters
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

  // Add To Cart with Flying Animation
  const addToCart = (product: Product, event?: React.MouseEvent) => {
    if (product.price === 0) {
      setErrorMsg(`Harga produk "${product.name}" adalah 0.`);
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    if (event) {
      const rect = event.currentTarget.getBoundingClientRect();
      const newItem = {
        id: generateId(),
        startX: rect.left + rect.width / 2,
        startY: rect.top + rect.height / 2,
        image: product.image
      };
      setFlyingItems(prev => [...prev, newItem]);
      setTimeout(() => {
        setFlyingItems(prev => prev.filter(item => item.id !== newItem.id));
      }, 600);
    }

    const catName = product.categoryName || categories.find(c => c.id === product.categoryId)?.name || '';

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, {
        ...product,
        categoryName: catName,
        qty: 1,
        finalPrice: product.price,
        hpp: product.hpp || 0
      }];
    });
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

  const resetCartAndState = () => {
    setCart([]);
    setSelectedCustomerId('');
    setCustomerName('Pelanggan Umum');
    setCustomerPhone('');
    setTableNumber('');
    setDiscount(0);
    setDiscountType('FIXED');
    setSelectedTravelAgentId('');
    setPaymentNote('');
    setAmountPaid('');
    setPaymentMethod(PaymentMethod.CASH);
    setSelectedBankId('');
    setManualReason('');
    setBackdateTime(toDatetimeLocal(new Date()));
    setErrorMsg('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const exactMatch = products.find(p => p.sku.toLowerCase() === search.toLowerCase());
      if (exactMatch) {
        addToCart(exactMatch);
        setSearch('');
      }
    }
  };

  // Browser Print Helper
  const printViaBrowser = (tx: Transaction, printOptions?: PrintInvoiceOptions) => {
    const settings = storeSettings || ({ name: 'Kasir REP' } as StoreSettings);
    const html = generatePrintInvoice(tx, settings, formatIDR, formatDate, printOptions);

    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn('Iframe print trigger:', e);
          }
        }, 250);

        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch (e) { }
        }, 60000);
        return;
      }
    } catch (e) {
      console.warn('Iframe print error, falling back to window.open:', e);
    }

    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) {
      alert("Popup blocker mencegah cetak struk. Mohon izinkan popup untuk website ini di pengaturan browser Anda.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 250);
  };

  // Print Receipt Logic
  const printReceipt = async (tx: Transaction, settings: StoreSettings, printOptions?: PrintInvoiceOptions) => {
    const isBtMode = settings.useBluetoothPrinter || !!localStorage.getItem('bt_printer_paired');

    if (isBtMode) {
      try {
        let connected = bluetooth.isConnected;
        if (!connected) {
          try {
            connected = await bluetooth.connect({ silentOnly: true });
          } catch {
            connected = false;
          }
        }
        if (!connected) {
          try {
            connected = await bluetooth.connect({ silentOnly: false });
          } catch {
            connected = false;
          }
        }
        if (connected) {
          const escposData = generateESCPOSReceipt(tx, settings);
          await bluetooth.print(escposData);
          return;
        }

        if (confirm("Gagal mencetak via Bluetooth. Apakah Anda ingin mencetak menggunakan dialog printer browser?")) {
          printViaBrowser(tx, printOptions);
        }
      } catch (error: any) {
        console.error("[BT Printer] Cetak gagal:", error);
        alert(`Gagal mencetak struk via Bluetooth: ${error.message || 'Periksa koneksi printer.'}`);
      }
      return;
    }

    printViaBrowser(tx, printOptions);
  };

  // Checkout Handler for Backdate Entry
  const handleCheckout = async () => {
    if (storeSettings?.useBluetoothPrinter && !bluetooth.isConnected) {
      try {
        await bluetooth.connect({ silentOnly: true });
      } catch (e: any) {
        console.error("Bluetooth connect failed:", e);
      }
    }

    if (cart.length === 0) {
      alert('Keranjang masih kosong!');
      return;
    }

    if (!manualReason.trim()) {
      alert('Alasan Transaksi Susulan wajib diisi!');
      return;
    }

    if (!backdateTime) {
      alert('Tanggal & Waktu Transaksi Susulan wajib dipilih!');
      return;
    }

    let paid = (paymentMethod === PaymentMethod.TRANSFER || paymentMethod === PaymentMethod.QRIS)
      ? totalAmount
      : (parseFloat(amountPaid) || 0);

    const zeroPriceItems = cart.filter(item => item.finalPrice === 0);
    if (zeroPriceItems.length > 0) {
      alert('Peringatan: Terdapat item dengan harga 0 di keranjang.');
      return;
    }

    if ((paymentMethod === PaymentMethod.TEMPO || paymentMethod === PaymentMethod.BON) && paid === 0) {
      paid = 0;
    } else if ((paymentMethod === PaymentMethod.TEMPO || paymentMethod === PaymentMethod.BON) && paid > totalAmount) {
      alert('Peringatan: Jumlah pembayaran tidak boleh melebihi total tagihan untuk metode BON / Hutang!');
      return;
    } else if (paymentMethod !== PaymentMethod.TEMPO && paymentMethod !== PaymentMethod.BON && paymentMethod !== PaymentMethod.TRANSFER && paymentMethod !== PaymentMethod.QRIS && paid < totalAmount) {
      alert(`Pembayaran kurang! Total Tagihan: ${formatIDR(totalAmount)}`);
      return;
    }

    if (paymentMethod === PaymentMethod.TRANSFER && !selectedBankId) {
      alert('Silakan pilih rekening bank tujuan transfer.');
      return;
    }

    const isDebt = paid < totalAmount;
    const status = isDebt ? (paid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.UNPAID) : PaymentStatus.PAID;
    const selectedBank = banks.find(b => b.id === selectedBankId);

    const pad = (n: number) => String(n).padStart(2, '0');
    const backdateParsed = parseSafeDateTime(backdateTime);
    const txDate = toMySQLDate(backdateParsed);
    const invDay = pad(backdateParsed.getDate());
    const invMonth = pad(backdateParsed.getMonth() + 1);
    const invYear = String(backdateParsed.getFullYear()).slice(-2);
    const invoicePrefix = `SUSULAN-${invDay}${invMonth}${invYear}`;

    const cashierId = currentUser?.id || currentUser?.uid || 'admin';
    const cashierName = currentUser?.name || currentUser?.username || currentUser?.email || 'Kasir';

    const normalizedItems = cart.map(item => ({
      ...item,
      categoryId: item.categoryId || '',
      categoryName: item.categoryName || (item.categoryId ? categories.find(c => c.id === item.categoryId)?.name : '') || '',
      price: Number(item.price) || 0,
      finalPrice: Number(item.finalPrice) || Number(item.price) || 0,
      hpp: Number(item.hpp) || 0,
      qty: Number(item.qty) || 1,
    }));

    const transaction: Transaction = {
      id: '',
      type: TransactionType.SALE,
      date: txDate,
      invoiceNumber: `${invoicePrefix}-${generateId().slice(0, 6).toUpperCase()}`,
      items: normalizedItems,
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
      customerPhone: customerPhone || (selectedCustomerId ? customers.find(c => c.id === selectedCustomerId)?.phone : ''),
      customerAddress: selectedCustomerId ? customers.find(c => c.id === selectedCustomerId)?.address || '' : '',
      cashierId,
      cashierName,
      discount: discount > 0 ? discount : 0,
      discountType: discount > 0 ? discountType : 'FIXED',
      discountAmount: discountAmountValue > 0 ? discountAmountValue : 0,
      tableNumber: tableNumber || undefined,
      subtotal,
      is_manual_entry: true,
      manual_entry_reason: manualReason.trim(),
      manual_entry_by: `${cashierName} (${cashierId})`,
      createdAt: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      const savedTransaction = await StorageService.addTransaction(transaction);

      // Print
      const settings = await StorageService.getStoreSettings();
      const txToPrint = savedTransaction ? { ...transaction, ...savedTransaction } : transaction;
      if (savedTransaction && savedTransaction.invoiceNumber && !txToPrint.invoiceNumber) {
        txToPrint.invoiceNumber = savedTransaction.invoiceNumber;
      }

      const printOptions: PrintInvoiceOptions = {
        qrisCode: selectedBank?.qrisCode,
        bankName: selectedBank?.bankName,
      };

      printReceipt(txToPrint, settings, printOptions);

      // Commission for Travel Agent if selected
      if (selectedTravelAgentId) {
        const agent = travelAgents.find(a => a.id === selectedTravelAgentId);
        if (agent) {
          const invoiceNum = savedTransaction?.invoiceNumber || txToPrint.invoiceNumber || `TRV-SUSULAN-${Date.now().toString().slice(-6)}`;
          const commMethod = agent.commissionMethod || CommissionMethod.PERCENTAGE;
          const commRate = agent.commissionRate !== undefined && agent.commissionRate !== null ? Number(agent.commissionRate) : 10;

          let totalComm = 0;
          if (commMethod === CommissionMethod.PERCENTAGE) {
            totalComm = Math.round((totalAmount * commRate) / 100);
          } else if (commMethod === CommissionMethod.FLAT_PER_PAX) {
            totalComm = Math.round(commRate * 1);
          } else if (commMethod === CommissionMethod.FLAT_PER_GROUP) {
            totalComm = Math.round(commRate);
          }

          const autoCommission: TravelBookingCommission = {
            id: generateId(),
            bookingCode: invoiceNum,
            agentId: agent.id,
            agentName: agent.name,
            agentCategory: agent.category,
            customerId: selectedCustomerId || '',
            touristName: customerName || 'Wisatawan Susulan',
            paxCount: 1,
            tourPackage: `Penjualan Susulan (${cart.slice(0, 2).map(i => i.name).join(', ')}${cart.length > 2 ? '...' : ''})`,
            departureDate: backdateParsed.toISOString().split('T')[0],
            totalSales: totalAmount,
            commissionMethod: commMethod,
            commissionRate: commRate,
            totalCommission: totalComm,
            status: CommissionStatus.PENDING,
            notes: `Otomatis dari Transaksi Susulan (${invoiceNum}) - Alasan: ${manualReason}`,
            createdAt: new Date().toISOString()
          };

          await StorageService.saveTravelCommission(autoCommission);
        }
      }

      playBeep();
      setSuccessMsg('Transaksi Susulan berhasil disimpan & dicatat di audit trail!');
      resetCartAndState();
      setShowPaymentModal(false);
      setShowSuccessModal(true);

      setTimeout(() => {
        setShowSuccessModal(false);
        setSuccessMsg('');
      }, 3500);

    } catch (error: any) {
      console.error('Backdate checkout error:', error);
      alert('Gagal menyimpan transaksi susulan: ' + (error?.message || 'Silakan coba lagi.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 animate-fade-in relative">
      {flyingItems.map(item => (
        <FlyingItem key={item.id} item={item} cartRect={cartIconRef.current?.getBoundingClientRect()} />
      ))}

      {/* TOP BANNER: MODE TRANSAKSI SUSULAN */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 text-white px-3 sm:px-5 py-2 sm:py-2.5 flex items-center justify-between gap-3 shadow-md shadow-orange-500/20 print:hidden shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-xl border border-white/30 shrink-0">
            <FileClock size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-xs sm:text-sm tracking-tight">KASIR MODE TRANSAKSI SUSULAN</span>
              <span className="bg-white/20 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full border border-white/30">AUDIT TRAIL ON</span>
            </div>
            <p className="text-white/80 text-[10px] hidden sm:block truncate">
              Entri transaksi susulan akan otomatis tercatat pada riwayat & sinkron ke Berita Acara tanggal terpilih.
            </p>
          </div>
        </div>

        {/* Quick inline Date & Reason Indicator */}
        <div className="flex items-center gap-2 shrink-0 text-xs">
          <div className="hidden md:flex items-center gap-1.5 bg-black/20 backdrop-blur-xs px-2.5 py-1 rounded-xl border border-white/20 text-[11px] font-semibold">
            <CalendarClock size={13} className="text-amber-200" />
            <span>Waktu: {backdateTime ? new Date(backdateTime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
          </div>
        </div>
      </div>

      {/* TOAST NOTIFICATION */}
      {successMsg && (
        <div className="mx-3 sm:mx-4 mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-800 text-xs font-semibold shadow-xs shrink-0 animate-fade-in">
          <CheckCircle size={16} className="text-emerald-600 shrink-0" />
          <span className="flex-1">{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700"><X size={14} /></button>
        </div>
      )}
      {errorMsg && (
        <div className="mx-3 sm:mx-4 mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-800 text-xs font-semibold shadow-xs shrink-0 animate-fade-in">
          <AlertTriangle size={16} className="text-rose-500 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="text-rose-400 hover:text-rose-600"><X size={14} /></button>
        </div>
      )}

      {/* MAIN LAYOUT: EXACT SAME AS POS.tsx */}
      <div className="flex flex-col lg:flex-row flex-1 h-full w-full gap-0 overflow-hidden relative">

        {/* Product Catalog Grid Container (LEFT) */}
        <div className="flex-1 flex flex-col bg-slate-50 border-r border-slate-200 overflow-hidden min-h-0">
          
          {/* Search Bar Header */}
          <div className="p-2.5 sm:p-4 border-b border-slate-200 flex gap-2 sm:gap-3 bg-white shadow-2xs z-10">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 sm:w-4.5 sm:h-4.5" />
              <label htmlFor="backdateSearch" className="sr-only">Cari Produk Transaksi Susulan</label>
              <input
                id="backdateSearch"
                name="backdateSearch"
                ref={searchInputRef}
                type="text"
                placeholder="Scan Barcode atau Cari Nama Produk / Kode SKU..."
                className="w-full pl-9 pr-16 sm:pl-10 sm:pr-20 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-[11px] sm:text-xs font-semibold text-slate-800 transition-all"
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
                  className="absolute right-8 sm:right-10 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-200 rounded-lg"
                  title="Hapus pencarian"
                >
                  <X size={14} />
                </button>
              )}
              <ScanLine className="absolute right-2.5 sm:right-3.5 top-1/2 -translate-y-1/2 text-orange-600 w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
          </div>

          {/* Category Filter Horizontal Carousel */}
          <div className="bg-white border-b border-slate-200 px-2 sm:px-4 py-1.5 sm:py-2.5 sticky top-0 z-10 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-max">
              <button
                onClick={() => setSelectedCategory('')}
                className={`px-2 sm:px-3.5 py-0.5 sm:py-1.5 rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-bold transition-all ${selectedCategory === ''
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                Semua Menu ({products.length})
              </button>
              {categories.map(cat => {
                const catCount = products.filter(p => p.categoryId === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2 sm:px-3.5 py-0.5 sm:py-1.5 rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${selectedCategory === cat.id
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                  >
                    <span>{cat.name}</span>
                    <span className={`text-[8px] sm:text-[10px] px-1 py-0.2 rounded-full ${selectedCategory === cat.id ? 'bg-orange-700/50 text-white' : 'bg-slate-200 text-slate-700'
                      }`}>{catCount}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product Cards Grid - Clear Legible Multi-Line Layout */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-3.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3.5 content-start pb-28 lg:pb-3 touch-scroll">
            {visibleProducts.map(product => (
              <button
                key={product.id}
                onClick={(e) => addToCart(product, e)}
                className="group flex flex-col justify-between items-start text-left bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-2 sm:p-2.5 hover:shadow-md hover:border-orange-500/60 transition-all active:scale-95 relative overflow-hidden cursor-pointer"
                title={product.name}
              >
                <div className="w-full aspect-square bg-slate-50 rounded-lg sm:rounded-xl mb-1.5 sm:mb-2 overflow-hidden relative border border-slate-100 flex items-center justify-center shrink-0">
                  {product.image && !product.image.includes('picsum.photos') ? (
                    <img src={product.image} alt={product.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-orange-50/50 text-orange-600">
                      <ImageIcon className="text-orange-400 w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                  )}
                  <span className={`absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 text-[8px] sm:text-[10px] font-extrabold px-1.5 sm:px-2 py-0.5 rounded-full backdrop-blur-md shadow-xs ${product.stock <= 5 ? 'bg-rose-600/90 text-white' : 'bg-slate-900/80 text-white'
                    }`}>
                    {product.stock} {product.unit || 'Pcs'}
                  </span>
                </div>

                <div className="w-full flex-1 flex flex-col justify-between">
                  <h4
                    className="font-bold text-slate-800 text-xs sm:text-[13px] leading-snug line-clamp-2 min-h-[2rem] sm:min-h-[2.4rem] mb-1 group-hover:text-orange-700 transition-colors"
                    title={product.name}
                  >
                    {product.name}
                  </h4>
                  <div className="mt-auto pt-1 flex items-center justify-between border-t border-slate-100">
                    <span className="font-extrabold text-orange-600 text-xs sm:text-sm">
                      {product.price === 0 ? 'Rp 0' : formatIDR(product.price)}
                    </span>
                    <span className="p-1 sm:p-1.5 bg-orange-50 text-orange-600 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-colors shrink-0">
                      <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
            
            {visibleProducts.length < filteredProducts.length && (
              <div ref={loadMoreRef} className="col-span-full h-10 flex items-center justify-center text-slate-400 text-xs">
                Memuat lebih banyak...
              </div>
            )}
          </div>
        </div>

        {/* Mobile Bottom Bar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2.5 sm:p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-40 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] sm:text-xs text-slate-500">{cart.reduce((acc, item) => acc + item.qty, 0)} Item di Keranjang</span>
            <span className="text-base sm:text-lg font-bold text-orange-600">{formatIDR(totalAmount)}</span>
          </div>
          <button
            onClick={() => setShowMobileCart(true)}
            className="bg-orange-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm hover:bg-orange-700 transition-colors shadow-lg shadow-orange-600/30 flex items-center gap-1.5 sm:gap-2"
          >
            <ShoppingBag size={18} />
            Lihat Keranjang
          </button>
        </div>

        {/* Cart Sidebar / Mobile Drawer (RIGHT) */}
        <div ref={cartIconRef} className={`
          flex flex-col bg-white
          lg:w-96 lg:static lg:h-full lg:overflow-hidden
          fixed inset-0 z-[60] transition-transform duration-300 ease-in-out w-full max-w-full overflow-x-hidden
          ${showMobileCart ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}>
          <div className="p-2.5 sm:p-4 border-b border-slate-100 bg-slate-50 flex flex-col flex-1 overflow-hidden w-full max-w-full">

            {/* Mobile Header for Cart */}
            <div className="lg:hidden flex items-center gap-2 mb-2 pb-2 border-b border-slate-200 shrink-0">
              <button
                onClick={() => setShowMobileCart(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-600"
              >
                <ChevronLeft size={20} />
              </button>
              <h3 className="font-bold text-base text-slate-800">Keranjang Transaksi Susulan</h3>
            </div>

            {/* Backdate Specific Form Card */}
            <div className="mb-2 p-2.5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-orange-200 shadow-2xs shrink-0 space-y-2">
              <div>
                <label className="block text-[10px] font-bold text-orange-900 mb-1 flex items-center gap-1">
                  <CalendarClock size={12} className="text-orange-600" />
                  Tanggal & Jam Transaksi Susulan <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  max={nowStr}
                  value={backdateTime}
                  onChange={e => setBackdateTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-orange-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-orange-900 mb-1 flex items-center gap-1">
                  <FileClock size={12} className="text-orange-600" />
                  Alasan Transaksi Susulan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Cth: Nota fisik tertinggal, tablet lowbat, offline..."
                  value={manualReason}
                  onChange={e => setManualReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-orange-300 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium"
                />
              </div>
            </div>

            {/* Customer & Agent Selector Card */}
            <div className="mb-2 p-2 bg-white rounded-xl border border-slate-200 shadow-2xs shrink-0 space-y-1.5">
              <div className="relative">
                <label htmlFor="customerSearch" className="sr-only">Cari Pelanggan</label>
                <input
                  id="customerSearch"
                  name="customerSearch"
                  type="text"
                  placeholder="Cari nama pelanggan..."
                  className="w-full px-2.5 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                {customerSearch && (
                  <button
                    onClick={() => setCustomerSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 hover:bg-slate-100 rounded"
                    title="Hapus pencarian"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <User size={15} className="text-slate-400 shrink-0" />
                <label htmlFor="customerSelect" className="sr-only">Pilih Pelanggan</label>
                <select
                  id="customerSelect"
                  name="customerSelect"
                  className="bg-transparent font-semibold text-xs text-slate-700 focus:outline-none border-b border-dashed border-slate-300 w-full focus:border-orange-500 transition-colors py-0.5"
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

              {/* Travel Agent Selector */}
              {travelAgents.length > 0 && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                  <BadgePercent size={14} className="text-orange-600 shrink-0" />
                  <select
                    className="bg-amber-50/90 text-amber-900 font-semibold text-[11px] rounded-lg px-2 py-1 border border-amber-200 w-full outline-none"
                    value={selectedTravelAgentId}
                    onChange={(e) => setSelectedTravelAgentId(e.target.value)}
                  >
                    <option value="">-- Pilihan Mitra Agen (Opsional Komisi) --</option>
                    {travelAgents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Sticky/Fixed TOP Total & Checkout Summary Block (SAME AS POS.tsx) */}
            <div className="mb-2 p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs shrink-0 space-y-1.5 z-10">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>Subtotal ({cart.reduce((sum, item) => sum + item.qty, 0)} item)</span>
                <span className="font-semibold text-slate-700">{formatIDR(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span>Diskon</span>
                  <div className="flex items-center bg-slate-100 border border-slate-300 rounded overflow-hidden">
                    <button
                      onClick={() => { setDiscountType('FIXED'); setDiscount(0); }}
                      className={`px-1.5 py-0.5 text-[9px] font-bold ${discountType === 'FIXED' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                    >
                      Rp
                    </button>
                    <button
                      onClick={() => { setDiscountType('PERCENTAGE'); setDiscount(0); }}
                      className={`px-1.5 py-0.5 text-[9px] font-bold ${discountType === 'PERCENTAGE' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                    >
                      %
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1 w-20">
                  <label htmlFor="discountInput" className="sr-only">Diskon</label>
                  <input
                    id="discountInput"
                    name="discountInput"
                    type="text"
                    className={`w-full text-right bg-transparent border-b border-dashed outline-none font-bold text-xs pb-0.5 ${(discountType === 'PERCENTAGE' && discount > 100) || (discountType === 'FIXED' && discount > subtotal)
                      ? 'border-red-500 text-red-600'
                      : 'border-slate-300 focus:border-orange-500 text-slate-900'
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
                <div className="text-right">
                  <span className="text-[9px] text-red-500 font-bold">⚠ Max 100%</span>
                </div>
              )}
              {discountType === 'FIXED' && discount > subtotal && (
                <div className="text-right">
                  <span className="text-[9px] text-red-500 font-bold">⚠ Max Subtotal</span>
                </div>
              )}

              {discount > 0 && (
                <div className="flex justify-between items-center text-xs text-red-500 font-medium">
                  <span>Potongan</span>
                  <span>-{formatIDR(discountAmountValue)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                <span className="text-slate-700 font-bold text-xs">Total Tagihan</span>
                <span className="text-lg font-black text-orange-600">{formatIDR(totalAmount)}</span>
              </div>

              {/* Action Button: Bayar & Selesaikan */}
              <div className="pt-1">
                <button
                  onClick={() => {
                    if (cart.length === 0) {
                      alert('Keranjang masih kosong!');
                      return;
                    }
                    if (!manualReason.trim()) {
                      alert('Mohon isi Alasan Transaksi Susulan terlebih dahulu.');
                      return;
                    }
                    if (discountType === 'PERCENTAGE' && discount > 100) {
                      alert('Diskon tidak valid: Tidak boleh lebih dari 100%');
                      return;
                    }
                    if (discountType === 'FIXED' && discount > subtotal) {
                      alert('Diskon tidak valid: Tidak boleh melebihi subtotal');
                      return;
                    }
                    setAmountPaid('');
                    setShowPaymentModal(true);
                  }}
                  disabled={cart.length === 0 || !manualReason.trim()}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 active:from-orange-700 text-white rounded-xl font-extrabold shadow-md shadow-orange-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 text-xs"
                  title="Bayar dan simpan transaksi susulan"
                >
                  <Printer size={15} />
                  <span>Bayar & Simpan Transaksi Susulan</span>
                </button>
              </div>

              {cart.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Hapus semua item di keranjang?')) {
                      setCart([]);
                    }
                  }}
                  className="py-1 text-[11px] text-red-600 hover:underline transition-colors flex items-center justify-center gap-1 w-full cursor-pointer"
                >
                  <Trash2 size={12} />
                  Kosongkan Keranjang
                </button>
              )}
            </div>

            {/* Cart Items List - Bottom Scrollable Area (SAME AS POS.tsx) */}
            <div className="flex-1 overflow-y-auto space-y-2 py-1 pr-1 touch-scroll min-h-0">
              {cart.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                  <ShoppingBag size={36} className="mb-1.5 opacity-20 text-orange-400" />
                  <p className="text-xs">Keranjang Belanja Kosong</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Pilih produk di katalog sebelah kiri</p>
                </div>
              )}
              {cart.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-200 text-xs shadow-2xs">
                  <div className="flex-1 min-w-0 pr-1">
                    <h5 className="font-bold text-slate-800 text-[11px] truncate">{item.name}</h5>
                    <div className="text-[10px] text-slate-500 font-medium">@{formatIDR(item.finalPrice)} / {item.unit || 'Pcs'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200">
                      <button
                        onClick={() => item.qty > 1 ? updateCartItem(idx, { qty: item.qty - 1 }) : removeFromCart(idx)}
                        className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                      >
                        <Minus size={12} />
                      </button>
                      <label htmlFor={`backdate-qty-${idx}`} className="sr-only">Quantity</label>
                      <input
                        id={`backdate-qty-${idx}`}
                        name={`backdate-qty-${idx}`}
                        type="text"
                        className="text-xs font-extrabold w-8 text-center bg-transparent outline-none p-0"
                        value={item.qty === 0 ? '' : item.qty}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          if (val === '') {
                            updateCartItem(idx, { qty: 0 });
                            return;
                          }
                          let newQty = parseInt(val);
                          updateCartItem(idx, { qty: newQty });
                        }}
                        onBlur={() => {
                          if (item.qty === 0) updateCartItem(idx, { qty: 1 });
                        }}
                      />
                      <button
                        onClick={() => {
                          updateCartItem(idx, { qty: item.qty + 1 });
                        }}
                        className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <span className="text-xs font-extrabold text-slate-800 min-w-[60px] text-right">{formatIDR(item.finalPrice * item.qty)}</span>
                    <button
                      onClick={() => removeFromCart(idx)}
                      className="p-1 hover:bg-red-50 rounded text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                      title="Hapus item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {/* Payment Modal (EXACT SAME AS POS.tsx) */}
      {showPaymentModal && createPortal(
        <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/50 backdrop-blur-xs z-[9999] flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">

            {/* Sisi Kiri: Receipt Preview */}
            <div className="w-full md:w-5/12 bg-slate-50 border-r border-slate-200 p-6 flex flex-col relative overflow-hidden">
              <div className="text-center mb-4 pb-4 border-b border-dashed border-slate-300 shrink-0">
                <h4 className="font-bold text-lg text-slate-800">{storeSettings?.name || 'Toko'}</h4>
                <p className="text-xs text-orange-600 font-bold uppercase tracking-wider">Preview Struk Transaksi Susulan</p>
              </div>

              {/* Audit Badge */}
              <div className="mb-3 p-2 bg-orange-100/70 border border-orange-200 rounded-xl text-[10px] text-orange-800 space-y-0.5 shrink-0">
                <div className="font-bold flex items-center gap-1"><CalendarClock size={11} /> Waktu Tx: {new Date(backdateTime).toLocaleString('id-ID')}</div>
                <div className="truncate"><span className="font-semibold">Alasan:</span> {manualReason}</div>
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
                  <span className="text-orange-600">{formatIDR(totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Sisi Kanan: Input Pembayaran & Numpad */}
            <div className="w-full md:w-7/12 flex flex-col bg-white overflow-hidden max-h-[90vh]">
              {/* Header (Fixed) */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
                <h3 className="text-xl font-bold text-slate-800">Detail Pembayaran Susulan</h3>
                <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4.5 touch-scroll">
                {/* Customer & Phone & Table */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="modalCustomerNameInput" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Pelanggan</label>
                    <input
                      id="modalCustomerNameInput"
                      type="text"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-xs"
                      placeholder="Nama (Opsional)"
                      value={customerName === 'Pelanggan Umum' ? '' : customerName}
                      onChange={(e) => setCustomerName(e.target.value || 'Pelanggan Umum')}
                      disabled={!!selectedCustomerId}
                    />
                  </div>
                  <div>
                    <label htmlFor="modalCustomerPhoneInput" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">No. HP / WA</label>
                    <input
                      id="modalCustomerPhoneInput"
                      type="text"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-xs"
                      placeholder="0812..."
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      disabled={!!selectedCustomerId}
                    />
                  </div>
                  <div>
                    <label htmlFor="modalTableNumberInput" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Meja</label>
                    <input
                      id="modalTableNumberInput"
                      type="text"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-xs"
                      placeholder="Cth: 04"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                    />
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div>
                  <span className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Metode Pembayaran</span>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => {
                        setPaymentMethod(PaymentMethod.CASH);
                        setSelectedBankId('');
                        if (paymentNote === 'BON Pembelian Barang (Hutang)') setPaymentNote('');
                      }}
                      className={`p-3 rounded-xl border-2 text-sm font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${paymentMethod === PaymentMethod.CASH ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-xs' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                      <Banknote size={22} /> TUNAI
                    </button>
                    <button
                      onClick={() => {
                        setPaymentMethod(PaymentMethod.TRANSFER);
                        setAmountPaid(totalAmount.toString());
                        if (paymentNote === 'BON Pembelian Barang (Hutang)') setPaymentNote('');
                      }}
                      className={`p-3 rounded-xl border-2 text-sm font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${paymentMethod === PaymentMethod.TRANSFER ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-xs' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                      <CreditCard size={22} /> TRANSFER
                    </button>
                    <button
                      onClick={() => {
                        if (paymentMethod !== PaymentMethod.TEMPO && paymentMethod !== PaymentMethod.BON) setPaymentNote('BON Pembelian Barang (Hutang)');
                        setPaymentMethod(PaymentMethod.BON);
                        setAmountPaid('0');
                        setSelectedBankId('');
                      }}
                      className={`p-3 rounded-xl border-2 text-sm font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${(paymentMethod === PaymentMethod.TEMPO || paymentMethod === PaymentMethod.BON) ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-xs' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                      <Receipt size={22} /> BON / HUTANG
                    </button>
                  </div>
                </div>

                {/* Bank Selector */}
                {(paymentMethod === PaymentMethod.TRANSFER || paymentMethod === PaymentMethod.TEMPO) && (
                  <div className="animate-fade-in">
                    <label htmlFor="modalBankSelect" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                      {paymentMethod === PaymentMethod.TRANSFER ? 'Rekening / E-Wallet Tujuan' : 'Rekening Tujuan (Jika DP)'}
                    </label>
                    <select
                      id="modalBankSelect"
                      name="modalBankSelect"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all font-medium text-slate-700"
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
                          className="w-full pl-12 pr-4 py-3 text-2xl font-bold text-slate-900 bg-white border-2 border-slate-200 rounded-xl focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                          value={formatNumber(parseFloat(amountPaid || '0'))}
                          placeholder="0"
                        />
                      </div>

                      {/* Quick Cash Buttons */}
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        <button onClick={() => setAmountPaid(totalAmount.toString())} className="py-2 bg-orange-100 text-orange-700 font-bold rounded-lg text-sm hover:bg-orange-200 transition-colors cursor-pointer">Uang Pas</button>
                        <button onClick={() => setAmountPaid((parseInt(amountPaid || '0') + 50000).toString())} className="py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-200 transition-colors cursor-pointer">+50k</button>
                        <button onClick={() => setAmountPaid((parseInt(amountPaid || '0') + 100000).toString())} className="py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-200 transition-colors cursor-pointer">+100k</button>
                        <button onClick={() => setAmountPaid('')} className="py-2 bg-red-100 text-red-600 font-bold rounded-lg text-sm hover:bg-red-200 transition-colors cursor-pointer">Clear</button>
                      </div>
                    </div>

                    {/* Numeric Keypad */}
                    <div className="grid grid-cols-3 gap-2 select-none">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button key={num} onClick={() => setAmountPaid(prev => (prev === '0' || !prev ? num.toString() : prev + num))} className="py-3 text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer">
                          {num}
                        </button>
                      ))}
                      <button onClick={() => setAmountPaid(prev => prev ? prev + '000' : '0')} className="py-3 text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer">000</button>
                      <button onClick={() => setAmountPaid(prev => (prev === '0' || !prev ? '0' : prev + '0'))} className="py-3 text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer">0</button>
                      <button onClick={() => setAmountPaid(prev => prev.slice(0, -1))} className="py-3 text-xl font-bold bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 active:bg-slate-300 transition-colors flex justify-center items-center cursor-pointer">
                        ⌫
                      </button>
                    </div>
                  </div>
                )}

                {/* Notes (Fully visible & clean) */}
                <div className="pt-1">
                  <label htmlFor="modalPaymentNote" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Catatan Transaksi (Opsional)
                  </label>
                  <div className="relative">
                    <StickyNote size={18} className="absolute left-3.5 top-3 text-slate-400" />
                    <input
                      id="modalPaymentNote"
                      type="text"
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-xs sm:text-sm font-medium text-slate-800 placeholder:text-slate-400"
                      placeholder="Tambahkan catatan jika ada..."
                      value={paymentNote}
                      onChange={e => setPaymentNote(e.target.value)}
                    />
                  </div>
                </div>

                {/* Summary / Change */}
                {(paymentMethod === PaymentMethod.CASH) && parseFloat(amountPaid) >= totalAmount && (
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center animate-fade-in">
                    <span className="text-emerald-700 font-bold uppercase tracking-wider text-sm">Kembalian</span>
                    <span className="text-2xl font-black text-emerald-600">{formatIDR(parseFloat(amountPaid) - totalAmount)}</span>
                  </div>
                )}

                {(paymentMethod === PaymentMethod.TEMPO || paymentMethod === PaymentMethod.BON || (paymentMethod === PaymentMethod.CASH && parseFloat(amountPaid) < totalAmount)) && (
                  <div className="p-4 bg-orange-50 rounded-xl border border-orange-200 flex justify-between items-center animate-fade-in">
                    <span className="text-orange-700 font-bold uppercase tracking-wider text-sm">Sisa Hutang BON</span>
                    <span className="text-2xl font-black text-orange-600">{formatIDR(totalAmount - (parseFloat(amountPaid) || 0))}</span>
                  </div>
                )}
              </div>

              {/* Fixed Footer Action */}
              <div className="p-4 sm:p-6 bg-white border-t border-slate-200 flex gap-3 shrink-0 shadow-lg z-20">
                <button onClick={() => setShowPaymentModal(false)} className="px-6 py-3.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors cursor-pointer">Batal</button>
                <button
                  disabled={isSubmitting}
                  onClick={() => {
                    if (paymentMethod === PaymentMethod.TRANSFER) {
                      if (!selectedBankId) {
                        alert("Pilih rekening bank tujuan terlebih dahulu!");
                        return;
                      }
                      setAmountPaid(totalAmount.toString());
                      setShowQrisModal(true);
                    } else {
                      handleCheckout();
                    }
                  }}
                  className="flex-1 py-3.5 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-xl font-bold shadow-xl shadow-orange-500/30 hover:from-orange-700 hover:to-amber-600 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 text-lg cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Menyimpan Transaksi...</>
                  ) : paymentMethod === PaymentMethod.TRANSFER ? (
                    <>Generate QRIS <ScanLine size={22} /></>
                  ) : (
                    <><Printer size={22} /> Bayar & Simpan Susulan</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* QRIS Dedicated Popup Modal */}
      {showQrisModal && paymentMethod === PaymentMethod.TRANSFER && selectedBankId && createPortal(
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
                <p className="text-5xl font-black text-orange-600">{formatIDR(totalAmount)}</p>
              </div>

              <button
                onClick={() => {
                  setShowQrisModal(false);
                  handleCheckout();
                }}
                className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-bold shadow-xl shadow-emerald-500/30 hover:bg-emerald-600 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-3 text-xl cursor-pointer"
              >
                Konfirmasi Sukses <Printer size={28} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Success Modal */}
      {showSuccessModal && createPortal(
        <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/40 backdrop-blur-xs z-[10000] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl flex flex-col items-center animate-scale-in">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
              <CheckCircle size={36} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-1">Transaksi Susulan Sukses!</h3>
            <p className="text-xs text-slate-500 mb-4">Transaksi susulan telah berhasil disimpan & tercatat di sistem Berita Acara.</p>
            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};
