/**
 * Cross-marketplace overlap (doc 12 Phase 10B): products of ours that sell on more than one
 * marketplace **with the same competitor on more than one of them**.
 *
 * Two identities have to line up for a row to exist, and only one of them is automatic:
 *
 * - the **product** across marketplaces is `listings.base_stock_code`, our own stock code;
 * - the **seller** across marketplaces is an operator-defined group, because marketplaces issue
 *   ids in unrelated namespaces (doc 05 §5).
 *
 * So an ungrouped seller can never produce a row here however many marketplaces it trades on —
 * we have no evidence the two ids are one company, and inventing that evidence from a matching
 * name is the mistake the grouping table exists to prevent. `ungroupedCandidates` reports the
 * sellers whose names coincide across marketplaces as *suggestions to review*, never as fact.
 *
 * Returns CSV when asked with `?format=csv`, JSON otherwise.
 */
import { NextResponse } from 'next/server';
import { competitorReportsRepo, competitorSellersRepo } from '@buybox/db';
import { withBrand } from '@/lib/product-name';
import { getAppDb } from '@/lib/server/db';
import { resolveOwnSellers } from '@/lib/server/own-sellers';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

interface OverlapRow {
  readonly baseStockCode: string;
  readonly productName: string;
  readonly marketplaces: string[];
  readonly groupId: string;
  readonly groupName: string;
  readonly sellerRefs: string[];
}

function toCsv(rows: OverlapRow[]): string {
  const headers = ['baseStockCode', 'productName', 'marketplaces', 'groupName', 'sellerRefs'];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        escape(r.baseStockCode),
        escape(r.productName),
        escape(r.marketplaces.join(' | ')),
        escape(r.groupName),
        escape(r.sellerRefs.join(' | ')),
      ].join(','),
    );
  }
  return lines.join('\n');
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const untilMs = params.get('untilMs') ? Number(params.get('untilMs')) : nowMs;
  const sinceMs = params.get('sinceMs') ? Number(params.get('sinceMs')) : untilMs - DEFAULT_WINDOW_MS;

  const own = await resolveOwnSellers(appDb, { sinceMs, untilMs });

  const [tuples, sellers] = await Promise.all([
    competitorReportsRepo.productSellerTuplesInRange(appDb, {
      sinceMs,
      untilMs,
      // Our own stores are on both marketplaces for every product we list on both, so left in
      // they would be the top "seller competing with us across marketplaces" every time.
      excludeSellers: own.keys,
    }),
    competitorSellersRepo.listCompetitorSellers(appDb),
  ]);
  const groups = await competitorSellersRepo.listSellerGroups(appDb);
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const groupOf = new Map(
    sellers
      .filter((s) => s.groupId !== null)
      .map((s) => [`${s.marketplaceCode}::${s.sellerRef}`, s.groupId as string]),
  );

  // Which products we ourselves list on more than one marketplace. Without this the rest is
  // meaningless: a seller on two marketplaces of two *different* products is not overlap.
  const productMarketplaces = new Map<string, Set<string>>();
  const productNames = new Map<string, string>();
  for (const t of tuples) {
    if (!productMarketplaces.has(t.baseStockCode)) productMarketplaces.set(t.baseStockCode, new Set());
    productMarketplaces.get(t.baseStockCode)!.add(t.marketplaceCode);
    // `Marka - Ürün Adı` (customer feedback 2026-08-25) — see `withBrand`.
    if (!productNames.has(t.baseStockCode)) {
      productNames.set(t.baseStockCode, withBrand(t.productName, t.brandName));
    }
  }

  const byProductGroup = new Map<
    string,
    { baseStockCode: string; groupId: string; marketplaces: Set<string>; sellerRefs: Set<string> }
  >();
  for (const t of tuples) {
    if ((productMarketplaces.get(t.baseStockCode)?.size ?? 0) < 2) continue;
    const groupId = groupOf.get(`${t.marketplaceCode}::${t.sellerRef}`);
    if (!groupId) continue;
    const key = `${t.baseStockCode}::${groupId}`;
    const entry = byProductGroup.get(key) ?? {
      baseStockCode: t.baseStockCode,
      groupId,
      marketplaces: new Set<string>(),
      sellerRefs: new Set<string>(),
    };
    entry.marketplaces.add(t.marketplaceCode);
    entry.sellerRefs.add(t.sellerRef);
    byProductGroup.set(key, entry);
  }

  const rows: OverlapRow[] = [...byProductGroup.values()]
    .filter((e) => e.marketplaces.size >= 2)
    .map((e) => ({
      baseStockCode: e.baseStockCode,
      productName: productNames.get(e.baseStockCode) ?? '',
      marketplaces: [...e.marketplaces].sort(),
      groupId: e.groupId,
      groupName: groupsById.get(e.groupId)?.displayName ?? e.groupId,
      sellerRefs: [...e.sellerRefs].sort(),
    }))
    .sort((a, b) => a.baseStockCode.localeCompare(b.baseStockCode));

  if (params.get('format') === 'csv') {
    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment; filename="pazaryeri-cakisma.csv"',
      },
    });
  }

  // Names that coincide across marketplaces on a shared product, where no group links them.
  // Offered so the operator has somewhere to start, and labelled as unverified — the report
  // above deliberately does not count them.
  const namesByMarketplace = new Map<string, Map<string, string>>();
  for (const t of tuples) {
    const key = t.observedName.trim().toLocaleLowerCase('tr');
    if (!key) continue;
    if (!namesByMarketplace.has(key)) namesByMarketplace.set(key, new Map());
    namesByMarketplace.get(key)!.set(t.marketplaceCode, t.sellerRef);
  }
  const ungroupedCandidates = [...namesByMarketplace.entries()]
    .filter(([, byMp]) => byMp.size >= 2)
    .filter(([, byMp]) => ![...byMp.entries()].some(([mp, ref]) => groupOf.has(`${mp}::${ref}`)))
    .map(([name, byMp]) => ({
      observedName: name,
      sightings: [...byMp.entries()].map(([marketplaceCode, sellerRef]) => ({
        marketplaceCode,
        sellerRef,
      })),
    }));

  return NextResponse.json({
    filters: { sinceMs, untilMs },
    rows,
    ungroupedCandidates,
    productsOnMultipleMarketplaces: [...productMarketplaces.values()].filter((s) => s.size >= 2).length,
  });
}
