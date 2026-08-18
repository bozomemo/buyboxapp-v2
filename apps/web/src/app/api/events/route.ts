/** Events screen (doc 06 §8): "persisted, filterable replacement for the legacy transient text box." */
import { NextResponse } from 'next/server';
import { eventsRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

/**
 * How many of the newest matching events one response carries. Returned to the browser with the
 * rows: the screen pages what it is given, and a page count built from a silently truncated
 * result would read as "these are all of them" when it is "these are the newest 500 of them".
 */
const EVENT_LIMIT = 500;

export async function GET(request: Request) {
  const appDb = getAppDb();
  const url = new URL(request.url);
  const minLevel = url.searchParams.get('minLevel') as 'debug' | 'info' | 'warn' | 'error' | null;
  const marketplaceCode = url.searchParams.get('marketplaceCode');
  const listingId = url.searchParams.get('listingId');
  const jobRunId = url.searchParams.get('jobRunId');
  const code = url.searchParams.get('code');
  const sinceMs = url.searchParams.get('sinceMs');
  const untilMs = url.searchParams.get('untilMs');

  const events = await eventsRepo.listEventsFiltered(
    appDb,
    {
      minLevel: minLevel ?? undefined,
      marketplaceCode: marketplaceCode ?? undefined,
      listingId: listingId ?? undefined,
      jobRunId: jobRunId ?? undefined,
      code: code ?? undefined,
      sinceMs: sinceMs ? Number(sinceMs) : undefined,
      untilMs: untilMs ? Number(untilMs) : undefined,
    },
    EVENT_LIMIT,
  );
  return NextResponse.json({ events, limit: EVENT_LIMIT });
}
