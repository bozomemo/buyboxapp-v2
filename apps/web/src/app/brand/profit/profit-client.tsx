'use client';

/**
 * Kâr Ayarları (marka) — the inputs of the reseller profit estimate that are not per product
 * (doc 17 §8): the marketplace's fixed per-sale fee, the desi table, and the commission tariff
 * workbook. The per-product inputs — unit price and desi — are on the Stok screen.
 *
 * Reporting only: nothing here changes a price or an alarm.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from '@/components/icon';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Section,
  StatusBanner,
  TextInput,
} from '@/components/ui';
import { formatDesi } from '@/lib/desi';
import { formatDateTime, formatNumber } from '@/lib/format';
import { fileToBase64 } from '../products/import-panel';

interface BandForm {
  maxDesi: string;
  cargo: string;
  operation: string;
}

interface SettingsResponse {
  settings: {
    fixedSaleFee: string;
    desiBands: { maxDesi: number | null; cargo: string; operation: string }[];
  } | null;
  defaultFixedSaleFee: string;
}

interface Period {
  marketplaceCode: string;
  validFrom: number;
  validUntil: number;
  products: number;
  lastImportedAt: number;
}

interface TariffSummary {
  products: number;
  tariffs: number;
  matchedProducts: number;
  problemRows: number;
  periods: { validFrom: number; validUntil: number }[];
}

/** Kuruş → `12,50`, the form's own input format. */
function toInput(kurus: string): string {
  const value = BigInt(kurus);
  return `${value / 100n},${(value % 100n).toString().padStart(2, '0')}`;
}

function periodText(validFrom: number, validUntil: number): string {
  // `validUntil` is exclusive; the workbook states the last minute, so show that.
  return `${formatDateTime(validFrom)} – ${formatDateTime(validUntil - 60_000)}`;
}

export function ProfitSettingsClient() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fee, setFee] = useState('');
  const [bands, setBands] = useState<BandForm[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const [periods, setPeriods] = useState<Period[]>([]);
  const [now, setNow] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<{ base64: string; name: string } | null>(null);
  const [tariffSummary, setTariffSummary] = useState<TariffSummary | null>(null);
  const [tariffProblems, setTariffProblems] = useState<{ line: number; message: string }[]>([]);
  const [tariffNotice, setTariffNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const loadPeriods = useCallback(() => {
    fetch('/api/brand/commission-tariffs')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { periods: Period[]; now: number }) => {
        setPeriods(data.periods);
        setNow(data.now);
      })
      .catch(() => setPeriods([]));
  }, []);

  const load = useCallback(() => {
    setLoadError(null);
    fetch('/api/brand/profit-settings')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Ayarlar okunamadı (HTTP ${r.status}).`))))
      .then((data: SettingsResponse) => {
        setSaved(data.settings !== null);
        setFee(toInput(data.settings?.fixedSaleFee ?? data.defaultFixedSaleFee));
        setBands(
          data.settings
            ? data.settings.desiBands.map((band) => ({
                maxDesi: formatDesi(band.maxDesi),
                cargo: toInput(band.cargo),
                operation: toInput(band.operation),
              }))
            : [{ maxDesi: '', cargo: '', operation: '' }],
        );
        setLoaded(true);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
    loadPeriods();
  }, [loadPeriods]);

  useEffect(load, [load]);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/brand/profit-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixedSaleFee: fee, desiBands: bands }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setNotice({ ok: false, message: data.error ?? 'Kaydedilemedi.' });
        return;
      }
      setSaved(true);
      setNotice({ ok: true, message: 'Kâr ayarları kaydedildi.' });
    } finally {
      setBusy(false);
    }
  }

  async function sendTariff(confirm: boolean) {
    const file = confirm ? null : (fileInput.current?.files?.[0] ?? null);
    if (!confirm && !file) {
      setTariffNotice({ ok: false, message: 'Önce bir dosya seçin.' });
      return;
    }
    setBusy(true);
    setTariffNotice(null);
    try {
      const payload = confirm ? staged : { base64: await fileToBase64(file!), name: file!.name };
      if (!payload) {
        setTariffNotice({ ok: false, message: 'Önizleme kayboldu, dosyayı yeniden seçin.' });
        return;
      }
      const res = await fetch('/api/brand/commission-tariffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: payload.base64, fileName: payload.name, confirm }),
      });
      const data = (await res.json()) as {
        summary?: TariffSummary;
        problems?: { line: number; message: string }[];
        error?: string;
      };
      if (!res.ok) {
        setTariffNotice({ ok: false, message: data.error ?? 'Dosya okunamadı.' });
        setTariffSummary(null);
        setTariffProblems([]);
        return;
      }
      setTariffSummary(data.summary ?? null);
      setTariffProblems(data.problems ?? []);
      if (confirm) {
        setTariffNotice({
          ok: true,
          message: `${formatNumber(data.summary?.products ?? 0)} ürünün tarifesi yüklendi.`,
        });
        setStaged(null);
        if (fileInput.current) fileInput.current.value = '';
        loadPeriods();
      } else {
        setStaged(payload);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!loaded && loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!loaded) return <LoadingState message="Kâr ayarları yükleniyor…" skeletonRows={3} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kâr Ayarları"
        breadcrumb={[{ label: 'Marka Denetimi' }, { label: 'Kâr Ayarları' }]}
        description="İlanlar ekranındaki tahmini satıcı kârının girdileri: sabit satış bedeli, desi tablosu ve komisyon tarifesi. Yalnızca raporlama içindir; hiçbir fiyatı ya da alarmı değiştirmez."
      />

      <Section id="profit-costs" title="Sabit bedel ve desi tablosu" card>
        <div className="max-w-[760px] space-y-4">
          {!saved && (
            <StatusBanner
              ok={false}
              message="Henüz kaydedilmedi — kaydedilene kadar İlanlar'da kâr tahmini gösterilmez."
            />
          )}
          <Field
            label="Sabit satış bedeli (₺, her satış için)"
            hint="Trendyol'un her satıştan aldığı sabit bedel"
          >
            <TextInput value={fee} onChange={(e) => setFee(e.target.value)} className="w-32" />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium">Desi tablosu</p>
            <p className="mb-2 text-xs text-(--color-muted)">
              Her satır, üst sınırına kadar olan desiler içindir; satırlar artan sırada olmalı. Son satırın
              üst sınırını boş bırakmak &quot;üstü hepsi&quot; demektir. Kargo, satıcının ödediği kargo
              bedeli; operasyon, o koli için tahmini personel, depolama ve paketleme maliyetidir. Tutarlar KDV
              dahildir.
            </p>
            <div className="space-y-2">
              {bands.map((band, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <Field label={i === 0 ? 'Desi üst sınırı' : ''}>
                    <TextInput
                      value={band.maxDesi}
                      placeholder={i === bands.length - 1 ? 'boş = üstü hepsi' : 'ör. 5'}
                      onChange={(e) =>
                        setBands(bands.map((b, j) => (j === i ? { ...b, maxDesi: e.target.value } : b)))
                      }
                      className="w-36"
                    />
                  </Field>
                  <Field label={i === 0 ? 'Kargo (₺)' : ''}>
                    <TextInput
                      value={band.cargo}
                      placeholder="85,00"
                      onChange={(e) =>
                        setBands(bands.map((b, j) => (j === i ? { ...b, cargo: e.target.value } : b)))
                      }
                      className="w-28"
                    />
                  </Field>
                  <Field label={i === 0 ? 'Operasyon (₺)' : ''}>
                    <TextInput
                      value={band.operation}
                      placeholder="25,00"
                      onChange={(e) =>
                        setBands(bands.map((b, j) => (j === i ? { ...b, operation: e.target.value } : b)))
                      }
                      className="w-28"
                    />
                  </Field>
                  <Button
                    variant="ghost-danger"
                    size="sm"
                    icon={Trash2}
                    type="button"
                    disabled={bands.length === 1}
                    onClick={() => setBands(bands.filter((_, j) => j !== i))}
                  >
                    Kaldır
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setBands([...bands, { maxDesi: '', cargo: '', operation: '' }])}
              >
                + Satır ekle
              </Button>
            </div>
          </div>

          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
          {notice && <StatusBanner ok={notice.ok} message={notice.message} />}
        </div>
      </Section>

      <Section id="commission-tariffs" title="Komisyon tarifesi" card>
        <div className="space-y-3">
          <p className="max-w-3xl text-xs text-(--color-muted)">
            Trendyol satıcı panelindeki <strong>Komisyon Tarifeleri</strong> ekranından indirilen Excel
            dosyasını değiştirmeden yükleyin. Her ürün için fiyat kademeleri ve dönemin komisyon oranları
            okunur; ürünler Stok ekranındaki <strong>barkod</strong> ile eşleşir. Dosyada yıl yazmadığı için
            dönemin yılı yükleme tarihine göre çıkarılır — önizlemedeki tarihleri kontrol edin. Aynı dönemi
            yeniden yüklemek öncekinin yerine geçer. Tarife her satıcı için aynı kabul edilir.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Dosya" hint=".xlsx veya .csv">
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.csv,text/csv"
                onChange={() => {
                  setStaged(null);
                  setTariffSummary(null);
                  setTariffProblems([]);
                  setTariffNotice(null);
                }}
                className="w-80 text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-(--color-border) file:bg-(--color-surface) file:px-3 file:font-semibold"
              />
            </Field>
            <Button variant="secondary" type="button" disabled={busy} onClick={() => void sendTariff(false)}>
              {busy ? 'Okunuyor…' : 'Önizle'}
            </Button>
            {tariffSummary && staged && tariffSummary.tariffs > 0 && (
              <Button type="button" disabled={busy} onClick={() => void sendTariff(true)}>
                {formatNumber(tariffSummary.products)} ürünün tarifesini yükle
              </Button>
            )}
          </div>

          {tariffNotice && <StatusBanner ok={tariffNotice.ok} message={tariffNotice.message} />}

          {tariffSummary && (
            <div className="flex flex-wrap gap-4 rounded-lg border border-(--color-border) bg-(--color-bg) p-3 text-sm">
              <span>
                Ürün <strong>{formatNumber(tariffSummary.products)}</strong>
              </span>
              <span>
                Stok ürünüyle eşleşen <strong>{formatNumber(tariffSummary.matchedProducts)}</strong>
              </span>
              <span className={tariffSummary.problemRows > 0 ? 'text-(--color-warning)' : undefined}>
                Alınmayacak satır <strong>{formatNumber(tariffSummary.problemRows)}</strong>
              </span>
              <span>
                Dönem:{' '}
                <strong>
                  {tariffSummary.periods.map((p) => periodText(p.validFrom, p.validUntil)).join(' · ') || '—'}
                </strong>
              </span>
            </div>
          )}

          {tariffProblems.length > 0 && (
            <TableFrame maxHeight="16rem">
              <table className="w-full text-xs">
                <thead className={STICKY_HEAD}>
                  <tr className="text-left">
                    <th className="p-2">Satır</th>
                    <th className="p-2">Sorun</th>
                  </tr>
                </thead>
                <tbody>
                  {tariffProblems.map((problem, index) => (
                    <tr key={`${problem.line}-${index}`} className="border-t border-(--color-border)">
                      <td className="p-2 tabular-nums">{problem.line}</td>
                      <td className="p-2">{problem.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Yüklü dönemler</p>
            {periods.length === 0 ? (
              <EmptyState
                message="Henüz komisyon tarifesi yüklenmedi."
                reason="Tarife yüklenene kadar İlanlar'da kâr tahmini 'tarife yok' gösterir."
              />
            ) : (
              <TableFrame maxHeight="16rem">
                <table className="w-full text-sm">
                  <thead className={STICKY_HEAD}>
                    <tr className="text-left">
                      <th className="p-2">Dönem</th>
                      <th className="p-2 text-right">Ürün</th>
                      <th className="p-2">Durum</th>
                      <th className="p-2">Yüklendi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((period) => (
                      <tr
                        key={`${period.marketplaceCode}-${period.validFrom}`}
                        className="border-t border-(--color-border)"
                      >
                        <td className="p-2">{periodText(period.validFrom, period.validUntil)}</td>
                        <td className="p-2 text-right tabular-nums">{formatNumber(period.products)}</td>
                        <td className="p-2 text-xs">
                          {now >= period.validUntil ? (
                            <span className="text-(--color-warning)">süresi doldu</span>
                          ) : now >= period.validFrom ? (
                            <span>geçerli</span>
                          ) : (
                            <span className="text-(--color-muted)">başlamadı</span>
                          )}
                        </td>
                        <td className="p-2 text-xs text-(--color-muted)">
                          {formatDateTime(period.lastImportedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
