/**
 * Duration — an explicit span of time, used for policy settings (poll interval, settle
 * time, confirmation windows — see docs/03-repricing-engines.md, docs/07-processes-and-jobs.md)
 * so a bare number is never ambiguous between seconds and milliseconds.
 */

const brand = Symbol('Duration');

export type Duration = { readonly [brand]: true; readonly millis: number };

function of(millis: number): Duration {
  if (!Number.isFinite(millis) || millis < 0) {
    throw new RangeError(`Duration: invalid millisecond value ${millis}`);
  }
  return { [brand]: true, millis };
}

export const Duration = {
  zero: of(0),
  millis: (value: number): Duration => of(value),
  seconds: (value: number): Duration => of(value * 1000),
  minutes: (value: number): Duration => of(value * 60_000),
  hours: (value: number): Duration => of(value * 3_600_000),
  days: (value: number): Duration => of(value * 86_400_000),

  toMillis: (d: Duration): number => d.millis,
  toSeconds: (d: Duration): number => d.millis / 1000,

  add: (a: Duration, b: Duration): Duration => of(a.millis + b.millis),
  compare: (a: Duration, b: Duration): -1 | 0 | 1 => (a.millis < b.millis ? -1 : a.millis > b.millis ? 1 : 0),
};
