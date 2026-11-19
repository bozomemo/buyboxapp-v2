import { NextResponse } from 'next/server';
import { configRepo } from '@buybox/db';
import { marketplaceCredentialsKey } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { getSecretStore } from '@/lib/server/secrets';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';
import { mergeCredentials } from '@/lib/credential-merge';
import { credentialsChanged, storedCredentials, testMarketplaceConnection } from '@/lib/server/marketplace-connection';

const TITLES: Record<string, string> = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada' };

/**
 * Our own seller id at the marketplace, read from the credentials the operator just entered
 * rather than asked for a second time.
 *
 * Trendyol names it `sellerId` in the integration API and `merchantId` on the storefront; they
 * are the same value. Hepsiburada names it `merchantId` in both places. This is the only thing
 * that later distinguishes our offer from a competitor's, and asking for it twice is how the
 * two copies drift — silently, since nothing errors when it is wrong. `ImportListings`
 * re-derives it on every run, so a change of credentials corrects it without anyone noticing.
 */
function deriveMerchantRef(code: string, credentials: Record<string, string>): string | null {
  const value = code === 'trendyol' ? credentials.sellerId : credentials.merchantId;
  return value !== undefined && value.trim() !== '' ? value.trim() : null;
}

async function postHandler(request: Request) {
  const body = await readJsonBody<{
    code: 'trendyol' | 'hepsiburada';
    enabled: boolean;
    credentials: Record<string, string>;
  }>(request);
  if (body === null) return invalidBody();

  // Blank fields keep their stored value, as the test button and Ayarlar → Pazaryerleri do; this
  // route used to overwrite the whole record with whatever was posted, blanks included.
  const stored = await storedCredentials(body.code);
  const credentials = mergeCredentials(stored, body.credentials);

  // Credentials that fail their test are not saved (product owner, 2026-11-19).
  if (credentialsChanged(stored, credentials)) {
    const verdict = await testMarketplaceConnection(body.code, credentials);
    if (!verdict.ok) return NextResponse.json({ ok: false, error: verdict.message }, { status: 400 });
  }

  const appDb = getAppDb();
  await configRepo.upsertMarketplace(appDb, {
    code: body.code,
    displayName: TITLES[body.code] ?? body.code,
    enabled: body.enabled,
    merchantRef: deriveMerchantRef(body.code, credentials),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Credentials never touch the app database (CLAUDE.md hard rule) — the secret store only.
  await getSecretStore().set(marketplaceCredentialsKey(body.code), JSON.stringify(credentials));

  return NextResponse.json({ ok: true });
}

export const POST = withPermission('settings.manage', postHandler, { allowSetupAccess: true });
