/**
 * "Şimdi kontrol et" — the same check the worker runs every few hours, run now
 * (docs/superpowers/specs/2026-11-04-auto-update-design.md §5.1).
 */
import { NextResponse } from 'next/server';
import { checkForUpdate } from '@buybox/jobs';
import { RELEASE_PUBLIC_KEYS_PEM } from '@buybox/shared';
import { withPermission } from '@/lib/server/auth/guard';
import { updateConfig } from '@/lib/server/update';

export const dynamic = 'force-dynamic';

async function postHandler() {
  const config = updateConfig();
  if (!config) {
    return NextResponse.json({ error: 'Bu kurulumda otomatik güncelleme yok.' }, { status: 409 });
  }
  const state = await checkForUpdate({ ...config, publicKeysPem: RELEASE_PUBLIC_KEYS_PEM, fetch, now: () => new Date() });
  return NextResponse.json(state);
}

export const POST = withPermission('settings.manage', postHandler);
