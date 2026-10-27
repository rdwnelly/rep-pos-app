import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Aplikasi ini memakai Firebase Auth, bukan JWT buatan sendiri.
// Sebelumnya proxy menuntut cookie 'token' yang tidak pernah
// diset oleh alur login mana pun, sehingga SEMUA /api selalu 401.
// Sekarang yang diverifikasi adalah ID token Firebase dari header
// Authorization: Bearer <idToken>.
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

// Kunci publik Google untuk ID token Firebase; createRemoteJWKSet
// menyimpan hasilnya di cache sehingga aman dipakai di Edge.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwks/securetoken@system.gserviceaccount.com')
);

// Semua route /api sekarang butuh ID token. Daftar ini dipertahankan
// agar route publik berikutnya mudah ditambahkan.
const PUBLIC_PATHS: string[] = [];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized: ID token Firebase tidak dikirim' },
      { status: 401 }
    );
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', String(payload.user_id || payload.sub || ''));
    requestHeaders.set('x-user-email', String(payload.email || ''));
    // Kosong bila custom claim belum di-backfill; route yang butuh
    // peran wajib menyediakan fallback-nya sendiri.
    requestHeaders.set('x-user-role', typeof payload.role === 'string' ? payload.role : '');

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: ID token tidak valid atau kedaluwarsa' },
      { status: 403 }
    );
  }
}

export const config = {
  matcher: '/api/:path*',
};
