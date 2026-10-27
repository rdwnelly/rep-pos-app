/*
 * Service worker Kasir REP — ditulis manual, bukan lewat next-pwa.
 *
 * Alasannya: build project ini memakai Turbopack, sementara next-pwa 5.6.0
 * adalah plugin webpack (dan sudah tidak dirawat sejak 2022). Memasangnya
 * membuat `next build` gagal dengan "This build is using Turbopack, with a
 * `webpack` config".
 *
 * Strategi memakai runtime caching, bukan precache manifest hasil build,
 * supaya tidak perlu tahu nama chunk ber-hash yang berubah setiap build.
 * Konsekuensinya: perangkat baru harus online sekali agar cache terisi —
 * yang memang tidak terhindarkan karena login pun butuh internet.
 *
 * Yang TIDAK disentuh sama sekali: semua permintaan lintas-origin
 * (Firestore, Firebase Auth) dan /api/*. Firestore punya antrean offline
 * sendiri di IndexedDB; mencampurinya hanya akan merusak sinkronisasi.
 */

const VERSION = 'v1';
const SHELL_CACHE = `kasir-rep-shell-${VERSION}`;
const STATIC_CACHE = `kasir-rep-static-${VERSION}`;
const IMAGE_CACHE = `kasir-rep-image-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, STATIC_CACHE, IMAGE_CACHE];

// Kerangka aplikasi. /pos didahulukan karena itu layar yang dipakai kasir.
// URL disimpan absolut supaya pencocokan cache tidak bergantung pada
// resolusi URL relatif, yang mudah salah saat dibaca maupun diuji.
const toUrl = (path) => new URL(path, self.location.origin).href;

const SHELL_ROUTES = ['/pos', '/', '/login'].map(toUrl);
const SHELL_FALLBACK = toUrl('/pos');

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Satu route gagal tidak boleh membatalkan seluruh install.
      await Promise.all(
        SHELL_ROUTES.map((route) =>
          cache.add(new Request(route, { cache: 'reload' })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('kasir-rep-') && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

const isStaticAsset = (url) =>
  url.pathname.startsWith('/_next/static/') || url.pathname === '/manifest.webmanifest';

const isImage = (url) =>
  url.pathname.startsWith('/_next/image') ||
  /\.(png|jpe?g|svg|gif|webp|avif|ico)$/i.test(url.pathname);

// Aset ber-hash tidak pernah berubah isinya, jadi cache dulu.
const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
};

// Tampilkan dari cache, perbarui di belakang layar.
const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const update = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached || (await update) || Response.error();
};

/*
 * Navigasi: utamakan jaringan supaya kasir selalu dapat versi terbaru,
 * lalu jatuh ke cache saat offline. Bila URL itu belum pernah dibuka,
 * kerangka /pos yang disajikan — aman karena seluruh halaman di-render
 * di klien dan layout menentukan halaman dari window.location.pathname.
 */
const networkFirstNavigation = async (request) => {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const fallback = await cache.match(SHELL_FALLBACK);
    if (fallback) return fallback;

    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
        '<body style="font-family:system-ui;padding:2rem;text-align:center">' +
        '<h1>Tidak ada koneksi</h1>' +
        '<p>Aplikasi Kasir REP belum pernah dibuka di perangkat ini saat online, ' +
        'jadi belum ada salinan yang bisa dipakai offline.</p></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Jangan ganggu Firestore, Firebase Auth, atau origin lain mana pun.
  if (url.origin !== self.location.origin) return;

  // Route API punya autentikasi dan tidak boleh dilayani dari cache.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isImage(url)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
  }
});
