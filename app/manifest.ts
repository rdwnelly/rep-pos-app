import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KASIR RELY',
    short_name: 'KASIR RELY',
    description: 'KASIR RELY — aplikasi kasir terintegrasi oleh RELY STUDIO',
    // Kasir hampir selalu membuka halaman POS, dan start_url ini juga
    // yang di-precache service worker sebagai kerangka aplikasi.
    start_url: '/pos',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    icons: [
      // Logo Rumah Etnik Papua sebagai badge: warna lembaga mengisi
      // penuh sampai tepi, logo dicetak putih di tengah dengan margin
      // 18%. Warna harus mencapai tepi karena peluncur memotong ikon
      // jadi lingkaran atau squircle, dan marginnya itulah safe area
      // yang menjaga logo tidak ikut terpotong.
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
