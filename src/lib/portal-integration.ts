/**
 * Integrasi dengan PORTAL REP (Yayasan Rumah Etnik Papua).
 *
 * Portal memanggil endpoint /api/portal/* dari SERVER-nya dengan header
 *   Authorization: Bearer <PORTAL_INTEGRATION_SECRET>
 * Secret yang sama diisi di portal sebagai INTEGRATION_POS_SECRET. Minimal 32 karakter;
 * buat dengan: openssl rand -hex 32
 *
 * Kontrak lengkap: lihat docs/KONTRAK_INTEGRASI.md di repo portal-rep.
 */
import { timingSafeEqual } from 'node:crypto';
import { dayRangeBounds, toCanonicalDay } from '../../utils';

export const PORTAL_CONTRACT_VERSION = 1;

export type PortalPeriod = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH';
export const PORTAL_PERIODS: PortalPeriod[] = ['TODAY', 'THIS_WEEK', 'THIS_MONTH'];

/** true bila header Authorization berisi secret integrasi portal yang benar. */
export const isPortalRequest = (req: Request): boolean => {
  const expected = process.env.PORTAL_INTEGRATION_SECRET?.trim() || '';
  if (expected.length < 32) return false; // integrasi dimatikan bila secret belum diset / terlalu pendek

  const header = req.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

// ---------- Rentang tanggal (zona toko: Asia/Jayapura, format kanonik POS) ----------

/** Geser hari kalender "YYYY-MM-DD" sebanyak n hari (aman terhadap DST karena memakai UTC siang). */
const shiftDay = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const daysInMonth = (year: number, month1: number) => new Date(Date.UTC(year, month1, 0)).getUTCDate();

export interface PeriodRange {
  start: string;
  end: string;
  /** Rentang pembanding untuk tren (periode sebelumnya dengan panjang yang sama). */
  prevStart: string;
  prevEnd: string;
  compareLabel: string;
}

export const periodRange = (period: PortalPeriod, now: Date = new Date()): PeriodRange => {
  const today = toCanonicalDay(now);

  if (period === 'TODAY') {
    const yesterday = shiftDay(today, -1);
    const cur = dayRangeBounds(today, today);
    const prev = dayRangeBounds(yesterday, yesterday);
    return { start: cur.start, end: cur.end, prevStart: prev.start, prevEnd: prev.end, compareLabel: 'kemarin' };
  }

  if (period === 'THIS_WEEK') {
    // Pekan dimulai Senin.
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Minggu
    const monday = shiftDay(today, -((weekday + 6) % 7));
    const cur = dayRangeBounds(monday, today);
    const prev = dayRangeBounds(shiftDay(monday, -7), shiftDay(today, -7));
    return { start: cur.start, end: cur.end, prevStart: prev.start, prevEnd: prev.end, compareLabel: 'pekan lalu' };
  }

  // THIS_MONTH: tanggal 1 s.d. hari ini, dibandingkan dengan rentang yang sama bulan lalu.
  const [y, m, d] = today.split('-').map(Number);
  const firstDay = `${today.slice(0, 7)}-01`;
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  const prevEndDay = Math.min(d, daysInMonth(prevYear, prevMonth));
  const cur = dayRangeBounds(firstDay, today);
  const prev = dayRangeBounds(`${prevMonthStr}-01`, `${prevMonthStr}-${String(prevEndDay).padStart(2, '0')}`);
  return { start: cur.start, end: cur.end, prevStart: prev.start, prevEnd: prev.end, compareLabel: 'bulan lalu' };
};

/** "+12,5% vs kemarin" — atau keterangan yang jujur bila pembandingnya nol. */
export const formatTrend = (current: number, previous: number, label: string): string => {
  if (previous <= 0) return current > 0 ? `Baru (${label}: Rp0)` : `Tidak ada penjualan`;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% vs ${label}`;
};
