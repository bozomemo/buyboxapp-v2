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
import { refuseRelease, withPermission, type AuthContext } from '@/lib/server/auth/guard';

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
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
  const refused = refuseRelease(auth, body.engaged);
  if (refused !== null) return refused;
  const appDb = getAppDb();
  await configRepo.setAppSetting(
    appDb,
    {
      key: marketplaceKillSwitchSetting(body.marketplaceCode),
      value: String(body.engaged),
      updatedBy: auth.actor,
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ engaged: body.engaged });
}

export const POST = withPermission('automation.stop', postHandler);
