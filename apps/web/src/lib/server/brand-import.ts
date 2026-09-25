/**
 * The brand product import, between the file and the database (doc 17 §3).
 *
 * Preview and confirm run the **same** function: the file is parsed, the catalogue is read, and
 * `planBrandProductImport` decides. Confirm then turns that plan into writes and applies them in
 * one transaction. Running one code path twice is what makes the preview's counts a promise
 * rather than an estimate — the second run re-reads the catalogue, so a product somebody created
 * in between is seen, and the operator is told if the numbers moved.
 */
import {
  cardKey,
  foldName,
  planBrandProductImport,
  type ImportPlan,
  type ImportRowInput,
  type LinkCell,
  type PlannedLink,
} from '@buybox/core';
import { brandProductsRepo, configRepo, newId, trackedProductsRepo, type AppDatabase } from '@buybox/db';
import { parseBrandImportFile, type BrandImportFile } from '../brand-product-import';

export interface PlannedImport {
  readonly plan: ImportPlan;
  readonly rows: readonly ImportRowInput[];
  /** Cards the import will have to create, because this install does not track them yet. */
  readonly cardsToCreate: number;
}

export type BrandImportOutcome =
  { readonly ok: true; readonly planned: PlannedImport } | { readonly ok: false; readonly error: string };

/** Parses and plans, without writing anything. */
export async function planImport(appDb: AppDatabase, file: BrandImportFile): Promise<BrandImportOutcome> {
  const read = await parseBrandImportFile(file);
  if (!read.ok) return { ok: false, error: read.error };
  const parsed = { ...read, rows: await resolveParentLinks(appDb, read.rows) };

  const refs = parsed.rows.flatMap((row) => [
    ...(row.trendyolLink.kind === 'ref'
      ? [{ marketplace: 'trendyol', contentId: row.trendyolLink.contentId }]
      : []),
    ...(row.hepsiburadaLink.kind === 'ref'
      ? [{ marketplace: 'hepsiburada', contentId: row.hepsiburadaLink.contentId }]
      : []),
  ]);

  const [existingCards, names, tracked, marketplaces] = await Promise.all([
    brandProductsRepo.existingCardsForRefs(appDb, refs),
    brandProductsRepo.listBrandProductNames(appDb),
    brandProductsRepo.trackedProductIdsForRefs(appDb, refs),
    configRepo.listMarketplaces(appDb),
  ]);

  const plan = planBrandProductImport(parsed.rows, {
    existingCards,
    existingNames: new Set(names.map(foldName)),
    configuredMarketplaces: new Set(marketplaces.map((marketplace) => marketplace.code.toLowerCase())),
  });

  const willAttach = plan.rows.flatMap((row) => (row.kind === 'error' ? [] : row.links));
  const cardsToCreate = new Set(
    willAttach
      .filter((link) => !tracked.has(cardKey(link.marketplace, link.contentId)))
      .map((link) => cardKey(link.marketplace, link.contentId)),
  ).size;

  return { ok: true, planned: { plan, rows: parsed.rows, cardsToCreate } };
}

/**
 * A Hepsiburada `-pm-` cell names a product family, not the variant sold. When exactly one tracked
 * variant belongs to that family it is the one the operator meant — the catalogue sweep stores
 * the `-pm-` form for every Hepsiburada row, so it is what they copied from our own screen — and
 * the cell becomes that variant. With none or several the cell stays `parentProduct` and the row
 * is refused as before (2026-09-25).
 */
async function resolveParentLinks(
  appDb: AppDatabase,
  rows: readonly ImportRowInput[],
): Promise<ImportRowInput[]> {
  const cache = new Map<string, LinkCell>();
  const resolve = async (cell: LinkCell): Promise<LinkCell> => {
    if (cell.kind !== 'parentProduct' || cell.parentRef === undefined) return cell;
    const cached = cache.get(cell.parentRef);
    if (cached) return cached;
    const variants = await trackedProductsRepo.findHepsiburadaVariantsByParent(appDb, cell.parentRef);
    const resolved: LinkCell =
      variants.length === 1
        ? { kind: 'ref', contentId: variants[0]!.productRef, url: variants[0]!.productUrl }
        : cell;
    cache.set(cell.parentRef, resolved);
    return resolved;
  };
  const out: ImportRowInput[] = [];
  for (const row of rows) {
    out.push({ ...row, hepsiburadaLink: await resolve(row.hepsiburadaLink) });
  }
  return out;
}

export interface AppliedImport {
  readonly newProducts: number;
  readonly updatedProducts: number;
  readonly linkedCards: number;
  readonly createdCards: number;
  readonly skippedRows: number;
}

/**
 * Applies a plan. Every valid row is written in one transaction and the invalid ones are written
 * nowhere — "all or nothing on parsing, partial by nature on matching" (doc 17 §3.5).
 *
 * Marketplaces are checked first: `tracked_products.marketplace_code` is a foreign key, so a file
 * naming a marketplace this install has never enabled would fail the whole transaction on the
 * first row. Refusing it up front, by name, is the difference between "Hepsiburada bu kurulumda
 * tanımlı değil" and a constraint error with nothing to act on.
 */
export async function applyImport(
  appDb: AppDatabase,
  planned: PlannedImport,
  nowMs: number,
): Promise<{ ok: true; applied: AppliedImport } | { ok: false; error: string }> {
  const validRows = planned.plan.rows.filter((row) => row.kind !== 'error');
  const links = validRows.flatMap((row) => row.links);

  const configured = new Set(
    (await configRepo.listMarketplaces(appDb)).map((marketplace) => marketplace.code.toLowerCase()),
  );
  // Belt and braces: the plan already refused these rows one by one (`marketplaceNotConfigured`),
  // so this fires only if a marketplace disappeared between the preview and the press.
  const missing = [...new Set(links.map((link) => link.marketplace))].filter(
    (marketplace) => !configured.has(marketplace),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `${missing.join(', ')} bu kurulumda tanımlı değil. Ayarlar > Pazaryerleri ekranından ekleyin.`,
    };
  }

  const [tracked, primaries] = await Promise.all([
    brandProductsRepo.trackedProductIdsForRefs(appDb, links),
    brandProductsRepo.primaryCardsOfProducts(
      appDb,
      validRows.flatMap((row) => (row.kind === 'update' ? [row.brandProductId] : [])),
    ),
  ]);

  const writes: brandProductsRepo.ImportWrite[] = [];
  const trackedIds = new Map(tracked);
  // The primary a row is about to replace — tracked as we go, so two rows of one file touching the
  // same product's marketplace demote the right card rather than both demoting the original.
  const currentPrimaries = new Map(primaries);
  let createdCards = 0;
  let linkedCards = 0;

  function trackedIdFor(link: PlannedLink): string {
    const key = cardKey(link.marketplace, link.contentId);
    const existing = trackedIds.get(key);
    if (existing) return existing;
    const id = newId();
    trackedIds.set(key, id);
    createdCards += 1;
    writes.push({
      op: 'insertTracked',
      row: {
        id,
        marketplaceCode: link.marketplace,
        productRef: link.contentId,
        productUrl: link.url,
        // The marketplace's own id until a sweep reads the page and names it: an import states a
        // *product*, and the card's title is the marketplace's to state (doc 17 §3.6).
        label: link.contentId,
        isActive: true,
        addedAt: nowMs,
      },
    });
    return id;
  }

  for (const row of validRows) {
    const brandProductId = row.kind === 'update' ? row.brandProductId : newId();
    if (row.kind === 'new') {
      writes.push({
        op: 'insertProduct',
        row: {
          id: brandProductId,
          ...row.fields,
          source: 'excel',
          referencePriceSource: null,
          createdAt: nowMs,
          updatedAt: nowMs,
        },
      });
    } else {
      writes.push({
        op: 'updateProduct',
        id: brandProductId,
        fields: { ...row.fields, referencePriceSource: null },
        updatedAt: nowMs,
      });
    }

    for (const link of row.links) {
      const trackedProductId = trackedIdFor(link);
      const primaryKey = `${brandProductId}::${link.marketplace}`;
      const previous = currentPrimaries.get(primaryKey);
      if (previous) writes.push({ op: 'demoteCard', cardId: previous });
      const cardId = newId();
      currentPrimaries.set(primaryKey, cardId);
      linkedCards += 1;
      writes.push({
        op: 'insertCard',
        row: {
          id: cardId,
          brandProductId,
          trackedProductId,
          marketplaceCode: link.marketplace,
          // ×1 on creation, editable afterwards (doc 17 §2.1): the file states a product and a
          // card, never a pack size, and assuming one would be the guess the multiplier exists to
          // avoid. The detail screen asks.
          unitMultiplier: 1,
          isPrimary: true,
          linkSource: 'excel',
          linkedAt: nowMs,
        },
      });
    }
  }

  await brandProductsRepo.applyBrandProductImport(appDb, writes);

  return {
    ok: true,
    applied: {
      newProducts: planned.plan.newProducts,
      updatedProducts: planned.plan.updatedProducts,
      linkedCards,
      createdCards,
      skippedRows: planned.plan.errorRows,
    },
  };
}
