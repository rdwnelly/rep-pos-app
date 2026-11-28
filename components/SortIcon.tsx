import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export type KonfigurasiUrutan = { key: string; direction: 'asc' | 'desc' } | null;

/**
 * Penanda arah pengurutan pada judul kolom tabel.
 *
 * Sebelumnya komponen ini ditulis ulang DI DALAM tiga layar (Produk,
 * Barang Terjual, Riwayat & Utang) dengan isi yang nyaris sama. Karena
 * didefinisikan di dalam badan komponen induknya, React melihat tipe
 * komponen yang BERBEDA pada setiap render — seluruh ikon di kepala
 * tabel dibongkar lalu dipasang ulang setiap kali apa pun di layar itu
 * berubah, termasuk saat mengetik di kolom pencarian. eslint menandainya
 * 23 kali.
 *
 * Didefinisikan di tingkat modul, tipenya tetap sama sepanjang umur
 * aplikasi, jadi React cukup memperbarui propertinya.
 */
export const SortIcon: React.FC<{ column: string; sortConfig: KonfigurasiUrutan }> = ({
  column,
  sortConfig,
}) => {
  if (sortConfig?.key !== column) {
    return <ArrowUpDown size={14} className="ml-1 text-slate-400 inline" />;
  }
  return sortConfig.direction === 'asc'
    ? <ArrowUp size={14} className="ml-1 text-primary inline" />
    : <ArrowDown size={14} className="ml-1 text-primary inline" />;
};
