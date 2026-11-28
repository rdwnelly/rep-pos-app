import { useState, useEffect } from 'react';
import { subscribeToChanges } from '../services/storage';
import { recordLoadFailure, recordLoadSuccess } from '../services/loadStatus';
import { auth } from '../src/lib/firebase';

export function useData<T>(fetcher: () => Promise<T>, deps: any[] = [], relevantEntities?: string | string[]): T | undefined {
    const [data, setData] = useState<T | undefined>(undefined);
    // Track whether Firebase Auth has resolved (user or null — either way, auth is ready)
    const [authReady, setAuthReady] = useState(false);

    useEffect(() => {
        // Wait for Firebase Auth to resolve before making any Firestore calls.
        // This prevents "Missing or insufficient permissions" errors that occur
        // when Firestore Security Rules require request.auth != null but the SDK
        // hasn't confirmed the user's identity yet at component mount time.
        const unsubscribeAuth = auth.onAuthStateChanged(() => {
            setAuthReady(true);
            unsubscribeAuth();
        });
        return () => unsubscribeAuth();
    }, []);

    useEffect(() => {
        if (!authReady) return;

        let isMounted = true;
        const entityKeys = relevantEntities
            ? (Array.isArray(relevantEntities) ? relevantEntities : [relevantEntities])
            : [];

        const fetchData = async () => {
            try {
                const result = await fetcher();
                if (isMounted) setData(result);
                // Pemuatan yang berhasil menghapus catatan gagal sebelumnya,
                // supaya gangguan jaringan sesaat tidak menyisakan peringatan
                // basi di layar setelah datanya benar-benar masuk.
                entityKeys.forEach(recordLoadSuccess);
            } catch (error: any) {
                // Nama koleksinya disebutkan. Tanpa ini, kegagalan baca
                // hanya muncul sebagai "Missing or insufficient
                // permissions" tanpa petunjuk koleksi mana yang ditolak,
                // dan satu layar bisa membaca selusin koleksi.
                const label = entityKeys.length ? entityKeys.join(', ') : 'tidak diketahui';

                // Dicatat agar muncul sebagai banner di layar. Sebelumnya
                // kegagalan baca hanya ada di Console, sehingga layar kosong
                // karena ditolak server tidak bisa dibedakan dari layar
                // kosong karena datanya memang belum ada.
                entityKeys.forEach((key) => recordLoadFailure(key, error));
                const isPermission =
                    error?.code === 'permission-denied' ||
                    /insufficient permissions/i.test(String(error?.message ?? ''));
                console.error(
                    `Gagal memuat data [${label}]` +
                    (isPermission
                        ? ' — DITOLAK aturan Firestore. Catatan: aturan yang menyaring'
                          + ' per-dokumen (mis. transactions dibatasi cashierId) membuat'
                          + ' pembacaan SELURUH koleksi ditolak untuk peran non-admin.'
                        : ''),
                    error,
                );
            }
        };

        fetchData();

        const unsubscribe = subscribeToChanges((changedEntity?: string) => {
            if (!changedEntity || !relevantEntities) {
                fetchData();
            } else {
                const entities = Array.isArray(relevantEntities) ? relevantEntities : [relevantEntities];
                if (entities.includes(changedEntity)) {
                    fetchData();
                }
            }
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authReady, ...deps]);

    return data;
}
