/**
 * Eşleşmemiş Kartlar (`/brand/unmatched`, brand roadmap §6.9) — cards an own brand's catalogue
 * sweep found that no brand product claims.
 *
 * GET: the queue, most reviewed first, with a barcode suggestion beside a card whose barcode a
 * brand product carries. A suggestion only — linking is the product screen's existing action and
 * still asks for the multiplier; nothing here links by name (CLAUDE.md, doc 17 §2.4).
 *
 * POST `{ ids, dismissed }`: "bizim değil / önemsiz" takes cards out of the queue, `false` puts
 * them back. Reporting state only; no card, link or price changes.
 */
import { NextResponse } from 'next/server';
import { brandQueuesRepo } from '@buybox/db';
import { withPermission } from '@/lib/server/auth/guard';
import { getAppDb } from '@/lib/server/db';
import { pageLimit, pageOffset } from '@/lib/pagination';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
/** "Bu hafta yeni" — what the queue counts as freshly found. */
const NEW_WINDOW_MS = 7 * 86_400_000;

async function getHandler(request: Request) {
  const params = new URL(request.url).searchParams;
  const appDb = getAppDb();
  const limit = pageLimit(params.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = pageOffset(params.get('offset'));
  const marketplaceCode = params.get('marketplaceCode')?.trim() || undefined;

  const page = await brandQueuesRepo.queryUnmatchedCards(appDb, {
    limit,
    offset,
    newSinceMs: Date.now() - NEW_WINDOW_MS,
    marketplaceCode,
    dismissed: params.get('dismissed') === 'true',
  });
  const suggestions = await brandQueuesRepo.brandProductsByBarcodes(
    appDb,
    page.rows.flatMap((row) => (row.barcode === null ? [] : [row.barcode])),
  );

  return NextResponse.json({
    total: page.total,
    newCount: page.newCount,
    newWindowMs: NEW_WINDOW_MS,
    limit,
    offset,
    cards: page.rows.map((row) => ({
      ...row,
      suggestions: row.barcode === null ? [] : (suggestions.get(row.barcode) ?? []),
    })),
  });
}

interface DismissBody {
  readonly ids?: unknown;
  readonly dismissed?: unknown;
}

async function postHandler(request: Request) {
  const body = await readJsonBody<DismissBody>(request);
  if (body === null) return invalidBody();
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string' && id !== '') : [];
  if (ids.length === 0 || typeof body.dismissed !== 'boolean') {
    return NextResponse.json({ error: 'Kart seçin.' }, { status: 400 });
  }
  await brandQueuesRepo.setQueueDismissed(getAppDb(), ids, body.dismissed ? Date.now() : null);
  return NextResponse.json({ ok: true, count: ids.length });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('catalogue.manage', postHandler);
