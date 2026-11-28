import { useSyncExternalStore } from 'react';

/**
 * Status jaringan perangkat.
 *
 * Dulu ditulis sebagai useState + useEffect: nilainya mulai dari `true`,
 * lalu efek pada mount menimpanya dengan navigator.onLine. Akibatnya
 * perangkat yang dibuka dalam keadaan OFFLINE sempat menampilkan
 * indikator hijau "Online (Sinkron)" pada render pertama — kabar yang
 * salah, tepat pada keadaan ketika kasir paling perlu tahu bahwa
 * datanya belum terkirim.
 *
 * useSyncExternalStore membaca nilainya langsung saat render, jadi tidak
 * ada lagi keadaan perantara yang keliru. Ia juga satu-satunya cara yang
 * benar membaca sumber di luar React tanpa membuat tampilan dan sumber
 * aslinya sempat berbeda.
 */

const berlangganan = (beriTahu: () => void) => {
  window.addEventListener('online', beriTahu);
  window.addEventListener('offline', beriTahu);
  return () => {
    window.removeEventListener('online', beriTahu);
    window.removeEventListener('offline', beriTahu);
  };
};

const bacaDiPeramban = () => navigator.onLine;

// Saat dirender di server tidak ada navigator. Dianggap online supaya
// HTML awalnya sama dengan render pertama di peramban yang online —
// kalau ternyata offline, useSyncExternalStore langsung memperbaikinya
// setelah hidrasi.
const bacaDiServer = () => true;

export const useOnlineStatus = (): boolean =>
  useSyncExternalStore(berlangganan, bacaDiPeramban, bacaDiServer);
