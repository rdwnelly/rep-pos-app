import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, X, ChevronDown } from 'lucide-react';
import { useLoadFailures } from '../hooks/useLoadFailures';
import { clearLoadFailures } from '../services/loadStatus';

/**
 * Memberi tahu bahwa ada data yang GAGAL DIMUAT.
 *
 * Tanpa ini, layar yang datanya gagal diambil terlihat persis sama
 * dengan layar yang datanya memang belum ada: nol dan kosong. Karyawan
 * tidak punya cara membedakannya, jadi tidak pernah melapor, dan angka
 * nol yang salah bisa ikut masuk laporan.
 *
 * Sengaja TIDAK memblokir layar. Kasir yang sedang melayani antrean
 * tidak boleh terhalang dialog; yang ia butuhkan hanya tahu bahwa angka
 * di depannya tidak bisa dipercaya saat ini.
 */
export const LoadFailureBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  const failures = useLoadFailures();
  const [terbuka, setTerbuka] = useState(false);

  if (failures.length === 0) return null;

  const daftar = failures.map((f) => f.nama).join(', ');

  return (
    <div
      className={`mb-2.5 md:mb-4 rounded-xl md:rounded-2xl border border-rose-300 bg-rose-50 text-rose-900 shadow-sm print:hidden ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-2 md:gap-3 p-2.5 md:p-3.5">
        <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-600" />

        <div className="min-w-0 flex-1">
          <p className="text-xs md:text-sm font-bold leading-snug">
            {failures.length === 1 ? 'Satu data gagal dimuat' : `${failures.length} data gagal dimuat`}
          </p>
          <p className="text-[11px] md:text-xs text-rose-800/90 leading-snug mt-0.5">
            {daftar}. Angka di layar ini belum lengkap — jangan dipakai untuk setoran atau laporan.
          </p>

          {terbuka && (
            <ul className="mt-2 space-y-1.5 border-t border-rose-200 pt-2">
              {failures.map((f) => (
                <li key={f.entitas} className="text-[11px] md:text-xs leading-snug">
                  <span className="font-bold">{f.nama}</span>
                  <span className="text-rose-800/90"> — {f.sebab}</span>
                  <span className="block font-mono text-[10px] text-rose-700/70 break-all mt-0.5">
                    {f.entitas}: {f.teknis}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600 text-white text-[11px] md:text-xs font-bold hover:bg-rose-700 transition-colors"
            >
              <RefreshCw size={12} /> Muat ulang
            </button>
            <button
              type="button"
              onClick={() => setTerbuka((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-rose-300 text-[11px] md:text-xs font-semibold hover:bg-rose-100 transition-colors"
            >
              <ChevronDown size={12} className={terbuka ? 'rotate-180 transition-transform' : 'transition-transform'} />
              {terbuka ? 'Sembunyikan' : 'Rincian'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={clearLoadFailures}
          className="shrink-0 p-1 rounded-lg text-rose-500 hover:text-rose-800 hover:bg-rose-100 transition-colors"
          aria-label="Tutup peringatan"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
