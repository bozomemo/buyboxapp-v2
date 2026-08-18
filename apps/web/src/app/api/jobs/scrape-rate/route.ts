/**
 * Operator-configurable scrape pacing (doc 07 §7, doc 08 §12) — GET returns each marketplace's
 * effective rate limit (a stored override if present, else the source's compiled default, so
 * the UI always shows a real number); POST stores an override, audited like every other setting.
 * Takes effect on the worker's next restart (`buildCompetitorSources`, apps/worker) — the same
 * "startup-time read" the marketplace credentials already are.
 */
import { NextResponse } from 'next/server';
import { newId } from '@buybox/db';
import { getScrapeRateLimit, setScrapeRateLimit } from '@buybox/jobs';
import { HEPSIBURADA_SCRAPE_DEFAULTS, TRENDYOL_SCRAPE_DEFAULTS } from '@buybox/adapters';
import { getAppDb } from '@/lib/server/db';

const DEFAULTS = {
  trendyol: TRENDYOL_SCRAPE_DEFAULTS,
  hepsiburada: HEPSIBURADA_SCRAPE_DEFAULTS,
} as const;

const MARKETPLACE_CODES = ['trendyol', 'hepsiburada'] as const;

export async function GET() {
  const appDb = getAppDb();
  const rates = await Promise.all(
    MARKETPLACE_CODES.map(async (code) => {
      const stored = await getScrapeRateLimit(appDb, code);
      return {
        marketplaceCode: code,
        requestsPerMinute: stored?.requestsPerMinute ?? DEFAULTS[code].requestsPerMinute,
        burst: stored?.burst ?? DEFAULTS[code].burst,
        isOverride: stored !== undefined,
        default: { requestsPerMinute: DEFAULTS[code].requestsPerMinute, burst: DEFAULTS[code].burst },
      };
    }),
  );
  return NextResponse.json({ rates });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    marketplaceCode: string;
    requestsPerMinute: number;
    burst: number;
  };
  if (!MARKETPLACE_CODES.includes(body.marketplaceCode as (typeof MARKETPLACE_CODES)[number])) {
    return NextResponse.json({ error: `Bilinmeyen pazaryeri: ${body.marketplaceCode}` }, { status: 400 });
  }
  if (
    !Number.isFinite(body.requestsPerMinute) ||
    body.requestsPerMinute <= 0 ||
    !Number.isFinite(body.burst) ||
    body.burst <= 0
  ) {
    return NextResponse.json({ error: 'İstek/dakika ve patlama pozitif olmalı' }, { status: 400 });
  }
  const appDb = getAppDb();
  const marketplaceCode = body.marketplaceCode as (typeof MARKETPLACE_CODES)[number];
  await setScrapeRateLimit(
    appDb,
    marketplaceCode,
    { requestsPerMinute: body.requestsPerMinute, burst: body.burst },
    'operator',
    Date.now(),
    newId(),
  );
  return NextResponse.json({ ok: true });
}
