"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../src/lib/firebase";
import { Layout } from "../../components/Layout";
import { UserRole } from "../../types";
import { Loading } from "../../components/Loading";

// POS tetap di-impor statis: itu start_url aplikasi dan layar yang
// dibuka kasir sepanjang hari, jadi tidak boleh menunggu chunk terpisah.
import { POS } from "../../screens/POS";

/**
 * Sisanya dipecah jadi chunk sendiri. Sebelumnya ke-17 layar di-impor
 * statis di sini, sehingga membuka /pos ikut mengunduh Finance (4.601
 * baris), MonthlyReport (3.203 baris), Berita Acara, plus recharts,
 * jspdf, html2canvas, dan xlsx — padahal belum tentu dipakai.
 *
 * ssr: false karena semua layar ini client component yang bergantung
 * pada localStorage dan Firebase Auth di browser.
 */
const lazyScreen = (
  load: () => Promise<any>,
  exportName: string,
): React.ComponentType<any> =>
  dynamic(() => load().then((mod) => mod[exportName]), {
    ssr: false,
    loading: () => <Loading />,
  });

const About = lazyScreen(() => import("../../screens/About"), "About");
const BackdateEntry = lazyScreen(() => import("../../screens/BackdateEntry"), "BackdateEntry");
const BarcodeGenerator = lazyScreen(() => import("../../screens/BarcodeGenerator"), "BarcodeGenerator");
const CustomerHistory = lazyScreen(() => import("../../screens/CustomerHistory"), "CustomerHistory");
const Dashboard = lazyScreen(() => import("../../screens/Dashboard"), "Dashboard");
const Finance = lazyScreen(() => import("../../screens/Finance"), "Finance");
const MonthlyReport = lazyScreen(() => import("../../screens/MonthlyReport"), "MonthlyReport");
const People = lazyScreen(() => import("../../screens/People"), "People");
const Products = lazyScreen(() => import("../../screens/Products"), "Products");
const RealStockCheck = lazyScreen(() => import("../../screens/RealStockCheck"), "RealStockCheck");
const ReturnHistory = lazyScreen(() => import("../../screens/ReturnHistory"), "ReturnHistory");
const Settings = lazyScreen(() => import("../../screens/Settings"), "Settings");
const SoldItems = lazyScreen(() => import("../../screens/SoldItems"), "SoldItems");
const SupplierHistory = lazyScreen(() => import("../../screens/SupplierHistory"), "SupplierHistory");
const TransferHistory = lazyScreen(() => import("../../screens/TransferHistory"), "TransferHistory");
const TravelAgentCommission = lazyScreen(() => import("../../screens/TravelAgentCommission"), "TravelAgentCommission");

const BeritaAcaraPage = dynamic(() => import("./berita-acara/page"), {
  ssr: false,
  loading: () => <Loading />,
});

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
