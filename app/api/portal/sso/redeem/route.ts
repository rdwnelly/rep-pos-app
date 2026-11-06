import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/src/lib/firebase-admin';

export const runtime = 'nodejs';

const SSO_TICKETS = 'portal_sso_tickets';

/**
 * POST /api/portal/sso/redeem  (browser → POS)
 * Body: { ticket }
 * Menukar tiket SSO (sekali pakai, berlaku 60 detik) dengan Firebase custom token.
 * Tiket dihapus di dalam transaksi sehingga tidak bisa dipakai dua kali.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ticket = typeof body.ticket === 'string' ? body.ticket : '';
  if (!/^[a-f0-9]{64}$/.test(ticket)) {
    return NextResponse.json({ error: 'Tiket tidak valid.' }, { status: 400 });
  }

  const db = adminDb();
  const ref = db.collection(SSO_TICKETS).doc(ticket);

  let uid: string | null = null;
  try {
    uid = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      tx.delete(ref);
      const data = snap.data()!;
      return data.expiresAt.toMillis() >= Date.now() ? (data.uid as string) : null;
    });
  } catch (error) {
    console.error('sso redeem error:', error);
    return NextResponse.json({ error: 'Gagal memproses tiket.' }, { status: 500 });
  }

  if (!uid) {
    return NextResponse.json(
      { error: 'Tiket sudah dipakai atau kedaluwarsa. Buka kembali aplikasi dari PORTAL REP.' },
      { status: 410 }
    );
  }

  // Custom claim role akun tetap berlaku pada ID token yang dihasilkan.
  const customToken = await adminAuth().createCustomToken(uid, { sso: 'portal-rep' });
  return NextResponse.json({ customToken });
}
