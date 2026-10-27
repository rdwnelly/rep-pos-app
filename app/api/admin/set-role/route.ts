import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/src/lib/firebase-admin';

// Admin SDK butuh runtime Node, bukan Edge.
export const runtime = 'nodejs';

const VALID_ROLES = ['SUPERADMIN', 'OWNER', 'ADMIN', 'CASHIER', 'GUDANG'];

// Peran pemanggil diambil dari custom claim yang sudah diverifikasi
// proxy.ts. Selama masa transisi claim bisa belum ada, jadi jatuh
// kembali ke dokumen users/{uid} lewat Admin SDK (lolos rules).
const resolveCallerRole = async (req: NextRequest) => {
  const fromClaim = req.headers.get('x-user-role');
  if (fromClaim) return fromClaim;

  const callerId = req.headers.get('x-user-id');
  if (!callerId) return null;

  const snapshot = await adminDb().collection('users').doc(callerId).get();
  return snapshot.exists ? snapshot.data()?.role ?? null : null;
};

export async function POST(req: NextRequest) {
  try {
    const callerRole = await resolveCallerRole(req);

    if (callerRole !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'Akses ditolak. Hanya SUPERADMIN yang dapat mengubah peran.' },
        { status: 403 }
      );
    }

    const { uid, role } = await req.json();

    if (!uid || typeof uid !== 'string') {
      return NextResponse.json({ error: 'uid wajib diisi.' }, { status: 400 });
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Peran "${role}" tidak dikenal. Pilihan: ${VALID_ROLES.join(', ')}.` },
        { status: 400 }
      );
    }

    const auth = adminAuth();
    const user = await auth.getUser(uid);

    // Claim lain dipertahankan agar tidak tertimpa.
    await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), role });

    return NextResponse.json({ success: true, uid, role });
  } catch (error: any) {
    console.error('set-role error:', error);
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Gagal menetapkan peran. Hubungi tim IT.'
        : error.message || String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
