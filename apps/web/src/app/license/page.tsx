import { LicenseClient } from './license-client';

/**
 * doc 13 §6 — the one route the licence middleware exempts. Dynamic because the status it
 * renders changes with the clock and with what the operator pastes, and must never be served
 * from a build-time cache.
 */
export const dynamic = 'force-dynamic';

export default function LicensePage() {
  return <LicenseClient />;
}
