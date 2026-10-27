import { useEffect, useState } from 'react';
import {
  checkRestoredPendingWrites,
  getSyncState,
  subscribeSyncState,
  type SyncState,
} from '../services/syncStatus';

/** Jumlah tulisan Firestore yang belum diakui server, plus yang gagal. */
export const useSyncState = (): SyncState => {
  const [state, setState] = useState<SyncState>(getSyncState);

  useEffect(() => {
    // Deteksi tulisan yang masih tertahan dari sesi sebelumnya.
    checkRestoredPendingWrites();
    return subscribeSyncState(setState);
  }, []);

  return state;
};
