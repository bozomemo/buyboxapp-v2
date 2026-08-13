/** Settings > Marketplaces (doc 06 §9): list + save, with credentials write-only and every change audited. */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { marketplaceCredentialsKey } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { getSecretStore } from '@/lib/server/secrets';

const TITLES: Record<string, string> = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada' };

export async function GET() {
  const appDb = getAppDb();
  const marketplaces = await configRepo.listMarketplaces(appDb);
  return NextResponse.json({
    marketplaces: marketplaces.map((m) => ({
      code: m.code,
      displayName: m.displayName,
      enabled: m.enabled,
      merchantRef: m.merchantRef,
      updatedAt: m.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    code: 'trendyol' | 'hepsiburada';
    enabled: boolean;
    merchantRef: string;
    credentials?: Record<string, string>;
  };
  const appDb = getAppDb();
  const nowMs = Date.now();
  const previous = await configRepo.getMarketplace(appDb, body.code);

  await configRepo.upsertMarketplace(appDb, {
    code: body.code,
    displayName: TITLES[body.code] ?? body.code,
    enabled: body.enabled,
    merchantRef: body.merchantRef || null,
    createdAt: previous?.createdAt ?? nowMs,
    updatedAt: nowMs,
  });

  await configRepo.recordSettingsAudit(appDb, {
    id: newId(),
    entity: 'marketplaces',
    entityId: body.code,
    field: 'enabled,merchantRef',
    oldValue: previous
      ? JSON.stringify({ enabled: previous.enabled, merchantRef: previous.merchantRef })
      : null,
    newValue: JSON.stringify({ enabled: body.enabled, merchantRef: body.merchantRef || null }),
    changedBy: 'operator',
    changedAt: nowMs,
  });

  // Credentials never touch the app database (CLAUDE.md hard rule) — secret store only, and
  // only rewritten when the operator actually entered something (an empty submit keeps the
  // existing secret rather than blanking it).
  if (body.credentials && Object.values(body.credentials).some((v) => v)) {
    await getSecretStore().set(marketplaceCredentialsKey(body.code), JSON.stringify(body.credentials));
  }

  return NextResponse.json({ ok: true });
}
