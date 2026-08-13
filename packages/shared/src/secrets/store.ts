/**
 * The local secret store (doc 10 §8): marketplace and ERP credentials, encrypted at rest with
 * a key derived from `SECRET_STORE_KEY` (bootstrap env — never the key itself). Deliberately
 * **not** a table in `packages/db`'s schema — CLAUDE.md's hard rule ("no credential ... in a
 * database column") is read literally here, so this store owns its own encrypted file rather
 * than reusing the app database. On a server this interface would be backed by a managed
 * secret manager instead; nothing above this interface needs to know which.
 */
import { randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ISecretStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** True once a credential has been stored under `key` — for "is this configured?" checks. */
  has(key: string): Promise<boolean>;
}

interface EncryptedEntry {
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
}

interface StoreFile {
  readonly salt: string;
  readonly entries: Record<string, EncryptedEntry>;
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

/**
 * A single JSON file of AES-256-GCM-encrypted values. Safe for concurrent reads; writes are
 * serialised through an in-process queue since this is a single-operator local install (doc 10
 * §1.1) — a multi-process deployment would swap this for a managed secret manager instead.
 */
export class FileSecretStore implements ISecretStore {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly masterKey: string,
  ) {}

  async get(key: string): Promise<string | undefined> {
    const file = await this.readFile();
    const entry = file.entries[key];
    if (!entry) return undefined;
    const derivedKey = deriveKey(this.masterKey, file.salt);
    return decrypt(entry, derivedKey);
  }

  async has(key: string): Promise<boolean> {
    const file = await this.readFile();
    return key in file.entries;
  }

  async set(key: string, value: string): Promise<void> {
    await this.enqueue(async () => {
      const file = await this.readFile();
      const derivedKey = deriveKey(this.masterKey, file.salt);
      const entry = encrypt(value, derivedKey);
      const next: StoreFile = { ...file, entries: { ...file.entries, [key]: entry } };
      await this.writeFile(next);
    });
  }

  async delete(key: string): Promise<void> {
    await this.enqueue(async () => {
      const file = await this.readFile();
      if (!(key in file.entries)) return;
      const { [key]: _removed, ...rest } = file.entries;
      await this.writeFile({ ...file, entries: rest });
    });
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(fn);
    // Swallow so a failed write doesn't poison the queue for subsequent calls.
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  private async readFile(): Promise<StoreFile> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as StoreFile;
    } catch (error) {
      if (isNotFound(error)) {
        return { salt: randomBytes(16).toString('base64'), entries: {} };
      }
      throw error;
    }
  }

  private async writeFile(file: StoreFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(file, null, 2), { mode: 0o600 });
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT';
}

function deriveKey(masterKey: string, saltB64: string): Buffer {
  return scryptSync(masterKey, Buffer.from(saltB64, 'base64'), KEY_LENGTH);
}

function encrypt(plaintext: string, key: Buffer): EncryptedEntry {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decrypt(entry: EncryptedEntry, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(entry.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(entry.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(entry.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** Constant-time compare, kept here for callers verifying a secret without decrypting it. */
export function secretsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Key convention: one JSON-serialised credentials object per marketplace. */
export function marketplaceCredentialsKey(marketplaceCode: string): string {
  return `marketplace:${marketplaceCode}:credentials`;
}

/** Key convention: one JSON-serialised config object per product source needing secrets. */
export function productSourceSecretKey(sourceCode: string): string {
  return `productSource:${sourceCode}:secrets`;
}
