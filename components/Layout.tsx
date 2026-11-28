import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LogOut, Menu, X, Wifi, WifiOff, CloudUpload, CloudOff } from 'lucide-react';
import { UserRole } from '../types';
import { navItemsFor } from './navItems';
import { BottomNav } from './BottomNav';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSyncState } from '../hooks/useSyncState';
import { clearSyncFailures } from '../services/syncStatus';

interface LayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
  userRole: UserRole;
  onLogout: () => void;
}

// Memoized NavItem component untuk mencegah re-render yang tidak perlu
const NavItem = React.memo<{
  item: { id: string; label: string; icon: any };
  isActive: boolean;
  isSidebarOpen: boolean;
  onNavigate: (page: string) => void;
}>(({ item, isActive, isSidebarOpen, onNavigate }) => {
  const Icon = item.icon;

  return (
    <button
      onClick={() => onNavigate(item.id)}
      className={`w-full flex items-center ${isSidebarOpen ? 'justify-start gap-2.5 sm:gap-3' : 'justify-center'} px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition-all duration-150 ${isActive
        ? 'bg-white text-primary shadow-lg shadow-black/10'
        : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`}
      title={!isSidebarOpen ? item.label : ''}
    >
      <Icon className="w-4.5 h-4.5 sm:w-5 sm:h-5 flex-shrink-0" />
      {isSidebarOpen && (
        <span className="font-medium text-xs sm:text-sm whitespace-nowrap transition-opacity duration-150">
          {item.label}
        </span>
      )}
    </button>
  );
});

NavItem.displayName = 'NavItem';

export const Layout: React.FC<LayoutProps> = ({ children, activePage, onNavigate, userRole, onLogout }) => {
  // Load sidebar state from localStorage, otomatis ciutkan (false) jika lebar layar < 1024px
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      return false;
    }
    const saved = localStorage.getItem('pos_sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isOnline = useOnlineStatus();
  const { pending: pendingSync, failures: syncFailures, restoredPending } = useSyncState();

  // Otomatis sembunyikan sidebar pada layar HP / Tablet (< 1024px) & saat ukuran layar berubah (resize)
  useEffect(() => {
    const handleAutoCollapse = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
        setMobileMenuOpen(false);
      }
    };

    handleAutoCollapse();
    window.addEventListener('resize', handleAutoCollapse);
    return () => window.removeEventListener('resize', handleAutoCollapse);
  }, []);

  // Simpan preferensi sidebar di localStorage hanya untuk layar desktop (>= 1024px)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      localStorage.setItem('pos_sidebar_open', String(isSidebarOpen));
    }
  }, [isSidebarOpen]);

  // Otomatis tutup menu mobile dan sembunyikan sidebar saat pengguna memilih menu / halaman
  useEffect(() => {
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, [activePage]);

  // Memoize toggle function
  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  // Daftar menu dibaca dari navItems.ts agar sidebar dan bilah bawah
  // tidak punya dua salinan yang bisa melenceng.
  const navItems = useMemo(() => navItemsFor(userRole), [userRole]);


  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-primary text-white flex flex-col shadow-xl transition-all duration-300 ease-in-out md:static md:translate-x-0 overflow-hidden print:hidden
        ${mobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64 md:translate-x-0'} 
        ${isSidebarOpen ? 'md:w-64' : 'md:w-20'}
        `}
        style={{ contain: 'layout style paint' }}
      >
        {/* Watermark Background */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-96 bg-repeat-x bg-bottom opacity-[0.05] pointer-events-none"
          style={{ backgroundImage: 'url("/sidebar-watermark.jpg")', backgroundSize: '150px' }}
        ></div>

        <div className="p-6 border-b border-white/10 flex items-center justify-between h-[72px] relative z-10">
          <div className="flex items-center gap-3">
            <img src="/icon-192x192.png" alt="Logo Rumah Etnik Papua" className="w-10 h-10 rounded-xl shadow-md border-2 border-white/20 object-contain" />
            {(isSidebarOpen || mobileMenuOpen) && (
              <h1 className="text-2xl font-bold text-white tracking-tighter whitespace-nowrap transition-opacity duration-150">
                KASIR RELY
              </h1>
            )}
          </div>

          {/* Desktop Toggle */}
          <button
            onClick={toggleSidebar}
            className={`hidden md:block text-white/80 hover:text-white bg-white/10 rounded p-2 border border-white/10 shadow-sm transition-all duration-150 hover:bg-white/20 active:scale-95 ${!isSidebarOpen ? 'mx-auto' : ''
              }`}
            aria-label={isSidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}
          >
            <Menu size={18} />
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden text-white/80 hover:text-white bg-white/10 rounded p-2 border border-white/10 shadow-sm transition-all duration-150 hover:bg-white/20 active:scale-95 ml-auto"
            aria-label="Tutup menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 p-4 pt-2 space-y-2 overflow-y-auto overflow-x-hidden sidebar-scroll">
          {navItems.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              isActive={activePage === item.id}
              isSidebarOpen={isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth < 768)} // Always show labels on mobile
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          {(isSidebarOpen || mobileMenuOpen) && (
            <div className="mb-3 space-y-2">
              <div className={`px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-medium transition-colors ${isOnline ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'}`}>
                {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                <span>{isOnline ? 'Online (Sinkron)' : 'Offline (Mode Lokal)'}</span>
              </div>

              {(pendingSync > 0 || restoredPending) && (
                <div className="px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-medium bg-amber-500/20 text-amber-100">
                  <CloudUpload size={14} className="flex-shrink-0 animate-pulse" />
                  <span>
                    {pendingSync > 0
                      ? `${pendingSync} data menunggu terkirim`
                      : 'Ada data belum terkirim'}
                  </span>
                </div>
              )}

              {syncFailures.length > 0 && (
                <button
                  onClick={() => {
                    alert(
                      'Data berikut gagal tersimpan ke server:\n\n' +
                      syncFailures.map((f) => `• ${f.label}\n  ${f.message}`).join('\n\n') +
                      '\n\nCatat nomor transaksinya dan laporkan ke tim IT.'
                    );
                    clearSyncFailures();
                  }}
                  className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold bg-rose-600/30 text-rose-100 hover:bg-rose-600/40 transition-colors text-left"
                >
                  <CloudOff size={14} className="flex-shrink-0" />
                  <span>{syncFailures.length} data GAGAL — ketuk untuk lihat</span>
                </button>
              )}
            </div>
          )}
          {!isSidebarOpen && !mobileMenuOpen && (
            <div className="mb-3 space-y-2">
              <div className={`mx-auto w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isOnline ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'}`} title={isOnline ? 'Online' : 'Offline'}>
                {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              </div>
              {(pendingSync > 0 || restoredPending) && (
                <div
                  className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/20 text-amber-100 text-[10px] font-bold"
                  title={pendingSync > 0 ? `${pendingSync} data menunggu terkirim` : 'Ada data belum terkirim'}
                >
                  {pendingSync > 0 ? pendingSync : <CloudUpload size={14} />}
                </div>
              )}
              {syncFailures.length > 0 && (
                <div className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center bg-rose-600/30 text-rose-100" title={`${syncFailures.length} data gagal tersimpan`}>
                  <CloudOff size={14} />
                </div>
              )}
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white hover:bg-white/10 transition-all duration-150 active:scale-95"
            title={!isSidebarOpen ? 'Keluar' : ''}
          >
            <LogOut size={20} className="flex-shrink-0" />
            {(isSidebarOpen || mobileMenuOpen) && <span className="whitespace-nowrap transition-opacity duration-150">Keluar</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-100 flex flex-col relative w-full min-w-0">
        {/* Header HP: dipadatkan dan tombol hamburger dilepas, karena menu
            lengkap sekarang dibuka dari tombol "Menu" di bilah bawah.
            Status jaringan ikut ke sini supaya terlihat tanpa buka menu. */}
        <div className="md:hidden bg-white px-3 h-11 flex items-center justify-between shadow-sm sticky top-0 z-30 print:hidden">
          <span className="font-bold text-slate-800 text-sm tracking-tight truncate">KASIR RELY</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {(pendingSync > 0 || restoredPending) && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                <CloudUpload size={11} className="animate-pulse" />
                {pendingSync > 0 ? pendingSync : '!'}
              </span>
            )}
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              title={isOnline ? 'Online (Sinkron)' : 'Offline (Mode Lokal)'}
            >
              {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            </span>
          </div>
        </div>

        {/* pb di HP memberi ruang setinggi bilah bawah + safe area iOS,
            supaya baris terakhir tabel dan tombol simpan tidak tertutup. */}
        <div className={`flex-1 w-full mx-auto flex flex-col min-w-0 ruang-bilah-bawah ${activePage === 'pos' ? 'p-0 max-w-full' : 'p-2.5 sm:p-4 md:p-8 max-w-7xl'}`}>
          {children}
        </div>
      </main>

      <BottomNav
        activePage={activePage}
        onNavigate={onNavigate}
        onOpenMenu={() => setMobileMenuOpen(true)}
        userRole={userRole}
        perluPerhatian={!isOnline || pendingSync > 0 || restoredPending || syncFailures.length > 0}
      />
    </div>
  );
};