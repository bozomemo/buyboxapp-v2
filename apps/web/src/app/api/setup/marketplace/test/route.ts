import { NextResponse } from 'next/server';
import {
  HepsiburadaAdapter,
  HepsiburadaCredentialsSchema,
  TrendyolAdapter,
  TRENDYOL_STAGE_BASE_URL,
  type Credentials,
} from '@buybox/adapters';
import { marketplaceCredentialsKey } from '@buybox/shared';
import { mergeCredentials, missingTrendyolCredentials } from '@/lib/credential-merge';
import { getSecretStore } from '@/lib/server/secrets';

/**
 * The credentials this test should actually use: what the operator just typed, over what is
 * already stored. See `@/lib/credential-merge` for why — an untouched form must test the
 * credentials the *jobs* use, which is the question the button is really being asked.
 */
async function resolveCredentials(
  code: 'trendyol' | 'hepsiburada',
  posted: Record<string, string> | undefined,
): Promise<Record<string, string>> {
  const raw = await getSecretStore().get(marketplaceCredentialsKey(code));
  const stored = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  return mergeCredentials(stored, posted);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    marketplaceCode: 'trendyol' | 'hepsiburada';
    credentials: Record<string, string>;
  };

  try {
    // Inside the try: reading the secret store can fail (no key, unreadable file), and the
    // client renders `message` — an unhandled 500 here would show as a blank result.
    const credentials = await resolveCredentials(body.marketplaceCode, body.credentials);

    if (body.marketplaceCode === 'trendyol') {
      // Trendyol has no credentials schema to fail on the way Hepsiburada does below, so an
      // incomplete set used to reach the API and come back as a bare HTTP status. Say which
      // field is missing instead.
      const missing = missingTrendyolCredentials(credentials);
      if (missing.length > 0) {
        return NextResponse.json({
          ok: false,
          message: `Kayıtlı kimlik bilgisi yok. Doldurun: ${missing.join(', ')}`,
        });
      }
      const adapter = new TrendyolAdapter({
        credentials: {
          apiKey: credentials.apiKey ?? '',
          apiSecret: credentials.apiSecret ?? '',
          sellerId: credentials.sellerId ?? '',
          userAgentSuffix: credentials.userAgentSuffix || 'SelfIntegration',
        },
        // Stage is the same host swap the worker's buildAdapter applies (api-references §1.1);
        // `environment` rides along in the credentials blob, same as Hepsiburada below.
        baseUrl: credentials.environment === 'stage' ? TRENDYOL_STAGE_BASE_URL : undefined,
      });
      const result = await adapter.testConnection(credentials as unknown as Credentials);
      return NextResponse.json({
        ok: result.ok,
        message: result.ok ? (result.detail ?? 'Bağlantı başarılı.') : result.error,
      });
    }

    // Hepsiburada (doc 12 Phase 4.4, api-references §2.2/§2.4): a real read-only call —
    // GET /listings/merchantid/{id}?limit=1 — through the adapter built in Phase 4.4. This is
    // a connection test only; it never calls submitPriceChanges (CLAUDE.md: no price change,
    // ever, without an explicit separate operator action gated by the kill switches).
    const parsed = HepsiburadaCredentialsSchema.safeParse(credentials);
    if (!parsed.success) {
      return NextResponse.json({
        ok: false,
        message: `Eksik veya geçersiz alan: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      });
    }
    const adapter = new HepsiburadaAdapter({
      credentials: parsed.data,
      environment: credentials.environment === 'sit' ? 'sit' : 'production',
    });
    const result = await adapter.testConnection(parsed.data as unknown as Credentials);
    return NextResponse.json({ ok: result.ok, message: result.ok ? 'Bağlantı başarılı.' : result.error });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}
