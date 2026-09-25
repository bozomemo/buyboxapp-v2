/**
 * Switches a marketplace on or off **without touching its credentials** (doc 17 §1.4).
 *
 * The brand module watches a marketplace through its public pages and needs no seller
 * credentials, so a brand-only install enables marketplaces with this rather than with
 * `setup/marketplace/save` — which writes the credentials it is given to the secret store, and
 * given none would overwrite whatever an earlier seller setup had stored there with nothing.
 * The existing merchant ref is kept for the same reason.
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const TITLES: Record<string, string> = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada' };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => undefined)) as
    { code?: unknown; enabled?: unknown } | undefined;
  const code = body?.code;
  if ((code !== 'trendyol' && code !== 'hepsiburada') || typeof body?.enabled !== 'boolean') {
    return NextResponse.json(
      { error: '`code` trendyol/hepsiburada, `enabled` true/false olmalı.' },
      { status: 400 },
    );
  }

  const appDb = getAppDb();
  const nowMs = Date.now();
  const existing = await configRepo.getMarketplace(appDb, code);
  await configRepo.upsertMarketplace(appDb, {
    code,
    displayName: existing?.displayName ?? TITLES[code] ?? code,
    enabled: body.enabled,
    merchantRef: existing?.merchantRef ?? null,
    createdAt: existing?.createdAt ?? nowMs,
    // A fresh `updatedAt` is what the worker's `marketplaceConfigRevision` watches, so the
    // public-page sources for this marketplace are built without a restart.
    updatedAt: nowMs,
  });
  // Audited exactly as Settings > Pazaryerleri audits the same switch.
  await configRepo.recordSettingsAudit(appDb, {
    id: newId(),
    entity: 'marketplaces',
    entityId: code,
    field: 'enabled',
    oldValue: existing ? JSON.stringify({ enabled: existing.enabled }) : null,
    newValue: JSON.stringify({ enabled: body.enabled }),
    changedBy: 'setup-wizard',
    changedAt: nowMs,
  });
  return NextResponse.json({ ok: true });
}
