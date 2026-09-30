// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authRepo, createDb, runMigrations, type AppDatabase } from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routeContext, signIn, withCookie } from '@/lib/server/auth/test-auth';
import { carryAdministratorForward } from '@/lib/server/auth/users';
import { GET as listUsers, POST as createUser } from './route';
import { PATCH as userAction } from './[id]/route';
import { GET as activity } from './activity/route';

/**
 * doc 18 §3, §6.3, §8.2 through the routes, against a real SQLite file: creating a user with a
 * temporary password, the last-administrator rule, disabling ending access at once, and the
 * administrator carried across a database switch.
 */
let dir: string;
let appDb: AppDatabase;
let adminCookie: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-users-route-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  appDb = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(appDb);
  adminCookie = await signIn(appDb, 'admin');
}, 30_000);

afterEach(() => {
  appDb.close();
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  globalThis.__buyboxHasAdmin = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

const json = (method: string, body: unknown, cookie = adminCookie) =>
  withCookie(new Request('http://localhost/api/users', { method, body: JSON.stringify(body) }), cookie);

async function adminId(): Promise<string> {
  return (await authRepo.listUsers(appDb)).find((u) => u.role === 'admin')!.id;
}

describe('/api/users', () => {
  it('creates a user who must change the temporary password, and refuses a weak one', async () => {
    const weak = await createUser(json('POST', { username: 'ayse', displayName: 'Ayşe', role: 'viewer', temporaryPassword: 'password123' }), routeContext());
    expect(weak.status).toBe(400);

    const res = await createUser(
      json('POST', { username: 'Ayse', displayName: 'Ayşe', role: 'viewer', temporaryPassword: 'kuzu-dere-yol-9', phone: '0532 123 45 67' }),
      routeContext(),
    );
    expect(res.status).toBe(201);
    const stored = await authRepo.getUserByUsername(appDb, 'ayse');
    expect(stored).toMatchObject({ role: 'viewer', mustChangePassword: true, phoneE164: '+905321234567', phoneVerifiedAt: null });
    expect(stored?.createdBy).toMatch(/^user:/);

    const dup = await createUser(json('POST', { username: 'ayse', displayName: 'X', role: 'viewer', temporaryPassword: 'kuzu-dere-yol-9' }), routeContext());
    expect(dup.status).toBe(409);

    const listed = (await (await listUsers(withCookie(new Request('http://localhost/api/users'), adminCookie), routeContext())).json()) as {
      users: Record<string, unknown>[];
    };
    expect(listed.users.map((u) => u.username).sort()).toContain('ayse');
    expect(JSON.stringify(listed)).not.toMatch(/scrypt|passwordHash|phoneE164/);
  });

  it('refuses to leave the install without an active administrator', async () => {
    const id = await adminId();
    const demote = await userAction(json('PATCH', { action: 'setRole', role: 'viewer' }), routeContext({ id }));
    expect(demote.status).toBe(409);
    const disable = await userAction(json('PATCH', { action: 'disable' }), routeContext({ id }));
    expect(disable.status).toBe(409);
    expect((await authRepo.getUserById(appDb, id))?.role).toBe('admin');
  });

  it('disabling a user ends their sessions at once and clears their phone number', async () => {
    const viewerCookie = await signIn(appDb, 'viewer');
    const viewer = (await authRepo.listUsers(appDb)).find((u) => u.role === 'viewer')!;
    await authRepo.updateUser(appDb, viewer.id, { phoneE164: '+905321234567' }, { nowMs: Date.now(), actor: 'cli' });
    expect(await authRepo.listSessionsForUser(appDb, viewer.id)).toHaveLength(1);

    const res = await userAction(json('PATCH', { action: 'disable' }), routeContext({ id: viewer.id }));
    expect(res.status).toBe(200);
    expect(await authRepo.listSessionsForUser(appDb, viewer.id)).toHaveLength(0);
    expect((await authRepo.getUserById(appDb, viewer.id))?.phoneE164).toBeNull();

    // The viewer's old cookie is now worthless.
    const withOld = await listUsers(withCookie(new Request('http://localhost/api/users'), viewerCookie), routeContext());
    expect(withOld.status).toBe(401);
  });

  it('a price manager cannot manage users', async () => {
    const pmCookie = await signIn(appDb, 'price_manager');
    const res = await createUser(json('POST', { username: 'x-user', displayName: 'X', role: 'admin', temporaryPassword: 'kuzu-dere-yol-9' }, pmCookie), routeContext());
    expect(res.status).toBe(403);
  });

  it('resetting a password sets a temporary one, unlocks, and ends sessions', async () => {
    await signIn(appDb, 'viewer');
    const viewer = (await authRepo.listUsers(appDb)).find((u) => u.role === 'viewer')!;
    await authRepo.updateUser(appDb, viewer.id, { lockedUntil: Date.now() + 60_000 }, { nowMs: Date.now(), actor: 'cli' });
    const res = await userAction(json('PATCH', { action: 'resetPassword', temporaryPassword: 'yeni-gecici-12' }), routeContext({ id: viewer.id }));
    expect(res.status).toBe(200);
    expect(await authRepo.getUserById(appDb, viewer.id)).toMatchObject({ mustChangePassword: true, lockedUntil: null });
    expect(await authRepo.listSessionsForUser(appDb, viewer.id)).toHaveLength(0);
  });

  it('records every action in the sign-in log, readable only with users.manage', async () => {
    await createUser(json('POST', { username: 'mehmet', displayName: 'Mehmet', role: 'price_manager', temporaryPassword: 'kuzu-dere-yol-9' }), routeContext());
    const res = await activity(withCookie(new Request('http://localhost/api/users/activity'), adminCookie), routeContext());
    const body = (await res.json()) as { events: { event: string; actor: string }[] };
    expect(body.events[0]).toMatchObject({ event: 'user.created', actor: 'Test admin' });
  });
});

describe('carryAdministratorForward (doc 18 §8.2)', () => {
  it('copies the acting administrator and their session into a target with none, once', async () => {
    const targetFile = path.join(dir, 'target.db');
    const target = createDb(`file:${targetFile}`, 'sqlite');
    try {
      await runMigrations(target);
      const admin = (await authRepo.listUsers(appDb))[0]!;
      const session = (await authRepo.listSessionsForUser(appDb, admin.id))[0]!;
      const auth = {
        user: { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role, mustChangePassword: false, mfaEnrolled: false },
        sessionId: session.id,
        actor: `user:${admin.id}`,
        can: () => true,
      };
      expect(await carryAdministratorForward(appDb, target, auth)).toBe(true);
      expect(await authRepo.hasActiveAdmin(target)).toBe(true);
      expect((await authRepo.getSessionWithUser(target, session.tokenHash))?.user.id).toBe(admin.id);
      expect(await carryAdministratorForward(appDb, target, auth)).toBe(false);
    } finally {
      target.close();
    }
  });
});
