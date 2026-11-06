import { NextResponse } from 'next/server';
import { adminDb } from '@/src/lib/firebase-admin';
import {
  formatTrend,
  isPortalRequest,
  periodRange,
  PORTAL_CONTRACT_VERSION,
  PORTAL_PERIODS,
  type PortalPeriod,
} from '@/src/lib/portal-integration';

// Admin SDK butuh runtime Node, bukan Edge.
export const runtime = 'nodejs';

// Sama dengan aturan "stok menipis" di Dashboard POS (stock < 10).
const LOW_STOCK_THRESHOLD = 10;

type TxLite = {
  type?: string;
  totalAmount?: number;
  items?: { name?: string; qty?: number }[];
};

/** Penjualan bersih = penjualan kotor − retur (sama dengan KPI Dashboard POS). */
const netSales = (txs: TxLite[]) =>
  txs.reduce((sum, t) => sum + (t.type === 'RETURN' ? -Math.abs(t.totalAmount || 0) : t.totalAmount || 0), 0);

const loadTransactions = async (start: string, end: string): Promise<TxLite[]> => {
  const snap = await adminDb()
    .collection('transactions')
    .where('date', '>=', start)
    .where('date', '<=', end)
    .select('type', 'totalAmount', 'items')
    .get();
  return snap.docs.map((d) => d.data() as TxLite);
};

/**
 * GET /api/portal/summary?period=TODAY|THIS_WEEK|THIS_MONTH
 * Ringkasan penjualan & stok untuk Dasbor Eksekutif PORTAL REP.
 * Hanya angka agregat — tidak ada data pelanggan/transaksi individual yang dikirim.
 */
export async function GET(req: Request) {
  if (!isPortalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requested = new URL(req.url).searchParams.get('period') as PortalPeriod | null;
  const period: PortalPeriod = requested && PORTAL_PERIODS.includes(requested) ? requested : 'TODAY';
  const range = periodRange(period);

  try {
    const [current, previous, productsSnap] = await Promise.all([
      loadTransactions(range.start, range.end),
      loadTransactions(range.prevStart, range.prevEnd),
      adminDb().collection('products').select('name', 'stock', 'categoryName', 'unit').get(),
    ]);

    const sales = current.filter((t) => t.type !== 'RETURN');
    const salesVolume = netSales(current);

    const qtyByItem = new Map<string, number>();
    sales.forEach((t) =>
      (t.items || []).forEach((item) => {
        if (!item?.name) return;
        qtyByItem.set(item.name, (qtyByItem.get(item.name) || 0) + (Number(item.qty) || 0));
      })
    );
    const popular = [...qtyByItem.entries()].sort((a, b) => b[1] - a[1])[0];

    const products = productsSnap.docs.map((d) => d.data());
    const lowStockAlerts = products
      .filter((p) => typeof p.stock === 'number' && p.stock < LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 10)
      .map((p) => ({
        itemName: String(p.name || 'Tanpa nama'),
        currentStock: p.stock as number,
        minThreshold: LOW_STOCK_THRESHOLD,
        category: String(p.categoryName || 'Lainnya'),
        unit: String(p.unit || 'Pcs'),
      }));

    return NextResponse.json(
      {
        contractVersion: PORTAL_CONTRACT_VERSION,
        period,
        generatedAt: new Date().toISOString(),
        data: {
          dailySalesVolume: salesVolume,
          dailyTransactionsCount: sales.length,
          totalMonitoredItems: products.length,
          lowStockAlerts,
          popularItemToday: popular ? `${popular[0]} (${popular[1]}x)` : 'Belum ada penjualan',
          // POS belum memiliki fitur tutup shift; status selalu OPEN sampai fitur itu ada.
          settlementStatus: 'OPEN',
          trendSales: formatTrend(salesVolume, netSales(previous), range.compareLabel),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('portal summary error:', error);
    return NextResponse.json({ error: 'Gagal menyusun ringkasan.' }, { status: 500 });
  }
}
