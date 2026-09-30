/**
 * The sign-in log (doc 18 §9.2, doc 06 §10.4 _Giriş kayıtları_). `users.manage` only: it holds
 * addresses and user agents, which are personal data (doc 18 §10).
 */
import { NextResponse } from 'next/server';
import { authRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { resolveActorLabels } from '@/lib/server/auth/actors';
import { withPermission } from '@/lib/server/auth/guard';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

function optionalNumber(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function getHandler(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(0, Math.floor(optionalNumber(url.searchParams.get('page')) ?? 0));
  const userId = url.searchParams.get('userId') || undefined;
  const event = (url.searchParams.get('event') || undefined) as authRepo.AuthEventName | undefined;
  const fromMs = optionalNumber(url.searchParams.get('from'));
  const toMs = optionalNumber(url.searchParams.get('to'));

  const appDb = getAppDb();
  // One extra row says whether there is a next page, without a count over a year of rows.
  const rows = await authRepo.listAuthEvents(appDb, {
    ...(userId === undefined ? {} : { userId }),
    ...(event === undefined ? {} : { event }),
    ...(fromMs === undefined ? {} : { fromMs }),
    ...(toMs === undefined ? {} : { toMs }),
    limit: PAGE_SIZE + 1,
    offset: page * PAGE_SIZE,
  });
  const shown = rows.slice(0, PAGE_SIZE);
  const labels = await resolveActorLabels(appDb, [
    ...shown.map((r) => r.actor),
    ...shown.map((r) => (r.userId === null ? null : `user:${r.userId}`)),
  ]);
  return NextResponse.json({
    page,
    hasMore: rows.length > PAGE_SIZE,
    events: shown.map((r) => ({
      id: r.id,
      at: r.at,
      event: r.event,
      user: r.userId === null ? null : (labels.get(`user:${r.userId}`) ?? null),
      actor: r.actor === 'anonymous' ? 'Anonim' : (labels.get(r.actor) ?? r.actor),
      ip: r.ip,
      userAgent: r.userAgent,
      detail: r.detail === null ? null : (JSON.parse(r.detail) as Record<string, unknown>),
    })),
  });
}

export const GET = withPermission('users.manage', getHandler);
