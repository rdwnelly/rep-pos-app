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
    // favicon.svg 739 B dan icon-192x192.png 3 KB, bukan foto logo.
    icon: '/favicon.svg',
    apple: '/icon-192x192.png',
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
