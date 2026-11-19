/**
 * The repricing policy's coarse climb step as the operator typed it → the two stored columns
 * (doc 03 §3: `step = mode == 'percent' ? price × pct/100 : amount`). Exactly one column is set,
 * the other is null.
 *
 * The fixed amount is money: read with the same rule as every money field (`toWireDecimal`,
 * product owner 2026-11-19: one TL reading app-wide — "2,50", "2.50" and "1.400" as 1 400 ₺) and
 * turned into kuruş as a `bigint`, never through a float. Anything that is not a positive amount of
 * whole kuruş is refused: a zero step makes the climb add nothing, so a price never rises.
 *
 * Pure: shared by the policy save route, the setup wizard's save route and the impact preview,
 * and by the policy screen to refuse a bad value before posting it — so it imports nothing from
 * the server packages (`client-imports.test.ts`).
 */
import { isOperatorDecimal, toWireDecimal } from './operator-money';

function majorUnitsToKurus(text: unknown): bigint | null {
  if (!isOperatorDecimal(text)) return null;
  const wire = toWireDecimal(text);
  if (wire.startsWith('-')) return null;
  const [whole = '0', fraction = ''] = wire.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export type CoarseStepResult =
  | { ok: true; absolute: bigint | null; percent: number | null }
  | { ok: false; error: string };

export function parseCoarseStep(
  mode: unknown,
  percentText: unknown,
  absoluteText: unknown,
): CoarseStepResult {
  if (mode === 'absolute') {
    const kurus = majorUnitsToKurus(absoluteText);
    if (kurus === null) {
      return { ok: false, error: 'Kaba adım tutarı geçerli bir ₺ tutarı olmalı (ör. 2,50).' };
    }
    if (kurus <= 0n) return { ok: false, error: 'Kaba adım tutarı sıfırdan büyük olmalı.' };
    return { ok: true, absolute: kurus, percent: null };
  }
  if (mode === 'percent') {
    const raw = typeof percentText === 'string' ? percentText.trim() : '';
    const percent = raw === '' ? Number.NaN : Number(raw);
    if (!Number.isFinite(percent) || percent <= 0) {
      return { ok: false, error: 'Kaba adım yüzdesi sıfırdan büyük bir sayı olmalı.' };
    }
    return { ok: true, absolute: null, percent };
  }
  return { ok: false, error: 'Kaba adım türü "percent" ya da "absolute" olmalı.' };
}
