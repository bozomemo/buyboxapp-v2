/**
 * R-AUTH-10 (the role matrix, exactly as doc 18 §6.2 prints it) and R-AUTH-11 (never leave the
 * install without an active Yönetici, §6.3).
 */
import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLES,
  checkUserChange,
  hasPermission,
  type AdminInvariantUser,
  type Permission,
  type Role,
} from './permissions.js';

describe('role matrix (doc 18 §6.2)', () => {
  // Transcribed from the document's table, row by row, so a change to either shows up here.
  const matrix: Readonly<Record<Permission, Readonly<Record<Role, boolean>>>> = {
    view: { admin: true, price_manager: true, viewer: true },
    'automation.stop': { admin: true, price_manager: true, viewer: false },
    'prices.manage': { admin: true, price_manager: true, viewer: false },
    'catalogue.manage': { admin: true, price_manager: true, viewer: false },
    'jobs.operate': { admin: true, price_manager: true, viewer: false },
    'settings.manage': { admin: true, price_manager: false, viewer: false },
    'users.manage': { admin: true, price_manager: false, viewer: false },
  };

  const cells = PERMISSIONS.flatMap((permission) =>
    ROLES.map((role) => ({ permission, role, expected: matrix[permission][role] })),
  );

  it.each(cells)('$role / $permission → $expected', ({ permission, role, expected }) => {
    expect(hasPermission(role, permission)).toBe(expected);
  });

  it('the matrix above covers every permission in the catalogue', () => {
    expect(Object.keys(matrix).sort()).toEqual([...PERMISSIONS].sort());
  });
});

describe('checkUserChange (doc 18 §6.3)', () => {
  const admin = (id: string, state: 'active' | 'disabled' = 'active'): AdminInvariantUser => ({ id, role: 'admin', state });
  const viewer = (id: string): AdminInvariantUser => ({ id, role: 'viewer', state: 'active' });

  const cases: readonly {
    name: string;
    users: AdminInvariantUser[];
    change: { userId: string; role?: Role; state?: 'active' | 'disabled' };
    actor: string | null;
    expected: 'last-admin' | 'self-disable' | null;
  }[] = [
    { name: 'disable the only admin', users: [admin('a'), viewer('v')], change: { userId: 'a', state: 'disabled' }, actor: null, expected: 'last-admin' },
    { name: 'demote the only admin', users: [admin('a'), viewer('v')], change: { userId: 'a', role: 'viewer' }, actor: 'a', expected: 'last-admin' },
    { name: 'demote one of two admins', users: [admin('a'), admin('b')], change: { userId: 'b', role: 'price_manager' }, actor: 'a', expected: null },
    { name: 'demote yourself while another admin exists', users: [admin('a'), admin('b')], change: { userId: 'a', role: 'viewer' }, actor: 'a', expected: null },
    { name: 'disable yourself, even with another admin', users: [admin('a'), admin('b')], change: { userId: 'a', state: 'disabled' }, actor: 'a', expected: 'self-disable' },
    { name: 'the other admin is disabled, so this one is the last', users: [admin('a'), admin('b', 'disabled')], change: { userId: 'a', role: 'viewer' }, actor: 'a', expected: 'last-admin' },
    { name: 're-enabling a disabled admin', users: [admin('a'), admin('b', 'disabled')], change: { userId: 'b', state: 'active' }, actor: 'a', expected: null },
    { name: 'promoting a viewer', users: [admin('a'), viewer('v')], change: { userId: 'v', role: 'admin' }, actor: 'a', expected: null },
    { name: 'disabling a viewer', users: [admin('a'), viewer('v')], change: { userId: 'v', state: 'disabled' }, actor: 'a', expected: null },
    { name: 'the CLI may disable an admin when another remains', users: [admin('a'), admin('b')], change: { userId: 'a', state: 'disabled' }, actor: null, expected: null },
  ];

  it.each(cases)('$name', ({ users, change, actor, expected }) => {
    expect(checkUserChange(users, change, actor)).toBe(expected);
  });
});
