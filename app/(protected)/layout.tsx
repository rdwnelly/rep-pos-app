"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../src/lib/firebase";
import { Layout } from "../../components/Layout";
import { UserRole } from "../../types";
import {
  About,
  BackdateEntry,
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
  MonthlyReport,
  TravelAgentCommission,
} from "../../screens";
import BeritaAcaraPage from "./berita-acara/page";

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
  travel_commission: { component: TravelAgentCommission, requiresCurrentUser: true },
  real_stock_check: { component: RealStockCheck, requiresCurrentUser: true },
  sold_items: { component: SoldItems, requiresCurrentUser: true },
  transfer_history: { component: TransferHistory, requiresCurrentUser: true },
  return_history: { component: ReturnHistory, requiresCurrentUser: true },
  settings: { component: Settings },
  about: { component: About },
  barcode: { component: BarcodeGenerator },
  "berita-acara": { component: BeritaAcaraPage },
  monthly_report: { component: MonthlyReport, requiresCurrentUser: true },
  backdate_entry: { component: BackdateEntry, requiresCurrentUser: true },
};

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [clientPath, setClientPath] = useState(pathname || "/pos");

  useEffect(() => {
    if (pathname) {
      setClientPath(pathname);
    }
  }, [pathname]);

  useEffect(() => {
    const handlePopState = () => {
      setClientPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activePage = useMemo(() => {
    const segment = clientPath?.split("/")[1];
    return segment || "pos";
  }, [clientPath]);

  const onNavigate = useCallback(
    (page: string) => {
      const newPath = `/${page}`;
      setClientPath(newPath);
      window.history.pushState(null, "", newPath);
    },
    [],
  );

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("pos_current_user");
      router.push("/login");
    } catch (error) {
      console.error("Logout failed", error);
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Render client-side page dynamically
  const pageEntry = pageMap[activePage];
  let PageContent = null;

  if (pageEntry) {
    const PageComponent = pageEntry.component;
    const props: Record<string, any> = {};

    if (pageEntry.requiresCurrentUser) {
      props.currentUser = user;
    }
    if (pageEntry.defaultTab) {
      props.defaultTab = pageEntry.defaultTab;
    }
    PageContent = (
      <div className="min-h-full">
        <PageComponent {...props} />
      </div>
    );
  } else {
    PageContent = (
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

  return (
    <Layout
      activePage={activePage}
      onNavigate={onNavigate}
      userRole={user.role as UserRole}
      onLogout={handleLogout}
    >
      {PageContent}
    </Layout>
  );
}
