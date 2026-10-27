/**
 * Backfill custom claim `role` untuk setiap akun, dibaca dari dokumen
 * users/{uid} di Firestore. Jalankan sekali setelah deploy rules baru,
 * dan ulangi bila ada akun yang dibuat di luar menu Pengaturan.
 *
 * Idempoten: akun yang claim-nya sudah benar akan dilewati.
 *
 * Pemakaian:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/di/luar/repo/sa.json
 *   node scripts/set-custom-claims.mjs            # semua akun
 *   node scripts/set-custom-claims.mjs --dry-run  # hanya tampilkan rencana
 *   node scripts/set-custom-claims.mjs --uid=ABC  # satu akun saja
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const VALID_ROLES = ['SUPERADMIN', 'OWNER', 'ADMIN', 'CASHIER', 'GUDANG'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyUid = args.find((a) => a.startsWith('--uid='))?.split('=')[1];

const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!inline && !keyPath) {
  console.error(
    'Kredensial belum diset.\n' +
    '  export GOOGLE_APPLICATION_CREDENTIALS=/path/di/luar/repo/sa.json\n' +
    'Jangan pernah menaruh file ini di dalam folder project.'
  );
  process.exit(1);
}

initializeApp({
  credential: cert(inline ? JSON.parse(inline) : JSON.parse(readFileSync(keyPath, 'utf8'))),
});

const auth = getAuth();
const db = getFirestore();

const snapshot = onlyUid
  ? [await db.collection('users').doc(onlyUid).get()]
  : (await db.collection('users').get()).docs;

let updated = 0, skipped = 0, failed = 0;

for (const docSnap of snapshot) {
  if (!docSnap.exists) {
    console.error(`✗ ${docSnap.id}: dokumen users tidak ditemukan`);
    failed++;
    continue;
  }

  const uid = docSnap.id;
  const role = docSnap.data().role;
  const label = `${uid} (${docSnap.data().username || docSnap.data().email || '-'})`;

  if (!VALID_ROLES.includes(role)) {
    console.error(`✗ ${label}: role "${role}" tidak dikenal, dilewati`);
    failed++;
    continue;
  }

  try {
    const user = await auth.getUser(uid);
    if (user.customClaims?.role === role) {
      console.log(`· ${label}: claim sudah "${role}"`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`~ ${label}: akan diset ke "${role}" (dry-run)`);
      updated++;
      continue;
    }

    // Claim lain dipertahankan supaya tidak menimpa yang sudah ada.
    await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), role });
    console.log(`✓ ${label}: claim diset ke "${role}"`);
    updated++;
  } catch (error) {
    // Dokumen users bisa tertinggal untuk akun Auth yang sudah dihapus.
    console.error(`✗ ${label}: ${error.message}`);
    failed++;
  }
}

console.log(`\n${updated} diperbarui, ${skipped} dilewati, ${failed} gagal`);
if (!dryRun && updated > 0) {
  console.log(
    'Claim baru baru terbaca setelah ID token di-refresh. Staf yang sedang\n' +
    'login akan ikut terbarui dalam <1 jam, atau langsung bila logout-login.'
  );
}
process.exit(failed > 0 ? 1 : 0);
