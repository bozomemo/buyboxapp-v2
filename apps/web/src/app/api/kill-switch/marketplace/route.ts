/**
 * Per-marketplace kill switch (doc 06 §2) — the marketplace-scoped sibling of the global one
 * in `/api/kill-switch`. Checked by `SubmitPriceChanges` before every drain for that
 * marketplace specifically (`marketplaceKillSwitchSetting`, packages/jobs).
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { marketplaceKillSwitchSetting } from '@buybox/jobs';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { marketplaceCode: string; engaged: boolean };
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
