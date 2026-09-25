/**
 * Which module groups the sidebar draws (doc 17 §1.1): the installed modules, narrowed by the
 * header's view switch when both are installed.
 *
 * The view is a **browser** preference, kept in `localStorage` like the theme, and only ever
 * hides — it cannot enable a module the install has turned off, and it changes nothing that
 * runs. `all` is the default so an install that had both groups before doc 17 keeps seeing both.
 */
import type { AppModule, EnabledModules } from '@buybox/shared';

export type NavView = 'all' | AppModule;

export const NAV_VIEW_STORAGE_KEY = 'buybox.navView';

export const NAV_VIEW_OPTIONS: readonly { value: NavView; label: string }[] = [
  { value: 'seller', label: 'Satış' },
  { value: 'brand', label: 'Marka' },
  { value: 'all', label: 'Tümü' },
];

/** What the sidebar knows about the installed modules at a given moment. */
export type ModulesState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly modules: EnabledModules };

export function readStoredNavView(): NavView {
  try {
    const stored = window.localStorage.getItem(NAV_VIEW_STORAGE_KEY);
    return stored === 'seller' || stored === 'brand' ? stored : 'all';
  } catch {
    return 'all';
  }
}

export function storeNavView(view: NavView): void {
  try {
    if (view === 'all') window.localStorage.removeItem(NAV_VIEW_STORAGE_KEY);
    else window.localStorage.setItem(NAV_VIEW_STORAGE_KEY, view);
  } catch {
    // Storage unavailable: the choice holds for this page load and is simply not remembered.
  }
}

/** The view switch is only offered when there is something to switch between. */
export function showsViewSwitch(state: ModulesState): boolean {
  return state.status === 'ready' && state.modules.seller && state.modules.brand;
}

/**
 * - **loading**: neither module group yet. A brand-only operator should not watch the seller's
 *   menu appear and vanish on every page load; the shared groups render at once regardless.
 * - **error**: both. The proxy still refuses a disabled module's routes, so drawing a link too
 *   many costs a redirect, while drawing none would strand the operator with no way to reach
 *   the settings that could explain it.
 */
export function visibleModules(state: ModulesState, view: NavView): Readonly<Record<AppModule, boolean>> {
  if (state.status === 'loading') return { seller: false, brand: false };
  if (state.status === 'error') return { seller: true, brand: true };
  const { seller, brand } = state.modules;
  if (seller && brand && view !== 'all') return { seller: view === 'seller', brand: view === 'brand' };
  return { seller, brand };
}
