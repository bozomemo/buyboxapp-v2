import { requirePermission } from '@/lib/server/auth/page-guard';
import { LicenseClient } from './license-client';

/**
 * doc 13 §6 — the one route the licence middleware exempts. Dynamic because the status it
 * renders changes with the clock and with what the operator pastes, and must never be served
 * from a build-time cache.
 */
export const dynamic = 'force-dynamic';

export default async function LicensePage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <LicenseClient />;
}
