import { useEffect, useState } from 'react';
import {
  getLoadFailures,
  subscribeLoadFailures,
  type LoadFailure,
} from '../services/loadStatus';

/** Daftar entitas yang gagal dimuat, satu catatan per entitas. */
export const useLoadFailures = (): LoadFailure[] => {
  const [failures, setFailures] = useState<LoadFailure[]>(getLoadFailures);
  useEffect(() => subscribeLoadFailures(setFailures), []);
  return failures;
};
