/**
 * Membersihkan kategori warisan bernama "umum".
 *
 * Dulu pembersihan ini terjadi DI DALAM getCategories() dan getProducts(),
 * sehingga setiap kali ada yang membuka daftar produk, aplikasi diam-diam
 * menulis ke basis data. Pembacaan yang mengubah data seperti itu sulit
 * ditelusuri dan bisa berjalan berkali-kali tanpa disadari. Sekarang
 * pembersihannya dijalankan sekali lewat skrip ini.
 *
 * Pemakaian:
 *   export GOOGLE_APPLICATION_CREDENTIALS=~/rep-secrets/sa.json
 *   node scripts/cleanup-umum-category.mjs            # laporan saja
 *   node scripts/cleanup-umum-category.mjs --apply    # tulis perubahan
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const apply = process.argv.includes('--apply');

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

const isUmum = (nama) => (nama || '').trim().toLowerCase() === 'umum';

console.log(apply ? 'MODE TULIS — pastikan ada backup Firestore.\n' : 'MODE LAPORAN — tidak ada yang ditulis.\n');

const catSnap = await db.collection('categories').get();
const kategoriUmum = catSnap.docs.filter(d => isUmum(d.data().name));

const prodSnap = await db.collection('products').get();
const produkUmum = prodSnap.docs.filter(d => isUmum(d.data().categoryName));

console.log(`Kategori bernama "umum" : ${kategoriUmum.length}`);
kategoriUmum.slice(0, 5).forEach(d => console.log(`   ${d.id}`));
console.log(`Produk berkategori "umum": ${produkUmum.length}`);
produkUmum.slice(0, 5).forEach(d => console.log(`   ${d.id}  ${d.data().name}`));
if (produkUmum.length > 5) console.log(`   ... dan ${produkUmum.length - 5} lainnya`);

if (!apply) {
  if (kategoriUmum.length || produkUmum.length) {
    console.log('\nJalankan ulang dengan --apply setelah memastikan daftar di atas benar.');
  } else {
    console.log('\nTidak ada yang perlu dibersihkan.');
  }
  process.exit(0);
}

// Kosongkan kategori pada produk lebih dulu, baru hapus dokumen kategorinya,
// agar tidak ada produk yang sempat menunjuk kategori yang sudah hilang.
for (let i = 0; i < produkUmum.length; i += 400) {
  const batch = db.batch();
  produkUmum.slice(i, i + 400).forEach(d =>
    batch.update(d.ref, { categoryName: '', categoryId: '' }));
  await batch.commit();
  console.log(`✓ produk ${Math.min(i + 400, produkUmum.length)}/${produkUmum.length}`);
}
if (kategoriUmum.length) {
  const batch = db.batch();
  kategoriUmum.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`✓ ${kategoriUmum.length} dokumen kategori dihapus`);
}
console.log('\nSelesai.');
