import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Kredensial diambil dari environment, bukan dari file di dalam repo.
// Dua cara didukung:
//   FIREBASE_SERVICE_ACCOUNT_JSON  → seluruh isi JSON service account
//   GOOGLE_APPLICATION_CREDENTIALS → path ke file JSON di luar repo
const resolveCredential = () => {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    const parsed = JSON.parse(inline) as ServiceAccount;
    return cert(parsed);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'Kredensial Admin SDK belum diset. Isi FIREBASE_SERVICE_ACCOUNT_JSON ' +
      'atau GOOGLE_APPLICATION_CREDENTIALS di .env.local.'
    );
  }
  // applicationDefault() membaca GOOGLE_APPLICATION_CREDENTIALS sendiri.
  return undefined;
};

const ADMIN_APP = 'admin';

export const getAdminApp = () => {
  const existing = getApps().find((app) => app.name === ADMIN_APP);
  if (existing) return existing;

  const credential = resolveCredential();
  return initializeApp(
    {
      ...(credential ? { credential } : {}),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    },
    ADMIN_APP
  );
};

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());
