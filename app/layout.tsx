import type { Metadata, Viewport } from 'next';
import { Inter, Lora } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { ServiceWorkerRegistrar } from '../components/ServiceWorkerRegistrar';

const inter = Inter({ subsets: ['latin'] });
const lora = Lora({ subsets: ['latin'], variable: '--font-lora' });

export const metadata: Metadata = {
  title: 'KASIR RELY',
  description: 'KASIR RELY — aplikasi kasir terintegrasi oleh RELY STUDIO',
  manifest: '/manifest.json', // Still commonly used as a fallback, Next.js auto handles /manifest.ts too
  icons: {
    // Logo Rumah Etnik Papua sebagai badge: kotak warna lembaga
    // dengan logo dicetak putih. Logonya berbentuk lanskap 2:1, jadi
    // kalau ditaruh utuh di kanvas persegi, pada 32 px tingginya
    // tinggal separuh dan hasilnya cuma garis tipis yang tak terbaca
    // di tab. Dibalik begini bentuknya tetap kenali pada ukuran kecil.
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.png', sizes: '64x64', type: 'image/png' },
    ],
    // Ikon layar utama iOS, 180 px: tanpa sudut membulat buatan
    // sendiri, karena iOS yang membentuknya.
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" data-scroll-behavior="smooth">
      <body className={`${inter.className} ${lora.variable} bg-slate-100`}>
        <ServiceWorkerRegistrar />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
