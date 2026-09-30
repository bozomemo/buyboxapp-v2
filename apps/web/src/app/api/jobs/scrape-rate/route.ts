/**
 * Operator-configurable scrape pacing (doc 07 §7, doc 08 §12) — GET returns each marketplace's
 * effective rate limit and request timeout (a stored override if present, else the source's
 * compiled default, so the UI always shows a real number); POST stores an override, audited like
 * every other setting.
 * Takes effect on the worker's next restart (`buildCompetitorSources`, apps/worker) — the same
 * "startup-time read" the marketplace credentials already are.
 */
import { NextResponse } from 'next/server';
import { newId } from '@buybox/db';
import {
  getScrapeRateLimit,
  setScrapeRateLimit,
  SCRAPE_BURST_MAX,
  SCRAPE_RATE_MAX_PER_MINUTE,
  SCRAPE_TIMEOUT_MAX_MS,
  SCRAPE_TIMEOUT_MIN_MS,
} from '@buybox/jobs';
import { HEPSIBURADA_SCRAPE_DEFAULTS, TRENDYOL_SCRAPE_DEFAULTS } from '@buybox/adapters';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';

const DEFAULTS = {
  trendyol: TRENDYOL_SCRAPE_DEFAULTS,
  hepsiburada: HEPSIBURADA_SCRAPE_DEFAULTS,
} as const;

const MARKETPLACE_CODES = ['trendyol', 'hepsiburada'] as const;

async function getHandler(request: Request, _context: unknown, auth: AuthContext) {
  const appDb = getAppDb();
  const rates = await Promise.all(
    MARKETPLACE_CODES.map(async (code) => {
      const stored = await getScrapeRateLimit(appDb, code);
      return {
        marketplaceCode: code,
        requestsPerMinute: stored?.requestsPerMinute ?? DEFAULTS[code].requestsPerMinute,
        burst: stored?.burst ?? DEFAULTS[code].burst,
        requestTimeoutMs: stored?.requestTimeoutMs ?? DEFAULTS[code].requestTimeoutMs,
        isOverride: stored !== undefined,
        default: {
          requestsPerMinute: DEFAULTS[code].requestsPerMinute,
          burst: DEFAULTS[code].burst,
          requestTimeoutMs: DEFAULTS[code].requestTimeoutMs,
        },
      };
    }),
  );
  return NextResponse.json({ rates });
}

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const body = await readJsonBody<{
    marketplaceCode: string;
    requestsPerMinute: number;
    burst: number;
    requestTimeoutMs?: number;
  }>(request);
  if (body === null) return invalidBody();
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
  if (body.requestsPerMinute > SCRAPE_RATE_MAX_PER_MINUTE || body.burst > SCRAPE_BURST_MAX) {
    return NextResponse.json(
      {
        error: `İstek/dakika en fazla ${SCRAPE_RATE_MAX_PER_MINUTE}, patlama en fazla ${SCRAPE_BURST_MAX} olabilir — daha hızlısı engellenme riski taşır.`,
      },
      { status: 400 },
    );
  }
  // Absent is a legitimate answer — it means "leave each source on its own default" — so only a
  // value that was actually sent is range-checked.
  if (
    body.requestTimeoutMs !== undefined &&
    (!Number.isFinite(body.requestTimeoutMs) ||
      body.requestTimeoutMs < SCRAPE_TIMEOUT_MIN_MS ||
      body.requestTimeoutMs > SCRAPE_TIMEOUT_MAX_MS)
  ) {
    return NextResponse.json(
      {
        error: `Zaman aşımı ${SCRAPE_TIMEOUT_MIN_MS / 1000}–${SCRAPE_TIMEOUT_MAX_MS / 1000} saniye arasında olmalı`,
      },
      { status: 400 },
    );
  }
  const appDb = getAppDb();
  const marketplaceCode = body.marketplaceCode as (typeof MARKETPLACE_CODES)[number];
  await setScrapeRateLimit(
    appDb,
    marketplaceCode,
    {
      requestsPerMinute: body.requestsPerMinute,
      burst: body.burst,
      ...(body.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: body.requestTimeoutMs }),
    },
    auth.actor,
    Date.now(),
    newId(),
  );
  return NextResponse.json({ ok: true });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('settings.manage', postHandler);
