/**
 * Stock screen data (doc 06 §3) — the joined grid plus the enabled marketplaces the "TY/HB
 * Çarpan" and "TY/HB Oto BB" columns need. Manual add of a single item lives here too
 * (doc 06 §3 "Actions: add a stock item manually").
 */
import { NextResponse } from 'next/server';
import { configRepo, stockRepo } from '@buybox/db';
import { Money } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';

export async function GET() {
  const appDb = getAppDb();
  const [grid, marketplaces] = await Promise.all([
    stockRepo.listStockGrid(appDb),
    configRepo.listMarketplaces(appDb),
  ]);
  return NextResponse.json({
    marketplaces: marketplaces.map((m) => ({ code: m.code, displayName: m.displayName })),
    items: grid.map((item) => ({
      baseStockCode: item.baseStockCode,
      name: item.name,
      unitCost: item.unitCost.toString(),
      unitStock: item.unitStock,
      sourceCode: item.sourceCode,
      prefs: item.prefs,
      offeredStock: item.offeredStock,
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    baseStockCode: string;
    name: string;
    unitCost: string;
    unitStock: number;
  };
  const appDb = getAppDb();
  const nowMs = Date.now();
  try {
    await stockRepo.upsertStockItem(appDb, {
      baseStockCode: body.baseStockCode,
      name: body.name,
      unitCost: Money.fromMajorUnitsString(body.unitCost).toKurus(),
      unitStock: body.unitStock,
      sourceCode: 'manual',
      sourceRef: null,
      costUpdatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
