"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth, db } from "../src/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

interface UserData {
  uid: string;
  email: string | null;
  role: string;
  name?: string;
  username?: string;
  image?: string;
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

/**
 * Peran diambil dari custom claim pada ID token supaya Firestore Rules
 * tidak perlu membaca dokumen users di setiap operasi.
 *
 * Akun yang claim-nya belum di-backfill (lihat scripts/set-custom-claims.mjs)
 * masih dilayani lewat dokumen users/{uid}, sama seperti fallback di rules.
 */
const resolveRole = async (firebaseUser: FirebaseUser): Promise<string | null> => {
  const fromToken = await firebaseUser.getIdTokenResult();
  if (typeof fromToken.claims.role === "string") {
    return fromToken.claims.role;
  }

  // Claim mungkin baru saja diset oleh /api/admin/set-role; token yang
  // ada di cache belum memuatnya, jadi paksa refresh sekali.
  const refreshed = await firebaseUser.getIdTokenResult(true);
  if (typeof refreshed.claims.role === "string") {
    return refreshed.claims.role;
  }

  return null;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        localStorage.removeItem("pos_current_user");
        setLoading(false);
        return;
      }

      let role: string | null = null;
      let profile: any = {};

      try {
        role = await resolveRole(firebaseUser);
      } catch (error) {
        console.error("Gagal membaca peran dari ID token:", error);
      }

      try {
        // Dokumen users tetap dibaca untuk nama dan foto; sekali saat
        // login, bukan per operasi seperti sebelumnya.
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        profile = userDoc.exists() ? userDoc.data() : {};
      } catch (error) {
        console.error("Gagal membaca profil user:", error);
      }

      const authUser: UserData = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role: role || profile.role || "CASHIER",
        name: profile.name || firebaseUser.displayName || undefined,
        username: profile.username || firebaseUser.email || undefined,
        image: profile.image || undefined,
      };

      setUser(authUser);
      localStorage.setItem(
        "pos_current_user",
        JSON.stringify({
          id: firebaseUser.uid,
          name: authUser.name || firebaseUser.email || "",
          username: authUser.username || firebaseUser.email || "",
          role: authUser.role,
          image: authUser.image || "",
        }),
      );
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
