'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Permission } from '@buybox/shared';

/**
 * What the signed-in user may do, for **hiding and disabling controls** (doc 06 §10.5). A
 * courtesy, never the protection: every handler checks for itself (doc 18 §7.2).
 *
 * Unknown — still loading, the read failed, or a component rendered outside the provider (a
 * unit test) — counts as allowed. The server has the last word either way, and a courtesy layer
 * that locked a legitimate operator out of the stop button because one poll failed would be
 * worse than none.
 */
const PermissionsContext = createContext<ReadonlySet<Permission> | null>(null);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<ReadonlySet<Permission> | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { permissions?: Permission[] } } | null) => {
        if (!cancelled && data?.user?.permissions) setPermissions(new Set(data.user.permissions));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>;
}

export function useCan(): (permission: Permission) => boolean {
  const permissions = useContext(PermissionsContext);
  return (permission) => permissions === null || permissions.has(permission);
}

/**
 * A stop control's next click (doc 18 §6.1): engaging needs `automation.stop`, releasing needs
 * `prices.manage` as well. `engaged` is the control's current state.
 */
export function canToggleStop(can: (permission: Permission) => boolean, engaged: boolean): boolean {
  return engaged ? can('prices.manage') : can('automation.stop');
}

export const NO_PERMISSION_TITLE = 'Bu işlem için yetkiniz yok';
