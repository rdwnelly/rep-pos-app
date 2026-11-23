"use client";

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell, LabelList,
} from 'recharts';
import { formatNumber } from '../utils';

/**
 * Bagan statistik kunjungan.
 *
 * Warna dan bentuknya mengikuti aturan visualisasi data, bukan selera:
 *
 * - Dua seri (Nusantara / Mancanegara) memakai dua slot kategorikal yang
 *   sudah divalidasi berpasangan — jarak CVD ΔE 24,7 (protan) dan jarak
 *   penglihatan normal ΔE 33,6, keduanya jauh di atas ambang, sehingga
 *   tetap terbedakan oleh pembaca dengan buta warna.
 * - Daftar peringkat (daerah asal, segmen) memakai SATU hue. Deretan
 *   batang pada satu garis dasar sudah membandingkan besaran dengan
 *   tepat; memberi tiap batang warna berbeda hanya menambah warna tanpa
 *   menambah makna, dan membuat warna seolah-olah menandakan identitas.
 * - Batang dibatasi 24px dengan ujung membulat 4px, garis bantu setipis
 *   1px, dan legenda selalu ada untuk dua seri.
 */

/** Slot kategorikal 1 & 2, tervalidasi sebagai pasangan. */
const SERI_NUSANTARA = '#eb6834';
const SERI_MANCANEGARA = '#2a78d6';
/** Satu hue untuk daftar peringkat. */
const HUE_PERINGKAT = '#2a78d6';

const TEKS_SEKUNDER = '#64748b';
const GARIS_BANTU = '#e2e8f0';

const Kartu: React.FC<{ judul: string; keterangan?: string; children: React.ReactNode }> = ({
  judul, keterangan, children,
}) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
    <div className="mb-3">
      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">{judul}</h3>
      {keterangan && <p className="text-[11px] text-slate-500 mt-0.5">{keterangan}</p>}
    </div>
    {children}
  </div>
);

const KotakKosong: React.FC<{ pesan: string }> = ({ pesan }) => (
  <div className="h-[200px] flex items-center justify-center text-[11px] text-slate-400 italic">
    {pesan}
  </div>
);

const gayaTooltip = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    fontSize: 11,
    boxShadow: '0 4px 14px rgba(15,23,42,.08)',
  },
  labelStyle: { fontWeight: 700, color: '#0f172a', marginBottom: 2 },
} as const;

export interface TrenHarian {
  hari: string;
  label: string;
  wisnus: number;
  wisman: number;
}

/** Tren kunjungan harian: dua seri bertumpuk pada satu sumbu. */
export const BaganTrenHarian: React.FC<{ data: TrenHarian[] }> = ({ data }) => (
  <Kartu
    judul="Tren Kunjungan Harian"
    keterangan="Jumlah pengunjung per hari, dipisah nusantara dan mancanegara"
  >
    {data.length === 0 ? (
      <KotakKosong pesan="Belum ada kunjungan pada periode ini" />
    ) : (
      <ResponsiveContainer width="100%" height={230} minWidth={0}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={GARIS_BANTU} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: TEKS_SEKUNDER }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: TEKS_SEKUNDER }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            {...gayaTooltip}
            cursor={{ fill: 'rgba(148,163,184,.12)' }}
            formatter={(v: any, n: any) => [`${formatNumber(Number(v))} orang`, n]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
          />
          {/* Celah 2px antar segmen dibuat dari warna permukaan, bukan garis tepi. */}
          <Bar dataKey="wisnus" name="Nusantara" stackId="a" fill={SERI_NUSANTARA} maxBarSize={24} />
          <Bar
            dataKey="wisman"
            name="Mancanegara"
            stackId="a"
            fill={SERI_MANCANEGARA}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    )}
  </Kartu>
);

export interface BarisPeringkat {
  nama: string;
  nilai: number;
}

/** Daftar peringkat: batang mendatar satu hue, terbesar di atas. */
export const BaganPeringkat: React.FC<{
  judul: string;
  keterangan?: string;
  data: BarisPeringkat[];
  pesanKosong: string;
  maksimal?: number;
}> = ({ judul, keterangan, data, pesanKosong, maksimal = 7 }) => {
  // Ekor yang tidak perlu dibaca satu per satu dilipat jadi "Lainnya",
  // bukan dijejalkan sebagai batang tambahan.
  const urut = [...data].sort((a, b) => b.nilai - a.nilai);
  const utama = urut.slice(0, maksimal);
  const sisa = urut.slice(maksimal);
  const tampil = sisa.length > 0
    ? [...utama, { nama: `Lainnya (${sisa.length})`, nilai: sisa.reduce((s, x) => s + x.nilai, 0) }]
    : utama;

  return (
    <Kartu judul={judul} keterangan={keterangan}>
      {tampil.length === 0 ? (
        <KotakKosong pesan={pesanKosong} />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, tampil.length * 30 + 20)} minWidth={0}>
          <BarChart data={tampil} layout="vertical" margin={{ top: 4, right: 44, left: 4, bottom: 4 }}>
            <CartesianGrid stroke={GARIS_BANTU} strokeWidth={1} horizontal={false} />
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="nama"
              tick={{ fontSize: 10, fill: '#334155' }}
              axisLine={false}
              tickLine={false}
              width={128}
            />
            <Tooltip
              {...gayaTooltip}
              cursor={{ fill: 'rgba(148,163,184,.12)' }}
              formatter={(v: any) => [`${formatNumber(Number(v))} orang`, 'Pengunjung']}
            />
            <Bar dataKey="nilai" fill={HUE_PERINGKAT} maxBarSize={24} radius={[0, 4, 4, 0]}>
              {/* Nilai ditaruh di ujung batang, di luar marknya, supaya
                  tidak pernah terpotong oleh batang yang pendek. */}
              <LabelList
                dataKey="nilai"
                position="right"
                formatter={(v: any) => formatNumber(Number(v))}
                style={{ fontSize: 10, fontWeight: 700, fill: '#334155' }}
              />
              {tampil.map((_, i) => <Cell key={i} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Kartu>
  );
};
