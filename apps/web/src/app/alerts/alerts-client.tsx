'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Pagination, usePagedRows } from '@/components/table';
import { formatDateTime, formatDuration, formatMoney, parseMoneyToKurus } from '@/lib/format';

interface AlertSeller {
  sellerRef: string | null;
  sellerName: string;
  observedPrice: string | null;
  priceSource: string;
  rank: number;
  promotionText: string | null;
  joinedAt: number;
}

interface Alert {
  id: string;
  ruleName: string;
  listingId: string;
  productName: string;
  marketplaceCode: string | null;
  ourPrice: string | null;
  state: string;
  firstSeenAt: number;
  lastSeenAt: number;
  resolvedAt: number | null;
  thresholdApplied: string | null;
  sellers: AlertSeller[];
  departedSellers: number;
}

type ScopeType = 'all' | 'marketplace' | 'baseStockCode' | 'listing';
type SubjectType = 'any' | 'seller' | 'sellerGroup';
type Predicate = 'sellerPresent' | 'priceBelow';
type ThresholdType = 'fixed' | 'belowOurPrice' | 'belowFloor' | 'pctBelowOurs';

interface Rule {
  id: string;
  name: string;
  scopeType: ScopeType;
  scopeValue: string | null;
  scopeLabel: string;
  subjectType: SubjectType;
  subjectValue: string | null;
  subjectLabel: string;
  predicate: Predicate;
  thresholdType: ThresholdType;
  thresholdValue: string | null;
  thresholdPct: number | null;
  quietPeriodMs: number;
  enabled: boolean;
}

interface Staleness {
  marketplaceCode: string;
  displayName: string;
  lastOkAt: number | null;
  ageMs: number | null;
  ok: number;
  failed: number;
  stale: boolean;
}

interface SellerOption {
  marketplaceCode: string;
  sellerRef: string;
  sellerName: string;
  groupId: string | null;
  lastSeenAt: number;
}

interface Options {
  marketplaces: { code: string; displayName: string }[];
  sellers: SellerOption[];
  sellerGroups: { id: string; displayName: string }[];
  defaultQuietPeriodMs: number;
}

interface Payload {
  alerts: Alert[];
  rules: Rule[];
  staleness: Staleness[];
  staleAfterMs: number;
  options: Options;
}

const SCOPE_LABELS: Record<ScopeType, string> = {
  all: 'Tüm ürünler',
  marketplace: 'Bir pazaryerindeki tüm ürünler',
  listing: 'Tek bir ilan',
  baseStockCode: 'Bir stok kodundaki tüm ilanlar',
};

const SUBJECT_LABELS: Record<SubjectType, string> = {
  any: 'Herhangi bir satıcı',
  seller: 'Belirli bir satıcı',
  sellerGroup: 'Bir satıcı grubu',
};

const PREDICATE_LABELS: Record<Predicate, string> = {
  sellerPresent: 'ilanda görünürse',
  priceBelow: 'şu eşiğin altında fiyat verirse',
};

const THRESHOLD_LABELS: Record<ThresholdType, string> = {
  fixed: 'Sabit fiyat',
  belowOurPrice: 'Bizim fiyatımız',
  belowFloor: 'Taban fiyatımız',
  pctBelowOurs: 'Bizim fiyatımızdan yüzde aşağısı',
};

const QUIET_PERIODS: ReadonlyArray<readonly [number, string]> = [
  [0, 'Yok — koşul her tekrarında yeni alarm'],
  [60 * 60_000, '1 saat'],
  [6 * 60 * 60_000, '6 saat'],
  [12 * 60 * 60_000, '12 saat'],
  [24 * 60 * 60_000, '1 gün'],
  [3 * 24 * 60 * 60_000, '3 gün'],
  [7 * 24 * 60 * 60_000, '7 gün'],
];

interface Draft {
  id: string | null;
  name: string;
  scopeType: ScopeType;
  scopeValue: string;
  /** What the chosen scope is called, so a picked listing shows a product name not a uuid. */
  scopeLabel: string;
  subjectType: SubjectType;
  subjectValue: string;
  predicate: Predicate;
  thresholdType: ThresholdType;
  /** The operator's own text, in lira. Parsed to kuruş only on save. */
  thresholdText: string;
  thresholdPctText: string;
  quietPeriodMs: number;
  enabled: boolean;
}

function emptyDraft(defaultQuietPeriodMs: number): Draft {
  return {
    id: null,
    name: '',
    scopeType: 'all',
    scopeValue: '',
    scopeLabel: '',
    subjectType: 'any',
    subjectValue: '',
    predicate: 'priceBelow',
    thresholdType: 'fixed',
    thresholdText: '',
    thresholdPctText: '5',
    quietPeriodMs: defaultQuietPeriodMs,
    enabled: true,
  };
}

function draftFromRule(rule: Rule): Draft {
  return {
    id: rule.id,
    name: rule.name,
    scopeType: rule.scopeType,
    scopeValue: rule.scopeValue ?? '',
    scopeLabel: rule.scopeLabel,
    subjectType: rule.subjectType,
    subjectValue: rule.subjectValue ?? '',
    predicate: rule.predicate,
    thresholdType: rule.thresholdType,
    // Kuruş back to the lira text the operator typed, without a float in between.
    thresholdText:
      rule.thresholdValue === null
        ? ''
        : `${BigInt(rule.thresholdValue) / 100n},${String(BigInt(rule.thresholdValue) % 100n).padStart(2, '0')}`,
    thresholdPctText: rule.thresholdPct === null ? '5' : String(rule.thresholdPct),
    quietPeriodMs: rule.quietPeriodMs,
    enabled: rule.enabled,
  };
}

function describeRule(r: Rule): string {
  const subject = r.subjectLabel;
  if (r.predicate === 'sellerPresent') return `${r.scopeLabel} · ${subject} listede görünürse`;
  const threshold =
    r.thresholdType === 'fixed'
      ? formatMoney(r.thresholdValue === null ? null : BigInt(r.thresholdValue))
      : r.thresholdType === 'pctBelowOurs'
        ? `bizim fiyatımızın %${r.thresholdPct} altı`
        : r.thresholdType === 'belowOurPrice'
          ? 'bizim fiyatımız'
          : 'taban fiyatımız';
  return `${r.scopeLabel} · ${subject}, ${threshold} altında fiyat verirse`;
}

/** Search-and-pick, because a listing id is not something an operator can type or verify. */
function ListingPicker({
  onPick,
}: {
  onPick: (listing: { id: string; productName: string }) => void;
}) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<{ id: string; productName: string; marketplaceCode: string }[]>(
    [],
  );
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = text.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    // Debounced: the listings endpoint enriches every row it returns (floor price, buybox), so
    // firing it per keystroke would be needlessly expensive.
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/listings?text=${encodeURIComponent(term)}&limit=10`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('arama başarısız'))))
        .then((d: { rows: { id: string; productName: string; marketplaceCode: string }[] }) =>
          setResults(d.rows),
        )
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div>
      <input
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        placeholder="Ürün adı ya da stok kodu ile ara…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {searching && <div className="mt-1 text-xs text-neutral-500">aranıyor…</div>}
      {results.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded border border-neutral-200">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full px-2 py-1 text-left text-sm hover:bg-neutral-100"
                onClick={() => {
                  onPick(r);
                  setText('');
                  setResults([]);
                }}
              >
                {r.productName}{' '}
                <span className="text-xs text-neutral-500">({r.marketplaceCode})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleEditor({
  draft,
  options,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}: {
  draft: Draft;
  options: Options;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onChange({ ...draft, [key]: value });

  const thresholdKurus =
    draft.predicate === 'priceBelow' && draft.thresholdType === 'fixed'
      ? parseMoneyToKurus(draft.thresholdText)
      : null;
  const thresholdInvalid =
    draft.predicate === 'priceBelow' &&
    draft.thresholdType === 'fixed' &&
    draft.thresholdText.trim() !== '' &&
    thresholdKurus === null;

  const sellersForScope = options.sellers.filter((s) =>
    draft.scopeType === 'marketplace' && draft.scopeValue
      ? s.marketplaceCode === draft.scopeValue
      : true,
  );

  return (
    <div className="rounded border border-blue-300 bg-blue-50 p-4">
      <h3 className="font-medium">{draft.id ? 'Kuralı düzenle' : 'Yeni kural'}</h3>

      {error && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="block text-xs font-medium text-neutral-600">Kural adı</span>
          <input
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
            placeholder="ör. Sahte ürün şüphesi — 400 TL altı"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </label>

        <label className="text-sm">
          <span className="block text-xs font-medium text-neutral-600">Sessizlik süresi</span>
          <select
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
            value={draft.quietPeriodMs}
            onChange={(e) => set('quietPeriodMs', Number(e.target.value))}
          >
            {QUIET_PERIODS.map(([ms, label]) => (
              <option key={ms} value={ms}>
                {label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">
            Kapanan bir alarmın yeniden açılması için beklenecek süre. Açık alarmı susturmaz.
          </span>
        </label>

        {/* Scope */}
        <div className="text-sm">
          <span className="block text-xs font-medium text-neutral-600">Hangi ürünlerde?</span>
          <select
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
            value={draft.scopeType}
            onChange={(e) =>
              onChange({
                ...draft,
                scopeType: e.target.value as ScopeType,
                scopeValue: '',
                scopeLabel: '',
              })
            }
          >
            {(Object.keys(SCOPE_LABELS) as ScopeType[]).map((k) => (
              <option key={k} value={k}>
                {SCOPE_LABELS[k]}
              </option>
            ))}
          </select>

          {draft.scopeType === 'marketplace' && (
            <select
              className="mt-2 w-full rounded border border-neutral-300 px-2 py-1"
              value={draft.scopeValue}
              onChange={(e) => set('scopeValue', e.target.value)}
            >
              <option value="">— pazaryeri seçin —</option>
              {options.marketplaces.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.displayName}
                </option>
              ))}
            </select>
          )}

          {draft.scopeType === 'baseStockCode' && (
            <input
              className="mt-2 w-full rounded border border-neutral-300 px-2 py-1"
              placeholder="Stok kodu"
              value={draft.scopeValue}
              onChange={(e) => onChange({ ...draft, scopeValue: e.target.value, scopeLabel: '' })}
            />
          )}

          {draft.scopeType === 'listing' && (
            <div className="mt-2">
              {draft.scopeValue ? (
                <div className="flex items-center justify-between gap-2 rounded border border-neutral-300 bg-white px-2 py-1">
                  <span>{draft.scopeLabel || draft.scopeValue}</span>
                  <button
                    type="button"
                    className="text-xs text-blue-700 hover:underline"
                    onClick={() => onChange({ ...draft, scopeValue: '', scopeLabel: '' })}
                  >
                    değiştir
                  </button>
                </div>
              ) : (
                <ListingPicker
                  onPick={(l) =>
                    onChange({ ...draft, scopeValue: l.id, scopeLabel: l.productName })
                  }
                />
              )}
            </div>
          )}
        </div>

        {/* Subject */}
        <div className="text-sm">
          <span className="block text-xs font-medium text-neutral-600">Hangi satıcı?</span>
          <select
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
            value={draft.subjectType}
            onChange={(e) =>
              onChange({ ...draft, subjectType: e.target.value as SubjectType, subjectValue: '' })
            }
          >
            {(Object.keys(SUBJECT_LABELS) as SubjectType[]).map((k) => (
              <option key={k} value={k}>
                {SUBJECT_LABELS[k]}
              </option>
            ))}
          </select>

          {draft.subjectType === 'seller' && (
            <>
              <select
                className="mt-2 w-full rounded border border-neutral-300 px-2 py-1"
                value={draft.subjectValue}
                onChange={(e) => set('subjectValue', e.target.value)}
              >
                <option value="">— satıcı seçin —</option>
                {sellersForScope.map((s) => (
                  <option key={`${s.marketplaceCode}:${s.sellerRef}`} value={s.sellerRef}>
                    {s.sellerName || s.sellerRef} ({s.marketplaceCode})
                  </option>
                ))}
              </select>
              {sellersForScope.length === 0 && (
                <span className="mt-1 block text-xs text-amber-800">
                  Henüz kayıtlı satıcı yok — bir rakip taraması çalıştıktan sonra burada listelenir.
                </span>
              )}
            </>
          )}

          {draft.subjectType === 'sellerGroup' && (
            <>
              <select
                className="mt-2 w-full rounded border border-neutral-300 px-2 py-1"
                value={draft.subjectValue}
                onChange={(e) => set('subjectValue', e.target.value)}
              >
                <option value="">— grup seçin —</option>
                {options.sellerGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.displayName}
                  </option>
                ))}
              </select>
              {options.sellerGroups.length === 0 && (
                <span className="mt-1 block text-xs text-amber-800">
                  Tanımlı satıcı grubu yok.{' '}
                  <Link className="text-blue-700 hover:underline" href="/competitors/sellers">
                    Satıcılar
                  </Link>{' '}
                  ekranından oluşturabilirsiniz.
                </span>
              )}
            </>
          )}
        </div>

        {/* Predicate */}
        <div className="text-sm">
          <span className="block text-xs font-medium text-neutral-600">Ne olursa?</span>
          <select
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
            value={draft.predicate}
            onChange={(e) => set('predicate', e.target.value as Predicate)}
          >
            {(Object.keys(PREDICATE_LABELS) as Predicate[]).map((k) => (
              <option key={k} value={k}>
                {PREDICATE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        {/* Threshold */}
        {draft.predicate === 'priceBelow' && (
          <div className="text-sm">
            <span className="block text-xs font-medium text-neutral-600">Eşik</span>
            <select
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
              value={draft.thresholdType}
              onChange={(e) => set('thresholdType', e.target.value as ThresholdType)}
            >
              {(Object.keys(THRESHOLD_LABELS) as ThresholdType[]).map((k) => (
                <option key={k} value={k}>
                  {THRESHOLD_LABELS[k]}
                </option>
              ))}
            </select>

            {draft.thresholdType === 'fixed' && (
              <>
                <input
                  className={`mt-2 w-full rounded border px-2 py-1 ${
                    thresholdInvalid ? 'border-red-400 bg-red-50' : 'border-neutral-300'
                  }`}
                  inputMode="decimal"
                  placeholder="400,00"
                  value={draft.thresholdText}
                  onChange={(e) => set('thresholdText', e.target.value)}
                />
                {/* The operator sees the parsed value before saving. A threshold read as 1000×
                    its intent would save cleanly and simply never fire. */}
                <span
                  className={`mt-1 block text-xs ${thresholdInvalid ? 'text-red-700' : 'text-neutral-600'}`}
                >
                  {thresholdInvalid
                    ? 'Anlaşılmadı. Kuruş için virgül kullanın: 400,50'
                    : thresholdKurus === null
                      ? 'Türk lirası. Kuruş ayıracı virgül: 400,50'
                      : `Kaydedilecek eşik: ${formatMoney(thresholdKurus)}`}
                </span>
              </>
            )}

            {draft.thresholdType === 'pctBelowOurs' && (
              <div className="mt-2 flex items-center gap-2">
                <span>%</span>
                <input
                  className="w-24 rounded border border-neutral-300 px-2 py-1"
                  inputMode="numeric"
                  value={draft.thresholdPctText}
                  onChange={(e) => set('thresholdPctText', e.target.value)}
                />
                <span className="text-xs text-neutral-600">bizim fiyatımızın altında</span>
              </div>
            )}

            {draft.thresholdType === 'belowFloor' && (
              <span className="mt-1 block text-xs text-neutral-600">
                İlanın operatör tanımlı taban fiyatı kullanılır. Taban fiyatı olmayan ilanlarda
                kural &ldquo;değerlendirilemedi&rdquo; sayılır; alarmı ne açar ne kapatır.
              </span>
            )}
          </div>
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
        />
        Etkin
      </label>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={saving || thresholdInvalid}
          onClick={onSave}
        >
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button
          type="button"
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
          onClick={onCancel}
          disabled={saving}
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/** Stable identity for "the payload has not arrived yet". */
const NO_ROWS: never[] = [];

export function AlertsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Each open alert is a card with its own seller table, so ten of them already fill a screen.
  const pagedAlerts = usePagedRows(data?.alerts ?? NO_ROWS, { pageSize: 25 });
  const pagedRules = usePagedRows(data?.rules ?? NO_ROWS, { pageSize: 25 });

  const load = useCallback(() => {
    fetch('/api/alerts')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Alarmlar yüklenemedi.'))))
      .then((d: Payload) => setData(d))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    try {
      const thresholdKurus =
        draft.predicate === 'priceBelow' && draft.thresholdType === 'fixed'
          ? parseMoneyToKurus(draft.thresholdText)
          : null;
      const res = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: draft.id ?? undefined,
          name: draft.name,
          scopeType: draft.scopeType,
          scopeValue: draft.scopeType === 'all' ? null : draft.scopeValue.trim() || null,
          subjectType: draft.subjectType,
          subjectValue: draft.subjectType === 'any' ? null : draft.subjectValue || null,
          predicate: draft.predicate,
          thresholdType: draft.thresholdType,
          thresholdValue: thresholdKurus === null ? null : thresholdKurus.toString(),
          thresholdPct:
            draft.predicate === 'priceBelow' && draft.thresholdType === 'pctBelowOurs'
              ? Number(draft.thresholdPctText)
              : null,
          quietPeriodMs: draft.quietPeriodMs,
          enabled: draft.enabled,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormError(body.error ?? 'Kural kaydedilemedi.');
        return;
      }
      setDraft(null);
      load();
    } catch {
      setFormError('Kural kaydedilemedi — sunucuya ulaşılamadı.');
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const toggleEnabled = useCallback(
    async (rule: Rule) => {
      const res = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? 'Kural güncellenemedi.');
        return;
      }
      load();
    },
    [load],
  );

  const remove = useCallback(
    async (rule: Rule) => {
      if (
        !window.confirm(
          `"${rule.name}" kuralı silinsin mi? Bu kurala bağlı açık alarmlar da silinir.`,
        )
      ) {
        return;
      }
      const res = await fetch(`/api/alerts/rules?id=${encodeURIComponent(rule.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError('Kural silinemedi.');
        return;
      }
      load();
    },
    [load],
  );

  if (!data) return <div className="p-6 text-sm text-neutral-500">{error ?? 'Yükleniyor…'}</div>;

  const staleMarketplaces = data.staleness.filter((s) => s.stale);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Rakip Alarmları</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">
          Alarmlar <strong>raporlamadır</strong>: hiçbir fiyat kararını tetiklemez, hiçbir fiyatı
          değiştirmez. Rakip tarama verisinden üretilir ve o veri kadar günceldir.
        </p>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">{error}</div>}

      {/* The single most important element on this page. Zero open alerts next to a scraper
          that has not succeeded in a day is not good news, and must not look like it. */}
      {staleMarketplaces.length > 0 && (
        <div className="rounded border border-red-400 bg-red-50 p-4">
          <h2 className="font-semibold text-red-900">Bu alarmlar güncel veriye dayanmıyor</h2>
          <ul className="mt-2 space-y-1 text-sm text-red-900">
            {staleMarketplaces.map((s) => (
              <li key={s.marketplaceCode}>
                <strong>{s.displayName}</strong>:{' '}
                {s.lastOkAt === null
                  ? 'son 7 günde hiç başarılı tarama yok'
                  : `son başarılı tarama ${formatDateTime(s.lastOkAt)} (${formatDuration(s.ageMs ?? 0)} önce)`}
                {s.failed > 0 && ` · ${s.failed} başarısız deneme`}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-red-900">
            Aşağıda alarm görünmemesi &ldquo;sorun yok&rdquo; anlamına gelmez; &ldquo;bakmadık&rdquo;
            anlamına gelir. İşler ekranından Rakip Verisi Toplama işini kontrol edin.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        {data.staleness.map((s) => (
          <div key={s.marketplaceCode} className="rounded border border-neutral-200 px-3 py-2 text-sm">
            <div className="text-xs text-neutral-500">{s.displayName}</div>
            <div className={s.stale ? 'text-red-700' : 'text-neutral-800'}>
              {s.lastOkAt === null ? 'tarama yok' : `son tarama ${formatDateTime(s.lastOkAt)}`}
            </div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">
          Açık alarmlar{' '}
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-sm text-white">
            {data.alerts.length}
          </span>
        </h2>

        {data.alerts.length === 0 ? (
          <div className="rounded border border-neutral-200 p-6 text-center text-sm text-neutral-500">
            {data.rules.length === 0
              ? 'Henüz alarm kuralı tanımlanmamış.'
              : staleMarketplaces.length > 0
                ? 'Açık alarm yok — ancak yukarıdaki uyarıya göre veri güncel değil.'
                : 'Açık alarm yok.'}
          </div>
        ) : (
          <div className="space-y-3">
            {pagedAlerts.rows.map((a) => (
              <div key={a.id} className="rounded border border-amber-300 bg-amber-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{a.ruleName}</div>
                    <Link className="text-sm text-blue-700 hover:underline" href={`/listings/${a.listingId}`}>
                      {a.productName}
                    </Link>
                    <div className="text-xs text-neutral-600">
                      {a.marketplaceCode} · bizim fiyatımız{' '}
                      {a.ourPrice ? formatMoney(BigInt(a.ourPrice)) : '—'}
                      {a.thresholdApplied && (
                        <> · eşik {formatMoney(BigInt(a.thresholdApplied))}</>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-neutral-600">
                    <div>başlangıç {formatDateTime(a.firstSeenAt)}</div>
                    <div>son görülme {formatDateTime(a.lastSeenAt)}</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-sm font-medium">
                    {a.sellers.length} satıcı eşiğin altında
                  </div>
                  {/* Bounded: one alert can name dozens of sellers, and the card must not push
                      the alerts under it off the screen. */}
                  <div className="mt-1 max-h-56 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-neutral-500">
                      <tr>
                        <th className="py-1">Satıcı</th>
                        <th className="py-1 text-right">Fiyat</th>
                        <th className="py-1 text-right">Sıra</th>
                        <th className="py-1">Bu alarma katıldığı</th>
                        <th className="py-1">Promosyon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.sellers.map((s, i) => (
                        <tr key={i} className="border-t border-amber-200">
                          <td className="py-1">
                            {s.sellerRef ? (
                              <Link
                                className="text-blue-700 hover:underline"
                                href={`/competitors/sellers/${a.marketplaceCode}/${encodeURIComponent(s.sellerRef)}`}
                              >
                                {s.sellerName || s.sellerRef}
                              </Link>
                            ) : (
                              s.sellerName || '(kimliksiz)'
                            )}
                          </td>
                          <td className="py-1 text-right">
                            {s.observedPrice ? formatMoney(BigInt(s.observedPrice)) : '—'}
                            {/* Which field the comparison used. On Hepsiburada the coupon price
                                is never published, so this says "liste" there by design. */}
                            <span className="ml-1 text-neutral-500">
                              ({s.priceSource === 'finalPrice' ? 'kupon' : 'liste'})
                            </span>
                          </td>
                          <td className="py-1 text-right">{s.rank}</td>
                          <td className="py-1">{formatDateTime(s.joinedAt)}</td>
                          <td className="py-1 text-neutral-500">{s.promotionText ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {a.departedSellers > 0 && (
                    <p className="mt-1 text-xs text-neutral-500">
                      {a.departedSellers} satıcı bu alarmdan ayrıldı (geçmişte tutuluyor).
                    </p>
                  )}
                </div>
              </div>
            ))}
            <Pagination state={pagedAlerts} label="alarm" />
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-medium">Kurallar ({data.rules.length})</h2>
          <button
            type="button"
            className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={draft !== null}
            onClick={() => {
              setFormError(null);
              setDraft(emptyDraft(data.options.defaultQuietPeriodMs));
              setShowRules(true);
            }}
          >
            + Yeni kural
          </button>
          {data.rules.length > 0 && (
            <button
              type="button"
              className="text-sm text-blue-700 hover:underline"
              onClick={() => setShowRules((v) => !v)}
            >
              {showRules ? 'Listeyi gizle' : 'Listeyi göster'}
            </button>
          )}
        </div>

        {draft && (
          <div className="mb-3">
            <RuleEditor
              draft={draft}
              options={data.options}
              onChange={setDraft}
              onSave={save}
              onCancel={() => {
                setDraft(null);
                setFormError(null);
              }}
              saving={saving}
              error={formError}
            />
          </div>
        )}

        {showRules && (
          <div className="space-y-2">
            {pagedRules.rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 p-3 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {r.name}
                    {!r.enabled && (
                      <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs">pasif</span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500">{describeRule(r)}</div>
                  {/* A fixed threshold goes stale and nobody revisits it, so the rule shows
                      what it is comparing against right where it is edited. */}
                  {r.thresholdType === 'fixed' && r.predicate === 'priceBelow' && (
                    <div className="text-xs text-neutral-500">
                      Sabit eşik — piyasa buradan uzaklaştıysa bu kural sessizce ölmüş olabilir.
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  <span>sessizlik {formatDuration(r.quietPeriodMs)}</span>
                  <button
                    type="button"
                    className="text-blue-700 hover:underline"
                    onClick={() => {
                      setFormError(null);
                      setDraft(draftFromRule(r));
                    }}
                  >
                    düzenle
                  </button>
                  <button
                    type="button"
                    className="text-blue-700 hover:underline"
                    onClick={() => void toggleEnabled(r)}
                  >
                    {r.enabled ? 'pasifleştir' : 'etkinleştir'}
                  </button>
                  <button
                    type="button"
                    className="text-red-700 hover:underline"
                    onClick={() => void remove(r)}
                  >
                    sil
                  </button>
                </div>
              </div>
            ))}
            {data.rules.length === 0 ? (
              <p className="text-sm text-neutral-500">Henüz kural yok.</p>
            ) : (
              <Pagination state={pagedRules} label="kural" />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
