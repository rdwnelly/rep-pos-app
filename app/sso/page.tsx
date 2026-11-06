'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/src/lib/firebase';

/**
 * Halaman masuk otomatis dari PORTAL REP.
 * Tiket SSO dibaca dari URL, langsung dihapus dari address bar, lalu ditukar ke custom token.
 */
export default function PortalSsoPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ticket = new URLSearchParams(window.location.search).get('ticket');
    // Jangan biarkan tiket tersimpan di riwayat browser.
    window.history.replaceState(null, '', '/sso');

    const run = async () => {
      if (!ticket) throw new Error('Tiket SSO tidak ditemukan.');
      const res = await fetch('/api/portal/sso/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.customToken) throw new Error(body.error || 'Gagal masuk otomatis.');
      await signInWithCustomToken(auth, body.customToken);
      router.replace('/pos');
    };

    run().catch((err: Error) => setError(err.message));
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50 text-slate-800">
      <div className="max-w-sm w-full text-center space-y-3 p-6 rounded-2xl bg-white shadow">
        {error ? (
          <>
            <p className="font-bold text-red-600">Masuk otomatis gagal</p>
            <p className="text-sm text-slate-600">{error}</p>
            <Link href="/login" className="inline-block mt-2 text-sm font-semibold text-blue-600 underline">
              Masuk manual
            </Link>
          </>
        ) : (
          <>
            <div className="w-10 h-10 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="font-semibold">Masuk dari PORTAL REP…</p>
          </>
        )}
      </div>
    </main>
  );
}
