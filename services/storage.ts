import { Product, Transaction, User, CashFlow, Category, Division, Customer, Supplier, Purchase, StoreSettings, BankAccount, SyncQueueItem, TravelAgent, TravelBookingCommission, OpenBill } from "../types";
import { ApiService } from "./api";

// Simple Event Bus for Data Changes
// Simple Event Bus for Data Changes
type ChangeListener = (entity?: string) => void;
const listeners: ChangeListener[] = [];

export const notifyListeners = (entity?: string) => {
  listeners.forEach(l => l(entity));
};

export const notifyDataChange = (entity?: string) => {
  notifyListeners(entity);
};

export const subscribeToChanges = (listener: ChangeListener) => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
};

export const StorageService = {
  notifyChange: (entity?: string) => {
    notifyListeners(entity);
  },
  refreshAll: () => {
    notifyListeners();
  },
  init: async () => {
    // No initialization needed for direct API usage
    console.log("StorageService initialized in Fully MySQL mode");
  },

  addToSyncQueue: async (table: SyncQueueItem['table'], action: SyncQueueItem['action'], dataId: string, data: any) => {
    // No local sync queue in fully MySQL mode
    console.warn("Sync queue not supported in Fully MySQL mode");
  },

  // Store Settings
  getStoreSettings: async (): Promise<StoreSettings> => {
    return await ApiService.getStoreSettings();
  },
  saveStoreSettings: async (settings: StoreSettings) => {
    await ApiService.saveStoreSettings(settings);
    notifyListeners('settings');
  },


  // Banks
  getBanks: async (): Promise<BankAccount[]> => {
    const banks = await ApiService.getBanks();
    const bankPapuaQRIS = '00020101021126650019ID.CO.BANKPAPUA.WWW011893600132064973534202096497353420303UMI51440014ID.CO.QRIS.WWW0215ID10243300948390303UMI5204569953033605802ID5924MITSHI RUMAH ETNIK PAPUA6006SORONG61059845762070703A016304F40A';

    const existingBankPapua = banks.find(b => b.bankName?.toLowerCase().includes('bank papua') || b.bankName?.toLowerCase().includes('papua'));

    if (!existingBankPapua) {
      const bankPapua: BankAccount = {
        id: 'bank-papua-qris',
        bankName: 'Bank Papua',
        accountNumber: 'ID1024330094839',
        holderName: 'MITSHI RUMAH ETNIK PAPUA',
        qrisCode: bankPapuaQRIS
      };
      ApiService.saveBank(bankPapua).catch(console.error);
      return [bankPapua, ...banks];
    } else if (!existingBankPapua.qrisCode || existingBankPapua.qrisCode !== bankPapuaQRIS) {
      const updated: BankAccount = {
        ...existingBankPapua,
        bankName: existingBankPapua.bankName || 'Bank Papua',
        holderName: existingBankPapua.holderName || 'MITSHI RUMAH ETNIK PAPUA',
        qrisCode: bankPapuaQRIS
      };
      ApiService.updateBank(updated).catch(console.error);
      return banks.map(b => b.id === existingBankPapua.id ? updated : b);
    }
    return banks;
  },
  saveBank: async (bank: BankAccount) => {
    if (!bank.id) await ApiService.saveBank(bank);
    else await ApiService.updateBank(bank);
    notifyListeners('banks');
  },
  deleteBank: async (id: string) => {
    await ApiService.deleteBank(id);
    notifyListeners('banks');
  },

  // Divisions
  getDivisions: async (): Promise<Division[]> => {
    return await ApiService.getDivisions();
  },
  saveDivision: async (division: Division) => {
    await ApiService.saveDivision(division);
    notifyListeners('divisions');
  },
  deleteDivision: async (id: string) => {
    await ApiService.deleteDivision(id);
    notifyListeners('divisions');
  },

  // Categories
  getCategories: async (): Promise<Category[]> => {
    const cats = await ApiService.getCategories();
    const umumCats = cats.filter(c => c.name?.trim().toLowerCase() === 'umum');
    if (umumCats.length > 0) {
      for (const c of umumCats) {
        if (c.id) {
          ApiService.deleteCategory(c.id).catch(console.error);
        }
      }
      return cats.filter(c => c.name?.trim().toLowerCase() !== 'umum');
    }
    return cats;
  },
  saveCategory: async (category: Category) => {
    if (!category.id) {
      await ApiService.saveCategory(category);
    } else {
      const existingCats = await ApiService.getCategories();
      const oldCat = existingCats.find(c => c.id === category.id);
      const oldName = oldCat?.name;

      await ApiService.updateCategory(category);

      // Cascade the name update to all products that use this category
      const allProducts = await ApiService.getProducts();
      const productsToUpdate = allProducts.filter(p => p.categoryId === category.id && p.categoryName !== category.name);

      if (productsToUpdate.length > 0) {
        const updatedProducts = productsToUpdate.map(p => ({ ...p, categoryName: category.name }));
        await ApiService.saveProductsBulk(updatedProducts);
        notifyListeners('products');
      }

      // Cascade rename to Berita Acara drafts & options in localStorage
      if (oldName && oldName.trim().toLowerCase() !== category.name.trim().toLowerCase() && typeof window !== 'undefined') {
        const oldLower = oldName.trim().toLowerCase();
        const newName = category.name.trim();

        // 1. Update custom_expense_categories in localStorage
        try {
          const rawOpts = localStorage.getItem('custom_expense_categories');
          if (rawOpts) {
            const parsed = JSON.parse(rawOpts);
            if (Array.isArray(parsed)) {
              const updatedOpts = parsed.map(opt => {
                const clean = opt.replace(/^\d+\)\s*/, '').trim().toLowerCase();
                if (clean === oldLower) {
                  const numMatch = opt.match(/^(\d+\)\s*)/);
                  return numMatch ? `${numMatch[1]}${newName}` : newName;
                }
                return opt;
              });
              localStorage.setItem('custom_expense_categories', JSON.stringify(updatedOpts));
            }
          }
        } catch (e) {
          console.error("Failed to sync renamed category to custom_expense_categories:", e);
        }

        // 2. Update all active Berita Acara drafts in localStorage
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('rep_ba_draft_')) {
              const rawDraft = localStorage.getItem(key);
              if (rawDraft) {
                const draft = JSON.parse(rawDraft);
                let changed = false;

                // Update salesRows in draft
                if (Array.isArray(draft.salesRows)) {
                  draft.salesRows = draft.salesRows.map((r: any) => {
                    if (r && r.name && r.name.trim().toLowerCase() === oldLower) {
                      changed = true;
                      return { ...r, name: newName };
                    }
                    return r;
                  });
                }

                // Update customExpenses in draft
                if (Array.isArray(draft.customExpenses)) {
                  draft.customExpenses = draft.customExpenses.map((c: any) => {
                    if (c && c.category) {
                      const clean = c.category.replace(/^\d+\)\s*/, '').trim().toLowerCase();
                      if (clean === oldLower) {
                        changed = true;
                        const numMatch = c.category.match(/^(\d+\)\s*)/);
                        return { ...c, category: numMatch ? `${numMatch[1]}${newName}` : newName };
                      }
                    }
                    return c;
                  });
                }

                // Update expenseRows in draft
                if (Array.isArray(draft.expenseRows)) {
                  draft.expenseRows = draft.expenseRows.map((r: any) => {
                    if (r && r.name && r.name.trim().toLowerCase() === oldLower) {
                      changed = true;
                      return { ...r, name: newName };
                    }
                    return r;
                  });
                }

                if (changed) {
                  localStorage.setItem(key, JSON.stringify(draft));
                }
              }
            }
          }
        } catch (e) {
          console.error("Failed to sync renamed category to local drafts:", e);
        }

        // 3. Dispatch global window event
        window.dispatchEvent(new CustomEvent('category_renamed', {
          detail: { id: category.id, oldName, newName }
        }));
      }
    }
    notifyListeners('categories');
  },
  deleteCategory: async (id: string) => {
    await ApiService.deleteCategory(id);
    notifyListeners('categories');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('category_deleted', { detail: { id } }));
    }
  },

  // Products
  getProducts: async (): Promise<Product[]> => {
    const products = await ApiService.getProducts();
    let hasUmum = false;
    const cleaned = products.map(p => {
      if (p.categoryName?.trim().toLowerCase() === 'umum') {
        hasUmum = true;
        return { ...p, categoryName: '', categoryId: '' };
      }
      return p;
    });
    if (hasUmum) {
      const toUpdate = products.filter(p => p.categoryName?.trim().toLowerCase() === 'umum').map(p => ({ ...p, categoryName: '', categoryId: '' }));
      ApiService.saveProductsBulk(toUpdate).catch(console.error);
    }
    return cleaned;
  },
  saveProduct: async (product: Product) => {
    if (product.categoryName?.trim().toLowerCase() === 'umum') {
      product.categoryName = 'TOKO SOUVENIR';
    }
    if (!product.id) await ApiService.saveProduct(product);
    else await ApiService.updateProduct(product);
    notifyListeners('products');
  },
  deleteProduct: async (id: string) => {
    await ApiService.deleteProduct(id);
    notifyListeners('products');
  },
  saveProductsBulk: async (newProducts: Product[]) => {
    await ApiService.saveProductsBulk(newProducts);
    notifyListeners('products');
  },

  // Customers
  getCustomers: async (): Promise<Customer[]> => {
    return await ApiService.getCustomers();
  },
  saveCustomer: async (cust: Customer) => {
    if (!cust.id) await ApiService.saveCustomer(cust);
    else await ApiService.updateCustomer(cust);
    notifyListeners('customers');
  },
  deleteCustomer: async (id: string) => {
    await ApiService.deleteCustomer(id);
    notifyListeners('customers');
  },
  saveCustomersBulk: async (newCustomers: Customer[]) => {
    await ApiService.saveCustomersBulk(newCustomers);
    notifyListeners('customers');
  },

  // Suppliers
  getSuppliers: async (): Promise<Supplier[]> => {
    return await ApiService.getSuppliers();
  },
  saveSupplier: async (sup: Supplier) => {
    if (!sup.id) await ApiService.saveSupplier(sup);
    else await ApiService.updateSupplier(sup);
    notifyListeners('suppliers');
  },
  deleteSupplier: async (id: string) => {
    await ApiService.deleteSupplier(id);
    notifyListeners('suppliers');
  },
  saveSuppliersBulk: async (newSuppliers: Supplier[]) => {
    await ApiService.saveSuppliersBulk(newSuppliers);
    notifyListeners('suppliers');
  },

  // Transactions (Sales)
  getTransactions: async (): Promise<Transaction[]> => {
    return await ApiService.getTransactions();
  },
  addTransaction: async (transaction: Transaction) => {
    const result = await ApiService.addTransaction(transaction);
    notifyListeners('transactions');
    // Transactions also affect products (stock) and cashflow
    notifyListeners('products');
    notifyListeners('cashflow');
    return result;
  },
  updateTransaction: async (transaction: Transaction) => {
    await ApiService.updateTransaction(transaction);
    notifyListeners('transactions');
    notifyListeners('products');
    notifyListeners('cashflow');
  },
  deleteTransaction: async (id: string) => {
    await ApiService.deleteTransaction(id);
    notifyListeners('transactions');
    notifyListeners('products');
    notifyListeners('cashflow');
    notifyListeners('travel_booking_commissions');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('transactions_updated'));
      window.dispatchEvent(new Event('products_updated'));
      window.dispatchEvent(new Event('cashflow_updated'));
      window.dispatchEvent(new Event('commissions_updated'));
    }
  },

  // Purchases (Stock In)
  getPurchases: async (): Promise<Purchase[]> => {
    return await ApiService.getPurchases();
  },
  addPurchase: async (purchase: Purchase) => {
    await ApiService.addPurchase(purchase);
    notifyListeners('purchases');
    notifyListeners('products');
    notifyListeners('cashflow');
  },
  updatePurchase: async (purchase: Purchase) => {
    await ApiService.updatePurchase(purchase);
    notifyListeners('purchases');
    notifyListeners('products');
    notifyListeners('cashflow');
  },
  deletePurchase: async (id: string) => {
    await ApiService.deletePurchase(id);
    notifyListeners('purchases');
    notifyListeners('products');
    notifyListeners('cashflow');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('purchases_updated'));
      window.dispatchEvent(new Event('products_updated'));
      window.dispatchEvent(new Event('cashflow_updated'));
    }
  },

  // Cash Flow
  getCashFlow: async (): Promise<CashFlow[]> => {
    return await ApiService.getCashFlow();
  },
  addCashFlow: async (cf: CashFlow) => {
    await ApiService.addCashFlow(cf);
    notifyListeners('cashflow');
  },
  updateCashFlow: async (cf: CashFlow) => {
    await ApiService.addCashFlow(cf);
    notifyListeners('cashflow');
  },
  deleteCashFlow: async (id: string) => {
    await ApiService.deleteCashFlow(id);
    notifyListeners('cashflow');
  },

  // Stock Adjustments
  getStockAdjustments: async (): Promise<any[]> => {
    return await ApiService.getStockAdjustments();
  },
  addStockAdjustment: async (adjustment: any) => {
    await ApiService.addStockAdjustment(adjustment);
    notifyListeners('stock_adjustments');
    notifyListeners('products'); // Stock changed
  },
  deleteStockAdjustment: async (adjustment: any) => {
    await ApiService.deleteStockAdjustment(adjustment);
    notifyListeners('stock_adjustments');
    notifyListeners('products'); // Stock changed
  },

  // Users
  getUsers: async (): Promise<User[]> => {
    return await ApiService.getUsers();
  },
  saveUser: async (user: User) => {
    if (!user.id) await ApiService.saveUser(user);
    else await ApiService.updateUser(user);
    notifyListeners('users');
  },
  deleteUser: async (id: string) => {
    await ApiService.deleteUser(id);
    notifyListeners('users');
  },

  // Reset Functions (SUPERADMIN ONLY)
  resetProducts: async () => {
    await ApiService.resetProducts();
    notifyListeners('products');
    notifyListeners('stock_adjustments');
  },
  resetTransactions: async (startDate?: string, endDate?: string) => {
    await ApiService.resetTransactions(startDate, endDate);
    notifyListeners('transactions');
    notifyListeners('products');
    notifyListeners('cashflow');
  },
  resetPurchases: async (startDate?: string, endDate?: string) => {
    await ApiService.resetPurchases(startDate, endDate);
    notifyListeners('purchases');
    notifyListeners('products');
    notifyListeners('cashflow');
  },
  resetCashFlow: async (startDate?: string, endDate?: string) => {
    await ApiService.resetCashFlow(startDate, endDate);
    notifyListeners('cashflow');
  },
  resetStockAdjustments: async (startDate?: string, endDate?: string) => {
    await ApiService.resetStockAdjustments(startDate, endDate);
    notifyListeners('stock_adjustments');
  },
  resetAllFinancialData: async (startDate?: string, endDate?: string) => {
    await ApiService.resetAllFinancialData(startDate, endDate);
    notifyListeners('transactions');
    notifyListeners('purchases');
    notifyListeners('cashflow');
    notifyListeners('products');
    notifyListeners('stock_adjustments');
  },
  resetMasterData: async () => {
    await ApiService.resetMasterData();
    notifyListeners('products');
    notifyListeners('categories');
    notifyListeners('customers');
    notifyListeners('suppliers');
  },
  resetAllData: async () => {
    await ApiService.resetAllData();
    notifyListeners(); // All changed
  },

  // Berita Acara Archives
  getBeritaAcaraArchives: async (): Promise<any[]> => {
    return await ApiService.getBeritaAcaraArchives();
  },
  saveBeritaAcaraArchive: async (archive: any, notify: boolean = true) => {
    await ApiService.saveBeritaAcaraArchive(archive);
    if (notify) {
      notifyListeners('berita_acara_archives');
    }
  },
  deleteBeritaAcaraArchive: async (id: string) => {
    await ApiService.deleteBeritaAcaraArchive(id);
    notifyListeners('berita_acara_archives');
  },

  // Travel Agents
  getTravelAgents: async (): Promise<TravelAgent[]> => {
    return await ApiService.getTravelAgents();
  },
  saveTravelAgent: async (agent: TravelAgent) => {
    if (!agent.id) await ApiService.saveTravelAgent(agent);
    else await ApiService.updateTravelAgent(agent);
    notifyListeners('travel_agents');
  },
  deleteTravelAgent: async (id: string) => {
    await ApiService.deleteTravelAgent(id);
    notifyListeners('travel_agents');
  },

  // Travel Commissions
  getTravelCommissions: async (): Promise<TravelBookingCommission[]> => {
    return await ApiService.getTravelCommissions();
  },
  saveTravelCommission: async (commission: TravelBookingCommission) => {
    if (!commission.id) await ApiService.saveTravelCommission(commission);
    else await ApiService.updateTravelCommission(commission);
    notifyListeners('travel_commissions');
  },
  deleteTravelCommission: async (id: string) => {
    await ApiService.deleteTravelCommission(id);
    notifyListeners('travel_commissions');
  },

  // Open Bills (Tagihan Terbuka)
  getOpenBills: async (): Promise<OpenBill[]> => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('pos_open_bills') : null;
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  saveOpenBill: async (bill: OpenBill) => {
    const bills = await StorageService.getOpenBills();
    const index = bills.findIndex(b => b.id === bill.id);
    if (index >= 0) {
      bills[index] = bill;
    } else {
      bills.push(bill);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos_open_bills', JSON.stringify(bills));
      window.dispatchEvent(new CustomEvent('open_bills_updated'));
    }
    notifyListeners('open_bills');
  },
  deleteOpenBill: async (id: string) => {
    const bills = (await StorageService.getOpenBills()).filter(b => b.id !== id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos_open_bills', JSON.stringify(bills));
      window.dispatchEvent(new CustomEvent('open_bills_updated'));
    }
    notifyListeners('open_bills');
  },
};