'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ColumnMenu,
  ResizableTh,
  STICKY_HEAD,
  TableFrame,
  resizableTableStyle,
  useColumnPrefs,
  type ColumnDef,
} from '@/components/table';
import {
  Ago,
  Button,
  Chip,
  ConfirmButton,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Section,
  Select,
  StatusBanner,
  TextInput,
} from '@/components/ui';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatNumber } from '@/lib/format';

interface WatchedBrand {
  id: string;
  marketplaceCode: string;
  label: string;
  brandRef: string | null;
  searchTerm: string | null;
  isActive: boolean;
  lastSweptAt: number | null;
  lastSweepProductCount: number | null;
  productCount: number;
  unratedCount: number;
  /**
   * `false` ise rakip marka: aynı süpürme ve derin tarama çalışır, ama denetim bulgusu
   * üretilmez — "yetkili satıcı" bizim markamız hakkında bir ifadedir.
   */
  isOwnBrand: boolean;
  /** Son başarılı bakışta hiç satıcısı olmayan ürünler — kaybedilen raf. */
  noSellerCount: number;
  /** Henüz başarılı bakış yapılmamış ürünler. "Satıcısız" değil, "bilinmiyor". */
  neverLookedCount: number;
  suggestedBrandRef: { ref: string; share: number } | null;
}

interface PruneSuggestion {
  watchedBrandId: string;
  label: string;
  productCount: number;
  unratedCount: number;
  share: number;
  currentScanMinutes: number;
  prunedScanMinutes: number;
}

interface WatchedBrandGroup {
  id: string;
  name: string;
  note: string | null;
  brands: WatchedBrand[];
}

type ColumnId =
  'brand' | 'marketplace' | 'selectors' | 'type' | 'products' | 'noSeller' | 'lastSwept' | 'status';

/** Fixed trailing width for the un-resizable "Şimdi tara / Kaldır" actions column. */
const ACTIONS_COL_WIDTH = 170;

const COLUMN_DEFS: ColumnDef<ColumnId>[] = [
  { id: 'brand', label: 'Marka', defaultWidth: 160 },
  { id: 'marketplace', label: 'Pazaryeri', defaultWidth: 100 },
  { id: 'selectors', label: 'Nasıl aranıyor', defaultWidth: 200 },
  { id: 'type', label: 'Tür', defaultWidth: 90 },
  { id: 'products', label: 'Ürün', defaultWidth: 150 },
  { id: 'noSeller', label: 'Satıcısız', defaultWidth: 170 },
  { id: 'lastSwept', label: 'Son Tarama', defaultWidth: 120 },
  { id: 'status', label: 'Durum', defaultWidth: 110 },
];

const COLUMN_LABEL = new Map(COLUMN_DEFS.map((d) => [d.id, d.label]));

/**
 * İzlenen markalar — marka sahibi denetim modülünün kayıt ekranı (api-references §1.7).
 *
 * `/brands` ekranıyla karıştırılmamalı: orası **bizim sattığımız** ilanlardan türeyen marka
 * taksonomisi. Burası çoğunlukla satmadığımız, marka sahibi olarak izlediğimiz ürünler.
 *
 * Tarama bu ekrandan başlatılır ama burada çalışmaz — `job_queue`'ya bir satır yazılır ve
 * ilerleme İşler ekranında görünür. Büyük bir markanın taraması dakikalar sürer; bir HTTP
 * isteğinde beklemek anlamsız olurdu.
 *
 * IA (doc 15 §6, Phase 2.7): bu ekranın görevi çoğunlukla izleme/kayıt — "hangi markaları
 * izliyorum, taramalar sağlıklı mı?" — ekleme değil. O yüzden marka/grup ekleme formu
 * varsayılan olarak kapalı tutulur (ilk ziyarette hiç grup yoksa otomatik açılır) ve asıl
 * grid en üstte kalır.
 */
export function WatchedBrandsClient() {
  const [groups, setGroups] = useState<WatchedBrandGroup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pruneSuggestions, setPruneSuggestions] = useState<PruneSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAddForms, setShowAddForms] = useState(false);
  const autoOpenedRef = useRef(false);

  const [groupName, setGroupName] = useState('');
  const [brandGroupId, setBrandGroupId] = useState('');
  const [brandLabel, setBrandLabel] = useState('');
  const [brandMarketplace, setBrandMarketplace] = useState('trendyol');
  const [brandRef, setBrandRef] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const columns = useColumnPrefs<ColumnId>('watchedBrands.columns', COLUMN_DEFS);

  function load() {
    setLoadError(null);
    fetch('/api/watched-brands')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { groups: WatchedBrandGroup[] }) => {
        setGroups(d.groups);
        // Keep the brand form pointed at a group that still exists, so the form does not
        // silently target a deleted one after a reload.
        setBrandGroupId((current) =>
          d.groups.some((g) => g.id === current) ? current : (d.groups[0]?.id ?? ''),
        );
        // First-visit convenience: with nothing watched yet, the add form *is* the task, so
        // open it once automatically. A later reload with rows already present never reopens
        // it — the operator's own collapse/expand choice is respected from then on.
        if (!autoOpenedRef.current) {
          autoOpenedRef.current = true;
          if (d.groups.length === 0) setShowAddForms(true);
        }
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
    // Reporting-only supporting data (§2 rule: never let a failure reach a pricing decision, and
    // by extension never let this secondary panel's failure block the primary registry above).
    fetch('/api/tracked-products/prune-suggestion')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { suggestions: PruneSuggestion[] }) => setPruneSuggestions(d.suggestions))
      .catch(() => setPruneSuggestions([]));
  }
  useEffect(load, []);

  async function request(method: string, url: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? 'İşlem başarısız.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  const post = (url: string, body: unknown) => request('POST', url, body);
  const patch = (url: string, body: unknown) => request('PATCH', url, body);

  async function addGroup() {
    if (await post('/api/watched-brands/groups', { name: groupName })) {
      setGroupName('');
      load();
    }
  }

  async function addBrand() {
    const ok = await post('/api/watched-brands', {
      groupId: brandGroupId,
      marketplaceCode: brandMarketplace,
      label: brandLabel,
      brandRef,
      searchTerm,
    });
    if (ok) {
      setBrandLabel('');
      setBrandRef('');
      setSearchTerm('');
      load();
    }
  }

  async function sweepNow(brand: WatchedBrand) {
    if (await post(`/api/watched-brands/${brand.id}/sweep`, {})) {
      setError(null);
      alert(`${brand.label} taraması kuyruğa alındı. İlerlemeyi İşler ekranından izleyebilirsiniz.`);
    }
  }

  async function applySuggestedRef(brand: WatchedBrand) {
    if (!brand.suggestedBrandRef) return;
    if (await patch(`/api/watched-brands/${brand.id}`, { brandRef: brand.suggestedBrandRef.ref })) load();
  }

  /**
   * Flips a brand between "ours" and "a competitor's".
   *
   * It is a two-state control rather than a setting buried in an edit form because it changes
   * what the brand *is for*: a competitor's brand is swept and priced but never audited, so
   * turning this off silently stops findings — which the operator must be able to see they did.
   * That is also why the JSX wraps this in `ConfirmButton` with `requireConfirm` only for the
   * "bizim" → "rakip" direction (§3.6): the reverse direction only *starts* producing findings,
   * which is not a risk worth a dialog.
   */
  async function toggleOwnBrand(brand: WatchedBrand) {
    if (await patch(`/api/watched-brands/${brand.id}`, { isOwnBrand: !brand.isOwnBrand })) load();
  }

  async function toggleActive(brand: WatchedBrand) {
    if (await patch(`/api/watched-brands/${brand.id}`, { isActive: !brand.isActive })) load();
  }

  /**
   * Deactivates the brand's never-rated products.
   *
   * Deactivation, not deletion: "the marketplace has never recorded a rating" is a proxy for
   * "nobody buys this", not proof of it. The rows and their history stay, and the grid's
   * "Sürdür" button puts any of them back.
   *
   * The confirmation text names an exact count fetched just before asking, so it cannot use the
   * static `ConfirmButton` — the message depends on a request that has to run first.
   */
  async function pruneUnrated(suggestion: PruneSuggestion) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tracked-products/prune-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchedBrandId: suggestion.watchedBrandId }),
      });
      const data = (await res.json()) as { ids?: string[]; total?: number; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Öneri hesaplanamadı.');
        return;
      }
      const { ids, total } = data as { ids: string[]; total: number };
      if (ids.length === 0) return;

      const more =
        total > ids.length
          ? `\n\nBu adımda ${ids.length} tanesi işlenecek; kalanı için tekrar çalıştırın.`
          : '';
      if (
        !confirm(
          `${suggestion.label}: hiç değerlendirmesi olmayan ${formatNumber(total)} ürün duraklatılacak.\n\nSilinmez — listede kalır ve istediğinizde geri alabilirsiniz. Derin tarama ${suggestion.currentScanMinutes} dk yerine ${suggestion.prunedScanMinutes} dk sürer.${more}`,
        )
      ) {
        return;
      }

      const patchRes = await fetch('/api/tracked-products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, isActive: false }),
      });
      if (!patchRes.ok) {
        const patchData = (await patchRes.json()) as { error?: string };
        setError(patchData.error ?? 'Duraklatma başarısız.');
        return;
      }
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeBrand(brand: WatchedBrand) {
    if (await request('DELETE', `/api/watched-brands/${brand.id}`, {})) load();
  }

  async function removeGroup(group: WatchedBrandGroup) {
    if (await request('DELETE', `/api/watched-brands/groups?id=${encodeURIComponent(group.id)}`, {})) {
      load();
    }
  }

  function renderCell(id: ColumnId, brand: WatchedBrand): React.ReactNode {
    switch (id) {
      case 'brand':
        // The brand's own products, already filtered — this screen counts them but cannot show
        // them, and the count is exactly the number an operator wants to click through.
        // `/tracked-products` seeds its brand filter from this query parameter.
        return (
          <Link
            href={`/tracked-products?watchedBrandId=${encodeURIComponent(brand.id)}`}
            title={`${brand.label} markasının takip edilen ürünlerini aç`}
            className="font-medium text-(--color-accent) hover:underline"
          >
            {brand.label}
          </Link>
        );
      case 'marketplace':
        return brand.marketplaceCode;
      case 'selectors':
        return (
          <div className="flex flex-col gap-0.5 text-xs">
            {brand.brandRef && <span>marka id: {brand.brandRef}</span>}
            {brand.searchTerm && <span>arama: {brand.searchTerm}</span>}
            {brand.suggestedBrandRef && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void applySuggestedRef(brand)}
                className="text-left text-(--color-accent) hover:underline disabled:opacity-40"
                title={`Ürünlerin %${Math.round(brand.suggestedBrandRef.share * 100)}'i bu marka id'sini taşıyor`}
              >
                + marka id {brand.suggestedBrandRef.ref} ekle
              </button>
            )}
          </div>
        );
      case 'type':
        return (
          <ConfirmButton
            requireConfirm={brand.isOwnBrand}
            confirmMessage={`${brand.label} rakip marka olarak işaretlenecek — bundan sonra denetim bulgusu üretilmeyecek. Emin misiniz?`}
            onConfirmed={() => void toggleOwnBrand(brand)}
            disabled={busy}
            title={
              brand.isOwnBrand
                ? 'Bizim markamız — denetim bulguları üretilir. Değiştirmek için tıklayın.'
                : 'Rakip marka — sadece fiyat karşılaştırması, denetim bulgusu üretilmez. Değiştirmek için tıklayın.'
            }
          >
            <Chip tone={brand.isOwnBrand ? 'ok' : 'neutral'}>{brand.isOwnBrand ? 'bizim' : 'rakip'}</Chip>
          </ConfirmButton>
        );
      case 'products':
        return (
          <>
            <Link
              href={`/tracked-products?watchedBrandId=${encodeURIComponent(brand.id)}`}
              className="text-(--color-accent) hover:underline"
            >
              {formatNumber(brand.productCount)}
            </Link>
            {brand.unratedCount > 0 && (
              <Link
                href={`/tracked-products?watchedBrandId=${encodeURIComponent(brand.id)}&unratedOnly=true`}
                className="ml-1 text-xs text-(--color-muted) hover:text-(--color-accent) hover:underline"
                title="Hiç değerlendirmesi olmayan ürünler. Bunları çıkarmak derin taramayı belirgin şekilde hızlandırır."
              >
                ({formatNumber(brand.unratedCount)} değerlendirmesiz)
              </Link>
            )}
          </>
        );
      case 'noSeller':
        // Kaybedilen raf. Sayı bir link, çünkü bir marka sorumlusunun bu sayıyla yapacağı ilk
        // şey satırları açmaktır. "Henüz bakılmadı" yanında duruyor: ilk turunu tamamlamamış bir
        // markada satıcısız sayısı tek başına yanıltıcıdır.
        return (
          <>
            {brand.noSellerCount > 0 ? (
              <Link
                href={`/tracked-products?watchedBrandId=${encodeURIComponent(brand.id)}&noSellerOnly=true`}
                className="text-(--color-warning) hover:underline"
                title="Son başarılı bakışta bu ürünleri satan kimse yoktu"
              >
                {formatNumber(brand.noSellerCount)}
              </Link>
            ) : (
              <span className="text-(--color-muted)">0</span>
            )}
            {brand.neverLookedCount > 0 && (
              <span
                className="ml-1 text-xs text-(--color-muted)"
                title="Derin tarama bu ürünlere henüz ulaşmadı — satıcısız değil, bilinmiyor"
              >
                (+{formatNumber(brand.neverLookedCount)} bakılmadı)
              </span>
            )}
          </>
        );
      case 'lastSwept':
        return <Ago at={brand.lastSweptAt} never="henüz taranmadı" />;
      case 'status':
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleActive(brand)}
            className="disabled:opacity-40"
            title={brand.isActive ? 'Duraklatmak için tıklayın' : 'Sürdürmek için tıklayın'}
          >
            <Chip tone={brand.isActive ? 'ok' : 'neutral'}>{brand.isActive ? 'aktif' : 'duraklatıldı'}</Chip>
          </button>
        );
      default:
        return null;
    }
  }

  if (groups === null && loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (groups === null) {
    return <LoadingState message="Markalar yükleniyor…" skeletonRows={3} />;
  }

  const allBrands = groups.flatMap((g) => g.brands.map((b) => ({ group: g.name, brand: b })));
  const visibleColumnIds = columns.order.filter((id) => columns.isVisible(id));

  return (
    <div className="space-y-4">
      <PageHeader
        title="İzlenen Markalar"
        description={
          <>
            Bir markanın pazaryerindeki <strong>bütün</strong> ürünlerini tek seferde izlemeye alır. Bu liste{' '}
            <strong>raporlamadır</strong> — hiçbir fiyat kararını etkilemez. Bir marka iki şekilde aranabilir:
            pazaryerinin <em>marka id&apos;si</em> ve <em>arama terimi</em>. İkisi de taranır, çünkü aradaki
            fark bir bulgudur — arama terimiyle çıkıp marka id&apos;siyle çıkmayan bir ürün, marka adını
            izinsiz kullanıyor olabilir.
          </>
        }
        action={
          <Button
            type="button"
            variant="secondary"
            disabled={allBrands.length === 0}
            onClick={() =>
              downloadCsv(
                'izlenen-markalar.csv',
                allBrands.map(({ group, brand }) => ({
                  Grup: group,
                  Marka: brand.label,
                  Pazaryeri: brand.marketplaceCode,
                  'Marka Id': brand.brandRef ?? '',
                  'Arama Terimi': brand.searchTerm ?? '',
                  Aktif: brand.isActive ? 'evet' : 'hayır',
                  Ürün: brand.productCount,
                  'Değerlendirmesi Yok': brand.unratedCount,
                  Tür: brand.isOwnBrand ? 'bizim' : 'rakip',
                  Satıcısız: brand.noSellerCount,
                  Bakılmadı: brand.neverLookedCount,
                  'Son Tarama': brand.lastSweptAt ? formatDateTime(brand.lastSweptAt) : '',
                })),
              )
            }
          >
            Excel&apos;e Aktar
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ColumnMenu defs={COLUMN_DEFS} prefs={columns} />
        <Button type="button" variant="secondary" onClick={() => setShowAddForms((v) => !v)}>
          {showAddForms ? 'Ekleme formunu gizle' : 'Marka veya grup ekle'}
        </Button>
      </div>

      {showAddForms && (
        <Section id="watched-brands-add" title="Marka veya grup ekle">
          <div className="space-y-2">
            {/* ---- grup ekle ---- */}
            <div className="flex flex-wrap items-end gap-2 rounded border border-(--color-border) p-3">
              <Field label="Yeni marka grubu">
                <TextInput
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Örn. Mars"
                  className="w-64"
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !groupName.trim()}
                onClick={() => void addGroup()}
              >
                Grup Ekle
              </Button>
              <span className="text-xs text-(--color-muted)">
                Bir grup birden fazla marka tutar — Mars&apos;ın hem Whiskas&apos;a hem Royal Canin&apos;e
                sahip olması gibi.
              </span>
            </div>

            {/* ---- marka ekle ---- */}
            {groups.length > 0 && (
              <div className="flex flex-wrap items-end gap-2 rounded border border-(--color-border) p-3">
                <Field label="Grup">
                  <Select
                    value={brandGroupId}
                    onChange={(e) => setBrandGroupId(e.target.value)}
                    options={groups.map((g) => ({ value: g.id, label: g.name }))}
                    className="w-40"
                  />
                </Field>
                <Field label="Pazaryeri">
                  <Select
                    value={brandMarketplace}
                    onChange={(e) => setBrandMarketplace(e.target.value)}
                    options={[
                      { value: 'trendyol', label: 'trendyol' },
                      { value: 'hepsiburada', label: 'hepsiburada' },
                    ]}
                    className="w-32"
                  />
                </Field>
                <Field label="Marka adı">
                  <TextInput
                    value={brandLabel}
                    onChange={(e) => setBrandLabel(e.target.value)}
                    placeholder="Whiskas"
                    className="w-40"
                  />
                </Field>
                <Field label="Arama terimi">
                  <TextInput
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="whiskas"
                    className="w-40"
                  />
                </Field>
                <Field label="Marka id (opsiyonel)">
                  <TextInput
                    value={brandRef}
                    onChange={(e) => setBrandRef(e.target.value)}
                    placeholder="104703"
                    className="w-32"
                  />
                </Field>
                <Button
                  type="button"
                  disabled={busy || !brandLabel.trim() || (!searchTerm.trim() && !brandRef.trim())}
                  onClick={() => void addBrand()}
                >
                  Marka Ekle
                </Button>
                <span className="w-full text-xs text-(--color-muted)">
                  Marka id&apos;sini bilmiyorsanız boş bırakın — sadece arama terimiyle de tarama yapılır, ve
                  ilk taramadan sonra sistem pazaryerinin bu markaya verdiği id&apos;yi size önerir.
                </span>
              </div>
            )}
          </div>
        </Section>
      )}

      {error && <StatusBanner ok={false} message={error} />}

      {pruneSuggestions.length > 0 && (
        <Section id="watched-brands-prune" title="Ölü ürün önerisi">
          <div className="space-y-2 rounded border border-(--color-warning-border) bg-(--color-warning-bg) p-3">
            <p className="max-w-3xl text-xs text-(--color-muted)">
              Pazaryerinin hiç değerlendirme kaydetmediği ürünler. Değerlendirme sayısı, satış hızının
              elimizdeki en iyi göstergesi — hiç değerlendirmesi olmayan bir ürün büyük olasılıkla hiç
              satmıyor. Bunları duraklatmak derin taramayı kısaltır. Oran markadan markaya çok değişir, bu
              yüzden aşağıdaki sayılar her marka için ayrı hesaplanır.
            </p>
            <ul className="space-y-1 text-sm">
              {pruneSuggestions.map((suggestion) => (
                <li key={suggestion.watchedBrandId} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{suggestion.label}:</span>
                  <span>
                    {formatNumber(suggestion.productCount)} üründen{' '}
                    <strong>{formatNumber(suggestion.unratedCount)}</strong> tanesinin (%
                    {Math.round(suggestion.share * 100)}) hiç değerlendirmesi yok
                  </span>
                  <span className="text-xs text-(--color-muted)">
                    · derin tarama {suggestion.currentScanMinutes} dk → {suggestion.prunedScanMinutes} dk
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void pruneUnrated(suggestion)}
                    className="rounded border border-(--color-border) bg-(--color-bg) px-2 py-0.5 text-xs hover:bg-(--color-hover) disabled:opacity-40"
                  >
                    Duraklat
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {groups.map((group) => (
        <Section
          key={group.id}
          id={`watched-brand-group-${group.id}`}
          title={group.name}
          action={
            <ConfirmButton
              requireConfirm
              confirmMessage={`${group.name} grubunu ve altındaki ${group.brands.length} markayı sil?`}
              onConfirmed={() => void removeGroup(group)}
              disabled={busy}
              className="text-xs text-(--color-muted) hover:text-(--color-danger) disabled:opacity-40"
            >
              Grubu sil
            </ConfirmButton>
          }
        >
          <TableFrame>
            <table
              className="w-full text-sm"
              style={resizableTableStyle(COLUMN_DEFS, columns, ACTIONS_COL_WIDTH)}
            >
              <thead
                className={`${STICKY_HEAD} bg-(--color-hover) text-left text-xs uppercase text-(--color-muted)`}
              >
                <tr>
                  {visibleColumnIds.map((id) => (
                    <ResizableTh key={id} id={id} prefs={columns} className="px-2 py-2">
                      {COLUMN_LABEL.get(id)}
                    </ResizableTh>
                  ))}
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {group.brands.map((brand) => (
                  <tr key={brand.id}>
                    {visibleColumnIds.map((id) => (
                      <td key={id} className="px-2 py-1">
                        {renderCell(id, brand)}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void sweepNow(brand)}
                        className="mr-2 rounded border border-(--color-border) px-2 py-0.5 text-xs hover:bg-(--color-hover) disabled:opacity-40"
                      >
                        Şimdi tara
                      </button>
                      <ConfirmButton
                        requireConfirm
                        confirmMessage={`${brand.label} markasını izleme listesinden çıkar?\n\nBulduğu ${formatNumber(brand.productCount)} ürün ve geçmişleri silinmez — sadece marka bağlantıları kalkar.`}
                        onConfirmed={() => void removeBrand(brand)}
                        disabled={busy}
                        className="text-(--color-muted) hover:text-(--color-danger) disabled:opacity-40"
                      >
                        Kaldır
                      </ConfirmButton>
                    </td>
                  </tr>
                ))}
                {group.brands.length === 0 && (
                  <tr>
                    <td
                      colSpan={visibleColumnIds.length + 1}
                      className="px-2 py-4 text-center text-(--color-muted)"
                    >
                      Bu grupta henüz marka yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableFrame>
        </Section>
      ))}

      {groups.length === 0 && (
        <EmptyState
          message="Henüz marka grubu yok."
          reason="Bir marka izlemeye başlamak için önce bir grup ekleyin — Mars, Royal Canin gibi."
          action={
            !showAddForms && (
              <Button type="button" onClick={() => setShowAddForms(true)}>
                Grup ekle
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
