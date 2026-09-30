/**
 * The "bundled list of common passwords" of docs/18-authentication-and-access.md §3.2.
 *
 * Only entries of at least `AUTH_PASSWORD_MIN_LENGTH` (10) characters are worth listing — the
 * length rule already refuses everything shorter. Drawn from the most frequent entries of public
 * breach corpora at that length, plus the Turkish patterns a Turkish office reaches for first
 * (the store, the season, the keyboard row). Compared lower-cased; kept deliberately small, since
 * the second factor carries the rest (§5).
 */
const COMMON = new Set<string>([
  '1234567890',
  '0123456789',
  '12345678910',
  '0987654321',
  '1234567890a',
  '1q2w3e4r5t',
  '1q2w3e4r5t6y',
  'q1w2e3r4t5',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  'qwerty123456',
  'asdfghjkl1',
  'asdfghjkl123',
  'zxcvbnm123',
  '1qaz2wsx3edc',
  'qazwsxedc123',
  'password12',
  'password123',
  'password1234',
  'password!23',
  'passw0rd123',
  'iloveyou123',
  'abcdefghij',
  'abc1234567',
  'abcd123456',
  'a123456789',
  'aa12345678',
  'admin12345',
  'admin123456',
  'administrator',
  'welcome123',
  'letmein123',
  'football123',
  'princess123',
  'sunshine123',
  'trustno1234',
  'changeme123',
  'superman123',
  'baseball123',
  // Turkish
  'qwertyuıop',
  'sifre12345',
  'sifre123456',
  'şifre12345',
  'şifre123456',
  'parola1234',
  'parola12345',
  'parola123456',
  'galatasaray',
  'galatasaray1905',
  'fenerbahce',
  'fenerbahce1907',
  'fenerbahçe1907',
  'besiktas1903',
  'beşiktaş1903',
  'trabzonspor',
  'trabzonspor1967',
  'mustafakemal',
  'ataturk1881',
  'atatürk1881',
  'istanbul34',
  'istanbul1453',
  'ankara0606',
  'turkiye1923',
  'türkiye1923',
  'buybox1234',
  'buybox12345',
  'trendyol123',
  'trendyol1234',
  'hepsiburada',
  'hepsiburada1',
]);

export function isCommonPassword(password: string): boolean {
  const lowered = password.toLowerCase();
  if (COMMON.has(lowered)) return true;
  // One character repeated ("aaaaaaaaaa", "1111111111") is the other thing people type at a
  // length rule; it is not worth a list entry per character.
  const chars = [...lowered];
  return chars.length > 0 && chars.every((c) => c === chars[0]);
}
