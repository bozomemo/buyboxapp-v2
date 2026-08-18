/**
 * Keeping `marketplaces.merchant_ref` equal to the seller id the adapter authenticates as
 * (doc 05 §3, doc 07 §2).
 *
 * That column is the only thing separating our own offer from a competitor's — the repricer's
 * own-offer filter (doc 03 §6.5), our exclusion from competitor reports (doc 06 §6.1) and the
 * alert engine's refusal to fire on us (doc 06 §6.2) all key on it. Every one of them fails
 * **silently** when it is wrong: nothing errors, the filters simply match nothing, and we are
 * reported as our own biggest competitor.
 *
 * So it is derived rather than entered, and derived in two places on purpose:
 *
 * - **Worker startup**, for every adapter that gets registered. This is the guarantee. It runs
 *   whatever the operator has enabled, which matters because the job below can be switched off
 *   while `ScrapeCompetitors` — the job that actually needs the value — keeps running.
 * - **`ImportListings`**, so a credential change is picked up without waiting for a restart.
 *
 * One implementation, two triggers. Writing only on a real difference keeps the ordinary path
 * silent; a change is audited because this is still an operator-visible setting.
 */
import { configRepo, eventsRepo, newId, type AppDatabase } from '@buybox/db';

export interface MerchantRefSyncResult {
  readonly changed: boolean;
  readonly previous: string | null;
  readonly current: string | null;
}

export async function syncMerchantRef(
  appDb: AppDatabase,
  marketplaceCode: string,
  merchantRef: string,
  nowMs: number,
  jobRunId: string | null = null,
): Promise<MerchantRefSyncResult> {
  const trimmed = merchantRef.trim();
  const marketplace = await configRepo.getMarketplace(appDb, marketplaceCode);
  // An adapter with no merchant id cannot improve on what is stored. Blanking the column would
  // turn a possibly-correct value into a definitely-absent one.
  if (trimmed === '' || !marketplace || marketplace.merchantRef === trimmed) {
    return {
      changed: false,
      previous: marketplace?.merchantRef ?? null,
      current: marketplace?.merchantRef ?? null,
    };
  }

  const previous = marketplace.merchantRef;
  await configRepo.upsertMarketplace(appDb, {
    ...marketplace,
    merchantRef: trimmed,
    updatedAt: nowMs,
  });
  await configRepo.recordSettingsAudit(appDb, {
    id: newId(),
    entity: 'marketplaces',
    entityId: marketplaceCode,
    field: 'merchantRef',
    oldValue: previous,
    newValue: trimmed,
    changedBy: 'system',
    changedAt: nowMs,
  });
  await eventsRepo.logEvent(appDb, {
    id: newId(),
    at: nowMs,
    level: 'info',
    marketplaceCode,
    listingId: null,
    jobRunId,
    code: 'MerchantRefSynced',
    message:
      previous === null
        ? `Own seller id detected from credentials: ${trimmed}`
        : `Own seller id corrected from ${previous} to ${trimmed} — competitor reports and alerts were counting our own store until now`,
    context: null,
  });

  return { changed: true, previous, current: trimmed };
}
