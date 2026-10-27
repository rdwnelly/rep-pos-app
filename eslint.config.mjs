// `next lint` dihapus di Next.js 16, sehingga `npm run lint` sebelumnya
// gagal dengan "Invalid project directory provided, no such directory:
// .../lint" — kata "lint" ditafsirkan sebagai nama folder proyek.
// ESLint 9 dipanggil langsung, dan eslint-config-next 16 sudah
// menyediakan flat config.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',       // aset statis, termasuk service worker
      '*.cjs',           // skrip sekali-pakai, bukan bagian aplikasi
    ],
  },
  ...nextCoreWebVitals,
];
