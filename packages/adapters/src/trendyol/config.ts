/**
 * Trendyol credentials and adapter configuration (docs/api-references.md §1.2, §1.1).
 * Verified against https://developers.trendyol.com/v2.0/docs/authorization on 2026-08-12.
 */
import { z } from 'zod';

export const TrendyolCredentialsSchema = z.object({
  /** Obtained from the seller panel → Hesap Bilgilerim → Entegrasyon Bilgileri (master user only). */
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  sellerId: z.string().min(1),
  /**
   * `User-Agent` is mandatory — missing it returns 403 (api-references §1.2). Self-integrated:
   * `{sellerId} - SelfIntegration`. Via an integrator: `{sellerId} - {IntegratorName}` (max 30
   * alphanumeric chars). This holds only the suffix; the adapter prefixes `{sellerId} - `.
   */
  userAgentSuffix: z.string().min(1).max(30).default('SelfIntegration'),
});

export type TrendyolCredentials = z.infer<typeof TrendyolCredentialsSchema>;

export const TRENDYOL_PRODUCTION_BASE_URL = 'https://apigw.trendyol.com/integration';
export const TRENDYOL_STAGE_BASE_URL = 'https://stageapigw.trendyol.com/integration';

export interface TrendyolAdapterConfig {
  readonly credentials: TrendyolCredentials;
  readonly baseUrl?: string;
  /** Injectable for tests — a fixture-backed fake, never a live call (doc 10 §3, §10). */
  readonly fetchFn?: typeof fetch;
}
