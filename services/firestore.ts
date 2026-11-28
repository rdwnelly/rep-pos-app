import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
  orderBy,
  increment,
  where,
  onSnapshot,
  limit,
  deleteField,
  FieldValue,
  Unsubscribe,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../src/lib/firebase";
import { dayRangeBounds } from "../utils";
import { queueWrite } from "./syncStatus";
import {
  BankAccount,
  CashFlow,
  CashFlowType,
  Category,
  Customer,
  OpenBill,
  PaymentMethod,
  Product,
  Purchase,
  PurchaseType,
  StockAdjustment,
  StoreSettings,
  Supplier,
  Transaction,
  TransactionType,
  User,
  UserRole,
  Division,
  TravelAgent,
  TravelBookingCommission,
  VisitorLog,
} from "../types";

const collectionRef = (name: string) => collection(db, name);

const toEntity = <T>(docSnapshot: any): T =>
  ({ id: docSnapshot.id, ...docSnapshot.data() }) as T;

const getCollection = async <T>(name: string): Promise<T[]> => {
  const snapshot = await getDocs(collectionRef(name));
  return snapshot.docs.map((docSnapshot) => toEntity<T>(docSnapshot));
};

const getCollectionOrdered = async <T>(
  name: string,
  field = "date",
  direction: "asc" | "desc" = "desc",
): Promise<T[]> => {
  const q = query(collectionRef(name), orderBy(field, direction));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnapshot) => toEntity<T>(docSnapshot));
};

const getDocument = async <T>(name: string, id: string): Promise<T | null> => {
  const ref = doc(collectionRef(name), id);
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? toEntity<T>(snapshot) : null;
};

const deleteCollection = async (name: string) => {
  const snapshot = await getDocs(collectionRef(name));
  
  // Firestore batches have a limit of 500 operations
  const chunks = [];
  for (let i = 0; i < snapshot.docs.length; i += 500) {
    chunks.push(snapshot.docs.slice(i, i + 500));
  }
  
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((docSnapshot) => {
      batch.delete(doc(collectionRef(name), docSnapshot.id));
    });
    await batch.commit();
  }
};

const deleteCollectionByDateRange = async (name: string, startDate?: string, endDate?: string) => {
  let q: any = collectionRef(name);
  if (startDate && endDate) {
    q = query(collectionRef(name), where("date", ">=", startDate), where("date", "<=", endDate));
  }
  
  const snapshot = await getDocs(q);
  
  const chunks = [];
  for (let i = 0; i < snapshot.docs.length; i += 500) {
    chunks.push(snapshot.docs.slice(i, i + 500));
  }
  
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((docSnapshot) => {
      batch.delete(doc(collectionRef(name), docSnapshot.id));
    });
    await batch.commit();
  }
};

const cleanUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  } else if (typeof obj === 'object') {
    // instanceof, BUKAN obj.constructor.name: nama kelas hilang saat
    // kode diminifikasi untuk produksi, sehingga sentinel seperti
    // deleteField() akan diperlakukan sebagai objek biasa lalu rusak —
    // bug yang hanya muncul di build produksi, tidak di dev lokal.
    if (obj instanceof FieldValue) return obj;
    if (typeof obj.toMillis === 'function' || ('seconds' in obj && 'nanoseconds' in obj)) return obj;
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, cleanUndefined(v)])
    );
  }
  return obj;
};

/**
 * Hapus password dari dokumen user — bukan sekadar tidak mengirimnya.
 *
 * saveEntity menulis dengan `merge: true`, jadi field yang sudah ada di
 * dokumen TETAP bertahan meski tidak ikut dikirim. Aturan Firestore
 * untuk koleksi users menolak penyimpanan bila hasil akhirnya masih
 * memuat `password`:
 *
 *     allow write: if ... && !('password' in request.resource.data);
 *
 * Akun yang dibuat SEBELUM aturan itu ada masih menyimpan password di
 * dokumennya. Saat diedit, password lama ikut bertahan lewat merge,
 * aturan menolaknya, dan muncul "Gagal menyimpan user: Missing or
 * insufficient permissions" — sementara membuat user BARU tetap
 * berhasil karena dokumennya memang tidak punya field itu.
 *
 * deleteField() membuat hasil akhirnya benar-benar tanpa password,
 * sekaligus membersihkan kredensial yang masih tertinggal di dokumen
 * lama. Password sepenuhnya urusan Firebase Auth.
 */
const stripStoredPassword = (user: User): User => {
  const { password: _ignored, ...rest } = user as User & { password?: unknown };
  return { ...rest, password: deleteField() } as unknown as User;
};

const saveEntity = async <T extends { id?: string }>(
  name: string,
  entity: T,
) => {
  const ref = entity.id
    ? doc(collectionRef(name), entity.id)
    : doc(collectionRef(name));
  await setDoc(ref, cleanUndefined({ ...entity, id: ref.id }), { merge: true });
};

const saveEntityBulk = async <T extends { id?: string }>(
  name: string,
  entities: T[],
) => {
  const batch = writeBatch(db);
  entities.forEach((entity) => {
    const ref = entity.id
      ? doc(collectionRef(name), entity.id)
      : doc(collectionRef(name));
    batch.set(ref, cleanUndefined({ ...entity, id: ref.id }), { merge: true });
  });
  await batch.commit();
};

/**
 * ── Query berbatas, pengganti pembacaan koleksi penuh ────────────────
 *
 * getCollection() mengunduh SELURUH koleksi lalu memfilter di memori,
 * sehingga biaya dan waktu muat naik seiring umur data. Query di bawah
 * membatasi di sisi server.
 *
 * Dua hal yang harus dipatuhi:
 *
 * 1. Field `date` wajib berformat kanonik "YYYY-MM-DD HH:mm:ss" (lihat
 *    toCanonicalDate di utils.ts). Firestore membandingkan string mentah,
 *    jadi data berformat campur membuat hasil query salah tanpa error.
 *    Jalankan scripts/normalize-dates.mjs sebelum mengandalkan ini.
 *
 * 2. Firestore Rules BUKAN filter: query yang berpotensi mengembalikan
 *    dokumen tak boleh dibaca ditolak seluruhnya. Rules membatasi kasir
 *    dan gudang hanya ke transaksi miliknya, jadi query mereka WAJIB
 *    menyertakan where('cashierId','==',uid) — dan karena menggabungkan
 *    kesetaraan itu dengan orderBy/filter lain menuntut composite index
 *    yang harus dibuat dulu di server, seluruh query transaksi lewat
 *    satu pintu: queryTransactions() di bawah.
 */

/**
 * Satu pintu untuk seluruh query transaksi.
 *
 * Sebelumnya di sini ada penyempitan otomatis: peran non-admin hanya
 * dikirimi where('cashierId','==',uid), karena rules membatasi baca
 * per-dokumen. Penyempitan itu DIHAPUS, dan rules-nya yang dilonggarkan
 * (lihat firestore.rules pada match /transactions), dengan dua alasan:
 *
 * 1. Berita Acara Tutup Buku dan Laporan Setoran Sesi memang merekap
 *    penjualan seluruh toko. Dengan penyempitan itu, rekapitulasi
 *    keuangan, pemasukan tunai/non-tunai, piutang, pengeluaran, dan
 *    laba bersih tampil kosong bagi peran selain admin.
 *
 * 2. Keputusan izin tidak boleh bergantung pada sisi klien sama
 *    sekali. Peran dulu dibaca dari salinan di localStorage, yang
 *    ditulis AuthContext pada onAuthStateChanged — sementara useData
 *    memulai fetch-nya pada event yang sama. Urutannya tidak dijamin,
 *    jadi query pertama bisa berjalan saat salinan itu masih kosong
 *    lalu ditolak server, dan layarnya diam-diam tampil kosong.
 *    Salinan itu kini sudah dihapus; yang menentukan izin tetap
 *    firestore.rules lewat custom claim pada ID token.
 *
 * Yang tetap berlaku: field `date` wajib berformat kanonik
 * "YYYY-MM-DD HH:mm:ss" (lihat toCanonicalDate di utils.ts), karena
 * Firestore membandingkan string mentah — data berformat campur
 * membuat hasil query salah tanpa memunculkan error sama sekali.
 */
const queryTransactions = async (
  filters: QueryConstraint[] = [],
): Promise<Transaction[]> =>
  runQuery<Transaction>("transactions", [...filters, orderBy("date", "desc")]);

const runQuery = async <T>(name: string, constraints: QueryConstraint[]): Promise<T[]> => {
  const snapshot = await getDocs(query(collectionRef(name), ...constraints));
  return snapshot.docs.map((docSnapshot) => toEntity<T>(docSnapshot));
};

const adjustStock = async (productId: string, quantityDelta: number) => {
  const ref = doc(collectionRef("products"), productId);
  await updateDoc(ref, { stock: increment(quantityDelta) });
};

const applyTransactionStock = async (
  transaction: Transaction,
  multiplier: number,
) => {
  const batch = writeBatch(db);
  const txRef = transaction.id
    ? doc(collectionRef("transactions"), transaction.id)
    : doc(collectionRef("transactions"));
  const savedTx = {
    ...transaction,
    id: txRef.id,
    type: transaction.type || TransactionType.SALE,
  };
  batch.set(txRef, cleanUndefined(savedTx), { merge: true });

  transaction.items.forEach((item) => {
    const productRef = doc(collectionRef("products"), item.id);
    const quantity = item.qty || 0;
    const change =
      transaction.type === TransactionType.RETURN
        ? quantity * -1 * multiplier
        : quantity * multiplier;
    batch.update(productRef, { stock: increment(-change) });
  });

  await queueWrite(batch.commit(), `Transaksi ${savedTx.invoiceNumber || savedTx.id}`);
};

export const FirestoreService = {
  getStoreSettings: async (): Promise<StoreSettings> => {
    const defaultSettings: StoreSettings = {
      name: "Kasir REP",
      jargon: "",
      address: "",
      phone: "",
      bankAccount: "",
      footerMessage: "",
      notes: "",
      showAddress: true,
      showJargon: true,
      showBank: true,
      printerType: "58mm",
      autoSyncMySQL: false,
      useMySQLPrimary: false,
    };

    const settings = await getDocument<StoreSettings>(
      "store_settings",
      "settings",
    );
    return settings ? { ...defaultSettings, ...settings } : defaultSettings;
  },

  saveStoreSettings: async (settings: StoreSettings) => {
    const ref = doc(collectionRef("store_settings"), "settings");
    await setDoc(ref, { ...settings, id: "settings" }, { merge: true });
  },

  /**
   * Open bill (pesanan meja yang belum dibayar).
   *
   * Dulu hanya ada di localStorage perangkat yang membukanya, sehingga
   * pesanan meja hilang begitu kasir berpindah HP atau cache dibersihkan
   * — dan tidak ada kasir lain yang bisa melanjutkan pesanan itu.
   * Aturannya (match /open_bills) sudah lama ada di firestore.rules,
   * hanya belum pernah dipakai.
   *
   * Firestore menyimpan tulisannya ke IndexedDB lebih dulu, jadi
   * membuka bill tetap jalan saat internet mati.
   */
  getOpenBills: async (): Promise<OpenBill[]> =>
    getCollectionOrdered<OpenBill>("open_bills", "createdAt", "desc"),

  /**
   * Tulisan open bill dibungkus queueWrite, bukan `await setDoc` biasa.
   *
   * Saat perangkat offline, promise setDoc TIDAK resolve sampai server
   * mengakui — jadi `await` di tombol "Simpan Open Bill" akan
   * menggantung selamanya. Dulu open bill ada di localStorage dan
   * tersimpan seketika; tanpa pembungkus ini, memindahkannya ke
   * Firestore justru membuat kasir tidak bisa menyimpan pesanan meja
   * saat internet mati — persis saat fitur itu paling dibutuhkan.
   */
  saveOpenBill: async (bill: OpenBill) =>
    queueWrite(
      saveEntity<OpenBill>("open_bills", bill),
      `Open bill ${bill.billNumber || bill.id}`,
    ),

  saveOpenBillsBulk: async (bills: OpenBill[]) =>
    queueWrite(
      saveEntityBulk<OpenBill>("open_bills", bills),
      `Pemindahan ${bills.length} open bill`,
    ),

  deleteOpenBill: async (id: string) =>
    queueWrite(deleteDoc(doc(collectionRef("open_bills"), id)), `Tutup open bill ${id}`),

  /**
   * Daftar akun biaya Berita Acara.
   *
   * Disimpan sebagai SATU dokumen berisi array, bukan satu dokumen per
   * akun, karena urutannya bermakna: nomor di depan tiap akun ("1) ",
   * "2) ") ikut tercetak di dokumen setoran. Koleksi biasa tidak
   * menjamin urutan tanpa menambah field sortOrder yang harus dijaga
   * sendiri.
   *
   * Sebelumnya daftar ini ada di localStorage, jadi tiap HP karyawan
   * punya akun biaya yang berbeda-beda — dan rekap yang dikirim ke
   * SIK-REP jadi tidak bisa dibandingkan antarperangkat.
   */
  getExpenseAccounts: async (): Promise<string[]> => {
    const doc = await getDocument<{ options?: unknown }>("expense_accounts", "default");
    const options = doc?.options;
    return Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : [];
  },

  saveExpenseAccounts: async (options: string[]) => {
    const ref = doc(collectionRef("expense_accounts"), "default");
    // Sama seperti open bill: menambah akun biaya saat internet mati
    // tidak boleh menggantungkan layar Berita Acara.
    await queueWrite(
      setDoc(
        ref,
        { id: "default", options, updatedAt: new Date().toISOString() },
        { merge: true },
      ),
      "Daftar akun biaya",
    );
  },

  getBanks: async (): Promise<BankAccount[]> =>
    getCollection<BankAccount>("banks"),
  saveBank: async (bank: BankAccount) => saveEntity<BankAccount>("banks", bank),
  updateBank: async (bank: BankAccount) =>
    saveEntity<BankAccount>("banks", bank),
  deleteBank: async (id: string) => deleteDoc(doc(collectionRef("banks"), id)),

  getCategories: async (): Promise<Category[]> =>
    getCollection<Category>("categories"),
  saveCategory: async (category: Category) =>
    saveEntity<Category>("categories", category),
  updateCategory: async (category: Category) =>
    saveEntity<Category>("categories", category),
  deleteCategory: async (id: string) =>
    deleteDoc(doc(collectionRef("categories"), id)),

  getProducts: async (): Promise<Product[]> =>
    getCollection<Product>("products"),
  saveProduct: async (product: Product) =>
    saveEntity<Product>("products", product),
  updateProduct: async (product: Product) =>
    saveEntity<Product>("products", product),
  deleteProduct: async (id: string) =>
    deleteDoc(doc(collectionRef("products"), id)),
  saveProductsBulk: async (newProducts: Product[]) =>
    saveEntityBulk<Product>("products", newProducts),

  getCustomers: async (): Promise<Customer[]> =>
    getCollection<Customer>("customers"),
  saveCustomer: async (cust: Customer) =>
    saveEntity<Customer>("customers", cust),
  updateCustomer: async (cust: Customer) =>
    saveEntity<Customer>("customers", cust),
  deleteCustomer: async (id: string) =>
    deleteDoc(doc(collectionRef("customers"), id)),
  saveCustomersBulk: async (newCustomers: Customer[]) =>
    saveEntityBulk<Customer>("customers", newCustomers),

  getSuppliers: async (): Promise<Supplier[]> =>
    getCollection<Supplier>("suppliers"),
  saveSupplier: async (sup: Supplier) => saveEntity<Supplier>("suppliers", sup),
  updateSupplier: async (sup: Supplier) =>
    saveEntity<Supplier>("suppliers", sup),
  deleteSupplier: async (id: string) =>
    deleteDoc(doc(collectionRef("suppliers"), id)),
  saveSuppliersBulk: async (newSuppliers: Supplier[]) =>
    saveEntityBulk<Supplier>("suppliers", newSuppliers),

  /**
   * Riwayat transaksi pada rentang hari (inklusif kedua ujung).
   * Dipakai Dashboard, Laporan Bulanan, Barang Terjual, dan tab riwayat.
   */
  getTransactionsByDateRange: async (
    startDay: string,
    endDay: string,
  ): Promise<Transaction[]> => {
    const { start, end } = dayRangeBounds(startDay, endDay);
    return queryTransactions([where("date", ">=", start), where("date", "<=", end)]);
  },

  /**
   * Piutang: transaksi yang belum lunas, TANPA batas tanggal.
   *
   * Sengaja tidak dibatasi rentang: utang pelanggan dari tahun lalu tetap
   * harus tampil. Membatasi tanggal di sini akan menghilangkan piutang
   * lama dari daftar tanpa error apa pun — justru kebalikan dari tujuan.
   * Yang membatasi di sini adalah statusnya, bukan waktunya.
   */
  getOutstandingTransactions: async (): Promise<Transaction[]> =>
    queryTransactions([where("paymentStatus", "in", ["SEBAGIAN", "BELUM_LUNAS"])]),

  /** Riwayat satu pelanggan, tanpa mengunduh transaksi pelanggan lain. */
  getTransactionsByCustomer: async (customerId: string): Promise<Transaction[]> =>
    queryTransactions([where("customerId", "==", customerId)]),

  getCashFlowByDateRange: async (
    startDay: string,
    endDay: string,
  ): Promise<CashFlow[]> => {
    const { start, end } = dayRangeBounds(startDay, endDay);
    return runQuery<CashFlow>("cashflow", [
      where("date", ">=", start),
      where("date", "<=", end),
      orderBy("date", "desc"),
    ]);
  },

  getPurchasesByDateRange: async (
    startDay: string,
    endDay: string,
  ): Promise<Purchase[]> => {
    const { start, end } = dayRangeBounds(startDay, endDay);
    return runQuery<Purchase>("purchases", [
      where("date", ">=", start),
      where("date", "<=", end),
      orderBy("date", "desc"),
    ]);
  },

  /** Utang ke supplier, tanpa batas tanggal — alasan sama seperti piutang. */
  getOutstandingPurchases: async (): Promise<Purchase[]> =>
    runQuery<Purchase>("purchases", [
      where("paymentStatus", "in", ["SEBAGIAN", "BELUM_LUNAS"]),
      orderBy("date", "desc"),
    ]),

  /**
   * Seluruh transaksi, diurutkan terbaru lebih dulu. Dipakai layar yang
   * memang merekap keseluruhan: Berita Acara, Laporan Bulanan, Riwayat
   * & Utang, Riwayat Pelanggan, Barang Terjual, Riwayat Transfer/Retur.
   */
  getTransactions: async (): Promise<Transaction[]> => queryTransactions(),
  addTransaction: async (transaction: Transaction) => {
    const txRef = transaction.id
      ? doc(collectionRef("transactions"), transaction.id)
      : doc(collectionRef("transactions"));
    const txData: Transaction = {
      ...transaction,
      id: txRef.id,
      type: transaction.type || TransactionType.SALE,
      createdAt: transaction.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: Array.isArray(transaction.items) ? transaction.items : [],
      paymentHistory:
        transaction.paymentHistory ??
        (transaction.amountPaid > 0
          ? [
              {
                date: transaction.date,
                amount: transaction.amountPaid,
                method: transaction.paymentMethod,
                bankId: transaction.bankId,
                bankName: transaction.bankName,
                note: transaction.paymentNote || "Pembayaran awal",
              },
            ]
          : []),
    };
    const batch = writeBatch(db);
    batch.set(txRef, cleanUndefined(txData), { merge: true });
    
    if (Array.isArray(txData.items)) {
      txData.items.forEach((item) => {
        if (item && item.id) {
          const productRef = doc(collectionRef("products"), item.id);
          const quantity = Number(item.qty) || 0;
          if (quantity !== 0) {
            const stockDelta = txData.type === TransactionType.RETURN ? quantity : -quantity;
            batch.set(productRef, { stock: increment(stockDelta) }, { merge: true });
          }
        }
      });
    }

    // Jangan menunggu ack server: offline, commit() tidak pernah resolve
    // dan kasir menggantung tanpa struk. Tulisannya sudah aman di
    // IndexedDB dan akan terkirim sendiri saat jaringan kembali.
    await queueWrite(
      batch.commit(),
      `Transaksi ${txData.invoiceNumber || txData.id}`
    );
    return txData;
  },
  updateTransaction: async (transaction: Transaction) =>
    saveEntity<Transaction>("transactions", transaction),
  deleteTransaction: async (id: string) => {
    const txRef = doc(collectionRef("transactions"), id);
    const txSnap = await getDoc(txRef);
    if (!txSnap.exists()) return;

    const txData = txSnap.data() as Transaction;
    const batch = writeBatch(db);

    // 1. Revert Stock for each item in the main transaction
    if (Array.isArray(txData.items)) {
      txData.items.forEach((item) => {
        if (item && item.id) {
          const productRef = doc(collectionRef("products"), item.id);
          const quantity = Number(item.qty) || 0;
          // Normal sale decremented stock (-qty), so deleting sale INCREMENTS stock back (+qty)
          // Return transaction incremented stock (+qty), so deleting return DECREMENTS stock back (-qty)
          const stockDelta = txData.type === TransactionType.RETURN ? -quantity : quantity;
          batch.update(productRef, { stock: increment(stockDelta) });
        }
      });
    }

    // 2. Find and revert any child return transactions linked to this transaction
    try {
      const returnQuery = query(collectionRef("transactions"), where("originalTransactionId", "==", id));
      const returnSnap = await getDocs(returnQuery);
      returnSnap.docs.forEach((retDoc) => {
        const retData = retDoc.data() as Transaction;
        if (Array.isArray(retData.items)) {
          retData.items.forEach((item) => {
            if (item && item.id) {
              const productRef = doc(collectionRef("products"), item.id);
              const quantity = Number(item.qty) || 0;
              batch.update(productRef, { stock: increment(-quantity) });
            }
          });
        }
        batch.delete(retDoc.ref);
      });
    } catch (e) {
      console.warn("Could not query child return transactions:", e);
    }

    // 3. Find and delete linked Cash Flow entries (Pendapatan Kas Masuk / Pelunasan)
    try {
      const cfQuery = query(collectionRef("cashflow"), where("referenceId", "==", id));
      const cfSnap = await getDocs(cfQuery);
      cfSnap.docs.forEach((cfDoc) => {
        batch.delete(cfDoc.ref);
      });
    } catch (e) {
      console.warn("Could not query linked cash flows by referenceId:", e);
    }

    // 4. Hapus komisi agen travel yang menempel pada transaksi ini.
    //
    // Koleksinya "travel_commissions" — sama dengan yang ditulis
    // addTravelCommission dan checkout beragen di POS. Sebelumnya baris
    // ini menanyakan "travel_booking_commissions", koleksi yang tidak
    // pernah ada dan tidak punya aturan di firestore.rules, jadi
    // kuerinya ditolak lalu ditelan catch di bawah. Akibatnya setiap
    // transaksi beragen yang dihapus meninggalkan komisi yatim yang
    // tetap ikut terhitung di Laporan Komisi Agen, tanpa satu pun
    // tanda di layar.
    try {
      const invoiceNum = txData.invoiceNumber;
      if (invoiceNum) {
        const commQuery = query(collectionRef("travel_commissions"), where("bookingCode", "==", invoiceNum));
        const commSnap = await getDocs(commQuery);
        commSnap.docs.forEach((commDoc) => {
          batch.delete(commDoc.ref);
        });
      }
    } catch (e) {
      console.warn("Could not query linked travel agent commissions:", e);
    }

    // 5. Delete the main transaction document
    batch.delete(txRef);
    await batch.commit();
  },

  getPurchases: async (): Promise<Purchase[]> =>
    getCollectionOrdered<Purchase>("purchases", "date", "desc"),
  addPurchase: async (purchase: Purchase) => {
    const purRef = purchase.id
      ? doc(collectionRef("purchases"), purchase.id)
      : doc(collectionRef("purchases"));
    const purData: Purchase = {
      ...purchase,
      id: purRef.id,
      type: purchase.type || PurchaseType.PURCHASE,
    };
    const batch = writeBatch(db);
    batch.set(purRef, cleanUndefined(purData), { merge: true });
    
    (purData.items || []).forEach((item) => {
      const productRef = doc(collectionRef("products"), item.id);
      const quantity = item.qty || 0;
      const stockDelta = purData.type === PurchaseType.RETURN ? -quantity : quantity;
      batch.update(productRef, { stock: increment(stockDelta) });
    });

    await batch.commit();
  },
  updatePurchase: async (purchase: Purchase) =>
    saveEntity<Purchase>("purchases", purchase),
  deletePurchase: async (id: string) => {
    const purRef = doc(collectionRef("purchases"), id);
    const purSnap = await getDoc(purRef);
    if (!purSnap.exists()) return;

    const purData = purSnap.data() as Purchase;
    const batch = writeBatch(db);

    // Revert Stock for purchase (Purchase increased stock (+qty), deleting purchase DECREMENTS stock (-qty))
    if (Array.isArray(purData.items)) {
      purData.items.forEach((item) => {
        if (item && item.id) {
          const productRef = doc(collectionRef("products"), item.id);
          const quantity = Number(item.qty) || 0;
          const stockDelta = purData.type === PurchaseType.RETURN ? quantity : -quantity;
          batch.update(productRef, { stock: increment(stockDelta) });
        }
      });
    }

    // Delete linked Cash Flow entries for purchase
    try {
      const cfQuery = query(collectionRef("cashflow"), where("referenceId", "==", id));
      const cfSnap = await getDocs(cfQuery);
      cfSnap.docs.forEach((cfDoc) => {
        batch.delete(cfDoc.ref);
      });
    } catch (e) {
      console.warn("Could not query linked cash flows for purchase:", e);
    }

    batch.delete(purRef);
    await batch.commit();
  },

  getCashFlow: async (): Promise<CashFlow[]> =>
    getCollectionOrdered<CashFlow>("cashflow", "date", "desc"),
  addCashFlow: async (cf: CashFlow) => saveEntity<CashFlow>("cashflow", cf),
  deleteCashFlow: async (id: string) =>
    deleteDoc(doc(collectionRef("cashflow"), id)),

  getStockAdjustments: async (): Promise<StockAdjustment[]> =>
    getCollectionOrdered<StockAdjustment>("stock_adjustments", "date", "desc"),
  addStockAdjustment: async (adjustment: StockAdjustment) => {
    const batch = writeBatch(db);
    const ref = adjustment.id
      ? doc(collectionRef("stock_adjustments"), adjustment.id)
      : doc(collectionRef("stock_adjustments"));
    const adjustmentData = { ...adjustment, id: ref.id };
    
    batch.set(ref, cleanUndefined(adjustmentData), { merge: true });
    
    const productRef = doc(collectionRef("products"), adjustment.productId);
    const delta = adjustment.type === "INCREASE" ? adjustment.qty : -adjustment.qty;
    batch.update(productRef, { stock: increment(delta) });
    
    await batch.commit();
  },
  deleteStockAdjustment: async (adjustment: StockAdjustment) => {
    const batch = writeBatch(db);
    const ref = doc(collectionRef("stock_adjustments"), adjustment.id);
    batch.delete(ref);

    const productRef = doc(collectionRef("products"), adjustment.productId);
    const delta = adjustment.type === "INCREASE" ? -adjustment.qty : adjustment.qty;
    batch.update(productRef, { stock: increment(delta) });

    await batch.commit();
  },

  getUsers: async (): Promise<User[]> => getCollection<User>("users"),
  saveUser: async (user: User) => saveEntity<User>("users", stripStoredPassword(user)),
  updateUser: async (user: User) => saveEntity<User>("users", stripStoredPassword(user)),
  deleteUser: async (id: string) => deleteDoc(doc(collectionRef("users"), id)),

  // Divisions
  getDivisions: async (): Promise<Division[]> => getCollection<Division>("divisions"),
  saveDivision: async (division: Division) => saveEntity<Division>("divisions", division),
  deleteDivision: async (id: string) => deleteDoc(doc(collectionRef("divisions"), id)),

  resetProducts: async () => deleteCollection("products"),
  resetTransactions: async (startDate?: string, endDate?: string) => deleteCollectionByDateRange("transactions", startDate, endDate),
  resetPurchases: async (startDate?: string, endDate?: string) => deleteCollectionByDateRange("purchases", startDate, endDate),
  resetCashFlow: async (startDate?: string, endDate?: string) => deleteCollectionByDateRange("cashflow", startDate, endDate),
  resetStockAdjustments: async (startDate?: string, endDate?: string) => deleteCollectionByDateRange("stock_adjustments", startDate, endDate),
  resetAllFinancialData: async (startDate?: string, endDate?: string) => {
    await Promise.all([
      deleteCollectionByDateRange("transactions", startDate, endDate),
      deleteCollectionByDateRange("purchases", startDate, endDate),
      deleteCollectionByDateRange("cashflow", startDate, endDate),
      deleteCollectionByDateRange("stock_adjustments", startDate, endDate),
    ]);
  },
  resetMasterData: async () => {
    await Promise.all([
      deleteCollection("products"),
      deleteCollection("categories"),
      deleteCollection("customers"),
      deleteCollection("suppliers"),
    ]);
  },
  resetAllData: async () => {
    await Promise.all([
      deleteCollection("products"),
      deleteCollection("categories"),
      deleteCollection("customers"),
      deleteCollection("suppliers"),
      deleteCollection("transactions"),
      deleteCollection("purchases"),
      deleteCollection("cashflow"),
      deleteCollection("stock_adjustments"),
      deleteCollection("banks"),
      deleteCollection("users"),
      deleteCollection("store_settings"),
      deleteCollection("berita_acara_archives"),
    ]);
  },
  
  getBeritaAcaraArchives: async (): Promise<any[]> => {
    try {
      const list = await getCollection<any>("berita_acara_archives");
      return list.sort((a, b) => {
        const timeA = new Date(a.date || a.createdAt || 0).getTime() || Number(a.createdAt) || 0;
        const timeB = new Date(b.date || b.createdAt || 0).getTime() || Number(b.createdAt) || 0;
        return timeB - timeA;
      });
    } catch (e) {
      console.warn("Error fetching berita acara archives:", e);
      return [];
    }
  },
  getBeritaAcaraByDate: async (date: string): Promise<any | null> => {
    if (!date) return null;
    try {
      const docId = `ba_${date}`;
      const directDoc = await getDocument<any>("berita_acara_archives", docId);
      if (directDoc && (directDoc.date === date || directDoc.customExpenses?.length > 0)) {
        return directDoc;
      }
      const all = await getCollection<any>("berita_acara_archives");
      const matched = all.filter((a) => {
        if (!a) return false;
        if (a.date === date) return true;
        if (a.id === docId) return true;
        if (typeof a.date === 'string' && a.date.slice(0, 10) === date) return true;
        return false;
      });
      if (matched.length > 0) {
        // Return the one with the latest updatedAt or with customExpenses
        matched.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
        return matched[0];
      }
      return directDoc || null;
    } catch (e) {
      console.warn("Error in getBeritaAcaraByDate:", e);
      return null;
    }
  },
  saveBeritaAcaraArchive: async (archive: any) => {
    const docId = archive.id || `ba_${archive.date}`;
    return saveEntity<any>("berita_acara_archives", {
      ...archive,
      id: docId,
      updatedAt: archive.updatedAt || Date.now(),
    });
  },
  subscribeBeritaAcaraByDate: (date: string, callback: (data: any) => void): Unsubscribe => {
    if (!date) {
      return (() => {}) as Unsubscribe;
    }
    const docId = `ba_${date}`;
    const docRef = doc(collectionRef("berita_acara_archives"), docId);
    
    // Listen to direct docRef
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(toEntity<any>(snapshot));
      } else {
        // Fallback check query by date field
        const q = query(collectionRef("berita_acara_archives"), where("date", "==", date));
        getDocs(q).then((qSnap) => {
          if (!qSnap.empty) {
            const list = qSnap.docs.map(d => toEntity<any>(d));
            list.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
            callback(list[0]);
          } else {
            callback(null);
          }
        }).catch(() => callback(null));
      }
    }, (error) => {
      console.warn("Error in subscribeBeritaAcaraByDate:", error);
    });
  },
  deleteBeritaAcaraArchive: async (id: string) =>
    deleteDoc(doc(collectionRef("berita_acara_archives"), id)),

  // Travel Agents
  getTravelAgents: async (): Promise<TravelAgent[]> =>
    getCollection<TravelAgent>("travel_agents"),
  saveTravelAgent: async (agent: TravelAgent) =>
    saveEntity<TravelAgent>("travel_agents", agent),
  updateTravelAgent: async (agent: TravelAgent) =>
    saveEntity<TravelAgent>("travel_agents", agent),
  deleteTravelAgent: async (id: string) =>
    deleteDoc(doc(collectionRef("travel_agents"), id)),

  // Travel Commissions
  // ── Data Pengunjung Wisatawan ───────────────────────────────
  getVisitorLogs: async (): Promise<VisitorLog[]> =>
    getCollectionOrdered<VisitorLog>("visitor_logs", "date", "desc"),

  /**
   * Kunjungan pada rentang hari tertentu. Dipakai layar Data
   * Pengunjung dan rekap bulanan, agar tidak mengunduh seluruh
   * riwayat kunjungan setiap kali laporan dibuka.
   */
  getVisitorLogsByDateRange: async (
    startDay: string,
    endDay: string,
  ): Promise<VisitorLog[]> => {
    const { start, end } = dayRangeBounds(startDay, endDay);
    return runQuery<VisitorLog>("visitor_logs", [
      where("date", ">=", start),
      where("date", "<=", end),
      orderBy("date", "desc"),
    ]);
  },

  saveVisitorLog: async (log: VisitorLog) =>
    saveEntity<VisitorLog>("visitor_logs", log),
  updateVisitorLog: async (log: VisitorLog) =>
    saveEntity<VisitorLog>("visitor_logs", log),
  deleteVisitorLog: async (id: string) =>
    deleteDoc(doc(collectionRef("visitor_logs"), id)),

  getTravelCommissions: async (): Promise<TravelBookingCommission[]> =>
    getCollectionOrdered<TravelBookingCommission>("travel_commissions", "departureDate", "desc"),
  saveTravelCommission: async (commission: TravelBookingCommission) =>
    // Dipicu dari layar kasir setelah struk tercetak, jadi tidak boleh
    // memblokir reset keranjang saat offline.
    queueWrite(
      saveEntity<TravelBookingCommission>("travel_commissions", commission),
      `Komisi agen ${commission.bookingCode || commission.id}`
    ),
  updateTravelCommission: async (commission: TravelBookingCommission) =>
    saveEntity<TravelBookingCommission>("travel_commissions", commission),
  deleteTravelCommission: async (id: string) =>
    deleteDoc(doc(collectionRef("travel_commissions"), id)),
};
