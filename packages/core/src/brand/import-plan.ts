/**
 * What an Excel row means for the brand catalogue (doc 17 §3.3–§3.5): which product it updates,
 * which it creates, and which rows are refused and why.
 *
 * Pure, and deliberately so. Reading a workbook is I/O, writing the rows is a transaction, but
 * *deciding* is neither — and the decisions here are the ones that go wrong quietly: a row that
 * matches two different products, a link that is somebody else's extra card, an empty cell that
 * means "clear this" for a price and "leave this alone" for a link. Everything this needs about
 * the existing catalogue is passed in.
 *
 * The caller parses cells first, so this module never sees a locale, a spreadsheet or a URL: an
 * amount has already become `bigint` kuruş or a parse failure, and a link has already become a
 * marketplace ref or a named problem.
 */
import { classifyBarcode } from './barcode.js';
import { checkBrandProductPrices } from './band.js';

export type ImportMarketplace = 'trendyol' | 'hepsiburada';

/** A parsed amount cell. `empty` is a *stated* emptiness — see `ImportRowPlan` for what it clears. */
export type AmountCell =
  | { readonly kind: 'empty' }
  | { readonly kind: 'amount'; readonly value: bigint }
  | { readonly kind: 'invalid'; readonly text: string };

/** A parsed link cell. Mirrors `ProductLinkProblem` in `packages/adapters`, without depending on it. */
export type LinkCell =
  | { readonly kind: 'empty' }
  /** `url` is the canonical absolute link, carried so a card this install does not track yet can
   *  be created with the page it was named by rather than a URL assembled from the id. */
  | { readonly kind: 'ref'; readonly contentId: string; readonly url: string }
  | { readonly kind: 'wrongMarketplace' }
  /** `parentRef` lets the caller look the parent up among tracked variants before planning. */
  | { readonly kind: 'parentProduct'; readonly parentRef?: string }
  | { readonly kind: 'unrecognised' };

export interface ImportRowInput {
  /** The line number in the operator's file — every message names it, so it can be found. */
  readonly line: number;
  readonly name: string;
  readonly referencePrice: AmountCell;
  readonly minPrice: AmountCell;
  readonly maxPrice: AmountCell;
  readonly trendyolLink: LinkCell;
  readonly hepsiburadaLink: LinkCell;
  readonly barcode: string;
}

/** A card this install already knows, keyed by `cardKey(marketplace, ref)`. */
export interface ExistingCard {
  readonly brandProductId: string;
  readonly brandProductName: string;
  /** Only a **primary** card matches a row to its product (doc 17 §3.3). */
  readonly isPrimary: boolean;
}

export interface ImportContext {
  readonly existingCards: ReadonlyMap<string, ExistingCard>;
  /** Product names already in the catalogue, folded, for the duplicate-name warning. */
  readonly existingNames?: ReadonlySet<string>;
  /**
   * Marketplaces this install has. A link to one it does not is refused **per row**, so a file
   * that names Hepsiburada on a few rows still imports its Trendyol ones — and, more importantly,
   * the preview says so. Without this the row passed the preview and the write refused it, which
   * is the one thing a preview must never do. Omitted means "do not check".
   */
  readonly configuredMarketplaces?: ReadonlySet<string>;
}

export function cardKey(marketplace: ImportMarketplace, contentId: string): string {
  return `${marketplace}::${contentId}`;
}

export type ImportErrorCode =
  | 'missingName'
  | 'missingReferencePrice'
  | 'unparseableReferencePrice'
  | 'unparseableMinPrice'
  | 'unparseableMaxPrice'
  | 'nonPositiveAmount'
  | 'minAboveUpper'
  | 'noLink'
  | 'linkUnrecognised'
  | 'linkWrongColumn'
  | 'linkParentProduct'
  | 'linkIsSecondaryCard'
  | 'conflictingProducts'
  | 'duplicateLinkInFile'
  | 'marketplaceNotConfigured'
  | 'barcodeScientific';

export interface ImportRowError {
  readonly code: ImportErrorCode;
  /** Which column the error is about, where it is about one. */
  readonly column?:
    | 'name'
    | 'referencePrice'
    | 'minPrice'
    | 'maxPrice'
    | 'trendyolLink'
    | 'hepsiburadaLink'
    | 'barcode';
  /** The other product's name, for the two errors that name one. */
  readonly otherProductName?: string;
}

export type ImportWarningCode = 'referenceBelowMin' | 'referenceAboveMax' | 'duplicateName' | 'barcodeNotGtin';

export interface PlannedLink {
  readonly marketplace: ImportMarketplace;
  readonly contentId: string;
  readonly url: string;
}

/**
 * The fields a row states about its product.
 *
 * **Every one of them is a complete statement, including an empty cell** (doc 17 §3.4): an empty
 * `Min Fiyat` removes a min that was set before. That is why they are `bigint | null` rather than
 * optional — "not given" and "given as empty" are the same thing here, and both mean *cleared*.
 * Links are the exception and are not part of this: an empty link column changes nothing, because
 * a link is how a row is matched rather than a field of the product, and unlinking a card is done
 * on the screen where its consequences are shown.
 */
export interface PlannedFields {
  readonly name: string;
  readonly referencePrice: bigint;
  readonly minPrice: bigint | null;
  readonly maxPrice: bigint | null;
  readonly barcode: string | null;
}

export type ImportRowPlan =
  | {
      readonly kind: 'new';
      readonly line: number;
      readonly fields: PlannedFields;
      /** Each link becomes the new product's primary card on its marketplace, ×1. */
      readonly links: readonly PlannedLink[];
      readonly warnings: readonly ImportWarningCode[];
    }
  | {
      readonly kind: 'update';
      readonly line: number;
      readonly brandProductId: string;
      readonly fields: PlannedFields;
      /** Only links that are not already this product's primary on their marketplace. */
      readonly links: readonly PlannedLink[];
      readonly warnings: readonly ImportWarningCode[];
    }
  | { readonly kind: 'error'; readonly line: number; readonly errors: readonly ImportRowError[] };

export interface ImportPlan {
  readonly rows: readonly ImportRowPlan[];
  readonly newProducts: number;
  readonly updatedProducts: number;
  /** Links that will be attached — some of these cards exist already, some will be created. */
  readonly linksToAttach: number;
  readonly errorRows: number;
}

/** Case- and space-insensitive, Turkish-aware: `İ`/`ı` fold the way a Turkish reader expects. */
export function foldName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

function amountProblem(
  cell: AmountCell,
  code: ImportErrorCode,
  column: ImportRowError['column'],
): ImportRowError | null {
  return cell.kind === 'invalid' ? { code, column } : null;
}

function linkProblem(cell: LinkCell, column: 'trendyolLink' | 'hepsiburadaLink'): ImportRowError | null {
  switch (cell.kind) {
    case 'wrongMarketplace':
      return { code: 'linkWrongColumn', column };
    case 'parentProduct':
      return { code: 'linkParentProduct', column };
    case 'unrecognised':
      return { code: 'linkUnrecognised', column };
    default:
      return null;
  }
}

/**
 * Plans a whole file. Rows are judged together rather than one at a time, because two of the
 * rules are *about* the file: the same link on two rows is an error on **both** (neither is more
 * right than the other), and a duplicate name is a warning about a pair.
 */
export function planBrandProductImport(rows: readonly ImportRowInput[], context: ImportContext): ImportPlan {
  // Which lines each link appears on. A link on two rows cannot be resolved by taking the first:
  // the file states two different things about one card and only a person can say which is meant.
  const linesByLink = new Map<string, number[]>();
  for (const row of rows) {
    for (const [marketplace, cell] of [
      ['trendyol', row.trendyolLink],
      ['hepsiburada', row.hepsiburadaLink],
    ] as const) {
      if (cell.kind !== 'ref') continue;
      const key = cardKey(marketplace, cell.contentId);
      linesByLink.set(key, [...(linesByLink.get(key) ?? []), row.line]);
    }
  }

  const nameCounts = new Map<string, number>();
  for (const row of rows) {
    const folded = foldName(row.name);
    if (folded !== '') nameCounts.set(folded, (nameCounts.get(folded) ?? 0) + 1);
  }

  const planned = rows.map((row) => planRow(row, context, linesByLink, nameCounts));
  return {
    rows: planned,
    newProducts: planned.filter((row) => row.kind === 'new').length,
    updatedProducts: planned.filter((row) => row.kind === 'update').length,
    linksToAttach: planned.reduce((sum, row) => sum + (row.kind === 'error' ? 0 : row.links.length), 0),
    errorRows: planned.filter((row) => row.kind === 'error').length,
  };
}

function planRow(
  row: ImportRowInput,
  context: ImportContext,
  linesByLink: ReadonlyMap<string, readonly number[]>,
  nameCounts: ReadonlyMap<string, number>,
): ImportRowPlan {
  const errors: ImportRowError[] = [];

  const name = row.name.trim();
  if (name === '') errors.push({ code: 'missingName', column: 'name' });

  for (const [cell, code, column] of [
    [row.referencePrice, 'unparseableReferencePrice', 'referencePrice'],
    [row.minPrice, 'unparseableMinPrice', 'minPrice'],
    [row.maxPrice, 'unparseableMaxPrice', 'maxPrice'],
  ] as const) {
    const problem = amountProblem(cell, code, column);
    if (problem) errors.push(problem);
  }
  if (row.referencePrice.kind === 'empty') {
    errors.push({ code: 'missingReferencePrice', column: 'referencePrice' });
  }

  for (const [cell, column] of [
    [row.trendyolLink, 'trendyolLink'],
    [row.hepsiburadaLink, 'hepsiburadaLink'],
  ] as const) {
    const problem = linkProblem(cell, column);
    if (problem) errors.push(problem);
  }

  const links: PlannedLink[] = [];
  if (row.trendyolLink.kind === 'ref') {
    links.push({ marketplace: 'trendyol', contentId: row.trendyolLink.contentId, url: row.trendyolLink.url });
  }
  if (row.hepsiburadaLink.kind === 'ref') {
    links.push({
      marketplace: 'hepsiburada',
      contentId: row.hepsiburadaLink.contentId,
      url: row.hepsiburadaLink.url,
    });
  }
  // "One of the two" (doc 17 §3.1): a product with no card is not importable, because nothing
  // would ever be compared against its PSF. A row whose only link failed to parse already has
  // that error and does not need this one on top.
  if (links.length === 0 && !errors.some((error) => error.code.startsWith('link'))) {
    errors.push({ code: 'noLink' });
  }

  for (const link of links) {
    if (context.configuredMarketplaces && !context.configuredMarketplaces.has(link.marketplace)) {
      errors.push({
        code: 'marketplaceNotConfigured',
        column: link.marketplace === 'trendyol' ? 'trendyolLink' : 'hepsiburadaLink',
      });
    }
    const key = cardKey(link.marketplace, link.contentId);
    const lines = linesByLink.get(key) ?? [];
    if (lines.length > 1) {
      errors.push({
        code: 'duplicateLinkInFile',
        column: link.marketplace === 'trendyol' ? 'trendyolLink' : 'hepsiburadaLink',
      });
    }
  }

  // Matching (doc 17 §3.3). Only a primary card matches; a **non-primary** one is somebody's
  // deliberate extra card and re-pointing it from a file would silently move it.
  const matches = new Map<string, ExistingCard>();
  for (const link of links) {
    const existing = context.existingCards.get(cardKey(link.marketplace, link.contentId));
    if (!existing) continue;
    if (!existing.isPrimary) {
      errors.push({
        code: 'linkIsSecondaryCard',
        column: link.marketplace === 'trendyol' ? 'trendyolLink' : 'hepsiburadaLink',
        otherProductName: existing.brandProductName,
      });
      continue;
    }
    matches.set(existing.brandProductId, existing);
  }
  if (matches.size > 1) {
    errors.push({
      code: 'conflictingProducts',
      otherProductName: [...matches.values()][1]?.brandProductName,
    });
  }

  const referencePrice = row.referencePrice.kind === 'amount' ? row.referencePrice.value : null;
  const minPrice = row.minPrice.kind === 'amount' ? row.minPrice.value : null;
  const maxPrice = row.maxPrice.kind === 'amount' ? row.maxPrice.value : null;

  const warnings: ImportWarningCode[] = [];
  if (referencePrice !== null) {
    const check = checkBrandProductPrices({ referencePrice, minPrice, maxPrice });
    if (check.errors.includes('nonPositive')) errors.push({ code: 'nonPositiveAmount' });
    if (check.errors.includes('minAboveUpper')) errors.push({ code: 'minAboveUpper', column: 'minPrice' });
    warnings.push(...check.warnings);
  }

  // `8.69E+12` is a barcode Excel already rounded to three digits: nothing downstream can
  // recover it, and storing it would promise a match that can never happen. A non-GTIN is only
  // a warning — a brand may well number its own products — but it will never match a card.
  const barcode = row.barcode.trim();
  if (barcode !== '') {
    const kind = classifyBarcode(barcode);
    if (kind === 'scientific') errors.push({ code: 'barcodeScientific', column: 'barcode' });
    else if (kind === 'other') warnings.push('barcodeNotGtin');
  }

  const folded = foldName(name);
  const duplicateInFile = (nameCounts.get(folded) ?? 0) > 1;
  if (folded !== '' && (duplicateInFile || context.existingNames?.has(folded))) {
    warnings.push('duplicateName');
  }

  if (errors.length > 0 || referencePrice === null) {
    return { kind: 'error', line: row.line, errors };
  }

  const fields: PlannedFields = {
    name,
    referencePrice,
    minPrice,
    maxPrice,
    barcode: row.barcode.trim() || null,
  };

  const matched = [...matches.values()][0];
  if (!matched) return { kind: 'new', line: row.line, fields, links, warnings };

  // An update attaches only what is not already this product's primary there: a re-import of an
  // unchanged file must not churn the links it matched on.
  const newLinks = links.filter((link) => {
    const existing = context.existingCards.get(cardKey(link.marketplace, link.contentId));
    return !(existing && existing.brandProductId === matched.brandProductId && existing.isPrimary);
  });
  return {
    kind: 'update',
    line: row.line,
    brandProductId: matched.brandProductId,
    fields,
    links: newLinks,
    warnings,
  };
}
