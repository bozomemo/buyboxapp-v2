// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The customer reads the screens; the specification is ours. A screen that says "(doc 02 §3)" or
 * "(api-references §2.4)" points the reader at a document they do not have (2026-11-19
 * walkthrough: the setup wizard alone cited five). Comments may cite the spec freely — this
 * looks only at code, after comments are removed.
 */
const SRC = path.dirname(fileURLToPath(import.meta.url));
const SPEC_REF = /\bdoc \d{2}\b|\bdocs\/|api-references|\bR-[A-Z]{2,4}-\d+|\bFaz \d+\b/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [full] : [];
  });
}

/** Removes block comments (JSX `{/* … *\/}` included) and line comments, keeping line numbers. */
export function stripComments(source: string): string {
  const blanked = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // A `//` that is not inside a string or a URL (`https://`).
  return blanked.replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');
}

describe('screens do not cite the specification', () => {
  it('stripComments keeps code and drops comments', () => {
    expect(stripComments('a // doc 02 §3\n{/* doc 03 */}b "https://x"')).toBe('a \n{            }b "https://x"');
  });

  it('holds for every component under src/', () => {
    const offenders = sources(SRC).flatMap((file) =>
      stripComments(readFileSync(file, 'utf8'))
        .split('\n')
        .flatMap((line, i) => (SPEC_REF.test(line) ? [`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * The same reader, the same rule for the code's own names: a source file ("brand-reports.ts"),
 * a table ("competitor_observations") or a job's class name ("ScrapeCompetitors") shown in a
 * `<code>` tells the customer nothing (2026-11-19 walkthrough). The labels the customer meets
 * elsewhere — the form's own "sellerId", an Excel column header, the LICENSE_TOKEN setting the
 * installer writes — are not internal names and pass.
 */
const INTERNAL_NAME = /^(?:[\w-]+\.(?:ts|tsx|js|json)|[a-z]+(?:_[a-z]+)+|[A-Z][a-z]+(?:[A-Z][a-z]+)+)$/;

describe('screens do not show the code’s own names', () => {
  it('holds for every <code> in a component', () => {
    const offenders = sources(SRC).flatMap((file) =>
      [...stripComments(readFileSync(file, 'utf8')).matchAll(/<code>([^<{]+)<\/code>/g)]
        .map((m) => m[1]!.trim())
        .filter((name) => INTERNAL_NAME.test(name))
        .map((name) => `${path.relative(SRC, file)}: ${name}`),
    );
    expect(offenders).toEqual([]);
  });
});
