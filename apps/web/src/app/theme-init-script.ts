/**
 * Source for the inline `<script>` that stamps `data-theme` on `<html>` before first paint.
 *
 * Why inline and why here, not in a `useEffect`: an effect only runs after React has already
 * painted the light-mode default, so a stored "dark" preference would flash light-then-dark on
 * every load. Reading `localStorage` and setting the attribute synchronously, before the
 * stylesheet's `:root[data-theme='dark']` rule ever gets a chance to not-yet-apply, is the only
 * way to avoid that flash — which is also why this can't be a normal imported module: it has to
 * run as a blocking, un-deferred script in `<head>`, ahead of hydration.
 *
 * No attribute is set for "sistem" (or when nothing is stored yet, e.g. first visit): the
 * dark-mode media query in `globals.css` already does the right thing with no attribute at all,
 * and setting one here would just be one more thing `ThemeToggle` has to keep in sync.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
