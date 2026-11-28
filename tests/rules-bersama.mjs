/**
 * Uji aturan untuk data yang kini dipakai bersama antarperangkat:
 * open bill (pesanan meja) dan akun biaya Berita Acara.
 *
 * Cara menjalankan:
 *   firebase emulators:exec --only firestore "node tests/rules-bersama.mjs"
 *
 * Keduanya dulu hanya ada di localStorage, jadi aturannya belum pernah
 * teruji sama sekali — yang open_bills bahkan sudah lama ditulis tapi
 * tidak pernah dipakai satu baris kode pun.
 */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'uji-rules-bersama',
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: readFileSync('firestore.rules', 'utf8'),
  },
});

const sebagai = (uid, role) => env.authenticatedContext(uid, { role }).firestore();
const kasir = () => sebagai('kasir1', 'CASHIER');
const admin = () => sebagai('admin1', 'ADMIN');
const gudang = () => sebagai('gudang1', 'GUDANG');
const tamu = () => env.unauthenticatedContext().firestore();

let lolos = 0;
const gagal = [];

const cek = async (nama, janji, harusnya) => {
  try {
    await (harusnya === 'boleh' ? assertSucceeds(janji) : assertFails(janji));
    console.log(`  ✓ ${nama}  (${harusnya})`);
    lolos++;
  } catch {
    console.log(`  ✗ ${nama}  — seharusnya ${harusnya}`);
    gagal.push(nama);
  }
};

const bill = (id, extra = {}) => ({
  id,
  billNumber: 'OB-' + id,
  tableNumber: '5',
  customerName: 'Umum',
  items: [{ id: 'p1', name: 'Kopi', qty: 2, price: 30000, finalPrice: 30000 }],
  subtotal: 60000,
  discount: 0,
  totalAmount: 60000,
  cashierId: 'kasir1',
  cashierName: 'Kasir Satu',
  status: 'OPEN',
  createdAt: '2026-11-28 10:00:00',
  updatedAt: '2026-11-28 10:00:00',
  ...extra,
});

await env.clearFirestore();

console.log('\nOpen bill — pesanan meja harus bisa dilanjutkan kasir lain\n');

await cek('kasir membuka bill baru', setDoc(doc(kasir(), 'open_bills/b1'), bill('b1')), 'boleh');
await cek(
  'kasir LAIN membaca bill itu (ganti shift / ganti HP)',
  getDoc(doc(sebagai('kasir2', 'CASHIER'), 'open_bills/b1')),
  'boleh',
);
await cek(
  'kasir lain menambah item ke bill yang sama',
  setDoc(doc(sebagai('kasir2', 'CASHIER'), 'open_bills/b1'), bill('b1', { totalAmount: 90000 })),
  'boleh',
);
await cek('kasir menutup/menghapus bill', deleteDoc(doc(kasir(), 'open_bills/b1')), 'boleh');
await cek('tanpa login tidak bisa membaca bill', getDoc(doc(tamu(), 'open_bills/b1')), 'ditolak');
await cek('tanpa login tidak bisa membuat bill', setDoc(doc(tamu(), 'open_bills/b9'), bill('b9')), 'ditolak');

console.log('\nAkun biaya Berita Acara — satu daftar untuk semua perangkat\n');

const daftar = { id: 'default', options: ['1) Taman Etnik', '2) Kafe & Resto'], updatedAt: '2026-11-28 10:00:00' };

await cek(
  'kasir menyimpan daftar akun biaya',
  setDoc(doc(kasir(), 'expense_accounts/default'), daftar),
  'boleh',
);
await cek(
  'karyawan lain membaca daftar yang sama',
  getDoc(doc(sebagai('kasir2', 'CASHIER'), 'expense_accounts/default')),
  'boleh',
);
await cek(
  'admin menambah akun baru',
  setDoc(doc(admin(), 'expense_accounts/default'), {
    ...daftar,
    options: [...daftar.options, '3) Listrik & Air'],
  }),
  'boleh',
);
await cek(
  'gudang mengubah daftar akun biaya',
  setDoc(doc(gudang(), 'expense_accounts/default'), daftar),
  'ditolak',
);
await cek(
  'gudang tetap boleh membacanya',
  getDoc(doc(gudang(), 'expense_accounts/default')),
  'boleh',
);
await cek(
  'options bukan array — dokumen rusak ditolak',
  setDoc(doc(admin(), 'expense_accounts/default'), { id: 'default', options: 'bukan array' }),
  'ditolak',
);
await cek(
  'tanpa login tidak bisa membaca',
  getDoc(doc(tamu(), 'expense_accounts/default')),
  'ditolak',
);

console.log(
  gagal.length
    ? `\n${gagal.length} GAGAL dari ${lolos + gagal.length}:\n  - ${gagal.join('\n  - ')}\n`
    : `\nSemua ${lolos} uji lolos.\n`,
);

await env.cleanup();
process.exit(gagal.length ? 1 : 0);
