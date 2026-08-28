/**
 * The raw observations behind one finding (doc 06 §12.4, Faz 6).
 *
 * Faz 6's definition of done is that every finding opens to the thing it came out of, and this
 * is that door. What comes back is not a summary of the evidence — it is the observation rows
 * themselves, every offer that was on the page at that moment, in the order the page ranked
 * them, exactly as the scrape recorded them.
 *
 * The whole **look** rather than the subject's own row, because "22% below the market" is a
 * statement about the other rows: a lone price with nothing beside it neither confirms the
 * finding nor refutes it. `evidenceLooks` explains the two-query shape.
 *
 * Money is serialised as a **decimal string of kuruş** and formatted at the display boundary, as
 * everywhere else on the wire (CLAUDE.md). `JSON.stringify` cannot represent a `bigint` at all,
 * and a `Number` would be a silent precision loss on the one value that must not have one.
 */
import { NextResponse } from 'next/server';
import { brandReportsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** A handful of looks is evidence; a hundred is another report. */
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const nowMs = Date.now();

  const untilMs = params.get('untilMs') ? Number(params.get('untilMs')) : nowMs;
  const sinceMs = params.get('sinceMs') ? Number(params.get('sinceMs')) : untilMs - DEFAULT_WINDOW_MS;

  const marketplaceCode = params.get('marketplaceCode');
  const sellerRef = params.get('sellerRef');
  const trackedProductId = params.get('trackedProductId') ?? undefined;
  const limit = Math.min(Number(params.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT);

  // A seller is a marketplace *and* a ref; half of one is not an identity, and querying on the
  // ref alone would hand back another marketplace's company under this one's name.
  const seller =
    marketplaceCode !== null && sellerRef !== null ? { marketplaceCode, sellerRef } : undefined;

  if (seller === undefined && trackedProductId === undefined) {
    return NextResponse.json(
      { error: 'Kanıt için bir satıcı (pazaryeri + satıcı kodu) veya bir ürün gerekir.' },
      { status: 400 },
    );
  }

  const looks = await brandReportsRepo.evidenceLooks(getAppDb(), {
    sinceMs,
    untilMs,
    seller,
    trackedProductId,
    limit,
  });

  return NextResponse.json({
    subject: { marketplaceCode, sellerRef, trackedProductId: trackedProductId ?? null },
    window: { sinceMs, untilMs },
    looks: looks.map((look) => ({
      trackedProductId: look.trackedProductId,
      productLabel: look.productLabel,
      productUrl: look.productUrl,
      marketplaceCode: look.marketplaceCode,
      observedAt: look.observedAt,
      offers: look.offers.map((offer) => ({
        sellerRef: offer.sellerRef,
        sellerName: offer.sellerName,
        rank: offer.rank,
        price: offer.price?.toString() ?? null,
        finalPrice: offer.finalPrice?.toString() ?? null,
        offeredStock: offer.offeredStock,
      })),
    })),
  });
}
