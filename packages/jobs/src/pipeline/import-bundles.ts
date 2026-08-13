/**
 * `ImportBundles` (doc 07 §1) — rebuilds bundle definitions via `replaceBundle`'s
 * upsert-bundle + delete-old-members + insert-new-members transaction (doc 01 §6).
 *
 * Doc 10 §4 defines product *sources* for stock items (Manual/Excel/MarketplaceListing/ERP)
 * but no dedicated bundle source — bundle tables in every source the legacy app used (ERP
 * export, Excel) are just another sheet/query the same ingestion config already points at.
 * Rather than invent a second port doc 10 doesn't specify, this job takes the resolved bundle
 * list as its payload; whichever caller enqueues it (a future ERP/Excel bundle reader, or the
 * setup wizard's "coming soon" ERP path) is responsible for producing that list.
 */
import { eventsRepo, newId, stockRepo } from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';

export const IMPORT_BUNDLES_JOB = 'ImportBundles';

export const ImportBundlesPayloadSchema = z.object({
  bundles: z.array(
    z.object({
      bundleStockCode: z.string().min(1),
      name: z.string().min(1),
      members: z.array(z.object({ memberStockCode: z.string().min(1), quantity: z.number().int().min(1) })),
    }),
  ),
});

export type ImportBundlesPayload = z.infer<typeof ImportBundlesPayloadSchema>;

export async function importBundles(ctx: JobContext): Promise<JobResult> {
  const payload = ImportBundlesPayloadSchema.parse(JSON.parse(ctx.payload));
  const nowMs = ctx.clock.nowMs();

  let itemsOk = 0;
  let itemsFailed = 0;

  for (const bundle of payload.bundles) {
    try {
      await stockRepo.replaceBundle(ctx.appDb, bundle.bundleStockCode, bundle.name, bundle.members, nowMs);
      itemsOk += 1;
    } catch (error) {
      itemsFailed += 1;
      await eventsRepo.logEvent(ctx.appDb, {
        id: newId(),
        at: nowMs,
        level: 'warn',
        marketplaceCode: null,
        listingId: null,
        jobRunId: ctx.correlationId,
        code: 'BundleImportFailed',
        message: `Failed to rebuild bundle "${bundle.bundleStockCode}": ${error instanceof Error ? error.message : String(error)}`,
        context: JSON.stringify({ bundleStockCode: bundle.bundleStockCode }),
      });
    }
  }

  return { itemsTotal: payload.bundles.length, itemsOk, itemsFailed };
}
