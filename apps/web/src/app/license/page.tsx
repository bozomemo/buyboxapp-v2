import { requirePermission } from '@/lib/server/auth/page-guard';
import { LicenseClient } from './license-client';

/**
 * doc 13 §6 — the one route the licence middleware exempts. Dynamic because the status it
 * renders changes with the clock and with what the operator pastes, and must never be served
 * from a build-time cache.
 */
export const dynamic = 'force-dynamic';

export default async function LicensePage() {
  // The setup token reaches this screen before there is an administrator (doc 18 §8.1): the
  // wizard is gated behind the licence, so without it a fresh install loops back to /bootstrap.
  const gate = await requirePermission('view', { allowSetupAccess: true });
  if (!gate.ok) return gate.element;
  return <LicenseClient />;
}
