import { NextResponse } from 'next/server';
import { configRepo } from '@buybox/db';
import { marketplaceCredentialsKey } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { getSecretStore } from '@/lib/server/secrets';

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

export async function POST(request: Request) {
  const body = (await request.json()) as {
    code: 'trendyol' | 'hepsiburada';
    enabled: boolean;
    credentials: Record<string, string>;
  };

  const appDb = getAppDb();
  await configRepo.upsertMarketplace(appDb, {
    code: body.code,
    displayName: TITLES[body.code] ?? body.code,
    enabled: body.enabled,
    merchantRef: deriveMerchantRef(body.code, body.credentials),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Credentials never touch the app database (CLAUDE.md hard rule) — the secret store only.
  await getSecretStore().set(marketplaceCredentialsKey(body.code), JSON.stringify(body.credentials));

  return NextResponse.json({ ok: true });
}
