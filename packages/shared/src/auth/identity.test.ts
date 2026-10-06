import { describe, expect, it } from 'vitest';
import { maskPhone, normalisePhone, normaliseUsername } from './identity.js';
import { LEGACY_OPERATOR_ACTOR, parseActor, userActor } from './actor.js';
import { clientAddress, isSessionLive, shouldTouchSession } from './session.js';
import { authDeploymentProblems } from './env.js';

describe('normaliseUsername (doc 18 §3.1)', () => {
  const cases: readonly [string, string | undefined][] = [
    ['ayse', 'ayse'],
    ['  Mehmet.Yilmaz ', 'mehmet.yilmaz'],
    ['fiyat_yoneticisi-2', 'fiyat_yoneticisi-2'],
    ['ab', undefined],
    ['a'.repeat(33), undefined],
    ['ayşe', undefined], // non-ASCII: refused rather than folded
    ['İSMAİL', undefined], // 'İ'.toLowerCase() is i + U+0307, not i
    ['ISMAIL', 'ismail'], // ASCII I lower-cases to i, never to ı
    ['ayse yilmaz', undefined],
    // Dash lookalikes are a hyphen (2026-09-28): en dash, em dash, minus sign, Unicode hyphen.
    ['test–admin', 'test-admin'],
    ['test—admin', 'test-admin'],
    ['test−admin', 'test-admin'],
    ['test‐admin', 'test-admin'],
    ['ayse@firma', undefined],
  ];
  it.each(cases)('%j → %j', (input, expected) => {
    expect(normaliseUsername(input)).toBe(expected);
  });
});

describe('normalisePhone (doc 18 §5.3)', () => {
  const cases: readonly [string, string | undefined][] = [
    ['05321234567', '+905321234567'],
    ['0532 123 45 67', '+905321234567'],
    ['532-123-4567', '+905321234567'],
    ['5321234567', '+905321234567'],
    ['+90 (532) 123 45 67', '+905321234567'],
    ['905321234567', '+905321234567'],
    ['+905321234567', '+905321234567'],
    ['02121234567', undefined], // Istanbul landline — an SMS never arrives
    ['+902121234567', undefined],
    ['0532123456', undefined], // one digit short
    ['+4915112345678', '+4915112345678'], // foreign mobile, written with +
    ['4915112345678', undefined], // foreign without + is ambiguous
    ['0532 123 45 6a', undefined],
    ['', undefined],
  ];
  it.each(cases)('%j → %j', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it('masks all but the last two digits', () => {
    expect(maskPhone('+905321234567')).toBe('+90 5•• ••• •• 67');
    expect(maskPhone('+4915112345678')).toBe('+49•••••••••78');
  });
});

describe('actors (doc 18 §9.1)', () => {
  const cases: readonly [string, ReturnType<typeof parseActor>][] = [
    [userActor('0190a1b2-c3d4'), { kind: 'user', userId: '0190a1b2-c3d4' }],
    ['system', { kind: 'system' }],
    ['system:license', { kind: 'system' }],
    ['cli', { kind: 'cli' }],
    [LEGACY_OPERATOR_ACTOR, { kind: 'legacy-operator' }],
    ['setup-wizard', { kind: 'other', raw: 'setup-wizard' }],
    ['user:', { kind: 'other', raw: 'user:' }],
  ];
  it.each(cases)('%j', (raw, expected) => {
    expect(parseActor(raw)).toEqual(expected);
  });

  it('refuses to build an actor from an empty id', () => {
    expect(() => userActor('')).toThrow();
  });
});

describe('session lifetime (doc 18 §4.1)', () => {
  const HOUR = 3_600_000;
  const idle = 8 * HOUR;
  const signedInAt = 1_790_000_000_000;
  const session = { lastSeenAt: signedInAt, expiresAt: signedInAt + 7 * 24 * HOUR };

  const cases: readonly { name: string; lastSeenOffset: number; nowOffset: number; live: boolean }[] = [
    { name: 'just signed in', lastSeenOffset: 0, nowOffset: 0, live: true },
    { name: 'idle just under the limit', lastSeenOffset: 0, nowOffset: idle - 1, live: true },
    { name: 'idle exactly the limit', lastSeenOffset: 0, nowOffset: idle, live: false },
    { name: 'active all week, before the absolute limit', lastSeenOffset: 7 * 24 * HOUR - HOUR, nowOffset: 7 * 24 * HOUR - 1, live: true },
    { name: 'active all week, at the absolute limit', lastSeenOffset: 7 * 24 * HOUR - HOUR, nowOffset: 7 * 24 * HOUR, live: false },
  ];
  it.each(cases)('$name → live=$live', ({ lastSeenOffset, nowOffset, live }) => {
    expect(
      isSessionLive({ ...session, lastSeenAt: signedInAt + lastSeenOffset }, signedInAt + nowOffset, idle),
    ).toBe(live);
  });

  it('touches last_seen_at at most once a minute', () => {
    expect(shouldTouchSession(session, signedInAt + 59_999)).toBe(false);
    expect(shouldTouchSession(session, signedInAt + 60_000)).toBe(true);
  });
});

describe('clientAddress (doc 18 §3.3)', () => {
  const cases: readonly { name: string; header: string | null; trust: boolean; expected: string | undefined }[] = [
    { name: 'not behind our proxy: header ignored', header: '203.0.113.9', trust: false, expected: undefined },
    { name: 'behind our proxy: one entry', header: '203.0.113.9', trust: true, expected: '203.0.113.9' },
    { name: 'client-forged entries before ours are ignored', header: '10.0.0.1, 1.2.3.4, 203.0.113.9', trust: true, expected: '203.0.113.9' },
    { name: 'no header', header: null, trust: true, expected: undefined },
    { name: 'empty header', header: ' , ', trust: true, expected: undefined },
  ];
  it.each(cases)('$name', ({ header, trust, expected }) => {
    expect(clientAddress(header, trust)).toBe(expected);
  });
});

describe('authDeploymentProblems (R-DEP-16)', () => {
  const cases: readonly { name: string; env: NodeJS.ProcessEnv; problems: number }[] = [
    { name: 'loopback install, nothing set', env: {}, problems: 0 },
    { name: 'loopback install with HOSTNAME unset is fine', env: { HOSTNAME: '' }, problems: 0 },
    { name: 'network install, loopback bind', env: { PUBLIC_ORIGIN: 'https://fiyat.example.com.tr', HOSTNAME: '127.0.0.1' }, problems: 0 },
    { name: 'network install, trailing slash tolerated', env: { PUBLIC_ORIGIN: 'https://fiyat.example.com.tr/', HOSTNAME: 'localhost' }, problems: 0 },
    { name: 'network install over http', env: { PUBLIC_ORIGIN: 'http://fiyat.example.com.tr', HOSTNAME: '127.0.0.1' }, problems: 1 },
    { name: 'network install with a path', env: { PUBLIC_ORIGIN: 'https://example.com/buybox', HOSTNAME: '127.0.0.1' }, problems: 1 },
    { name: 'network install bound to every interface', env: { PUBLIC_ORIGIN: 'https://fiyat.example.com.tr', HOSTNAME: '0.0.0.0' }, problems: 1 },
    { name: 'network install with HOSTNAME unset (Next binds everything)', env: { PUBLIC_ORIGIN: 'https://fiyat.example.com.tr' }, problems: 1 },
    { name: 'a non-numeric session lifetime', env: { AUTH_SESSION_IDLE_MS: 'eight hours' }, problems: 1 },
    { name: 'production loopback install bound to loopback', env: { NODE_ENV: 'production', HOSTNAME: '127.0.0.1' }, problems: 0 },
    { name: 'production loopback install bound to every interface', env: { NODE_ENV: 'production', HOSTNAME: '0.0.0.0' }, problems: 1 },
    { name: 'production loopback install with HOSTNAME unset (Next binds everything)', env: { NODE_ENV: 'production' }, problems: 1 },
    { name: 'production loopback install bound to a LAN address', env: { NODE_ENV: 'production', HOSTNAME: '192.168.1.10' }, problems: 1 },
    { name: 'development may bind every interface', env: { NODE_ENV: 'development', HOSTNAME: '0.0.0.0' }, problems: 0 },
    { name: 'production network install, loopback bind', env: { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://fiyat.example.com.tr', HOSTNAME: '127.0.0.1' }, problems: 0 },
  ];
  it.each(cases)('$name → $problems problem(s)', ({ env, problems }) => {
    expect(authDeploymentProblems(env)).toHaveLength(problems);
  });
});
