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
} from "firebase/firestore";
import { db } from "../src/lib/firebase";
import {
  BankAccount,
  CashFlow,
  CashFlowType,
  Category,
  Customer,
  PaymentStatus,
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
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, cleanUndefined(v)])
    );
  }
  return obj;
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
  
  await batch.commit();
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

  getTransactions: async (): Promise<Transaction[]> =>
    getCollectionOrdered<Transaction>("transactions", "date", "desc"),
  addTransaction: async (transaction: Transaction) => {
    const txRef = transaction.id
      ? doc(collectionRef("transactions"), transaction.id)
      : doc(collectionRef("transactions"));
    const txData: Transaction = {
      ...transaction,
      id: txRef.id,
      type: transaction.type || TransactionType.SALE,
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
    
    txData.items.forEach((item) => {
      const productRef = doc(collectionRef("products"), item.id);
      const quantity = item.qty || 0;
      const stockDelta = txData.type === TransactionType.RETURN ? quantity : -quantity;
      batch.update(productRef, { stock: increment(stockDelta) });
    });

    await batch.commit();
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

    // 4. Find and delete linked travel agent commissions if any
    try {
      const invoiceNum = txData.invoiceNumber;
      if (invoiceNum) {
        const commQuery = query(collectionRef("travel_booking_commissions"), where("bookingCode", "==", invoiceNum));
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
  saveUser: async (user: User) => saveEntity<User>("users", user),
  updateUser: async (user: User) => saveEntity<User>("users", user),
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
  
  getBeritaAcaraArchives: async (): Promise<any[]> =>
    getCollectionOrdered<any>("berita_acara_archives", "createdAt", "desc"),
  saveBeritaAcaraArchive: async (archive: any) =>
    saveEntity<any>("berita_acara_archives", archive),
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
  getTravelCommissions: async (): Promise<TravelBookingCommission[]> =>
    getCollectionOrdered<TravelBookingCommission>("travel_commissions", "departureDate", "desc"),
  saveTravelCommission: async (commission: TravelBookingCommission) =>
    saveEntity<TravelBookingCommission>("travel_commissions", commission),
  updateTravelCommission: async (commission: TravelBookingCommission) =>
    saveEntity<TravelBookingCommission>("travel_commissions", commission),
  deleteTravelCommission: async (id: string) =>
    deleteDoc(doc(collectionRef("travel_commissions"), id)),
};
