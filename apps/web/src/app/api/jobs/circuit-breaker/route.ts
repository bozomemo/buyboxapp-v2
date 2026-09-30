/** Circuit-breaker reset (doc 07 §3, doc 12 6.9 DoD: "circuit-breaker reset work"). */
import { NextResponse } from 'next/server';
import { circuitBreakerRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';

async function postHandler(request: Request) {
  const body = await readJsonBody<{ marketplaceCode: string }>(request);
  if (body === null) return invalidBody();
  if (!body.marketplaceCode) {
    return NextResponse.json({ error: 'marketplaceCode gerekli.' }, { status: 400 });
  }
  const appDb = getAppDb();
  await circuitBreakerRepo.resetCircuitBreaker(appDb, body.marketplaceCode, Date.now());
  return NextResponse.json({ ok: true });
}

export const POST = withPermission('jobs.operate', postHandler);
