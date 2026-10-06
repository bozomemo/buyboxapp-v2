/**
 * The break-glass command (docs/18-authentication-and-access.md §8.3).
 *
 *   node scripts/admin.mjs list-users
 *   node scripts/admin.mjs create-admin <username>
 *   node scripts/admin.mjs reset-password <username>
 *   node scripts/admin.mjs reset-mfa <username>
 *   node scripts/admin.mjs unlock <username>
 *
 * It asks for no password of its own. Being able to run it — to read the data directory and its
 * environment — *is* the credential: access to the machine is the root of trust (doc 18 §2),
 * which is why the server's SSH access matters (doc 14 §13.3). Every command writes a sign-in
 * log row with actor `cli`.
 *
 * Reads the same bootstrap environment as the service: the process environment first, then the
 * first `.env.local` found in `BUYBOX_DATA_DIR`, the working directory, or — in a development
 * checkout — `apps/web`. On an installed server run it from the data directory, as the service
 * user, so the files it touches keep their owner (doc 14 §13.6):
 *
 *   Windows:  cd C:\ProgramData\BuyBox
 *             & "C:\Program Files\BuyBox\node\node.exe" "C:\Program Files\BuyBox\app\admin.mjs" list-users
 *   Linux:    cd /var/lib/buybox && sudo -u buybox /opt/buybox/node/bin/node /opt/buybox/app/admin.mjs list-users
 *
 * In a package this file ships bundled (`scripts/build-admin-cli.mjs`), so it needs nothing from
 * the repository at run time.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { appDataDir, authRepo, createDb, newId } from '@buybox/db';
import {
  CLI_ACTOR,
  FileSecretStore,
  PASSWORD_POLICY_MESSAGES,
  ROLE_LABELS,
  base32Encode,
  checkPasswordPolicy,
  hashPassword,
  normaliseUsername,
  totpPendingSecretKey,
  totpSecretKey,
} from '@buybox/shared';

/** A development checkout's web app; unused, and possibly nonexistent, in a package. */
const checkoutWebDir = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'apps', 'web');

/**
 * The environment, with the first `.env.local` found filling what it does not set. Returns the
 * directory that file came from: relative paths in it are relative to that directory, which is
 * the one the service or the setup wizard wrote it from.
 */
function loadEnv() {
  const env = { ...process.env };
  const candidates = [env.BUYBOX_DATA_DIR, process.cwd(), checkoutWebDir].filter((dir) => dir && dir.trim() !== '');
  const dir = candidates.find((candidate) => existsSync(path.join(candidate, '.env.local')));
  if (dir === undefined) return { env, envDir: undefined };
  for (const line of readFileSync(path.join(dir, '.env.local'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && env[match[1]] === undefined) env[match[1]] = match[2].trim();
  }
  return { env, envDir: dir };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// One reader for the whole run. A reader per question loses input piped on stdin: the first one
// buffers every line and takes them with it when it closes, and the next question waits forever.
let reader;
let lines;

async function ask(question, { hidden = false } = {}) {
  if (reader === undefined) {
    reader = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });
    lines = reader[Symbol.asyncIterator]();
  }
  process.stdout.write(question);
  // Echo nothing while a password is typed: it must not land in a terminal scrollback.
  if (hidden) reader._writeToOutput = () => {};
  const { value, done } = await lines.next();
  if (hidden) {
    delete reader._writeToOutput;
    process.stdout.write('\n');
  }
  return done ? '' : value;
}

/** 16 base32 characters — 80 bits, typeable, and shown once. */
function temporaryPassword() {
  return base32Encode(randomBytes(10)).toLowerCase();
}

const [command, rawUsername] = process.argv.slice(2);
const COMMANDS = ['list-users', 'create-admin', 'reset-password', 'reset-mfa', 'unlock'];
if (!COMMANDS.includes(command ?? '')) {
  fail(`Usage: node scripts/admin.mjs <${COMMANDS.join('|')}> [username]`);
}

const { env, envDir } = loadEnv();
if (!env.DATABASE_URL) {
  fail('No DATABASE_URL. Run this from the data directory (it holds .env.local), or set DATABASE_URL.');
}
// Relative paths in `.env.local` are relative to the directory it lives in (see migrate.mjs).
if (envDir !== undefined) process.chdir(envDir);

const appDb = createDb(env.DATABASE_URL);
const nowMs = Date.now();
const meta = { ip: null, userAgent: 'scripts/admin.mjs' };

async function log(event, userId, detail) {
  await authRepo.recordAuthEvent(appDb, {
    id: newId(),
    at: Date.now(),
    event,
    userId,
    actor: CLI_ACTOR,
    ip: meta.ip,
    userAgent: meta.userAgent,
    detail: detail === undefined ? null : JSON.stringify(detail),
  });
}

async function requireUser() {
  const username = normaliseUsername(rawUsername ?? '');
  if (username === undefined) fail('Give a valid username: 3–32 characters, a–z 0–9 . _ -');
  const user = await authRepo.getUserByUsername(appDb, username);
  if (!user) fail(`No user "${username}".`);
  return user;
}

try {
  if (command === 'list-users') {
    const users = await authRepo.listUsers(appDb);
    if (users.length === 0) console.log('No users. The install is in bootstrap mode (doc 18 §8.1).');
    for (const u of users) {
      const methods = [u.totpEnabled ? 'totp' : null, u.smsEnabled ? 'sms' : null].filter(Boolean).join('+') || '-';
      const locked = u.lockedUntil !== null && u.lockedUntil > nowMs ? ' LOCKED' : '';
      console.log(`${u.username.padEnd(24)} ${ROLE_LABELS[u.role].padEnd(18)} ${u.state.padEnd(9)} 2FA:${methods}${locked}`);
    }
  } else if (command === 'create-admin') {
    const username = normaliseUsername(rawUsername ?? '');
    if (username === undefined) fail('Give a valid username: 3–32 characters, a–z 0–9 . _ -');
    if (await authRepo.getUserByUsername(appDb, username)) fail(`"${username}" already exists. Use reset-password.`);
    const displayName = (await ask('Ad Soyad: ')).trim();
    if (displayName === '') fail('A display name is required.');
    const password = await ask('Parola: ', { hidden: true });
    const violation = checkPasswordPolicy(password, username);
    if (violation) fail(PASSWORD_POLICY_MESSAGES[violation]);
    if ((await ask('Parola (tekrar): ', { hidden: true })) !== password) fail('Parolalar aynı değil.');

    const id = newId();
    await authRepo.insertUser(appDb, {
      id,
      username,
      displayName,
      role: 'admin',
      state: 'active',
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      passwordChangedAt: nowMs,
      totpEnabled: false,
      totpLastStep: null,
      totpPendingSince: null,
      phoneE164: null,
      phoneVerifiedAt: null,
      smsEnabled: false,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: nowMs,
      updatedAt: nowMs,
      createdBy: CLI_ACTOR,
      updatedBy: CLI_ACTOR,
    });
    // An install that was in bootstrap mode no longer is; its token must not outlive that.
    rmSync(path.join(appDataDir(env), 'bootstrap-token.txt'), { force: true });
    await log('user.created', id, { username, role: 'admin' });
    console.log(`Created Yönetici "${username}".`);
  } else if (command === 'reset-password') {
    const user = await requireUser();
    const temporary = temporaryPassword();
    await authRepo.updateUser(
      appDb,
      user.id,
      { passwordHash: await hashPassword(temporary), mustChangePassword: true, passwordChangedAt: nowMs, lockedUntil: null },
      { nowMs, actor: CLI_ACTOR },
    );
    await authRepo.clearLoginFailures(appDb, user.username);
    await authRepo.deleteSessionsForUser(appDb, user.id);
    await authRepo.deleteTrustedDevices(appDb, user.id);
    await log('password.reset', user.id);
    console.log(`Temporary password for "${user.username}" (shown once; they must change it at sign-in):`);
    console.log(`  ${temporary}`);
  } else if (command === 'reset-mfa') {
    const user = await requireUser();
    await authRepo.updateUser(
      appDb,
      user.id,
      { totpEnabled: false, totpLastStep: null, totpPendingSince: null, smsEnabled: false },
      { nowMs, actor: CLI_ACTOR },
    );
    await authRepo.deleteRecoveryCodes(appDb, user.id);
    await authRepo.deleteTrustedDevices(appDb, user.id);
    await authRepo.deleteSessionsForUser(appDb, user.id);
    if (env.SECRET_STORE_KEY) {
      const store = new FileSecretStore(env.SECRET_STORE_PATH ?? './data/secrets.enc.json', env.SECRET_STORE_KEY);
      await store.delete(totpSecretKey(user.id));
      await store.delete(totpPendingSecretKey(user.id));
    } else {
      console.warn('SECRET_STORE_KEY not found; the TOTP secret could not be removed from the secret store.');
    }
    await log('mfa.removed', user.id, { by: 'cli' });
    console.log(`Second factor removed for "${user.username}". A network install asks them to enrol again at sign-in.`);
  } else if (command === 'unlock') {
    const user = await requireUser();
    await authRepo.updateUser(appDb, user.id, { lockedUntil: null }, { nowMs, actor: CLI_ACTOR });
    await authRepo.clearLoginFailures(appDb, user.username);
    await log('user.unlocked', user.id);
    console.log(`Unlocked "${user.username}".`);
  }
} finally {
  reader?.close();
  await appDb.close();
}
