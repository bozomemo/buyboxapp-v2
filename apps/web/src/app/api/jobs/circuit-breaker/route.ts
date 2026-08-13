/** Circuit-breaker reset (doc 07 §3, doc 12 6.9 DoD: "circuit-breaker reset work"). */
import { NextResponse } from 'next/server';
import { circuitBreakerRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { marketplaceCode: string };
  if (!body.marketplaceCode) {
    return NextResponse.json({ error: 'marketplaceCode gerekli.' }, { status: 400 });
  }
  const appDb = getAppDb();
  await circuitBreakerRepo.resetCircuitBreaker(appDb, body.marketplaceCode, Date.now());
  return NextResponse.json({ ok: true });
}
