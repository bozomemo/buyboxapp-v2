/**
 * R-AUTH-6: RFC 6238 Appendix B vectors (SHA-1 rows), the drift window, and the replay guard.
 */
import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  hotp,
  totpCode,
  totpStep,
  totpUri,
  verifyTotp,
} from './totp.js';

// RFC 6238 Appendix B: the SHA-1 seed is the ASCII string "12345678901234567890".
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('totpCode — RFC 6238 Appendix B (SHA-1, 8 digits)', () => {
  const vectors: readonly { unixSeconds: number; code: string }[] = [
    { unixSeconds: 59, code: '94287082' },
    { unixSeconds: 1111111109, code: '07081804' },
    { unixSeconds: 1111111111, code: '14050471' },
    { unixSeconds: 1234567890, code: '89005924' },
    { unixSeconds: 2000000000, code: '69279037' },
    { unixSeconds: 20000000000, code: '65353130' },
  ];
  it.each(vectors)('T=$unixSeconds → $code', ({ unixSeconds, code }) => {
    expect(totpCode(RFC_SECRET, unixSeconds * 1000, 8)).toBe(code);
  });
});

describe('hotp — RFC 4226 Appendix D (6 digits)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  it.each(expected.map((code, counter) => ({ counter, code })))('counter $counter → $code', ({ counter, code }) => {
    expect(hotp(RFC_SECRET, counter)).toBe(code);
  });
});

describe('verifyTotp', () => {
  const now = 1_790_000_000_000;
  const step = totpStep(now);
  const codeAt = (offsetSteps: number) => hotp(RFC_SECRET, step + offsetSteps);

  const cases: readonly {
    name: string;
    code: string;
    lastStep: number | null;
    expected: { ok: true; step: number } | { ok: false };
  }[] = [
    { name: 'current step', code: codeAt(0), lastStep: null, expected: { ok: true, step } },
    { name: 'one step behind (drift)', code: codeAt(-1), lastStep: null, expected: { ok: true, step: step - 1 } },
    { name: 'one step ahead (drift)', code: codeAt(1), lastStep: null, expected: { ok: true, step: step + 1 } },
    { name: 'two steps behind', code: codeAt(-2), lastStep: null, expected: { ok: false } },
    { name: 'two steps ahead', code: codeAt(2), lastStep: null, expected: { ok: false } },
    { name: 'replay of the accepted step', code: codeAt(0), lastStep: step, expected: { ok: false } },
    { name: 'older step after a newer one was used', code: codeAt(-1), lastStep: step, expected: { ok: false } },
    { name: 'newer step after an older one was used', code: codeAt(1), lastStep: step, expected: { ok: true, step: step + 1 } },
    { name: 'spaces are ignored', code: `${codeAt(0).slice(0, 3)} ${codeAt(0).slice(3)}`, lastStep: null, expected: { ok: true, step } },
    { name: 'five digits', code: codeAt(0).slice(0, 5), lastStep: null, expected: { ok: false } },
    { name: 'letters', code: 'abcdef', lastStep: null, expected: { ok: false } },
    { name: 'empty', code: '', lastStep: null, expected: { ok: false } },
  ];

  it.each(cases)('$name', ({ code, lastStep, expected }) => {
    expect(verifyTotp(RFC_SECRET, code, now, lastStep)).toEqual(expected);
  });
});

describe('base32', () => {
  // RFC 4648 §10 vectors, unpadded.
  const vectors: readonly [string, string][] = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];
  it.each(vectors)('%j ↔ %j', (plain, encoded) => {
    expect(base32Encode(Buffer.from(plain))).toBe(encoded);
    expect(base32Decode(encoded)?.toString()).toBe(plain);
  });

  it('decodes what people type: lower case, spaces, padding', () => {
    expect(base32Decode('mzxw 6ytb oi==')?.toString()).toBe('foobar');
  });

  it('rejects characters outside the alphabet', () => {
    expect(base32Decode('MZXW1')).toBeUndefined();
  });

  it('round-trips a 20-byte secret', () => {
    expect(base32Decode(base32Encode(RFC_SECRET))).toEqual(RFC_SECRET);
  });
});

describe('totpUri', () => {
  it('encodes spaces as %20, never +, and carries the issuer twice', () => {
    const uri = totpUri({ issuer: 'BuyBox (Örnek Mağaza)', accountName: 'ayse', secret: Buffer.from('foobar') });
    expect(uri).toBe(
      'otpauth://totp/BuyBox%20(%C3%96rnek%20Ma%C4%9Faza):ayse' +
        '?secret=MZXW6YTBOI&issuer=BuyBox%20(%C3%96rnek%20Ma%C4%9Faza)&algorithm=SHA1&digits=6&period=30',
    );
    expect(uri).not.toContain('+');
  });
});
