import { FileSecretStore, type ISecretStore } from '@buybox/shared';
import { getBootstrapEnv } from './db';

declare global {
  var __buyboxSecretStore: ISecretStore | undefined;
}

export function getSecretStore(): ISecretStore {
  if (!globalThis.__buyboxSecretStore) {
    const env = getBootstrapEnv();
    globalThis.__buyboxSecretStore = new FileSecretStore(env.SECRET_STORE_PATH, env.SECRET_STORE_KEY);
  }
  return globalThis.__buyboxSecretStore;
}
