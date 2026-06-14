import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Kasir - Yayasan Rumah Etnik Papua',
  description: 'Sistem kasir terintegrasi dari Yayasan Rumah Etnik Papua (REP)',
  manifest: '/manifest.json', // Still commonly used as a fallback, Next.js auto handles /manifest.ts too
  icons: {
    icon: '/favicon.svg',
    apple: '/icon-192x192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={`${inter.className} bg-slate-100`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
