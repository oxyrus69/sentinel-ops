import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Sentinel Ops — Pemantau Keamanan Aset Web',
    template: '%s | Sentinel Ops',
  },
  description:
    'Inventaris aset web, pemantauan uptime dan SSL, deteksi defacement dan injeksi malware, brankas kredensial terenkripsi, serta manajemen insiden ber-SLA.',
  applicationName: 'Sentinel Ops',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0B0F14',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Every route in this app reads live operational data (session, assets,
 * incidents, scans), so nothing may be prerendered at build time. Without this,
 * `next build` would try to open the database during the prerender phase, which
 * fails when the embedded PGlite data directory is not available to the build
 * worker.
 */
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-surface-base text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
