'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateTime, formatNumber } from '@/lib/format';

interface IdentityListing {
  listingRef: string | null;
  itemRef: string | null;
  barcode: string | null;
  offeredStock: number | null;
}

interface Identity {
  officialName: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  registeredEmailAddress: string | null;
  address: string | null;
  cityName: string | null;
  countryName: string | null;
  listings: IdentityListing[];
  sourceUrl: string;
  resolvedAt: number;
}

interface IdentityResponse {
  seller: {
    marketplaceCode: string;
    sellerRef: string;
    sellerName: string;
    taxNumber: string | null;
  };
  identity: Identity | null;
  taxNumberDisagrees: boolean;
}

export interface SellerIdentityPanelProps {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  readonly sellerName: string;
  readonly onClose: () => void;
}

/** How long to keep asking after a resolution was queued, and how often. */
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

/**
 * The fields, in the order a person writing a notice needs them: who the firm is, then how to
 * reach it formally, then where it is. `null` renders as an em dash and never as a blank — an
 * empty cell reads as "we did not ask", and here we did.
 */
const FIELDS: readonly (readonly [keyof Identity, string, string])[] = [
  ['officialName', 'Ticari unvan', 'Pazaryerinin bildirdiği tescilli firma adı'],
  ['taxNumber', 'Vergi / TC no', 'Yetkili satıcı listesinin eşleştiği anahtar'],
  ['taxOffice', 'Vergi dairesi', ''],
  ['registeredEmailAddress', 'KEP adresi', 'Resmî tebligatın yasal olarak gönderildiği adres'],
  ['address', 'Adres', ''],
  ['cityName', 'Şehir', ''],
  ['countryName', 'Ülke', ''],
];

/**
 * Satıcı kimliği paneli (doc 06 §12.4 Faz 7, guide §29).
 *
 * Bir satıcının arkasındaki firmayı **istek üzerine** çözer. Toplu değil, tek tek: her çözüm
 * pazaryerine gerçek bir sayfa isteğidir ve ihtar yazılacak satıcı sayısı bir insanın
 * yazabileceği kadardır.
 *
 * Çözüm bir işe kuyruğa alınır ve panel sonucu bekler — çözüm sırasında pazaryerine dört ürün
 * sayfasına kadar istek gidebilir ve bu bir HTTP isteğinin içinde tutulacak bir süre değildir.
 */
export function SellerIdentityPanel({
  marketplaceCode,
  sellerRef,
  sellerName,
  onClose,
}: SellerIdentityPanelProps) {
  const [data, setData] = useState<IdentityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const deadlineRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);

  const query = `marketplaceCode=${encodeURIComponent(marketplaceCode)}&sellerRef=${encodeURIComponent(sellerRef)}`;

  const load = useCallback(async (): Promise<IdentityResponse | null> => {
    try {
      const res = await fetch(`/api/competitors/sellers/identity?${query}`);
      if (!res.ok) throw new Error('Kimlik okunamadı.');
      const body = (await res.json()) as IdentityResponse;
      setData(body);
      return body;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  // Polls only while a resolution this panel queued is outstanding, and stops the moment the
  // stored row is newer than the request — or when the deadline passes, so a worker that is not
  // running produces a message rather than a spinner that never ends.
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      void (async () => {
        const body = await load();
        const resolvedAt = body?.identity?.resolvedAt ?? 0;
        if (resolvedAt >= startedAtRef.current) {
          setPending(false);
        } else if (Date.now() > deadlineRef.current) {
          setPending(false);
          setError(
            'Çözüm tamamlanmadı. İşçi süreci çalışmıyor olabilir — İşler ekranından son çalıştırmalara bakın.',
          );
        }
      })();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pending, load]);

  const resolve = async () => {
    setError(null);
    startedAtRef.current = Date.now();
    deadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
    try {
      const res = await fetch('/api/competitors/sellers/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceCode, sellerRef }),
      });
      if (!res.ok) throw new Error('Çözüm kuyruğa alınamadı.');
      setPending(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const forget = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/competitors/sellers/identity?${query}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Kimlik silinemedi.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const identity = data?.identity ?? null;

  return (
    <div className="rounded border border-(--color-border) p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{sellerName || sellerRef} — satıcı kimliği</h2>
          <p className="mt-1 max-w-2xl text-sm text-(--color-muted)">
            Firmanın pazaryerinde bildirdiği tescil bilgileri. Bir ihtar yazacaksanız gereken
            alanlar bunlardır; sıralama, buybox veya fiyat <em>bu istekten okunmaz</em> — satıcı
            adına sorulan sayfa kendisini her satırda kazanan gösterir.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void resolve()}
            disabled={pending}
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-50"
          >
            {pending ? 'Çözülüyor…' : identity ? 'Yeniden çöz' : 'Kimliği çöz'}
          </button>
          {identity && (
            <button
              type="button"
              onClick={() => void forget()}
              className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
            >
              Kimliği unut
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
          >
            Kapat
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-2 text-sm">
          {error}
        </div>
      )}

      {data?.taxNumberDisagrees && (
        <div className="mt-3 rounded border border-(--color-warning-border) bg-(--color-warning-bg) p-2 text-sm">
          Satıcı kaydındaki vergi numarası (<strong>{data.seller.taxNumber}</strong>) pazaryerinin
          bildirdiğinden (<strong>{identity?.taxNumber}</strong>) farklı. Kayıttaki numara elle
          girilmiştir ve <em>değiştirilmedi</em> — yetkili satıcı listesi onunla eşleşir, ve hangi
          numaranın doğru olduğuna yazılım karar veremez.
        </div>
      )}

      {!identity && !pending && (
        <p className="mt-3 text-sm text-(--color-muted)">
          Bu satıcı için henüz kimlik çözülmedi. Çözüm, satıcının görüldüğü bir ürün sayfasını o
          satıcı adına okur — satıcı o üründen ayrılmışsa sayfa başka bir firmayı anlatır ve
          hiçbir şey kaydedilmez.
        </p>
      )}

      {identity && (
        <>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {FIELDS.map(([key, label, hint]) => {
              const value = identity[key];
              return (
                <div key={key}>
                  <dt className="text-xs text-(--color-muted)" title={hint}>
                    {label}
                  </dt>
                  <dd className="text-sm">
                    {typeof value === 'string' && value !== '' ? value : '—'}
                  </dd>
                </div>
              );
            })}
          </dl>

          {identity.listings.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium">Bu sayfadaki listelemesi</h3>
              <table className="mt-1 text-sm">
                <thead className="text-left text-xs text-(--color-muted)">
                  <tr>
                    <th className="px-2 py-1">Barkod</th>
                    <th className="px-2 py-1">Varyant</th>
                    <th className="px-2 py-1">Stok</th>
                  </tr>
                </thead>
                <tbody>
                  {identity.listings.map((l, index) => (
                    <tr key={l.listingRef ?? `${l.itemRef ?? 'x'}-${index}`} className="border-t border-(--color-border)">
                      <td className="px-2 py-1 tabular-nums">{l.barcode ?? '—'}</td>
                      <td className="px-2 py-1 tabular-nums">{l.itemRef ?? '—'}</td>
                      <td className="px-2 py-1 tabular-nums">
                        {l.offeredStock === null ? '—' : formatNumber(l.offeredStock)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-xs text-(--color-muted)">
            {formatDateTime(identity.resolvedAt)} tarihinde okundu ·{' '}
            <a
              className="underline"
              href={identity.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              okunduğu sayfa
            </a>
            . Kimlik bilgisi bir zaman serisi değildir: her çözüm bir öncekinin yerine geçer.
          </p>
        </>
      )}
    </div>
  );
}
