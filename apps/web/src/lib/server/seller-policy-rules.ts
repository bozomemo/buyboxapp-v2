import type { SellerPolicyRule } from '@buybox/core';
import type { sellerPoliciesRepo } from '@buybox/db';

/** Stored rows shaped for the pure resolver; a hand-edited row with no identity is dropped. */
export function toSellerPolicyRules(rows: readonly sellerPoliciesRepo.SellerPolicyRow[]): SellerPolicyRule[] {
  return rows.flatMap((row) => {
    const identity =
      row.sellerRef !== null && row.marketplaceCode !== null
        ? ({ kind: 'sellerRef', marketplaceCode: row.marketplaceCode, sellerRef: row.sellerRef } as const)
        : row.taxNumber !== null
          ? ({ kind: 'taxNumber', taxNumber: row.taxNumber } as const)
          : null;
    return identity === null
      ? []
      : [
          {
            id: row.id,
            watchedBrandGroupId: row.watchedBrandGroupId,
            watchedBrandId: row.watchedBrandId,
            identity,
            status: row.status,
            note: row.note,
          },
        ];
  });
}
