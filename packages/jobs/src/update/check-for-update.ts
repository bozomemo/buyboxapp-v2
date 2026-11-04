/**
 * Finds, verifies and downloads a newer release (docs/superpowers/specs/2026-11-04-auto-update-design.md §5.1).
 *
 * Reporting-only in the sense CLAUDE.md gives the competitor sources: nothing in the pricing
 * path waits on it, and a failure is recorded in `state.json` and the run ends. It installs
 * nothing — that is `apply-update.ps1`, started only by an admin.
 *
 * It sends no licence id and nothing that identifies the customer; the user agent names the
 * product version and the purpose, nothing more.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  compareVersions,
  componentsToDownload,
  InstalledComponentsSchema,
  UpdateManifestSchema,
  verifyManifestSignature,
  type ComponentName,
  type UpdateManifest,
} from '@buybox/shared';
import { readJsonFile, updatePaths, UpdateStateSchema, writeJsonFileAtomic, type UpdateCheckResult, type UpdateState } from './update-files.js';

/** A manifest is a few hundred bytes; anything this large is not one. */
export const MANIFEST_MAX_BYTES = 64 * 1024;

export interface CheckForUpdateDeps {
  readonly dataDir: string;
  readonly installDir: string;
  readonly currentVersion: string;
  /** Empty disables checking altogether. */
  readonly manifestUrl: string;
  readonly publicKeysPem: readonly string[];
  readonly fetch: typeof fetch;
  readonly now: () => Date;
}

class CheckFailure extends Error {
  constructor(
    readonly result: UpdateCheckResult,
    message: string,
  ) {
    super(message);
  }
}

const VERSION_DIR = /^\d+\.\d+\.\d+$/;

export async function checkForUpdate(deps: CheckForUpdateDeps): Promise<UpdateState> {
  const paths = updatePaths(deps.dataDir);
  mkdirSync(paths.dir, { recursive: true });
  const previous = readJsonFile(paths.state, UpdateStateSchema);
  const headers = { 'User-Agent': `BuyBox/${deps.currentVersion} update-check` };

  const finish = (state: UpdateState): UpdateState => {
    writeJsonFileAtomic(paths.state, state);
    return state;
  };
  const base = { lastCheckAt: deps.now().toISOString(), lastError: null };

  if (deps.manifestUrl === '') return finish({ ...base, lastResult: 'disabled', ready: null });

  try {
    const manifestBytes = await fetchSmall(deps, deps.manifestUrl, headers);
    const sigResponse = await deps.fetch(`${deps.manifestUrl}.sig`, { headers, redirect: 'follow' });
    if (sigResponse.status === 404) throw new CheckFailure('signature-missing', 'Sürümün imza dosyası (update.json.sig) yok.');
    if (!sigResponse.ok) throw new CheckFailure('network-error', `İmza dosyası alınamadı (HTTP ${sigResponse.status}).`);
    const signature = (await sigResponse.text()).trim();

    if (!verifyManifestSignature(manifestBytes, signature, deps.publicKeysPem)) {
      throw new CheckFailure('signature-invalid', 'Sürüm bildiriminin imzası doğrulanamadı.');
    }
    const manifest = parseManifest(manifestBytes);

    if (compareVersions(manifest.version, deps.currentVersion) <= 0) {
      return finish({ ...base, lastResult: 'up-to-date', ready: null });
    }

    const installed = readJsonFile(path.join(deps.installDir, 'installed.json'), InstalledComponentsSchema);
    const needed = componentsToDownload(manifest, installed);
    const versionDir = paths.versionDir(manifest.version);
    mkdirSync(versionDir, { recursive: true });
    for (const name of needed) await download(deps, manifest, name, versionDir, headers);
    writeFileSync(path.join(versionDir, 'update.json'), manifestBytes);
    writeFileSync(path.join(versionDir, 'update.json.sig'), `${signature}\n`, 'ascii');

    for (const entry of readdirSync(paths.dir)) {
      if (VERSION_DIR.test(entry) && entry !== manifest.version) {
        rmSync(path.join(paths.dir, entry), { recursive: true, force: true });
      }
    }

    return finish({
      ...base,
      lastResult: 'ready',
      ready: {
        version: manifest.version,
        notes: manifest.notes,
        downloadBytes: needed.reduce((sum, name) => sum + manifest.components[name]!.size, 0),
        components: needed,
      },
    });
  } catch (error) {
    const result = error instanceof CheckFailure ? error.result : 'network-error';
    const message = error instanceof Error ? error.message : String(error);
    // A failed check says nothing about a release already downloaded and verified; keep offering it.
    return finish({ ...base, lastResult: result, lastError: message, ready: previous?.ready ?? null });
  }
}

async function fetchSmall(deps: CheckForUpdateDeps, url: string, headers: Record<string, string>): Promise<Buffer> {
  const response = await deps.fetch(url, { headers, redirect: 'follow' });
  if (!response.ok) throw new CheckFailure('network-error', `Sürüm bildirimi alınamadı (HTTP ${response.status}).`);
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MANIFEST_MAX_BYTES) throw new CheckFailure('manifest-invalid', 'Sürüm bildirimi beklenenden büyük.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MANIFEST_MAX_BYTES) throw new CheckFailure('manifest-invalid', 'Sürüm bildirimi beklenenden büyük.');
  return bytes;
}

function parseManifest(bytes: Buffer): UpdateManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new CheckFailure('manifest-invalid', 'Sürüm bildirimi JSON değil.');
  }
  const parsed = UpdateManifestSchema.safeParse(raw);
  if (!parsed.success) throw new CheckFailure('manifest-invalid', `Sürüm bildirimi geçersiz: ${parsed.error.issues[0]?.message ?? ''}`);
  return parsed.data;
}

function fileSha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Streams to `<name>.zip.part`, hashing as it goes; renamed into place only on a match. */
async function download(
  deps: CheckForUpdateDeps,
  manifest: UpdateManifest,
  name: ComponentName,
  versionDir: string,
  headers: Record<string, string>,
): Promise<void> {
  const component = manifest.components[name]!;
  const target = path.join(versionDir, `${name}.zip`);
  if (existsSync(target) && fileSha256(target) === component.sha256) return;

  const partial = `${target}.part`;
  try {
    const response = await deps.fetch(component.url, { headers, redirect: 'follow' });
    if (!response.ok || !response.body) {
      throw new CheckFailure('download-failed', `${name} indirilemedi (HTTP ${response.status}).`);
    }
    const hash = createHash('sha256');
    const out = createWriteStream(partial);
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      size += chunk.length;
      if (!out.write(chunk)) await new Promise<void>((resolve) => out.once('drain', () => resolve()));
    }
    await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
    if (size !== component.size || hash.digest('hex') !== component.sha256) {
      throw new CheckFailure('download-failed', `${name} arşivi doğrulanamadı (sha256 uyuşmuyor).`);
    }
    renameSync(partial, target);
  } catch (error) {
    rmSync(partial, { force: true });
    if (error instanceof CheckFailure) throw error;
    throw new CheckFailure('download-failed', `${name} indirilemedi: ${error instanceof Error ? error.message : String(error)}`);
  }
}
