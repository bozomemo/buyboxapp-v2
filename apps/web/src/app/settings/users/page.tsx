import { PERMISSION_LABELS, PERMISSIONS, ROLE_LABELS, ROLES, hasPermission } from '@buybox/shared';
import { requirePermission } from '@/lib/server/auth/page-guard';
import { UsersClient, type RoleTable } from './users-client';

/** doc 06 §10.4. */
export const dynamic = 'force-dynamic';

/**
 * Built here, on the server, and handed to the client as data: the client component must not
 * import values from `@buybox/shared`, whose barrel carries Node-only code (found 2026-09-27 —
 * the page failed to bundle when it did).
 */
const ROLE_TABLE: RoleTable = {
  roles: ROLES.map((role) => ({ role, label: ROLE_LABELS[role] })),
  permissions: PERMISSIONS.map((permission) => ({
    label: PERMISSION_LABELS[permission],
    granted: ROLES.filter((role) => hasPermission(role, permission)),
  })),
};

export default async function UsersPage() {
  const gate = await requirePermission('users.manage');
  if (!gate.ok) return gate.element;
  return <UsersClient roleTable={ROLE_TABLE} />;
}
