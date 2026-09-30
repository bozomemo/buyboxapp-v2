/**
 * Usernames and phone numbers (docs/18-authentication-and-access.md §3.1, §5.3).
 */

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

/**
 * Trimmed and lower-cased, or `undefined` when not a valid username.
 *
 * ASCII-only is what makes lower-casing safe: under a Turkish locale `I` lower-cases to `ı`, and
 * `'İ'.toLowerCase()` is `i` plus a combining dot — both fail the pattern here instead of
 * producing two spellings of one name. `toLowerCase` is the locale-invariant form.
 */
export function normaliseUsername(input: string): string | undefined {
  // Dashes that look like a hyphen are one: an en dash from autocorrect or a paste (found
  // 2026-09-28 on the first-admin form — `test–admin` refused while looking exactly like
  // `test-admin`) must not make a name impossible to type twice the same way.
  const lowered = input.trim().replace(/[‐-―−﹘﹣－]/g, '-').toLowerCase();
  return USERNAME_PATTERN.test(lowered) ? lowered : undefined;
}

/**
 * E.164 (`+905xxxxxxxxx`), or `undefined`.
 *
 * Accepts what people type for a Turkish mobile — `0532 123 45 67`, `532-123-4567`,
 * `+90 (532) 123 45 67`, `90532…` — and any other country when written with its `+` prefix.
 * A Turkish number must be a mobile (5xx): an SMS to a landline never arrives, and failing at
 * entry is kinder than a code that silently never comes.
 */
export function normalisePhone(input: string): string | undefined {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[\s().-]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return undefined;

  let national: string | undefined;
  if (hasPlus) {
    if (!digits.startsWith('90')) {
      return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : undefined;
    }
    national = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith('90')) {
    national = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    national = digits.slice(1);
  } else if (digits.length === 10) {
    national = digits;
  }
  if (national === undefined || !/^5\d{9}$/.test(national)) return undefined;
  return `+90${national}`;
}

/** `+90 5•• ••• •• 47` — enough for the owner to recognise, not enough to be the number. */
export function maskPhone(e164: string): string {
  const tail = e164.slice(-2);
  if (e164.startsWith('+90') && e164.length === 13) return `+90 5•• ••• •• ${tail}`;
  return `${e164.slice(0, 3)}${'•'.repeat(Math.max(0, e164.length - 5))}${tail}`;
}
