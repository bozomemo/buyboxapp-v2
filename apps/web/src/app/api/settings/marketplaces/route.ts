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
    credentials?: Record<string, string>;
  };
  const appDb = getAppDb();
  const nowMs = Date.now();
  const previous = await configRepo.getMarketplace(appDb, body.code);

  await configRepo.upsertMarketplace(appDb, {
    code: body.code,
    displayName: TITLES[body.code] ?? body.code,
    enabled: body.enabled,
    // Never taken from the request. Our own seller id is derived from the credentials the
    // adapter authenticates with and refreshed by `ImportListings` (doc 05 §3): accepting it
    // here would reopen the drift this screen used to cause, where a hand-typed value silently
    // disabled every own-offer filter downstream.
    merchantRef: previous?.merchantRef ?? null,
    createdAt: previous?.createdAt ?? nowMs,
    updatedAt: nowMs,
  });

  await configRepo.recordSettingsAudit(appDb, {
    id: newId(),
    entity: 'marketplaces',
    entityId: body.code,
    field: 'enabled',
    oldValue: previous ? JSON.stringify({ enabled: previous.enabled }) : null,
    newValue: JSON.stringify({ enabled: body.enabled }),
    changedBy: 'operator',
    changedAt: nowMs,
  });

  // Credentials never touch the app database (CLAUDE.md hard rule) — secret store only, and
  // only rewritten when the operator actually entered something. Merged field-by-field with
  // whatever is already stored: an empty field (e.g. leaving password blank while only
  // switching environment) must keep its existing value, not blank it — a blind overwrite of
  // the whole blob would silently destroy credentials nobody meant to touch.
  const changedEntries = Object.entries(body.credentials ?? {}).filter(([, v]) => v);
  if (changedEntries.length > 0) {
    const secretStore = getSecretStore();
    const existingRaw = await secretStore.get(marketplaceCredentialsKey(body.code));
    const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, string>) : {};
    const merged = { ...existing, ...Object.fromEntries(changedEntries) };
    await secretStore.set(marketplaceCredentialsKey(body.code), JSON.stringify(merged));
  }

  return NextResponse.json({ ok: true });
}
