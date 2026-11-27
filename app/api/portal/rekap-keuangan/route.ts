import { NextResponse } from 'next/server';
import { adminDb } from '@/src/lib/firebase-admin';
import { isPortalRequest } from '@/src/lib/portal-integration';
import { REKAP_CONTRACT_VERSION, susunPengeluaran, susunRekapKeuangan, type KasLite, type TxLite } from '@/src/lib/rekap-keuangan';
import { resolveReportGroup } from '@/utils/categoryMapping';
import { REPORT_GROUP_LABEL, type Category } from '@/types';

// Admin SDK butuh runtime Node, bukan Edge.
export const runtime = 'nodejs';

const POLA_HARI = /^\d{4}-\d{2}-\d{2}$/;
const MAKS_HARI = 92;

const FIELD_TX = ['type', 'date', 'items', 'totalAmount', 'paymentMethod', 'paymentHistory'] as const;

const keTx = (d: FirebaseFirestore.QueryDocumentSnapshot): TxLite => {
  const x = d.data();
  return {
    id: d.id,
    type: x.type,
    date: x.date,
    totalAmount: x.totalAmount,
    paymentMethod: x.paymentMethod,
    // Hanya field yang diperlukan untuk rekap; nama/HP pelanggan tidak pernah dikirim
    items: Array.isArray(x.items)
      ? x.items.map((i: Record<string, unknown>) => ({ categoryName: i.categoryName, finalPrice: i.finalPrice, price: i.price, qty: i.qty }))
      : [],
    paymentHistory: Array.isArray(x.paymentHistory)
      ? x.paymentHistory.map((p: Record<string, unknown>) => ({ date: p.date, amount: p.amount, method: p.method }))
      : [],
  } as TxLite;
};

/**
 * GET /api/portal/rekap-keuangan?dari=YYYY-MM-DD&sampai=YYYY-MM-DD
 *
 * Rekap pendapatan harian per unit usaha untuk SIK-REP (Sistem Informasi Keuangan REP):
 * kotor, diskon, retur, bersih, dibayar tunai / non-tunai, piutang baru (BON),
 * dan pelunasan piutang per hari, serta daftar kas keluar (biaya operasional Berita Acara
 * dan kas keluar manual) per dokumen. Tanpa data pelanggan maupun nama pengguna kasir.
 *
 * Otorisasi sama dengan endpoint portal lain: Authorization: Bearer <PORTAL_INTEGRATION_SECRET>.
 */
export async function GET(req: Request) {
  if (!isPortalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const dari = params.get('dari') || '';
  const sampai = params.get('sampai') || '';
  if (!POLA_HARI.test(dari) || !POLA_HARI.test(sampai) || dari > sampai) {
    return NextResponse.json({ error: 'Parameter dari/sampai wajib berformat YYYY-MM-DD dan dari ≤ sampai.' }, { status: 400 });
  }
  const selisihHari = (Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86400000;
  if (selisihHari > MAKS_HARI) {
    return NextResponse.json({ error: `Rentang maksimal ${MAKS_HARI} hari.` }, { status: 400 });
  }

  try {
    const db = adminDb();
    // Batas atas ISO agar baris lama berformat ISO ikut terjaring (lihat dayRangeBounds di utils.ts)
    const [periodeSnap, bonSnap, sebagianSnap, kategoriSnap, kasSnap] = await Promise.all([
      db.collection('transactions').where('date', '>=', dari).where('date', '<=', `${sampai}T23:59:59.999Z`).select(...FIELD_TX).get(),
      db.collection('transactions').where('paymentMethod', 'in', ['BON', 'TEMPO']).select(...FIELD_TX).get(),
      db.collection('transactions').where('paymentStatus', 'in', ['SEBAGIAN', 'BELUM_LUNAS']).select(...FIELD_TX).get(),
      db.collection('categories').get(),
      // Rentang tanggal saja (tanpa filter type) agar tidak butuh indeks komposit; type disaring di kode
      db.collection('cashflow')
        .where('date', '>=', dari)
        .where('date', '<=', `${sampai}T23:59:59.999Z`)
        .select('type', 'date', 'category', 'description', 'amount', 'paymentMethod', 'source')
        .get(),
    ]);

    const kategori = kategoriSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);
    const kelompokDari = (namaKategori: string) => {
      const kode = resolveReportGroup(namaKategori, kategori);
      return { kode, label: REPORT_GROUP_LABEL[kode] || kode };
    };

    const hari = susunRekapKeuangan(
      periodeSnap.docs.map(keTx),
      [...bonSnap.docs, ...sebagianSnap.docs].map(keTx),
      dari,
      sampai,
      kelompokDari,
    );

    return NextResponse.json(
      {
        contractVersion: REKAP_CONTRACT_VERSION,
        dari,
        sampai,
        generatedAt: new Date().toISOString(),
        unitUsaha: Object.entries(REPORT_GROUP_LABEL).map(([kode, label]) => ({ kode, label })),
        hari,
        pengeluaran: susunPengeluaran(
          kasSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as KasLite),
          dari,
          sampai,
        ),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('rekap-keuangan error:', error);
    return NextResponse.json({ error: 'Gagal menyusun rekap keuangan.' }, { status: 500 });
  }
}
