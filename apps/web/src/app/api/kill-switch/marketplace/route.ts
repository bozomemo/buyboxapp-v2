/**
 * Per-marketplace kill switch (doc 06 §2) — the marketplace-scoped sibling of the global one
 * in `/api/kill-switch`. Checked by `SubmitPriceChanges` before every drain for that
 * marketplace specifically (`marketplaceKillSwitchSetting`, packages/jobs).
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { marketplaceKillSwitchSetting } from '@buybox/jobs';
import { getAppDb } from '@/lib/server/db';
import { readJsonObject } from '@/lib/server/request-body';

export async function POST(request: Request) {
  const raw = await readJsonObject(request);
  if (
    raw === null ||
    (raw.marketplaceCode !== 'trendyol' && raw.marketplaceCode !== 'hepsiburada') ||
    typeof raw.engaged !== 'boolean'
  ) {
    return NextResponse.json(
      { error: '`marketplaceCode` trendyol/hepsiburada, `engaged` true/false olmalı.' },
      { status: 400 },
    );
  }
  const body = { marketplaceCode: raw.marketplaceCode, engaged: raw.engaged };
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    {
      key: marketplaceKillSwitchSetting(body.marketplaceCode),
      value: String(body.engaged),
      updatedBy: 'operator',
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ engaged: body.engaged });
}
