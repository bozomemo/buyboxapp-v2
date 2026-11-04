/**
 * The files the app and the updater share (docs/superpowers/specs/2026-11-04-auto-update-design.md §3).
 *
 * Files rather than database rows on purpose: the updater is a PowerShell script that runs while
 * the service — and therefore the only thing that knows how to open the database — is stopped.
 *
 *   updates\state.json    written by the app: last check and the ready release
 *   updates\request.json  written by the app when an admin presses "Şimdi kur"
 *   updates\status.json   written by apply-update.ps1: where it is, and its history
 *   updates\hold          present = pricing held (the scheduler claims nothing)
 *   updates\lock          apply-update.ps1's single-instance lock
 *   updates\<version>\    verified archives plus the signed manifest they came from
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { COMPONENT_NAMES } from '@buybox/shared';
import { z } from 'zod';

export function updatePaths(dataDir: string) {
  const dir = path.join(dataDir, 'updates');
  return {
    dir,
    state: path.join(dir, 'state.json'),
    request: path.join(dir, 'request.json'),
    status: path.join(dir, 'status.json'),
    hold: path.join(dir, 'hold'),
    lock: path.join(dir, 'lock'),
    logs: path.join(dir, 'logs'),
    versionDir: (version: string) => path.join(dir, version),
  };
}

export const UPDATE_CHECK_RESULTS = [
  'up-to-date',
  'ready',
  'signature-missing',
  'signature-invalid',
  'manifest-invalid',
  'download-failed',
  'network-error',
  'disabled',
] as const;
export type UpdateCheckResult = (typeof UPDATE_CHECK_RESULTS)[number];

export const UpdateStateSchema = z.object({
  lastCheckAt: z.string().nullable(),
  lastResult: z.enum(UPDATE_CHECK_RESULTS),
  lastError: z.string().nullable(),
  ready: z
    .object({
      version: z.string(),
      notes: z.string(),
      downloadBytes: z.number().int().nonnegative(),
      components: z.array(z.enum(COMPONENT_NAMES)),
    })
    .nullable(),
});
export type UpdateState = z.infer<typeof UpdateStateSchema>;

export const UPDATE_PHASES = ['idle', 'running', 'succeeded', 'rolled-back', 'aborted', 'manual-intervention-required'] as const;

export const UpdateStatusSchema = z.object({
  phase: z.enum(UPDATE_PHASES),
  step: z.string().nullable(),
  history: z.array(
    z.object({
      at: z.string(),
      from: z.string(),
      to: z.string(),
      outcome: z.string(),
      reason: z.string().nullable(),
    }),
  ),
});
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>;

export const UpdateRequestSchema = z.object({
  version: z.string(),
  requestedBy: z.string(),
  requestedAt: z.string(),
});
export type UpdateRequest = z.infer<typeof UpdateRequestSchema>;

/**
 * `undefined` for a missing, unreadable or schema-invalid file — every caller treats those alike,
 * as "nothing recorded". Tolerates the UTF-8 BOM Windows PowerShell 5.1 writes.
 */
/** Drops a leading byte-order mark (U+FEFF), which `JSON.parse` rejects. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function readJsonFile<T>(file: string, schema: z.ZodType<T>): T | undefined {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const parsed = schema.safeParse(JSON.parse(stripBom(text)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Write-then-rename, so a reader (or the other process) never sees half a file. */
export function writeJsonFileAtomic(file: string, value: unknown): void {
  const temporary = `${file}.tmp-${randomBytes(4).toString('hex')}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
}
