/**
 * Users, sessions, second-factor state and the sign-in log (doc 05 §7a, doc 18).
 *
 * Storage only. Every rule — who may do what, when a session has expired, whether a change
 * would leave no administrator, what a password must look like — is pure and lives in
 * `@buybox/shared`'s `auth/`, where it is table-tested without a database. This file never sees
 * a password, a code or a token in plain form: callers hash before they call.
 *
 * Role, state and event values are validated here rather than by CHECK constraints, following
 * the schema's convention (see the note above the tables in `schema/sqlite.ts`).
 */
import { and, desc, eq, gte, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { isRole, type Role, type UserState } from '@buybox/shared';
import type { AppDatabase } from '../client.js';
import * as mysqlSchema from '../schema/mysql.js';
import * as postgresSchema from '../schema/postgres.js';
import * as sqliteSchema from '../schema/sqlite.js';
import { runDialect, withDialect } from '../with-dialect.js';

// ── Users ────────────────────────────────────────────────────────────────────────────────────

export interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
  readonly state: UserState;
  readonly passwordHash: string;
  readonly mustChangePassword: boolean;
  readonly passwordChangedAt: number;
  readonly totpEnabled: boolean;
  readonly totpLastStep: number | null;
  readonly totpPendingSince: number | null;
  readonly phoneE164: string | null;
  readonly phoneVerifiedAt: number | null;
  readonly smsEnabled: boolean;
  readonly lockedUntil: number | null;
  readonly lastLoginAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`Bu kullanıcı adı zaten kullanılıyor: ${username}`);
    this.name = 'UsernameTakenError';
  }
}

function assertUserEnums(row: { role?: string; state?: string }): void {
  if (row.role !== undefined && !isRole(row.role)) throw new Error(`Unknown role "${row.role}"`);
  if (row.state !== undefined && row.state !== 'active' && row.state !== 'disabled') {
    throw new Error(`Unknown user state "${row.state}"`);
  }
}

/** `username` must already be normalised (`normaliseUsername`); this does not re-normalise. */
export async function insertUser(appDb: AppDatabase, row: UserRow): Promise<void> {
  assertUserEnums(row);
  if (await getUserByUsername(appDb, row.username)) throw new UsernameTakenError(row.username);
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.users).values(row),
    postgres: (db) => db.insert(postgresSchema.users).values(row),
    mysql: (db) => db.insert(mysqlSchema.users).values(row),
  });
}

export async function getUserById(appDb: AppDatabase, id: string): Promise<UserRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) => (await db.select().from(sqliteSchema.users).where(eq(sqliteSchema.users.id, id)))[0],
    postgres: async (db) => (await db.select().from(postgresSchema.users).where(eq(postgresSchema.users.id, id)))[0],
    mysql: async (db) => (await db.select().from(mysqlSchema.users).where(eq(mysqlSchema.users.id, id)))[0],
  }) as Promise<UserRow | undefined>;
}

export async function getUserByUsername(appDb: AppDatabase, username: string): Promise<UserRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) =>
      (await db.select().from(sqliteSchema.users).where(eq(sqliteSchema.users.username, username)))[0],
    postgres: async (db) =>
      (await db.select().from(postgresSchema.users).where(eq(postgresSchema.users.username, username)))[0],
    mysql: async (db) =>
      (await db.select().from(mysqlSchema.users).where(eq(mysqlSchema.users.username, username)))[0],
  }) as Promise<UserRow | undefined>;
}

/** Every user, disabled ones included — the users screen shows both, and the admin guard needs both. */
export async function listUsers(appDb: AppDatabase): Promise<UserRow[]> {
  return withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.users).orderBy(sqliteSchema.users.username),
    postgres: (db) => db.select().from(postgresSchema.users).orderBy(postgresSchema.users.username),
    mysql: (db) => db.select().from(mysqlSchema.users).orderBy(mysqlSchema.users.username),
  }) as Promise<UserRow[]>;
}

/** doc 18 §8.1 — bootstrap mode is "no active Yönetici in this database". */
export async function hasActiveAdmin(appDb: AppDatabase): Promise<boolean> {
  const rows = await withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.users;
      return db.select({ id: t.id }).from(t).where(and(eq(t.role, 'admin'), eq(t.state, 'active'))).limit(1);
    },
    postgres: (db) => {
      const t = postgresSchema.users;
      return db.select({ id: t.id }).from(t).where(and(eq(t.role, 'admin'), eq(t.state, 'active'))).limit(1);
    },
    mysql: (db) => {
      const t = mysqlSchema.users;
      return db.select({ id: t.id }).from(t).where(and(eq(t.role, 'admin'), eq(t.state, 'active'))).limit(1);
    },
  });
  return rows.length > 0;
}

/** The fields a caller may change after creation. `id`, `username` and `created*` are fixed. */
export type UserPatch = Partial<
  Pick<
    UserRow,
    | 'displayName'
    | 'role'
    | 'state'
    | 'passwordHash'
    | 'mustChangePassword'
    | 'passwordChangedAt'
    | 'totpEnabled'
    | 'totpLastStep'
    | 'totpPendingSince'
    | 'phoneE164'
    | 'phoneVerifiedAt'
    | 'smsEnabled'
    | 'lockedUntil'
    | 'lastLoginAt'
  >
>;

export async function updateUser(
  appDb: AppDatabase,
  id: string,
  patch: UserPatch,
  audit: { readonly nowMs: number; readonly actor: string },
): Promise<void> {
  assertUserEnums(patch);
  const set = { ...patch, updatedAt: audit.nowMs, updatedBy: audit.actor };
  await runDialect(appDb, {
    sqlite: (db) => db.update(sqliteSchema.users).set(set).where(eq(sqliteSchema.users.id, id)),
    postgres: (db) => db.update(postgresSchema.users).set(set).where(eq(postgresSchema.users.id, id)),
    mysql: (db) => db.update(mysqlSchema.users).set(set).where(eq(mysqlSchema.users.id, id)),
  });
}

/**
 * TOTP replay guard, as one conditional update (R-AUTH-6). Two requests carrying the same code
 * at the same moment both pass `verifyTotp` against the same stored step; only one of them can
 * move the stored step forward, and only that one may sign in. Returns whether this call won.
 */
export async function advanceTotpStep(appDb: AppDatabase, userId: string, step: number): Promise<boolean> {
  const rows = await withDialect(appDb, {
    sqlite: async (db) => {
      const t = sqliteSchema.users;
      const result = await db
        .update(t)
        .set({ totpLastStep: step })
        .where(and(eq(t.id, userId), or(isNull(t.totpLastStep), lt(t.totpLastStep, step))));
      return result.changes;
    },
    postgres: async (db) => {
      const t = postgresSchema.users;
      const result = await db
        .update(t)
        .set({ totpLastStep: step })
        .where(and(eq(t.id, userId), or(isNull(t.totpLastStep), lt(t.totpLastStep, step))));
      return result.rowCount ?? 0;
    },
    mysql: async (db) => {
      const t = mysqlSchema.users;
      const [result] = await db
        .update(t)
        .set({ totpLastStep: step })
        .where(and(eq(t.id, userId), or(isNull(t.totpLastStep), lt(t.totpLastStep, step))));
      return result.affectedRows;
    },
  });
  return rows === 1;
}

// ── Sessions ─────────────────────────────────────────────────────────────────────────────────

export interface SessionRow {
  readonly id: string;
  readonly tokenHash: string;
  readonly userId: string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly expiresAt: number;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export async function insertSession(appDb: AppDatabase, row: SessionRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.sessions).values(row),
    postgres: (db) => db.insert(postgresSchema.sessions).values(row),
    mysql: (db) => db.insert(mysqlSchema.sessions).values(row),
  });
}

/** One read per request: the session and its user together. Liveness is the caller's (pure) call. */
export async function getSessionWithUser(
  appDb: AppDatabase,
  tokenHash: string,
): Promise<{ readonly session: SessionRow; readonly user: UserRow } | undefined> {
  const row = await withDialect(appDb, {
    sqlite: async (db) => {
      const s = sqliteSchema.sessions;
      const u = sqliteSchema.users;
      return (await db.select({ session: s, user: u }).from(s).innerJoin(u, eq(u.id, s.userId)).where(eq(s.tokenHash, tokenHash)))[0];
    },
    postgres: async (db) => {
      const s = postgresSchema.sessions;
      const u = postgresSchema.users;
      return (await db.select({ session: s, user: u }).from(s).innerJoin(u, eq(u.id, s.userId)).where(eq(s.tokenHash, tokenHash)))[0];
    },
    mysql: async (db) => {
      const s = mysqlSchema.sessions;
      const u = mysqlSchema.users;
      return (await db.select({ session: s, user: u }).from(s).innerJoin(u, eq(u.id, s.userId)).where(eq(s.tokenHash, tokenHash)))[0];
    },
  });
  return row as { session: SessionRow; user: UserRow } | undefined;
}

export async function listSessionsForUser(appDb: AppDatabase, userId: string): Promise<SessionRow[]> {
  return withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.sessions).where(eq(sqliteSchema.sessions.userId, userId)).orderBy(desc(sqliteSchema.sessions.lastSeenAt)),
    postgres: (db) => db.select().from(postgresSchema.sessions).where(eq(postgresSchema.sessions.userId, userId)).orderBy(desc(postgresSchema.sessions.lastSeenAt)),
    mysql: (db) => db.select().from(mysqlSchema.sessions).where(eq(mysqlSchema.sessions.userId, userId)).orderBy(desc(mysqlSchema.sessions.lastSeenAt)),
  }) as Promise<SessionRow[]>;
}

export async function touchSession(appDb: AppDatabase, id: string, nowMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.update(sqliteSchema.sessions).set({ lastSeenAt: nowMs }).where(eq(sqliteSchema.sessions.id, id)),
    postgres: (db) => db.update(postgresSchema.sessions).set({ lastSeenAt: nowMs }).where(eq(postgresSchema.sessions.id, id)),
    mysql: (db) => db.update(mysqlSchema.sessions).set({ lastSeenAt: nowMs }).where(eq(mysqlSchema.sessions.id, id)),
  });
}

/** Scoped to the user as well as the id, so `/account` cannot end somebody else's session. */
export async function deleteSession(appDb: AppDatabase, id: string, userId: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.sessions).where(and(eq(sqliteSchema.sessions.id, id), eq(sqliteSchema.sessions.userId, userId))),
    postgres: (db) => db.delete(postgresSchema.sessions).where(and(eq(postgresSchema.sessions.id, id), eq(postgresSchema.sessions.userId, userId))),
    mysql: (db) => db.delete(mysqlSchema.sessions).where(and(eq(mysqlSchema.sessions.id, id), eq(mysqlSchema.sessions.userId, userId))),
  });
}

/**
 * Revokes all of a user's sessions, optionally keeping one (a password change keeps the session
 * it was made from, doc 18 §3.2).
 */
export async function deleteSessionsForUser(
  appDb: AppDatabase,
  userId: string,
  options: { readonly exceptSessionId?: string } = {},
): Promise<void> {
  const keep = options.exceptSessionId;
  await runDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.sessions;
      return db.delete(t).where(keep === undefined ? eq(t.userId, userId) : and(eq(t.userId, userId), ne(t.id, keep)));
    },
    postgres: (db) => {
      const t = postgresSchema.sessions;
      return db.delete(t).where(keep === undefined ? eq(t.userId, userId) : and(eq(t.userId, userId), ne(t.id, keep)));
    },
    mysql: (db) => {
      const t = mysqlSchema.sessions;
      return db.delete(t).where(keep === undefined ? eq(t.userId, userId) : and(eq(t.userId, userId), ne(t.id, keep)));
    },
  });
}

// ── Trusted devices ──────────────────────────────────────────────────────────────────────────

export interface TrustedDeviceRow {
  readonly id: string;
  readonly tokenHash: string;
  readonly userId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly lastUsedAt: number | null;
  readonly label: string | null;
}

export async function insertTrustedDevice(appDb: AppDatabase, row: TrustedDeviceRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.trustedDevices).values(row),
    postgres: (db) => db.insert(postgresSchema.trustedDevices).values(row),
    mysql: (db) => db.insert(mysqlSchema.trustedDevices).values(row),
  });
}

/** Only a device that belongs to `userId` and has not expired counts (doc 18 §5.1). */
export async function findTrustedDevice(
  appDb: AppDatabase,
  userId: string,
  tokenHash: string,
  nowMs: number,
): Promise<TrustedDeviceRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) => {
      const t = sqliteSchema.trustedDevices;
      return (await db.select().from(t).where(and(eq(t.userId, userId), eq(t.tokenHash, tokenHash), gte(t.expiresAt, nowMs))))[0];
    },
    postgres: async (db) => {
      const t = postgresSchema.trustedDevices;
      return (await db.select().from(t).where(and(eq(t.userId, userId), eq(t.tokenHash, tokenHash), gte(t.expiresAt, nowMs))))[0];
    },
    mysql: async (db) => {
      const t = mysqlSchema.trustedDevices;
      return (await db.select().from(t).where(and(eq(t.userId, userId), eq(t.tokenHash, tokenHash), gte(t.expiresAt, nowMs))))[0];
    },
  }) as Promise<TrustedDeviceRow | undefined>;
}

export async function listTrustedDevices(appDb: AppDatabase, userId: string): Promise<TrustedDeviceRow[]> {
  return withDialect(appDb, {
    sqlite: (db) => db.select().from(sqliteSchema.trustedDevices).where(eq(sqliteSchema.trustedDevices.userId, userId)),
    postgres: (db) => db.select().from(postgresSchema.trustedDevices).where(eq(postgresSchema.trustedDevices.userId, userId)),
    mysql: (db) => db.select().from(mysqlSchema.trustedDevices).where(eq(mysqlSchema.trustedDevices.userId, userId)),
  }) as Promise<TrustedDeviceRow[]>;
}

export async function touchTrustedDevice(appDb: AppDatabase, id: string, nowMs: number): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.update(sqliteSchema.trustedDevices).set({ lastUsedAt: nowMs }).where(eq(sqliteSchema.trustedDevices.id, id)),
    postgres: (db) => db.update(postgresSchema.trustedDevices).set({ lastUsedAt: nowMs }).where(eq(postgresSchema.trustedDevices.id, id)),
    mysql: (db) => db.update(mysqlSchema.trustedDevices).set({ lastUsedAt: nowMs }).where(eq(mysqlSchema.trustedDevices.id, id)),
  });
}

/** One device (`deviceId` set) or all of the user's. Always scoped to the user. */
export async function deleteTrustedDevices(
  appDb: AppDatabase,
  userId: string,
  deviceId?: string,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.trustedDevices;
      return db.delete(t).where(deviceId === undefined ? eq(t.userId, userId) : and(eq(t.userId, userId), eq(t.id, deviceId)));
    },
    postgres: (db) => {
      const t = postgresSchema.trustedDevices;
      return db.delete(t).where(deviceId === undefined ? eq(t.userId, userId) : and(eq(t.userId, userId), eq(t.id, deviceId)));
    },
    mysql: (db) => {
      const t = mysqlSchema.trustedDevices;
      return db.delete(t).where(deviceId === undefined ? eq(t.userId, userId) : and(eq(t.userId, userId), eq(t.id, deviceId)));
    },
  });
}

// ── Second-factor challenges ─────────────────────────────────────────────────────────────────

export interface MfaChallengeRow {
  readonly id: string;
  readonly tokenHash: string;
  readonly userId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly attempts: number;
  readonly consumedAt: number | null;
}

export async function insertMfaChallenge(appDb: AppDatabase, row: MfaChallengeRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.mfaChallenges).values(row),
    postgres: (db) => db.insert(postgresSchema.mfaChallenges).values(row),
    mysql: (db) => db.insert(mysqlSchema.mfaChallenges).values(row),
  });
}

/** Only an unconsumed, unexpired challenge is returned. */
export async function findOpenMfaChallenge(
  appDb: AppDatabase,
  tokenHash: string,
  nowMs: number,
): Promise<MfaChallengeRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) => {
      const t = sqliteSchema.mfaChallenges;
      return (await db.select().from(t).where(and(eq(t.tokenHash, tokenHash), isNull(t.consumedAt), gte(t.expiresAt, nowMs))))[0];
    },
    postgres: async (db) => {
      const t = postgresSchema.mfaChallenges;
      return (await db.select().from(t).where(and(eq(t.tokenHash, tokenHash), isNull(t.consumedAt), gte(t.expiresAt, nowMs))))[0];
    },
    mysql: async (db) => {
      const t = mysqlSchema.mfaChallenges;
      return (await db.select().from(t).where(and(eq(t.tokenHash, tokenHash), isNull(t.consumedAt), gte(t.expiresAt, nowMs))))[0];
    },
  }) as Promise<MfaChallengeRow | undefined>;
}

export async function incrementMfaChallengeAttempts(appDb: AppDatabase, id: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.update(sqliteSchema.mfaChallenges).set({ attempts: sql`${sqliteSchema.mfaChallenges.attempts} + 1` }).where(eq(sqliteSchema.mfaChallenges.id, id)),
    postgres: (db) => db.update(postgresSchema.mfaChallenges).set({ attempts: sql`${postgresSchema.mfaChallenges.attempts} + 1` }).where(eq(postgresSchema.mfaChallenges.id, id)),
    mysql: (db) => db.update(mysqlSchema.mfaChallenges).set({ attempts: sql`${mysqlSchema.mfaChallenges.attempts} + 1` }).where(eq(mysqlSchema.mfaChallenges.id, id)),
  });
}

/**
 * Consumes a challenge exactly once. A conditional update, so two concurrent correct codes for
 * one challenge produce one session, not two. Returns whether this call consumed it.
 */
export async function consumeMfaChallenge(appDb: AppDatabase, id: string, nowMs: number): Promise<boolean> {
  const changed = await withDialect(appDb, {
    sqlite: async (db) => {
      const t = sqliteSchema.mfaChallenges;
      return (await db.update(t).set({ consumedAt: nowMs }).where(and(eq(t.id, id), isNull(t.consumedAt)))).changes;
    },
    postgres: async (db) => {
      const t = postgresSchema.mfaChallenges;
      return (await db.update(t).set({ consumedAt: nowMs }).where(and(eq(t.id, id), isNull(t.consumedAt)))).rowCount ?? 0;
    },
    mysql: async (db) => {
      const t = mysqlSchema.mfaChallenges;
      const [result] = await db.update(t).set({ consumedAt: nowMs }).where(and(eq(t.id, id), isNull(t.consumedAt)));
      return result.affectedRows;
    },
  });
  return changed === 1;
}

// ── SMS codes ────────────────────────────────────────────────────────────────────────────────

export type SmsCodePurpose = 'login' | 'enrol';
export type SmsCodeState = 'sent' | 'failed' | 'used' | 'expired' | 'replaced';

export interface SmsCodeRow {
  readonly id: string;
  readonly purpose: SmsCodePurpose;
  readonly challengeId: string | null;
  readonly userId: string;
  readonly phoneE164: string;
  readonly codeHmac: string;
  readonly sentAt: number;
  readonly expiresAt: number;
  readonly attempts: number;
  readonly providerRef: string | null;
  readonly state: SmsCodeState;
}

/**
 * Inserts a new code and marks the user's earlier live codes for the same purpose `replaced`
 * (doc 18 §5.3: a resend replaces, never adds a second valid code).
 */
export async function insertSmsCode(appDb: AppDatabase, row: SmsCodeRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.smsCodes;
      return db.update(t).set({ state: 'replaced' }).where(and(eq(t.userId, row.userId), eq(t.purpose, row.purpose), eq(t.state, 'sent')));
    },
    postgres: (db) => {
      const t = postgresSchema.smsCodes;
      return db.update(t).set({ state: 'replaced' }).where(and(eq(t.userId, row.userId), eq(t.purpose, row.purpose), eq(t.state, 'sent')));
    },
    mysql: (db) => {
      const t = mysqlSchema.smsCodes;
      return db.update(t).set({ state: 'replaced' }).where(and(eq(t.userId, row.userId), eq(t.purpose, row.purpose), eq(t.state, 'sent')));
    },
  });
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.smsCodes).values(row),
    postgres: (db) => db.insert(postgresSchema.smsCodes).values(row),
    mysql: (db) => db.insert(mysqlSchema.smsCodes).values(row),
  });
}

/** The one live code for a user and purpose, if any. */
export async function findLiveSmsCode(
  appDb: AppDatabase,
  userId: string,
  purpose: SmsCodePurpose,
  nowMs: number,
): Promise<SmsCodeRow | undefined> {
  return withDialect(appDb, {
    sqlite: async (db) => {
      const t = sqliteSchema.smsCodes;
      return (await db.select().from(t).where(and(eq(t.userId, userId), eq(t.purpose, purpose), eq(t.state, 'sent'), gte(t.expiresAt, nowMs))).orderBy(desc(t.sentAt)).limit(1))[0];
    },
    postgres: async (db) => {
      const t = postgresSchema.smsCodes;
      return (await db.select().from(t).where(and(eq(t.userId, userId), eq(t.purpose, purpose), eq(t.state, 'sent'), gte(t.expiresAt, nowMs))).orderBy(desc(t.sentAt)).limit(1))[0];
    },
    mysql: async (db) => {
      const t = mysqlSchema.smsCodes;
      return (await db.select().from(t).where(and(eq(t.userId, userId), eq(t.purpose, purpose), eq(t.state, 'sent'), gte(t.expiresAt, nowMs))).orderBy(desc(t.sentAt)).limit(1))[0];
    },
  }) as Promise<SmsCodeRow | undefined>;
}

export async function updateSmsCode(
  appDb: AppDatabase,
  id: string,
  patch: Partial<Pick<SmsCodeRow, 'attempts' | 'state' | 'providerRef'>>,
): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.update(sqliteSchema.smsCodes).set(patch).where(eq(sqliteSchema.smsCodes.id, id)),
    postgres: (db) => db.update(postgresSchema.smsCodes).set(patch).where(eq(postgresSchema.smsCodes.id, id)),
    mysql: (db) => db.update(mysqlSchema.smsCodes).set(patch).where(eq(mysqlSchema.smsCodes.id, id)),
  });
}

/**
 * Messages sent since `sinceMs`, for the three caps of doc 18 §5.3. `failed` sends count too:
 * a provider that accepted and billed a message may still report an error.
 */
export async function countSmsSent(
  appDb: AppDatabase,
  scope: { readonly userId?: string; readonly phoneE164?: string },
  sinceMs: number,
): Promise<number> {
  const rows = await withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.smsCodes;
      return db.select({ n: sql<number>`count(*)` }).from(t).where(smsScope(t, scope, sinceMs));
    },
    postgres: (db) => {
      const t = postgresSchema.smsCodes;
      return db.select({ n: sql<number>`count(*)` }).from(t).where(smsScope(t, scope, sinceMs));
    },
    mysql: (db) => {
      const t = mysqlSchema.smsCodes;
      return db.select({ n: sql<number>`count(*)` }).from(t).where(smsScope(t, scope, sinceMs));
    },
  });
  // `count(*)` arrives as a string from pg and as a number elsewhere.
  return Number(rows[0]?.n ?? 0);
}

type SmsCodesTable = typeof sqliteSchema.smsCodes | typeof postgresSchema.smsCodes | typeof mysqlSchema.smsCodes;

function smsScope(t: SmsCodesTable, scope: { readonly userId?: string; readonly phoneE164?: string }, sinceMs: number): SQL | undefined {
  const parts: SQL[] = [gte(t.sentAt, sinceMs)];
  if (scope.userId !== undefined) parts.push(eq(t.userId, scope.userId));
  if (scope.phoneE164 !== undefined) parts.push(eq(t.phoneE164, scope.phoneE164));
  return and(...parts);
}

// ── Recovery codes ───────────────────────────────────────────────────────────────────────────

export interface RecoveryCodeRow {
  readonly id: string;
  readonly userId: string;
  readonly codeHash: string;
  readonly createdAt: number;
  readonly usedAt: number | null;
}

/** Regenerating invalidates the old set (doc 18 §5.4): delete, then insert. */
export async function replaceRecoveryCodes(
  appDb: AppDatabase,
  userId: string,
  rows: readonly RecoveryCodeRow[],
): Promise<void> {
  await deleteRecoveryCodes(appDb, userId);
  if (rows.length === 0) return;
  const values = [...rows];
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.recoveryCodes).values(values),
    postgres: (db) => db.insert(postgresSchema.recoveryCodes).values(values),
    mysql: (db) => db.insert(mysqlSchema.recoveryCodes).values(values),
  });
}

export async function deleteRecoveryCodes(appDb: AppDatabase, userId: string): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.recoveryCodes).where(eq(sqliteSchema.recoveryCodes.userId, userId)),
    postgres: (db) => db.delete(postgresSchema.recoveryCodes).where(eq(postgresSchema.recoveryCodes.userId, userId)),
    mysql: (db) => db.delete(mysqlSchema.recoveryCodes).where(eq(mysqlSchema.recoveryCodes.userId, userId)),
  });
}

/**
 * Spends a code, once: a conditional update on `used_at IS NULL`, so the same code submitted
 * twice at once signs in once. Returns whether this call spent it.
 */
export async function useRecoveryCode(
  appDb: AppDatabase,
  userId: string,
  codeHash: string,
  nowMs: number,
): Promise<boolean> {
  const changed = await withDialect(appDb, {
    sqlite: async (db) => {
      const t = sqliteSchema.recoveryCodes;
      return (await db.update(t).set({ usedAt: nowMs }).where(and(eq(t.userId, userId), eq(t.codeHash, codeHash), isNull(t.usedAt)))).changes;
    },
    postgres: async (db) => {
      const t = postgresSchema.recoveryCodes;
      return (await db.update(t).set({ usedAt: nowMs }).where(and(eq(t.userId, userId), eq(t.codeHash, codeHash), isNull(t.usedAt)))).rowCount ?? 0;
    },
    mysql: async (db) => {
      const t = mysqlSchema.recoveryCodes;
      const [result] = await db.update(t).set({ usedAt: nowMs }).where(and(eq(t.userId, userId), eq(t.codeHash, codeHash), isNull(t.usedAt)));
      return result.affectedRows;
    },
  });
  return changed === 1;
}

export async function countUnusedRecoveryCodes(appDb: AppDatabase, userId: string): Promise<number> {
  const rows = await withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.recoveryCodes;
      return db.select({ n: sql<number>`count(*)` }).from(t).where(and(eq(t.userId, userId), isNull(t.usedAt)));
    },
    postgres: (db) => {
      const t = postgresSchema.recoveryCodes;
      return db.select({ n: sql<number>`count(*)` }).from(t).where(and(eq(t.userId, userId), isNull(t.usedAt)));
    },
    mysql: (db) => {
      const t = mysqlSchema.recoveryCodes;
      return db.select({ n: sql<number>`count(*)` }).from(t).where(and(eq(t.userId, userId), isNull(t.usedAt)));
    },
  });
  return Number(rows[0]?.n ?? 0);
}

// ── Login attempts ───────────────────────────────────────────────────────────────────────────

/** Matches the MySQL column width; what was typed may be anything up to the form's limit. */
const ATTEMPT_USERNAME_MAX = 128;

export interface LoginAttemptRow {
  readonly id: string;
  readonly at: number;
  readonly username: string;
  readonly ip: string | null;
  readonly succeeded: boolean;
}

export async function recordLoginAttempt(appDb: AppDatabase, row: LoginAttemptRow): Promise<void> {
  const value = { ...row, username: row.username.slice(0, ATTEMPT_USERNAME_MAX) };
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.loginAttempts).values(value),
    postgres: (db) => db.insert(postgresSchema.loginAttempts).values(value),
    mysql: (db) => db.insert(mysqlSchema.loginAttempts).values(value),
  });
}

/**
 * Forgets a username's failed attempts — what an unlock means. Without it an unlocked user's
 * next mistyped password would count the five that locked them and lock them again at once.
 */
export async function clearLoginFailures(appDb: AppDatabase, username: string): Promise<void> {
  const name = username.slice(0, ATTEMPT_USERNAME_MAX);
  await runDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.loginAttempts;
      return db.delete(t).where(and(eq(t.username, name), eq(t.succeeded, false)));
    },
    postgres: (db) => {
      const t = postgresSchema.loginAttempts;
      return db.delete(t).where(and(eq(t.username, name), eq(t.succeeded, false)));
    },
    mysql: (db) => {
      const t = mysqlSchema.loginAttempts;
      return db.delete(t).where(and(eq(t.username, name), eq(t.succeeded, false)));
    },
  });
}

type LoginAttemptsTable =
  | typeof sqliteSchema.loginAttempts
  | typeof postgresSchema.loginAttempts
  | typeof mysqlSchema.loginAttempts;

function attemptScope(t: LoginAttemptsTable, key: { readonly username: string } | { readonly ip: string }): SQL {
  return 'username' in key ? eq(t.username, key.username.slice(0, ATTEMPT_USERNAME_MAX)) : eq(t.ip, key.ip);
}

/**
 * Failures for one username (or one address) inside the window **and after the most recent
 * success** — a user who mistypes twice, signs in, and mistypes again tomorrow morning is not
 * three strikes toward a lockout (doc 18 §3.3).
 */
export async function countRecentFailures(
  appDb: AppDatabase,
  key: { readonly username: string } | { readonly ip: string },
  windowStartMs: number,
): Promise<number> {
  const rows = await withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.loginAttempts;
      return db.select({ at: t.at, succeeded: t.succeeded }).from(t).where(and(attemptScope(t, key), gte(t.at, windowStartMs)));
    },
    postgres: (db) => {
      const t = postgresSchema.loginAttempts;
      return db.select({ at: t.at, succeeded: t.succeeded }).from(t).where(and(attemptScope(t, key), gte(t.at, windowStartMs)));
    },
    mysql: (db) => {
      const t = mysqlSchema.loginAttempts;
      return db.select({ at: t.at, succeeded: t.succeeded }).from(t).where(and(attemptScope(t, key), gte(t.at, windowStartMs)));
    },
  });
  const lastSuccess = rows.filter((row) => row.succeeded).reduce((max, row) => Math.max(max, row.at), -Infinity);
  return rows.filter((row) => !row.succeeded && row.at > lastSuccess).length;
}

// ── Sign-in log ──────────────────────────────────────────────────────────────────────────────

export type AuthEventName =
  | 'login.succeeded'
  | 'login.failed'
  | 'login.locked'
  | 'logout'
  | 'mfa.passed'
  | 'mfa.failed'
  | 'mfa.enrolled'
  | 'mfa.removed'
  | 'recovery.used'
  | 'recovery.regenerated'
  | 'sms.sent'
  | 'sms.failed'
  | 'sms.capped'
  | 'password.changed'
  | 'password.reset'
  | 'user.created'
  | 'user.disabled'
  | 'user.enabled'
  | 'user.role_changed'
  | 'user.unlocked'
  | 'bootstrap.completed'
  | 'session.revoked'
  | 'device.revoked';

export interface AuthEventRow {
  readonly id: string;
  readonly at: number;
  readonly event: AuthEventName;
  readonly userId: string | null;
  readonly actor: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  /** JSON. Never a password, code or token (R-AUTH-3). */
  readonly detail: string | null;
}

export async function recordAuthEvent(appDb: AppDatabase, row: AuthEventRow): Promise<void> {
  await runDialect(appDb, {
    sqlite: (db) => db.insert(sqliteSchema.authEvents).values(row),
    postgres: (db) => db.insert(postgresSchema.authEvents).values(row),
    mysql: (db) => db.insert(mysqlSchema.authEvents).values(row),
  });
}

export interface AuthEventFilters {
  readonly userId?: string;
  readonly event?: AuthEventName;
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly limit?: number;
  readonly offset?: number;
}

type AuthEventsTable = typeof sqliteSchema.authEvents | typeof postgresSchema.authEvents | typeof mysqlSchema.authEvents;

function authEventScope(t: AuthEventsTable, f: AuthEventFilters): SQL | undefined {
  const parts: SQL[] = [];
  if (f.userId !== undefined) parts.push(eq(t.userId, f.userId));
  if (f.event !== undefined) parts.push(eq(t.event, f.event));
  if (f.fromMs !== undefined) parts.push(gte(t.at, f.fromMs));
  if (f.toMs !== undefined) parts.push(lt(t.at, f.toMs));
  return parts.length === 0 ? undefined : and(...parts);
}

/** Newest first. `limit` is capped at 500: this backs a paged screen, not an export of the year. */
export async function listAuthEvents(appDb: AppDatabase, filters: AuthEventFilters = {}): Promise<AuthEventRow[]> {
  const limit = Math.min(filters.limit ?? 100, 500);
  const offset = filters.offset ?? 0;
  return withDialect(appDb, {
    sqlite: (db) => {
      const t = sqliteSchema.authEvents;
      return db.select().from(t).where(authEventScope(t, filters)).orderBy(desc(t.at)).limit(limit).offset(offset);
    },
    postgres: (db) => {
      const t = postgresSchema.authEvents;
      return db.select().from(t).where(authEventScope(t, filters)).orderBy(desc(t.at)).limit(limit).offset(offset);
    },
    mysql: (db) => {
      const t = mysqlSchema.authEvents;
      return db.select().from(t).where(authEventScope(t, filters)).orderBy(desc(t.at)).limit(limit).offset(offset);
    },
  }) as Promise<AuthEventRow[]>;
}

// ── Retention (doc 05 §10) ───────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Expired sessions, devices and challenges go at once; SMS codes and challenges a day after
 * expiry; login attempts after a day (only the 15-minute windows read them); the sign-in log
 * after `authEventsCutoffMs`. Every cutoff but the last is fixed by doc 05 §10 rather than
 * operator-configurable: they are working state, not history anyone reads.
 */
export async function pruneAuth(appDb: AppDatabase, nowMs: number, authEventsCutoffMs: number): Promise<void> {
  const dayAgo = nowMs - DAY_MS;
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.sessions).where(lt(sqliteSchema.sessions.expiresAt, nowMs)),
    postgres: (db) => db.delete(postgresSchema.sessions).where(lt(postgresSchema.sessions.expiresAt, nowMs)),
    mysql: (db) => db.delete(mysqlSchema.sessions).where(lt(mysqlSchema.sessions.expiresAt, nowMs)),
  });
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.trustedDevices).where(lt(sqliteSchema.trustedDevices.expiresAt, nowMs)),
    postgres: (db) => db.delete(postgresSchema.trustedDevices).where(lt(postgresSchema.trustedDevices.expiresAt, nowMs)),
    mysql: (db) => db.delete(mysqlSchema.trustedDevices).where(lt(mysqlSchema.trustedDevices.expiresAt, nowMs)),
  });
  // SMS codes before challenges: a code references its challenge, and while the cascade would
  // take care of it, deleting children first keeps this independent of FK enforcement (SQLite
  // enforces foreign keys only when the connection turns them on).
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.smsCodes).where(lt(sqliteSchema.smsCodes.expiresAt, dayAgo)),
    postgres: (db) => db.delete(postgresSchema.smsCodes).where(lt(postgresSchema.smsCodes.expiresAt, dayAgo)),
    mysql: (db) => db.delete(mysqlSchema.smsCodes).where(lt(mysqlSchema.smsCodes.expiresAt, dayAgo)),
  });
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.mfaChallenges).where(lt(sqliteSchema.mfaChallenges.expiresAt, dayAgo)),
    postgres: (db) => db.delete(postgresSchema.mfaChallenges).where(lt(postgresSchema.mfaChallenges.expiresAt, dayAgo)),
    mysql: (db) => db.delete(mysqlSchema.mfaChallenges).where(lt(mysqlSchema.mfaChallenges.expiresAt, dayAgo)),
  });
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.loginAttempts).where(lt(sqliteSchema.loginAttempts.at, dayAgo)),
    postgres: (db) => db.delete(postgresSchema.loginAttempts).where(lt(postgresSchema.loginAttempts.at, dayAgo)),
    mysql: (db) => db.delete(mysqlSchema.loginAttempts).where(lt(mysqlSchema.loginAttempts.at, dayAgo)),
  });
  await runDialect(appDb, {
    sqlite: (db) => db.delete(sqliteSchema.authEvents).where(lt(sqliteSchema.authEvents.at, authEventsCutoffMs)),
    postgres: (db) => db.delete(postgresSchema.authEvents).where(lt(postgresSchema.authEvents.at, authEventsCutoffMs)),
    mysql: (db) => db.delete(mysqlSchema.authEvents).where(lt(mysqlSchema.authEvents.at, authEventsCutoffMs)),
  });
}
