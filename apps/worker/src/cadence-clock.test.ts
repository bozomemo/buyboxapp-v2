import { describe, expect, it } from 'vitest';
import { checkEveryMs, createCadenceClock } from './cadence-clock.js';

const DAY = 24 * 60 * 60_000;
const at = (iso: string) => Date.parse(iso);

describe('createCadenceClock', () => {
  it('is due at once for a job that has never run', () => {
    expect(createCadenceClock(DAY, undefined).isDue(at('2026-10-03T00:00:00Z'))).toBe(true);
  });

  it.each([
    // The production sequence: the 28 Sep run started 00:03:29 and took 80 s; the 29 Sep boot
    // came at 00:03:13. Measured from the finish this read "not due" and the day was lost.
    { now: '2026-09-29T00:03:13Z', due: false },
    { now: '2026-09-29T00:03:28Z', due: false },
    // Anchored on the start, it falls due 16 s after that boot — the next minute's check.
    { now: '2026-09-29T00:03:29Z', due: true },
    { now: '2026-09-29T00:04:13Z', due: true },
  ])('anchors on the last run start: at $now due=$due', ({ now, due }) => {
    const clock = createCadenceClock(DAY, at('2026-09-28T00:03:29Z'));
    expect(clock.isDue(at(now))).toBe(due);
  });

  it('is due one cadence after a fire, not one cadence after the previous due time', () => {
    const clock = createCadenceClock(DAY, at('2026-09-28T00:03:29Z'));
    clock.markFired(at('2026-09-29T00:04:13Z'));
    expect(clock.isDue(at('2026-09-30T00:04:12Z'))).toBe(false);
    expect(clock.isDue(at('2026-09-30T00:04:13Z'))).toBe(true);
  });

  it('runs a daily job every day across nightly restarts at a drifting boot time', () => {
    // Each night a fresh process builds its clock from the run the previous one recorded, then
    // checks once a minute — the shape `index.ts` gives it.
    const boots = ['00:03:10', '00:03:13', '00:03:16', '00:04:20', '00:04:24', '00:03:27'];
    let lastStart = at('2026-09-27T00:03:00Z');
    const fired: string[] = [];
    boots.forEach((time, i) => {
      const day = String(28 + i).padStart(2, '0');
      const date = Number(day) > 30 ? `2026-10-0${Number(day) - 30}` : `2026-09-${day}`;
      const clock = createCadenceClock(DAY, lastStart);
      for (let now = at(`${date}T${time}Z`); now < at(`${date}T${time}Z`) + DAY - 600_000; now += 60_000) {
        if (!clock.isDue(now)) continue;
        clock.markFired(now);
        lastStart = now;
        fired.push(date);
        break;
      }
    });
    expect(fired).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
  });
});

describe('checkEveryMs', () => {
  it.each([
    { cadenceMs: DAY, expected: 60_000 },
    { cadenceMs: 60 * 60_000, expected: 60_000 },
    { cadenceMs: 60_000, expected: 60_000 },
    { cadenceMs: 10_000, expected: 10_000 },
  ])('checks a $cadenceMs ms cadence every $expected ms', ({ cadenceMs, expected }) => {
    expect(checkEveryMs(cadenceMs)).toBe(expected);
  });
});
