"use client";

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Globe, MapPin, CheckCircle2, Loader2 } from 'lucide-react';
import {
  COMMON_COUNTRIES,
  INDONESIAN_PROVINCES,
  VISITOR_FACILITIES,
  VisitorLog,
  VisitorOrigin,
  VisitorSegment,
  VisitorServiceType,
  VISITOR_SERVICE_LABEL,
  VisitorBookingChannel,
  VISITOR_CHANNEL_LABEL,
  COMMON_OTA_PLATFORMS,
} from '../types';
import { StorageService } from '../services/storage';
import { generateId, toCanonicalDate } from '../utils';

export interface VisitorPrefill {
  transactionId?: string;
  invoiceNumber?: string;
  ticketRevenue?: number;
  /**
   * Jumlah dari layanan yang kuantitasnya berarti orang (tiket, kostum).
   * Paket tour dan homestay tidak ikut, karena satu paket bisa untuk
   * banyak peserta dan satu baris homestay berarti malam/kamar.
   */
  suggestedPax?: number;
  /** Layanan kunjungan yang terdeteksi dari keranjang. */
  serviceTypes?: VisitorServiceType[];
  /** Ringkasan item yang baru terjual, ditampilkan sebagai konteks. */
  soldSummary?: string;
  agentId?: string;
  agentName?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prefill?: VisitorPrefill;
  recordedById: string;
  recordedByName: string;
  onSaved?: () => void;
}

const SEGMENT_LABEL: Record<VisitorSegment, string> = {
  [VisitorSegment.UMUM]: 'Umum / Perorangan',
  [VisitorSegment.KELUARGA]: 'Keluarga',
  [VisitorSegment.PELAJAR]: 'Pelajar / Mahasiswa',
  [VisitorSegment.INSTANSI]: 'Instansi / Dinas',
  [VisitorSegment.KOMUNITAS]: 'Komunitas / Organisasi',
};

/**
 * Pendataan kunjungan wisatawan.
 *
 * Muncul setelah penjualan tiket masuk di kasir. Dirancang agar cepat
 * diisi: jumlah pengunjung sudah ditebak dari tiket yang baru terjual,
 * dan asal daerah bawaannya Papua Barat Daya karena itu yang paling
 * sering. Pada banyak kunjungan kasir cukup menekan Simpan.
 *
 * Total pengunjung TIDAK diminta sebagai isian terpisah, melainkan
 * dihitung dari dewasa + anak. Dengan begitu syarat konsistensi pada
 * firestore.rules (paxAdult + paxChild == paxTotal) selalu terpenuhi.
 */
export const VisitorLogModal: React.FC<Props> = ({
  isOpen, onClose, prefill, recordedById, recordedByName, onSaved,
}) => {
  // Nilai awal diambil langsung dari prop. Pemanggil memberi `key` yang
  // berbeda tiap transaksi sehingga modal ter-mount ulang dengan isian
  // bersih — lebih tepat daripada mereset state di dalam effect, yang
  // memicu render berantai.
  const [originType, setOriginType] = useState<VisitorOrigin>(VisitorOrigin.NUSANTARA);
  const [originRegion, setOriginRegion] = useState<string>('Papua Barat Daya');
  const [segment, setSegment] = useState<VisitorSegment>(VisitorSegment.UMUM);
  // Jumlah tiket yang baru terjual jadi tebakan awal jumlah dewasa.
  const [paxAdult, setPaxAdult] = useState<string>(String(Math.max(1, prefill?.suggestedPax || 1)));
  const [paxChild, setPaxChild] = useState<string>('0');
  const [groupName, setGroupName] = useState('');
  const [serviceTypes, setServiceTypes] = useState<VisitorServiceType[]>(
    prefill?.serviceTypes && prefill.serviceTypes.length > 0
      ? prefill.serviceTypes
      : [VisitorServiceType.TIKET_MASUK],
  );
  const [bookingChannel, setBookingChannel] = useState<VisitorBookingChannel>(
    prefill?.agentId ? VisitorBookingChannel.TRAVEL_AGENT : VisitorBookingChannel.LANGSUNG,
  );
  const [otaName, setOtaName] = useState('');
  const [facilities, setFacilities] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const paxTotal = useMemo(
    () => (parseInt(paxAdult) || 0) + (parseInt(paxChild) || 0),
    [paxAdult, paxChild],
  );

  const regionOptions = originType === VisitorOrigin.NUSANTARA
    ? INDONESIAN_PROVINCES
    : COMMON_COUNTRIES;

  const toggleService = (t: VisitorServiceType) => {
    setServiceTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const toggleFacility = (name: string) => {
    setFacilities(prev => prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]);
  };

  const handleSave = async () => {
    if (paxTotal <= 0) {
      alert('Jumlah pengunjung minimal 1 orang.');
      return;
    }
    if (!originRegion.trim()) {
      alert(originType === VisitorOrigin.NUSANTARA
        ? 'Provinsi asal wajib diisi untuk laporan kunjungan.'
        : 'Negara asal wajib diisi untuk laporan kunjungan.');
      return;
    }

    if (bookingChannel === VisitorBookingChannel.OTA && !otaName.trim()) {
      alert('Sebutkan platform pemesanannya, misalnya Traveloka atau Booking.com.');
      return;
    }

    setIsSaving(true);
    try {
      const log: VisitorLog = {
        id: generateId(),
        date: toCanonicalDate(),
        groupName: groupName.trim() || undefined,
        originType,
        originRegion: originRegion.trim(),
        segment,
        paxTotal,
        paxAdult: parseInt(paxAdult) || 0,
        paxChild: parseInt(paxChild) || 0,
        serviceTypes: serviceTypes.length > 0 ? serviceTypes : undefined,
        bookingChannel,
        otaName: bookingChannel === VisitorBookingChannel.OTA ? otaName.trim() : undefined,
        facilities: facilities.length > 0 ? facilities : undefined,
        transactionId: prefill?.transactionId,
        invoiceNumber: prefill?.invoiceNumber,
        ticketRevenue: prefill?.ticketRevenue,
        agentId: prefill?.agentId,
        agentName: prefill?.agentName,
        notes: notes.trim() || undefined,
        recordedById,
        recordedByName,
        createdAt: toCanonicalDate(),
      };

      await StorageService.saveVisitorLog(log);
      onSaved?.();
      onClose();
    } catch (error: any) {
      console.error('Gagal menyimpan data pengunjung:', error);
      alert('Gagal menyimpan data pengunjung: ' + (error?.message || error));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">

        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 text-primary rounded-xl"><Users size={18} /></div>
            <div>
              <h3 className="font-bold text-slate-800 text-base leading-tight">Data Pengunjung</h3>
              <p className="text-[11px] text-slate-500">
                {prefill?.invoiceNumber ? `Faktur ${prefill.invoiceNumber}` : 'Pencatatan kunjungan wisatawan'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">

          {prefill?.soldSummary && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">Baru terjual</p>
              <p className="text-xs text-slate-700 leading-snug">{prefill.soldSummary}</p>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Jenis Layanan</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.values(VisitorServiceType).map(t => (
                <button
                  key={t}
                  onClick={() => toggleService(t)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                    serviceTypes.includes(t)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  {VISITOR_SERVICE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Kanal Pemesanan</label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.values(VisitorBookingChannel).map(c => (
                <button
                  key={c}
                  onClick={() => setBookingChannel(c)}
                  className={`py-2 rounded-lg text-[10.5px] font-bold border transition-colors leading-tight ${
                    bookingChannel === c
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  {VISITOR_CHANNEL_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          {bookingChannel === VisitorBookingChannel.OTA && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Platform Pemesanan<span className="text-rose-600"> *</span>
              </label>
              <input
                list="visitor-ota-options"
                value={otaName}
                onChange={e => setOtaName(e.target.value)}
                placeholder="Cth: Traveloka, Booking.com, Airbnb"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <datalist id="visitor-ota-options">
                {COMMON_OTA_PLATFORMS.map(o => <option key={o} value={o} />)}
              </datalist>
            </div>
          )}

          {/* Jenis wisatawan — dasar pemisahan laporan dinas */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Jenis Wisatawan</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: VisitorOrigin.NUSANTARA, l: 'Nusantara', i: <MapPin size={14} /> },
                { v: VisitorOrigin.MANCANEGARA, l: 'Mancanegara', i: <Globe size={14} /> },
              ].map(o => (
                <button
                  key={o.v}
                  onClick={() => {
                    setOriginType(o.v);
                    setOriginRegion(o.v === VisitorOrigin.NUSANTARA ? 'Papua Barat Daya' : '');
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                    originType === o.v
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  {o.i} {o.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              {originType === VisitorOrigin.NUSANTARA ? 'Provinsi Asal' : 'Negara Asal'}
              <span className="text-rose-600"> *</span>
            </label>
            <input
              list="visitor-region-options"
              value={originRegion}
              onChange={e => setOriginRegion(e.target.value)}
              placeholder={originType === VisitorOrigin.NUSANTARA ? 'Pilih atau ketik provinsi' : 'Pilih atau ketik negara'}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <datalist id="visitor-region-options">
              {regionOptions.map(r => <option key={r} value={r} />)}
            </datalist>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Segmen Pengunjung</label>
            <select
              value={segment}
              onChange={e => setSegment(e.target.value as VisitorSegment)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary"
            >
              {Object.entries(SEGMENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Jumlah — total dihitung, bukan diketik */}
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Dewasa</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={paxAdult}
                onChange={e => setPaxAdult(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-center outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Anak</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={paxChild}
                onChange={e => setPaxChild(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-center outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Total</label>
              <div className="w-full px-3 py-2.5 bg-primary/10 border border-primary/30 rounded-xl text-sm font-extrabold text-center text-primary">
                {paxTotal}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Nama Rombongan / Instansi <span className="font-normal text-slate-400">(opsional)</span>
            </label>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Cth: SMA Negeri 1 Sorong"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Fasilitas Dikunjungi <span className="font-normal text-slate-400">(opsional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {VISITOR_FACILITIES.map(f => (
                <button
                  key={f}
                  onClick={() => toggleFacility(f)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                    facilities.includes(f)
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Catatan <span className="font-normal text-slate-400">(opsional)</span>
            </label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="p-4 bg-white border-t border-slate-200 flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || paxTotal <= 0}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm shadow-sm transition-colors ${
              isSaving || paxTotal <= 0
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary/90'}`}
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {isSaving ? 'Menyimpan...' : `Simpan ${paxTotal} Pengunjung`}
          </button>
          <button onClick={onClose} className="w-full text-slate-400 text-xs hover:text-slate-600 py-1">
            Lewati pencatatan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
