/**
 * Manual trigger (doc 06 §7, doc 12 6.9 DoD: "Manual trigger ... work") — enqueues a job the
 * same way `Scheduler.enqueueNow` does (packages/jobs), just from this process instead of the
 * worker's: a row in `job_queue` is picked up by whichever process's `Scheduler.tick()` next
 * polls, regardless of which process inserted it.
 */
import { NextResponse } from 'next/server';
import { DEFAULT_MAX_ATTEMPTS, JOB_CATALOG } from '@buybox/jobs';
import { jobsRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { jobName: string; marketplaceCode?: string; payload?: unknown };
  const entry = JOB_CATALOG.find((j) => j.jobName === body.jobName);
  if (!entry) {
    return NextResponse.json({ error: `Bilinmeyen iş: ${body.jobName}` }, { status: 400 });
  }
  if (entry.perMarketplace && !body.marketplaceCode) {
    return NextResponse.json({ error: 'Bu iş bir pazaryeri gerektirir.' }, { status: 400 });
  }

  const appDb = getAppDb();
  const nowMs = Date.now();
  const payload = {
    ...entry.defaultPayload,
    ...(body.marketplaceCode ? { marketplaceCode: body.marketplaceCode } : {}),
    ...(typeof body.payload === 'object' && body.payload !== null ? body.payload : {}),
  };
  const id = newId();
  await jobsRepo.enqueueJob(appDb, {
    id,
    jobName: entry.jobName,
    payload: JSON.stringify(payload),
    priority: 0,
    state: 'ready',
    runAfter: nowMs,
    lockedBy: null,
    lockedUntil: null,
    attempts: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    lastError: null,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return NextResponse.json({ ok: true, id });
}
