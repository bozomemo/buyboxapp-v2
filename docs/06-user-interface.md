# 06 — User Interface (target specification)

Next.js 16 (App Router), TypeScript, Tailwind. Implementation home: `apps/web`.

The UI is the operator's entire control surface. Turkish labels are given verbatim where the
operator already knows the app by them; the interface language is Turkish.

---

## 1. Navigation

| Route | Screen | Purpose |
|-------|--------|---------|
| `/` | Dashboard | Health, budget, alerts, job status, what the bot is doing right now |
| `/stock` | Stock items | Physical products, costs, per-marketplace preferences |
| `/listings` | Listings | The main working grid, filterable by marketplace |
| `/listings/[id]` | Listing detail | Everything about one listing, including its decision history |
| `/brands` | Brands | Marka bazlı gezinme — click a brand, see its listings (§12.1) |
| `/competitors` | Competitor history | Time-series reporting over the retained scrape data |
| `/competitors/sellers` | Competitor sellers | The same archive by seller: overlap, pricing behaviour, identity linking |
| `/tracked-products` | Tracked products | Products we do not sell, watched for price/rank by link (§12.2) |
| `/alerts` | Alerts | Open competitor conditions and the rules that raise them |
| `/jobs` | Jobs | Run history, manual triggers, schedules |
| `/events` | Event log | Persisted, filterable operation log |
| `/settings/*` | Settings | Marketplaces, fees, policies, product sources, retention |
| `/setup` | Setup wizard | First run and re-configuration (doc 10 §6) |

---

## 2. Dashboard

The first thing the operator sees. Answers "is it working, and is it safe?"

- **Kill switches** — global and per marketplace, one click, immediate, with the current state
  unmistakable.
- **Update budget** per marketplace: consumed / allowance, remaining, reserve. A progress bar
  that turns amber below the reserve and red at exhaustion.
- **Phase distribution**: how many listings are in `SEEKING` / `CLIMBING` / `REFINING` /
  `OPTIMUM` / `BLOCKED`. A healthy system is overwhelmingly `OPTIMUM`.
- **Active alerts**, newest first, each linking to the affected listing.
- **Marketplace health**: reachable, circuit-breaker state, last successful import, last
  successful buybox observation, scrape failure rate.
- **Recent decisions**: the last N price changes with reason and explanation.

---

## 3. Stock items (`/stock`)

| Column | Field | Editable |
|--------|-------|----------|
| Stok Kodu | `baseStockCode` | no |
| Ürün İsmi | `name` | manual source only |
| Birim Fiyat | `unitCost` | manual source only |
| Stok Miktarı | `unitStock` | manual source only |
| TY Satış Stok | derived | no |
| HB Satış Stok | derived | no |
| TY Çarpan | `priceMultiplier` (TY) | **yes** |
| HB Çarpan | `priceMultiplier` (HB) | **yes** |
| TY Oto BB | `autoRepriceEnabled` (TY) | **yes** |
| HB Oto BB | `autoRepriceEnabled` (HB) | **yes** |
| Kaynak | `sourceCode` | no |

**Row highlighting** (semantics preserved from the legacy app):

| Condition | Effect |
|-----------|--------|
| Total offered across marketplaces > physical stock | stock cell amber — over-listed |
| `unitCost == 0` while anything is on sale | cost cell violet — missing cost |
| Offered stock 0 on a marketplace while physical stock > 0 | that cell highlighted — listing opportunity |
| Cost unknown / unresolvable | row red — excluded from automation |

**Actions:** add a stock item manually · import from the configured source (with a preview of
the first 20 rows before committing) · edit column mapping for the Excel source · open the
bundle editor.

**Bundle editor:** add and remove members with quantity. No five-member cap.

---

## 4. Listings (`/listings`)

The main working surface. One grid, filtered by marketplace, virtualised and server-paged —
the legacy app loaded the whole catalogue into memory.

### 4.1 Columns

| Group | Columns |
|-------|---------|
| Identity | Pazaryeri · Marketplace SKU · Stok Kodu · Ürün Adı |
| Cost | Orj. Birim Fiyat · Birim Fiyat · **Dip Fiyat** · Komisyon · KDV |
| Price | Satış Fiyatı · Müşteri Fiyatı · PSF · Marj % |
| Stock | Satış Stok · Fiziksel Stok |
| Competition | Sıra · Buybox Fiyatı · **Buybox Mağaza** · 2. Fiyat · 3. Fiyat · Fark |
| Engine | **Faz** · Optimum Fiyat · Son Karar · Son Gönderim Durumu |
| Controls | Oto BB · Fiyat Artır · Fiyat Düşür · Min Fiyat · Max Fiyat |
| Status | Satılabilir · Kilitli · Askıda · Kampanyalı |

**Competitor price, rating, name and dispatch time are separate typed columns.** The legacy
system packed them into strings like `"9.2 / SellerName"` and `"149.90 / 129.90"` and then
parsed them back to make decisions (doc 09 §12). This must not recur.

**Buybox Mağaza** (customer feedback 2026-08-25) is the store name of whoever currently holds
the buybox. It is sourced from `competitor_observations` — the scrape-sourced, reporting-only
archive (doc 05 §5) — never from `buybox_observations`, the API-sourced table the pricing path
reads. The two can disagree in staleness (a scrape can lag the last API poll) and the column is
allowed to show `—` when nothing has been scraped yet; it never blocks or delays a pricing
decision.

### 4.2 Row highlighting

| Condition | Effect |
|-----------|--------|
| `price < floorPrice` | red — selling at a loss |
| Locked / suspended | grey, struck through |
| `phase == BLOCKED` | amber — cannot compete profitably |
| `canWinBuybox` | green — floor is below the buybox price and we are not in it |
| `rank == 1` | rank cell green |
| `phase == OPTIMUM` | subtle, no emphasis — this is the healthy state |
| Cost unknown | red outline, automation disabled |

### 4.3 Editable cells

| Column | Effect |
|--------|--------|
| Satış Fiyatı | **Confirmation dialog**, then a manual submission through the normal outbox — pending / confirmed / failed shown inline |
| Satış Stok | Same |
| PSF | Same. Decimals preserved (the legacy truncated to integer, doc 09 §15) |
| Min Fiyat / Max Fiyat | Local; enforced by the engine on the next decision |
| Oto BB / Fiyat Artır / Fiyat Düşür | Local switches |

A manual price edit **pauses automation for that listing** for a configurable period so the bot
does not immediately overwrite the operator, and says so in the UI.

### 4.4 Filters

Built structurally, never by string concatenation (doc 09 §20). Server-side.

- Text: marketplace SKU, stock code, product name, brand, category. Brand is filterable today via
  `brandId` (cross-navigation from `/brands`, §12.1) — a free-text brand/category search box on
  this screen itself is not yet built.
- Numeric with operator: commission, VAT, offered stock, physical stock, margin %
- Multi-select: marketplace, phase, last decision reason
- Tri-state booleans (true / false / any): in buybox · can win buybox · selling at a loss ·
  locked · blacklisted · at list price · campaign active · automation enabled · observation
  enabled (independent of automation — doc 07 §2.2)
- Saved filter presets

### 4.5 Cross-navigation

Selecting a stock item filters the listing grid to that base stock code — the legacy
double-click/Enter behaviour, preserved.

### 4.6 Bulk actions

Applied to the current filtered selection, with a confirmation showing the affected count:
enable/disable automation · enable/disable observation (independent of automation — doc 07
§2.2) · set min/max price · set price multiplier · force re-optimisation (reset phase to
`SEEKING`) · exclude from automation.

---

## 5. Listing detail (`/listings/[id]`)

Four panels.

**Now** — identity, cost breakdown (unit cost → cargo → commission → VAT → floor, shown as a
waterfall so the operator can see exactly where the floor comes from), current price, margin,
stock, status flags, campaign window, product image, link to the marketplace page.

**Competition** — current ranked offers with name, price, customer price, rating, dispatch
time, stock where available; plus a price chart over time drawn from
`competitor_observations` (§6).

**Engine** — current phase, `lastGoodPrice`, `lastBadPrice`, `optimumPrice`, the invalidation
context snapshot, and **why the last decision was what it was**, in words. Buttons: force
re-optimisation, pause automation, set bounds.

**History** — every `price_submission` for this listing: decided at, old → new price, reason,
explanation, state, failure code and message if any, and the decision-time snapshot (cost,
floor, buybox price, rank, commission, VAT). This is what makes a price explainable months
later.

---

## 6. Competitor history (`/competitors`)

The reporting surface over the indefinitely-retained scrape data — the reason for storing it.

- **Price timeline** per listing: our price, buybox price, and each competitor's price over
  time, with our price-change events marked.
- **Seller presence**: which sellers appeared on a product and when; entries and exits.
- **Buybox share**: percentage of observed time each seller held the buybox, over a period.
- **Seller profile**: a given competitor across all our products — how often they appear, how
  aggressively they price, when they are active.
- **Observation coverage**: `scrape_runs` density, so the operator can see where data is thin.

Filters: date range, listing, stock code, marketplace, seller. Export to CSV/Excel.

**Buybox share is time-weighted when a single listing is selected**: each observation counts for
the interval until the next one, and stretches of no observation are excluded from the
denominator rather than attributed to the last-seen winner. Counting occurrences instead
over-weights busy periods — a product rescanned five times in an hour because prices were moving
would outweigh a quiet day that represents the same hour. Across many listings the figure stays
an occurrence count and says so on screen.

Every figure carries a **coverage badge**: attempts, successes, failure rate, average interval
and the last *successful* scrape. This is not decoration. The live archive ran at a 52% scrape
failure rate before Playwright landed, with one hour at 128 failures and zero successes; the
seller counts from that window are not wrong so much as describing far less than they appear to.
Freshness is measured from successful looks only — a job failing every hour is not fresh data —
and a window with no successful scrape at all says so loudly rather than rendering an empty
table that reads as "no competitors".

First/last-seen are **observation** dates, shown with `≥`. "Seen from 12 August" means "absent at
the 11 August 21:00 scrape, present at the 12 August 09:14 one", not "started selling then".

Language throughout is **"listed at"**, never "sold at". We observe offers, not sales.

### 6.1 Sellers (`/competitors/sellers`)

The same archive along its other axis. §6 above answers "who is on this product"; this answers
"which of our products is this seller on, since when, and how do they price against us".

- **Seller list**: overlap (how many of our listings), offers recorded, buybox count and rate,
  average rank, price range, first/last seen. Ordered by overlap descending — "who do we compete
  with most" is not a separate report, it is this list's default order.
- **Seller detail** (`/competitors/sellers/[marketplace]/[ref]`): every product of ours that
  seller competed on, our price beside their range, plus the identity controls below.
- **Cross-marketplace overlap**: products of ours listed on more than one marketplace with the
  same competitor on more than one of them. CSV export.

Two identities have to line up for that last report, and **only one is automatic**: the product
across marketplaces is our own `base_stock_code`, but the seller across marketplaces is an
operator-defined group (doc 05 §5). An ungrouped seller therefore never appears in it, however
many marketplaces it trades on. Sellers whose *names* coincide across marketplaces are offered
as suggestions to review and are never counted as matches.

Offers the marketplace did not attach a merchant id to belong to no seller here. They are
reported as a count beside the list rather than omitted, so the list is not read as exhaustive.

**Our own store is not a competitor.** We are one of the offers on our own listings, and the
archive records that on purpose — a rank means nothing without the offers it is a rank among.
But every seller-*centric* report has to take us back out again, or we top it on 100% of our own
listings by construction, which is arithmetic rather than information. Our own figures are shown
as a separate line beside the list ("on N products, held the buybox M times"), because removing
us from "who are we up against" is right and losing "how are we doing" is not.

Identity comes from `marketplaces.merchant_ref` — the same field the repricer's own-offer filter
uses (doc 03 §6.5) — and never from the store's display name. That makes a wrong or missing
merchant ref invisible: the exclusion silently removes nothing and the screen looks merely
wrong. So the screen checks its own premise. We necessarily appear on our own listings, so if
the configured ref never appears in that marketplace's offers, the value is not the id the
marketplace publishes, and the screen says so and links to the setting instead of quietly
presenting us as our own biggest rival. A marketplace with no successful scrapes in the window
is reported as unobserved, not misconfigured.

The listing-centric **Buybox Payı** report (§6) still includes us, and should: on a single
listing "who holds the buybox, and for how long" is a question our own share is part of the
answer to.

Every figure on these screens is aggregated in SQL rather than fetched and totalled in the API
route. A seller-centric question spans every listing the seller appears on and has no natural
bound: at the 2,000-listing target one seller's 30-day profile is ~29,000 offer rows against a
20,000-row fetch cap, so counting in the route would answer confidently from part of the window.

### 6.2 Alerts (`/alerts`)

Competitor alerts are **reporting**. A rule never triggers a price change, and a failure in the
alert path never reaches a pricing decision (doc 07 §1.1's isolation, unchanged).

An alert is a **state**, not a log line. "Seller X appeared" is an event; "seller X is still
below your floor" is a condition with a beginning, a duration and an end, and the second is what
an operator acts on. So the screen shows open conditions, each with when it started, when it was
last confirmed, and the offers that prove it.

**Rule shape** — one sentence with four blanks, so a new alert kind is an enum value rather than
a migration:

| Blank | Values |
|---|---|
| Scope | one listing / one stock code / one marketplace / everything |
| Subject | one seller / a seller group / anyone |
| Condition | is present / is priced below |
| Threshold | a fixed amount / our price / our floor / a % below ours |

Thresholds are `bigint` kuruş; a fixed threshold is money like any other. Fixed thresholds are
supported because some products have a floor the market itself enforces and someone breaking it
is the signal — but they go stale and nobody revisits them, so a fixed rule is displayed with a
standing reminder that the market may have moved away from it.

**The rule editor refuses rules that cannot fire.** An alert rule does not fail loudly; it fails
*silently*. A rule naming a mistyped stock code, an archived listing or a seller never seen
saves cleanly, lists cleanly and simply never matches, and the operator then reads an empty
alerts screen as "nothing is wrong". Every reference is therefore resolved against the database
before the rule is stored, and one that does not resolve is rejected with the reason. For the
same reason the rules list names the *target* — the product, the marketplace, the seller — and
shows `(bulunamadı)` where a reference has since gone away.

Targets are picked, not typed: listings by product search, sellers and groups from what the
scrapes have actually recorded. The one free-text target is the stock code, which is checked
against `stock_items` on save.

A **seller** subject is matched by marketplace seller ref alone, and the same digits can be two
unrelated companies on two marketplaces. Where a ref is recorded on more than one marketplace
the editor requires the scope to bound it to one (or to a single listing, which is on one).
Asserting that two refs *are* one company is what a seller group is for, and that stays a
deliberate operator act (§6.1).

**Money is typed in lira and echoed back before saving.** The input takes Turkish notation with
a comma for kuruş; a dot is only accepted as a thousands group, so `400.50` is rejected rather
than read as ₺400.500. The parsed amount is shown under the field as the operator types, because
a threshold wrong by 1000× saves without complaint and then never fires.

**One breach, one row.** A rule about *anyone* keys per listing and carries its offenders as
children, each with its own joined/left timestamps. A market-wide collapse is one dashboard row
that opens to show six sellers, not six rows to reassemble. A seller joining an already-open
breach updates that alert rather than opening another — but the join is timestamped, so it can
drive a notification later without becoming a separate row.

**Quiet period.** After an alert resolves, the same target stays silent for a rule-configured
interval. Without it a competitor oscillating around the threshold reopens an alert every cycle
until the operator stops reading the screen.

**Evidence.** Each alert stores the offers, prices, ranks and threshold as they stood when it
fired, including *which price field* the comparison used (`finalPrice` where published, `price`
otherwise). It is held on the alert rather than looked up later because
`competitor_observations` is pruned at 90 days and the offers behind an old alert would
otherwise simply vanish.

**Staleness is the loudest thing on the page.** Zero open alerts beside a scraper that has not
succeeded in a day is not "all clear", it is "we have not looked", and the two are
indistinguishable unless the screen says so. The per-marketplace freshness banner is measured
from successful scrapes only, and the dashboard tile never shows the open count without it.

An alert is never opened or resolved by a failed scrape: a page we could not read tells us
nothing about the condition, and resolving there would report "all clear" on the strength of a
network error.

---

## 7. Jobs (`/jobs`)

Run history with state, duration, item counts and errors. Per job: schedule (operator-editable,
§7.3), status, last run, next run, enable/disable, run-now. Queue depth and currently-claimed
jobs. Circuit-breaker state per marketplace with a manual reset.

### 7.1 Live run state

The worker and the web app are separate processes (doc 10 §2), so **a run is only observable
through the rows the worker writes.** The screen polls: fast (~1.5s) while anything is queued,
running or expanded, slow (~15s) otherwise, and not at all while the tab is hidden.

- **Run-now acknowledges immediately.** Pressing *Çalıştır* enqueues a `job_queue` row; the
  worker's scheduler needs up to one tick (doc 07 §8) to claim it. The button reports
  *Kuyruğa alındı* for that gap rather than snapping back, and gives up after ~20s — a click
  the worker never acknowledges means the worker is down, and the screen must say so.
- **Run-now is disabled while the job is queued or running**, derived from `job_queue` and
  `job_runs`, not from local UI state. So it survives a page reload and covers a run this
  browser did not start. A second concurrent `ScrapeCompetitors` in particular is exactly the
  aggressive pattern api-references §1.6 warns about.
- **Durum** column: *Çalışıyor* (with `items_done`/`items_total`), *Kuyrukta*, or *Boşta*.

### 7.2 Run detail (*Detaylar*)

Expands in place under the job's row, showing that run's progress and the events it logged.
Shows the live run when there is one, otherwise the last finished one — "what did the last run
actually do?" is the same question.

- Progress bar from `job_runs.items_done`/`items_total`; indeterminate until the handler
  reports a total, because a job that has not yet decided how much work it has is not at 0%.
- The item in flight, from `job_runs.current_item` — for `ScrapeCompetitors`, the stock code
  and product name of the page being fetched, reported **before** the fetch, since the wait is
  what the operator is watching.
- `items_ok`/`items_failed` only once the run has settled: `finish` writes them at the end, so
  showing them mid-run would read as "everything failed".
- A stall warning when a `running` row's `progress_at` has gone quiet for ~45s. A
  rate-limited scrape is *meant* to be slow; a silent one usually means the worker died.
- The run's `app_events`, at `debug` and above, newest last. doc 07 §7's "per-failure silence"
  governs *alerting*, not the diagnosis this panel exists for.

Progress is **reporting only**: a handler that never reports one is fully supported (its panel
shows counters without a bar), a failed progress write never fails the run, and no decision
anywhere may branch on it.

**Tarama Hızı** (doc 08 §12): per-marketplace requests/minute and burst for the reporting-only
competitor scrapers, editable and audited like every other setting. Shows the effective value
(a stored override, or the compiled default when none is set) and whether it is currently
overridden. Takes effect on the worker's next restart — the UI says so, rather than implying an
immediate effect it cannot deliver.

### 7.3 Cadence editing (doc 07 §8.1, R-JOB-2)

The catalogue table's *Sıklık* column is a numeric field (seconds), one per cadence-driven job
(every job in doc 07 §1 except `ImportBundles`, which has no cadence at all and shows "Yalnızca
manuel" instead). Next to it: the currently effective value in human units (`formatCadence`,
e.g. "30 dakikada bir"), a *Kaydet* button, and a *Varsayılana dön* button that only appears once
an override is stored — clearing it is a distinct action from typing the default value back in,
since only the former lets the operator later tell "no override" from "override that happens to
match default". A note above the table repeats the same restart-to-apply honesty §7.2 already
gives the scrape rate limit: a saved cadence takes effect on the worker's next restart, not live.

*Sonraki Çalışma* is computed from the cadence the **running worker** booted with, never from the
stored setting. Saving an override used to move that column immediately while the worker kept
firing on its old interval — the screen predicting runs at times nothing would run at, one column
away from the note saying the change needed a restart.

Where the two disagree the row carries a persistent warning — *"Kaydedildi, henüz geçerli değil —
worker <x> çalışıyor. Yeniden başlatın."* Persistent is the point: the transient "Kaydedildi"
confirmation vanishes on the next reload, so an operator who saved yesterday had nothing left
telling them the value was not in effect. The state is derived server-side (`pendingRestart` on
`GET /api/jobs`) from the same comparison, so it cannot drift from the badge.

**Worker'ı Yeniden Başlat** sits above the table, next to that note, and carries a count of the
pending changes when there are any (`3 bekleyen`). It restarts the worker in place — not the
`BuyBoxApp` service — so this page keeps its connection and shows the outcome; see doc 07 §8.1
for why that distinction is what makes the button possible at all. It exists because the
documented way to apply a cadence was `Restart-Service BuyBoxApp` from an elevated PowerShell
prompt, which is not an action an operator will take to change how often a job runs. When jobs
are running the button says so — they are drained, not killed, so the click takes as long as the
longest in-flight handler. Where no worker runs in this process (a standalone `apps/worker`
deployment) the route answers 409 saying which, rather than reporting a restart of nothing.

---

## 8. Events (`/events`)

Persisted, filterable replacement for the legacy transient text box. Filter by level,
marketplace, listing, job run, date range, code. Each row links to its listing or job run.

---

## 9. Settings (`/settings/*`)

| Page | Contents |
|------|----------|
| Marketplaces | Enable/disable, merchant ref, credentials (write-only, with a Test button), capabilities |
| Fees | Per marketplace, effective-dated. Commission VAT rate and treatment, cargo bands, expenditure bands. **Live floor-price preview** for a sample cost and VAT rate |
| Policy | Per marketplace: steps, tolerance, seek strategy, sole-seller margin, stock mode, low-stock guard, settle duration, poll interval, concurrency, daily budget and reserve |
| Product sources | Choose and configure; column mapping for Excel; Test; ERP options shown disabled as "yakında" |
| Retention | Per-table windows (doc 05 §10) |
| Database | Engine, connection, schema version, migration status |

Every change is audited and shows who changed it, when, and from what.

Fee and policy edits offer **"preview impact"**: run the engine in shadow over the current
catalogue and report how many listings would change price and by how much, before saving.

---

## 10. Cross-cutting requirements

| ID | Requirement |
|----|-------------|
| R-UI-1 | Money is `bigint` kuruş internally; formatted in Turkish locale only at display |
| R-UI-2 | Competitor attributes are separate typed fields, never composite strings |
| R-UI-3 | Marketplace-pushing edits confirm, show pending/succeeded/failed, and never truncate decimals |
| R-UI-4 | Filters are built structurally and executed server-side |
| R-UI-5 | Grids are server-paged and virtualised |
| R-UI-6 | The operation log is persisted and filterable |
| R-UI-7 | Long operations report coherent progress and are cancellable |
| R-UI-8 | Every listing's current price is explainable from the UI without reading logs |
| R-UI-9 | Kill switches are reachable within one click from any screen |
| R-UI-10 | The UI works against all three database engines with no behavioural difference |
| R-UI-11 | Interface language Turkish; number and date formatting Turkish locale |
| R-UI-12 | Every table screen's columns can be shown/hidden, reordered and resized, remembered per browser via `localStorage`; server-sortable columns are sortable from the header |
| R-UI-13 | Every table screen offers a CSV ("Excel'e Aktar") export of what the grid currently shows, honouring the active filters |
| R-UI-14 | A product is named `Marka - Ürün Adı` wherever it is shown, on screen and in exports |

Column customisation (R-UI-12) lives in `useColumnPrefs`/`ColumnMenu`/`ResizableTh`
(`components/table.tsx`) and is wired up on `/listings` as the reference implementation
(customer feedback 2026-08-25). CSV export (R-UI-13) is `lib/csv.ts`'s `downloadCsv`, wired up
so far on `/stock`, `/alerts`, `/competitors`, `/competitors/sellers`, `/events` and
`/watched-brands` (client-side, from data already loaded in the browser), and **server-side**
on `/listings` and `/tracked-products` (capped at 5,000 rows — see the comment on
`CSV_EXPORT_LIMIT` in either route for why the per-row enrichment is skipped in the export).

The distinction matters: a client-side export can only offer what is on screen, so it is right
only for a screen whose endpoint already returns the whole bounded result. `/listings` and
`/tracked-products` are server-paged, so their exports run the **same filters** against the
database and return the whole filtered set — the grid's 50 rows and the export's 5,000 come
from one `filterParams()` in the client, precisely so the two cannot disagree.

Column customisation and export are both wired up on `/listings`, `/tracked-products`,
`/competitors/sellers` and the seller-detail sub-page
`/competitors/sellers/[marketplace]/[ref]`. Not yet rolled out: `/jobs` (run history) — copy the
pattern from one of the screens above rather than inventing a new column-prefs or export shape.

**Saved filter presets** (§4.4) are `useFilterPresets` in the same module, added 2026-08-28 and
first used on `/tracked-products`. Same storage contract as column preferences and for the same
reason: a filter set is a working habit, not shared configuration — two operators on one install
want different shortlists and neither wants the other's. Should presets ever need to be shared
between people, that is a different feature with a different home (a settings table), not a
widening of this one.

Product naming (R-UI-14) is `lib/product-name.ts`'s `withBrand`, applied **server-side in the API
routes**, not per screen: the brand lives on `listings.brand_id` (§12.1) while the title lives on
`listings.product_name`, and composing once at the route means the grids, the detail screens and
the CSV exports cannot drift apart. See §12.3.

---

## 11. Dark mode (built)

A Light / Dark / System theme toggle is planned. On 2026-08-18 four dark-mode directions were
mocked up against the real Dashboard layout (sidebar, KPI cards, the price-monitoring grid) and
reviewed with the product owner in a Claude Design canvas. The chosen direction was
**Option 2 — "Yüksek Kontrastlı Veri Paneli"** (trading-terminal style): near-black surfaces,
strong contrast, vivid signal colours pulled forward for status, tabular-figure numerics. When
this is built, implement it — not one of the other three explored directions — and validate
contrast (WCAG AA) before shipping.

Token values captured from the chosen mockup, to seed `globals.css`'s dark palette:

| Token | Value | Notes |
|---|---|---|
| `--color-bg` (dark) | `#05070a` | page background |
| `--color-surface` (dark) | `#0a0e15` | cards, sidebar, table |
| surface-2 (dark) | `#0d1220` | sticky table header, sidebar-adjacent panels |
| `--color-border` (dark) | `#1c2430` | |
| `--color-text` (dark) | `#f4f6f9` | |
| `--color-muted` (dark) | `#7c8798` | |
| `--color-accent` (dark) | `#22d3ee` | replaces `#2563eb` in dark mode; accent-on-text `#04141a` |
| `--color-danger` (dark) | `#ff3b47` | tint bg `rgba(255,59,71,0.16)` |
| `--color-warning` (dark) | `#ffb020` | tint bg `rgba(255,176,32,0.14)` |
| `--color-success` (dark) | `#16e37e` | tint bg `rgba(22,227,126,0.14)` |

Numeric table columns (prices) use a monospace/tabular-nums treatment
(`ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace`) rather than the
light theme's default sans stack — this is specific to the chosen direction and should carry
over to the real implementation.

Both things this section once listed as unscoped are now settled. The toggle is a `data-theme`
attribute plus a stored preference, stamped on `<html>` before first paint by the inline script
in `theme-init-script.ts`, with the `prefers-color-scheme` media query covering "Sistem"; the
palette lives in `globals.css` and is applied twice, once per mechanism. And the sweep of the
`apps/web` screens for hardcoded (non-token) colours was carried out on 2026-08-26 — see §11.1.

**One token is still unimplemented:** the table above lists a *surface-2* (`#0d1220`) for the
sticky table header and sidebar-adjacent panels. `globals.css` has no such token, and
`.table-sticky-head th` paints `--color-bg` instead. That is correct today because the grids sit
directly on the page background rather than inside a surface card, so a header painted
`--color-surface` would be the odd one out; add surface-2 when a grid is first placed inside a
card, not before.

### 11.1 Colour sweep and contrast audit (2026-08-26)

Every `.tsx` under `apps/web/src` was swept for colour that does not come from a token — Tailwind
palette utilities (`bg-white`, `text-gray-500`, …), hex and `rgb()`/`hsl()` literals, and inline
`style` colour props. **There are none**: the only colour any screen names is a
`…-(--color-…)` token, and the two inline sparklines pass tokens through `stroke`. Nothing
needed changing for the sweep itself.

The token pairs were then measured for WCAG AA contrast (4.5:1 for body text) in both themes —
each status hue on `--color-bg`, on `--color-surface`, on its own `-bg` tint and on `--color-hover`,
each `-ink` on its solid fill, and `--color-muted` on every surface it lands on:

- **The dark palette passes**, mostly comfortably (status hues 5.5–11:1).
- **The light palette's warning and success failed outright** — `#d97706` and `#16a34a` measured
  3.0–3.3:1 everywhere, including white `-ink` on the solid fill, because both are read as text
  far more often than they are used as a fill. Both moved one step darker, to the 700 weight
  (`#b45309`, `#15803d`), and `--color-danger` went with them (`#dc2626` → `#b91c1c`, which was
  the one that dipped to 4.41:1 on its own tint) so the three behave as one family. Every light
  pair now clears 4.5:1.
- **Left alone, deliberately:** `--color-muted` reaches 4.34:1 in its worst composite (light
  mode, on a hover row or a danger tint) and 4.44:1 in dark (on the success tint). Darkening it
  would touch the ~230 places muted text is used and flatten the hierarchy against
  `--color-text`, to close a gap of under 0.2. Revisit only as part of a deliberate pass on
  secondary text.

When adding a status colour or changing one of these, hold the rule the light palette's comment
in `globals.css` states: at or above 4.5:1 on `--color-bg`, on `--color-surface` and on the hue's
own `-bg` tint, with `-ink` clearing 4.5:1 on the solid fill.

**Native form controls (customer feedback 2026-08-25):** `<select>`'s closed box picked up the
token colours because we style it directly, but its open dropdown list is rendered by the
browser/OS and was still following the light UA default even under the dark palette — the
missing piece was the `color-scheme` CSS property, which nothing in `:root` declared. Fixed by
setting `color-scheme: light` on the default `:root` and `color-scheme: dark` in both places the
dark palette is applied (the `prefers-color-scheme` media query and `[data-theme='dark']`), so
native chrome (`<select>` popups, scrollbars, default control borders) tracks the same theme as
everything else on the page. Any other native, browser-rendered control found off-palette later
belongs to this same gap, not a new one.

**Follow-up (customer feedback 2026-08-26):** `color-scheme` was necessary and not sufficient.
The dropdown list came back a second time — dark box, but options in dim, near-illegible text —
because Tailwind's preflight resets `select` to `background-color: transparent`, and the popup
takes its colours from the `<select>`'s own computed background and colour. A control with no
background of its own leaves the browser to pick, and it picked the platform default. Fixed in
`globals.css` by painting `select`, `option` and `optgroup` with `--color-surface`/`--color-text`
directly — once, globally, since every filter on every screen is a bare `<select>` carrying only
border and spacing classes, and repeated on `option`/`optgroup` because Windows needs the rows
painted explicitly rather than inheriting from the control. The lesson generalises: for a
browser-rendered control, `color-scheme` sets the *theme* but only an explicit
background/colour on the element sets the *palette*.

---

## 12. Customer feedback backlog (2026-08-25)

Both items below were proposals as of the first pass through this backlog; the product owner
picked a direction for each (2026-08-25, recorded via the options below) and both are now
**built**. Kept here as the design record — read this before touching either area again.

### 12.1 Brand/category browsing — built

*"Pazaryerlerindeki marka ve kategori bilgileri gelmeli. Marka/kategori üzerine basınca o
markaya ait ürünler görünmeli."*

Decided: **normalised `brands`/`categories` reference tables** (doc 05 §4), not a denormalised
column on `listings`, and **a dedicated `/brands` screen** (§1 above) rather than a filter-only
approach — both picked as the recommended option when reviewed.

Sourced from Trendyol's product filter response (api-references.md §1.4 — `brand{id,name}`,
`category{id,name}`), the same call `ImportListings` already makes; no new marketplace call.
Hepsiburada's Listing service has neither field (api-references.md §2.4), so `brandId`/
`categoryId` stay `null` there — not faked, not backfilled from anywhere else.

`/brands` lists every brand with its (non-archived) listing count, descending; clicking one
navigates to `/listings?brandId=…`, which the Listings screen seeds into its own **brand
dropdown** in the filter bar rather than leaving as hidden query-string state. (The first cut
showed it as a dismissible chip instead; that was replaced on 2026-08-26 because an operator
already on the Listings screen had no way to narrow by brand without leaving it and coming back.
Link and dropdown share one piece of state, which is what stops the visible control and the
filtered grid from disagreeing.) `/categories` was not built as a separate screen
in this pass — `categoryId` is captured and filterable via `listingsRepo.queryListings`, but has
no browse UI yet. Copy the `/brands` pattern if that screen is wanted later.

### 12.2 Competitor tracking for products we don't sell — built (v1: add-by-link)

*"Satılmayan / ürün kartına girilmemiş ürünlerde de rakip takibi yapılabilmeli... sadece ürün
linki ile ekleme yapılabilmeli."*

Decided: **a new `tracked_products` table** (recommended option), refined during implementation
into **its own parallel `tracked_product_observations` table** rather than the originally
sketched "nullable `listings.competitor_observations.listing_id` + parallel
`tracked_product_id`" — see doc 05 §5's `tracked_products` entry for why: it keeps
`competitor_observations` and every query built against it (`observationsAsOf`, the §6/§6.1
reports) completely untouched, and makes the pricing-path isolation *structural* rather than a
guard someone has to remember to write — `Reprice`/`ObserveBuybox` (doc 07 §2.1/§2.2) query
`listings` alone, and a tracked product has no row there at all, in any shape.

Also decided: **v1 ships add-by-link only** — no brand-wide search UI. `parseProductLink`
(`packages/adapters/src/parse-product-link.ts`) turns a pasted Trendyol or Hepsiburada product
URL into a `ProductPageRef` offline (no request); `/tracked-products` is the list + add form.
Scraping runs as the last step of each per-marketplace `ScrapeCompetitors` run
(`pipeline/scrape-tracked-products.ts`), isolated by its own `try`/`catch`, and is subject to
the same "disabled by default" switch as the rest of that job (doc 07 §7) — there is no separate
toggle for tracked products.

**Deferred, not decided against:** brand-wide search (picking a product from a marketplace
brand's full catalogue rather than pasting a link) needs the public brand-page source
(trendyol-merchants-scraping-guide.md), not the authenticated Product Integration API — that API
only sees our own catalogue. Revisit as a follow-up if link-only proves too manual in practice.

**Detail screen `/tracked-products/[id]`** (customer feedback 2026-08-25, follow-up: *"onların da
aynı şekilde `/listings/[id]` tarzı bir ekranı olsun ve bütün satıcılarının fiyatlarını ve
stoklarını görmek istiyorum"*). Every seller was already being recorded — `scrapeTrackedProducts`
writes one `tracked_product_observations` row per offer per look — and the list screen was showing
only the rank-1 row, so this screen surfaces what was already there rather than collecting
anything new.

Four things the listing detail (§5) has that this one deliberately does **not**: the cost
waterfall, the engine panel, the manual-price form and the min/max bounds. We do not sell this
product, so there is no cost, no engine state and nothing to submit — the screen is
reporting-only, in the same sense as §6.

What it shows: a *Şu An* summary (buybox seller and price, cheapest offer, seller count, total
visible stock, last look and its status), a **sellers table** — rank, seller, price, price move
since the previous look, customer price, stock, last seen — and a buybox price history with the
same dependency-free inline sparkline §5 uses. A seller row expands to that seller's own series
across the window.

Two decisions inside it:

- **A seller that leaves the page keeps its row**, greyed and marked *teklifte değil*, ordered
  after the current offers. A competitor withdrawing is information; dropping the row would
  render it as an absence the operator cannot see.
- **Seller identity is `seller_ref`**, with a fallback to the folded display name **only** when
  the payload carried no id — and the expanded row says so. That fallback groups rows within one
  product's own history for display; it is never an identity claim, which is the distinction
  `competitor_seller_groups` (doc 05 §5) exists to protect across marketplaces.

Fed by `trackedProductsRepo.trackedProductObservationsSince`, which reads the whole 30-day window
in one query: a seller that vanishes has no row in the newer looks, so there is no way to notice
its absence except to hold the older ones.

*(Closed:* `tracked_product_observations` had no retention window and no change detection when
this screen was built. It got a 90-day window on 2026-08-26 and the change-detection hash in
Faz 4 on 2026-08-28 — see doc 05 §5. One consequence reaches this screen: the newest observation
is now the last look that *changed*, not the last look, so anything reporting freshness reads
`tracked_products.last_scraped_at` instead.)

**Manual re-scan (2026-08-29)** — *"seçilen ürünleri tekli/çoklu tekrar tarama ekleyelim.
ürünlerden gözüne takılanları tekrar güncel veri gelmesini isteyebilir."*

The grid has a leading tick column, a per-row **Tara** and a **Seçilenleri Tekrar Tara** button.
Both post to `/api/tracked-products/rescan`, which enqueues `RescanTrackedProducts` (doc 07 §7.1)
— one job per marketplace in the selection, because a competitor source is registered per
marketplace and a run has exactly one.

Four decisions worth keeping:

- **It is the same read, not a second one.** The job calls `scrapeTrackedProducts` with an
  explicit id list, so change detection, seller registration, the failure rows and
  `last_scraped_at` behave identically. A rescan must be indistinguishable from a cadence look in
  the archive; an operator's curiosity must not put a differently-shaped row in the history.
- **Capped at 50 products per press**, and a larger selection is **refused rather than
  truncated** — silently reading part of a selection and reporting success is how an operator
  comes to believe a figure was refreshed when it was not. A whole brand is the sweep's job, not
  this button's.
- **A paused product is read when it was explicitly ticked.** `is_active` means "the cadence
  should skip this"; someone who selected that exact row has said something more specific.
- **The grid is not reloaded on success.** The job has been queued, not run — redrawing the same
  figures would read as "nothing happened". The operator is told where the progress is instead.

Why it exists at all: the cadence rotates 300 products an hour (`SCRAPE_MAX_TRACKED_PER_RUN`),
which on the live install is a full pass a little under every sixteen hours. That is the right
cost for a report nobody is watching, and the wrong answer to someone who has just noticed one
row and wants to know whether the number in front of them is still true.

**Arriving pre-filtered.** `/tracked-products` seeds its filter bar from `?watchedBrandId=`,
`?categoryRef=`, `?text=`, `?unratedOnly=` and `?searchTermOnly=`, which is what the brand links
on `/watched-brands` navigate to (§12.4). Seeded **once, as the initial value** — the filter bar
owns the state from then on. Syncing both directions would fight the operator every time they
cleared a filter, and is the same call §12.1's `/listings?brandId=` link made.

### 12.4 Brand-owner audit — built (Faz 1–8, 2026-08-28)

The product is also used by **brand owners**, not only by sellers: the person responsible for
Whiskas in Turkey wants every Whiskas listing on the marketplace, whoever sells it. That is a
different question from "what do my competitors charge for the things I sell", and it drives
three screens.

**`/watched-brands`** — the registry. A *group* is the organisation (Mars); a *brand* is one
brand on one marketplace (Whiskas on Trendyol, Royal Canin on Trendyol). Adding a brand needs
only a search term; the marketplace's brand id is optional, and after the first sweep the screen
*offers* the id most of that brand's products carry (≥60% share) rather than making the operator
look it up. "Şimdi tara" enqueues `SweepBrandCatalogue`; progress shows on `/jobs`, because a
full sweep is a minute for a small brand and five for a large one.

The brand name, its product count and its unrated count are **links** into
`/tracked-products?watchedBrandId=…` (the last adding `&unratedOnly=true`), so the counts this
screen reports can be clicked through to the rows behind them. This screen counts a brand's
products but cannot show them, and the count is exactly the number an operator wants to open —
before this they had to leave for `/tracked-products` and re-pick the brand from a dropdown.

**`/tracked-products`** — now serves both hand-added products and swept ones, server-paged,
filtered and sorted. Filters: text, brand, category, status, minimum rating count, and two
switches that exist for the audit specifically — *sadece aramada çıkanlar* and *değerlendirmesi
olmayanlar*.

The first is the brand-misuse shortlist. A brand is swept by its marketplace brand id *and* by
its search term; a product the search finds while the marketplace attributes it elsewhere is
carrying the brand's name without the brand behind it. Eight of Whiskas' 887 products were
exactly that, in categories including *Halı* and *Ahşap Boya & Vernik*. Such rows also carry a
badge in the Ürün column, so the signal is visible without applying the filter.

The shortlist is only meaningful when both passes are **complete**, and until 2026-08-29 they
were not: Trendyol re-ranked its result pages per request, so a deep sweep lost 18% of a large
brand and a product the brand-id pass happened to miss was written as search-only. Every one of
the 208 rows Royal Canin flagged that way was a paging artefact — the products carried the
brand's own storefront brand id (api-references §1.7). The sweep now pins the ordering, and a
pass ending short of the marketplace's own count records a `BrandSweepIncomplete` event on
`/events` instead of leaving the flags to be read as findings. **A brand swept before that fix
must be re-swept before its shortlist is trusted.**

**Dead-product suggestion** — on `/watched-brands`, per brand, with the scan time it would
actually save: *"887 üründen 574'ünün (%65) hiç değerlendirmesi yok · derin tarama 30 dk → 11
dk"*. The saving is computed, never assumed, because it is wildly brand-specific — 65% for
Whiskas against 5% for Royal Canin. Applying it **deactivates**, never deletes: "the marketplace
has never recorded a rating" is a proxy for "nobody buys this", not proof of it, so the decision
has to be reversible, and the grid's *Sürdür* button reverses it.

Throughout, `rating_count = 0` (genuinely unrated) and `rating_count = null` (we could not read
it) are kept apart. Only the first is ever offered for removal; offering the second would ask
the operator to act on our own parse failure.

#### Seller analysis and price ranges (Faz 4)

A sweep answers *which products exist*. It cannot answer *who sells them at what price* — a
catalogue card names only the buybox holder, and treating that as the competition would
understate every product to one seller. That comes from the per-product deep scrape
(`ScrapeTrackedProducts`), and Faz 4 is what reads it.

**On `/tracked-products`, two families of price column**, which answer different questions and
are labelled so:

| Family | Columns | Source |
|---|---|---|
| The market right now | Satıcı, Medyan, **Makas**, Buybox Fiyat, Buybox Satıcı | the latest look, reduced in `lib/market-stats.ts` |
| The market over the window | Dönem En Düşük, Dönem En Yüksek, Dönem Satıcı | one `GROUP BY` in `brandReportsRepo.trackedProductPeriodStats` |

Makas (max ÷ min − 1 on the latest look) is the visible one of the current family: it is the
figure worth scanning a page for, and ≥30% is highlighted. It is `—`, never `0`, for a
single-seller product — a market of one has no spread, and a zero would file it beside genuinely
tight markets when someone sorts by the column.

The **median** is computed in JS rather than SQL. It has no exact form portable across SQLite,
PostgreSQL and MySQL, and three dialect-specific window-function queries for one number is a
worse risk than computing it where the data already is — which is safe here because one look is
a few dozen offers and the grid asks for one page at a time. The period band genuinely cannot be
computed that way and is aggregated in the database.

Only the **period** family survives an Excel export. The line is cost, not importance: a column
is exportable when it comes from the row itself or from one aggregate query over the whole set,
and not exportable when it needs the latest look *per row* — that is one query per row, fine for
a 50-row page and unbounded across a 5,000-row export.

**`/watched-brands/sellers` — markalarımı kimler satıyor.** The brand-side counterpart of
`/competitors/sellers`, scoped by group (Mars — tümü) or by one brand, over 7/30/90 days. Per
seller: kaç üründe, kaç teklif, kaç buybox, kaç kez en ucuz, piyasa sapması, fiyat aralığı, ilk
ve son görülme.

Three decisions in it:

- **Buybox and cheapest are separate counters.** Rank 1 is who wins the buybox, which is not who
  is cheapest — the marketplace weighs delivery and seller score too. A seller cheapest far more
  often than they hold the buybox is being beaten on something other than price; one holding it
  without being cheapest is winning on something other than price. Collapsing the two into one
  "performance" figure would hide both findings. Ties count for everyone who matched the
  minimum.
- **Piyasa sapması is measured against the seller's own look, including sellers the report
  excludes.** The question is how a seller sits against the market, not against the report's
  subset; a market average computed without the biggest seller in it would rate everyone against
  a market that does not exist. It is a **mean**, not a median, and that is a deliberate
  narrowing of what Faz 4 promised — the reasoning is recorded on `BrandSellerAggregateRow` in
  `brand-reports.ts`. Below −15% on average is highlighted, with the screen saying in as many
  words that this is not a violation, only somewhere to look. Whether a seller is *entitled* to
  be there is Faz 5.
- **Seller identity is shared with the competitor screens.** `ScrapeTrackedProducts` registers
  every identified seller in `competitor_sellers`, so one company is one record whether we met
  them competing on a listing we sell or selling a brand we own — and the seller name links to
  the same `/competitors/sellers/[marketplace]/[ref]` page. That is what will let one seller
  policy apply to both in Faz 5. An offer the marketplace did not identify is counted and
  reported beside the list, never matched by display name.

##### The seller page carries both reports (2026-08-29)

Sharing the identity was right; sharing only *half* the report was not. Until this date
`/competitors/sellers/[marketplace]/[ref]` read one archive — `competitor_observations` ⋈
`listings`, "what does this seller do on the products **we sell**". A brand-audit finding
("Periko Petshop 5 üründe hep buybox") linked a seller there, and on a brand-owner install that
seller very often sells none of our items, so the page came up empty and read as lost data.

It was not lost. The five products were in the other archive the whole time —
`tracked_product_observations` ⋈ `tracked_products`. The page now shows **both halves, each
labelled with what it covers**:

| Half | Reads | Answers |
|---|---|---|
| Sattığımız ürünlerde | `competitor_observations` ⋈ `listings` | ürün, bizim fiyatımız, onun aralığı, teklif, buybox, ort. sıra |
| İzlenen marka ürünlerinde | `tracked_product_observations` ⋈ `tracked_products` (`brandReportsRepo.sellerTrackedProductBreakdown`) | ürün, onun aralığı, **piyasa sapması**, teklif, buybox, en ucuz |

Decisions:

- **No "bizim fiyatımız" column on the brand half, and there never will be.** We may not sell
  the product at all. What takes its place is *piyasa sapması* — measured exactly as
  `/watched-brands/sellers` measures it, against the mean of the seller's own look including
  sellers a report excludes, and highlighted below −15% on the same threshold. One figure, one
  meaning, on every screen that shows it.
- **Both halves expand the seller group**, across marketplaces. Applying the operator's grouping
  to one table and not the other would show the same company as whole in one and split in the
  other.
- **Each empty state says what its own emptiness means**, rather than leaving a bare table. "Bu
  dönemde bu satıcıyla çakıştığımız bir ürün yok" plus, when the other half has rows, the
  sentence that turns a suspected bug into an answer: this firm was seen on watched-brand
  products, just not on ours.
- **The brand half defaults to every watched brand**, with a dropdown to narrow. "What is this
  firm doing across everything we watch" is the question the audit is for; narrowing is the
  operator's to ask for. A **finding link narrows it on arrival** — it carries `?sinceMs=` and
  `?watchedBrandId=`, so the operator lands on the rows the alert named instead of rebuilding
  the filter that produced it. `/watched-brands/sellers` passes its own scope the same way.
- **Capped at 500 rows**, newest-seen first, and the response says when the cut fell so the
  screen can admit it. A seller on the brand side can appear on a whole swept catalogue (4,863
  products for Royal Canin) and this table renders in one go.

#### Seller policy: authorised, blocked, undefined (Faz 5)

**`/watched-brands/policy`.** Faz 4 says who sells the brand; this says who is *supposed* to.

**Three states, and the third is real.** `Yetkili`, `Yasaklı` and **`Tanımsız`** — the last is
the state almost every seller is in, and it means "nobody has looked at this seller yet", not
"unauthorised". It is styled neutral rather than as a warning for exactly that reason: colouring
the common state as a problem trains the operator to ignore the colour that matters. Clearing a
verdict back to *Tanımsız* deletes the rule, because the third state is the absence of a rule.

**Identity is account-level, policy is brand-level.** A rule is about one seller *and one brand*.
The same firm is routinely Whiskas' authorised distributor and unknown for Royal Canin — 21% of
Royal Canin's sellers also sell Whiskas — so a group-wide report cannot show a single verdict
chip, and the column on `/watched-brands/sellers` reads *marka seçin* until the scope narrows to
one brand rather than averaging two different answers into one.

A rule written against the whole **group** is the default for every brand that does not override
it: *"Mars authorises this distributor for everything, except Royal Canin"* is two rows, not one
per brand. When a verdict comes from the group default the row says so, and a brand rule that
overrode one says that too — "why did this come out this way" is the first question an operator
asks when a verdict surprises them.

**Matching is by marketplace seller code or tax number. Never by name.** This is the rule the
whole feature rests on (doc 05 §5). A spreadsheet with only a company-name column is rejected
outright, by name, with the reason; a row missing both identities is rejected with its line
number and the company's name so the operator can find it. The name column *is* read, but only
as a label to show back.

**Excel import**, because that is how a distributor list exists in the world; the alternative is
retyping forty rows into a form, which is how the feature goes unused. Turkish Excel's
semicolon-separated CSV is read as well as comma-separated, and the status words are the ones an
operator types (`yetkili`, `yasaklı`) rather than the enum they map to. A file with no status
column at all is the common case — an export of "our distributors" is a list of sellers — so the
operator picks what the whole file means before importing.

⚠️ **All or nothing.** A parse error writes no rows at all, and every bad line is reported at
once. A half-applied policy list is worse than none: the operator believes the list is in force,
and the rows that failed are exactly the ones nobody looks at again.

A rule can be stored and be affecting nobody — a tax number not yet linked to any storefront, or
a seller who has not appeared in the window. Those are counted as *etkisiz* beside the totals
rather than left to look like they are in force.

Faz 5 also puts the firm behind a storefront on the seller record (`competitor_sellers.tax_number`,
operator-owned, edited from the same endpoint as the group and the note), and pairs the two
findings on `/watched-brands/sellers`: **blocked *and* below the market** gets its own line,
because both halves were already on the row and asking an auditor to cross-reference two columns
by eye across eighty rows is how the pairing gets missed.

#### Audit findings (Faz 6)

**`/watched-brands/findings`.** Faz 4 says who sells the brand, Faz 5 says who is supposed to;
this says **what is worth a person's attention**. Eight signals, ranked.

**A finding is not a violation.** Every row says "here is a thing, here are the numbers behind
it, go look" — never that anyone has done anything wrong. The auditor sends the notice; the
software does not, and the wording never implies otherwise.

**Two bases, and the ranking follows from the difference rather than from a table of importance:**

- **Kesin bilgi (`stated`)** — derived from an operator's own recorded statement. "This seller is
  blocked for this brand and is selling it" is certain: someone wrote the rule, and the seller is
  on the page.
- **Yorum (`measured`)** — derived from observed prices. "22% below the market" is an
  interpretation of a sample: it moves with the window, with who happened to be on the page, and
  with a threshold someone chose.

A stated finding therefore outranks every measured one, however dramatic the measured one's
number — the plan's *"kara liste eşleşmesi fiyat sapmasından önce gelir, çünkü kesin bilgidir,
istatistik değil"*. That ordering is a property of the two bases, not a weight anyone tunes.
Within the measured tier the order is by how much a person can conclude from the finding alone,
which is why *yeni görülen satıcı* sits last: a new seller is usually just a new seller.

**Every finding opens to its raw observation** — and to the whole **look**, not the subject's own
row. "Below the market" is a statement about the other rows; a lone price with nothing beside it
neither confirms the finding nor refutes it. What the panel shows is the observation rows
themselves, in the marketplace's own rank order, with the marketplace's own product link beside
them. Unidentified offers stay in that view even though they are in nobody's aggregate: they were
on the page, and evidence that quietly dropped a competitor would misstate the market the finding
was measured against.

**No threshold is buried.** All nine live in `app_settings` under `brandAudit.thresholds` (doc 08
§12), are edited from a panel on this screen rather than a settings page three clicks away, and
are written through `setAppSetting` so the audit row naming who changed them is part of the same
call. Changing one re-answers the whole archive, not only what has been observed since.

⚠️ **The "not on the list" signal is not produced until a whitelist exists** for that brand — the
case Faz 6's definition of done names. An install that has entered no list has not said everyone
else is unauthorised; it has said nothing, and a screen opening with hundreds of "unauthorised"
sellers on day one would be wrong about every one of them and would teach the operator to ignore
the list. The screen says so in place of the absent signal, so "everyone is authorised" and "no
list has been entered" cannot be confused.

**One brand at a time.** Two of the eight signals are policy signals and a verdict is only
meaningful per brand (§12.4 above), so this screen asks for a brand rather than averaging two
different answers — except where there is nothing to ask, an install watching exactly one brand.

`Tanımsız` is styled neutral here as on the policy screen, and the measured findings all share
one quiet chip: colouring one estimate more alarming than another of the same kind would imply a
certainty neither has.

#### Pazaryeri Eşleşmesi — the same product on two marketplaces (Faz 8)

`/watched-brands/cross-marketplace`. Each row is one product carried on both marketplaces, joined
on its **barcode** — and on nothing else. No fuzzy title comparison, no brand-plus-size
heuristic. The screen says so in its own header, because a reader who assumes otherwise would
read a gap as an absence.

Half the screen is coverage, deliberately. 40 matches over a 564-product brand is a different
fact from 40 matches over 40 products, and a screen that could show the first without the second
would mislead by omission. Each marketplace gets a card: how many of its tracked products have a
known barcode, how many were asked and the page stated none, how many were asked repeatedly and
never answered, and how many have not been asked yet — with a line pointing at the **Barkod
Tamamlama** job for the last group. The "asked and never answered" figure is its own row rather
than part of "not asked yet": a product nobody will ask about again is not one whose turn has not
come.

⚠️ **Hepsiburada's catalogue side has a narrower reach than Trendyol's, and the screen does not
pretend otherwise.** A Hepsiburada search auto-applies a category facet, so the "brand name used
in an unrelated category" signal (§12.4's `unrelatedCategory`) has no equivalent there, and part
of a large brand's catalogue sits past a page ceiling that returns 403 (api-references §2.13).

#### Seller identity (Faz 7)

**A `Kimlik` button on each row of `/watched-brands/sellers`**, opening a panel with the firm
behind that storefront: registered title (`unvan`), tax number, tax office, KEP address, address,
and the barcodes and stock of the listing it was read through. These are the fields a compliance
officer needs to write a notice, and the reason the module has them at all.

**One seller at a time, by a button — never in bulk.** Each resolution is a real page request to
the marketplace, made as that merchant, at six per minute with concurrency of one. The number of
sellers worth identifying is the number a person intends to write to; a "resolve all" would turn
a compliance action into a crawl and is deliberately not offered.

**The request is the opposite of the scraper's, and that is the point.** `ScrapeCompetitors`
strips `merchantId` from every URL because a merchant-scoped page reports that merchant as the
winner on every row regardless of the real order. This adds it, because that is what makes the
page carry the merchant's registration (api-references §1.6a). The same finding, used twice: such
a response is authoritative about *who* and worthless about *where they rank*. Nothing on this
path can leak an ordering — the port has no rank, price or winner field, so the phase's
definition of done is a property of the types rather than a rule to remember.

**A page about a different firm is discarded, never stored.** A seller can leave a product
between the last look and the resolution; the page then comes back describing whoever holds the
buybox instead, parsing perfectly and being about the wrong company. The resolver compares the
merchant id it got against the one it asked for, and the job walks up to four of the seller's
most recent products until one answers about the right firm — storing nothing if none does. A tax
number on the wrong storefront is a record an operator may act on legally.

**A resolved tax number fills an empty field and never corrects a person.** That column is what
Faz 5's authorised-seller list matches on, and an operator may have typed it from a contract. If
the resolution disagrees with what is stored, the panel shows both and says so; nothing
reconciles them automatically, because the software is not in a position to know which is right.

**`Kimliği unut`** deletes the identity row and nothing else — the seller, its group, its note
and its observation history all survive. Guide §29 asks that business and contact metadata be
kept only while it is needed; this is the operator saying it no longer is.

⚠️ Everything here is **reporting**. `Reprice` and `ObserveBuybox` read `listings`; none of these
screens writes there, and turning the sweep off changes nothing about repricing. A blocked seller
is a place for a person to look, never an input to a price.

---

### 12.3 Brand first in every product name — built (R-UI-14)

*"Bütün ürün gösterimlerinde Marka başta olsun."* — `Sığır Etli Kısırlaştırılmış Kedi Maması
1,4 Kg` should read `Whiskas - Sığır Etli Kısırlaştırılmış Kedi Maması 1,4 Kg`.

Composed at display time by `lib/product-name.ts`'s `withBrand`, from `brands.name` joined
through `listings.brand_id` (§12.1). **Nothing is written back to `listings.product_name`** —
that column stays exactly what the marketplace returned, so an import never has to reconcile our
label with theirs and a brand rename shows up everywhere at once.

Composed **server-side in each API route** rather than in each screen: ten screens name a
product and only one shape of name is wanted. Routes covered: `/api/listings` (grid *and* its
CSV export), `/api/listings/[id]`, `/api/alerts` (alert rows and listing-scoped rule labels),
`/api/dashboard`, `/api/competitors`, `/api/competitors/listings`,
`/api/competitors/sellers/[marketplace]/[ref]`, `/api/competitors/overlap` and
`/api/settings/preview-impact`.

The brand lookup is `catalogRepo.brandNamesByListingIds` — keyed by listing id so a route only
needs ids it already has, instead of a brand join being threaded through a dozen
dialect-triplicated report queries. `/api/competitors/overlap` is the one exception and joins
`brands` in SQL, because that report is keyed by stock code and never names a listing.

Two behaviours worth keeping: a title that already opens with its own brand is **normalised**,
not prefixed twice (`Whiskas Sığır Etli Mama` → `Whiskas - Sığır Etli Mama`), and a listing with
no brand — every Hepsiburada row today (§12.1) — shows the bare product name, unchanged. Brand
matching folds case both Turkish-locale *and* invariant: Turkish folding maps `I`→`ı`, so on its
own it fails to recognise the very common all-caps title `WHISKAS …` as already carrying the
brand `Whiskas`. `withBrand`'s doc comment and its table-driven test carry the detail.

**Out of scope:** `/stock` names stock items by the operator's own `stock_items.name`, which has
no brand relationship at all — it is master data we key on, not a marketplace title.
