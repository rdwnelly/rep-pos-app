"use client";

import React, { use } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  About,
  BarcodeGenerator,
  CustomerHistory,
  Dashboard,
  Finance,
  POS,
  People,
  Products,
  RealStockCheck,
  ReturnHistory,
  Settings,
  SoldItems,
  SupplierHistory,
  TransferHistory,
} from "../../../screens";

const pageMap: Record<
  string,
  {
    component: React.ComponentType<any>;
    requiresCurrentUser?: boolean;
    defaultTab?:
      | "history"
      | "debt_customer"
      | "purchase_history"
      | "debt_supplier"
      | "cashflow";
  }
> = {
  dashboard: { component: Dashboard },
  pos: { component: POS },
  products: { component: Products },
  transactions: {
    component: Finance,
    requiresCurrentUser: true,
    defaultTab: "history",
  },
  people: { component: People },
  finance: { component: Finance, requiresCurrentUser: true },
  customer_history: { component: CustomerHistory, requiresCurrentUser: true },
  supplier_history: { component: SupplierHistory, requiresCurrentUser: true },
  real_stock_check: { component: RealStockCheck, requiresCurrentUser: true },
  sold_items: { component: SoldItems, requiresCurrentUser: true },
  transfer_history: { component: TransferHistory, requiresCurrentUser: true },
  return_history: { component: ReturnHistory, requiresCurrentUser: true },
  settings: { component: Settings },
  about: { component: About },
  barcode: { component: BarcodeGenerator },
};

interface PageProps {
  params: Promise<{
    page: string;
  }>;
}

export default function Page({ params }: PageProps) {
  const unwrappedParams = use(params);
  const { user } = useAuth();
  const pageEntry = pageMap[unwrappedParams.page];

  if (!pageEntry) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 text-center text-gray-700">
        <div>
          <h1 className="text-2xl font-semibold">Halaman tidak ditemukan</h1>
          <p className="mt-2 text-sm text-slate-600">
            Silakan pilih halaman yang tersedia dari menu.
          </p>
        </div>
      </div>
    );
  }

  const PageComponent = pageEntry.component;
  const props: Record<string, any> = {};

  if (pageEntry.requiresCurrentUser) {
    props.currentUser = user;
  }

  if (pageEntry.defaultTab) {
    props.defaultTab = pageEntry.defaultTab;
  }

  return (
    <div className="min-h-full">
      <PageComponent {...props} />
    </div>
  );
}
