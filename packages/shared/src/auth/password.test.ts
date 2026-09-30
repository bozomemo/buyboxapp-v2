/**
 * R-AUTH-3 (scrypt, parameters in the hash, rehash on weaker parameters) and doc 18 §3.2's
 * policy. Most cases hash at the lowest accepted cost (N = 2^10) so the suite stays fast; one
 * case runs the real parameters, because those are the ones Node's default `maxmem` refuses.
 */
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCRYPT_PARAMS,
  checkPasswordPolicy,
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from './password.js';

const FAST = { log2N: 10, r: 8, p: 1 };

describe('hashPassword / verifyPassword', () => {
  it('runs at the production parameters (maxmem is set high enough)', async () => {
    const stored = await hashPassword('doğru-parola-123');
    expect(stored.startsWith(`scrypt$${CURRENT_SCRYPT_PARAMS.log2N}$8$1$`)).toBe(true);
    expect(await verifyPassword('doğru-parola-123', stored)).toEqual({ ok: true, needsRehash: false });
  });

  it('is deterministic for a given salt, and differs across salts', async () => {
    const salt = Buffer.alloc(16, 7);
    const a = await hashPassword('aynı parola burada', { salt, params: FAST });
    const b = await hashPassword('aynı parola burada', { salt, params: FAST });
    const c = await hashPassword('aynı parola burada', { params: FAST });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  const cases: readonly { name: string; typed: string; expected: { ok: boolean; needsRehash: boolean } }[] = [
    { name: 'the right password', typed: 'kırmızı-elma-42', expected: { ok: true, needsRehash: true } },
    { name: 'a wrong password', typed: 'kirmizi-elma-42', expected: { ok: false, needsRehash: false } },
    { name: 'different case', typed: 'KIRMIZI-ELMA-42', expected: { ok: false, needsRehash: false } },
    { name: 'empty', typed: '', expected: { ok: false, needsRehash: false } },
  ];
  it.each(cases)('$name (weaker stored parameters ask for a rehash only on success)', async ({ typed, expected }) => {
    const stored = await hashPassword('kırmızı-elma-42', { params: FAST });
    expect(await verifyPassword(typed, stored)).toEqual(expected);
  });

  it('normalises to NFC: precomposed and decomposed forms verify alike', async () => {
    const precomposed = 'café-parolası-1';
    const decomposed = 'café-parolası-1';
    const stored = await hashPassword(precomposed, { params: FAST });
    expect((await verifyPassword(decomposed, stored)).ok).toBe(true);
  });

  const corrupt: readonly [string, string][] = [
    ['not a hash', 'hello'],
    ['wrong prefix', 'bcrypt$10$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'],
    ['absurd N (would allocate gigabytes)', `scrypt$30$8$1$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(64).toString('base64')}`],
    ['short key', `scrypt$10$8$1$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(32).toString('base64')}`],
    ['non-integer r', `scrypt$10$x$1$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(64).toString('base64')}`],
  ];
  it.each(corrupt)('refuses a corrupt stored hash: %s', async (_name, stored) => {
    expect(await verifyPassword('anything-at-all', stored)).toEqual({ ok: false, needsRehash: false });
  });

  it('the dummy check always answers false', async () => {
    expect(await verifyAgainstDummy('whatever-was-typed')).toBe(false);
  });
});

describe('checkPasswordPolicy', () => {
  const cases: readonly { name: string; password: string; username: string; expected: string | null }[] = [
    { name: 'long enough, uncommon', password: 'mavi-kapı-yedi-kez', username: 'ayse', expected: null },
    { name: 'nine characters', password: 'abcdefgh9', username: 'ayse', expected: 'too-short' },
    { name: 'ten characters, no digits or symbols (no composition rules)', password: 'dağlarüstü', username: 'ayse', expected: null },
    { name: 'counted in code points, not UTF-16 units', password: '😀😀😀😀😀😀😀😀😀', username: 'ayse', expected: 'too-short' },
    { name: '129 characters', password: 'a'.repeat(64) + 'b'.repeat(65), username: 'ayse', expected: 'too-long' },
    { name: 'the username itself', password: 'mehmet.yilmaz', username: 'mehmet.yilmaz', expected: 'same-as-username' },
    { name: 'the username, other case', password: 'Mehmet.Yilmaz', username: 'mehmet.yilmaz', expected: 'same-as-username' },
    { name: 'a common password', password: 'Password123', username: 'ayse', expected: 'common' },
    { name: 'a common Turkish password', password: 'Galatasaray1905', username: 'ayse', expected: 'common' },
    { name: 'one character repeated', password: '1111111111', username: 'ayse', expected: 'common' },
  ];
  it.each(cases)('$name', ({ password, username, expected }) => {
    expect(checkPasswordPolicy(password, username)).toBe(expected);
  });
});
