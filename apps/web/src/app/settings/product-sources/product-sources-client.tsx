'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, StatusBanner, TextInput } from '../../setup/ui';

type SourceCode = 'manual' | 'excel' | 'marketplaceListing';

interface PreviewRow {
  baseStockCode: string;
  name: string;
  unitCost: string;
  unitStock: number;
}

export function ProductSourcesClient() {
  const [source, setSource] = useState<SourceCode>('manual');
  const [configured, setConfigured] = useState(false);
  const [mapping, setMapping] = useState({
    baseStockCode: 'KODU',
    name: 'ADI',
    unitCost: 'Standart_Maliyet',
    unitStock: 'TOPLAM MIKTAR',
  });
  const [preview, setPreview] = useState<{ ok: boolean; rows?: PreviewRow[]; error?: string } | undefined>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/product-source/config')
      .then((r) => r.json())
      .then((data: { configured: boolean; sourceCode?: SourceCode }) => {
        setConfigured(data.configured);
        if (data.sourceCode) setSource(data.sourceCode);
      })
      .catch(() => undefined);
  }, []);

  async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  }

  async function testExcel() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setPreview(undefined);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch('/api/setup/product-source/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCode: 'excel', sourceConfig: { fileBase64, columnMapping: mapping } }),
      });
      const data = (await res.json()) as { ok: boolean; rows?: PreviewRow[]; error?: string };
      setPreview(data);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      let sourceConfig: unknown = {};
      if (source === 'excel') {
        const file = fileInput.current?.files?.[0];
        if (!file) {
          setBusy(false);
          return;
        }
        sourceConfig = { fileBase64: await fileToBase64(file), columnMapping: mapping };
      }
      const res = await fetch('/api/setup/product-source/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCode: source, sourceConfig }),
      });
      setSaved(res.ok);
      setConfigured(res.ok);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-(--color-muted)">
        {configured ? 'Şu anda yapılandırılmış bir kaynak var.' : 'Henüz bir ürün kaynağı yapılandırılmadı.'}
      </p>
      <Field label="Ürün Kaynağı">
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value as SourceCode);
            setPreview(undefined);
            setSaved(false);
          }}
          className="rounded border border-(--color-border) px-3 py-1.5 text-sm"
        >
          <option value="manual">Manuel (Stok ekranından tek tek eklenir)</option>
          <option value="excel">Excel</option>
          <option value="marketplaceListing">Pazaryeri listelerinden</option>
        </select>
      </Field>

      {source === 'excel' && (
        <div className="flex flex-col gap-3 rounded border border-(--color-border) p-4">
          <input ref={fileInput} type="file" accept=".xlsx" className="text-sm" />
          <div className="grid grid-cols-2 gap-3">
            {(['baseStockCode', 'name', 'unitCost', 'unitStock'] as const).map((field) => (
              <Field key={field} label={`${field} sütun başlığı`}>
                <TextInput
                  value={mapping[field]}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          <Button variant="secondary" type="button" onClick={() => void testExcel()} disabled={busy}>
            İlk 20 Satırı Önizle
          </Button>
          {preview?.ok && preview.rows && (
            <div className="max-h-64 overflow-auto text-xs">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left">
                    <th className="border-b p-1">Stok Kodu</th>
                    <th className="border-b p-1">Ad</th>
                    <th className="border-b p-1">Birim Fiyat</th>
                    <th className="border-b p-1">Stok</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="border-b p-1">{r.baseStockCode}</td>
                      <td className="border-b p-1">{r.name}</td>
                      <td className="border-b p-1">{r.unitCost}</td>
                      <td className="border-b p-1">{r.unitStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview && !preview.ok && (
            <StatusBanner ok={false} message={preview.error ?? 'Önizleme başarısız.'} />
          )}
        </div>
      )}

      {source === 'marketplaceListing' && (
        <p className="text-sm text-(--color-muted)">
          Bu kaynak, ilanlar içe aktarıldıktan sonra devreye girer; şu an önizlenecek veri yok.
        </p>
      )}

      <div>
        <Button
          type="button"
          onClick={() => void save()}
          disabled={busy || (source === 'excel' && !preview?.ok)}
        >
          Kaydet
        </Button>
      </div>
      {saved && <StatusBanner ok message="Ürün kaynağı yapılandırması kaydedildi." />}

      <div className="mt-4 rounded border border-dashed border-(--color-border) p-4">
        <h3 className="font-semibold text-(--color-muted)">ERP Entegrasyonu</h3>
        <p className="mt-1 text-sm text-(--color-muted)">Yakında.</p>
      </div>
    </div>
  );
}
