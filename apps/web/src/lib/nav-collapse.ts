/**
 * Whether the sidebar is collapsed to its icon rail (spec 2026-11-03-ui-redesign §5.2). A display
 * preference like the menu view (`nav-modules.ts`), remembered per browser. `null` means the
 * operator never chose, and the shell then decides from the viewport width.
 */
export const NAV_COLLAPSE_STORAGE_KEY = 'buybox.navCollapsed';

export function readStoredNavCollapsed(): boolean | null {
  try {
    const stored = window.localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY);
    return stored === '1' ? true : stored === '0' ? false : null;
  } catch {
    return null;
  }
}

export function storeNavCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Storage unavailable: the choice holds for this page load and is simply not remembered.
  }
}
