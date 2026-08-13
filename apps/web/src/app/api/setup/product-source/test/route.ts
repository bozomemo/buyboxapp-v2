import { NextResponse } from 'next/server';
import { ExcelProductSource } from '@buybox/adapters';

export async function POST(request: Request) {
  const body = (await request.json()) as { sourceCode: string; sourceConfig: unknown };
  if (body.sourceCode !== 'excel') {
    return NextResponse.json({ ok: false, error: 'Bu kaynak için önizleme desteklenmiyor.' });
  }
  try {
    const rows: { baseStockCode: string; name: string; unitCost: string; unitStock: number }[] = [];
    for await (const item of ExcelProductSource.fetch(body.sourceConfig)) {
      rows.push({
        baseStockCode: item.baseStockCode,
        name: item.name,
        unitCost: item.unitCost.toJSON(),
        unitStock: item.unitStock,
      });
      if (rows.length >= 20) break;
    }
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
