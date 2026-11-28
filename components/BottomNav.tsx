import React from 'react';
import { Menu } from 'lucide-react';
import { bottomNavItemsFor } from './navItems';
import { UserRole } from '../types';

/**
 * Bilah navigasi bawah untuk layar HP.
 *
 * Menu aplikasi ini ada 21 butir — jauh terlalu banyak untuk sebuah
 * bilah bawah. Jadi yang ditampilkan hanya empat tujuan yang paling
 * sering disentuh karyawan saat berjaga (lihat PRIORITAS_BAWAH di
 * navItems.ts), ditambah tombol "Menu" yang membuka drawer berisi
 * daftar lengkap. Daftarnya tetap satu sumber dengan sidebar.
 *
 * Hanya tampil di bawah md, dan tidak ikut tercetak.
 */
export const BottomNav: React.FC<{
  activePage: string;
  onNavigate: (page: string) => void;
  onOpenMenu: () => void;
  userRole: UserRole;
  /** Tanda merah kecil di tombol Menu saat ada data belum terkirim atau sedang offline. */
  perluPerhatian?: boolean;
}> = ({ activePage, onNavigate, onOpenMenu, userRole, perluPerhatian = false }) => {
  const items = bottomNavItemsFor(userRole);
  const menuAktif = !items.some((i) => i.id === activePage);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-[35] bg-white border-t border-slate-200 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navigasi utama"
    >
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const aktif = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={aktif ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-0.5 pt-1.5 pb-1 transition-colors active:bg-slate-100 ${
                aktif ? 'text-primary' : 'text-slate-400'
              }`}
            >
              {aktif && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden="true" />}
              <Icon className={`w-[18px] h-[18px] ${aktif ? '' : 'opacity-80'}`} />
              <span className={`text-[10px] leading-none truncate max-w-full ${aktif ? 'font-bold' : 'font-medium'}`}>
                {item.short || item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenMenu}
          className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-0.5 pt-1.5 pb-1 transition-colors active:bg-slate-100 ${
            menuAktif ? 'text-primary' : 'text-slate-400'
          }`}
          aria-label="Buka menu lengkap"
        >
          {menuAktif && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden="true" />}
          <span className="relative">
            <Menu className="w-[18px] h-[18px]" />
            {perluPerhatian && (
              <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-danger ring-2 ring-white" aria-hidden="true" />
            )}
          </span>
          <span className={`text-[10px] leading-none ${menuAktif ? 'font-bold' : 'font-medium'}`}>Menu</span>
        </button>
      </div>
    </nav>
  );
};

/*
 * Tata lapisan (z-index) di layar HP, dari bawah ke atas:
 *   z-10..z-30  header sticky milik masing-masing layar
 *   z-[34]      bilah aksi layar (keranjang POS, Transaksi Susulan)
 *   z-[35]      bilah navigasi bawah ini
 *   z-40        overlay gelap drawer menu — menutupi bilah navigasi,
 *               supaya saat menu terbuka tidak ada dua navigasi aktif
 *   z-50        panel drawer menu (sidebar)
 *   z-[60]+     keranjang layar penuh POS dan seluruh modal
 */
