import type { Metadata } from 'next';
import './globals.css';
import { NavShell } from './nav-shell';
import { THEME_INIT_SCRIPT } from './theme-init-script';

export const metadata: Metadata = {
  title: 'BuyBoxApp',
  description: 'Trendyol ve Hepsiburada için fiyatlandırma ve ilan yönetimi',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script below sets `data-theme` on this element before
    // React hydrates, which the server's markup never has — an expected, single-attribute
    // mismatch, not a bug. See theme-init-script.ts for why this can't be done any other way.
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <NavShell>{children}</NavShell>
      </body>
    </html>
  );
}
