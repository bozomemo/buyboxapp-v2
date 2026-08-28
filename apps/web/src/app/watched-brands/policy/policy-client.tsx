'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pagination,
  STICKY_HEAD,
  TableFrame,
  usePagedRows,
} from '@/components/table';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format';

type Verdict = 'authorised' | 'blocked' | 'undefined';

interface SellerRow {
  marketplaceCode: string;
  sellerRef: string;
  sellerName: string;
  taxNumber: string | null;
  productCount: number;
  avgDeviationPct: number | null;
  lastSeenAt: number;
  verdict: Verdict;
  ruleId: string | null;
  fromGroupDefault: boolean;
  note: string | null;
  overriddenRuleIds: string[];
}

interface PolicyRow {
  id: string;
  watchedBrandGroupId: string;
  watchedBrandId: string | null;
  marketplaceCode: string | null;
  sellerRef: string | null;
  taxNumber: string | null;
  status: 'authorised' | 'blocked';
  note: string | null;
  createdAt: number;
  updatedAt: number;
  dormant: boolean;
}

interface Report {
  filters: { sinceMs: number; untilMs: number; watchedBrandId: string | null };
  groups: { id: string; name: string }[];
  brands: { id: string; groupId: string; label: string; marketplaceCode: string }[];
  policies: PolicyRow[];
  sellers: SellerRow[];
}

const VERDICT_LABEL: Record<Verdict, string> = {
  authorised: 'Yetkili',
  blocked: 'Yasaklı',
  undefined: 'Tanımsız',
};

/**
 * `undefined` is styled as a **neutral** state, not a warning.
 *
 * It is the state almost every seller is in, and colouring it as a problem would train the
 * operator to ignore the colour that matters. "Nobody has looked at this seller yet" is not
 * "this seller is unauthorised".
 */
const VERDICT_CLASS: Record<Verdict, string> = {
  authorised: 'bg-(--color-success-bg) text-(--color-success)',
  blocked: 'bg-(--color-danger-bg) text-(--color-danger)',
  undefined: 'text-(--color-muted)',
};

function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${VERDICT_CLASS[verdict]}`}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/**
 * Satıcı politikası — yetkili / yasaklı / tanımsız (doc 06 §12.4, Faz 5).
 *
 * Üç durum vardır ve üçüncüsü gerçek bir durumdur: <em>tanımsız</em>, “henüz bakılmadı”
 * demektir, “izinsiz” demek değildir. İkisini karıştıran bir sistem, her yeni satıcı göründüğü
 * anda dağıtıcıyı yanlış yere gönderir.
 *
 * Satıcı kimliği hesap düzeyinde, politika marka düzeyindedir: aynı firma Whiskas'ın yetkili
 * bayisi olup Royal Canin için hiçbir anlaşması olmayabilir — ölçtüğümüz kadarıyla Royal
 * Canin satıcılarının %21'i aynı zamanda Whiskas da satıyor, yani bu istisna değil kural.
 *
 * Eşleştirme <strong>asla isimle</strong> yapılmaz: pazaryeri satıcı kodu ya da vergi numarası.
 */
export function PolicyClient() {
  const [watchedBrandId, setWatchedBrandId] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<{ line: number; message: string }[]>([]);

  const [applyToWholeGroup, setApplyToWholeGroup] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<'authorised' | 'blocked'>('authorised');
  const fileInput = useRef<HTMLInputElement>(null);

  // Manual entry
  const [manualKind, setManualKind] = useState<'sellerRef' | 'taxNumber'>('sellerRef');
  const [manualMarketplace, setManualMarketplace] = useState('trendyol');
  const [manualRef, setManualRef] = useState('');
  const [manualTax, setManualTax] = useState('');
  const [manualStatus, setManualStatus] = useState<'authorised' | 'blocked'>('authorised');
  const [manualNote, setManualNote] = useState('');

  const paged = usePagedRows(report?.sellers ?? EMPTY_SELLERS, { resetKey: watchedBrandId });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (watchedBrandId) params.set('watchedBrandId', watchedBrandId);
    fetch(`/api/seller-policies?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Politika yüklenemedi.'))))
      .then((data: Report) => {
        setReport(data);
        // Land on a brand rather than on an empty screen: policy is always about one brand, and
        // the "all brands" reading has no verdict column to show.
        if (!watchedBrandId && data.brands.length > 0) setWatchedBrandId(data.brands[0]!.id);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [watchedBrandId]);

  useEffect(load, [load]);

  const brand = useMemo(
    () => report?.brands.find((b) => b.id === watchedBrandId) ?? null,
    [report, watchedBrandId],
  );
  const group = useMemo(
    () => report?.groups.find((g) => g.id === brand?.groupId) ?? null,
    [report, brand],
  );

  async function post(url: string, body: unknown): Promise<Response> {
    setBusy(true);
    setMessage(null);
    setImportErrors([]);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } finally {
      setBusy(false);
    }
  }

  /** Sets (or clears) one seller's verdict straight from the row an operator is looking at. */
  async function setVerdict(seller: SellerRow, verdict: Verdict) {
    if (verdict === 'undefined') {
      if (!seller.ruleId) return;
      setBusy(true);
      await fetch(`/api/seller-policies?id=${encodeURIComponent(seller.ruleId)}`, {
        method: 'DELETE',
      });
      setBusy(false);
      load();
      return;
    }
    const res = await post('/api/seller-policies', {
      watchedBrandId,
      applyToWholeGroup,
      marketplaceCode: seller.marketplaceCode,
      sellerRef: seller.sellerRef,
      status: verdict,
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? 'Kural kaydedilemedi.');
      return;
    }
    load();
  }

  async function addManual() {
    const res = await post('/api/seller-policies', {
      watchedBrandId,
      applyToWholeGroup,
      ...(manualKind === 'sellerRef'
        ? { marketplaceCode: manualMarketplace, sellerRef: manualRef }
        : { taxNumber: manualTax }),
      status: manualStatus,
      note: manualNote,
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? 'Kural kaydedilemedi.');
      return;
    }
    setManualRef('');
    setManualTax('');
    setManualNote('');
    setError(null);
    load();
  }

  async function importFile(file: File) {
    const csv = await file.text();
    const res = await post('/api/seller-policies/import', {
      watchedBrandId,
      applyToWholeGroup,
      defaultStatus,
      csv,
    });
    const data = (await res.json()) as {
      errors?: { line: number; message: string }[];
      error?: string;
      created?: number;
      replaced?: number;
      total?: number;
    };
    if (!res.ok) {
      if (data.errors) setImportErrors(data.errors);
      else setError(data.error ?? 'Dosya okunamadı.');
      return;
    }
    setMessage(
      `${formatNumber(data.total ?? 0)} satır işlendi — ${formatNumber(data.created ?? 0)} yeni, ${formatNumber(data.replaced ?? 0)} güncellendi.`,
    );
    if (fileInput.current) fileInput.current.value = '';
    load();
  }

  const counts = useMemo(() => {
    const rows = report?.sellers ?? [];
    return {
      authorised: rows.filter((s) => s.verdict === 'authorised').length,
      blocked: rows.filter((s) => s.verdict === 'blocked').length,
      undefinedCount: rows.filter((s) => s.verdict === 'undefined').length,
    };
  }, [report]);

  const dormantCount = (report?.policies ?? []).filter((p) => p.dormant).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Satıcı Politikası</h1>
          <p className="mt-1 max-w-3xl text-sm text-(--color-muted)">
            Bir satıcı, her marka için üç durumdan birindedir: <strong>yetkili</strong>,{' '}
            <strong>yasaklı</strong> veya <strong>tanımsız</strong>. Tanımsız gerçek bir
            durumdur — “henüz bakılmadı” demektir, “izinsiz” demek değildir. Eşleştirme
            pazaryeri satıcı kodu ya da vergi numarası ile yapılır; <strong>isimle asla</strong>.
          </p>
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-(--color-muted)">Marka</span>
          <select
            className="rounded border border-(--color-border) px-2 py-1"
            value={watchedBrandId}
            onChange={(e) => setWatchedBrandId(e.target.value)}
          >
            {(report?.groups ?? []).map((g) => (
              <optgroup key={g.id} label={g.name}>
                {(report?.brands ?? [])
                  .filter((b) => b.groupId === g.id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-3 text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded border border-(--color-success-border) bg-(--color-success-bg) p-3 text-sm">
          {message}
        </div>
      )}
      {importErrors.length > 0 && (
        <div className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-3 text-sm">
          <strong className="block">Dosya içe aktarılmadı — hiçbir satır yazılmadı.</strong>
          <p className="mt-1 text-xs">
            Yarım uygulanmış bir liste hiç olmamasından kötüdür: liste yürürlükte sanılır, hata
            veren satırlara ise bir daha kimse bakmaz. Aşağıdakileri düzeltip tekrar deneyin.
          </p>
          <ul className="mt-2 space-y-0.5">
            {importErrors.slice(0, 20).map((e) => (
              <li key={e.line}>
                <span className="font-mono text-xs">{e.line}. satır:</span> {e.message}
              </li>
            ))}
          </ul>
          {importErrors.length > 20 && (
            <p className="mt-1 text-xs">…ve {formatNumber(importErrors.length - 20)} tane daha.</p>
          )}
        </div>
      )}
      {loading && <div className="text-sm text-(--color-muted)">Yükleniyor…</div>}

      {/* Kapsam anahtarı — hem elle girişi hem içe aktarmayı etkiler, o yüzden ikisinin de
          üstünde duruyor. */}
      <label className="flex items-start gap-2 rounded border border-(--color-border) p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={applyToWholeGroup}
          onChange={(e) => setApplyToWholeGroup(e.target.checked)}
        />
        <span>
          Kuralı <strong>{group?.name ?? 'grubun'}</strong> tamamına uygula ({brand?.label} yerine)
          <span className="block text-xs text-(--color-muted)">
            Grup kuralı, kendi kuralı olmayan her markada geçerlidir. Bir markaya ayrıca kural
            yazarsanız o marka için grup kuralı geçersiz kalır — “hepsi için yetkili, Royal Canin
            hariç” iki satırdır, marka başına bir satır değil.
          </span>
        </span>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Elle giriş */}
        <section className="rounded border border-(--color-border) p-4">
          <h2 className="mb-3 text-lg font-medium">Elle ekle</h2>
          <div className="space-y-2 text-sm">
            <div className="flex gap-3">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={manualKind === 'sellerRef'}
                  onChange={() => setManualKind('sellerRef')}
                />
                Satıcı kodu
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={manualKind === 'taxNumber'}
                  onChange={() => setManualKind('taxNumber')}
                />
                Vergi numarası
              </label>
            </div>
            {manualKind === 'sellerRef' ? (
              <div className="flex gap-2">
                <select
                  className="rounded border border-(--color-border) px-2 py-1"
                  value={manualMarketplace}
                  onChange={(e) => setManualMarketplace(e.target.value)}
                >
                  <option value="trendyol">Trendyol</option>
                  <option value="hepsiburada">Hepsiburada</option>
                </select>
                <input
                  className="flex-1 rounded border border-(--color-border) px-2 py-1"
                  placeholder="Satıcı kodu"
                  value={manualRef}
                  onChange={(e) => setManualRef(e.target.value)}
                />
              </div>
            ) : (
              <input
                className="w-full rounded border border-(--color-border) px-2 py-1"
                placeholder="Vergi numarası"
                value={manualTax}
                onChange={(e) => setManualTax(e.target.value)}
              />
            )}
            <select
              className="w-full rounded border border-(--color-border) px-2 py-1"
              value={manualStatus}
              onChange={(e) => setManualStatus(e.target.value as 'authorised' | 'blocked')}
            >
              <option value="authorised">Yetkili</option>
              <option value="blocked">Yasaklı</option>
            </select>
            <input
              className="w-full rounded border border-(--color-border) px-2 py-1"
              placeholder="Not (isteğe bağlı)"
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !watchedBrandId}
              onClick={addManual}
              className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-50"
            >
              Ekle
            </button>
            {manualKind === 'taxNumber' && (
              <p className="text-xs text-(--color-muted)">
                Vergi numarası kuralı, o numaranın hangi mağazaya ait olduğu kayıtlıysa
                çalışır. Henüz eşleşmediyse kural saklanır ama kimseyi etkilemez — aşağıdaki
                listede &ldquo;etkisiz&rdquo; olarak görünür.
              </p>
            )}
          </div>
        </section>

        {/* Excel */}
        <section className="rounded border border-(--color-border) p-4">
          <h2 className="mb-3 text-lg font-medium">Excel&apos;den içe aktar</h2>
          <div className="space-y-2 text-sm">
            <p className="text-xs text-(--color-muted)">
              Sütunlar: <code>Pazaryeri</code>, <code>Satıcı Kodu</code> veya{' '}
              <code>Vergi No</code>, isteğe bağlı <code>Durum</code> ve <code>Not</code>. Türkçe
              Excel&apos;in noktalı virgüllü CSV&apos;si de okunur.
            </p>
            <label className="block">
              <span className="mb-1 block text-(--color-muted)">
                Durum sütunu yoksa hepsi şu kabul edilsin:
              </span>
              <select
                className="rounded border border-(--color-border) px-2 py-1"
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value as 'authorised' | 'blocked')}
              >
                <option value="authorised">Yetkili</option>
                <option value="blocked">Yasaklı</option>
              </select>
            </label>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              disabled={busy || !watchedBrandId}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
              }}
              className="block w-full text-xs"
            />
          </div>
        </section>
      </div>

      {report && brand && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded border border-(--color-border) p-3 text-sm">
            <span>
              <VerdictChip verdict="authorised" /> {formatNumber(counts.authorised)}
            </span>
            <span>
              <VerdictChip verdict="blocked" /> {formatNumber(counts.blocked)}
            </span>
            <span>
              <VerdictChip verdict="undefined" /> {formatNumber(counts.undefinedCount)}
            </span>
            {dormantCount > 0 && (
              <span className="text-(--color-muted)">
                · {formatNumber(dormantCount)} kural şu an kimseyi etkilemiyor (satıcı bu dönemde
                görülmedi ya da vergi numarası hiçbir mağazayla eşleşmiyor)
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  'satici-politikasi.csv',
                  report.sellers.map((s) => ({
                    Pazaryeri: s.marketplaceCode,
                    'Satıcı Kodu': s.sellerRef,
                    Satıcı: s.sellerName,
                    'Vergi No': s.taxNumber ?? '',
                    Durum: VERDICT_LABEL[s.verdict],
                    Kaynak: s.fromGroupDefault ? 'grup kuralı' : s.ruleId ? 'marka kuralı' : '',
                    Not: s.note ?? '',
                    Ürün: s.productCount,
                    'Son Görülme': formatDateTime(s.lastSeenAt),
                  })),
                )
              }
              className="ml-auto rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
            >
              Excel&apos;e Aktar
            </button>
          </div>

          {report.sellers.length === 0 && !loading && (
            <div className="rounded border border-(--color-border) p-4 text-sm text-(--color-muted)">
              Bu markanın ürünlerinde bu dönemde hiç satıcı görülmedi. Kurallar yine de
              yazılabilir — satıcı göründüğünde geçerli olurlar.
            </div>
          )}

          <TableFrame>
            <table className="w-full text-sm">
              <thead className={`${STICKY_HEAD} text-left`}>
                <tr>
                  <th className="px-2 py-1">Satıcı</th>
                  <th className="px-2 py-1">Vergi No</th>
                  <th className="px-2 py-1">Ürün</th>
                  <th className="px-2 py-1">Piyasa sapması</th>
                  <th className="px-2 py-1">Durum</th>
                  <th className="px-2 py-1">Değiştir</th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((s) => (
                  <tr
                    key={`${s.marketplaceCode}::${s.sellerRef}`}
                    className="border-t border-(--color-border)"
                  >
                    <td className="px-2 py-1">
                      {s.sellerName || s.sellerRef}
                      <div className="font-mono text-xs text-(--color-muted)">
                        {s.marketplaceCode} · {s.sellerRef}
                      </div>
                      {s.note && <div className="text-xs text-(--color-muted)">{s.note}</div>}
                    </td>
                    <td className="px-2 py-1 font-mono text-xs">{s.taxNumber ?? '—'}</td>
                    <td className="px-2 py-1 tabular-nums">{formatNumber(s.productCount)}</td>
                    <td className="px-2 py-1 tabular-nums">
                      {s.avgDeviationPct === null ? '—' : formatPercent(s.avgDeviationPct)}
                    </td>
                    <td className="px-2 py-1">
                      <VerdictChip verdict={s.verdict} />
                      {/* Hangi kuralın karar verdiğini söylemek, bir sonucun şaşırttığı anda
                          operatörün ilk sorduğu şey. */}
                      {s.fromGroupDefault && (
                        <div className="text-xs text-(--color-muted)">grup kuralı</div>
                      )}
                      {s.overriddenRuleIds.length > 0 && (
                        <div className="text-xs text-(--color-muted)">grup kuralını geçersiz kılar</div>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex gap-1">
                        {(['authorised', 'blocked', 'undefined'] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            disabled={busy || s.verdict === v}
                            onClick={() => void setVerdict(s, v)}
                            className="rounded border border-(--color-border) px-1.5 py-0.5 text-xs hover:bg-(--color-hover) disabled:opacity-40"
                          >
                            {VERDICT_LABEL[v]}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>

          <Pagination state={paged} label="satıcı" />

          <p className="text-xs text-(--color-muted)">
            Bu ekran <strong>raporlamadır</strong>. Bir satıcının yasaklı olması, fiyatlandırmayı
            hiçbir şekilde etkilemez — <code>Reprice</code> ve <code>ObserveBuybox</code> yalnızca
            kendi ilanlarımızı okur. Politika, ne yapılacağına karar veren kişiye bakacağı yeri
            gösterir.
          </p>
        </>
      )}
    </div>
  );
}

/** Stable identity for "the report has not arrived yet". */
const EMPTY_SELLERS: SellerRow[] = [];
