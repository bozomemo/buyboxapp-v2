/**
 * One marketplace connection test, shared by the "Bağlantıyı Test Et" button and both credential
 * save routes — the wizard's and Ayarlar → Pazaryerleri's.
 *
 * Saving now runs it too (product owner, 2026-11-19: credentials that fail their test are not
 * saved). Before, the wizard stored them and said "Kimlik bilgileri şifreli olarak kaydedildi."
 * beneath the red failure, and every job then ran against a login the marketplace refuses.
 *
 * A real read-only call (Trendyol's approved-products page, Hepsiburada's listings page); it never
 * submits a price.
 */
import {
  HepsiburadaAdapter,
  HepsiburadaCredentialsSchema,
  TrendyolAdapter,
  TRENDYOL_STAGE_BASE_URL,
  type Credentials,
} from '@buybox/adapters';
import { marketplaceCredentialsKey } from '@buybox/shared';
import { mergeCredentials, missingTrendyolCredentials } from '@/lib/credential-merge';
import { describeConnectionFailure, hepsiburadaFieldLabel } from '@/lib/connection-failure';
import { getSecretStore } from '@/lib/server/secrets';

export type MarketplaceCode = 'trendyol' | 'hepsiburada';

export interface ConnectionVerdict {
  readonly ok: boolean;
  /** A Turkish sentence, shown to the operator as it is. */
  readonly message: string;
}

/** What is stored for `code`, or an empty record. */
export async function storedCredentials(code: MarketplaceCode): Promise<Record<string, string>> {
  const raw = await getSecretStore().get(marketplaceCredentialsKey(code));
  return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

/**
 * The credentials an action would use: what the operator typed over what is stored (blank fields
 * keep their stored value — `mergeCredentials`).
 */
export async function resolveCredentials(
  code: MarketplaceCode,
  posted: Record<string, string> | undefined,
): Promise<Record<string, string>> {
  return mergeCredentials(await storedCredentials(code), posted);
}

/** True when saving `merged` would change what is stored. */
export function credentialsChanged(stored: Record<string, string>, merged: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(stored), ...Object.keys(merged)]);
  return [...keys].some((k) => (stored[k] ?? '') !== (merged[k] ?? ''));
}

export async function testMarketplaceConnection(
  code: MarketplaceCode,
  credentials: Record<string, string>,
): Promise<ConnectionVerdict> {
  try {
    if (code === 'trendyol') {
      const missing = missingTrendyolCredentials(credentials);
      if (missing.length > 0) return { ok: false, message: `Eksik bilgi. Doldurun: ${missing.join(', ')}` };
      const adapter = new TrendyolAdapter({
        credentials: {
          apiKey: credentials.apiKey ?? '',
          apiSecret: credentials.apiSecret ?? '',
          sellerId: credentials.sellerId ?? '',
          userAgentSuffix: credentials.userAgentSuffix || 'SelfIntegration',
        },
        // Stage is the same host swap the worker's buildAdapter applies (api-references §1.1).
        baseUrl: credentials.environment === 'stage' ? TRENDYOL_STAGE_BASE_URL : undefined,
      });
      const result = await adapter.testConnection(credentials as unknown as Credentials);
      // The adapter's own success detail is English ("Connected as seller …").
      return result.ok
        ? { ok: true, message: 'Bağlantı başarılı.' }
        : { ok: false, message: describeConnectionFailure('trendyol', result.error) };
    }

    const parsed = HepsiburadaCredentialsSchema.safeParse(credentials);
    if (!parsed.success) {
      return {
        ok: false,
        message: `Eksik veya geçersiz alan: ${parsed.error.issues.map((i) => hepsiburadaFieldLabel(i.path.join('.'))).join(', ')}`,
      };
    }
    const adapter = new HepsiburadaAdapter({
      credentials: parsed.data,
      environment: credentials.environment === 'sit' ? 'sit' : 'production',
    });
    const result = await adapter.testConnection(parsed.data as unknown as Credentials);
    return result.ok
      ? { ok: true, message: 'Bağlantı başarılı.' }
      : { ok: false, message: describeConnectionFailure('hepsiburada', result.error) };
  } catch (error) {
    return { ok: false, message: describeConnectionFailure(code, error instanceof Error ? error.message : String(error)) };
  }
}
