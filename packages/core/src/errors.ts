/**
 * Typed error channels for the cost and price model (docs/02-cost-and-price-model.md).
 *
 * Hard rule (doc 02 §4, doc 09 §7): a cost or price that cannot be computed must exclude
 * the listing from automation and raise an operator alert. It must never fall back to a
 * sentinel (the legacy `999` / `-1`) that silently flows into a price.
 */
import type { StockCodeError } from './stock-code.js';

export type CostError =
  | StockCodeError
  | { readonly type: 'StockItemNotFound'; readonly baseCode: string }
  | { readonly type: 'BundleNotDefined'; readonly bundleStockCode: string }
  | {
      readonly type: 'BundleMemberUnknown';
      readonly bundleStockCode: string;
      readonly memberStockCode: string;
      readonly cause: CostError;
    }
  | { readonly type: 'BundleCycle'; readonly stockCode: string }
  | { readonly type: 'MaxRecursionDepthExceeded'; readonly stockCode: string };

export type PriceError = { readonly type: 'NotProfitableAtAnyPrice' };
