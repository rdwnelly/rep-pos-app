import React from 'react';
import {
  VisitorOrigin,
  VisitorSegment,
  VisitorServiceType,
  VISITOR_SERVICE_LABEL,
  VISITOR_CHANNEL_LABEL,
  type StoreSettings,
} from '../types';
import { formatIDR, formatNumber } from '../utils';

/**
 * Dokumen A4 "Laporan Kunjungan Wisatawan" untuk diserahkan ke instansi.
 *
 * Dipisah dari layar Data Pengunjung karena isinya murni tata letak
 * cetak: tidak ada state, tidak ada interaksi. Komponen ini yang
 * difoto html2canvas saat membuat PDF, jadi seluruh gayanya ditulis
 * inline/utility sederhana — apa pun yang bergantung pada hover,
 * animasi, atau pewarisan dari luar tidak akan ikut terbawa.
 */

const SEGMENT_LABEL: Record<string, string> = {
  UMUM: 'Umum / Perorangan',
  KELUARGA: 'Keluarga',
  PELAJAR: 'Pelajar / Mahasiswa',
  INSTANSI: 'Instansi / Dinas',
  KOMUNITAS: 'Komunitas',
};

const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const tanggalPanjang = (iso: string): string => {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return iso || '-';
  return `${d} ${BULAN[m - 1]} ${y}`;
};

export interface VisitorReportData {
  periodeMulai: string;
  periodeSelesai: string;
  ringkasan: {
    kunjungan: number; pax: number; wisnus: number; wisman: number;
    dewasa: number; anak: number; pendapatan: number;
  };
  perDaerah: { nama: string; jenis: VisitorOrigin; pax: number; kunjungan: number }[];
  perSegmen: [string, number][];
  perLayanan: [string, { pax: number; kunjungan: number }][];
  perKanal: [string, { pax: number; kunjungan: number; platform: Set<string> }][];
  perHari: [string, { pax: number; wisnus: number; wisman: number; kunjungan: number }][];
  porsiEstimasi: { baris: number; pax: number };
  storeSettings?: StoreSettings | null;
  dibuatOleh: string;
}

/**
 * `data-pdf-block` menandai satuan yang TIDAK BOLEH terbelah antar
 * halaman. utils/pdfExport.ts membaca atribut ini untuk memilih titik
 * potong — tanpa itu, html2canvas memotong di tengah tabel atau di
 * tengah blok tanda tangan.
 */
const Bagian: React.FC<{ nomor: string; judul: string; children: React.ReactNode }> = ({ nomor, judul, children }) => (
  <div data-pdf-block style={{ marginTop: 7 }}>
    <div style={{
      background: '#3b1604', color: '#fff', fontWeight: 800, fontSize: 8,
      textTransform: 'uppercase', letterSpacing: '.3px', padding: '2px 6px',
    }}>
      {nomor}. {judul}
    </div>
    {children}
  </div>
);

/** Dua blok bersebelahan: tabel pendek tidak perlu selebar halaman. */
const Dua: React.FC<{ children: [React.ReactNode, React.ReactNode] }> = ({ children }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
    <div style={{ width: '50%', paddingRight: 5, boxSizing: 'border-box' }}>{children[0]}</div>
    <div style={{ width: '50%', paddingLeft: 5, boxSizing: 'border-box' }}>{children[1]}</div>
  </div>
);

const th: React.CSSProperties = {
  border: '1px solid #cbd5e1', padding: '2px 5px', background: '#f1f5f9',
  fontWeight: 700, fontSize: 8, textAlign: 'left',
};
const td: React.CSSProperties = { border: '1px solid #cbd5e1', padding: '2px 5px', fontSize: 8 };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const kosong: React.CSSProperties = { ...td, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' };

export const VisitorReportDocument = React.forwardRef<HTMLDivElement, VisitorReportData>(
  (props, ref) => {
    const {
      periodeMulai, periodeSelesai, ringkasan, perDaerah, perSegmen,
      perLayanan, perKanal, perHari, porsiEstimasi, storeSettings, dibuatOleh,
    } = props;

    const namaLembaga = storeSettings?.name || 'RUMAH ETNIK PAPUA';
    const wisnusDaerah = perDaerah.filter(d => d.jenis !== VisitorOrigin.MANCANEGARA);
    const wismanNegara = perDaerah.filter(d => d.jenis === VisitorOrigin.MANCANEGARA);
    const dicetak = new Date();

    return (
      <div
        ref={ref}
        style={{
          width: 794, background: '#fff', color: '#0f172a', padding: '22px 26px',
          fontFamily: 'Arial, Helvetica, sans-serif', boxSizing: 'border-box',
        }}
      >
        {/* Kop: logo di kiri, identitas di kanan — jauh lebih hemat
            tinggi daripada logo di tengah dengan teks di bawahnya. */}
        <div data-pdf-block style={{ borderBottom: '2px solid #3b1604', paddingBottom: 6, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src="/logo-rep.png"
              alt="Rumah Etnik Papua"
              style={{ height: 42, width: 'auto', objectFit: 'contain', marginRight: 12, flexShrink: 0 }}
            />
            <div style={{ flex: 1, lineHeight: 1.25 }}>
              <div style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                {namaLembaga}
              </div>
              {storeSettings?.address && (
                <div style={{ fontSize: 7.5, color: '#475569' }}>{storeSettings.address}</div>
              )}
              {storeSettings?.phone && (
                <div style={{ fontSize: 7.5, color: '#475569' }}>Telp / WA: {storeSettings.phone}</div>
              )}
            </div>
            <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
                Laporan Kunjungan Wisatawan
              </div>
              <div style={{ fontSize: 8, color: '#334155' }}>
                {tanggalPanjang(periodeMulai)} s/d {tanggalPanjang(periodeSelesai)}
              </div>
            </div>
          </div>
        </div>

        {/* I. Ringkasan — dua pasang label/nilai per baris, bukan
            tujuh baris bertumpuk. */}
        <Bagian nomor="I" judul="Ringkasan Kunjungan">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ ...td, fontWeight: 800 }}>TOTAL PENGUNJUNG (ORANG)</td>
                <td style={{ ...tdNum, width: 95, fontWeight: 900, background: '#fef3c7' }}>{formatNumber(ringkasan.pax)}</td>
                <td style={td}>Jumlah kunjungan</td>
                <td style={{ ...tdNum, width: 95, fontWeight: 700 }}>{formatNumber(ringkasan.kunjungan)}</td>
              </tr>
              <tr>
                <td style={td}>Wisatawan Nusantara</td>
                <td style={tdNum}>{formatNumber(ringkasan.wisnus)}</td>
                <td style={td}>Dewasa</td>
                <td style={tdNum}>{formatNumber(ringkasan.dewasa)}</td>
              </tr>
              <tr>
                <td style={td}>Wisatawan Mancanegara</td>
                <td style={tdNum}>{formatNumber(ringkasan.wisman)}</td>
                <td style={td}>Anak</td>
                <td style={tdNum}>{formatNumber(ringkasan.anak)}</td>
              </tr>
              <tr>
                <td style={td} colSpan={3}>Pendapatan tiket tercatat</td>
                <td style={tdNum}>{formatIDR(ringkasan.pendapatan)}</td>
              </tr>
            </tbody>
          </table>
        </Bagian>

        {/* II & III bersebelahan: daftar asal biasanya pendek. */}
        <Dua>
          <Bagian nomor="II" judul="Asal Wisnus (Provinsi / Daerah)">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 22, textAlign: 'center' }}>No</th>
                  <th style={th}>Daerah Asal</th>
                  <th style={{ ...th, width: 42, textAlign: 'right' }}>Kunj.</th>
                  <th style={{ ...th, width: 52, textAlign: 'right' }}>Pax</th>
                </tr>
              </thead>
              <tbody>
                {wisnusDaerah.length === 0 ? (
                  <tr><td style={kosong} colSpan={4}>Tidak ada data</td></tr>
                ) : wisnusDaerah.map((d, i) => (
                  <tr key={`${d.nama}-${i}`}>
                    <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
                    <td style={td}>{d.nama}</td>
                    <td style={tdNum}>{formatNumber(d.kunjungan)}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{formatNumber(d.pax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bagian>

          <Bagian nomor="III" judul="Asal Wisman (Negara)">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 22, textAlign: 'center' }}>No</th>
                  <th style={th}>Negara Asal</th>
                  <th style={{ ...th, width: 42, textAlign: 'right' }}>Kunj.</th>
                  <th style={{ ...th, width: 52, textAlign: 'right' }}>Pax</th>
                </tr>
              </thead>
              <tbody>
                {wismanNegara.length === 0 ? (
                  <tr><td style={kosong} colSpan={4}>Nihil pada periode ini</td></tr>
                ) : wismanNegara.map((d, i) => (
                  <tr key={`${d.nama}-${i}`}>
                    <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
                    <td style={td}>{d.nama}</td>
                    <td style={tdNum}>{formatNumber(d.kunjungan)}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{formatNumber(d.pax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bagian>
        </Dua>

        {/* IV & V bersebelahan. */}
        <Dua>
          <Bagian nomor="IV" judul="Segmentasi Pengunjung">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Segmen</th>
                  <th style={{ ...th, width: 52, textAlign: 'right' }}>Pax</th>
                  <th style={{ ...th, width: 52, textAlign: 'right' }}>Porsi</th>
                </tr>
              </thead>
              <tbody>
                {perSegmen.length === 0 ? (
                  <tr><td style={kosong} colSpan={3}>Tidak ada data</td></tr>
                ) : perSegmen.map(([seg, pax]) => (
                  <tr key={seg}>
                    <td style={td}>{SEGMENT_LABEL[seg] || seg}</td>
                    <td style={tdNum}>{formatNumber(pax)}</td>
                    <td style={tdNum}>
                      {ringkasan.pax > 0 ? `${((pax / ringkasan.pax) * 100).toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bagian>

          <Bagian nomor="V" judul="Jenis Layanan Digunakan">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Layanan</th>
                  <th style={{ ...th, width: 42, textAlign: 'right' }}>Kunj.</th>
                  <th style={{ ...th, width: 52, textAlign: 'right' }}>Pax</th>
                </tr>
              </thead>
              <tbody>
                {perLayanan.length === 0 ? (
                  <tr><td style={kosong} colSpan={3}>Tidak ada data</td></tr>
                ) : perLayanan.map(([jenis, v]) => (
                  <tr key={jenis}>
                    <td style={td}>{VISITOR_SERVICE_LABEL[jenis as VisitorServiceType] || jenis}</td>
                    <td style={tdNum}>{formatNumber(v.kunjungan)}</td>
                    <td style={tdNum}>{formatNumber(v.pax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bagian>
        </Dua>

        <Bagian nomor="VI" judul="Kanal Pemesanan">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Kanal</th>
                <th style={th}>Platform</th>
                <th style={{ ...th, width: 90, textAlign: 'right' }}>Pengunjung</th>
              </tr>
            </thead>
            <tbody>
              {perKanal.length === 0 ? (
                <tr><td style={kosong} colSpan={3}>Tidak ada data</td></tr>
              ) : perKanal.map(([kanal, v]) => (
                <tr key={kanal}>
                  <td style={td}>{VISITOR_CHANNEL_LABEL[kanal as keyof typeof VISITOR_CHANNEL_LABEL] || kanal}</td>
                  <td style={td}>{[...v.platform].filter(Boolean).join(', ') || '-'}</td>
                  <td style={tdNum}>{formatNumber(v.pax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 7, color: '#64748b', marginTop: 2 }}>
            Satu kunjungan dapat memakai lebih dari satu layanan, sehingga jumlah pada bagian V
            dapat melebihi total pengunjung.
          </div>
        </Bagian>

        {/* VII. Rincian harian */}
        <Bagian nomor="VII" judul="Rincian Kunjungan Harian">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Tanggal</th>
                <th style={{ ...th, width: 90, textAlign: 'right' }}>Kunjungan</th>
                <th style={{ ...th, width: 90, textAlign: 'right' }}>Wisnus</th>
                <th style={{ ...th, width: 90, textAlign: 'right' }}>Wisman</th>
                <th style={{ ...th, width: 100, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {perHari.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', color: '#94a3b8' }} colSpan={5}>Tidak ada data</td></tr>
              ) : perHari.map(([hari, v]) => (
                <tr key={hari}>
                  <td style={td}>{tanggalPanjang(hari)}</td>
                  <td style={tdNum}>{formatNumber(v.kunjungan)}</td>
                  <td style={tdNum}>{formatNumber(v.wisnus)}</td>
                  <td style={tdNum}>{formatNumber(v.wisman)}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{formatNumber(v.pax)}</td>
                </tr>
              ))}
            </tbody>
            {perHari.length > 0 && (
              <tfoot>
                <tr>
                  <td style={{ ...td, fontWeight: 900, background: '#fef3c7' }}>JUMLAH</td>
                  <td style={{ ...tdNum, fontWeight: 900, background: '#fef3c7' }}>{formatNumber(ringkasan.kunjungan)}</td>
                  <td style={{ ...tdNum, fontWeight: 900, background: '#fef3c7' }}>{formatNumber(ringkasan.wisnus)}</td>
                  <td style={{ ...tdNum, fontWeight: 900, background: '#fef3c7' }}>{formatNumber(ringkasan.wisman)}</td>
                  <td style={{ ...tdNum, fontWeight: 900, background: '#fef3c7' }}>{formatNumber(ringkasan.pax)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </Bagian>

        {/* Keterangan + tanda tangan dijadikan SATU blok.
            Pada hasil cetak sebelumnya blok tanda tangan terbelah dua
            halaman: "Dibuat oleh," tertinggal di halaman pertama dan
            namanya pindah ke halaman berikutnya. */}
        <div data-pdf-block style={{ marginTop: 9 }}>
        <div style={{ border: '1px solid #cbd5e1', padding: 6, fontSize: 7.5 }}>
          <div style={{ fontWeight: 800, marginBottom: 2 }}>Keterangan Sumber Data</div>
          {porsiEstimasi.baris > 0 ? (
            <div>
              Sebanyak <strong>{formatNumber(porsiEstimasi.pax)} pengunjung</strong> ({porsiEstimasi.baris} baris)
              dalam laporan ini merupakan <strong>angka perkiraan</strong> yang dihitung dari jumlah tiket
              masuk terjual, bukan hasil pendataan langsung. Asal daerah untuk bagian tersebut tercatat
              sebagai &quot;BELUM DIDATA&quot;. Sisanya merupakan pencatatan oleh petugas.
            </div>
          ) : (
            <div>Seluruh angka dalam laporan ini berasal dari pencatatan kunjungan oleh petugas.</div>
          )}
        </div>

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 210, textAlign: 'center', fontSize: 8 }}>
              <div>Sorong, {tanggalPanjang(
                `${dicetak.getFullYear()}-${String(dicetak.getMonth() + 1).padStart(2, '0')}-${String(dicetak.getDate()).padStart(2, '0')}`,
              )}</div>
              <div style={{ marginTop: 1 }}>Dibuat oleh,</div>
              <div style={{ height: 42 }} />
              <div style={{ fontWeight: 800, textDecoration: 'underline', textTransform: 'uppercase' }}>
                {dibuatOleh || '..............................'}
              </div>
              <div style={{ color: '#475569' }}>{namaLembaga}</div>
            </div>
          </div>

          <div style={{ marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 3, fontSize: 6.5, color: '#94a3b8', textAlign: 'center' }}>
            Dokumen ini dihasilkan otomatis oleh sistem KASIR RELY pada{' '}
            {dicetak.toLocaleString('id-ID')}.
          </div>
        </div>
      </div>
    );
  },
);

VisitorReportDocument.displayName = 'VisitorReportDocument';
