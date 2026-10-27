"use client";

import { useEffect } from "react";

/**
 * Mendaftarkan public/sw.js supaya aplikasi tetap bisa dibuka saat
 * internet mati. Tanpa ini, menutup atau me-refresh tab dalam kondisi
 * offline membuat kasir melihat halaman error browser, bukan aplikasi.
 *
 * Sengaja tidak memaksa reload saat ada versi baru: reload mendadak di
 * tengah transaksi lebih merugikan daripada menunggu versi baru terpakai
 * pada pembukaan berikutnya.
 */
export const ServiceWorkerRegistrar = () => {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Di mode pengembangan service worker justru menyajikan kode lama,
    // jadi yang ada dibersihkan dan tidak didaftarkan.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((error) => console.error("Pendaftaran service worker gagal:", error));
    };

    // Tunggu halaman selesai memuat agar pengisian cache tidak bersaing
    // dengan permintaan yang dibutuhkan layar pertama.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
};
