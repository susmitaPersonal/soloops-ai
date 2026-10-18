import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Inter (SIL OFL) is self-hosted at build time by next/font: no runtime third-party requests.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: process.env.NEXT_PUBLIC_APP_NAME ?? 'SoloOps AI', template: '%s · SoloOps AI' },
  description: 'Open-source operations assistant for freelance software developers.',
  robots: { index: false, follow: false },
};

// Every page renders per request: the nonce-based CSP (src/proxy.ts) needs it, and no page may
// serve cached per-user data (ADR-0009).
export const dynamic = 'force-dynamic';

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <a className="so-skip-link" href="#main">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
