'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ColumnMenu,
  DEFAULT_PAGE_SIZE,
  Pagination,
  ResizableTh,
  STICKY_HEAD,
  TableFrame,
  resizableTableStyle,
  useColumnPrefs,
  useFilterPresets,
  type ColumnDef,
} from '@/components/table';
import { Download, Icon, Search, X } from '@/components/icon';
import {
  Ago,
  Button,
  buttonClass,
  Chip,
  ConfirmButton,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  SegmentedFilter,
  Select,
  TextInput,
} from '@/components/ui';
import { PopoverButton } from '@/components/popover-button';
import { SearchableSelect } from '@/components/searchable-select';
import { SweepPassCard } from '@/components/sweep-pass-card';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { marketSnapshot } from '@/lib/market-stats';
import { marketplaceProductUrl } from '@/lib/product-url';
import { discoveryLabel, isBrandNameOnly } from '@/lib/tracked-product-discovery';

interface Observation {
  status: 'ok' | 'parseFailed' | 'fetchFailed';
  rank: number | null;
  sellerName: string | null;
  price: string | null;
  finalPrice: string | null;
  observedAt: number;
}

interface TrackedProduct {
  id: string;
  marketplaceCode: string;
  productRef: string;
  productUrl: string;
  label: string;
  isActive: boolean;
  addedAt: number;
  watchedBrandId: string | null;
  brandName: string | null;
  categoryRef: string | null;
  categoryName: string | null;
  ratingCount: number | null;
  ratingAverage: number | null;
  lastSweptAt: number | null;
  /** When the scrape last looked — not when it last stored a look; see the route's comment. */
  lastScrapedAt: number | null;
  viaBrandRef: boolean;
  viaSearchTerm: boolean;
  latest: Observation[];
  period: PeriodStats | null;
  /**
   * Kuruş as a string: PSF of the linked brand product **times the card's multiplier** — the
   * price this card is held to (doc 17 §2.2). `null` for a card linked to no brand product.
   */
  referencePrice: string | null;
  /** The brand product this card is linked to, if any (doc 17 §2.1). */
  brandProduct: { id: string; name: string; unitMultiplier: number; isPrimary: boolean } | null;
  isFavourite: boolean;
  /**
   * Distinct sellers seen in the last 30 days — the _Satıcı_ column, its `Satıcı ≥` filter and
   * its sort all use this one number (2026-11-08 seller filters spec §4.3).
   */
  sellerCount: number;
}

/** The window's price band, aggregated server-side over every look in it. */
interface PeriodStats {
  minPrice: string | null;
  maxPrice: string | null;
}

/** One seller of the Satıcı dropdown (`/api/tracked-products/sellers`). */
interface SellerOption {
  marketplaceCode: string;
  sellerRef: string;
  sellerName: string | null;
  productCount: number;
}

interface WatchedBrandOption {
  id: string;
  label: string;
}

interface CategoryOption {
  ref: string;
  name: string;
  productCount: number;
}

type Sort = 'label' | 'ratingCount' | 'categoryName' | 'lastSweptAt' | 'addedAt' | 'sellerCount';

/**
 * Sorts whose useful direction is "most first" — the first click on their column goes
 * descending (spec §5.1). Text columns still open A→Z.
 */
const DESC_FIRST: ReadonlySet<Sort> = new Set<Sort>(['ratingCount', 'sellerCount', 'lastSweptAt', 'addedAt']);

/**
 * Everything the filter bar holds — the unit a saved preset stores and restores. The sort is
 * deliberately not in it: Temizle does not touch the sort, and neither does applying a preset
 * (spec §5.1). A preset saved before a key existed applies with that key at its default.
 */
interface Filters {
  text: string;
  brandId: string;
  categoryRef: string;
  active: string;
  searchTermOnly: boolean;
  unratedOnly: boolean;
  noSellerOnly: boolean;
  /**
   * Keep cards nobody sells in the list alongside the rest (`includeNoSeller=true`), instead of
   * the default of hiding them. What İzlenen Markalar' count links ask for, since their numbers
   * include those cards. Mutually exclusive with `noSellerOnly`.
   */
  includeNoSeller: boolean;
  minRatingCount: string;
  /** `"{marketplaceCode}:{sellerRef}"`, `''` = every seller. */
  seller: string;
  minSellerCount: string;
}

const EMPTY_FILTERS: Filters = {
  text: '',
  brandId: '',
  categoryRef: '',
  active: '',
  searchTermOnly: false,
  unratedOnly: false,
  noSellerOnly: false,
  includeNoSeller: false,
  minRatingCount: '',
  seller: '',
  minSellerCount: '',
};

/** `"TY:123"` → its two halves; split on the first `:` only, since a ref may contain one. */
function splitSeller(encoded: string): { marketplaceCode: string; sellerRef: string } | null {
  const at = encoded.indexOf(':');
  if (at <= 0 || at === encoded.length - 1) return null;
  return { marketplaceCode: encoded.slice(0, at), sellerRef: encoded.slice(at + 1) };
}

/** Mirrors `CSV_EXPORT_LIMIT` in `api/tracked-products/route.ts` — shown in the button's title. */
const CSV_EXPORT_ROW_CAP = 5000;

/**
 * Mirrors `RESCAN_MAX_PRODUCTS` in `packages/jobs` — the ceiling the rescan endpoint enforces.
 * Held here too so the button can say why it is disabled instead of round-tripping to find out.
 */
const RESCAN_MAX_PRODUCTS = 50;

type ColumnId =
  | 'favourite'
  | 'label'
  | 'brandProduct'
  | 'brand'
  | 'category'
  | 'marketplace'
  | 'productRef'
  | 'rating'
  | 'sellerCount'
  | 'medianPrice'
  | 'spreadPct'
  | 'buyboxPrice'
  | 'buyboxSeller'
  | 'periodMinPrice'
  | 'periodMaxPrice'
  | 'referencePrice'
  | 'refGapPct'
  | 'discovery'
  | 'lastSwept'
  | 'lastScraped'
  | 'addedAt';

/**
 * Columns most operators need are visible; the identifiers and provenance ones are one click
 * away. `hiddenByDefault` is not "less important" — `discovery` is the brand-misuse signal — it
 * is "already shown another way": a search-term-only row carries a badge in the Ürün column, so
 * the column is redundant until someone wants to sort or export by it.
 *
 * Two families of price column sit here and they answer different questions. **Medyan, Makas,
 * Buybox** describe the latest look — the market right now. **Dönem …** describe the whole
 * window, so they are the ones that catch a seller who dropped under the market for two days and
 * came back up. Only the period family survives an export (see `tracked-product-columns.ts` for
 * why), which is also why Makas is the visible one of the current family: it is the figure worth
 * scanning a page for.
 *
 * **Satıcı** is the distinct sellers of the last 30 days since 2026-11-08 (spec §4.3), not the
 * latest look's count — so it sorts, filters and exports. The old hidden _Dönem Satıcı_ column
 * is gone (it would repeat it); a stored column preference naming it is ignored by
 * `useColumnPrefs`.
 */
const COLUMN_DEFS: readonly ColumnDef<ColumnId>[] = [
  // The star and the product it belongs to are the brand module's two "is this one of mine?"
  // columns (doc 17 §4.1): a favourite is in İlanlar whoever's product it is, a linked card is
  // one of the manager's own and carries its PSF.
  { id: 'favourite', label: '★', defaultWidth: 44 },
  { id: 'label', label: 'Ürün', defaultWidth: 320 },
  { id: 'brandProduct', label: 'Stok Ürünü', defaultWidth: 180 },
  { id: 'brand', label: 'Marka', defaultWidth: 120, hiddenByDefault: true },
  { id: 'category', label: 'Kategori', defaultWidth: 180 },
  { id: 'marketplace', label: 'Pazaryeri', defaultWidth: 110, hiddenByDefault: true },
  { id: 'productRef', label: 'Ürün Kodu', defaultWidth: 120, hiddenByDefault: true },
  { id: 'rating', label: 'Değerlendirme', defaultWidth: 130 },
  { id: 'sellerCount', label: 'Satıcı', defaultWidth: 80 },
  { id: 'medianPrice', label: 'Medyan', defaultWidth: 110, hiddenByDefault: true },
  { id: 'spreadPct', label: 'Makas', defaultWidth: 90 },
  { id: 'buyboxPrice', label: 'Buybox Fiyat', defaultWidth: 120 },
  { id: 'buyboxSeller', label: 'Buybox Satıcı', defaultWidth: 160 },
  { id: 'periodMinPrice', label: 'Dönem En Düşük', defaultWidth: 130, hiddenByDefault: true },
  { id: 'periodMaxPrice', label: 'Dönem En Yüksek', defaultWidth: 130, hiddenByDefault: true },
  { id: 'referencePrice', label: 'Tavsiye Fiyat', defaultWidth: 120 },
  { id: 'refGapPct', label: 'Tavsiyeye Fark', defaultWidth: 120 },
  { id: 'discovery', label: 'Bulunma', defaultWidth: 130, hiddenByDefault: true },
  { id: 'lastSwept', label: 'Son Tarama', defaultWidth: 150 },
  { id: 'lastScraped', label: 'Son Bakış', defaultWidth: 150, hiddenByDefault: true },
  { id: 'addedAt', label: 'Eklenme', defaultWidth: 150, hiddenByDefault: true },
];

/** Which sort a column drives, or `undefined` for a column the server cannot order by. */
const SORT_FOR_COLUMN: Partial<Record<ColumnId, Sort>> = {
  label: 'label',
  category: 'categoryName',
  rating: 'ratingCount',
  sellerCount: 'sellerCount',
  lastSwept: 'lastSweptAt',
  addedAt: 'addedAt',
};

/** Kuruş string → the grid's money cell, empty-dashed when there is nothing to show. */
function moneyCell(value: string | null | undefined) {
  return <span className="tabular-nums">{value ? formatMoney(BigInt(value)) : '—'}</span>;
}

/**
 * Takip edilen ürünler — hem link ile eklenen tekil ürünler hem marka taramasının bulduğu
 * ürünler (doc 06 §12.2, api-references §1.7).
 *
 * Sunucu tarafında sayfalanır, filtrelenir ve sıralanır. Bir marka taraması bu tabloya binlerce
 * satır koyar (Whiskas 887, Royal Canin 4.863) — hepsini tarayıcıya indirmek ilk sürümün
 * yapabildiği ama bu ölçekte yapılamayacak bir şey.
 *
 * Reprice/ObserveBuybox bu ekranın verisini hiç görmez — ayrı bir tablo (`tracked_products`),
 * listings değil.
 */
export function TrackedProductsClient() {
  const searchParams = useSearchParams();
  /**
   * `null` until the first successful load — distinct from "loaded, zero rows" (doc 15 §3.2's
   * six-state contract). An empty array here would make a failed first load indistinguishable
   * from a filter that genuinely matches nothing.
   */
  const [products, setProducts] = useState<TrackedProduct[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  /** An action's own failure (add, rescan) — shown as a banner near that action. */
  const [error, setError] = useState<string | null>(null);
  /**
   * `/api/tracked-products` itself failing, kept apart from `error` above (mirrors `jobs-client`'s
   * `loadError`/`error` split). Before this the primary load had no failure path at all — a
   * rejected fetch left `loading` cleared and the grid silently read as "Bu filtrelerle ürün
   * bulunamadı," which is the §3.2 loading/error conflation the baseline recorded elsewhere.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** The row whose _Ürünüme bağla_ panel is open, and what that panel has been told so far. */
  const [linkFor, setLinkFor] = useState<TrackedProduct | null>(null);
  const [linkProductId, setLinkProductId] = useState('');
  const [linkMultiplier, setLinkMultiplier] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [brandProducts, setBrandProducts] = useState<{ id: string; name: string }[]>([]);

  const [brands, setBrands] = useState<WatchedBrandOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);

  /**
   * Seeded from the query string, so `/tracked-products?watchedBrandId=…` lands on that brand's
   * products already filtered. That is what the brand links on İzlenen Markalar navigate to —
   * "bu markanın ürünlerini göster" is a question this screen already answers, and the link
   * spares the operator re-picking the brand from a dropdown after arriving.
   *
   * Read once, as the initial value: from here on the filter bar owns the state. Keeping the two
   * in sync in both directions would fight the operator every time they cleared the filter.
   */
  const [filters, setFiltersState] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    brandId: searchParams.get('watchedBrandId') ?? '',
    categoryRef: searchParams.get('categoryRef') ?? '',
    text: searchParams.get('text') ?? '',
    unratedOnly: searchParams.get('unratedOnly') === 'true',
    noSellerOnly: searchParams.get('noSellerOnly') === 'true',
    includeNoSeller:
      searchParams.get('noSellerOnly') !== 'true' && searchParams.get('includeNoSeller') === 'true',
    searchTermOnly: searchParams.get('searchTermOnly') === 'true',
    // Both halves or neither — a seller ref means nothing without its marketplace (spec §5.1).
    seller:
      searchParams.get('sellerMarketplace') && searchParams.get('sellerRef')
        ? `${searchParams.get('sellerMarketplace')}:${searchParams.get('sellerRef')}`
        : '',
    minSellerCount: searchParams.get('minSellerCount') ?? '',
  }));
  // Most-reviewed first (spec §2): those are the cards this screen is opened for.
  const [sort, setSort] = useState<Sort>('ratingCount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [link, setLink] = useState('');
  const [label, setLabel] = useState('');
  const [presetName, setPresetName] = useState('');

  /**
   * Ticked rows, by id, across pages — a `Set` rather than a per-row flag so a selection made on
   * page 1 survives paging to page 2 and back. Cleared when the filters change: the selection
   * would otherwise carry rows the operator can no longer see, and a rescan they cannot review
   * before pressing is exactly the surprise this screen should not spring.
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const columns = useColumnPrefs<ColumnId>('trackedProducts.columns', COLUMN_DEFS);
  const presets = useFilterPresets<Filters>('trackedProducts.filterPresets');

  /** Any filter change goes back to page 1 — page 7 of the previous result set means nothing. */
  function setFilters(next: Filters) {
    setPage(0);
    setSelected(new Set());
    setFiltersState(next);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Shared by the fetch and the CSV link, so a filtered export matches the filtered grid. */
  const filterParams = useCallback(() => {
    const p = new URLSearchParams({ sort, sortDir });
    if (filters.text.trim()) p.set('text', filters.text.trim());
    if (filters.brandId) p.set('watchedBrandId', filters.brandId);
    if (filters.categoryRef) p.set('categoryRef', filters.categoryRef);
    if (filters.active) p.set('isActive', filters.active);
    if (filters.searchTermOnly) p.set('searchTermOnly', 'true');
    if (filters.unratedOnly) p.set('unratedOnly', 'true');
    if (filters.noSellerOnly) p.set('noSellerOnly', 'true');
    else if (filters.includeNoSeller) p.set('includeNoSeller', 'true');
    if (filters.minRatingCount.trim()) p.set('minRatingCount', filters.minRatingCount.trim());
    const seller = splitSeller(filters.seller);
    if (seller) {
      p.set('sellerMarketplace', seller.marketplaceCode);
      p.set('sellerRef', seller.sellerRef);
    }
    if (filters.minSellerCount.trim()) p.set('minSellerCount', filters.minSellerCount.trim());
    return p;
  }, [filters, sort, sortDir]);

  const load = useCallback(() => {
    setLoading(true);
    const p = filterParams();
    p.set('limit', String(pageSize));
    p.set('offset', String(page * pageSize));
    fetch(`/api/tracked-products?${p.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { products: TrackedProduct[]; total: number }) => {
        setProducts(d.products);
        setTotal(d.total);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [filterParams, page, pageSize]);

  useEffect(load, [load]);

  useEffect(() => {
    fetch('/api/watched-brands')
      .then((r) => r.json())
      .then((d: { groups: { brands: WatchedBrandOption[] }[] }) =>
        setBrands(d.groups.flatMap((g) => g.brands)),
      );
  }, []);

  // The link panel's product list. Loaded once the panel opens rather than with the page: most
  // visits never link anything, and a brand catalogue is thousands of rows behind this grid.
  useEffect(() => {
    if (!linkFor) return;
    fetch('/api/brand-products?limit=200')
      .then((r) => r.json())
      .then((d: { products: { id: string; name: string }[] }) => setBrandProducts(d.products))
      .catch(() => setBrandProducts([]));
  }, [linkFor]);

  useEffect(() => {
    const q = filters.brandId ? `?watchedBrandId=${encodeURIComponent(filters.brandId)}` : '';
    fetch(`/api/tracked-products/categories${q}`)
      .then((r) => r.json())
      .then((d: { categories: CategoryOption[] }) => setCategories(d.categories));
  }, [filters.brandId]);

  // The Satıcı dropdown's options, scoped to the chosen brand like the category list. A failure
  // leaves the list empty rather than breaking the screen — it is a convenience on the filter.
  useEffect(() => {
    const q = filters.brandId ? `?watchedBrandId=${encodeURIComponent(filters.brandId)}` : '';
    fetch(`/api/tracked-products/sellers${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { sellers: SellerOption[] }) => setSellers(d.sellers))
      .catch(() => setSellers([]));
  }, [filters.brandId]);

  const sellerOptions = useMemo(() => {
    // The marketplace is shown only when the list spans more than one (spec §5.1).
    const several = new Set(sellers.map((s) => s.marketplaceCode)).size > 1;
    const options = sellers.map((s) => ({
      value: `${s.marketplaceCode}:${s.sellerRef}`,
      label: `${s.sellerName ?? s.sellerRef}${several ? ` (${s.marketplaceCode})` : ''}`,
      hint: `${formatNumber(s.productCount)} ürün`,
    }));
    // A seller chosen earlier (a link, a preset, another brand) stays visible on the button even
    // when the current list does not carry it.
    if (filters.seller && !options.some((o) => o.value === filters.seller)) {
      options.unshift({
        value: filters.seller,
        label: splitSeller(filters.seller)?.sellerRef ?? filters.seller,
        hint: '',
      });
    }
    return [{ value: '', label: 'Tümü' }, ...options];
  }, [sellers, filters.seller]);

  function onSort(column: ColumnId) {
    const next = SORT_FOR_COLUMN[column];
    if (!next) return;
    setPage(0);
    if (next === sort) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(next);
      setSortDir(DESC_FIRST.has(next) ? 'desc' : 'asc');
    }
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tracked-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link, label }),
      });
      if (res.ok) {
        setLink('');
        setLabel('');
        load();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Eklenemedi.');
      }
    } finally {
      setBusy(false);
    }
  }

  /** Confirmation lives on the button (`ConfirmButton`, §3.6) — this only performs the removal. */
  async function remove(id: string) {
    await fetch(`/api/tracked-products?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }

  /**
   * Queues a `RescanTrackedProducts` run for the given rows and says so.
   *
   * Deliberately does **not** reload the grid on success: the job has been queued, not run, and
   * refreshing here would redraw the same figures and read as "nothing happened". The operator is
   * told where the progress is instead, and reloads when they want the new numbers.
   */
  async function rescan(ids: readonly string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/tracked-products/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as { error?: string; queued?: number };
      if (!res.ok) {
        setError(data.error ?? 'Tarama kuyruğa alınamadı.');
        return;
      }
      setSelected(new Set());
      setNotice(
        `${data.queued ?? ids.length} ürün için tarama kuyruğa alındı. İlerlemesini İşler ekranından izleyebilir, bitince bu sayfayı yenileyebilirsiniz.`,
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * The favourite star (doc 17 §4.1). Written straight through and the row patched locally: the
   * grid is server-paged and a reload for one star would lose the operator's scroll position.
   */
  async function toggleFavourite(product: TrackedProduct) {
    const next = !product.isFavourite;
    const res = await fetch('/api/tracked-products/favourite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: product.id, isFavourite: next }),
    });
    if (res.ok) {
      setProducts((rows) =>
        rows === null
          ? rows
          : rows.map((row) => (row.id === product.id ? { ...row, isFavourite: next } : row)),
      );
    }
  }

  /**
   * _Ürünüme bağla_ (doc 17 §2.4). The multiplier field is **empty on purpose** — the product
   * owner's requirement is that "one purchase delivers how many units?" is asked, and a
   * pre-filled 1 is a question nobody reads.
   */
  async function linkToBrandProduct() {
    if (!linkFor) return;
    const count = Number(linkMultiplier);
    if (linkProductId === '') {
      setLinkError('Bir stok ürünü seçin.');
      return;
    }
    if (!Number.isSafeInteger(count) || count < 1) {
      setLinkError('Adet çarpanı 1 veya daha büyük bir tam sayı olmalı.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/brand-products/${linkProductId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackedProductId: linkFor.id, unitMultiplier: count }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setLinkError(data.error ?? 'Bağlanamadı.');
        return;
      }
      setLinkFor(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string, isActive: boolean) {
    await fetch('/api/tracked-products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], isActive }),
    });
    load();
  }

  const visibleColumns = useMemo(() => columns.order.filter((id) => columns.isVisible(id)), [columns]);

  // The primary load's own six-state handling (doc 15 §3.2): a failed first load is retryable, a
  // first load in flight says so. After this point `products` is never `null` — every reference
  // below assumes a real array, loaded or genuinely empty.
  if (!products && loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }
  if (!products) {
    return <LoadingState message="Ürünler yükleniyor…" skeletonRows={4} />;
  }

  // "Select all" is **this page**, never the whole filtered set. A brand holds thousands of rows
  // and the rescan ceiling is fifty, so a header tick that meant "all 4,863" could only ever be
  // refused — and the row it would have selected is one the operator never saw.
  const pageAllSelected = products.length > 0 && products.every((p) => selected.has(p.id));

  const hasActiveFilters =
    filters.text !== '' ||
    filters.brandId !== '' ||
    filters.categoryRef !== '' ||
    filters.active !== '' ||
    filters.searchTermOnly ||
    filters.unratedOnly ||
    filters.noSellerOnly ||
    filters.includeNoSeller ||
    filters.minRatingCount !== '' ||
    filters.seller !== '' ||
    filters.minSellerCount !== '';

  /** How many of the filters tucked into _Diğer_ are on — so a hidden filter is never invisible. */
  const otherActive =
    (filters.active !== '' ? 1 : 0) +
    (filters.searchTermOnly ? 1 : 0) +
    (filters.unratedOnly ? 1 : 0) +
    (filters.noSellerOnly || filters.includeNoSeller ? 1 : 0);

  /** The three-way no-seller choice: hidden (default), shown with the rest, or shown alone. */
  const noSellerMode = filters.noSellerOnly ? 'only' : filters.includeNoSeller ? 'include' : '';

  function renderCell(id: ColumnId, p: TrackedProduct) {
    // One reduction of the latest look, shared by every current-market cell — so Medyan, Makas
    // and Buybox cannot disagree with each other about the same row. (Satıcı is the 30-day count
    // from the row since 2026-11-08, not part of this reduction.)
    const market = marketSnapshot(p.latest);
    switch (id) {
      case 'favourite':
        return (
          // kit-exempt: favourite star toggle, a pressed icon state the kit has no control for
          <button
            type="button"
            aria-label={p.isFavourite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
            aria-pressed={p.isFavourite}
            title={
              p.isFavourite
                ? 'Favori: İlanlar listesinde ve rotasyonda önde'
                : 'Favoriye al — kendi ürünün olmasa da gözünün önünde kalsın'
            }
            onClick={() => void toggleFavourite(p)}
            className={
              p.isFavourite ? 'text-(--color-accent)' : 'text-(--color-muted) hover:text-(--color-accent)'
            }
          >
            {p.isFavourite ? '★' : '☆'}
          </button>
        );
      case 'brandProduct':
        return p.brandProduct ? (
          <Link
            href={`/brand/products/${p.brandProduct.id}`}
            className="text-(--color-accent) hover:underline"
          >
            {p.brandProduct.name}
            {p.brandProduct.unitMultiplier > 1 && (
              <span className="ml-1 text-xs text-(--color-muted)">×{p.brandProduct.unitMultiplier}</span>
            )}
          </Link>
        ) : (
          <span className="text-(--color-muted)">—</span>
        );
      case 'label':
        return (
          <>
            <Link href={`/tracked-products/${p.id}`} className="text-(--color-accent) hover:underline">
              {p.label}
            </Link>
            {(() => {
              const pageUrl = marketplaceProductUrl(p.marketplaceCode, p.productUrl);
              return pageUrl ? (
                <a
                  href={pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Pazaryerindeki ürün sayfası"
                  className="ml-1 text-(--color-muted) hover:text-(--color-accent)"
                >
                  ↗
                </a>
              ) : null;
            })()}
            {/* Marka adını taşıyor ama pazaryeri markaya atfetmiyor — denetim sinyali. */}
            {isBrandNameOnly(p) && (
              <span className="ml-1 inline-block align-middle">
                <Chip
                  tone="warn"
                  title="Bu ürün marka adıyla arandığında çıkıyor ama pazaryeri onu bu markaya atfetmiyor."
                >
                  sadece arama
                </Chip>
              </span>
            )}
          </>
        );
      case 'brand':
        return p.brandName ?? '—';
      case 'category':
        return p.categoryName ?? '—';
      case 'marketplace':
        return p.marketplaceCode;
      case 'productRef':
        return <span className="font-mono text-xs">{p.productRef}</span>;
      case 'rating':
        return p.ratingCount === null ? (
          <span className="text-(--color-muted)" title="Değerlendirme okunamadı">
            —
          </span>
        ) : (
          <span className="tabular-nums">
            {formatNumber(p.ratingCount)}
            {p.ratingAverage !== null && (
              <span className="ml-1 text-xs text-(--color-muted)">({p.ratingAverage.toFixed(1)})</span>
            )}
          </span>
        );
      case 'sellerCount':
        return (
          <span className="tabular-nums" title="Son 30 günde görülen farklı satıcı sayısı">
            {formatNumber(p.sellerCount)}
          </span>
        );
      case 'medianPrice':
        return moneyCell(market.medianPrice?.toString() ?? null);
      case 'spreadPct':
        // A wide spread on one product is where an audit starts: the same item, the same day,
        // and a gap between the cheapest and the dearest seller that the market does not explain.
        return market.spreadPct === null ? (
          <span className="text-(--color-muted)" title="Tek satıcı — makas yok">
            —
          </span>
        ) : (
          <span className={`tabular-nums${market.spreadPct >= 30 ? ' text-(--color-warning)' : ''}`}>
            {formatPercent(market.spreadPct)}
          </span>
        );
      case 'buyboxPrice':
        return moneyCell(market.buyboxPrice?.toString() ?? null);
      case 'buyboxSeller':
        return market.buyboxSeller ?? '—';
      case 'periodMinPrice':
        return moneyCell(p.period?.minPrice);
      case 'periodMaxPrice':
        return moneyCell(p.period?.maxPrice);
      case 'referencePrice':
        return moneyCell(p.referencePrice);
      case 'refGapPct': {
        // The two prices are unrelated facts until this column puts them side by side: a
        // published price with nothing measured against it is a number in a spreadsheet.
        // `—` for either half missing, never `0%` — "we published no price" and "the market is
        // exactly on it" would then look the same.
        if (!p.referencePrice || market.buyboxPrice === null) {
          return (
            <span
              className="text-(--color-muted)"
              title={
                p.referencePrice
                  ? 'Bu bakışta buybox fiyatı yok'
                  : 'Bu kart bir stok ürününe bağlı değil, PSF yok'
              }
            >
              —
            </span>
          );
        }
        const reference = BigInt(p.referencePrice);
        if (reference <= 0n) return <span className="text-(--color-muted)">—</span>;
        // Exact kuruş arithmetic, then a percentage — never a float division of two prices.
        const gapPct = Number(((market.buyboxPrice - reference) * 10_000n) / reference) / 100;
        return (
          <span className={`tabular-nums${gapPct <= -5 ? ' text-(--color-warning)' : ''}`}>
            {formatPercent(gapPct)}
          </span>
        );
      }
      case 'discovery':
        return <span className="text-xs">{discoveryLabel(p)}</span>;
      case 'lastSwept':
        return <Ago at={p.lastSweptAt} never="henüz taranmadı" />;
      case 'lastScraped':
        // "Son Tarama" is the catalogue sweep, "Son Bakış" is the per-product price scrape.
        // Two different jobs at two different cadences, so two columns rather than one.
        return <Ago at={p.lastScrapedAt} never="hiç bakılmadı" />;
      case 'addedAt':
        return <Ago at={p.addedAt} />;
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Takip Edilen Ürünler"
        breadcrumb={[{ label: 'Marka Denetimi' }, { label: 'Takip Edilen Ürünler' }]}
        description={
          <>
            Satmadığımız ürünlerin fiyat, satıcı ve değerlendirme bilgisi — link ile ya da{' '}
            <Link href="/watched-brands" className="text-(--color-accent) hover:underline">
              izlenen marka
            </Link>{' '}
            taramasıyla gelir. <strong>Raporlamadır</strong>, hiçbir fiyat kararını etkilemez.
          </>
        }
        action={
          <div className="flex items-center gap-2">
            {/* The add-by-link form, moved out of the page body into the header (spec §5 item 1). */}
            <PopoverButton label="+ Link ile ekle" align="right" panelClassName="w-[28rem]">
              <div className="flex flex-col gap-2">
                <Field label="Ürün linki">
                  <TextInput
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://www.trendyol.com/... veya https://www.hepsiburada.com/..."
                    className="w-full"
                  />
                </Field>
                <Field label="Etiket (opsiyonel)">
                  <TextInput
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Kolay tanımak için bir isim"
                    className="w-full"
                  />
                </Field>
                <div>
                  <Button type="button" disabled={busy || !link.trim()} onClick={() => void add()}>
                    {busy ? 'Ekleniyor…' : 'Ekle'}
                  </Button>
                </div>
                {error && (
                  <p role="alert" className="text-xs text-(--color-danger)">
                    {error}
                  </p>
                )}
              </div>
            </PopoverButton>
            <ColumnMenu defs={COLUMN_DEFS} prefs={columns} />
            <a
              href={`/api/tracked-products?${(() => {
                const p = filterParams();
                p.set('format', 'csv');
                // What the grid is showing, in the order it is showing it — the export honours the
                // operator's column choices, not a second list living in the route.
                p.set('columns', visibleColumns.join(','));
                return p.toString();
              })()}`}
              className={buttonClass('secondary', 'sm')}
              title={`Geçerli filtreyle eşleşen ilk ${CSV_EXPORT_ROW_CAP.toLocaleString('tr-TR')} ürünü indirir — ekrandaki sayfayı değil`}
            >
              <Icon icon={Download} />
              Excel&apos;e Aktar
            </a>
          </div>
        }
      />

      {/* One summary line instead of three stat cards and a separate sweep card (spec §5 item 3).
          Only numbers the screen already holds — no extra query. "Ürün" is the filtered total. */}
      <p
        data-testid="tracked-summary"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-(--color-muted)"
      >
        <span>
          <strong className="text-(--color-fg) tabular-nums">{formatNumber(total)}</strong> ürün
        </span>
        <span aria-hidden>·</span>
        <span>{formatNumber(brands.length)} marka</span>
        <span aria-hidden>·</span>
        <span>{formatNumber(categories.length)} kategori</span>
        <SweepPassCard marketplaceCode="trendyol" scope="all" label="Tarama turu" variant="chip" />
      </p>

      {/* A refresh (filter/sayfa değişikliği) başarısız oldu ama önceki liste hâlâ ekranda —
          sessizce eskimesine izin vermek yerine söylüyoruz (§3.2 "Stale"). */}
      {loadError && (
        <p
          role="alert"
          className="rounded-lg border border-(--color-warning-border) bg-(--color-warning-bg) px-3 py-2 text-sm"
        >
          Son yenileme başarısız oldu ({loadError}). Aşağıdaki liste artık güncel olmayabilir.
        </p>
      )}

      {/* ---- filtreler: tek şerit (spec §5 item 4, layout A) ---- */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-(--color-border) bg-(--color-surface) p-3 shadow-(--shadow-card)">
        <Field label="Ara">
          <TextInput
            icon={Search}
            value={filters.text}
            onChange={(e) => setFilters({ ...filters, text: e.target.value })}
            placeholder="Ürün adı veya kodu"
            className="w-52"
          />
        </Field>
        <Field label="Marka">
          <Select
            value={filters.brandId}
            onChange={(e) => setFilters({ ...filters, brandId: e.target.value, categoryRef: '' })}
            className="w-36"
            options={[{ value: '', label: 'Tümü' }, ...brands.map((b) => ({ value: b.id, label: b.label }))]}
          />
        </Field>
        <Field label="Kategori">
          <Select
            value={filters.categoryRef}
            onChange={(e) => setFilters({ ...filters, categoryRef: e.target.value })}
            className="w-44"
            options={[
              { value: '', label: 'Tümü' },
              ...categories.map((c) => ({ value: c.ref, label: `${c.name} (${c.productCount})` })),
            ]}
          />
        </Field>
        {/* Not a `Field`: a <label> around a popover would forward clicks inside it to the button. */}
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium" title="Son 30 günde bu ürünü herhangi bir anda satmış satıcı">
            Satıcı
          </span>
          <SearchableSelect
            label="Satıcı filtresi"
            value={filters.seller}
            options={sellerOptions}
            onChange={(seller) => setFilters({ ...filters, seller })}
            placeholder="Satıcı adı yazın…"
            className="w-48"
          />
        </div>
        <Field label="Değ. ≥">
          <TextInput
            type="number"
            min={0}
            value={filters.minRatingCount}
            onChange={(e) => setFilters({ ...filters, minRatingCount: e.target.value })}
            placeholder="0"
            className="w-20"
            title="En az değerlendirme sayısı"
          />
        </Field>
        <Field label="Satıcı ≥">
          <TextInput
            type="number"
            min={0}
            value={filters.minSellerCount}
            onChange={(e) => setFilters({ ...filters, minSellerCount: e.target.value })}
            placeholder="0"
            className="w-20"
            title="Son 30 günde en az bu kadar farklı satıcı"
          />
        </Field>
        <PopoverButton label={otherActive > 0 ? `Diğer (${otherActive})` : 'Diğer'} panelClassName="w-80">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-medium">Durum</span>
              <SegmentedFilter
                label="Durum"
                value={filters.active}
                onChange={(active) => setFilters({ ...filters, active })}
                options={[
                  { value: '', label: 'Tümü' },
                  { value: 'true', label: 'Aktif' },
                  { value: 'false', label: 'Duraklatıldı' },
                ]}
              />
            </div>
            <label
              className="flex items-center gap-2 text-xs"
              title="Marka adını taşıyan ama pazaryerinin markaya atfetmediği ürünler"
            >
              <input
                type="checkbox"
                checked={filters.searchTermOnly}
                onChange={(e) => setFilters({ ...filters, searchTermOnly: e.target.checked })}
              />
              Sadece aramada çıkanlar
            </label>
            <label
              className="flex items-center gap-2 text-xs"
              title="Pazaryerinin hiç değerlendirme kaydetmediği ürünler"
            >
              <input
                type="checkbox"
                checked={filters.unratedOnly}
                onChange={(e) => setFilters({ ...filters, unratedOnly: e.target.checked })}
              />
              Değerlendirmesi olmayanlar
            </label>
            {/* Three states, not a checkbox: hidden by default, "Dahil" for the brand count links
                (their numbers include these cards), "Sadece" for the lost-shelf shortlist. */}
            <div
              className="flex flex-col gap-1"
              title="Son başarılı bakışta satanı olmayan ürünler varsayılan olarak gizlenir. Henüz bakılmamış ürünler satıcısız sayılmaz."
            >
              <span className="font-medium">Satıcısızları göster</span>
              <SegmentedFilter
                label="Satıcısızları göster"
                value={noSellerMode}
                onChange={(mode) =>
                  setFilters({
                    ...filters,
                    noSellerOnly: mode === 'only',
                    includeNoSeller: mode === 'include',
                  })
                }
                options={[
                  { value: '', label: 'Hayır' },
                  { value: 'include', label: 'Dahil' },
                  { value: 'only', label: 'Sadece' },
                ]}
              />
            </div>
          </div>
        </PopoverButton>
        {/* Saved presets in one dropdown (spec §5 item 4). They store filters, never the sort. */}
        <PopoverButton label="Kayıtlı" panelClassName="w-72">
          {(close) => (
            <div className="flex flex-col gap-2 text-xs">
              {presets.presets.length === 0 && (
                <span className="text-(--color-muted)">Kayıtlı filtre yok.</span>
              )}
              {presets.presets.map((preset) => (
                <span key={preset.name} className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => {
                      setFilters({ ...EMPTY_FILTERS, ...preset.value });
                      close();
                    }}
                  >
                    {preset.name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    icon={X}
                    aria-label={`${preset.name} kaydını sil`}
                    title="Bu kaydı sil"
                    onClick={() => presets.remove(preset.name)}
                  />
                </span>
              ))}
              <div className="flex items-center gap-1 border-t border-(--color-border) pt-2">
                <TextInput
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Kayıt adı"
                  aria-label="Kayıt adı"
                  className="w-32"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  disabled={!presetName.trim()}
                  onClick={() => {
                    presets.save(presetName, filters);
                    setPresetName('');
                  }}
                >
                  Mevcut filtreyi kaydet…
                </Button>
              </div>
            </div>
          )}
        </PopoverButton>
        {/* Filters only: the sort is not a filter and stays as it is (spec §5 item 4). */}
        <Button variant="secondary" size="sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>
          Temizle
        </Button>
      </div>

      {linkFor && (
        <div
          role="group"
          aria-label="Kartı stok ürününe bağla"
          className="rounded-xl border border-(--color-accent) bg-(--color-surface) p-4 text-sm"
        >
          <p className="mb-2">
            <strong>{linkFor.label}</strong> kartını hangi stok ürününe bağlayalım?
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Stok ürünü">
              <Select
                value={linkProductId}
                onChange={(e) => setLinkProductId(e.target.value)}
                className="w-72"
                options={[
                  { value: '', label: 'Seçin…' },
                  ...brandProducts.map((product) => ({ value: product.id, label: product.name })),
                ]}
              />
            </Field>
            {/* Empty on purpose — doc 17 §2.4: the question has to be asked, not pre-answered. */}
            <Field label="Adet çarpanı" hint="Bir alışta kaç birim gider?">
              <TextInput
                value={linkMultiplier}
                onChange={(e) => setLinkMultiplier(e.target.value)}
                inputMode="numeric"
                placeholder="örn. 3"
                className="w-28"
              />
            </Field>
            <Button type="button" disabled={busy} onClick={() => void linkToBrandProduct()}>
              {busy ? 'Bağlanıyor…' : 'Bağla'}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setLinkFor(null)}>
              Vazgeç
            </Button>
          </div>
          {brandProducts.length === 0 && (
            <p className="mt-2 text-xs text-(--color-muted)">
              Henüz stok ürünü yok.{' '}
              <Link className="underline" href="/brand/products">
                Stok ekranından
              </Link>{' '}
              bir ürün ekleyin.
            </p>
          )}
          {linkError && (
            <p role="alert" className="mt-2 text-xs text-(--color-danger)">
              {linkError}
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-(--color-danger)">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" aria-live="polite" className="text-sm text-(--color-accent)">
          {notice}
        </p>
      )}

      {/* ---- seçim işlemleri: yalnız bir satır seçiliyken (spec §5 item 5) ---- */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{formatNumber(selected.size)} ürün seçildi</span>
          <Button
            size="sm"
            type="button"
            disabled={busy || selected.size > RESCAN_MAX_PRODUCTS}
            onClick={() => void rescan([...selected])}
            title={
              selected.size > RESCAN_MAX_PRODUCTS
                ? `Tek seferde en fazla ${RESCAN_MAX_PRODUCTS} ürün taranabilir`
                : 'Seçilen ürünlerin satıcı ve fiyat verisini şimdi yeniden okur'
            }
          >
            Seçilenleri Tekrar Tara
          </Button>
          {selected.size > RESCAN_MAX_PRODUCTS && (
            <span className="text-xs text-(--color-warning)">
              Tek seferde en fazla {RESCAN_MAX_PRODUCTS} ürün — bir markanın tamamı için İzlenen Markalar
              ekranındaki &quot;Şimdi tara&quot; kullanılır.
            </span>
          )}
          <Button variant="ghost" size="sm" type="button" onClick={() => setSelected(new Set())}>
            Seçimi temizle
          </Button>
          <span className="text-xs text-(--color-muted)">
            Tarama arka planda çalışır; sırası ve ilerlemesi{' '}
            <Link href="/jobs" className="text-(--color-accent) hover:underline">
              İşler
            </Link>{' '}
            ekranında görünür.
          </span>
        </div>
      )}

      <Pagination state={{ page, pageSize, total, setPage, setPageSize }} label="ürün">
        {/* A filter/sayfa değişikliği sonrası yeniden yükleme — ilk yükleme değil, o zaten
            `LoadingState` ile karşılanıyor (§3.2 "Busy"). */}
        {loading && <span aria-live="polite"> · yükleniyor…</span>}
      </Pagination>

      {products.length === 0 ? (
        <EmptyState
          message={hasActiveFilters ? 'Bu filtrelerle ürün bulunamadı.' : 'Gösterilecek ürün yok.'}
          reason={
            hasActiveFilters
              ? 'Farklı bir filtre deneyin ya da temizleyin.'
              : // Not "no products": the default hides cards nobody sells, so the table may be
                // full of them (spec §2). Say so, and where to show them.
                'Satıcısı olmayan ürünler varsayılan olarak gizlidir — Diğer › Satıcısızları göster ile görebilirsiniz. Yeni ürün için + Link ile ekle, ya da izlenen bir markanın taramasını bekleyin.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>
                Filtreleri Temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableFrame>
          <table className="text-sm" style={resizableTableStyle(COLUMN_DEFS, columns, 32 + 140)}>
            <thead
              className={`${STICKY_HEAD} bg-(--color-hover) text-left text-xs uppercase text-(--color-muted)`}
            >
              <tr>
                <th className="px-2 py-2" style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    aria-label="Bu sayfadaki ürünleri seç"
                    title="Bu sayfadaki ürünleri seç"
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const p of products) {
                          if (e.target.checked) next.add(p.id);
                          else next.delete(p.id);
                        }
                        return next;
                      })
                    }
                  />
                </th>
                {visibleColumns.map((id) => {
                  const def = COLUMN_DEFS.find((d) => d.id === id)!;
                  const sortable = SORT_FOR_COLUMN[id];
                  const active = sortable === sort;
                  return (
                    <ResizableTh key={id} id={id} prefs={columns} className="px-2 py-2">
                      {sortable ? (
                        // kit-exempt: sortable column header inside a resizable th
                        <button
                          type="button"
                          onClick={() => onSort(id)}
                          className={`flex items-center gap-1 uppercase ${active ? 'text-(--color-fg)' : ''}`}
                        >
                          {def.label}
                          {active && <span aria-hidden>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                        </button>
                      ) : (
                        def.label
                      )}
                    </ResizableTh>
                  );
                })}
                <th className="px-2 py-2" style={{ width: 140 }} />
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {products.map((p) => (
                <tr key={p.id} className={p.isActive ? undefined : 'opacity-50'}>
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      aria-label={`${p.label} seç`}
                      onChange={() => toggleSelected(p.id)}
                    />
                  </td>
                  {visibleColumns.map((id) => (
                    <td key={id} className="truncate px-2 py-1">
                      {renderCell(id, p)}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      disabled={busy}
                      onClick={() => void rescan([p.id])}
                      title="Bu ürünün satıcı ve fiyat verisini şimdi yeniden oku"
                    >
                      Tara
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => void setActive(p.id, !p.isActive)}
                      title={p.isActive ? 'Taramayı bu ürün için durdur' : 'Taramayı sürdür'}
                    >
                      {p.isActive ? 'Duraklat' : 'Sürdür'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setLinkFor(p);
                        setLinkMultiplier('');
                        setLinkProductId('');
                        setLinkError(null);
                      }}
                      title={
                        p.brandProduct
                          ? 'Bu kart zaten bir stok ürününe bağlı'
                          : 'Bu kartı kendi stok ürününe bağla'
                      }
                      disabled={p.brandProduct !== null}
                    >
                      Ürünüme bağla
                    </Button>
                    <ConfirmButton
                      requireConfirm
                      confirmMessage={`"${p.label}" takipten çıkarılsın mı?`}
                      onConfirmed={() => void remove(p.id)}
                      className={`${buttonClass('ghost', 'sm')} hover:text-(--color-danger)`}
                    >
                      Kaldır
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}
    </div>
  );
}
