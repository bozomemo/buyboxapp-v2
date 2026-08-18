/**
 * Bulk actions on the current filtered selection (doc 06 §4.6). The client is expected to
 * show a confirmation with the affected count before calling this — this route trusts the id
 * list it's given and applies it verbatim, all-or-nothing per statement (doc 12 6.6 DoD).
 */
import { NextResponse } from 'next/server';
import { listingsRepo, repricingRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { z } from 'zod';
import { getAppDb } from '@/lib/server/db';

const BulkActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('enableAutomation'), ids: z.array(z.string()) }),
  z.object({ action: z.literal('disableAutomation'), ids: z.array(z.string()) }), // also covers "exclude from automation"
  // Independent of automation (repriceEnabled): lets an operator watch buybox rank /
  // competitors on a listing without opting it into the pricing engine.
  z.object({ action: z.literal('enableObservation'), ids: z.array(z.string()) }),
  z.object({ action: z.literal('disableObservation'), ids: z.array(z.string()) }),
  z.object({
    action: z.literal('setMinMax'),
    ids: z.array(z.string()),
    minPrice: z.string().nullable(),
    maxPrice: z.string().nullable(),
  }),
  z.object({ action: z.literal('forceReoptimize'), ids: z.array(z.string()) }),
]);

export async function POST(request: Request) {
  const body = BulkActionSchema.parse(await request.json());
  const appDb = getAppDb();
  const nowMs = Date.now();

  if (body.action === 'enableAutomation') {
    await listingsRepo.bulkSetListingOverrides(appDb, body.ids, { repriceEnabled: true }, nowMs);
  } else if (body.action === 'disableAutomation') {
    await listingsRepo.bulkSetListingOverrides(appDb, body.ids, { repriceEnabled: false }, nowMs);
  } else if (body.action === 'enableObservation') {
    await listingsRepo.bulkSetListingOverrides(appDb, body.ids, { observationEnabled: true }, nowMs);
  } else if (body.action === 'disableObservation') {
    await listingsRepo.bulkSetListingOverrides(appDb, body.ids, { observationEnabled: false }, nowMs);
  } else if (body.action === 'setMinMax') {
    await listingsRepo.bulkSetListingOverrides(
      appDb,
      body.ids,
      {
        minPrice: body.minPrice ? Money.fromMajorUnitsString(body.minPrice).toKurus() : null,
        maxPrice: body.maxPrice ? Money.fromMajorUnitsString(body.maxPrice).toKurus() : null,
      },
      nowMs,
    );
  } else {
    await repricingRepo.resetPhaseToSeeking(appDb, body.ids, nowMs);
  }

  return NextResponse.json({ ok: true, affected: body.ids.length });
}
