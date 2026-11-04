import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readJsonFile, updatePaths, writeJsonFileAtomic } from './update-files.js';

const Schema = z.object({ a: z.number() }).strict();

describe('update files', () => {
  it('places every file under <dataDir>\\updates', () => {
    const paths = updatePaths('C:\\ProgramData\\BuyBox');
    expect(paths.dir).toBe(path.join('C:\\ProgramData\\BuyBox', 'updates'));
    expect(paths.hold).toBe(path.join(paths.dir, 'hold'));
    expect(paths.versionDir('0.2.1')).toBe(path.join(paths.dir, '0.2.1'));
  });

  it('writes atomically, leaving no temporary file behind', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'upd-'));
    const file = path.join(dir, 'state.json');
    writeJsonFileAtomic(file, { a: 1 });
    expect(readdirSync(dir)).toEqual(['state.json']);
    expect(readJsonFile(file, Schema)).toEqual({ a: 1 });
  });

  it('reads a missing file as undefined', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'upd-'));
    expect(readJsonFile(path.join(dir, 'nope.json'), Schema)).toBeUndefined();
  });

  it('reads a corrupt or schema-invalid file as undefined', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'upd-'));
    writeFileSync(path.join(dir, 'bad.json'), '{not json');
    writeFileSync(path.join(dir, 'wrong.json'), '{"a":"x"}');
    expect(readJsonFile(path.join(dir, 'bad.json'), Schema)).toBeUndefined();
    expect(readJsonFile(path.join(dir, 'wrong.json'), Schema)).toBeUndefined();
  });

  it('reads a file PowerShell wrote with a UTF-8 BOM', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'upd-'));
    writeFileSync(path.join(dir, 'bom.json'), '\uFEFF{"a":2}');
    expect(readJsonFile(path.join(dir, 'bom.json'), Schema)).toEqual({ a: 2 });
  });
});
