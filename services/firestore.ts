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
  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnapshot) => {
    batch.delete(doc(collectionRef(name), docSnapshot.id));
  });
  await batch.commit();
};

const saveEntity = async <T extends { id?: string }>(
  name: string,
  entity: T,
) => {
  const ref = entity.id
    ? doc(collectionRef(name), entity.id)
    : doc(collectionRef(name));
  await setDoc(ref, { ...entity, id: ref.id }, { merge: true });
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
    batch.set(ref, { ...entity, id: ref.id }, { merge: true });
  });
  await batch.commit();
};

const adjustStock = async (productId: string, quantityDelta: number) => {
  await runTransaction(db, async (tx) => {
    const ref = doc(collectionRef("products"), productId);
    const productSnapshot = await tx.get(ref);
    if (!productSnapshot.exists()) return;

    const productData = productSnapshot.data() as Product;
    const currentStock =
      typeof productData.stock === "number"
        ? productData.stock
        : parseFloat(String(productData.stock)) || 0;
    await tx.update(ref, { stock: currentStock + quantityDelta });
  });
};

const applyTransactionStock = async (
  transaction: Transaction,
  multiplier: number,
) => {
  await runTransaction(db, async (tx) => {
    const txRef = transaction.id
      ? doc(collectionRef("transactions"), transaction.id)
      : doc(collectionRef("transactions"));
    const savedTx = {
      ...transaction,
      id: txRef.id,
      type: transaction.type || TransactionType.SALE,
    };
    tx.set(txRef, savedTx, { merge: true });

    for (const item of transaction.items) {
      const productRef = doc(collectionRef("products"), item.id);
      const productSnapshot = await tx.get(productRef);
      if (!productSnapshot.exists()) continue;

      const productData = productSnapshot.data() as Product;
      const currentStock =
        typeof productData.stock === "number"
          ? productData.stock
          : parseFloat(String(productData.stock)) || 0;
      const quantity = item.qty || 0;
      const change =
        transaction.type === TransactionType.RETURN
          ? quantity * -1 * multiplier
          : quantity * multiplier;
      await tx.update(productRef, { stock: currentStock - change });
    }
  });
};

export const FirestoreService = {
  getStoreSettings: async (): Promise<StoreSettings> => {
    const defaultSettings: StoreSettings = {
      name: "Cemilan KasirPOS Nusantara",
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
    await runTransaction(db, async (tx) => {
      tx.set(txRef, txData, { merge: true });
      for (const item of txData.items) {
        const productRef = doc(collectionRef("products"), item.id);
        const productSnapshot = await tx.get(productRef);
        if (!productSnapshot.exists()) continue;
        const productData = productSnapshot.data() as Product;
        const currentStock =
          typeof productData.stock === "number"
            ? productData.stock
            : parseFloat(String(productData.stock)) || 0;
        const quantity = item.qty || 0;
        const stockDelta =
          txData.type === TransactionType.RETURN ? quantity : -quantity;
        await tx.update(productRef, { stock: currentStock + stockDelta });
      }
    });
    return txData;
  },
  updateTransaction: async (transaction: Transaction) =>
    saveEntity<Transaction>("transactions", transaction),
  deleteTransaction: async (id: string) =>
    deleteDoc(doc(collectionRef("transactions"), id)),

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
    await runTransaction(db, async (tx) => {
      tx.set(purRef, purData, { merge: true });
      for (const item of purData.items || []) {
        const productRef = doc(collectionRef("products"), item.id);
        const productSnapshot = await tx.get(productRef);
        if (!productSnapshot.exists()) continue;
        const productData = productSnapshot.data() as Product;
        const currentStock =
          typeof productData.stock === "number"
            ? productData.stock
            : parseFloat(String(productData.stock)) || 0;
        const quantity = item.qty || 0;
        const stockDelta =
          purData.type === PurchaseType.RETURN ? -quantity : quantity;
        await tx.update(productRef, { stock: currentStock + stockDelta });
      }
    });
  },
  updatePurchase: async (purchase: Purchase) =>
    saveEntity<Purchase>("purchases", purchase),
  deletePurchase: async (id: string) =>
    deleteDoc(doc(collectionRef("purchases"), id)),

  getCashFlow: async (): Promise<CashFlow[]> =>
    getCollectionOrdered<CashFlow>("cashflow", "date", "desc"),
  addCashFlow: async (cf: CashFlow) => saveEntity<CashFlow>("cashflow", cf),
  deleteCashFlow: async (id: string) =>
    deleteDoc(doc(collectionRef("cashflow"), id)),

  getStockAdjustments: async (): Promise<StockAdjustment[]> =>
    getCollectionOrdered<StockAdjustment>("stock_adjustments", "date", "desc"),
  addStockAdjustment: async (adjustment: StockAdjustment) => {
    await runTransaction(db, async (tx) => {
      const ref = adjustment.id
        ? doc(collectionRef("stock_adjustments"), adjustment.id)
        : doc(collectionRef("stock_adjustments"));
      const adjustmentData = { ...adjustment, id: ref.id };
      tx.set(ref, adjustmentData, { merge: true });
      const productRef = doc(collectionRef("products"), adjustment.productId);
      const productSnapshot = await tx.get(productRef);
      if (!productSnapshot.exists()) return;
      const productData = productSnapshot.data() as Product;
      const currentStock =
        typeof productData.stock === "number"
          ? productData.stock
          : parseFloat(String(productData.stock)) || 0;
      const delta =
        adjustment.type === "INCREASE" ? adjustment.qty : -adjustment.qty;
      await tx.update(productRef, { stock: currentStock + delta });
    });
  },

  getUsers: async (): Promise<User[]> => getCollection<User>("users"),
  saveUser: async (user: User) => saveEntity<User>("users", user),
  updateUser: async (user: User) => saveEntity<User>("users", user),
  deleteUser: async (id: string) => deleteDoc(doc(collectionRef("users"), id)),

  resetProducts: async () => deleteCollection("products"),
  resetTransactions: async () => deleteCollection("transactions"),
  resetPurchases: async () => deleteCollection("purchases"),
  resetCashFlow: async () => deleteCollection("cashflow"),
  resetStockAdjustments: async () => deleteCollection("stock_adjustments"),
  resetAllFinancialData: async () => {
    await Promise.all([
      deleteCollection("transactions"),
      deleteCollection("purchases"),
      deleteCollection("cashflow"),
      deleteCollection("stock_adjustments"),
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
    ]);
  },
};
