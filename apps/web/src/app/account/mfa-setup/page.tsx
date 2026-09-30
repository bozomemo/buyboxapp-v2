import { requirePermission } from '@/lib/server/auth/page-guard';
import { MfaSetupClient } from './mfa-setup-client';

/**
 * Enrol an authenticator app (doc 18 §5.2, doc 06 §10.1 "mandatory enrolment"). Outside the app
 * shell: on an install that requires a second factor this is the only screen a user without one
 * can reach, and the navigation would be a page of links that all bounce back here.
 */
export const dynamic = 'force-dynamic';

export default async function MfaSetupPage() {
  const gate = await requirePermission('view', { allowDuringEnrolment: true });
  if (!gate.ok) return gate.element;
  return <MfaSetupClient />;
}
