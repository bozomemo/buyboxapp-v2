// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A `'use client'` file may import only **types** from the workspace packages. Their barrels carry
 * Node-only code — `@buybox/shared` has the file secret store (`node:fs/promises`), the others
 * have database drivers — and a value import drags it into the browser bundle, which fails only
 * when the page is built or first visited, never in a unit test that renders the component.
 * Found 2026-09-27 on `/settings/users`; this keeps it from recurring anywhere.
 */
const SRC = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SERVER_PACKAGES = /from '@buybox\/(shared|db|jobs|adapters|core|worker)'/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Whole import statements, including multi-line ones. */
function importStatements(source: string): string[] {
  return source.match(/^import[\s\S]*?from '[^']+';/gm) ?? [];
}

describe('client components import only types from server-side packages', () => {
  it('holds for every file marked use client', () => {
    const offenders = sources(SRC).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      if (!/^['"]use client['"]/m.test(source)) return [];
      return importStatements(source)
        .filter((statement) => SERVER_PACKAGES.test(statement) && !/^import type /.test(statement))
        .map((statement) => `${path.relative(SRC, file)}: ${statement.replace(/\s+/g, ' ')}`);
    });
    expect(offenders).toEqual([]);
  });
});
