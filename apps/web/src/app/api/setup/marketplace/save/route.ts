import { NextResponse } from 'next/server';
import { configRepo } from '@buybox/db';
import { marketplaceCredentialsKey } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { getSecretStore } from '@/lib/server/secrets';

const TITLES: Record<string, string> = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada' };

export async function POST(request: Request) {
  const body = (await request.json()) as {
    code: 'trendyol' | 'hepsiburada';
    enabled: boolean;
    merchantRef: string;
    credentials: Record<string, string>;
  };

  const appDb = getAppDb();
  await configRepo.upsertMarketplace(appDb, {
    code: body.code,
    displayName: TITLES[body.code] ?? body.code,
    enabled: body.enabled,
    merchantRef: body.merchantRef || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Credentials never touch the app database (CLAUDE.md hard rule) — the secret store only.
  await getSecretStore().set(marketplaceCredentialsKey(body.code), JSON.stringify(body.credentials));

  return NextResponse.json({ ok: true });
}
