/**
 * Menormalkan field `date` yang sudah tersimpan ke satu format kanonik:
 * "YYYY-MM-DD HH:mm:ss" pada zona waktu toko (Asia/Jayapura).
 *
 * KENAPA WAJIB DIJALANKAN SEBELUM QUERY RENTANG TANGGAL:
 * Firestore membandingkan string mentah. Data lama bercampur dua format —
 * POS menulis "2026-10-27 12:00:00" (lokal) sementara retur menulis
 * "2026-10-27T03:00:00.000Z" (UTC). Karena spasi (0x20) lebih kecil dari
 * 'T' (0x54), urutannya tidak konsisten dan query rentang akan melewatkan
 * atau menyertakan baris yang salah — tanpa error apa pun.
 *
 * Nilai UTC juga digeser ke waktu toko, sehingga retur sebelum jam 09:00
 * WIT tidak lagi tercatat di tanggal kalender sebelumnya.
 *
 * Pemakaian:
 *   export GOOGLE_APPLICATION_CREDENTIALS=~/rep-secrets/sa.json
 *   node scripts/normalize-dates.mjs              # laporan saja (default)
 *   node scripts/normalize-dates.mjs --apply      # tulis perubahan
 *   node scripts/normalize-dates.mjs --apply --collection=transactions
 *
 * Idempoten: nilai yang sudah kanonik dilewati, jadi aman dijalankan ulang.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const STORE_TIME_ZONE = 'Asia/Jayapura';
const COLLECTIONS = ['transactions', 'cashflow', 'purchases'];
const CANONICAL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const only = args.find((a) => a.startsWith('--collection='))?.split('=')[1];

const toCanonical = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  const h = g('hour') === '24' ? '00' : g('hour');
  return `${g('year')}-${g('month')}-${g('day')} ${h}:${g('minute')}:${g('second')}`;
};

/** @returns nilai kanonik baru, atau null bila tidak perlu/tidak bisa diubah. */
const normalize = (raw) => {
  if (typeof raw !== 'string' || raw === '') return null;
  if (CANONICAL.test(raw)) return null;                 // sudah benar
  if (DATE_ONLY.test(raw)) return `${raw} 00:00:00`;    // tanggal tanpa jam

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;      // tidak terbaca

  // Nilai tanpa penanda zona (mis. "2026-10-27T12:00:00") sudah dalam
  // waktu lokal perangkat penulis; cukup ganti pemisahnya agar tidak
  // digeser dua kali.
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(raw);
  if (!hasZone) {
    const swapped = raw.replace('T', ' ').slice(0, 19);
    return CANONICAL.test(swapped) ? swapped : toCanonical(parsed);
  }
  return toCanonical(parsed);
};

const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!inline && !keyPath) {
  console.error('Kredensial belum diset.\n  export GOOGLE_APPLICATION_CREDENTIALS=/path/di/luar/repo/sa.json');
  process.exit(1);
}

initializeApp({
  credential: cert(inline ? JSON.parse(inline) : JSON.parse(readFileSync(keyPath, 'utf8'))),
});
const db = getFirestore();

if (!apply) {
  console.log('MODE LAPORAN — tidak ada yang ditulis. Tambahkan --apply untuk mengubah.\n');
} else {
  console.log('MODE TULIS — pastikan Anda sudah punya backup Firestore.\n');
}

let grandTotal = 0, grandChanged = 0, grandUnreadable = 0;

for (const name of COLLECTIONS) {
  if (only && only !== name) continue;

  const snapshot = await db.collection(name).get();
  const changes = [];
  const unreadable = [];

  snapshot.forEach((doc) => {
    const raw = doc.data().date;
    const next = normalize(raw);
    if (next) {
      changes.push({ id: doc.id, from: raw, to: next });
    } else if (typeof raw !== 'string' || (!CANONICAL.test(raw) && raw !== undefined)) {
      if (raw !== undefined && !CANONICAL.test(String(raw))) unreadable.push({ id: doc.id, raw });
    }
  });

  console.log(`${name}: ${snapshot.size} dokumen, ${changes.length} perlu dinormalisasi`);

  for (const c of changes.slice(0, 5)) {
    console.log(`   ${c.id}  ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
  }
  if (changes.length > 5) console.log(`   ... dan ${changes.length - 5} lainnya`);

  if (unreadable.length) {
    console.log(`   ${unreadable.length} dokumen bertanggal TIDAK TERBACA (perlu diperiksa manual):`);
    for (const u of unreadable.slice(0, 5)) console.log(`     ${u.id}  ${JSON.stringify(u.raw)}`);
  }

  if (apply && changes.length) {
    // Batch Firestore dibatasi 500 operasi.
    for (let i = 0; i < changes.length; i += 400) {
      const batch = db.batch();
      for (const c of changes.slice(i, i + 400)) {
        batch.update(db.collection(name).doc(c.id), { date: c.to });
      }
      await batch.commit();
      console.log(`   ✓ ditulis ${Math.min(i + 400, changes.length)}/${changes.length}`);
    }
  }

  grandTotal += snapshot.size;
  grandChanged += changes.length;
  grandUnreadable += unreadable.length;
  console.log();
}

console.log(`Total: ${grandTotal} dokumen diperiksa, ${grandChanged} ${apply ? 'dinormalisasi' : 'perlu dinormalisasi'}, ${grandUnreadable} tidak terbaca`);
if (!apply && grandChanged > 0) {
  console.log('\nJalankan ulang dengan --apply setelah memastikan contoh perubahan di atas benar.');
}
