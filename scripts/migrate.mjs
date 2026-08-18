/**
 * Applies pending migrations to the configured database — the `npm run migrate` that
 * `startWorker`'s schema-mismatch error already told operators to run (apps/worker/src/index.ts).
 *
 * The setup wizard is the *interactive* place migrations run (doc 10 §6 step 1); this is the
 * same operation for a database that is already set up and has simply fallen behind after a
 * `git pull`. Without it the only recovery is re-entering the wizard, and the web process
 * fails with a raw "no such column" from whichever route touches the new column first — an
 * error that names a symptom rather than the fix.
 *
 * Reads `DATABASE_URL` from the environment, falling back to `apps/web/.env.local`, which is
 * where the wizard writes it (`writeBootstrapEnv`).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSchemaVersion, createDb, runMigrations } from '@buybox/db';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(repoRoot, 'apps', 'web');

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, cwd: process.cwd() };
  const envPath = path.join(webDir, '.env.local');
  if (!existsSync(envPath)) return undefined;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^DATABASE_URL=(.*)$/.exec(line.trim());
    // Relative SQLite paths in `.env.local` are relative to the web app, which is the process
    // that wrote them — resolving them against the repo root instead would silently create a
    // second, empty database rather than migrating the real one.
    if (match) return { url: match[1].trim(), cwd: webDir };
  }
  return undefined;
}

const found = readDatabaseUrl();
if (!found) {
  console.error(
    'No DATABASE_URL. Set it in the environment, or finish the setup wizard so it is written to apps/web/.env.local.',
  );
  process.exit(1);
}

process.chdir(found.cwd);
const appDb = createDb(found.url);
try {
  const before = await checkSchemaVersion(appDb);
  if (before.upToDate) {
    console.log(`Schema already up to date (${before.appliedCount}/${before.expectedCount} migrations).`);
  } else {
    console.log(`Applying migrations: ${before.appliedCount}/${before.expectedCount} applied…`);
    await runMigrations(appDb);
    const after = await checkSchemaVersion(appDb);
    if (!after.upToDate) {
      console.error(`Still behind after migrating: ${after.appliedCount}/${after.expectedCount}.`);
      process.exit(1);
    }
    console.log(`Done — ${after.appliedCount}/${after.expectedCount} migrations applied.`);
  }
} finally {
  appDb.close();
}
