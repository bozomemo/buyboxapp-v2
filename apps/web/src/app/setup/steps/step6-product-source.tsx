'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, StatusBanner, StepFooter, StepStopNotice, TextInput } from '@/components/ui';

type SourceCode = 'manual' | 'excel' | 'marketplaceListing';

interface PreviewRow {
  baseStockCode: string;
  name: string;
  unitCost: string;
  unitStock: number;
}

const MAPPING_FIELDS = ['baseStockCode', 'name', 'unitCost', 'unitStock'] as const;

export function Step6ProductSource({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [source, setSource] = useState<SourceCode>('manual');
  const [mapping, setMapping] = useState({
    baseStockCode: 'KODU',
    name: 'ADI',
    unitCost: 'Standart_Maliyet',
    unitStock: 'TOPLAM MIKTAR',
  });
  const [preview, setPreview] = useState<{ ok: boolean; rows?: PreviewRow[]; error?: string } | undefined>();
  const [saved, setSaved] = useState(false);
  // Set when `/api/product-source/config` already had a configuration on mount (doc 15 §6, Phase
  // 6) — never re-ask what is already configured. An Excel source's file itself is never
  // persisted (only the column mapping is), so a prefilled Excel source still needs the file
  // re-attached to preview or re-save; it is at least not asked to retype the column mapping.
  const [savedByServer, setSavedByServer] = useState(false);
  const [touchedMapping, setTouchedMapping] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/product-source/config');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          configured: boolean;
          sourceCode?: SourceCode;
          sourceConfig?: { columnMapping?: Partial<typeof mapping> };
        };
        if (cancelled || !data.configured) return;
        if (data.sourceCode) setSource(data.sourceCode);
        if (data.sourceConfig?.columnMapping) {
          setMapping((m) => ({ ...m, ...data.sourceConfig?.columnMapping }));
        }
        setSavedByServer(true);
      } catch {
        // No prefill — falls back to the manual default, same as before this read existed.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function mappingError(field: (typeof MAPPING_FIELDS)[number]): string | undefined {
    if (!touchedMapping.has(field)) return undefined;
    return mapping[field].trim() === '' ? 'Sütun başlığı boş olamaz.' : undefined;
  }

  const mappingValid = MAPPING_FIELDS.every((f) => mapping[f].trim() !== '');

  async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  }

  async function testExcel() {
    const file = fileInput.current?.files?.[0];
    if (!file || !mappingValid) {
      setTouchedMapping(new Set(MAPPING_FIELDS));
      return;
    }
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
      if (res.ok) setSavedByServer(false); // now confirmed by this session's own save, not a stale prefill
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {savedByServer && (
        <StatusBanner
          ok
          message="Bir ürün kaynağı zaten yapılandırılmış — aşağıda gösteriliyor. Değiştirmek istemiyorsanız doğrudan İleri'ye geçebilirsiniz."
        />
      )}
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
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx"
            className="text-sm"
            aria-label="Excel dosyası seç"
          />
          {savedByServer && (
            <p className="text-xs text-(--color-muted)">
              Sütun eşlemesi daha önce kaydedilenden dolduruldu; dosyanın kendisi saklanmaz — önizlemek veya
              yeniden kaydetmek için Excel dosyasını burada yeniden seçmeniz gerekir.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {MAPPING_FIELDS.map((field) => (
              <Field key={field} label={`${field} sütun başlığı`} error={mappingError(field)}>
                <TextInput
                  value={mapping[field]}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                  onBlur={() => setTouchedMapping((prev) => new Set(prev).add(field))}
                />
              </Field>
            ))}
          </div>
          <Button variant="secondary" type="button" onClick={() => void testExcel()} disabled={busy}>
            {busy ? 'Önizleniyor…' : 'İlk 20 Satırı Önizle'}
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
          Bu kaynak, ilanlar içe aktarıldıktan sonra devreye girer; şu an önizlenecek veri yok. Birim maliyet
          daha sonra manuel olarak veya başka bir kaynakla girilmelidir.
        </p>
      )}

      <div>
        <Button
          type="button"
          onClick={() => void save()}
          disabled={busy || (source === 'excel' && !preview?.ok)}
        >
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
      {saved && <StatusBanner ok message="Ürün kaynağı yapılandırması kaydedildi." />}
      <StepStopNotice>
        Kaydetmeden çıkarsanız ürün kaynağı "Manuel" varsayılanında kalır — stoklar Stok ekranından tek tek
        eklenir; Excel veya pazaryeri kaynağını daha sonra bu adıma dönerek de kurabilirsiniz.
      </StepStopNotice>
      <StepFooter onBack={onBack} onNext={onDone} nextDisabled={!saved && !savedByServer} />
    </div>
  );
}
