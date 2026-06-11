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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          const data = userDoc.exists() ? (userDoc.data() as any) : {};
          const authUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: data.role || "CASHIER",
            name: data.name || firebaseUser.displayName || undefined,
            username: data.username || firebaseUser.email || undefined,
            image: data.image || undefined,
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
        } catch (error) {
          console.error("Error fetching user data:", error);
          setUser(null);
          localStorage.removeItem("pos_current_user");
        }
      } else {
        setUser(null);
        localStorage.removeItem("pos_current_user");
      }
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
