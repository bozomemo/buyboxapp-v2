// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A `'use client'` file may import only **types** from the workspace packages. Their barrels carry
 * Node-only code — `@buybox/shared` has the file secret store (`node:fs/promises`), the others
 * have database drivers — and a value import drags it into the browser bundle, which fails only
 * when the page is built or first visited, never in a unit test that renders the component.
 * Found 2026-09-27 on `/settings/users`; this keeps it from recurring anywhere.
 */
const SRC = path.dirname(fileURLToPath(import.meta.url));
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

  /**
   * The same rule, followed into the guide's own modules (doc 19): `/rehber`'s client imported
   * `lib/guide/topic`, which value-imported `@buybox/shared`, and only `next build` failed
   * (2026-11-17, a Turbopack "does not support external modules (node:fs/promises)" panic).
   * Scoped to `lib/guide/`: `lib/format.ts` value-imports `Money` the same way and builds, so a
   * repo-wide transitive rule would flag code that works.
   */
  it('holds for the guide modules a client file imports, transitively', () => {
    const valueImports = (source: string) =>
      importStatements(source)
        .filter((s) => !/^import type /.test(s))
        .map((s) => /from '([^']+)';$/.exec(s)?.[1] ?? '');
    const resolve = (from: string, spec: string): string | null => {
      const base = spec.startsWith('@/')
        ? path.join(SRC, spec.slice(2))
        : spec.startsWith('.')
          ? path.resolve(path.dirname(from), spec)
          : null;
      if (base === null) return null;
      for (const candidate of [
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
      ]) {
        try {
          if (statSync(candidate).isFile()) return candidate;
        } catch {
          // try the next spelling
        }
      }
      return null;
    };
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      if (!/^['"]use client['"]/m.test(readFileSync(file, 'utf8'))) continue;
      const seen = new Set<string>([file]);
      const queue: { file: string; chain: string[] }[] = [{ file, chain: [path.relative(SRC, file)] }];
      while (queue.length > 0) {
        const { file: current, chain } = queue.shift()!;
        const source = readFileSync(current, 'utf8');
        for (const spec of valueImports(source)) {
          const inGuide = path.relative(SRC, current).replace(/\\/g, '/').startsWith('lib/guide/');
          if (inGuide && SERVER_PACKAGES.test(`from '${spec}'`))
            offenders.push(`${chain.join(' → ')} → ${spec}`);
          const next = resolve(current, spec);
          // Another 'use client' file is checked on its own; a server-only module is not a client import.
          if (next === null || seen.has(next) || /\.test\.tsx?$/.test(next)) continue;
          const nextSource = readFileSync(next, 'utf8');
          if (/^['"]use client['"]/m.test(nextSource) || /^import 'server-only';/m.test(nextSource)) continue;
          seen.add(next);
          queue.push({ file: next, chain: [...chain, path.relative(SRC, next)] });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
