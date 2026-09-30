import { describe, expect, it } from 'vitest';
import {
  deriveSmsCodeKey,
  digestsEqual,
  generateOpaqueToken,
  generateRecoveryCodes,
  generateSetupToken,
  generateSmsCode,
  hashRecoveryCode,
  hashToken,
  normaliseRecoveryCode,
  setupTokensEqual,
  smsCodeMac,
} from './tokens.js';

describe('opaque tokens', () => {
  it('are 32 bytes of base64url and never repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateOpaqueToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hash to a stable hex digest', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(digestsEqual(hashToken('abc'), hashToken('abc'))).toBe(true);
    expect(digestsEqual(hashToken('abc'), hashToken('abd'))).toBe(false);
    expect(digestsEqual('ab', 'abc')).toBe(false);
  });
});

describe('recovery codes (doc 18 §5.4)', () => {
  it('issues ten distinct XXXXX-XXXXX codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  });

  const typed: readonly [string, string | undefined][] = [
    ['ABCDE-FGH23', 'ABCDEFGH23'],
    ['abcde fgh23', 'ABCDEFGH23'],
    ['  abcdefgh23 ', 'ABCDEFGH23'],
    ['ABCDE-FGH2', undefined],
    ['ABCDE-FGH21', undefined], // 1 is not in the base32 alphabet
    // A Turkish keyboard's dotless ı: locale-invariant toUpperCase gives I, which is what the
    // user meant. (toLocaleUpperCase('tr') would give I too; it is i → İ that must not happen.)
    ['ıbcde-fgh23', 'IBCDEFGH23'],
    ['ibcde-fgh23', 'IBCDEFGH23'],
  ];
  it.each(typed)('%j normalises to %j', (input, expected) => {
    expect(normaliseRecoveryCode(input)).toBe(expected);
  });

  it('hashes the typed forms of one code identically', () => {
    expect(hashRecoveryCode('abcde fgh23')).toBe(hashRecoveryCode('ABCDE-FGH23'));
    expect(hashRecoveryCode('nonsense')).toBeUndefined();
  });
});

describe('setup token (doc 18 §8.1)', () => {
  it('is 32 base32 characters', () => {
    expect(generateSetupToken()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('compares ignoring case and whitespace from a copied file', () => {
    const token = generateSetupToken();
    expect(setupTokensEqual(token, `  ${token.toLowerCase()}\n`)).toBe(true);
    expect(setupTokensEqual(token, token.slice(1))).toBe(false);
  });
});

describe('SMS codes (doc 18 §5.3)', () => {
  it('are six digits, zero-padded', () => {
    for (let i = 0; i < 500; i++) expect(generateSmsCode()).toMatch(/^\d{6}$/);
  });

  it('MAC depends on the server key and on the row, not only on the code', () => {
    const key = deriveSmsCodeKey('a'.repeat(64));
    const otherKey = deriveSmsCodeKey('b'.repeat(64));
    const mac = smsCodeMac(key, 'row-1', '123456');
    expect(smsCodeMac(key, 'row-1', '123456')).toBe(mac);
    expect(smsCodeMac(key, 'row-2', '123456')).not.toBe(mac);
    expect(smsCodeMac(otherKey, 'row-1', '123456')).not.toBe(mac);
    expect(smsCodeMac(key, 'row-1', '123457')).not.toBe(mac);
  });
});
