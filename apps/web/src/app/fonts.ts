import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

/**
 * IBM Plex Sans for text and Plex Mono for numbers and money (spec 2026-11-03-ui-redesign §2).
 *
 * `next/font/google` downloads the files at **build** time and serves them from the app itself,
 * so a customer's browser never contacts Google — which matters on the production server behind
 * the customer's NAT. `latin-ext` is the subset that carries ş, ğ, ı and İ; without it every
 * Turkish label would switch fonts mid-word. Plex has no variable cut, so the weights are listed.
 */
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
});

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});
