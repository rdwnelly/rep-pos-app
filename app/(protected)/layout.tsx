"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../src/lib/firebase";
import { Layout } from "../../components/Layout";
import { UserRole } from "../../types";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const activePage = useMemo(() => {
    const segment = pathname?.split("/")[1];
    return segment || "pos";
  }, [pathname]);

  const onNavigate = useCallback(
    (page: string) => {
      router.push(`/${page}`);
    },
    [router],
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

  return (
    <Layout
      activePage={activePage}
      onNavigate={onNavigate}
      userRole={user.role as UserRole}
      onLogout={handleLogout}
    >
      {children}
    </Layout>
  );
}
