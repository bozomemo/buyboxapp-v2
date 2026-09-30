// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, runMigrations } from '@buybox/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signIn } from '@/lib/server/auth/test-auth';
import { routePermission } from '@/lib/server/auth/guard';

/**
 * Every handler that reads a JSON body answers a body that is not JSON with a 4xx, never a 500
 * (2026-09-25: 48 routes threw `SyntaxError` into a 500). Walks the route tree rather than
 * listing routes by hand, so a route added later is held to the same rule without anyone
 * remembering to add it here.
 */
const API_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const METHODS = ['POST', 'PATCH', 'PUT'] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

const readsJson = routeFiles(API_DIR).filter((file) =>
  /request\.json\(|readJsonBody|readJsonObject/.test(readFileSync(file, 'utf8')),
);

let dir: string;
/**
 * Signed in as a Yönetici. Without it every guarded route answers 401 before reading the body,
 * which is a 4xx and would pass this test while testing nothing (doc 18 §7.2).
 */
let cookie: string;
const savedEnv = { ...process.env };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'buybox-invalid-json-'));
  const dbFile = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.SECRET_STORE_KEY = 'test-key';
  process.env.SECRET_STORE_PATH = path.join(dir, 'secrets.enc.json');
  const migrating = createDb(`file:${dbFile}`, 'sqlite');
  await runMigrations(migrating);
  cookie = await signIn(migrating);
  migrating.close();
}, 30_000);

afterAll(() => {
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = undefined;
  globalThis.__buyboxAppDbUrl = undefined;
  process.env = { ...savedEnv };
  rmSync(dir, { recursive: true, force: true });
});

describe('a body that is not JSON is a 4xx on every route that reads one', () => {
  it('finds the routes', () => {
    expect(readsJson.length).toBeGreaterThan(40);
  });

  for (const file of readsJson) {
    const name = path.relative(API_DIR, file).replace(/\\/g, '/');
    it(name, async () => {
      const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
      for (const method of METHODS) {
        const handler = mod[method];
        if (typeof handler !== 'function') continue;
        const request = new Request('http://localhost/api/x?cardId=x&id=x', {
          method,
          headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost' },
          body: 'not json',
        });
        const params = { params: Promise.resolve({ id: 'x', marketplace: 'trendyol', ref: 'x', code: 'x' }) };
        const response = (await handler(request, params)) as Response;
        expect(response.status, `${method} ${name}`).toBeGreaterThanOrEqual(400);
        expect(response.status, `${method} ${name}`).toBeLessThan(500);
        // Guarded routes only: the sign-in and bootstrap routes check their own credentials first,
        // and refusing a stranger before reading the body is their job.
        if (routePermission(handler) !== undefined) {
          expect([401, 403], `${method} ${name} must reach the body, not stop at the guard`).not.toContain(response.status);
        }
      }
    });
  }
});
