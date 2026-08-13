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
| `/competitors` | Competitor history | Time-series reporting over the retained scrape data |
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
| Competition | Sıra · Buybox Fiyatı · 2. Fiyat · 3. Fiyat · Fark |
| Engine | **Faz** · Optimum Fiyat · Son Karar · Son Gönderim Durumu |
| Controls | Oto BB · Fiyat Artır · Fiyat Düşür · Min Fiyat · Max Fiyat |
| Status | Satılabilir · Kilitli · Askıda · Kampanyalı |

**Competitor price, rating, name and dispatch time are separate typed columns.** The legacy
system packed them into strings like `"9.2 / SellerName"` and `"149.90 / 129.90"` and then
parsed them back to make decisions (doc 09 §12). This must not recur.

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

- Text: marketplace SKU, stock code, product name, brand, category
- Numeric with operator: commission, VAT, offered stock, physical stock, margin %
- Multi-select: marketplace, phase, last decision reason
- Tri-state booleans (true / false / any): in buybox · can win buybox · selling at a loss ·
  locked · blacklisted · at list price · campaign active · automation enabled
- Saved filter presets

### 4.5 Cross-navigation

Selecting a stock item filters the listing grid to that base stock code — the legacy
double-click/Enter behaviour, preserved.

### 4.6 Bulk actions

Applied to the current filtered selection, with a confirmation showing the affected count:
enable/disable automation · set min/max price · set price multiplier · force re-optimisation
(reset phase to `SEEKING`) · exclude from automation.

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

---

## 7. Jobs (`/jobs`)

Run history with state, duration, item counts and errors. Per job: schedule, last run, next
run, enable/disable, run-now. Queue depth and currently-claimed jobs. Circuit-breaker state
per marketplace with a manual reset.

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
