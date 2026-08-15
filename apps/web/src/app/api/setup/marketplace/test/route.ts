import { NextResponse } from 'next/server';
import {
  HepsiburadaAdapter,
  HepsiburadaCredentialsSchema,
  TrendyolAdapter,
  type Credentials,
} from '@buybox/adapters';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    marketplaceCode: 'trendyol' | 'hepsiburada';
    credentials: Record<string, string>;
  };

  try {
    if (body.marketplaceCode === 'trendyol') {
      const adapter = new TrendyolAdapter({
        credentials: {
          apiKey: body.credentials.apiKey ?? '',
          apiSecret: body.credentials.apiSecret ?? '',
          sellerId: body.credentials.sellerId ?? '',
          userAgentSuffix: body.credentials.userAgentSuffix || 'SelfIntegration',
        },
      });
      const result = await adapter.testConnection(body.credentials as unknown as Credentials);
      return NextResponse.json({
        ok: result.ok,
        message: result.ok ? (result.detail ?? 'Bağlantı başarılı.') : result.error,
      });
    }

    // Hepsiburada (doc 12 Phase 4.4, api-references §2.2/§2.4): a real read-only call —
    // GET /listings/merchantid/{id}?limit=1 — through the adapter built in Phase 4.4. This is
    // a connection test only; it never calls submitPriceChanges (CLAUDE.md: no price change,
    // ever, without an explicit separate operator action gated by the kill switches).
    const parsed = HepsiburadaCredentialsSchema.safeParse(body.credentials);
    if (!parsed.success) {
      return NextResponse.json({
        ok: false,
        message: `Eksik veya geçersiz alan: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      });
    }
    const adapter = new HepsiburadaAdapter({ credentials: parsed.data, environment: 'production' });
    const result = await adapter.testConnection(parsed.data as unknown as Credentials);
    return NextResponse.json({ ok: result.ok, message: result.ok ? 'Bağlantı başarılı.' : result.error });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}
