import { Money } from '@buybox/shared';

/**
 * The repricing policy's coarse climb step as the operator typed it → the two stored columns
 * (doc 03 §3: `step = mode == 'percent' ? price × pct/100 : amount`). Exactly one column is set,
 * the other is null.
 *
 * The fixed amount is money: it is parsed exactly to kuruş as a `bigint`, never through a float.
 * The decimal separator may be a dot (how this form shows every other ₺ field, and how the GET
 * route returns the stored amount) or a single comma (how an operator types lira). Anything
 * that is not a positive amount of whole kuruş is refused — a zero step makes the climb add
 * nothing, so a price never rises, and "1.400" is refused rather than guessed at.
 *
 * Pure: shared by the policy save route, the setup wizard's save route and the impact preview,
 * and by the policy screen to refuse a bad value before posting it.
 */
export type CoarseStepResult =
  | { ok: true; absolute: bigint | null; percent: number | null }
  | { ok: false; error: string };

export function parseCoarseStep(
  mode: unknown,
  percentText: unknown,
  absoluteText: unknown,
): CoarseStepResult {
  if (mode === 'absolute') {
    const raw = typeof absoluteText === 'string' ? absoluteText.trim().replace(',', '.') : '';
    let kurus: bigint;
    try {
      kurus = Money.fromMajorUnitsString(raw).toKurus();
    } catch {
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
