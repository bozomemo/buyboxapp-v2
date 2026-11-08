# Takip Edilen Ürünler: priority ordering, seller filters, compact header — design

Date: 2026-11-08. Status: approved by the product owner 2026-11-08 (builder check done).

Screen: `/tracked-products` (doc 06 §12.2, §12.4; doc 15 brief 2.2). Data: doc 05
`tracked_products` / `tracked_product_observations`.

## 1. Why

A brand sweep puts thousands of cards on this screen (6,642 on the rehearsal install the day this
was written; 7,309 on the live one). Today they arrive **A→Z by label**, every card with equal
weight. The operator opens this screen to look at the cards that matter — the ones with many
reviews, which sell, and which other sellers compete on — and those are buried among cards
nobody buys and cards nobody sells.

Product owner, 2026-11-08:

- "Bütün ürün kartlarının eşit şartlarda gösterilmesi saçma. Çok değerlendirmesi olan ürün
  kartları daha öncelikli gösterilmeli."
- "Hiç satıcısı olmayan ürünleri ikinci plana alabiliriz. Burada kalabalık göstermesine gerek yok."
- Filters must not take more room than today; make other parts more compact to fit new ones.

## 2. Goals

1. **Default order: review count, most first.** Cards whose review count could not be read
   (`rating_count is null`) stay last — the existing nulls-last rule (`trackedOrderBy`).
2. **Cards with no sellers are hidden by default.** Shown — alone — only when the operator ticks
   _Satıcısızları göster_.
   - "No sellers" means `has_sellers = false`: the last **successful** look found nobody.
   - **Not-yet-looked cards (`has_sellers is null`) stay visible by default** (owner's decision).
     Right after a brand sweep most cards are in this state; hiding them would empty the screen.
3. **Seller filter.** A searchable dropdown (type to filter). Selecting a seller shows the cards
   that seller sold **at any moment in the last 30 days**.
4. **Seller-count filter** _Satıcı ≥ N_: the number of **distinct sellers seen in the last
   30 days** (owner's decision — not "sellers on the latest look").
5. **Compact header (layout A, "tek şerit"),** see §5.
6. **Page performance**, see §6.

## 3. Non-goals

- No change to what the sweep reads, how often, or at what rate (doc 07 §7.4/§7.5).
- No change to the detail screen `/tracked-products/[id]`.
- No period selector on the screen. The window stays the fixed 30 days the grid already uses
  (`DEFAULT_PERIOD_DAYS`, `api/tracked-products/route.ts`); `?periodDays=` keeps working for
  callers that pass it, and the new seller window follows it (§4.3).
- Nothing here touches pricing. This screen is reporting only (CLAUDE.md, competitor sources).

### Anti-goals (would make this a failure even if it "works")

- A seller filter or seller count that silently **misses a seller whose offer set has not changed
  for 30+ days** (§4.1 — the trap this design exists to avoid).
- Hiding unscanned cards by default.
- A filter bar that is taller than today's.
- Seller identity, names or counts derived from display text. Ids only (CLAUDE.md, competitor
  sources rule); names come from `competitor_sellers`, as on Marka Satıcıları.

## 4. Data

### 4.1 The trap: observations are change-only

`recordTrackedProductLook` writes offer rows **only when the offer set changed**
(`tracked-products.ts`, "Faz 4, 2026-08-28"). A card sold by the same three sellers for 40 days
has **no observation rows in the last 30 days**. Any "last 30 days" query over
`tracked_product_observations` therefore reports 0 sellers for it and the seller filter never
finds it.

The hidden _Dönem Satıcı_ column (`periodSellerCount`, from
`brandReportsRepo.trackedProductPeriodStats`) is computed exactly that way today and has this
defect. It has not shown yet only because the data is younger than the window.

### 4.2 New table `tracked_product_sellers`

One row per (tracked product, seller) ever seen on a successful look.

| Column | Type | Notes |
|---|---|---|
| `tracked_product_id` | text, FK → `tracked_products.id`, `on delete cascade` | |
| `seller_ref` | text, not null | the marketplace's seller id; rows whose `seller_ref` is null are not recorded |
| `first_seen_at` | timestamp ms, not null | |
| `last_seen_at` | timestamp ms, not null | guarded: only moves forward (`max`/`greatest`), like `last_scraped_at` |

- Primary key / unique: (`tracked_product_id`, `seller_ref`).
- Index: (`seller_ref`, `last_seen_at`) for the seller filter; (`tracked_product_id`,
  `last_seen_at`) for the count.
- Marketplace is not repeated: it is the tracked product's. Seller **name** is not stored here;
  it is read from `competitor_sellers` (marketplace, seller_ref), the shared seller identity
  (doc 05 §5).
- All three dialects (SQLite, PostgreSQL, MySQL) get the table, through the usual drizzle
  schema + generated migration per dialect. Doc 05 gets a section for it.

**Written by `recordTrackedProductLook` on every successful look, changed or not** — the same
rule `has_sellers` and `last_seller_seen_at` already follow. For each `status = 'ok'` row with a
`seller_ref`: upsert, setting `last_seen_at = max(existing, observedAt)` and `first_seen_at` on
insert. A failed look writes nothing (a page we could not read is not evidence about sellers).
A `noOffers` look writes nothing (there are no sellers to record).

### 4.3 What reads it

With `since = now − periodDays` (default 30 days):

- **Seller filter** (`?sellerMarketplace=&sellerRef=`, see §5.1): `t.marketplace_code = :mp and
  exists (select 1 from tracked_product_sellers s where s.tracked_product_id = t.id and
  s.seller_ref = :ref and s.last_seen_at >= :since)`.
- **Seller count** (filter `?minSellerCount=` and sort `sellerCount`): `count(*)` of rows with
  `last_seen_at >= :since`, per product. Implemented as a grouped subquery joined to the page
  query (or a correlated subquery — builder's call, whichever is fast on all three dialects; see
  §6 for the bar).
- **The _Satıcı_ column** (owner's decision 2026-11-08) shows **this 30-day count**, sorts by it,
  and becomes exportable. It no longer shows the latest-look count computed client-side from
  `latest` (`market.sellerCount`). The hidden _Dönem Satıcı_ column (`periodSellerCount`) is
  **removed** — it would now repeat _Satıcı_. Saved column preferences that still name
  `periodSellerCount` must be tolerated (ignored), not crash. Filter, column and sort therefore
  all use the same number. The other figures in `trackedProductPeriodStats` (min/max price,
  change count) are not changed by this design.

"Sold at any moment in the last 30 days" therefore means: seen on at least one successful look
whose time is within the window. Since the sweep looks at every active card continuously, a
seller continuously on the page has `last_seen_at` within one pass of now.

### 4.4 Backfill

The migration ships the table empty. A one-time backfill fills it from existing
`tracked_product_observations` (`status = 'ok'`, `seller_ref` not null): grouped by
(product, seller), `first_seen_at = min(observed_at)`, `last_seen_at = max(observed_at)`.

Known gap, accepted: a seller whose offer set has not changed since before the window has a
backfilled `last_seen_at` that is old, so for up to **one sweep pass** after upgrade the filter
may miss them. The next successful look of that card corrects it. Not worth a cleverer backfill.

The backfill runs once, in batches, without holding up boot (it must not delay the installer's
health check, doc 14 §5 step 8). Where it runs — a migration step, a boot task, or a job — is the
builder's call, provided it is idempotent and logged.

### 4.5 Seller dropdown source

New endpoint (or a mode on an existing one) returning the sellers that appear in
`tracked_product_sellers` within the window, scoped by the current marketplace/brand filters
where cheap: `seller_ref`, marketplace, name from `competitor_sellers` (fallback: the ref
itself), and product count. Sorted by product count, most first.

Searching is client-side over that list if it is small enough to send whole (expected: hundreds
of sellers); otherwise server-side with a `q=` parameter. Builder's call, against the §6 bar.

## 5. Screen (layout A — "tek şerit", chosen 2026-11-08)

Top to bottom:

1. **Header row:** title; actions on the right: **+ Link ile ekle** (new; opens the existing
   link + label form as a popover or inline panel), Sütunlar, Excel'e Aktar.
2. The two-line description stays but is shortened to one line if possible (builder's call).
3. **Summary line** (replaces the three `StatCard`s and the separate `SweepPassCard` block):
   `6.642 ürün · 3 marka · 41 kategori · [Tarama #1089 ▬▬▬ %35]`. The sweep chip keeps the
   current card's information (pass number, progress, started/finished, previous pass) in a
   tooltip or popover. The "Ürün" figure keeps meaning "matching the current filter".
4. **One filter strip, one row on a normal desktop width** (wraps on narrow screens):
   `Ara · Marka ▾ · Kategori ▾ · Satıcı 🔍▾ · Değ. ≥ · Satıcı ≥ · Diğer (n) ▾ · Kayıtlı ▾ · Temizle`
   - **Satıcı** — searchable dropdown (§4.5). Shows the seller name; "Tümü" clears it.
   - **Değ. ≥** — the existing _En az değerlendirme_, narrower label.
   - **Satıcı ≥** — new number input (§4.3).
   - **Diğer (n) ▾** — popover holding: _Durum_ (Tümü/Aktif/Duraklatıldı), _Sadece aramada
     çıkanlar_, _Değerlendirmesi olmayanlar_, _Satıcısızları göster_. `(n)` = how many of these
     are active, so a filter hidden in the popover is never invisible.
   - **Kayıtlı ▾** — the saved-filter presets move into one dropdown: apply a preset, delete
     one, and "Mevcut filtreyi kaydet…" (name input inside the dropdown). Same storage as today.
   - **Temizle** — resets to the defaults of §2 (review-count sort is a sort, not a filter, and
     is not touched by Temizle).
5. **Selection bar** (_N ürün seçildi · Seçilenleri Tekrar Tara · Seçimi temizle_) is shown
   **only when at least one row is selected**.
6. Pagination + table, unchanged except: default sort review count ▼; _Satıcı_ shows the 30-day
   count and is sortable; _Dönem Satıcı_ removed (§4.3).

The _Ürünüme bağla_ panel and error/notice messages keep their current behaviour.

### 5.1 Behaviour details

- **Default sort** `ratingCount desc`. Clicking a column header keeps working; clicking the
  review column first time on a non-active sort goes **desc** (most first) — numeric columns
  should open on their useful direction. Builder may apply the same to other numeric columns.
- **_Satıcısızları göster_** replaces _Satıcısı olmayanlar_ and keeps its meaning: ticked →
  only `has_sellers = false`. Unticked → `has_sellers is distinct from false` (true or null).
  The API parameter `noSellerOnly=true` stays; a new default exclusion applies when it is absent.
  Callers that want everything (CSV of all, other screens using this route) need a way to say
  so — e.g. `includeNoSeller=true`. Builder checks every caller of `/api/tracked-products`.
- **URL state (Claude's call):** unchanged mechanism. The new filters join the existing
  **read-once** seeding from the query string at mount (`tracked-products-client.tsx`, the
  comment there rejects two-way sync on purpose); the page does not start writing state back to
  the URL. Saved presets store filters only — the new keys included — and **not** the sort,
  consistent with Temizle not touching the sort. A preset saved before this change still applies
  (missing keys = default); no preset migration.
- **Seller identity is per marketplace (Claude's call).** Seller refs are unique only within a
  marketplace (`competitor_sellers` is keyed by marketplace + seller_ref). The seller filter
  therefore carries both — `?sellerMarketplace=&sellerRef=` — and matches only cards on that
  marketplace. The dropdown shows the marketplace next to the name when more than one is present.
- **CSV export** honours all the new filters and the sort (R-UI-13), as it does today.
- Turkish labels as above; numbers formatted only at display (CLAUDE.md).

## 6. Performance

Measured on the rehearsal install, 6,642 cards, PostgreSQL, 2026-11-08:

| Request | Time |
|---|---|
| 50 rows, sort label | 115 ms |
| 50 rows, sort ratingCount desc | 140 ms |
| 200 rows (`limit=250` capped at 200) | **716 ms** |
| `noSellerOnly=true` | 356 ms |

The 200-row cost is the **per-row latest-look fan-out** in the list route:
`latestTrackedProductObservations` runs two queries per row (latest timestamp, then its rows) →
400 queries for a 200-row page. Replace it with **one query for the page** (latest look per
product id in the page, e.g. a window function or `max(observed_at)` group joined back), the way
`periodStatsFor` and `cardLinksForTrackedProducts` already work.

Also: index for the default sort (`rating_count`) and for the default `has_sellers` exclusion if
the plan shows a sequential scan; and the indexes in §4.2.

**Bar:** a 200-row page with the default filters, and with a seller selected, under **300 ms**
on the rehearsal data; 50-row page under 150 ms. Measured before and after, numbers written into
the plan's result.

## 7. Tests (per CLAUDE.md conventions)

- Repository: table-driven tests for `tracked_product_sellers` upsert (insert, forward-only
  `last_seen_at`, failed look writes nothing, `noOffers` writes nothing, null `seller_ref`
  skipped); for the seller filter and count **including the 40-day-unchanged case of §4.1**; for
  the default no-seller exclusion with `has_sellers` true / false / null. On every dialect the DB
  suite runs.
- Backfill: idempotent (run twice = same rows).
- Route: new params, default sort, CSV honours them.
- Client: strip renders one row at desktop width; `Diğer (n)` count; selection bar hidden at 0;
  presets dropdown; searchable seller dropdown.

## 8. Docs to update with the change

- doc 05: `tracked_product_sellers`.
- doc 06 §12.2/§12.4: new default order, hidden no-seller cards, seller filters, layout.
- doc 15 brief 2.2: note the compact header.

## 9. Calls made by Claude (not discussed with the owner — check these)

- A new table rather than a column on `tracked_products` (a rolling 30-day count cannot be a
  stored column).
- Seller name from `competitor_sellers`, not stored in the new table.
- Dropdown sorted by product count; shows product count next to the name.
- Numeric columns open sorted descending on first click.
- Backfill gap of up to one sweep pass accepted.
- Saved presets move into a dropdown; selection bar appears only with a selection.
- URL: new filters join the existing read-once seeding; presets store filters, not the sort.
- Seller filter carries the marketplace (`sellerMarketplace` + `sellerRef`).
