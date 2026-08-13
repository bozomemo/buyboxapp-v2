import type { Metadata } from 'next';
import './globals.css';
import { NavShell } from './nav-shell';

export const metadata: Metadata = {
  title: 'BuyBoxApp',
  description: 'Trendyol ve Hepsiburada için fiyatlandırma ve ilan yönetimi',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <NavShell>{children}</NavShell>
      </body>
    </html>
  );
}
