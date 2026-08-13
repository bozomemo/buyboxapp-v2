/**
 * Stock screen's "import from the configured source" action (doc 06 §3). Runs the same
 * `ImportStockItems` handler the scheduled worker cadence uses (packages/jobs), so a
 * UI-triggered import behaves identically to an automatic one — no separate import logic to
 * keep in sync. Preview (first 20 rows before committing) is served by the existing
 * `/api/setup/product-source/test` route, reused as-is.
 */
import { NextResponse } from 'next/server';
import { buildAdapterRegistry, importStockItems, systemClock } from '@buybox/jobs';
import { newId } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as { sourceCode: string; sourceConfig: unknown };
  const appDb = getAppDb();
  try {
    const result = await importStockItems({
      appDb,
      clock: systemClock,
      adapters: buildAdapterRegistry([]),
      correlationId: newId(),
      payload: JSON.stringify({ sourceCode: body.sourceCode, sourceConfig: body.sourceConfig }),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
