/** Shared client-side state shape threaded through the setup wizard (doc 10 §6). */
import type { EnabledModules } from '@buybox/shared';

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
  'purpose',
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
  purpose: 'Kullanım Amacı',
  'store-identity': 'Mağaza Kimliği',
  marketplaces: 'Pazaryerleri',
  fees: 'Ücret Ayarları',
  policy: 'Fiyatlandırma Politikası',
  'product-source': 'Ürün Kaynağı',
  erp: 'ERP Bağlantısı',
  review: 'Gözden Geçir ve Bitir',
};

/**
 * Steps that configure only the seller module — our store, its fees and pricing policy, where
 * its costs come from (doc 17 §1.2). A brand-only install never sees them, and never asks for
 * seller credentials either: the marketplaces step shrinks to on/off switches (doc 17 §1.4).
 *
 * `purpose` comes right **after** `database`, not before it as doc 17 §1.4 first drew it: the
 * choice is stored in `app_settings`, and there is no database to store it in until step 1 ran.
 */
const SELLER_ONLY_STEPS: ReadonlySet<WizardStep> = new Set<WizardStep>([
  'store-identity',
  'fees',
  'policy',
  'product-source',
  'erp',
]);

export function visibleSteps(modules: EnabledModules): readonly WizardStep[] {
  return WIZARD_STEPS.filter((step) => modules.seller || !SELLER_ONLY_STEPS.has(step));
}

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
// v2 since the purpose step (doc 17 §1.4): it shifted every later step by one, so a v1 position
// restored as-is would land one step early. Starting over at step 1 is the safe reading of it.
const PROGRESS_KEY = 'buybox.setup.wizard.progress.v2';

export interface WizardProgress {
  /** An index into `visibleSteps(modules)`, not into `WIZARD_STEPS`. */
  stepIndex: number;
  databaseReady: boolean;
  enabledMarketplaces: ('trendyol' | 'hepsiburada')[];
  modules: EnabledModules;
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
    const modules =
      parsed.modules &&
      typeof parsed.modules.seller === 'boolean' &&
      typeof parsed.modules.brand === 'boolean'
        ? parsed.modules
        : { seller: true, brand: true };
    return {
      // Clamped to the steps these modules actually show, so a stale position can never index
      // past the end of a shorter, brand-only wizard.
      stepIndex: Math.min(parsed.stepIndex, visibleSteps(modules).length - 1),
      databaseReady: parsed.databaseReady === true,
      enabledMarketplaces: Array.isArray(parsed.enabledMarketplaces) ? parsed.enabledMarketplaces : [],
      modules,
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
