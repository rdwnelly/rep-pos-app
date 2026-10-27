/**
 * Status sinkronisasi tulisan Firestore.
 *
 * Firestore sudah punya antrean offline sendiri: tulisan disimpan ke
 * IndexedDB lebih dulu (persistence diaktifkan di src/lib/firebase.ts),
 * lalu dikirim saat jaringan kembali. Yang TIDAK disediakannya adalah
 * dua hal yang dibutuhkan kasir:
 *
 *   1. promise commit() baru resolve setelah server mengakui, sehingga
 *      `await` di alur checkout menggantung selama internet mati;
 *   2. tidak ada cara sederhana menampilkan "berapa yang belum terkirim".
 *
 * Modul ini menutup keduanya.
 */

import { waitForPendingWrites } from 'firebase/firestore';
import { db } from '../src/lib/firebase';

export type SyncFailure = {
  label: string;
  message: string;
  at: string;
};

export type SyncState = {
  pending: number;
  failures: SyncFailure[];
  /**
   * Ada tulisan tertahan dari sesi sebelumnya. Jumlahnya tidak bisa
   * diketahui — Firestore tidak membukanya — jadi hanya ya/tidak.
   */
  restoredPending: boolean;
};

const MAX_FAILURES = 20;

let pending = 0;
let failures: SyncFailure[] = [];
let restoredPending = false;

type Listener = (state: SyncState) => void;
const listeners = new Set<Listener>();

const snapshot = (): SyncState => ({
  pending,
  failures: [...failures],
  restoredPending,
});

const emit = () => {
  const state = snapshot();
  listeners.forEach((listener) => listener(state));
};

export const getSyncState = snapshot;

export const subscribeSyncState = (listener: Listener) => {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
};

export const clearSyncFailures = () => {
  failures = [];
  emit();
};

/**
 * Mencatat sebuah tulisan sebagai "menunggu" sampai server mengakuinya.
 * Penolakan selalu ditangani di sini, jadi tidak ada unhandled rejection
 * walau pemanggil sudah berjalan lebih dulu.
 */
const track = (promise: Promise<unknown>, label: string) => {
  pending += 1;
  emit();

  promise.then(
    () => {
      pending -= 1;
      emit();
    },
    (error: any) => {
      pending -= 1;
      failures = [
        {
          label,
          message: error?.message || String(error),
          at: new Date().toISOString(),
        },
        ...failures,
      ].slice(0, MAX_FAILURES);
      emit();
    }
  );
};

/**
 * Menunggu ack server, tapi menyerah bila lewat `timeoutMs` — dan sama
 * sekali tidak menunggu bila perangkat memang sedang offline.
 *
 * Tetap melempar bila tulisannya ditolak dalam rentang tunggu itu,
 * supaya kesalahan nyata (mis. ditolak firestore.rules) langsung
 * terlihat kasir ketika online, seperti perilaku sebelumnya.
 */
const awaitAckOrQueue = (promise: Promise<unknown>, timeoutMs: number) => {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isOffline) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, timeoutMs);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
};

/**
 * Dipakai di jalur tulis yang dipicu kasir. Online perilakunya sama
 * seperti `await` biasa; offline langsung kembali supaya struk tetap
 * tercetak dan keranjang bisa direset.
 */
/**
 * Penghitung `pending` di atas hidup di memori, jadi hilang saat tab
 * di-refresh — sementara antrean Firestore di IndexedDB tidak. Tanpa
 * pemeriksaan ini, kasir yang me-refresh akan melihat "semua sinkron"
 * padahal transaksinya masih tertahan.
 *
 * waitForPendingWrites() hanya resolve setelah semua tulisan yang sudah
 * ada diakui server, jadi kalau ia belum resolve dalam sekejap, berarti
 * masih ada yang tertahan.
 */
let restoredChecked = false;

export const checkRestoredPendingWrites = () => {
  if (restoredChecked || typeof window === 'undefined') return;
  restoredChecked = true;

  let settled = false;
  const acked = waitForPendingWrites(db).then(
    () => { settled = true; },
    () => { settled = true; }
  );

  setTimeout(() => {
    if (settled) return;
    restoredPending = true;
    emit();
    acked.then(() => {
      restoredPending = false;
      emit();
    });
  }, 1500);
};

export const queueWrite = async (
  promise: Promise<unknown>,
  label: string,
  timeoutMs = 2500
) => {
  track(promise, label);
  await awaitAckOrQueue(promise, timeoutMs);
};
