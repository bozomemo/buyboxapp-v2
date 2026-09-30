import { requirePermission } from '@/lib/server/auth/page-guard';
import SetupWizard from './setup-wizard';

/**
 * The setup wizard (doc 10 §6). A server shell around the client wizard so the permission check
 * (doc 18 §7.2) runs on the server: `settings.manage`, or — on an install with no administrator
 * yet — the setup token, which is how a checkout with no database reaches its database step
 * (doc 18 §8.1).
 */
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const gate = await requirePermission('settings.manage', { allowSetupAccess: true });
  if (!gate.ok) return gate.element;
  return <SetupWizard />;
}
