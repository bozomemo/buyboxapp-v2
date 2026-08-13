/**
 * StockCode — parses the seller stock code grammar (docs/01-domain-model.md §2).
 *
 * ```
 * <baseStockCode> [ "-" <suffix> ] [ "." <ignored> ]
 * ```
 *
 * Parsed exactly once, in one place. Unlike the legacy system (five different parsers in
 * C# and SQL, silently falling back to unit count 1 or a sentinel), a code this grammar
 * cannot make sense of is a typed error, not a guess.
 */
import { err, ok, type Result } from '@buybox/shared';

export interface StockCode {
  readonly raw: string;
  readonly baseCode: string;
  readonly unitCount: number;
  readonly isBundle: boolean;
}

export type StockCodeError = { readonly type: 'UnparseableStockCode'; readonly stockCode: string };

const GRAMMAR = /^([^-]+)(?:-(.+))?$/;

export function parseStockCode(raw: string): Result<StockCode, StockCodeError> {
  const trimmed = raw.trim();
  const match = GRAMMAR.exec(trimmed);
  if (!match || match[1] === '') {
    return err({ type: 'UnparseableStockCode', stockCode: raw });
  }
  const [, baseCode = '', suffixRaw] = match;

  if (suffixRaw === undefined) {
    return ok({ raw: trimmed, baseCode, unitCount: 1, isBundle: false });
  }

  // "characters are stripped from the suffix before parsing" (doc 01 §2).
  const suffix = suffixRaw.replace(/"/g, '');

  if (/[kK]/.test(suffix)) {
    // Bundle marker — unit count is forced to 1; contents come from the bundle table,
    // not from the code itself.
    return ok({ raw: trimmed, baseCode, unitCount: 1, isBundle: true });
  }

  // Numeric suffix, decimal noise discarded: "4.2" -> unit count 4.
  const numericMatch = /^(\d+)(?:\.\d+)?$/.exec(suffix);
  if (!numericMatch) {
    return err({ type: 'UnparseableStockCode', stockCode: raw });
  }
  const unitCount = Number.parseInt(numericMatch[1] as string, 10);
  return ok({ raw: trimmed, baseCode, unitCount, isBundle: false });
}
