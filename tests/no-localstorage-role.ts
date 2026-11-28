/**
 * Penjaga: peran pengguna tidak boleh dibaca dari localStorage.
 *
 * Cara menjalankan:  npm run test:guard
 *
 * Pola `JSON.parse(localStorage.getItem('pos_current_user')).role` dulu
 * tersebar di 8 tempat. Ia ringkas ditulis dan terasa praktis, jadi
 * mudah muncul kembali — padahal nilainya bisa diubah siapa pun lewat
 * DevTools, dan ditulis pada event yang sama dengan saat layar mulai
 * merender sehingga pembacaan pertama kadang kosong.
 *
 * Sumber peran yang benar adalah useCurrentUser(), yang membaca
 * AuthContext — dan AuthContext memakai custom claim pada ID token,
 * sama persis dengan yang dipakai firestore.rules.
 *
 * Uji ini memindai berkas sumber, bukan perilaku runtime: justru itu
 * yang dibutuhkan, karena yang dijaga adalah cara penulisannya.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const AKAR = process.cwd();
const DIPINDAI = ['screens', 'components', 'hooks', 'services', 'context', 'utils', 'app'];
const EKSTENSI = /\.(ts|tsx|js|jsx)$/;

/**
 * AuthContext dan (protected)/layout.tsx boleh menyebutnya: keduanya
 * hanya MENGHAPUS salinan lama dari perangkat yang terlanjur punya.
 * Berkas yang isinya menjelaskan sejarah ini juga dikecualikan.
 */
const DIKECUALIKAN = new Set([
  'context/AuthContext.tsx',
  'app/(protected)/layout.tsx',
  'hooks/useCurrentUser.ts',
  'services/firestore.ts',
]);

const kumpulkan = (dir: string, hasil: string[] = []): string[] => {
  for (const nama of readdirSync(dir)) {
    const penuh = join(dir, nama);
    if (statSync(penuh).isDirectory()) {
      if (nama === 'node_modules' || nama === '.next') continue;
      kumpulkan(penuh, hasil);
    } else if (EKSTENSI.test(nama)) {
      hasil.push(penuh);
    }
  }
  return hasil;
};

const berkas = DIPINDAI.flatMap((d) => {
  try {
    return kumpulkan(join(AKAR, d));
  } catch {
    return [];
  }
});

const pelanggaran: string[] = [];

for (const f of berkas) {
  const rel = relative(AKAR, f);
  if (DIKECUALIKAN.has(rel)) continue;

  const baris = readFileSync(f, 'utf8').split('\n');
  baris.forEach((isi, i) => {
    // Hanya pembacaan yang dipermasalahkan; removeItem adalah pembersihan.
    if (/localStorage\s*\.\s*getItem\s*\(\s*['"]pos_current_user['"]/.test(isi)) {
      pelanggaran.push(`${rel}:${i + 1}  membaca pos_current_user`);
    }
    // Peran yang diambil dari objek hasil parse localStorage apa pun.
    if (/JSON\.parse\s*\(\s*localStorage[^)]*\)[^;]*\.\s*role\b/.test(isi)) {
      pelanggaran.push(`${rel}:${i + 1}  mengambil .role dari localStorage`);
    }
  });
}

console.log(`\nMemindai ${berkas.length} berkas sumber\n`);

if (pelanggaran.length) {
  console.log(`  ✗ ${pelanggaran.length} pelanggaran:`);
  pelanggaran.forEach((p) => console.log(`      ${p}`));
  console.log('\n  Pakai useCurrentUser() dari hooks/useCurrentUser.ts.\n');
  process.exit(1);
}

console.log('  ✓ tidak ada peran yang dibaca dari localStorage');
console.log('  ✓ tidak ada .role yang diambil dari hasil parse localStorage\n');
