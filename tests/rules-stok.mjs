/**
 * Uji penjaga stok pada firestore.rules.
 *
 * Menjalankan aturan yang sebenarnya (bukan salinan) di emulator
 * Firestore, jadi kalau aturannya diubah dan penjaganya rusak, uji ini
 * yang gagal lebih dulu — bukan stok di lapangan.
 *
 * Cara menjalankan:
 *   firebase emulators:exec --only firestore "node tests/rules-stok.mjs"
 *
 * Latar: seluruh perubahan stok di aplikasi memakai increment() di dalam
 * batch tanpa membaca stok dulu, sehingga dua kasir yang menjual barang
 * terakhir bersamaan sama-sama lolos. Hanya server yang bisa menengahi
 * balapan itu. Uji ini sekaligus membuktikan aturan Firestore melihat
 * HASIL increment(), bukan nilai lamanya — asumsi yang kalau salah
 * membuat penjaganya diam-diam tidak berguna.
 */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, increment } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'uji-rules-stok',
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

/** Menyiapkan satu produk lewat jalur istimewa, menembus aturan. */
const siapkanProduk = async (id, data) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `products/${id}`), data);
  });
};

await env.clearFirestore();
console.log('\nPenjaga stok tidak boleh minus\n');

await siapkanProduk('p1', { name: 'Noken', price: 150000, hpp: 90000, stock: 3 });
await cek(
  'kasir menjual 2 dari stok 3',
  updateDoc(doc(kasir(), 'products/p1'), { stock: increment(-2) }),
  'boleh',
);
await cek(
  'kasir menjual 5 dari sisa stok 1 — stok akan jadi -4',
  updateDoc(doc(kasir(), 'products/p1'), { stock: increment(-5) }),
  'ditolak',
);

await siapkanProduk('p2', { name: 'Kopi', price: 30000, hpp: 12000, stock: 1 });
await cek(
  'dua kasir menjual barang terakhir bersamaan — yang kedua ditolak',
  (async () => {
    await updateDoc(doc(kasir(), 'products/p2'), { stock: increment(-1) }); // 1 -> 0
    await updateDoc(doc(kasir(), 'products/p2'), { stock: increment(-1) }); // 0 -> -1
  })(),
  'ditolak',
);

await siapkanProduk('p3', { name: 'Tiket', price: 25000, hpp: 0, stock: 10 });
await cek(
  'admin menulis stok negatif langsung',
  updateDoc(doc(admin(), 'products/p3'), { stock: -1 }),
  'ditolak',
);
await cek(
  'admin menambah stok (restok)',
  updateDoc(doc(admin(), 'products/p3'), { stock: increment(50) }),
  'boleh',
);
await cek(
  'produk baru dengan stok negatif',
  setDoc(doc(admin(), 'products/baru'), { name: 'X', price: 1, hpp: 1, stock: -5 }),
  'ditolak',
);

// Dokumen yang stoknya terlanjur minus akibat bug lama harus tetap bisa
// diperbaiki. Tanpa syarat kedua pada aturan, dokumen ini terkunci
// selamanya karena setiap update-nya gagal.
await siapkanProduk('p4', { name: 'Warisan minus', price: 1000, hpp: 500, stock: -7 });
await cek(
  'menaikkan stok warisan -7 ke -2 (memperbaiki, walau masih minus)',
  updateDoc(doc(admin(), 'products/p4'), { stock: increment(5) }),
  'boleh',
);
await cek(
  'menurunkan lagi stok warisan yang sudah minus',
  updateDoc(doc(admin(), 'products/p4'), { stock: increment(-1) }),
  'ditolak',
);
await cek(
  'memperbaiki stok warisan langsung ke 0',
  updateDoc(doc(admin(), 'products/p4'), { stock: 0 }),
  'boleh',
);

console.log('\nBatas atas: stok tidak boleh melebihi 100\n');

await siapkanProduk('b1', { name: 'Gelang', price: 20000, hpp: 8000, stock: 90 });
await cek(
  'restok 90 -> 100 (tepat di batas)',
  updateDoc(doc(admin(), 'products/b1'), { stock: increment(10) }),
  'boleh',
);
await cek(
  'restok 100 -> 101 (lewat satu)',
  updateDoc(doc(admin(), 'products/b1'), { stock: increment(1) }),
  'ditolak',
);
await cek(
  'gudang menulis 500 langsung',
  updateDoc(doc(gudang(), 'products/b1'), { stock: 500 }),
  'ditolak',
);
await cek(
  'produk baru dengan stok 150',
  setDoc(doc(admin(), 'products/b2'), { name: 'Y', price: 1, hpp: 1, stock: 150 }),
  'ditolak',
);
await cek(
  'produk baru dengan stok 100',
  setDoc(doc(admin(), 'products/b3'), { name: 'Z', price: 1, hpp: 1, stock: 100 }),
  'boleh',
);

// Inilah bagian yang paling mudah salah. Kalau aturannya hanya
// "<= 100", produk yang terlanjur di atas batas akan tertolak pada
// SETIAP update — termasuk saat dijual — dan barangnya terkunci.
await siapkanProduk('b4', { name: 'Warisan 500', price: 5000, hpp: 2000, stock: 500 });
await cek(
  'KASIR MENJUAL produk yang stoknya terlanjur 500',
  updateDoc(doc(kasir(), 'products/b4'), { stock: increment(-1) }),
  'boleh',
);
await cek(
  'admin mengoreksi turun 500 -> 100',
  updateDoc(doc(admin(), 'products/b4'), { stock: 100 }),
  'boleh',
);
await siapkanProduk('b5', { name: 'Warisan 500 lagi', price: 5000, hpp: 2000, stock: 500 });
await cek(
  'menaikkan lagi produk yang sudah di atas batas',
  updateDoc(doc(admin(), 'products/b5'), { stock: increment(1) }),
  'ditolak',
);
await cek(
  'mengubah harga produk yang stoknya di atas batas (stok tidak disentuh)',
  updateDoc(doc(admin(), 'products/b5'), { price: 7000 }),
  'boleh',
);

// Penjaga lama tidak boleh ikut hilang saat penjaga stok ditambahkan.
console.log('\nBatasan lama yang harus tetap berlaku\n');
await siapkanProduk('p5', { name: 'Souvenir', price: 50000, hpp: 20000, stock: 5 });
await cek(
  'kasir mengubah harga',
  updateDoc(doc(kasir(), 'products/p5'), { price: 1 }),
  'ditolak',
);
await cek(
  'kasir mengubah hpp bersama stok',
  updateDoc(doc(kasir(), 'products/p5'), { stock: increment(-1), hpp: 1 }),
  'ditolak',
);
await cek(
  'admin mengubah harga',
  updateDoc(doc(admin(), 'products/p5'), { price: 60000 }),
  'boleh',
);

console.log(
  gagal.length
    ? `\n${gagal.length} GAGAL dari ${lolos + gagal.length}:\n  - ${gagal.join('\n  - ')}\n`
    : `\nSemua ${lolos} uji lolos.\n`,
);

await env.cleanup();
process.exit(gagal.length ? 1 : 0);
