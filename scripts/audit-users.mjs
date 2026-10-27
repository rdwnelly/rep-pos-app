/**
 * Membandingkan akun Firebase Auth dengan dokumen users/{uid} di Firestore,
 * lalu melaporkan ketidaksinkronan yang bikin pembuatan user gagal:
 *
 *   YATIM   akun Auth ada, dokumen Firestore tidak → emailnya "terpakai"
 *           tapi user tidak muncul di menu Pengaturan. Ini penyebab
 *           error auth/email-already-in-use.
 *   MENGGANTUNG  dokumen Firestore ada, akun Auth tidak → user tampil di
 *           daftar tapi tidak bisa login.
 *   CLAIM   role di dokumen tidak sama dengan custom claim.
 *
 * Pemakaian:
 *   export GOOGLE_APPLICATION_CREDENTIALS=~/rep-secrets/sa.json
 *   node scripts/audit-users.mjs                        # laporan saja
 *   node scripts/audit-users.mjs --email=staf@rep.id     # periksa satu email
 *   node scripts/audit-users.mjs --delete-orphan=UID     # hapus akun yatim
 *   node scripts/audit-users.mjs --link-orphan=UID --role=CASHIER
 *                                                        # buatkan dokumennya
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const VALID_ROLES = ['SUPERADMIN', 'OWNER', 'ADMIN', 'CASHIER', 'GUDANG'];

const args = process.argv.slice(2);
const argOf = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const onlyEmail = argOf('email');
const deleteOrphan = argOf('delete-orphan');
const linkOrphan = argOf('link-orphan');
const linkRole = argOf('role');

const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!inline && !keyPath) {
  console.error(
    'Kredensial belum diset.\n' +
    '  export GOOGLE_APPLICATION_CREDENTIALS=/path/di/luar/repo/sa.json'
  );
  process.exit(1);
}

initializeApp({
  credential: cert(inline ? JSON.parse(inline) : JSON.parse(readFileSync(keyPath, 'utf8'))),
});

const auth = getAuth();
const db = getFirestore();

// ── Aksi perbaikan ────────────────────────────────────────────
if (deleteOrphan) {
  const docSnap = await db.collection('users').doc(deleteOrphan).get();
  if (docSnap.exists) {
    console.error(
      `Dibatalkan: ${deleteOrphan} punya dokumen users, jadi bukan yatim.\n` +
      'Hapus lewat menu Pengaturan di aplikasi.'
    );
    process.exit(1);
  }
  const user = await auth.getUser(deleteOrphan);
  await auth.deleteUser(deleteOrphan);
  console.log(`✓ Akun Auth yatim dihapus: ${deleteOrphan} (${user.email})`);
  console.log('Email tersebut sekarang bisa dipakai lagi untuk user baru.');
  process.exit(0);
}

if (linkOrphan) {
  if (!VALID_ROLES.includes(linkRole)) {
    console.error(`--role wajib salah satu dari: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }
  const user = await auth.getUser(linkOrphan);
  await db.collection('users').doc(linkOrphan).set({
    id: linkOrphan,
    name: user.displayName || user.email || linkOrphan,
    username: user.email || linkOrphan,
    email: user.email || '',
    role: linkRole,
  }, { merge: true });
  await auth.setCustomUserClaims(linkOrphan, { ...(user.customClaims || {}), role: linkRole });
  console.log(`✓ Dokumen users dibuat untuk ${linkOrphan} (${user.email}) dengan role ${linkRole}`);
  process.exit(0);
}

// ── Laporan ───────────────────────────────────────────────────
const authUsers = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  authUsers.push(...page.users);
  pageToken = page.pageToken;
} while (pageToken);

const docs = new Map(
  (await db.collection('users').get()).docs.map((d) => [d.id, d.data()])
);

const matches = (u) => !onlyEmail || (u.email || '').toLowerCase() === onlyEmail.toLowerCase();

const orphans = authUsers.filter((u) => !docs.has(u.uid)).filter(matches);
const claimIssues = authUsers
  .filter((u) => docs.has(u.uid))
  .filter((u) => u.customClaims?.role !== docs.get(u.uid).role)
  .filter(matches);
const dangling = [...docs.entries()]
  .filter(([uid]) => !authUsers.some((u) => u.uid === uid))
  .filter(([, d]) => !onlyEmail || (d.email || '').toLowerCase() === onlyEmail.toLowerCase());

console.log(`Akun Auth: ${authUsers.length}   Dokumen users: ${docs.size}\n`);

if (orphans.length) {
  console.log(`YATIM — akun Auth tanpa dokumen Firestore (${orphans.length}):`);
  for (const u of orphans) {
    console.log(`  ${u.uid}  ${u.email || '(tanpa email)'}  dibuat ${u.metadata.creationTime}`);
  }
  console.log(
    '\n  Inilah yang membuat email terasa "sudah dipakai" padahal user tidak\n' +
    '  muncul di aplikasi. Pilih salah satu:\n' +
    `    node scripts/audit-users.mjs --delete-orphan=<UID>        # buang akunnya\n` +
    `    node scripts/audit-users.mjs --link-orphan=<UID> --role=CASHIER  # pakai akunnya\n`
  );
}

if (dangling.length) {
  console.log(`MENGGANTUNG — dokumen Firestore tanpa akun Auth (${dangling.length}):`);
  for (const [uid, d] of dangling) {
    console.log(`  ${uid}  ${d.email || '-'}  ${d.username || '-'}  role=${d.role}`);
  }
  console.log('  User ini tampil di daftar tapi tidak bisa login.\n');
}

if (claimIssues.length) {
  console.log(`CLAIM — role dokumen ≠ custom claim (${claimIssues.length}):`);
  for (const u of claimIssues) {
    console.log(`  ${u.uid}  ${u.email}  dokumen=${docs.get(u.uid).role}  claim=${u.customClaims?.role ?? '(belum ada)'}`);
  }
  console.log('  Jalankan: node scripts/set-custom-claims.mjs\n');
}

// Password plaintext yang tersimpan dari versi lama aplikasi.
const withPassword = [...docs.entries()].filter(([, d]) => 'password' in d);
if (withPassword.length) {
  console.log(`PASSWORD — dokumen users yang masih menyimpan field password (${withPassword.length}):`);
  for (const [uid, d] of withPassword) {
    console.log(`  ${uid}  ${d.email || d.username || '-'}`);
  }
  console.log('  Field ini sisa dari versi lama dan perlu dihapus dari Firestore.\n');
}

if (!orphans.length && !dangling.length && !claimIssues.length && !withPassword.length) {
  console.log('Tidak ada ketidaksinkronan.');
}
