'use client';

/**
 * One-click decision for a seller with no rule for the brand (brand roadmap §6.12): "Yetkili" or
 * "Yasaklı", written as the same rule Satıcı Politikası writes — this brand, this storefront (by
 * marketplace seller id, never by name). The note, the tax number and the group-wide default stay
 * on Satıcı Politikası, where there is room to think about them.
 */

import { useState } from 'react';
import { errorMessage } from '@/components/auth-card';
import { Button } from '@/components/ui';
import { PermissionFieldset } from '@/lib/permissions';

export interface QuickDecisionSeller {
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  readonly sellerName: string;
}

export function PolicyQuickDecision({
  seller,
  watchedBrandId,
  onDecided,
}: {
  seller: QuickDecisionSeller;
  watchedBrandId: string;
  onDecided: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(status: 'authorised' | 'blocked') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/seller-policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchedBrandId,
          marketplaceCode: seller.marketplaceCode,
          sellerRef: seller.sellerRef,
          status,
        }),
      });
      if (response.ok) {
        onDecided();
      } else {
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        setError(errorMessage(data, `Kural kaydedilemedi (HTTP ${response.status}).`));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kural kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PermissionFieldset permission="catalogue.manage">
      <span className="ml-1 inline-flex gap-1" title={`${seller.sellerName || seller.sellerRef} için bu markada kural yaz`}>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void decide('authorised')}>
          Yetkili
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void decide('blocked')}>
          Yasaklı
        </Button>
      </span>
      {error && <div className="text-xs text-(--color-danger)">{error}</div>}
    </PermissionFieldset>
  );
}
