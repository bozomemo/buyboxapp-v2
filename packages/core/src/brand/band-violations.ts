/**
 * The price-band alarm's state machine (doc 17 §5.2, §5.3, build plan 11.6).
 *
 * A violation is a **state**, not an event: opened the first time a look shows the buybox outside
 * the band, confirmed by later looks that still show it, resolved when a look shows otherwise.
 * This file decides *what should change* from one look; the repository applies it. Pure: the
 * caller hands in the open rows and the look, and gets back a plan.
 *
 * The judge is `evaluateBand` and nothing else — the same function the İlanlar status column
 * calls — so a row's colour on the screen and a violation in the database can never disagree.
 */
import type { BandBasis, BandEvaluation, BandPriceSource, BandViolationKind } from './band.js';

/** Why a violation ended (doc 17 §5.3). `unlinked` is applied by the repository at unlink. */
export type BandResolution = 'inBand' | 'buyboxChanged' | 'noOffers' | 'thresholdRemoved' | 'unlinked';

export interface BandSeller {
  /** The marketplace's merchant id. `null` when the page named a seller without one. */
  readonly sellerRef: string | null;
  readonly sellerName: string;
}

export interface OpenBandViolation extends BandSeller {
  readonly id: string;
  readonly kind: BandViolationKind;
}

/**
 * One **successful** look of a linked card. A failed look is not a `BandLook` at all: a page we
 * could not read says nothing about the price on it (§5.3), so the caller does not reconcile.
 */
export type BandLook =
  | { readonly kind: 'noOffers' }
  | {
      readonly kind: 'offers';
      /** The rank-1 offer's seller. */
      readonly buyboxSeller: BandSeller;
      readonly evaluation: BandEvaluation;
    };

export interface BandViolationToOpen extends BandSeller {
  readonly kind: BandViolationKind;
  /** The card-level bound breached: `lower` for `belowMin`, `upper` for `aboveMax`. */
  readonly thresholdApplied: bigint;
  readonly observedPrice: bigint;
  readonly priceSource: BandPriceSource;
  /** Shelf price or only the coupon (brand roadmap §6.7) — refreshed on every confirm. */
  readonly basis: BandBasis;
}

export interface BandReconcilePlan {
  readonly open: readonly BandViolationToOpen[];
  /** Still breached by the same seller: refresh `last_seen_at` and the observed price only. */
  readonly confirm: readonly { id: string; observedPrice: bigint; priceSource: BandPriceSource; basis: BandBasis }[];
  readonly resolve: readonly { id: string; resolution: BandResolution }[];
}

const KINDS: readonly BandViolationKind[] = ['belowMin', 'aboveMax'];

/**
 * Whether two sightings are the same seller. By merchant id when both have one; by display name
 * only when **neither** does — a name match against a known id is not proof (doc 05 §5), and
 * calling it a different seller just resolves one violation and opens another, which is the
 * honest outcome when we cannot tell.
 */
export function sameSeller(a: BandSeller, b: BandSeller): boolean {
  if (a.sellerRef !== null && b.sellerRef !== null) return a.sellerRef === b.sellerRef;
  if (a.sellerRef === null && b.sellerRef === null) return a.sellerName === b.sellerName;
  return false;
}

/**
 * What one successful look changes, per violation kind (doc 17 §5.2, §5.3):
 *
 * | open row? | breached now? | seller        | outcome                              |
 * |-----------|---------------|---------------|--------------------------------------|
 * | no        | yes           | —             | open                                 |
 * | yes       | yes           | same          | confirm (no new row, no notification)|
 * | yes       | yes           | another       | resolve `buyboxChanged` + open       |
 * | yes       | no            | same          | resolve `inBand`                     |
 * | yes       | no            | another       | resolve `buyboxChanged`              |
 * | yes (min) | no min set    | —             | resolve `thresholdRemoved`           |
 * | any       | `noOffers`    | —             | resolve `noOffers`                   |
 * | any       | `unknown`     | —             | nothing                              |
 *
 * `inBand` is per kind: a seller who jumps from below the min straight above the max ends the
 * `belowMin` violation (that condition is over) and opens an `aboveMax` one in the same plan.
 *
 * Expects at most one open row per kind — the repository's invariant. Should a second ever
 * exist, every row of the kind is judged, so none is left open for ever.
 */
export function planBandReconcile(
  openRows: readonly OpenBandViolation[],
  look: BandLook,
): BandReconcilePlan {
  if (look.kind === 'noOffers') {
    return { open: [], confirm: [], resolve: openRows.map((row) => ({ id: row.id, resolution: 'noOffers' })) };
  }

  const { evaluation, buyboxSeller } = look;
  if (evaluation.status === 'unknown' || evaluation.observedPrice === null || evaluation.priceSource === null) {
    return { open: [], confirm: [], resolve: [] };
  }
  const observedPrice = evaluation.observedPrice;
  const priceSource = evaluation.priceSource;
  // Every breach has a basis; `shelf` stands in only for the type, never for a real breach.
  const basis: BandBasis = evaluation.basis ?? 'shelf';

  const open: BandViolationToOpen[] = [];
  const confirm: { id: string; observedPrice: bigint; priceSource: BandPriceSource; basis: BandBasis }[] = [];
  const resolve: { id: string; resolution: BandResolution }[] = [];

  for (const kind of KINDS) {
    const rows = openRows.filter((row) => row.kind === kind);
    const breached = evaluation.violations.includes(kind);
    let stillOpen = false;

    for (const row of rows) {
      if (kind === 'belowMin' && evaluation.band.lower === null) {
        resolve.push({ id: row.id, resolution: 'thresholdRemoved' });
      } else if (sameSeller(row, buyboxSeller)) {
        if (breached && !stillOpen) {
          confirm.push({ id: row.id, observedPrice, priceSource, basis });
          stillOpen = true;
        } else {
          resolve.push({ id: row.id, resolution: breached ? 'buyboxChanged' : 'inBand' });
        }
      } else {
        resolve.push({ id: row.id, resolution: 'buyboxChanged' });
      }
    }

    if (breached && !stillOpen) {
      const thresholdApplied = kind === 'belowMin' ? evaluation.band.lower! : evaluation.band.upper;
      open.push({ kind, ...buyboxSeller, thresholdApplied, observedPrice, priceSource, basis });
    }
  }

  return { open, confirm, resolve };
}
