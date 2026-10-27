"use client";

/**
 * Route segment /[page] sengaja tidak merender apa pun.
 *
 * Seluruh layar dipilih dan dirender oleh (protected)/layout.tsx, yang
 * mengabaikan `children`. File ini sebelumnya memuat salinan kedua dari
 * `pageMap` — salinan yang sudah melenceng (monthly_report,
 * backdate_entry, dan berita-acara tidak ada di dalamnya) sekaligus
 * meng-impor ke-17 layar secara statis, sehingga membuka /pos ikut
 * memuat Finance, MonthlyReport, jspdf, html2canvas, dan recharts.
 *
 * File-nya tetap ada karena route ini butuh page.tsx agar dikenali
 * Next.js, tapi isinya cukup null.
 */
export default function Page() {
  return null;
}
