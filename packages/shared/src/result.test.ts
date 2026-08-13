import { describe, expect, it } from 'vitest';
import { andThen, err, isErr, isOk, map, mapErr, ok, unwrap, unwrapOr } from './result.js';

describe('Result', () => {
  it('ok/err construct the right shape', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('bad')).toEqual({ ok: false, error: 'bad' });
  });

  it('isOk/isErr narrow correctly', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isOk(err('bad'))).toBe(false);
    expect(isErr(err('bad'))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
  });

  it('map transforms the value on ok, passes through on err', () => {
    expect(map(ok(2), (n) => n * 2)).toEqual({ ok: true, value: 4 });
    expect(map(err<string, number>('bad'), (n) => n * 2)).toEqual({ ok: false, error: 'bad' });
  });

  it('mapErr transforms the error on err, passes through on ok', () => {
    expect(mapErr(err('bad'), (e) => e.toUpperCase())).toEqual({ ok: false, error: 'BAD' });
    expect(mapErr(ok<number, string>(1), (e) => e.toUpperCase())).toEqual({ ok: true, value: 1 });
  });

  it('andThen chains ok results and short-circuits on err', () => {
    const parseEven = (n: number) => (n % 2 === 0 ? ok(n) : err('odd'));
    expect(andThen(ok(4), parseEven)).toEqual({ ok: true, value: 4 });
    expect(andThen(ok(3), parseEven)).toEqual({ ok: false, error: 'odd' });
    expect(andThen(err<string, number>('upstream'), parseEven)).toEqual({ ok: false, error: 'upstream' });
  });

  it('unwrapOr returns the value or the fallback', () => {
    expect(unwrapOr(ok(1), 0)).toBe(1);
    expect(unwrapOr(err('bad'), 0)).toBe(0);
  });

  it('unwrap returns the value on ok and throws on err', () => {
    expect(unwrap(ok(1))).toBe(1);
    expect(() => unwrap(err('bad'))).toThrow(/Result\.unwrap/);
  });
});
