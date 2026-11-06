import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/src/lib/firebase-admin';
import { isPortalRequest } from '@/src/lib/portal-integration';

export const runtime = 'nodejs';

const SSO_TICKETS = 'portal_sso_tickets';
const TICKET_TTL_MS = 60_000;

/**
 * POST /api/portal/sso/ticket  (server PORTAL REP → server POS, dengan secret bersama)
 * Body: { email }
 * Portal sudah memverifikasi identitas staf; POS hanya menerbitkan tiket bila email tersebut
 * memang punya akun POS yang aktif. Hak akses di POS tetap mengikuti role POS akun itu.
 */
export async function POST(req: Request) {
  if (!isPortalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) {
    return NextResponse.json({ error: 'email wajib diisi.' }, { status: 400 });
  }

  let uid: string;
  try {
    const user = await adminAuth().getUserByEmail(email);
    if (user.disabled) {
      return NextResponse.json({ error: 'Akun POS untuk email ini dinonaktifkan.', code: 'DISABLED' }, { status: 403 });
    }
    uid = user.uid;
  } catch {
    return NextResponse.json(
      { error: 'Email ini belum memiliki akun di aplikasi POS. Minta SUPERADMIN POS membuatkannya.', code: 'NO_ACCOUNT' },
      { status: 404 }
    );
  }

  const ticket = randomBytes(32).toString('hex');
  await adminDb()
    .collection(SSO_TICKETS)
    .doc(ticket)
    .set({
      uid,
      email,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + TICKET_TTL_MS),
    });

  const origin = new URL(req.url).origin;
  return NextResponse.json({ url: `${origin}/sso?ticket=${ticket}`, expiresInSeconds: TICKET_TTL_MS / 1000 });
}
