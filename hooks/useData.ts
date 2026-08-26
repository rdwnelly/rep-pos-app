import { useState, useEffect } from 'react';
import { subscribeToChanges } from '../services/storage';
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

        const fetchData = async () => {
            try {
                const result = await fetcher();
                if (isMounted) setData(result);
            } catch (error) {
                console.error("Failed to fetch data", error);
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
