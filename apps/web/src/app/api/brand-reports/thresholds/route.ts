/**
 * The audit thresholds (doc 06 §12.4, Faz 6) — operator-editable, audited on every change.
 *
 * `setAppSetting` writes the audit row in the same call, so a number that decides whether a
 * seller appears on an audit list cannot change without a record of who changed it and from
 * what. The numbers themselves, and why they are merged over the defaults on read, live in
 * `lib/server/audit-thresholds.ts` — shared with the findings route, which must run on exactly
 * the thresholds this screen displays.
 */
import { NextResponse } from 'next/server';
import { DEFAULT_AUDIT_THRESHOLDS } from '@buybox/core';
import { configRepo, newId } from '@buybox/db';
import {
  AUDIT_THRESHOLDS_KEY,
  parseAuditThresholds,
  readAuditThresholds,
} from '@/lib/server/audit-thresholds';
import { getAppDb } from '@/lib/server/db';

export async function GET() {
  const { thresholds, isDefault } = await readAuditThresholds();
  return NextResponse.json({ thresholds, defaults: DEFAULT_AUDIT_THRESHOLDS, isDefault });
}

export async function POST(request: Request) {
  const parsed = parseAuditThresholds(await request.json());
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  await configRepo.setAppSetting(
    getAppDb(),
    {
      key: AUDIT_THRESHOLDS_KEY,
      value: JSON.stringify(parsed.value),
      updatedBy: 'operator',
      updatedAt: Date.now(),
    },
    newId(),
  );
  return NextResponse.json({ ok: true, thresholds: parsed.value });
}

/**
 * Clears the override so the install falls back to the documented defaults — distinct from
 * storing values that happen to equal them, which is the distinction `deleteAppSetting` exists
 * to preserve.
 */
export async function DELETE() {
  await configRepo.deleteAppSetting(getAppDb(), AUDIT_THRESHOLDS_KEY, 'operator', Date.now(), newId());
  return NextResponse.json({ ok: true, thresholds: DEFAULT_AUDIT_THRESHOLDS });
}
