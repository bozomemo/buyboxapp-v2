import { NextResponse } from 'next/server';
import { HepsiburadaAdapter, TrendyolAdapter, type Credentials } from '@buybox/adapters';

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

    // Hepsiburada: intentionally blocked (doc 12 Phase 4.4) — testConnection reports why
    // honestly rather than pretending a real read call happened.
    const adapter = new HepsiburadaAdapter();
    const result = await adapter.testConnection(body.credentials as unknown as Credentials);
    return NextResponse.json({ ok: result.ok, message: result.ok ? 'Bağlantı başarılı.' : result.error });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}
