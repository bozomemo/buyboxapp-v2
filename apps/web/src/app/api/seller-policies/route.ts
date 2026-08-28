/**
 * Seller policy: who may sell which brand (doc 06 §12.4, Faz 5).
 *
 * `GET` returns the rules **and their effect**: for every seller seen on the brand's products in
 * the window, the verdict `resolveSellerPolicy` gives. Those are two different things and the
 * screen needs both — a rule that names a tax number we have not yet linked to any storefront is
 * stored, valid, and currently affecting nobody, and an operator who cannot see that will
 * believe a firm is blocked when it is not.
 *
 * The resolution itself is pure and lives in `packages/core`, so it is table-tested without a
 * database. This route only assembles its inputs.
 *
 * ⚠️ Reporting only. Nothing here reaches a pricing decision — `Reprice` and `ObserveBuybox`
 * read `listings`, and a policy verdict is never an input to either.
 */
import { NextResponse } from 'next/server';
import { resolveSellerPolicy, type SellerPolicyRule } from '@buybox/core';
import {
  brandReportsRepo,
  competitorSellersRepo,
  newId,
  sellerPoliciesRepo,
  watchedBrandsRepo,
} from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** A stored row, shaped for the pure resolver. The identity is a union there and columns here. */
function toRule(row: sellerPoliciesRepo.SellerPolicyRow): SellerPolicyRule | null {
  const identity =
    row.sellerRef !== null && row.marketplaceCode !== null
      ? ({ kind: 'sellerRef', marketplaceCode: row.marketplaceCode, sellerRef: row.sellerRef } as const)
      : row.taxNumber !== null
        ? ({ kind: 'taxNumber', taxNumber: row.taxNumber } as const)
        : null;
  // A row with neither identity cannot be written through the repository. If one exists it was
  // hand-edited, and dropping it is safer than guessing which seller it was meant to name.
  if (identity === null) return null;
  return {
    id: row.id,
    watchedBrandGroupId: row.watchedBrandGroupId,
    watchedBrandId: row.watchedBrandId,
    identity,
    status: row.status,
    note: row.note,
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const untilMs = params.get('untilMs') ? Number(params.get('untilMs')) : nowMs;
  const sinceMs = params.get('sinceMs') ? Number(params.get('sinceMs')) : untilMs - DEFAULT_WINDOW_MS;
  const watchedBrandId = params.get('watchedBrandId') ?? undefined;

  const [groups, brands, knownSellers] = await Promise.all([
    watchedBrandsRepo.listWatchedBrandGroups(appDb),
    watchedBrandsRepo.listWatchedBrands(appDb),
    competitorSellersRepo.listCompetitorSellers(appDb, {}),
  ]);

  const brand = watchedBrandId ? brands.find((b) => b.id === watchedBrandId) : undefined;
  if (watchedBrandId && !brand) {
    return NextResponse.json({ error: 'İzlenen marka bulunamadı.' }, { status: 404 });
  }

  const policies = await sellerPoliciesRepo.listSellerPolicies(
    appDb,
    brand ? { watchedBrandGroupId: brand.groupId, watchedBrandIds: [brand.id] } : {},
  );

  // Sellers actually seen on this brand's products, so the screen ranks by who is there rather
  // than by who someone has already written a rule about.
  const aggregates = brand
    ? await brandReportsRepo.brandSellerAggregatesInRange(appDb, {
        sinceMs,
        untilMs,
        watchedBrandIds: [brand.id],
      })
    : [];

  const taxByRef = new Map(
    knownSellers.map((s) => [`${s.marketplaceCode}::${s.sellerRef}`, s.taxNumber ?? null]),
  );
  const nameByRef = new Map(
    knownSellers.map((s) => [`${s.marketplaceCode}::${s.sellerRef}`, s.sellerName]),
  );

  const rules = policies.map(toRule).filter((r): r is SellerPolicyRule => r !== null);

  const sellers = brand
    ? aggregates.map((a) => {
        const key = `${a.marketplaceCode}::${a.sellerRef}`;
        const taxNumber = taxByRef.get(key) ?? null;
        const resolution = resolveSellerPolicy(
          rules,
          { marketplaceCode: a.marketplaceCode, sellerRef: a.sellerRef, taxNumber },
          { watchedBrandId: brand.id, watchedBrandGroupId: brand.groupId },
        );
        return {
          marketplaceCode: a.marketplaceCode,
          sellerRef: a.sellerRef,
          sellerName: nameByRef.get(key) ?? a.observedName,
          taxNumber,
          productCount: a.productCount,
          avgDeviationPct: a.avgDeviationPct,
          lastSeenAt: a.lastSeenAt,
          verdict: resolution.verdict,
          ruleId: resolution.rule?.id ?? null,
          /** Whether the verdict comes from the group default rather than this brand's own rule. */
          fromGroupDefault: resolution.rule !== null && resolution.rule.watchedBrandId === null,
          note: resolution.rule?.note ?? null,
          overriddenRuleIds: resolution.overridden.map((r) => r.id),
        };
      })
    : [];

  /**
   * Rules currently affecting nobody. Two honest reasons, and the screen says which:
   * a tax number nobody has been linked to yet (dormant until an operator or Faz 7 links it),
   * and a seller that simply has not appeared on the brand's products in the window.
   */
  const seenRefs = new Set(aggregates.map((a) => `${a.marketplaceCode}::${a.sellerRef}`));
  const seenTaxNumbers = new Set(
    aggregates.map((a) => taxByRef.get(`${a.marketplaceCode}::${a.sellerRef}`)).filter(Boolean),
  );
  const dormant = policies.filter((row) =>
    row.sellerRef !== null
      ? !seenRefs.has(`${row.marketplaceCode}::${row.sellerRef}`)
      : row.taxNumber !== null && !seenTaxNumbers.has(row.taxNumber),
  );

  return NextResponse.json({
    filters: { sinceMs, untilMs, watchedBrandId: watchedBrandId ?? null },
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    brands: brands.map((b) => ({
      id: b.id,
      groupId: b.groupId,
      label: b.label,
      marketplaceCode: b.marketplaceCode,
    })),
    policies: policies.map((row) => ({ ...row, dormant: dormant.some((d) => d.id === row.id) })),
    sellers,
  });
}

interface UpsertBody {
  readonly watchedBrandId: string;
  /** `true` writes the rule as the group default instead of against this brand alone. */
  readonly applyToWholeGroup?: boolean;
  readonly marketplaceCode?: string | null;
  readonly sellerRef?: string | null;
  readonly taxNumber?: string | null;
  readonly status: string;
  readonly note?: string | null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as UpsertBody;
  const appDb = getAppDb();

  const brands = await watchedBrandsRepo.listWatchedBrands(appDb);
  const brand = brands.find((b) => b.id === body.watchedBrandId);
  if (!brand) {
    return NextResponse.json({ error: 'İzlenen marka bulunamadı.' }, { status: 404 });
  }

  try {
    const result = await sellerPoliciesRepo.upsertSellerPolicy(appDb, {
      id: newId(),
      watchedBrandGroupId: brand.groupId,
      // Null scopes the rule to the whole group — "Mars authorises this distributor for
      // everything" is one row, not one per brand.
      watchedBrandId: body.applyToWholeGroup ? null : brand.id,
      identity:
        body.sellerRef && body.marketplaceCode
          ? { marketplaceCode: body.marketplaceCode, sellerRef: body.sellerRef }
          : { taxNumber: body.taxNumber ?? '' },
      status: body.status as sellerPoliciesRepo.SellerPolicyStatus,
      note: body.note?.trim() || null,
      nowMs: Date.now(),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // A filled-in form being wrong, not the system being broken — the operator's own words back.
    if (
      error instanceof sellerPoliciesRepo.SellerPolicyIdentityError ||
      error instanceof sellerPoliciesRepo.SellerPolicyStatusError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Kural kimliği gerekli.' }, { status: 400 });
  // The only way back to the third state: `undefined` is the absence of a rule, so "I no longer
  // have a view on this seller" cannot be expressed as a status.
  await sellerPoliciesRepo.deleteSellerPolicy(getAppDb(), id);
  return NextResponse.json({ ok: true });
}
