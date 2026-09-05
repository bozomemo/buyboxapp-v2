'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { STICKY_HEAD, TableFrame } from '@/components/table';
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

/**
 * İzlenen markalar — marka sahibi denetim modülünün kayıt ekranı (api-references §1.7).
 *
 * `/brands` ekranıyla karıştırılmamalı: orası **bizim sattığımız** ilanlardan türeyen marka
 * taksonomisi. Burası çoğunlukla satmadığımız, marka sahibi olarak izlediğimiz ürünler.
 *
 * Tarama bu ekrandan başlatılır ama burada çalışmaz — `job_queue`'ya bir satır yazılır ve
 * ilerleme İşler ekranında görünür. Büyük bir markanın taraması dakikalar sürer; bir HTTP
 * isteğinde beklemek anlamsız olurdu.
 */
export function WatchedBrandsClient() {
  const [groups, setGroups] = useState<WatchedBrandGroup[]>([]);
  const [pruneSuggestions, setPruneSuggestions] = useState<PruneSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [brandGroupId, setBrandGroupId] = useState('');
  const [brandLabel, setBrandLabel] = useState('');
  const [brandMarketplace, setBrandMarketplace] = useState('trendyol');
  const [brandRef, setBrandRef] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  function load() {
    setLoading(true);
    fetch('/api/watched-brands')
      .then((r) => r.json())
      .then((d: { groups: WatchedBrandGroup[] }) => {
        setGroups(d.groups);
        // Keep the brand form pointed at a group that still exists, so the form does not
        // silently target a deleted one after a reload.
        setBrandGroupId((current) =>
          d.groups.some((g) => g.id === current) ? current : (d.groups[0]?.id ?? ''),
        );
      })
      .finally(() => setLoading(false));
    fetch('/api/tracked-products/prune-suggestion')
      .then((r) => r.json())
      .then((d: { suggestions: PruneSuggestion[] }) => setPruneSuggestions(d.suggestions));
  }
  useEffect(load, []);

  async function post(url: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
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
    await fetch(`/api/watched-brands/${brand.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandRef: brand.suggestedBrandRef.ref }),
    });
    load();
  }

  /**
   * Flips a brand between "ours" and "a competitor's".
   *
   * It is a two-state control rather than a setting buried in an edit form because it changes
   * what the brand *is for*: a competitor's brand is swept and priced but never audited, so
   * turning this off silently stops findings — which the operator must be able to see they did.
   */
  async function toggleOwnBrand(brand: WatchedBrand) {
    await fetch(`/api/watched-brands/${brand.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isOwnBrand: !brand.isOwnBrand }),
    });
    load();
  }

  async function toggleActive(brand: WatchedBrand) {
    await fetch(`/api/watched-brands/${brand.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !brand.isActive }),
    });
    load();
  }

  /**
   * Deactivates the brand's never-rated products.
   *
   * Deactivation, not deletion: "the marketplace has never recorded a rating" is a proxy for
   * "nobody buys this", not proof of it. The rows and their history stay, and the grid's
   * "Sürdür" button puts any of them back.
   */
  async function pruneUnrated(suggestion: PruneSuggestion) {
    const res = await fetch('/api/tracked-products/prune-suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watchedBrandId: suggestion.watchedBrandId }),
    });
    const { ids, total } = (await res.json()) as { ids: string[]; total: number };
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

    await fetch('/api/tracked-products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, isActive: false }),
    });
    load();
  }

  async function removeBrand(brand: WatchedBrand) {
    if (
      !confirm(
        `${brand.label} markasını izleme listesinden çıkar?\n\nBulduğu ${formatNumber(brand.productCount)} ürün ve geçmişleri silinmez — sadece marka bağlantıları kalkar.`,
      )
    ) {
      return;
    }
    await fetch(`/api/watched-brands/${brand.id}`, { method: 'DELETE' });
    load();
  }

  async function removeGroup(group: WatchedBrandGroup) {
    if (!confirm(`${group.name} grubunu ve altındaki ${group.brands.length} markayı sil?`)) return;
    await fetch(`/api/watched-brands/groups?id=${encodeURIComponent(group.id)}`, { method: 'DELETE' });
    load();
  }

  const allBrands = groups.flatMap((g) => g.brands.map((b) => ({ group: g.name, brand: b })));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">İzlenen Markalar</h1>
        <button
          type="button"
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
          className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-40"
        >
          Excel&apos;e Aktar
        </button>
      </div>

      <p className="max-w-3xl text-sm text-(--color-muted)">
        Bir markanın pazaryerindeki <strong>bütün</strong> ürünlerini tek seferde izlemeye alır. Bu liste{' '}
        <strong>raporlamadır</strong> — hiçbir fiyat kararını etkilemez. Bir marka iki şekilde aranabilir:
        pazaryerinin <em>marka id&apos;si</em> ve <em>arama terimi</em>. İkisi de taranır, çünkü aradaki fark
        bir bulgudur — arama terimiyle çıkıp marka id&apos;siyle çıkmayan bir ürün, marka adını izinsiz
        kullanıyor olabilir.
      </p>

      {/* ---- grup ekle ---- */}
      <div className="flex flex-wrap items-end gap-2 rounded border border-(--color-border) p-3">
        <label className="flex flex-col text-xs">
          Yeni marka grubu
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Örn. Mars"
            className="w-64 rounded border border-(--color-border) px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy || !groupName.trim()}
          onClick={() => void addGroup()}
          className="rounded border border-(--color-border) px-3 py-1.5 text-sm hover:bg-(--color-hover) disabled:opacity-40"
        >
          Grup Ekle
        </button>
        <span className="text-xs text-(--color-muted)">
          Bir grup birden fazla marka tutar — Mars&apos;ın hem Whiskas&apos;a hem Royal Canin&apos;e sahip
          olması gibi.
        </span>
      </div>

      {/* ---- marka ekle ---- */}
      {groups.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-(--color-border) p-3">
          <label className="flex flex-col text-xs">
            Grup
            <select
              value={brandGroupId}
              onChange={(e) => setBrandGroupId(e.target.value)}
              className="w-40 rounded border border-(--color-border) px-2 py-1 text-sm"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs">
            Pazaryeri
            <select
              value={brandMarketplace}
              onChange={(e) => setBrandMarketplace(e.target.value)}
              className="w-32 rounded border border-(--color-border) px-2 py-1 text-sm"
            >
              <option value="trendyol">trendyol</option>
              <option value="hepsiburada">hepsiburada</option>
            </select>
          </label>
          <label className="flex flex-col text-xs">
            Marka adı
            <input
              value={brandLabel}
              onChange={(e) => setBrandLabel(e.target.value)}
              placeholder="Whiskas"
              className="w-40 rounded border border-(--color-border) px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col text-xs">
            Arama terimi
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="whiskas"
              className="w-40 rounded border border-(--color-border) px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col text-xs">
            Marka id (opsiyonel)
            <input
              value={brandRef}
              onChange={(e) => setBrandRef(e.target.value)}
              placeholder="104703"
              className="w-32 rounded border border-(--color-border) px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || !brandLabel.trim() || (!searchTerm.trim() && !brandRef.trim())}
            onClick={() => void addBrand()}
            className="rounded bg-(--color-accent) px-3 py-1.5 text-sm text-(--color-accent-ink) disabled:opacity-40"
          >
            Marka Ekle
          </button>
          <span className="w-full text-xs text-(--color-muted)">
            Marka id&apos;sini bilmiyorsanız boş bırakın — sadece arama terimiyle de tarama yapılır, ve ilk
            taramadan sonra sistem pazaryerinin bu markaya verdiği id&apos;yi size önerir.
          </span>
        </div>
      )}

      {error && <p className="text-sm text-(--color-danger)">{error}</p>}

      {pruneSuggestions.length > 0 && (
        <div className="space-y-2 rounded border border-(--color-warning-border) bg-(--color-warning-bg) p-3">
          <h2 className="text-sm font-semibold text-(--color-warning)">Ölü ürün önerisi</h2>
          <p className="max-w-3xl text-xs text-(--color-muted)">
            Pazaryerinin hiç değerlendirme kaydetmediği ürünler. Değerlendirme sayısı, satış hızının
            elimizdeki en iyi göstergesi — hiç değerlendirmesi olmayan bir ürün büyük olasılıkla hiç satmıyor.
            Bunları duraklatmak derin taramayı kısaltır. Oran markadan markaya çok değişir, bu yüzden
            aşağıdaki sayılar her marka için ayrı hesaplanır.
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
                  onClick={() => void pruneUnrated(suggestion)}
                  className="rounded border border-(--color-border) bg-(--color-bg) px-2 py-0.5 text-xs hover:bg-(--color-hover)"
                >
                  Duraklat
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{group.name}</h2>
            <button
              type="button"
              onClick={() => void removeGroup(group)}
              className="text-xs text-(--color-muted) hover:text-(--color-danger)"
            >
              Grubu sil
            </button>
          </div>

          <TableFrame>
            <table className="w-full text-sm">
              <thead
                className={`${STICKY_HEAD} bg-(--color-hover) text-left text-xs uppercase text-(--color-muted)`}
              >
                <tr>
                  <th className="px-2 py-2">Marka</th>
                  <th className="px-2 py-2">Pazaryeri</th>
                  <th className="px-2 py-2">Nasıl aranıyor</th>
                  <th className="px-2 py-2">Tür</th>
                  <th className="px-2 py-2">Ürün</th>
                  <th className="px-2 py-2">Satıcısız</th>
                  <th className="px-2 py-2">Son Tarama</th>
                  <th className="px-2 py-2">Durum</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {group.brands.map((brand) => (
                  <tr key={brand.id}>
                    <td className="px-2 py-1 font-medium">
                      {/* The brand's own products, already filtered — this screen counts them
                          but cannot show them, and the count is exactly the number an operator
                          wants to click through. `/tracked-products` seeds its brand filter from
                          this query parameter. */}
                      <Link
                        href={`/tracked-products?watchedBrandId=${encodeURIComponent(brand.id)}`}
                        title={`${brand.label} markasının takip edilen ürünlerini aç`}
                        className="text-(--color-accent) hover:underline"
                      >
                        {brand.label}
                      </Link>
                    </td>
                    <td className="px-2 py-1">{brand.marketplaceCode}</td>
                    <td className="px-2 py-1">
                      <div className="flex flex-col gap-0.5 text-xs">
                        {brand.brandRef && <span>marka id: {brand.brandRef}</span>}
                        {brand.searchTerm && <span>arama: {brand.searchTerm}</span>}
                        {brand.suggestedBrandRef && (
                          <button
                            type="button"
                            onClick={() => void applySuggestedRef(brand)}
                            className="text-left text-(--color-accent) hover:underline"
                            title={`Ürünlerin %${Math.round(brand.suggestedBrandRef.share * 100)}'i bu marka id'sini taşıyor`}
                          >
                            + marka id {brand.suggestedBrandRef.ref} ekle
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        onClick={() => void toggleOwnBrand(brand)}
                        className="text-xs hover:underline"
                        title={
                          brand.isOwnBrand
                            ? 'Bizim markamız — denetim bulguları üretilir'
                            : 'Rakip marka — sadece fiyat karşılaştırması, denetim bulgusu üretilmez'
                        }
                      >
                        {brand.isOwnBrand ? 'bizim' : 'rakip'}
                      </button>
                    </td>
                    <td className="px-2 py-1">
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
                    </td>
                    {/*
                      Kaybedilen raf. Sayı bir link, çünkü bir marka sorumlusunun bu sayıyla
                      yapacağı ilk şey satırları açmaktır. "Henüz bakılmadı" yanında duruyor:
                      ilk turunu tamamlamamış bir markada satıcısız sayısı tek başına yanıltıcıdır.
                    */}
                    <td className="px-2 py-1">
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
                    </td>
                    <td className="px-2 py-1">
                      {brand.lastSweptAt ? formatDateTime(brand.lastSweptAt) : 'henüz taranmadı'}
                    </td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        onClick={() => void toggleActive(brand)}
                        className="text-xs hover:underline"
                      >
                        {brand.isActive ? 'aktif' : 'duraklatıldı'}
                      </button>
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void sweepNow(brand)}
                        className="mr-2 rounded border border-(--color-border) px-2 py-0.5 text-xs hover:bg-(--color-hover) disabled:opacity-40"
                      >
                        Şimdi tara
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeBrand(brand)}
                        className="text-(--color-muted) hover:text-(--color-danger)"
                      >
                        Kaldır
                      </button>
                    </td>
                  </tr>
                ))}
                {group.brands.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-2 py-4 text-center text-(--color-muted)">
                      Bu grupta henüz marka yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableFrame>
        </section>
      ))}

      {groups.length === 0 && !loading && (
        <p className="py-6 text-center text-(--color-muted)">
          Henüz marka grubu yok. Yukarıdan bir grup ekleyerek başlayın.
        </p>
      )}
    </div>
  );
}
