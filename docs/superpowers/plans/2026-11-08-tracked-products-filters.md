# Takip Edilen Ürünler — priority ordering, seller filters, compact header — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/tracked-products` opens on the most-reviewed cards, hides cards nobody sells, filters by
seller and by 30-day seller count, and fits all of it in one compact filter strip.

**Architecture:** A new table `tracked_product_sellers` (product × seller, `first_seen_at`,
`last_seen_at`) is written on every successful look and backfilled once from observations. The
list repository filters/sorts on it; the route exposes the new params and batches the per-row
latest-look read; the client is restructured to layout A.

**Tech Stack:** TypeScript strict, Drizzle ORM (SQLite / PostgreSQL / MySQL), Next.js 16 route
handlers, React, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-tracked-products-filters-design.md` — read it first;
section numbers below (§n) refer to it.

## Global Constraints

- Every schema change in **all three** dialect schemas (`packages/db/src/schema/{sqlite,postgres,mysql}.ts`) and a generated migration per dialect (`npm run db:generate:{sqlite,postgres,mysql} -w @buybox/db`).
- DB tests run across `ALL_DIALECTS` (`packages/db/src/test-helpers.ts`), like `availability.test.ts`.
- Timestamps are epoch **ms** numbers; money stays `bigint` (none is added here).
- Seller identity = (`marketplace_code`, `seller_ref`); never derive identity or names from display text. Names come from `competitor_sellers`.
- The 30-day window is `now − periodDays × 86 400 000 ms`, `periodDays` default **30** (`DEFAULT_PERIOD_DAYS` in `apps/web/src/app/api/tracked-products/route.ts`).
- A failed look (`offersHash === null`) and a `noOffers` look write **no** seller rows; rows with `seller_ref` null are skipped.
- `last_seen_at` only moves forward (`max` on SQLite, `greatest` on PostgreSQL/MySQL), as `last_scraped_at` does.
- Turkish UI copy exactly as in spec §5: `+ Link ile ekle`, `Satıcı`, `Değ. ≥`, `Satıcı ≥`, `Diğer`, `Kayıtlı`, `Temizle`, `Satıcısızları göster`, `Sadece aramada çıkanlar`, `Değerlendirmesi olmayanlar`, `Mevcut filtreyi kaydet…`.
- Do not commit unless the product owner asked for commits in this session; the Commit steps below are where a commit belongs if they did.

## Review Focus

1. **A seller whose offer set has not changed for 40 days** must still match the seller filter and count toward `Satıcı ≥` once a look has happened inside the window — test in Task 2.
2. **The same `seller_ref` on Trendyol and Hepsiburada** must not leak across marketplaces in the filter or the dropdown — test in Task 3.
3. **Unscanned cards (`has_sellers` null)** stay visible by default while `has_sellers = false` cards are hidden — test in Task 3.
4. **A saved column preference naming `periodSellerCount`** (removed column) must load without error — test in Task 6.
5. **A preset saved before this change** (no `sellerRef`, `minSellerCount` keys) must apply cleanly — test in Task 6.

---

### Task 1: `tracked_product_sellers` table, indexes, backfill migration

**Files:**
- Modify: `packages/db/src/schema/sqlite.ts`, `packages/db/src/schema/postgres.ts`, `packages/db/src/schema/mysql.ts` (after `trackedProductObservations`)
- Create: generated migration per dialect under `packages/db/migrations/{sqlite,postgres,mysql}/` (expected `0026_*`), with the backfill SQL **appended by hand** to each, as migration 0022 did for PSF
- Test: `packages/db/src/tracked-product-sellers-migration.test.ts` (shape copied from `psf-migration.test.ts`)
- Modify: `docs/05-data-model.md` — new section after `tracked_products` / `tracked_product_observations`

**Interfaces:**
- Produces: schema export `trackedProductSellers` in each dialect schema with columns `trackedProductId` (`tracked_product_id`, FK → `tracked_products.id`, cascade), `sellerRef` (`seller_ref`, not null), `firstSeenAt` (`first_seen_at`, ms, not null), `lastSeenAt` (`last_seen_at`, ms, not null); primary key (`tracked_product_id`, `seller_ref`); indexes `tracked_product_sellers_seller_seen` on (`seller_ref`, `last_seen_at`) and `tracked_product_sellers_product_seen` on (`tracked_product_id`, `last_seen_at`). Also index `tracked_products_rating_count` on `tracked_products(rating_count)`.

- [ ] **Step 1: Write the failing migration test** — migrate to the migration before the new one (cut journal, as `migrationsBefore0022` does), seed one tracked product with observations: seller `S1` ok at `T0` and `T0+5d`, seller `S2` ok at `T0+2d`, one `noOffers` row, one `fetchFailed` row, one ok row with `seller_ref` null; migrate the rest of the way. Assert:
  ```ts
  expect(rows).toEqual([
    { trackedProductId: p, sellerRef: 'S1', firstSeenAt: T0, lastSeenAt: T0 + 5 * DAY },
    { trackedProductId: p, sellerRef: 'S2', firstSeenAt: T0 + 2 * DAY, lastSeenAt: T0 + 2 * DAY },
  ]); // ordered by sellerRef
  ```
- [ ] **Step 2: Run** `npm test -w @buybox/db -- tracked-product-sellers-migration` — Expected: FAIL (table does not exist).
- [ ] **Step 3: Add the table to the three schemas, generate the three migrations, append the backfill** — `insert into tracked_product_sellers (...) select tracked_product_id, seller_ref, min(observed_at), max(observed_at) from tracked_product_observations where status = 'ok' and seller_ref is not null group by tracked_product_id, seller_ref` (one statement per dialect, statement-breakpoint style the generated file uses).
- [ ] **Step 4: Run** the test again, then the whole DB suite `npm test -w @buybox/db` — Expected: PASS on every dialect in `BUYBOX_TEST_DIALECTS`.
- [ ] **Step 5: Update doc 05** with the table, its write rule (spec §4.2) and the backfill gap (spec §4.4).
- [ ] **Step 6: Commit** — `feat(db): tracked_product_sellers table with backfill`

### Task 2: Record seller presence on every successful look

**Files:**
- Modify: `packages/db/src/repositories/tracked-products.ts` — `recordTrackedProductLook` (≈ line 496)
- Test: `packages/db/src/repositories/tracked-product-sellers.test.ts` (seed helpers copied from `availability.test.ts`)

**Interfaces:**
- Consumes: `trackedProductSellers` (Task 1).
- Produces: `listTrackedProductSellers(appDb, trackedProductId): Promise<{ sellerRef: string; firstSeenAt: number; lastSeenAt: number }[]>` exported from `tracked-products.ts` (used by tests and Task 3's tests).

- [ ] **Step 1: Write failing tests** (one `it` each, all dialects):
  - `records each ok seller of a look` — look at `NOW` with S1, S2 → two rows, `firstSeenAt = lastSeenAt = NOW`.
  - `advances last_seen_at on an unchanged look` — same `offersHash` at `NOW + 40 * DAY` → S1 `lastSeenAt === NOW + 40 * DAY`, `firstSeenAt === NOW`; and **no** new observation rows were written (`changed === false`).
  - `never moves last_seen_at backwards` — look at `NOW + 2d` then a retry at `NOW + 1d` → `lastSeenAt === NOW + 2 * DAY`.
  - `failed look writes nothing` — `offersHash: null` → `[]`.
  - `noOffers look writes nothing` and `skips rows without seller_ref`.
- [ ] **Step 2: Run** `npm test -w @buybox/db -- tracked-product-sellers` — Expected: FAIL.
- [ ] **Step 3: Implement** — inside `recordTrackedProductLook`, when `!failed`, upsert one row per distinct `seller_ref` of `look.rows` with `status === 'ok'`: insert `(trackedProductId, sellerRef, observedAt, observedAt)`; on conflict set `last_seen_at = max/greatest(existing, observedAt)`. Use `onConflictDoUpdate` (SQLite/PostgreSQL) and `onDuplicateKeyUpdate` (MySQL) inside the existing `runDialect` call pattern.
- [ ] **Step 4: Run** the test file, then `npm test -w @buybox/db` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(db): record tracked product sellers on every successful look`

### Task 3: List query — seller filter, seller count, default no-seller exclusion, batched latest look, seller options

**Files:**
- Modify: `packages/db/src/repositories/tracked-products.ts` — `TrackedProductQueryOptions` (≈ 949), `buildTrackedWhere` (≈ 1000), `trackedSortColumn` (≈ 1033), `queryTrackedProducts` (≈ 1076); add the two functions below
- Test: `packages/db/src/repositories/tracked-product-sellers.test.ts` (extend) and `packages/db/src/repositories/availability.test.ts` (extend for exclusion)

**Interfaces:**
- Consumes: `trackedProductSellers`, `recordTrackedProductLook` (Task 2).
- Produces:
  - `TrackedProductQueryOptions` gains `hideNoSeller?: boolean`, `seller?: { marketplaceCode: string; sellerRef: string }`, `minSellerCount?: number`, `sellerSinceMs?: number` (required when any seller option or the `sellerCount` sort is used), and sort value `'sellerCount'`.
  - `queryTrackedProducts` rows gain `sellerCount: number` (distinct sellers with `last_seen_at >= sellerSinceMs`; `0` when none; present on every row when `sellerSinceMs` is given).
  - `latestTrackedProductObservationsFor(appDb, ids: readonly string[]): Promise<Map<string, TrackedProductObservationRow[]>>` — same rows per id as `latestTrackedProductObservations`, one query (chunk ids like `periodStatsFor` does).
  - `trackedProductSellerOptions(appDb, { sinceMs, marketplaceCode?, watchedBrandId? }): Promise<{ marketplaceCode: string; sellerRef: string; sellerName: string | null; productCount: number }[]>` — distinct sellers with `last_seen_at >= sinceMs` joined to `tracked_products` (scope) and left-joined to `competitor_sellers` for the name; ordered by `productCount` desc, then `sellerRef`.

- [ ] **Step 1: Write failing tests** (all dialects):
  - `hideNoSeller keeps sellers and unscanned, drops nobody-selling` — three products with `has_sellers` true / null / false → returns the first two.
  - `seller filter finds a seller unchanged for 40 days` — look at `NOW − 40d`, identical-hash look at `NOW − 1d`; `sellerSinceMs = NOW − 30d`; `seller: { marketplaceCode: 'TY', sellerRef: 'S1' }` → product returned, `sellerCount === 1`.
  - `seller filter excludes a seller last seen before the window` — only look at `NOW − 40d` → not returned.
  - `seller filter does not cross marketplaces` — same ref `S1` on a `TY` product and an `HB` product; filter `TY/S1` → only the TY product.
  - `minSellerCount counts distinct sellers in the window` — product A with S1,S2,S3 in window, B with S1 → `minSellerCount: 2` returns A only.
  - `sorts by sellerCount desc, ties by label` (add `label` as secondary order for every sort).
  - `latestTrackedProductObservationsFor matches the per-row function` — for 3 products, compare map entries to `latestTrackedProductObservations` results.
  - `trackedProductSellerOptions` — names from `competitor_sellers`, null name when absent, scoped by `watchedBrandId`, ordered by productCount desc.
- [ ] **Step 2: Run** `npm test -w @buybox/db -- tracked-product-sellers availability` — Expected: FAIL.
- [ ] **Step 3: Implement** — `hideNoSeller` → `or(isNull(t.hasSellers), eq(t.hasSellers, true))`; seller → `eq(t.marketplaceCode, mp)` + `exists (...)` per spec §4.3; count → a grouped derived table (`tracked_product_id`, `count(*)` where `last_seen_at >= since`) left-joined, `coalesce(n, 0)`, used for select, `having`-free `where` (`>= minSellerCount`) and order. The count query (`total`) applies the same joins/filters.
- [ ] **Step 4: Run** the tests, then `npm test -w @buybox/db` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(db): tracked products seller filter, 30-day seller count, batched latest look`

### Task 4: Route — params, defaults, export, seller options endpoint

**Files:**
- Modify: `apps/web/src/app/api/tracked-products/route.ts`
- Create: `apps/web/src/app/api/tracked-products/sellers/route.ts`
- Modify: `apps/web/src/lib/tracked-product-columns.ts` — `sellerCount` becomes exportable from `row.sellerCount`; remove `periodSellerCount`
- Test: `apps/web/src/app/api/tracked-products/route.test.ts` (new; shape copied from `apps/web/src/app/api/brand/listings/route.test.ts`), `apps/web/src/lib/tracked-product-columns.test.ts` (update)

**Interfaces:**
- Consumes: Task 3's options, `sellerCount` row field, `latestTrackedProductObservationsFor`, `trackedProductSellerOptions`.
- Produces:
  - `GET /api/tracked-products` accepts `sellerMarketplace`, `sellerRef` (both or neither), `minSellerCount`, `sort=sellerCount`; **default** `sort=ratingCount`, `sortDir=desc`; passes `hideNoSeller: true` unless `noSellerOnly=true`; passes `sellerSinceMs = periodWindow.sinceMs` always. Response products gain `sellerCount: number`. CSV honours all of it.
  - `GET /api/tracked-products/sellers?marketplaceCode=&watchedBrandId=` → `{ sellers: { marketplaceCode, sellerRef, sellerName, productCount }[] }`, same permission guard as the list route.

- [ ] **Step 1: Write failing route tests** — default request orders by rating desc and omits a `has_sellers = false` product; `noSellerOnly=true` returns only it; `sellerMarketplace=TY&sellerRef=S1` filters; `minSellerCount=2` filters; CSV with `columns=label,sellerCount` contains the 30-day count; `/sellers` returns names and counts.
- [ ] **Step 2: Run** `npm test -w apps/web -- api/tracked-products tracked-product-columns` — Expected: FAIL.
- [ ] **Step 3: Implement** — parse params; replace the `rows.map(... latestTrackedProductObservations ...)` fan-out with one `latestTrackedProductObservationsFor` call; drop `sellerCount` from the period stats read for this route.
- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(web): tracked products API seller filters and rating-first default`

### Task 5: Compact sweep chip

**Files:**
- Modify: `apps/web/src/components/sweep-pass-card.tsx`
- Test: add a case to the existing sweep-pass tests if present, else `apps/web/src/components/sweep-pass-card.test.tsx`

**Interfaces:**
- Produces: `SweepPassCard` prop `variant?: 'card' | 'chip'` (default `'card'`, current rendering unchanged for `/jobs`). `'chip'` renders one inline element: `{label} #{n}`, a small progress bar, `%{pct}`, with the card's remaining details in its `title`.

- [ ] **Step 1: Failing test** — `variant="chip"` renders text `Tarama turu #1089` and `%35` for a stubbed pass of 35 %, and no "Önceki tur" block outside the tooltip.
- [ ] **Step 2: Run** `npm test -w apps/web -- sweep-pass-card` — Expected: FAIL.
- [ ] **Step 3: Implement** the variant.
- [ ] **Step 4: Run** — Expected: PASS; `/jobs` tests still pass.
- [ ] **Step 5: Commit** — `feat(web): compact sweep pass chip`

### Task 6: Client — layout A, new filters, default sort

**Files:**
- Modify: `apps/web/src/app/tracked-products/tracked-products-client.tsx`
- Create: `apps/web/src/components/searchable-select.tsx` (type-to-filter dropdown; click-outside pattern of `ColumnMenu` in `components/table.tsx`; `role="combobox"` + `listbox`, ↑/↓/Enter/Esc)
- Create: `apps/web/src/components/popover-button.tsx` (button + anchored panel, same click-outside pattern) — used by `Diğer`, `Kayıtlı`, `+ Link ile ekle`
- Test: `apps/web/src/app/tracked-products/tracked-products-client.test.tsx` (extend), `apps/web/src/components/searchable-select.test.tsx`

**Interfaces:**
- Consumes: Task 4's params and `/api/tracked-products/sellers`; Task 5's `variant="chip"`.
- Produces: `Filters` gains `seller: string` (encoded `"{marketplaceCode}:{sellerRef}"`, `''` = all) and `minSellerCount: string`; `EMPTY_FILTERS` gains both as `''`. `Sort` gains `'sellerCount'`. Initial `sort = 'ratingCount'`, `sortDir = 'desc'`. Read-once URL seeding adds `sellerMarketplace`+`sellerRef` → `seller`, and `minSellerCount`. `SearchableSelect` props: `{ label: string; value: string; options: { value: string; label: string; hint?: string }[]; onChange(value: string): void; placeholder?: string }`.

- [ ] **Step 1: Failing tests:**
  - `requests rating-first by default` — first list fetch URL contains `sort=ratingCount&sortDir=desc`.
  - `Diğer shows how many hidden filters are active` — tick `Satıcısızları göster` inside the popover → button text `Diğer (1)`.
  - `selecting a seller sends both params` — choose option `TY:S1` → fetch URL has `sellerMarketplace=TY&sellerRef=S1`.
  - `selection bar is hidden until a row is selected` — `Seçilenleri Tekrar Tara` absent, then present after ticking a row.
  - `an old preset applies` — localStorage `trackedProducts.filterPresets` with a preset lacking the new keys → applying it sends no seller params and no error.
  - `a stored column preference with periodSellerCount loads` — localStorage `trackedProducts.columns` containing `periodSellerCount` → grid renders, no `Dönem Satıcı` header.
  - `Temizle keeps the sort` — sort by `Satıcı`, press `Temizle` → next fetch still has `sort=sellerCount`.
  - `SearchableSelect` filters options by typed text (Turkish case-insensitive via `toLocaleLowerCase('tr-TR')`) and selects with Enter.
- [ ] **Step 2: Run** `npm test -w apps/web -- tracked-products-client searchable-select` — Expected: FAIL.
- [ ] **Step 3: Implement layout A** (spec §5): header actions `+ Link ile ekle` (popover holding the existing link/label form), `Sütunlar`, `Excel'e Aktar`; summary line replacing the three `StatCard`s and the standalone `SweepPassCard` (`ürün · marka · kategori · <SweepPassCard variant="chip" …/>`); one strip `Ara · Marka · Kategori · Satıcı · Değ. ≥ · Satıcı ≥ · Diğer (n) · Kayıtlı · Temizle`; `Diğer` holds Durum + the three checkboxes (label `Satıcısızları göster` for `noSellerOnly`); `Kayıtlı` holds apply/delete/“Mevcut filtreyi kaydet…”; selection bar only when `selected.size > 0`; `Satıcı` column reads `p.sellerCount` and is sortable; remove `periodSellerCount` from `COLUMN_DEFS`; numeric sortable columns start `desc` on first click.
- [ ] **Step 4: Run** the tests, then `npm test -w apps/web` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(web): tracked products compact filter strip with seller filters`

### Task 7: Docs and measured performance

**Files:**
- Modify: `docs/06-user-interface.md` §12.2 / §12.4, `docs/15-ui-redesign-plan.md` brief 2.2
- Modify: this plan — fill the results table below

- [ ] **Step 1: Update doc 06** — default order, hidden no-seller cards, seller filter and `Satıcı ≥` (30-day), layout A, `Dönem Satıcı` removed; **doc 15** brief 2.2 — compact header note.
- [ ] **Step 2: Measure** on an install with ≥ 6,000 tracked products (the rehearsal PC: build + install, or point a dev server at its PostgreSQL) — `fetch('/api/tracked-products?limit=200')` default, with a seller selected, and `limit=50`, five runs each, median.
- [ ] **Step 3: Check the bar** (spec §6): 200 rows default and with a seller **< 300 ms**; 50 rows **< 150 ms**. If missed, `EXPLAIN` the slow query on PostgreSQL and add the missing index in a follow-up migration before finishing.
- [ ] **Step 4: Full suite** `npm test` at the root and `npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** — `docs: tracked products seller filters and compact header`

| Request | Before (2026-11-08) | After |
|---|---|---|
| 200 rows, default | 716 ms (label sort) | not yet measured on PostgreSQL |
| 200 rows, seller selected | — | not yet measured on PostgreSQL |
| 50 rows, default | 140 ms (rating sort) | not yet measured on PostgreSQL |

**Synthetic SQLite measurement (2026-11-08, executor).** The rehearsal PC's PostgreSQL password is
in an ACL-protected `.env.local`, so the bar above could not be measured there yet. Instead:
6,642 synthetic products, ~75 % looked at (four looks over 60 days, 0–8 of 400 sellers each),
repository calls the route makes (list + latest look + period band), in-process SQLite, median of
five runs:

| Request | Old path (per-row latest look) | New path |
|---|---|---|
| 200 rows, rating sort | 314 ms | 46 ms |
| 200 rows, seller selected | — | 53 ms |
| 200 rows, sort by Satıcı | — | 72 ms |
| 200 rows, Satıcı ≥ 3 | — | 83 ms |
| 50 rows, rating sort | 108 ms | 27 ms |
| Seller dropdown list | — | 56 ms |

Same ratio expected on PostgreSQL, where each of the old path's 400 queries also pays a network
round trip. **Still to do:** measure the real bar on the rehearsal install after the update.
