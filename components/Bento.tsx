/**
 * ============================================================================
 * KIT UI BENTO — KASIR RELY
 * ============================================================================
 * Tata letak modular berbentuk ubin (tile) dengan ukuran bervariasi.
 * Mobile-first: 2 kolom di HP & tablet, 4 kolom di laptop (lg), 6 kolom
 * di layar lebar (2xl).
 *
 * Diadaptasi dari kit Bento SIK-REP agar kedua aplikasi terasa satu
 * keluarga, dengan tiga penyesuaian:
 *
 *   1. Warna memakai token aplikasi ini (primary/accent/success/danger
 *      di tailwind.config.js), bukan `papua-*` milik SIK-REP, supaya
 *      sewarna dengan layar-layar yang sudah ada.
 *   2. Perpindahan halaman lewat `onClick` + `onNavigate`, karena di
 *      sini halaman diganti dengan history.pushState, bukan <Link>.
 *      `href` tetap didukung untuk tautan keluar aplikasi.
 *   3. Ditulis dalam TypeScript, mengikuti `strict: true` proyek ini.
 *
 * Ukuran ubin (size):
 *   "xs"   : 1 kolom di semua layar (ubin statistik kecil)
 *   "sm"   : 1 kolom HP, 2 kolom laptop
 *   "md"   : 2 kolom HP, 2 laptop, 3 layar lebar (setengah layar)
 *   "lg"   : 2 kolom HP, 4 laptop, 4 layar lebar
 *   "side" : 2 kolom HP, 4 laptop, 2 layar lebar (ubin samping)
 *   "full" : selebar grid
 */
import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export type TileSize = 'xs' | 'sm' | 'md' | 'lg' | 'side' | 'full';
export type TileTone =
  | 'default' | 'primary' | 'dark' | 'accent' | 'green' | 'red'
  | 'soft' | 'greenSoft' | 'redSoft' | 'accentSoft';

const UKURAN: Record<TileSize, string> = {
  xs: 'col-span-1',
  sm: 'col-span-1 lg:col-span-2',
  md: 'col-span-2 lg:col-span-2 2xl:col-span-3',
  lg: 'col-span-2 lg:col-span-4 2xl:col-span-4',
  side: 'col-span-2 lg:col-span-4 2xl:col-span-2',
  full: 'col-span-2 lg:col-span-4 2xl:col-span-6',
};

const BARIS: Record<number, string> = {
  1: '',
  2: 'lg:row-span-2',
  3: 'lg:row-span-3',
};

const NADA: Record<TileTone, string> = {
  default: 'bg-white border border-primary/10 text-primary',
  primary: 'bg-primary text-white border border-black/20',
  dark: 'bg-slate-800 text-white border border-black/20',
  accent: 'bg-accent text-primary border border-accent/60',
  green: 'bg-success text-white border border-black/20',
  red: 'bg-danger text-white border border-black/20',
  soft: 'bg-[#F5EFE6] text-primary border border-primary/10',
  greenSoft: 'bg-success/10 text-success border border-success/25',
  redSoft: 'bg-danger/10 text-danger border border-danger/25',
  accentSoft: 'bg-accent/20 text-primary border border-accent/50',
};

const BERPOLA = new Set<TileTone>(['primary', 'dark', 'green', 'red']);

export function BentoGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6 gap-2.5 md:gap-4 auto-rows-auto ${className}`}>
      {children}
    </div>
  );
}

export interface TileProps {
  size?: TileSize;
  rows?: number;
  tone?: TileTone;
  className?: string;
  padded?: boolean;
  children?: React.ReactNode;
  /** Tautan keluar aplikasi. Untuk pindah halaman di dalam aplikasi, pakai onClick + onNavigate. */
  href?: string;
  onClick?: () => void;
  as?: keyof React.JSX.IntrinsicElements;
  title?: string;
}

export function Tile({
  size = 'md', rows = 1, tone = 'default', className = '', padded = true,
  children, href, onClick, as, title,
}: TileProps) {
  const kelas = `relative overflow-hidden rounded-2xl md:rounded-3xl shadow-sm ${UKURAN[size] || UKURAN.md} ${BARIS[rows] || ''} ${NADA[tone] || NADA.default} ${padded ? 'p-3 md:p-5' : ''} ${href || onClick ? 'transition-transform active:scale-[0.98] hover:shadow-md' : ''} ${className}`;
  const isi = (
    <>
      {BERPOLA.has(tone) && <div className="absolute inset-0 bento-pattern pointer-events-none" aria-hidden="true" />}
      <div className="relative h-full">{children}</div>
    </>
  );
  if (href) return <Link href={href} title={title} className={`block ${kelas}`}>{isi}</Link>;
  if (onClick) return <button type="button" title={title} onClick={onClick} className={`text-left ${kelas}`}>{isi}</button>;
  const Komponen = (as || 'div') as React.ElementType;
  return <Komponen className={kelas} title={title}>{isi}</Komponen>;
}

export function TileHeader({
  icon: Icon, title, subtitle, action, className = '',
}: {
  icon?: LucideIcon; title: React.ReactNode; subtitle?: React.ReactNode;
  action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-2.5 mb-2.5 md:mb-3 ${className}`}>
      <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
        {Icon && (
          <span className="shrink-0 grid place-items-center w-8 h-8 md:w-9 md:h-9 rounded-xl md:rounded-2xl bg-current/10">
            <Icon className="w-4 h-4 md:w-[18px] md:h-[18px]" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-bold text-[13px] md:text-[15px] leading-tight truncate">{title}</h2>
          {subtitle && <p className="text-[11px] md:text-xs opacity-70 leading-snug mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Ubin angka ringkas: label kecil di atas, nilai besar, keterangan opsional */
export function StatTile({
  label, value, icon: Icon, hint, tone = 'default', size = 'xs', rows = 1,
  loading = false, onClick, className = '',
}: {
  label: React.ReactNode; value: React.ReactNode; icon?: LucideIcon; hint?: React.ReactNode;
  tone?: TileTone; size?: TileSize; rows?: number; loading?: boolean;
  onClick?: () => void; className?: string;
}) {
  // Nilai rupiah panjang ("Rp 12.345.678") tidak boleh terpotong di HP,
  // jadi ukuran fontnya menyusut mengikuti panjang teksnya.
  const panjang = String(value).length;
  const ukuranNilai =
    panjang > 15 ? 'text-sm md:text-xl' : panjang > 11 ? 'text-base md:text-xl' : 'text-lg md:text-2xl';
  return (
    <Tile size={size} rows={rows} tone={tone} onClick={onClick} className={`flex flex-col ${className}`}>
      <div className="flex flex-col h-full justify-between gap-2 md:gap-3">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider opacity-75 leading-tight">{label}</span>
          {Icon && <Icon className="w-4 h-4 md:w-5 md:h-5 opacity-70 shrink-0" />}
        </div>
        <div>
          {loading ? (
            <div className="h-6 md:h-7 w-3/4 rounded-lg bg-current/15 animate-pulse" />
          ) : (
            <p className={`${ukuranNilai} font-extrabold tracking-tight leading-tight break-words`}>{value}</p>
          )}
          {hint && <p className="text-[10px] md:text-[11px] opacity-70 mt-0.5 md:mt-1 leading-snug">{hint}</p>}
        </div>
      </div>
    </Tile>
  );
}

/** Judul halaman ringkas (mobile-first) dengan aksi yang bisa digeser horizontal di HP */
export function PageHeader({
  title, subtitle, icon: Icon, actions, className = '',
}: {
  title: React.ReactNode; subtitle?: React.ReactNode; icon?: LucideIcon;
  actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={`mb-3 md:mb-6 print:hidden ${className}`}>
      <div className="flex items-center gap-2.5 md:gap-3">
        {Icon && (
          <span className="grid shrink-0 place-items-center w-9 h-9 md:w-11 md:h-11 rounded-xl md:rounded-2xl bg-primary text-accent">
            <Icon className="w-4 h-4 md:w-5 md:h-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-base md:text-2xl font-bold text-primary leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-[11px] md:text-sm text-primary/60 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      {actions && (
        <div className="mt-2.5 md:mt-3 -mx-3 px-3 md:mx-0 md:px-0 flex gap-2 overflow-x-auto scrollbar-hide md:flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}

const VARIAN_TOMBOL = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  accent: 'bg-accent text-primary hover:brightness-95',
  green: 'bg-success text-white hover:brightness-110',
  red: 'bg-danger text-white hover:brightness-110',
  ghost: 'bg-white text-primary border border-primary/15 hover:bg-primary/5',
} as const;

/** Tombol pil (chip) untuk baris aksi */
export function ActionChip({
  icon: Icon, children, variant = 'ghost', className = '', ...props
}: {
  icon?: LucideIcon; variant?: keyof typeof VARIAN_TOMBOL;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 md:px-3.5 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50 ${VARIAN_TOMBOL[variant] || VARIAN_TOMBOL.ghost} ${className}`}
      {...props}
    >
      {Icon && <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />}
      {children}
    </button>
  );
}

/** Pilihan segmen (mis. Bulanan/Tahunan/Semua) */
export function Segmented<T extends string>({
  value, onChange, options, className = '',
}: {
  value: T; onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[]; className?: string;
}) {
  return (
    <div className={`inline-flex p-1 rounded-xl md:rounded-2xl bg-primary/5 border border-primary/10 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl text-[11px] md:text-xs font-bold whitespace-nowrap transition-colors ${value === o.value ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Tinggi minimal 44px di HP mengikuti ambang sasaran sentuh, dan font 16px
// supaya iOS Safari tidak ikut memperbesar halaman saat kolom difokus.
export const inputKelas =
  'w-full rounded-xl md:rounded-2xl border border-primary/15 bg-white px-3 md:px-4 py-2.5 md:py-3 text-base md:text-sm text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/40';

export const selectKelas =
  'rounded-xl md:rounded-2xl border border-primary/15 bg-white px-2.5 md:px-3 py-2 md:py-2.5 text-sm font-semibold text-primary outline-none focus:ring-2 focus:ring-accent/40';

export function Field({
  label, children, hint, className = '',
}: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 md:space-y-1.5 ${className}`}>
      <span className="text-[10px] md:text-xs font-bold uppercase tracking-wide text-primary/70">{label}</span>
      {children}
      {hint && <span className="block text-[11px] md:text-xs text-primary/60">{hint}</span>}
    </label>
  );
}

export function EmptyState({
  icon: Icon, title, children,
}: { icon?: LucideIcon; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 md:py-10 px-4 text-primary/60">
      {Icon && <Icon className="w-8 h-8 md:w-10 md:h-10 mb-2.5 md:mb-3 opacity-40" />}
      <p className="font-semibold text-sm md:text-base text-primary/80">{title}</p>
      {children && <div className="text-xs md:text-sm mt-1">{children}</div>}
    </div>
  );
}

export function LoadingTile({ size = 'full', text = 'Memuat data...' }: { size?: TileSize; text?: string }) {
  return (
    <Tile size={size} className="flex items-center justify-center min-h-32 md:min-h-40">
      <div className="flex flex-col items-center gap-2.5 md:gap-3 text-primary/60 text-xs md:text-sm">
        <div className="w-8 h-8 md:w-9 md:h-9 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
        {text}
      </div>
    </Tile>
  );
}

/** Banner status (sukses / galat / info) */
export function StatusBanner({
  status, onClose,
}: {
  status?: { type?: 'error' | 'success' | 'info'; message?: string } | null;
  onClose?: () => void;
}) {
  if (!status?.message) return null;
  const nada =
    status.type === 'error'
      ? 'bg-danger/10 border-danger/30 text-danger'
      : status.type === 'success'
        ? 'bg-success/10 border-success/30 text-success'
        : 'bg-accent/20 border-accent/50 text-primary';
  return (
    <div className={`mb-3 md:mb-4 rounded-xl md:rounded-2xl border px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-medium flex items-start gap-2.5 md:gap-3 ${nada}`} role="status">
      <span className="flex-1">{status.message}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="Tutup">
          ✕
        </button>
      )}
    </div>
  );
}
