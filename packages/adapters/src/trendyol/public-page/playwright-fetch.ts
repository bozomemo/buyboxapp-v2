/**
 * A `fetch`-shaped HTTP client backed by a real headless Chromium (Playwright) — the default
 * `fetchFn` for `TrendyolPublicPageSource` since 2026-08-17.
 *
 * Replaces `node-https-fetch.ts`. That module's own doc comment records why it didn't hold up:
 * Cloudflare's bot management is fingerprinting the TLS ClientHello, and every Node-native HTTP
 * client (`fetch`/undici, Node's core `https`) shares Node's OpenSSL TLS stack and gets scored
 * the same regardless of headers. Measured 2026-08-17: 10/10 consecutive product pages that had
 * been failing ~100% of the time through any Node HTTP client returned 200 through this module.
 * A real browser's TLS handshake and JS execution are what Trendyol's bot management is actually
 * built to accept — this is the "browser impersonation" exception already authorised for this
 * source (CLAUDE.md, api-references §1.6, 2026-08-17) taken literally, rather than approximated
 * via headers on a non-browser client.
 *
 * Pages are launched lazily on first use and reused for the fetcher's lifetime — but a session
 * that dies under a long run is replaced rather than poisoning every later fetch. *Dies* means
 * three different things and all three are handled; see `isUsable`.
 *
 * **A pool of `PAGE_POOL_SIZE` pages, since 2026-09-12.** It used to be one page with every fetch
 * queued behind the one before it, on the reasoning that the rate limiter was the real throughput
 * bound and a pool would therefore buy nothing. Measurement on the operator's machine says
 * otherwise: a Trendyol product page takes 8-15 s to reach `domcontentloaded` there, so one page
 * delivers ~4-7 requests a minute against a configured budget of 30, and the tracked sweep spent
 * four fifths of its allowance waiting. The pool closes that gap and **raises no limit**: the
 * source holds one shared `RateLimiter` in front of every fetch, so the operator's configured
 * requests-per-minute is the ceiling whether one page is asking or three.
 *
 * Each page is still a critical section of its own — `goto` and `page.content()` must not be
 * interleaved on one page (see `withPage`) — and each carries its own health, so one renderer
 * crashing costs its own in-flight product and nothing else.
 *
 * Callers must call `close()` when done (worker shutdown) or the browser process leaks.
 */
import { chromium, type Browser, type Page } from 'playwright';
import type { NodeFetchInit, NodeFetchResponse } from './node-https-fetch.js';

export interface PlaywrightFetcher {
  readonly fetch: (url: string, init: NodeFetchInit) => Promise<NodeFetchResponse>;
  readonly close: () => Promise<void>;
}

/** One browser and page, reused for as long as they stay healthy; one lane of the pool. */
export interface PlaywrightSession {
  readonly browser: Browser;
  readonly page: Page;
}

/**
 * How a session is obtained. Injectable **only** so the crash-recovery paths in `getSession` can
 * be exercised without killing a real Chromium out from under a test; production always uses
 * `launchChromium`.
 */
export type PlaywrightLauncher = (userAgent: string | undefined) => Promise<PlaywrightSession>;

/**
 * A session plus what this module knows about its health — neither of which Playwright exposes
 * on the objects themselves.
 *
 * `crashed` exists because a crashed renderer is invisible to every API that looks like it would
 * report one: see `isUsable`. `navigations` exists because the crash it records is, on the
 * evidence, a resource leak rather than a random event — see `MAX_NAVIGATIONS_PER_PAGE`.
 */
interface TrackedSession {
  readonly session: PlaywrightSession;
  crashed: boolean;
  navigations: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Recycle the page after this many navigations, before it can crash.
 *
 * The 2026-09-07 production incident (below) crashed a renderer that had been reused across a
 * whole catalogue, and the 2026-08-28 one lost the whole browser after ~1,400 navigations on the
 * same shared page. Both read as a process whose memory grows with every page it has ever
 * rendered — Trendyol's product page is a heavy SPA — rather than as bad luck, and neither
 * recovery path below makes the crash itself free: it costs the product in flight, and on a
 * small machine a crashing renderer is also the machine's worst moment to be launching a
 * replacement browser.
 *
 * So the crash is pre-empted as well as survived. 300 is chosen well under the only figure ever
 * measured (~1,400) and well above the ~120 navigations one hourly `ScrapeCompetitors` run makes
 * at the default rate, so a typical run never pays for a relaunch mid-run and a catalogue sweep
 * pays for a handful.
 */
const MAX_NAVIGATIONS_PER_PAGE = 300;

/**
 * Chromium aborts a navigation — `net::ERR_ABORTED`, thrown by `page.goto` — when the page it is
 * leaving starts a navigation of its own first. Trendyol's product pages do that on their own
 * schedule, so it lands on whichever request happens to be in flight: measured 2026-08-29, ~1 in
 * 6 consecutive fetches through one reused page, failing in ~70 ms while the request either side
 * of it returned 200. It is a race against the previous page's script, not a refusal, not a rate
 * limit and not a block — nothing about the URL is wrong, and the immediate retry succeeds.
 *
 * Without this a scrape drops that product for the whole cycle and files a `fetchFailed` that
 * reads like a block. One retry, because a second consecutive abort is no longer the race this
 * describes and the run should record it honestly.
 */
const ABORTED_NAVIGATION_RETRIES = 1;

/**
 * A navigation that died with its session gets one retry too — on a **fresh** session, which is
 * the whole difference from the abort retry above. One, because the replacement is brand new: if
 * a just-launched browser crashes on the same URL, that is the page, the machine or the install,
 * and repeating it would only spend the rate budget saying so.
 */
const DEAD_SESSION_RETRIES = 1;

function isAbortedNavigation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('net::ERR_ABORTED');
}

/**
 * The errors that mean "this session is gone", as Playwright words them.
 *
 * `Page crashed` is the renderer dying under us — the 2026-09-07 incident. The `…has been
 * closed` family is the browser process going away, which `isUsable`'s `isConnected()` check
 * normally catches first but can lose a race to.
 *
 * Matched on the message because Playwright throws a plain `Error` for all of them; there is no
 * code or class to switch on. Deliberately narrow: a timeout, a DNS failure and an HTTP status
 * are all ordinary outcomes of a healthy session and must keep failing the item, not the
 * browser.
 */
function isDeadSession(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes('Page crashed') ||
    message.includes('Target crashed') ||
    message.includes('Target page, context or browser has been closed') ||
    message.includes('Target closed')
  );
}

async function launchChromium(userAgent: string | undefined): Promise<PlaywrightSession> {
  const browser = await chromium.launch({
    headless: true,
    // Chromium puts its shared-memory files in `/dev/shm`, which is 64 MB in a default Docker
    // container and small on a trimmed Linux install; a renderer that outgrows it dies with
    // exactly the `Page crashed` this module now recovers from. The flag moves that allocation
    // to ordinary temp files — slower in theory, and the documented fix for this crash. Harmless
    // on Windows, where there is no `/dev/shm` to run out of.
    args: ['--disable-dev-shm-usage'],
  });
  const page = await browser.newPage(userAgent ? { userAgent } : {});
  return { browser, page };
}

/**
 * How many Chromium pages serve fetches at once.
 *
 * Three because that is enough to spend the default rate budget (30/min) at the page load times
 * measured on the operator's machine, and because each page is a real renderer: on a small box —
 * the same one whose 15 s timeout had to be raised to 30 — pages cost memory that the crash
 * history in `MAX_NAVIGATIONS_PER_PAGE` says is already the scarce resource. It is deliberately
 * not "as many as the rate limit allows": the limiter is the ceiling, this is only how much of it
 * can be in flight.
 *
 * Matched by `SCRAPE_TRACKED_CONCURRENCY` in packages/jobs — a caller asking for more concurrent
 * products than there are pages simply queues, which is correct but buys nothing.
 */
const PAGE_POOL_SIZE = 3;

/**
 * One lane of the pool: a page's worth of capacity, and the session currently filling it.
 *
 * The session is cached per slot rather than per fetcher, so `getSession`'s replace-on-death logic
 * is per page: a crashed renderer retires its own slot's session while the other lanes keep
 * working, which is the property the single shared page could not have.
 */
interface PoolSlot {
  session: Promise<TrackedSession> | undefined;
}

/** Launches nothing until the first `fetch()` call — a source that's never invoked never pays for a browser. */
export function createPlaywrightFetcher(launch: PlaywrightLauncher = launchChromium): PlaywrightFetcher {
  const slots: PoolSlot[] = Array.from({ length: PAGE_POOL_SIZE }, () => ({ session: undefined }));
  let disposed = false;

  /** Slots nobody is using. A fetch takes one, and returns it in a `finally`. */
  const idle: PoolSlot[] = [...slots];
  /** Callers waiting for a slot, oldest first — so fetches are served in the order they arrived. */
  const waiting: ((slot: PoolSlot) => void)[] = [];

  /**
   * Runs `work` on a page nobody else is using.
   *
   * The reason a slot is held for the *whole* of `work` and not just the navigation is unchanged
   * from when this was a queue: the response body is read off the page after the fact
   * (`page.content()` below), so a second fetch reaching that page between the `goto` and the read
   * would hand the first caller the second caller's HTML under the first caller's status and URL.
   * That is one brand's page recorded as another's — wrong data, silently, which is the failure
   * this codebase spends most of its comments avoiding.
   *
   * The slot is released in a `finally`, so a failed fetch frees its lane exactly as a successful
   * one does; a poisoned session is retired separately, by `getSession`'s liveness check, and
   * never strands the lane it was in.
   */
  async function withPage<T>(work: (slot: PoolSlot) => Promise<T>): Promise<T> {
    const slot = idle.pop() ?? (await new Promise<PoolSlot>((resolve) => waiting.push(resolve)));
    try {
      return await work(slot);
    } finally {
      const next = waiting.shift();
      if (next) next(slot);
      else idle.push(slot);
    }
  }

  /**
   * Whether a cached session may serve the next fetch. Four ways it may not, and the first three
   * are each a real production incident:
   *
   * - **the browser process is gone** (2026-08-28): Chromium disappeared after ~1,400
   *   navigations and every later fetch threw `Target page, context or browser has been closed`
   *   — 2,700 tracked products in a row, each still spending a rate-limit token and writing a
   *   failure row, with only a worker restart able to clear it;
   * - **the page was closed** under us, while the browser lives;
   * - **the renderer crashed** (2026-09-07): `page.goto: Page crashed`, unbroken from 17:38 on
   *   7 Eylül to 13:28 the next day across the whole tracked catalogue, ending only at a
   *   restart. This is the case the first two checks cannot see: after a renderer crash the
   *   browser is still connected and the page still reports itself open, so a liveness check
   *   built from `isConnected()` and `isClosed()` alone hands the poisoned page back for ever.
   *   Nothing on `Page` exposes it either, so it is recorded from the `crash` event and from the
   *   navigation error itself (`isDeadSession`);
   * - **it has done enough navigations** — pre-emption rather than recovery, see
   *   `MAX_NAVIGATIONS_PER_PAGE`.
   */
  function isUsable(tracked: TrackedSession): boolean {
    return (
      !tracked.crashed &&
      tracked.navigations < MAX_NAVIGATIONS_PER_PAGE &&
      tracked.session.browser.isConnected() &&
      !tracked.session.page.isClosed()
    );
  }

  /**
   * Drops a session from its slot and disposes it on a detached promise.
   *
   * Detached because a dead browser's `close()` has nothing to wait for and awaiting it would
   * only delay the replacement; a *recycled* (still healthy) one is closed the same way because
   * the caller is waiting on a fetch, not on tidy-up. Relaunching loses nothing worth keeping:
   * this fetcher relies on no cookie or session state, and the caller's cache and rate limiter
   * live in the source.
   *
   * Guarded on identity — if another path has already replaced this slot's session, this one must
   * not clear its successor.
   */
  function discard(slot: PoolSlot, expected: Promise<TrackedSession>, tracked: TrackedSession): void {
    if (slot.session === expected) slot.session = undefined;
    void tracked.session.browser.close().catch(() => undefined);
  }

  async function launchTracked(userAgent: string | undefined): Promise<TrackedSession> {
    const live = await launch(userAgent);
    const tracked: TrackedSession = { session: live, crashed: false, navigations: 0 };
    // The only signal Playwright gives for a crashed renderer. It arrives on the page object, not
    // as a rejection, and a crash that happens *between* two fetches would otherwise be invisible
    // until the next `goto` failed.
    live.page.on('crash', () => {
      tracked.crashed = true;
    });
    return tracked;
  }

  function getSession(slot: PoolSlot, userAgent: string | undefined): Promise<TrackedSession> {
    // `close()` is the caller saying it is finished (worker shutdown). A straggler fetch after
    // that must fail, never quietly launch a browser nobody is left to close.
    if (disposed) {
      return Promise.reject(new Error('Trendyol Playwright fetcher has been closed'));
    }
    const existing = slot.session;
    if (existing) {
      return existing.then((tracked) => {
        if (isUsable(tracked)) return tracked;
        // A browser that launched successfully and *later died* is not a launch failure, and
        // caching it as one is what the check below would otherwise do.
        discard(slot, existing, tracked);
        return getSession(slot, userAgent);
      });
    }
    // Deliberate: a failed launch (e.g. missing OS-level Chromium libraries, doc 10 §1) is
    // cached, not retried per call — every `fetch()` on this slot after that fails fast with the
    // same error rather than re-attempting an expensive, likely-still-broken launch on each
    // scrape. Per slot rather than per fetcher, so a broken install costs one failed launch per
    // lane rather than one: a handful of attempts at startup, not one per product. Each failure
    // still reaches `ICompetitorSource.fetchProductOffers`'s catch and is recorded as an ordinary
    // `fetchFailed` (doc 07 §7: never escalates); a worker restart is what clears a launch
    // failure, same as every other config problem this source depends on.
    const launched = launchTracked(userAgent);
    slot.session = launched;
    return launched;
  }

  return {
    fetch(url, init) {
      return withPage(async (slot) => {
        const userAgent = init.headers['User-Agent'] ?? init.headers['user-agent'];
        const timeout = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        let abortRetries = 0;
        let deadSessionRetries = 0;
        let tracked = await getSession(slot, userAgent);
        let response;
        for (;;) {
          try {
            tracked.navigations += 1;
            response = await tracked.session.page.goto(url, {
              waitUntil: 'domcontentloaded',
              timeout,
            });
            break;
          } catch (error) {
            // The session died mid-navigation: replace it and try once on the new one. Without
            // this the caller sees a failure whose cause has already been cleared, and — worse
            // before `isUsable` learned about crashes — the next caller inherited the corpse.
            if (isDeadSession(error)) {
              // Marked before the retry budget is consulted, so even the attempt that gives up
              // leaves a session nobody will be handed again. That ordering *is* the fix for the
              // 20-hour outage: the failure that ends the item must still retire the corpse.
              tracked.crashed = true;
              if (deadSessionRetries < DEAD_SESSION_RETRIES) {
                deadSessionRetries += 1;
                tracked = await getSession(slot, userAgent);
                continue;
              }
            }
            // The abort race above. A timeout or any other navigation failure propagates on the
            // first attempt, exactly as before.
            if (isAbortedNavigation(error) && abortRetries < ABORTED_NAVIGATION_RETRIES) {
              abortRetries += 1;
              continue;
            }
            throw error;
          }
        }
        if (response === null) {
          throw new Error(`Trendyol public page navigation to ${url} produced no response`);
        }
        const status = response.status();
        // `page.content()` (DOM-serialised), not `response.text()` (raw network body via CDP).
        // Measured 2026-08-17: awaiting `response.text()` on a page reused for a later navigation
        // makes that *later* navigation's own `timeout` stop being enforced — it hangs indefinitely
        // instead of throwing, reproduced deterministically with a local test server. `page.content()`
        // carries no such issue and pages are reused for the fetcher's whole lifetime, so
        // this was a real production hazard on the very first hung/slow request after any success.
        // Doc 07 §7's inline `__envoy__SHARED_PROPS` script is a DOM text node either way, so the
        // parser sees the same content it would have from the raw response.
        const body = await tracked.session.page.content();
        // Playwright lower-cases header names; `Retry-After` is the only one read (doc 07 §7.7).
        const headers = response.headers();
        return {
          ok: status >= 200 && status < 300,
          status,
          url: response.url(),
          headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
          text: async () => body,
        };
      });
    },
    async close() {
      disposed = true;
      const open = slots.map((slot) => {
        const existing = slot.session;
        slot.session = undefined;
        return existing;
      });
      await Promise.all(
        open.map(async (existing) => {
          if (!existing) return;
          // `catch`, not a bare await: a cached *launch failure* has no browser to close, and
          // shutdown must not be the place that finally rethrows it.
          const tracked = await existing.catch(() => undefined);
          await tracked?.session.browser.close();
        }),
      );
    },
  };
}
