/**
 * The permission catalogue and the three fixed roles (docs/18-authentication-and-access.md §6).
 *
 * Roles are code, not rows: the product owner settled on exactly these three on 2026-09-27, and
 * a role editor would be a screen nobody uses guarding a table nobody should change. A user has
 * exactly one role, stored as its English code — the Turkish names are display labels only, so
 * nothing that compares roles is ever exposed to Turkish casing.
 */

export type Permission =
  | 'view'
  | 'automation.stop'
  | 'prices.manage'
  | 'catalogue.manage'
  | 'jobs.operate'
  | 'settings.manage'
  | 'users.manage';

export const PERMISSIONS: readonly Permission[] = [
  'view',
  'automation.stop',
  'prices.manage',
  'catalogue.manage',
  'jobs.operate',
  'settings.manage',
  'users.manage',
];

export const PERMISSION_LABELS: Readonly<Record<Permission, string>> = {
  view: 'Tüm ekranları görüntüleme',
  'automation.stop': 'Otomasyonu durdurma',
  'prices.manage': 'Fiyat ve stok yönetimi',
  'catalogue.manage': 'Takip listeleri ve marka yönetimi',
  'jobs.operate': 'İşleri çalıştırma',
  'settings.manage': 'Ayarlar ve bağlantılar',
  'users.manage': 'Kullanıcı yönetimi',
};

export type Role = 'admin' | 'price_manager' | 'viewer';

export const ROLES: readonly Role[] = ['admin', 'price_manager', 'viewer'];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  admin: 'Yönetici',
  price_manager: 'Fiyat Yöneticisi',
  viewer: 'İzleyici',
};

/**
 * doc 18 §6.2. `automation.stop` is separate from `prices.manage` because stopping the bot cannot
 * lose money while releasing it sends prices again. İzleyici holds neither: the product owner
 * decided on 2026-09-27 that a viewer only views.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  admin: new Set(PERMISSIONS),
  price_manager: new Set<Permission>([
    'view',
    'automation.stop',
    'prices.manage',
    'catalogue.manage',
    'jobs.operate',
  ]),
  viewer: new Set<Permission>(['view']),
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export type UserState = 'active' | 'disabled';

export interface AdminInvariantUser {
  readonly id: string;
  readonly role: Role;
  readonly state: UserState;
}

export interface UserChange {
  readonly userId: string;
  readonly role?: Role;
  readonly state?: UserState;
}

export type UserChangeRefusal = 'last-admin' | 'self-disable';

/**
 * doc 18 §6.3 — refuses any change that would leave no active Yönetici, and an administrator
 * disabling themselves. Returns the reason, or `null` when the change may go ahead.
 *
 * `actorUserId` is the signed-in user making the change; `null` for the break-glass CLI, which
 * is allowed to disable anyone (it is the way back from a lock-out, not a way into one).
 */
export function checkUserChange(
  users: readonly AdminInvariantUser[],
  change: UserChange,
  actorUserId: string | null,
): UserChangeRefusal | null {
  if (actorUserId !== null && change.userId === actorUserId && change.state === 'disabled') {
    return 'self-disable';
  }
  const after = users.map((user) =>
    user.id === change.userId
      ? { ...user, role: change.role ?? user.role, state: change.state ?? user.state }
      : user,
  );
  const activeAdmins = after.filter((user) => user.role === 'admin' && user.state === 'active');
  return activeAdmins.length === 0 ? 'last-admin' : null;
}
