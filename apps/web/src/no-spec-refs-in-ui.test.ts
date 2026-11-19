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
