/** Shared client-side state shape threaded through the setup wizard (doc 10 §6). */

export interface MarketplaceDraft {
  code: 'trendyol' | 'hepsiburada';
  displayName: string;
  merchantRef: string;
  enabled: boolean;
  credentials: Record<string, string>;
  tested: boolean;
}

export const WIZARD_STEPS = [
  'database',
  'store-identity',
  'marketplaces',
  'fees',
  'policy',
  'product-source',
  'erp',
  'review',
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_LABELS: Record<WizardStep, string> = {
  database: 'Veritabanı',
  'store-identity': 'Mağaza Kimliği',
  marketplaces: 'Pazaryerleri',
  fees: 'Ücret Ayarları',
  policy: 'Fiyatlandırma Politikası',
  'product-source': 'Ürün Kaynağı',
  erp: 'ERP Bağlantısı',
  review: 'Gözden Geçir ve Bitir',
};
