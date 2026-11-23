"use client";

import React, { useMemo, useRef, useState } from 'react';
import {
  Users, Globe, MapPin, CalendarDays, Download, FileSpreadsheet,
  Trash2, Search, TrendingUp, School, Plus, Ticket,
  Sparkles, Loader2, CheckCircle2, FileText,
} from 'lucide-react';
import { useData } from '../hooks/useData';
import { StorageService } from '../services/storage';
import { User, VisitorLog, VisitorOrigin, VisitorSegment, VisitorServiceType, VISITOR_SERVICE_LABEL, VisitorBookingChannel, VISITOR_CHANNEL_LABEL, Transaction, Category } from '../types';
import { exportToCSV, exportToExcel, formatIDR, formatNumber } from '../utils';
import {
  estimateVisitorsFromTransactions,
  estimateToVisitorLog,
  VISITOR_SOURCE_ESTIMATE,
  type DailyVisitorEstimate,
} from '../utils/visitorEstimate';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { VisitorLogModal } from '../components/VisitorLogModal';
import { VisitorReportDocument } from '../components/VisitorReportDocument';
import { exportElementToPdf } from '../utils/pdfExport';
import { BaganTrenHarian, BaganPeringkat } from '../components/VisitorCharts';

const SEGMENT_LABEL: Record<string, string> = {
  UMUM: 'Umum / Perorangan',
  KELUARGA: 'Keluarga',
  PELAJAR: 'Pelajar / Mahasiswa',
  INSTANSI: 'Instansi / Dinas',
  KOMUNITAS: 'Komunitas',
};

/** Rujukan tetap agar dependensi useMemo tidak berubah tiap render. */
const NO_LOGS: VisitorLog[] = [];
const NO_TRANSACTIONS: Transaction[] = [];
const NO_CATEGORIES: Category[] = [];

const pad = (n: number) => String(n).padStart(2, '0');
const asDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface Props {
  currentUser?: User;
}

/**
 * Laporan kunjungan wisatawan.
 *
 * Pemisahan wisatawan nusantara dan mancanegara beserta daerah asalnya
 * ditampilkan paling menonjol, karena itulah yang diminta dalam
 * pelaporan kunjungan ke dinas pariwisata.
 */
export const VisitorData: React.FC<Props> = ({ currentUser }) => {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [startDate, setStartDate] = useState(asDay(firstOfMonth));
  const [endDate, setEndDate] = useState(asDay(today));
  const [originFilter, setOriginFilter] = useState<'ALL' | VisitorOrigin>('ALL');
  const [segmentFilter, setSegmentFilter] = useState<'ALL' | VisitorSegment>('ALL');
  const [channelFilter, setChannelFilter] = useState<'ALL' | VisitorBookingChannel>('ALL');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<VisitorLog | null>(null);
  // Pencatatan manual untuk tamu yang tidak lewat kasir, misalnya tamu
  // homestay yang reservasinya ditangani sistem terpisah.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualKey, setManualKey] = useState(0);

  // Dibatasi rentang tanggal di sisi server, bukan diunduh seluruhnya.
  const logs = useData(
    () => StorageService.getVisitorLogsByDateRange(startDate, endDate),
    [startDate, endDate],
    'visitor_logs',
  ) ?? NO_LOGS;

  // Dipakai hanya untuk panel estimasi di bawah: menurunkan jumlah
  // pengunjung dari tiket yang terjual pada periode yang sama.
  const transaksi = useData(
    () => StorageService.getTransactionsByDateRange(startDate, endDate),
    [startDate, endDate],
    'transactions',
  ) ?? NO_TRANSACTIONS;
  const kategori = useData(() => StorageService.getCategories(), [], 'categories') ?? NO_CATEGORIES;
  // Dipakai pada kop laporan resmi.
  const storeSettings = useData(() => StorageService.getStoreSettings(), [], 'store_settings');

  const [sedangMenyimpan, setSedangMenyimpan] = useState(false);
  const [hasilSimpan, setHasilSimpan] = useState<string | null>(null);

  /**
   * Estimasi dihitung dari SELURUH log periode ini, bukan dari `filtered`:
   * penanda "sudah ada catatan" harus melihat kenyataan di hari itu,
   * bukan hasil penyaringan yang sedang aktif di layar.
   */
  const estimasi = useMemo(
    () => estimateVisitorsFromTransactions({
      transactions: transaksi,
      categories: kategori,
      existingLogs: logs,
    }),
    [transaksi, kategori, logs],
  );

  /**
   * Seluruh hari yang masih menyisakan pengunjung untuk dicatat.
   *
   * estimateVisitorsFromTransactions sudah mengurangkan pengunjung yang
   * dicatat petugas, dan membuang hari yang sisanya nol — jadi tidak
   * ada lagi hari yang dilewati begitu saja, dan tidak ada tamu yang
   * terhitung dua kali.
   */
  const estimasiBaru = estimasi;

  const totalEstimasiBaru = useMemo(
    () => estimasiBaru.reduce(
      (a, e) => ({
        pax: a.pax + e.paxTotal,
        dewasa: a.dewasa + e.paxAdult,
        anak: a.anak + e.paxChild,
        pendapatan: a.pendapatan + e.ticketRevenue,
      }),
      { pax: 0, dewasa: 0, anak: 0, pendapatan: 0 },
    ),
    [estimasiBaru],
  );

  /**
   * Kategori apa saja yang benar-benar terjual pada periode ini.
   *
   * Dipakai saat estimasi kosong: tanpa ini, "tidak ada penjualan
   * tiket" tidak bisa dibedakan dari "tiketnya ada tapi nama
   * kategorinya belum dikenali", dan layarnya hanya terlihat kosong
   * tanpa petunjuk apa pun.
   */
  const kategoriTerjual = useMemo(() => {
    const map = new Map<string, number>();
    transaksi.forEach(tx => {
      if (!Array.isArray(tx.items)) return;
      tx.items.forEach((item: any) => {
        const nama = (item?.categoryName || '').trim() || '(tanpa kategori)';
        map.set(nama, (map.get(nama) || 0) + (Number(item?.qty) || 0));
      });
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [transaksi]);

  const handleSimpanEstimasi = async () => {
    if (estimasiBaru.length === 0) return;
    const uid = currentUser?.id || (currentUser as any)?.uid;
    if (!uid) {
      alert('Data pengguna tidak terbaca. Muat ulang halaman lalu coba lagi.');
      return;
    }

    const setuju = confirm(
      `Simpan ${estimasiBaru.length} hari (${formatNumber(totalEstimasiBaru.pax)} pengunjung) ` +
      `sebagai Data Pengunjung?\n\n` +
      `Baris ini masuk sebagai data resmi di layar ini dan ikut terhitung pada ` +
      `laporan kunjungan. Asal daerahnya diisi "BELUM DIDATA" dan segmennya "Umum", ` +
      `karena data transaksi tidak memuat asal maupun segmentasi pengunjung.\n\n` +
      `Hari yang sudah punya catatan kunjungan dilewati agar tidak terhitung dua kali.`
    );
    if (!setuju) return;

    setSedangMenyimpan(true);
    setHasilSimpan(null);
    try {
      let tersimpan = 0;
      let gagal = 0;
      for (const e of estimasiBaru) {
        try {
          await StorageService.saveVisitorLog(
            estimateToVisitorLog(e, {
              id: uid,
              name: currentUser?.name || currentUser?.username || 'Petugas',
            }),
          );
          tersimpan += 1;
        } catch (err) {
          gagal += 1;
          console.error('Gagal menyimpan estimasi', e.day, err);
        }
      }
      setHasilSimpan(
        `${tersimpan} hari tersimpan sebagai Data Pengunjung` +
        (gagal > 0 ? ` — ${gagal} hari GAGAL, periksa console.` : '.'),
      );
    } finally {
      setSedangMenyimpan(false);
    }
  };

  /**
   * Hanya log yang layanan kunjungannya mencakup TIKET_MASUK.
   *
   * Tiket masuk adalah satu-satunya indikator bahwa seseorang benar-
   * benar datang berkunjung. Layanan lain (kostum, homestay, paket
   * tour) BUKAN penanda kunjungan — kostum adalah layanan tambahan
   * bagi tamu yang sudah masuk, homestay menghitung malam/kamar, dan
   * satu paket tour bisa untuk puluhan peserta.
   *
   * Dengan penyaringan ini, ringkasan, bagan, tabel, dan ekspor
   * semuanya menunjukkan angka dari penjualan tiket masuk saja.
   */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(l => {
      // Syarat utama: harus ada layanan TIKET_MASUK
      const hasTicket = Array.isArray(l.serviceTypes)
        && l.serviceTypes.includes(VisitorServiceType.TIKET_MASUK);
      if (!hasTicket) return false;

      if (originFilter !== 'ALL' && l.originType !== originFilter) return false;
      if (segmentFilter !== 'ALL' && l.segment !== segmentFilter) return false;
      if (channelFilter !== 'ALL' && (l.bookingChannel || VisitorBookingChannel.LANGSUNG) !== channelFilter) return false;
      if (!q) return true;
      return (
        (l.originRegion || '').toLowerCase().includes(q) ||
        (l.groupName || '').toLowerCase().includes(q) ||
        (l.invoiceNumber || '').toLowerCase().includes(q)
      );
    });
  }, [logs, originFilter, segmentFilter, channelFilter, search]);

  const ringkasan = useMemo(() => {
    let kunjungan = 0, pax = 0, wisnus = 0, wisman = 0, dewasa = 0, anak = 0, pendapatan = 0;
    filtered.forEach(l => {
      kunjungan += 1;
      pax += l.paxTotal || 0;
      dewasa += l.paxAdult || 0;
      anak += l.paxChild || 0;
      pendapatan += l.ticketRevenue || 0;
      if (l.originType === VisitorOrigin.MANCANEGARA) wisman += l.paxTotal || 0;
      else wisnus += l.paxTotal || 0;
    });
    return { kunjungan, pax, wisnus, wisman, dewasa, anak, pendapatan };
  }, [filtered]);

  const perDaerah = useMemo(() => {
    const map = new Map<string, { nama: string; jenis: VisitorOrigin; pax: number; kunjungan: number }>();
    filtered.forEach(l => {
      const nama = (l.originRegion || '-').trim();
      const key = `${l.originType}|${nama.toLowerCase()}`;
      const g = map.get(key) ?? { nama, jenis: l.originType, pax: 0, kunjungan: 0 };
      g.pax += l.paxTotal || 0;
      g.kunjungan += 1;
      map.set(key, g);
    });
    return [...map.values()].sort((a, b) => b.pax - a.pax);
  }, [filtered]);

  const perLayanan = useMemo(() => {
    const map = new Map<string, { pax: number; kunjungan: number }>();
    filtered.forEach(l => {
      const jenis = (l.serviceTypes && l.serviceTypes.length > 0)
        ? l.serviceTypes
        : [VisitorServiceType.LAINNYA];
      // Satu kunjungan bisa memakai beberapa layanan, sehingga ikut
      // terhitung pada masing-masing. Totalnya memang bisa melebihi
      // jumlah pengunjung, dan itu disebutkan pada keterangan kartu.
      jenis.forEach(t => {
        const g = map.get(t) ?? { pax: 0, kunjungan: 0 };
        g.pax += l.paxTotal || 0;
        g.kunjungan += 1;
        map.set(t, g);
      });
    });
    return [...map.entries()].sort((a, b) => b[1].pax - a[1].pax);
  }, [filtered]);

  const perKanal = useMemo(() => {
    const map = new Map<string, { pax: number; kunjungan: number; platform: Set<string> }>();
    filtered.forEach(l => {
      const kanal = l.bookingChannel || VisitorBookingChannel.LANGSUNG;
      const g = map.get(kanal) ?? { pax: 0, kunjungan: 0, platform: new Set<string>() };
      g.pax += l.paxTotal || 0;
      g.kunjungan += 1;
      if (l.otaName) g.platform.add(l.otaName);
      map.set(kanal, g);
    });
    return [...map.entries()].sort((a, b) => b[1].pax - a[1].pax);
  }, [filtered]);

  const perSegmen = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(l => map.set(l.segment, (map.get(l.segment) || 0) + (l.paxTotal || 0)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  /** Rekap harian — diminta instansi untuk melihat sebaran kunjungan. */
  const perHari = useMemo(() => {
    const map = new Map<string, { pax: number; wisnus: number; wisman: number; kunjungan: number }>();
    filtered.forEach(l => {
      const hari = (l.date || '').slice(0, 10);
      if (!hari) return;
      const g = map.get(hari) ?? { pax: 0, wisnus: 0, wisman: 0, kunjungan: 0 };
      const pax = l.paxTotal || 0;
      g.pax += pax;
      g.kunjungan += 1;
      if (l.originType === VisitorOrigin.MANCANEGARA) g.wisman += pax;
      else g.wisnus += pax;
      map.set(hari, g);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  /**
   * Berapa banyak angka dalam laporan ini yang berasal dari estimasi.
   * Laporan untuk instansi WAJIB menyebutkannya — menyerahkan angka
   * perkiraan tanpa keterangan sama saja menyatakannya sebagai hasil
   * pendataan.
   */
  const porsiEstimasi = useMemo(() => {
    let baris = 0;
    let pax = 0;
    filtered.forEach(l => {
      if (l.source !== VISITOR_SOURCE_ESTIMATE) return;
      baris += 1;
      pax += l.paxTotal || 0;
    });
    return { baris, pax };
  }, [filtered]);

  /**
   * Total pengunjung sebenarnya pada periode ini: yang sudah tercatat
   * DITAMBAH tiket yang belum sempat dicatat.
   *
   * Menampilkan angka tercatat saja membuat layar ini melaporkan
   * jumlah yang lebih kecil dari kenyataan selama masih ada tiket yang
   * belum dilengkapi — padahal tiketnya sudah terjual dan tamunya
   * sudah datang. Angka ini tidak berubah setelah tombol "Lengkapi"
   * ditekan: yang pindah hanyalah porsinya, dari "belum dicatat"
   * menjadi "tercatat".
   */
  const totalPengunjungSeluruhnya = useMemo(
    () => ringkasan.pax + estimasi.reduce((a, e) => a + e.paxTotal, 0),
    [ringkasan.pax, estimasi],
  );

  /** Bentuk data untuk bagan tren harian. */
  const dataTren = useMemo(
    () => perHari.map(([hari, v]) => ({
      hari,
      // Sumbu cukup menampilkan tanggalnya; bulan sudah jelas dari
      // rentang yang dipilih di penyaring.
      label: hari.slice(8, 10),
      wisnus: v.wisnus,
      wisman: v.wisman,
    })),
    [perHari],
  );

  const dataDaerah = useMemo(
    () => perDaerah.map(d => ({ nama: d.nama, nilai: d.pax })),
    [perDaerah],
  );

  const dataSegmen = useMemo(
    () => perSegmen.map(([seg, pax]) => ({ nama: SEGMENT_LABEL[seg] || seg, nilai: pax })),
    [perSegmen],
  );

  const barisEkspor = () => filtered.map(l => ({
    Tanggal: (l.date || '').slice(0, 10),
    Waktu: (l.date || '').slice(11, 16),
    'Jenis Wisatawan': l.originType === VisitorOrigin.MANCANEGARA ? 'Mancanegara' : 'Nusantara',
    'Daerah / Negara Asal': l.originRegion || '-',
    Segmen: SEGMENT_LABEL[l.segment] || l.segment,
    'Jenis Layanan': (l.serviceTypes || []).map(t => VISITOR_SERVICE_LABEL[t] || t).join(', ') || '-',
    'Kanal Pemesanan': VISITOR_CHANNEL_LABEL[l.bookingChannel || VisitorBookingChannel.LANGSUNG],
    'Platform OTA': l.otaName || '-',
    Rombongan: l.groupName || '-',
    Sumber: l.source === VISITOR_SOURCE_ESTIMATE ? 'Estimasi dari tiket' : 'Dicatat petugas',
    Dewasa: l.paxAdult || 0,
    Anak: l.paxChild || 0,
    'Total Pengunjung': l.paxTotal || 0,
    'Pendapatan Tiket': l.ticketRevenue || 0,
    Faktur: l.invoiceNumber || '-',
    Petugas: l.recordedByName || '-',
  }));

  const handleExportExcel = () => {
    if (filtered.length === 0) { alert('Tidak ada data kunjungan pada rentang ini.'); return; }
    exportToExcel(barisEkspor(), `Laporan_Kunjungan_${startDate}_sd_${endDate}`, 'Kunjungan Wisatawan');
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) { alert('Tidak ada data kunjungan pada rentang ini.'); return; }
    const data = barisEkspor();
    exportToCSV(
      `laporan-kunjungan-${startDate}-sd-${endDate}.csv`,
      Object.keys(data[0]),
      data.map(r => Object.values(r) as any[]),
    );
  };

  const dokumenRef = useRef<HTMLDivElement>(null);
  const [menyiapkanPdf, setMenyiapkanPdf] = useState(false);

  const handleUnduhPdf = async () => {
    if (filtered.length === 0) {
      alert('Tidak ada data kunjungan pada rentang ini.');
      return;
    }
    setMenyiapkanPdf(true);
    try {
      // Dokumennya baru dirender setelah state ini menyala. Dua frame
      // ditunggu supaya React sempat memasangnya DAN browser sempat
      // menata letaknya — html2canvas memotret apa yang sudah ada, jadi
      // memotret terlalu cepat menghasilkan halaman kosong.
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
      );
      const el = dokumenRef.current;
      if (!el) throw new Error('Dokumen laporan belum siap dirender.');
      await exportElementToPdf(el, `Laporan_Kunjungan_${startDate}_sd_${endDate}.pdf`);
    } catch (err: any) {
      console.error('Gagal membuat PDF laporan kunjungan:', err);
      alert(`Gagal membuat PDF: ${err?.message || err}`);
    } finally {
      setMenyiapkanPdf(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await StorageService.deleteVisitorLog(confirmDelete.id);
    } catch (error: any) {
      alert('Gagal menghapus: ' + (error?.message || error));
    } finally {
      setConfirmDelete(null);
    }
  };

  /**
   * Satu angka memimpin layar, sisanya jadi tile pendamping.
   *
   * Empat kartu berukuran sama membuat pembaca harus memilih sendiri
   * mana yang penting. Total pengunjung adalah angka yang dicari orang
   * saat membuka layar ini, jadi ia tampil paling besar.
   */
  const tile = [
    { label: 'Nusantara', nilai: formatNumber(ringkasan.wisnus), sub: 'Wisatawan domestik', icon: <MapPin size={15} />, warna: 'text-[#eb6834] bg-[#eb6834]/10' },
    { label: 'Mancanegara', nilai: formatNumber(ringkasan.wisman), sub: 'Wisatawan asing', icon: <Globe size={15} />, warna: 'text-[#2a78d6] bg-[#2a78d6]/10' },
    { label: 'Dewasa / Anak', nilai: `${formatNumber(ringkasan.dewasa)} / ${formatNumber(ringkasan.anak)}`, sub: 'Komposisi usia', icon: <Users size={15} />, warna: 'text-slate-600 bg-slate-100' },
    { label: 'Pendapatan Tiket', nilai: formatIDR(ringkasan.pendapatan), sub: 'Tercatat pada periode ini', icon: <TrendingUp size={15} />, warna: 'text-emerald-600 bg-emerald-50' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Data Pengunjung</h1>
          <p className="text-xs text-slate-500 mt-0.5">Pendataan kunjungan wisatawan berdasarkan penjualan Tiket Masuk</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setManualKey(k => k + 1); setManualOpen(true); }}
            className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-xl hover:bg-primary/90 transition-colors text-xs font-bold shadow-sm"
          >
            <Plus size={14} /> Catat Kunjungan
          </button>
          <button
            onClick={handleUnduhPdf}
            disabled={menyiapkanPdf}
            className="flex items-center gap-1.5 bg-[#3b1604] text-white px-3 py-2 rounded-xl hover:bg-[#4a1d06] disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-xs font-bold shadow-sm"
            title="Unduh laporan resmi berkop untuk diserahkan ke instansi"
          >
            {menyiapkanPdf
              ? <><Loader2 size={14} className="animate-spin" /> Menyiapkan...</>
              : <><FileText size={14} /> PDF Laporan Resmi</>}
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 text-emerald-800 px-3 py-2 rounded-xl hover:bg-emerald-100 transition-colors text-xs font-bold">
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors text-xs font-bold">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* Penyaring */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div>
          <label className="text-[11px] font-bold text-slate-600 block mb-1">Dari Tanggal</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 block mb-1">Sampai Tanggal</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 block mb-1">Jenis Wisatawan</label>
          <select value={originFilter} onChange={e => setOriginFilter(e.target.value as any)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium">
            <option value="ALL">Semua</option>
            <option value={VisitorOrigin.NUSANTARA}>Nusantara</option>
            <option value={VisitorOrigin.MANCANEGARA}>Mancanegara</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 block mb-1">Segmen</label>
          <select value={segmentFilter} onChange={e => setSegmentFilter(e.target.value as any)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium">
            <option value="ALL">Semua</option>
            {Object.entries(SEGMENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 block mb-1">Kanal</label>
          <select value={channelFilter} onChange={e => setChannelFilter(e.target.value as any)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium">
            <option value="ALL">Semua</option>
            {Object.values(VisitorBookingChannel).map(c => (
              <option key={c} value={c}>{VISITOR_CHANNEL_LABEL[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 block mb-1">Cari</label>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Daerah / rombongan / faktur"
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
      </div>

      {/* Ringkasan: satu angka utama, empat tile pendamping */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-[#3b1604] to-[#6b2f0d] text-white p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-white/70">
              Total Pengunjung
            </span>
            <div className="p-1.5 rounded-lg bg-white/15"><Users size={15} /></div>
          </div>
          <div className="mt-3">
            <p className="text-4xl font-black leading-none tabular-nums">
              {formatNumber(totalPengunjungSeluruhnya)}
            </p>
            <p className="text-[11px] text-white/70 mt-1.5">
              {totalEstimasiBaru.pax > 0 ? (
                <>
                  {formatNumber(ringkasan.pax)} tercatat ·{' '}
                  <span className="text-amber-200 font-semibold">
                    {formatNumber(totalEstimasiBaru.pax)} dari tiket belum dicatat
                  </span>
                </>
              ) : (
                <>
                  dari {formatNumber(ringkasan.kunjungan)} kunjungan tercatat
                  {porsiEstimasi.pax > 0 && ` · ${formatNumber(porsiEstimasi.pax)} dilengkapi dari tiket`}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          {tile.map(k => (
            <div key={k.label} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">{k.label}</span>
                <div className={`p-1.5 rounded-lg ${k.warna}`}>{k.icon}</div>
              </div>
              <p className="text-xl font-black text-slate-800 tabular-nums">{k.nilai}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {hasilSimpan && (
        <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <CheckCircle2 size={13} /> {hasilSimpan}
        </div>
      )}

      {/* Jenis layanan */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm flex items-center justify-between">
          <span className="flex items-center gap-2"><Ticket size={15} /> Kunjungan per Jenis Layanan</span>
          <span className="text-[11px] font-normal text-slate-500">
            Satu kunjungan bisa memakai lebih dari satu layanan
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-slate-100">
          {perLayanan.length === 0 && <p className="col-span-full p-6 text-center text-slate-400 text-xs">Belum ada data.</p>}
          {perLayanan.map(([jenis, d]) => (
            <div key={jenis} className="p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                {VISITOR_SERVICE_LABEL[jenis as VisitorServiceType] || jenis}
              </p>
              <p className="text-lg font-black text-slate-800">{formatNumber(d.pax)}</p>
              <p className="text-[11px] text-slate-400">{d.kunjungan} kunjungan</p>
            </div>
          ))}
        </div>
      </div>

      {/* Kanal pemesanan */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm">
          Kunjungan per Kanal Pemesanan
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {perKanal.length === 0 && <p className="col-span-full p-6 text-center text-slate-400 text-xs">Belum ada data.</p>}
          {perKanal.map(([kanal, d]) => (
            <div key={kanal} className="p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                {VISITOR_CHANNEL_LABEL[kanal as VisitorBookingChannel] || kanal}
              </p>
              <p className="text-lg font-black text-slate-800">{formatNumber(d.pax)}</p>
              <p className="text-[11px] text-slate-400">
                {d.kunjungan} kunjungan
                {d.platform.size > 0 && ` · ${[...d.platform].join(', ')}`}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bagan statistik. Tren harian lebar penuh karena sumbu waktunya
          butuh ruang; dua daftar peringkat berdampingan di bawahnya. */}
      <BaganTrenHarian data={dataTren} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BaganPeringkat
          judul="Asal Pengunjung Terbanyak"
          keterangan="Daerah dan negara asal, diurutkan dari yang terbanyak"
          data={dataDaerah}
          pesanKosong="Belum ada data asal pengunjung"
        />
        <BaganPeringkat
          judul="Segmentasi Pengunjung"
          keterangan="Komposisi pengunjung menurut jenis rombongan"
          data={dataSegmen}
          pesanKosong="Belum ada data segmentasi"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Asal pengunjung */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm flex items-center gap-2">
            <MapPin size={15} /> Daerah / Negara Asal
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {perDaerah.length === 0 && <p className="p-6 text-center text-slate-400 text-xs">Belum ada data.</p>}
            {perDaerah.map(d => (
              <div key={`${d.jenis}-${d.nama}`} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${d.jenis === VisitorOrigin.MANCANEGARA ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {d.jenis === VisitorOrigin.MANCANEGARA ? 'WISMAN' : 'WISNUS'}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 truncate">{d.nama}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-sm font-black text-slate-800">{formatNumber(d.pax)}</span>
                  <span className="text-[10px] text-slate-400 ml-1">orang</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Segmen */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm flex items-center gap-2">
            <School size={15} /> Komposisi Segmen
          </div>
          <div className="divide-y divide-slate-100">
            {perSegmen.length === 0 && <p className="p-6 text-center text-slate-400 text-xs">Belum ada data.</p>}
            {perSegmen.map(([seg, pax]) => {
              const persen = ringkasan.pax > 0 ? (pax / ringkasan.pax) * 100 : 0;
              return (
                <div key={seg} className="px-4 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700">{SEGMENT_LABEL[seg] || seg}</span>
                    <span className="text-xs font-black text-slate-800">{formatNumber(pax)} <span className="font-normal text-slate-400">({persen.toFixed(1)}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${persen}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Rincian */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm flex items-center justify-between">
          <span className="flex items-center gap-2"><CalendarDays size={15} /> Rincian Kunjungan</span>
          <span className="text-xs font-normal text-slate-500">{filtered.length} catatan</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-bold">Tanggal</th>
                <th className="px-3 py-2 text-left font-bold">Jenis</th>
                <th className="px-3 py-2 text-left font-bold">Asal</th>
                <th className="px-3 py-2 text-left font-bold">Rombongan</th>
                <th className="px-3 py-2 text-center font-bold">Dws</th>
                <th className="px-3 py-2 text-center font-bold">Anak</th>
                <th className="px-3 py-2 text-center font-bold">Total</th>
                <th className="px-3 py-2 text-right font-bold">Tiket</th>
                <th className="px-3 py-2 text-center font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-7">
                    {/* Keadaan kosong yang menjelaskan sebabnya.
                        "Belum ada data" saja menyisakan pertanyaan
                        apakah memang tidak ada kunjungan, atau ada
                        penjualan tiket yang kategorinya tak dikenali. */}
                    <div className="max-w-xl mx-auto text-center space-y-2">
                      <p className="text-sm font-bold text-slate-600">
                        Belum ada catatan kunjungan Tiket Masuk pada rentang ini.
                      </p>
                      {transaksi.length === 0 ? (
                        <p className="text-[11px] text-slate-500">
                          Tidak ada transaksi penjualan apa pun pada periode ini, jadi tidak ada
                          tiket yang bisa dipakai untuk melengkapinya.
                        </p>
                      ) : estimasiBaru.length > 0 ? (
                        <div className="space-y-2.5">
                          <p className="text-[11px] text-slate-500">
                            Ada <strong>{formatNumber(estimasiBaru.length)} hari</strong> dengan penjualan tiket
                            yang belum tercatat, setara{' '}
                            <strong>{formatNumber(totalEstimasiBaru.pax)} pengunjung</strong>.
                          </p>
                          <button
                            onClick={handleSimpanEstimasi}
                            disabled={sedangMenyimpan}
                            className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white px-3.5 py-2 rounded-xl transition-colors text-xs font-bold shadow-sm"
                          >
                            {sedangMenyimpan
                              ? <><Loader2 size={14} className="animate-spin" /> Melengkapi...</>
                              : <><Sparkles size={14} /> Lengkapi {estimasiBaru.length} Hari dari Tiket</>}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[11px] text-slate-500">
                            Ada <strong>{formatNumber(transaksi.length)} transaksi</strong> pada periode ini,
                            tetapi tidak satu pun memuat penjualan <strong>Tiket Masuk</strong> — hanya
                            tiket masuk yang jumlahnya berarti orang.
                          </p>
                          {kategoriTerjual.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 mb-1">
                                Kategori yang terjual pada periode ini:
                              </p>
                              <div className="flex flex-wrap justify-center gap-1">
                                {kategoriTerjual.map(([nama, qty]) => (
                                  <span key={nama} className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                                    {nama}<span className="text-slate-400">×{formatNumber(qty)}</span>
                                  </span>
                                ))}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1.5">
                                Bila tiket sebenarnya terjual, sesuaikan nama kategorinya di
                                Produk → Kategori, atau setel jenis layanan kunjungannya.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {(l.date || '').slice(0, 10)}<span className="text-slate-400 ml-1">{(l.date || '').slice(11, 16)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${l.originType === VisitorOrigin.MANCANEGARA ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {l.originType === VisitorOrigin.MANCANEGARA ? 'WISMAN' : 'WISNUS'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-700">{l.originRegion || '-'}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {l.groupName || <span className="text-slate-300">-</span>}
                    <div className="text-[10px] text-slate-400">{SEGMENT_LABEL[l.segment] || l.segment}</div>
                    {/* Baris hasil perkiraan harus bisa dibedakan dari
                        pencatatan petugas, karena asal daerah dan
                        segmentasinya memang tidak diketahui. */}
                    {l.source === VISITOR_SOURCE_ESTIMATE && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                        <Sparkles size={8} /> Estimasi dari tiket
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">{l.paxAdult || 0}</td>
                  <td className="px-3 py-2 text-center">{l.paxChild || 0}</td>
                  <td className="px-3 py-2 text-center font-black text-slate-800">{l.paxTotal || 0}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{l.ticketRevenue ? formatIDR(l.ticketRevenue) : '-'}</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => setConfirmDelete(l)} title="Hapus catatan"
                      className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dokumen laporan resmi.
          Digeser ke luar layar, BUKAN display:none — html2canvas hanya
          bisa memotret elemen yang benar-benar ditata letaknya oleh
          browser. Dirender hanya saat PDF sedang dibuat, supaya tidak
          membebani layar sehari-hari. */}
      {menyiapkanPdf && (
        <div style={{ position: 'fixed', left: -10000, top: 0, zIndex: -1 }} aria-hidden="true">
          <VisitorReportDocument
            ref={dokumenRef}
            periodeMulai={startDate}
            periodeSelesai={endDate}
            ringkasan={ringkasan}
            perDaerah={perDaerah}
            perSegmen={perSegmen}
            perLayanan={perLayanan}
            perKanal={perKanal}
            perHari={perHari}
            porsiEstimasi={porsiEstimasi}
            storeSettings={storeSettings}
            dibuatOleh={currentUser?.name || currentUser?.username || ''}
          />
        </div>
      )}

      <VisitorLogModal
        key={`manual-${manualKey}`}
        isOpen={manualOpen}
        onClose={() => setManualOpen(false)}
        recordedById={currentUser?.id || (currentUser as any)?.uid || ''}
        recordedByName={currentUser?.name || 'Petugas'}
      />

      <ConfirmationModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Hapus catatan kunjungan?"
        message={confirmDelete
          ? `${confirmDelete.originRegion} — ${confirmDelete.paxTotal} orang\n${(confirmDelete.date || '').slice(0, 10)}\n\nCatatan ini akan hilang dari laporan kunjungan.`
          : ''}
        confirmLabel="Hapus"
        cancelLabel="Batal"
        type="danger"
      />
    </div>
  );
};
