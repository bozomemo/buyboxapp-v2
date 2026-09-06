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

/**
 * The wizard's *navigational* position only — never the data itself, which is always the server's
 * (doc 15 §6, Phase 6). Before this, a full page reload reset `stepIndex` to 0 unconditionally: an
 * operator who got through database, store identity and marketplaces and then reloaded (or came
 * back the next day) was dropped back at step 1 with no indication they had already gone further,
 * which reads exactly like the "ask again" defect this pass exists to close, even though every
 * value they entered so far was already safely persisted server-side.
 *
 * Deliberately `localStorage`, not a server round trip: this is one browser's memory of where it
 * left off, not a fact about the install, and it never blocks progress — a step's own server-backed
 * prefill (each step's own `load()`) is still the source of truth for whether that step's value
 * already exists.
 */
const PROGRESS_KEY = 'buybox.setup.wizard.progress.v1';

export interface WizardProgress {
  stepIndex: number;
  databaseReady: boolean;
  enabledMarketplaces: ('trendyol' | 'hepsiburada')[];
}

/** Never throws: a private window, cleared site data or SSR (`window` undefined) all fall back to "no progress yet". */
export function loadWizardProgress(): WizardProgress | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<WizardProgress>;
    if (
      typeof parsed.stepIndex !== 'number' ||
      parsed.stepIndex < 0 ||
      parsed.stepIndex >= WIZARD_STEPS.length
    ) {
      return undefined;
    }
    return {
      stepIndex: parsed.stepIndex,
      databaseReady: parsed.databaseReady === true,
      enabledMarketplaces: Array.isArray(parsed.enabledMarketplaces) ? parsed.enabledMarketplaces : [],
    };
  } catch {
    return undefined;
  }
}

export function saveWizardProgress(progress: WizardProgress): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Best-effort only — losing the remembered step never blocks the wizard, it just means the
    // operator starts over from step 1, the pre-existing behaviour.
  }
}

/** Called once the wizard is actually finished, so a later fresh install does not resume mid-way through a previous one. */
export function clearWizardProgress(): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Nothing to do — a stale entry just gets overwritten the next time someone runs the wizard.
  }
}
