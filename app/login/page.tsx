'use client';

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../src/lib/firebase";
import { useAuth } from "../../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user, loading } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.push('/pos');
    }
  }, [user, loading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Let the onAuthStateChanged handle the routing via the useEffect above, 
      // but we can also push here for immediate feedback if needed.
      router.push("/pos");
    } catch (error: any) {
      console.error("Error saat login:", error);
      if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        setErrorMsg("Email atau password salah. Silakan coba lagi, Mas/Mba.");
      } else if (error.code === "auth/network-request-failed") {
        setErrorMsg("Koneksi internet terputus. Cek jaringan wifi REP ya.");
      } else {
        setErrorMsg("Terjadi kesalahan sistem. Hubungi tim IT REP.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  // Prevent flashing the login form if already logged in
  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border-t-4 border-amber-600">
        <div className="text-center mb-8">
          <img src="/icon-192x192.png" alt="Logo Kasir REP" className="mx-auto h-20 w-20 mb-4 rounded-full shadow-sm" />
          <h1 className="text-2xl font-bold text-gray-800">Selamat Datang di Kasir REP</h1>
          <p className="text-sm text-gray-500 mt-2">
            Yaswar Cafe & Toko Souvenir
            <br />
            Yayasan Rumah Etnik Papua
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-100 border-l-4 border-red-500 text-red-700 text-sm rounded">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email Staf
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500 transition-colors"
              placeholder="kasir@rumahetnikpapua.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500 transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              isLoading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-amber-600 hover:bg-amber-700"
            } transition-colors`}
          >
            {isLoading ? "Memproses..." : "Masuk ke Mesin Kasir"}
          </button>
        </form>
      </div>
    </div>
  );
}
