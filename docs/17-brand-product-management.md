# 17 — Brand product management (target specification)

Status: **specified 2026-09-19.** §1 (modules) **built 2026-09-19** (doc 12 11.1); §2's model,
rules, band derivation and PSF migration **built 2026-09-19** (11.2); §2.4's screens — Stok
(`/brand/products`), the product detail with cards, multipliers, primary and barcode suggestions,
and _Ürünüme bağla_ + the favourite star on Takip Edilen Ürünler — **built 2026-09-20** (11.4).
§3 (the Excel import) **built 2026-09-20** (11.3). §4–§6 not built.
Build tasks: doc 12 Phase 11.

Decided with the product owner in conversation on 2026-09-19. This document is the single place
the decisions are recorded; doc 05 holds the tables, doc 07 the jobs, doc 08 the constants, and
each of those points back here for the *why*.

---

## 0. What changes, in one paragraph

The application becomes **two modules** that an install can enable independently: the existing
**seller** module (our listings, cost model, repricing — docs 02, 03) and a **brand** module for a
brand's product manager, who sells nothing through this app and wants to know who sells the
brand's products, at what price, and whether that price is inside the band the brand set. The
brand module gets a new spine: the manager's own **products** (entered from Excel, with PSF and an
optional min/max band), each linked to one or more **marketplace cards** with a **unit
multiplier**, a brand-side **İlanlar** screen showing those cards plus hand-picked favourites, and
a **price-band alarm** on whoever holds the buybox.

Nothing is deleted. The seller module's code, tables and specification stay exactly as they are,
switched off where the install does not use it.

---

## 1. Modules and the view switch

### 1.1 Two layers, deliberately different

| Layer | Stored in | Controls | Changed from |
|-------|-----------|----------|--------------|
| **Enabled modules** — `seller`, `brand`, at least one | `app_settings` (`modules.seller`, `modules.brand`), audited like any setting | Which **jobs** may run, which **routes** answer, which **setup steps** appear, which **nav groups** exist | Setup wizard purpose step (§1.4); `/settings/modules` |
| **Active view** — `seller`, `brand` or `all` | browser `localStorage` (`buybox.navView`), like the theme | Which of the two nav groups is shown | A header switch (_Satış / Marka / Tümü_), shown **only** when both modules are enabled. `all` is the default, so an install that had both groups keeps seeing both |

The split exists because the two layers carry very different risk. Hiding a menu is cosmetic;
leaving `Reprice` or `SubmitPriceChanges` scheduled behind a hidden menu would let an install
that believes it has no seller side submit prices to a marketplace. So the switch a person can
flick in the header changes **only** what is drawn, and the setting that changes what **runs**
lives in settings, is audited, and asks for confirmation.

A real user/role system (logins, per-user permissions) is **out of scope**. The application has
no authentication today, and a role system would first have to build one. When one install is
shared by several people, that is its own piece of work.

### 1.2 What each module owns

| | Seller module | Brand module | Always |
|--|---------------|--------------|--------|
| **Screens** | Stok (`/stock`), İlanlar (`/listings`), Markalar (`/brands`), Rakip Geçmişi, Rakip Satıcılar, Alarmlar (`/alerts`) | Stok (`/brand/products`), İlanlar (`/brand/listings`), Alarmlar (`/brand/alerts`), İzlenen Markalar, Takip Edilen Ürünler, Marka Satıcıları, Satıcı Politikası, Denetim Bulguları, Pazaryeri Eşleşmesi, Marka Karşılaştırması | Panel, İşler, Olaylar, Ayarlar, Lisans |
| **Jobs** | `ImportStockItems`, `ImportBundles`, `ImportListings`, `ObserveBuybox`, `ScrapeCompetitors`, `Reprice`, `SubmitPriceChanges`, `ConfirmSubmissions`, `ResetBudget` | `SweepBrandCatalogue`, `SweepTrackedProducts`, `SweepListedProducts`, `RescanTrackedProducts`, `ScrapeBrandSellers`, `ResolveProductBarcodes`, `EvaluateBrandFindings` | `PruneHistory`, `DeliverNotifications` |
| **Setup steps** (doc 10 §6) | 2 store identity, 3 marketplace credentials, 4 fees, 5 policy, 6 product source, 7 ERP | none of its own | 1 database, purpose (§1.4), 8 review; a brand-only install also sees 3 as on/off switches |

The labels **Stok** and **İlanlar** exist in both modules on purpose: the product owner's
vocabulary is the same for both people. The **routes and tables are not shared**. The seller's
Stok is `stock_items`; the brand's Stok is `brand_products`. They are different things with
different lifecycles, and one table read two ways would be a permanent source of wrong joins.

### 1.3 Gating rules

- **Navigation** shows the `Satış` group only when the seller module is enabled (and, with both
  enabled, when the seller view is active), the `Marka` group likewise, and `Sistem` always. This
  **reverses** the 2026-09-03 decision recorded in `nav-shell.tsx` ("deliberately not hidden per
  install type"). That decision predates the brand module becoming a product of its own; its
  worry, that a feature appearing only after some other screen is used is a feature nobody finds,
  does not apply to a module somebody chose in setup.
- **Pages** of a disabled module redirect to `/settings/modules?disabled=<module>`, which names
  the module and is where it is switched back on — a redirect to `/` would leave the operator
  wondering where the screen went. **API routes** of a disabled module answer
  `409 module_disabled`, reads included. A half-open state where the page is gone but its API
  still writes would be the worst combination. Both are enforced in the web proxy (`proxy.ts`),
  from one route→module table (`lib/module-routes.ts`) the navigation also reads.
  `/api/competitors/sellers/identity` is deliberately open to both modules: the brand module's
  seller screens resolve firms through it too.
- **Jobs** of a disabled module are **not dispatched**. The flag is read **at dispatch**, on every
  scheduler tick, not once at worker boot like cadence (doc 07 §8.1). Turning the seller module
  off must stop price writes on the next tick, not on the next restart.
- **Turning the seller module off with price submissions in flight.** `Reprice` and
  `SubmitPriceChanges` stop on the next tick, and the **global price-submission switch is
  engaged**. **`ConfirmSubmissions` keeps running until every submitted batch has reached a
  terminal state**, even with the module off: the audit record is written only after the
  marketplace confirms (CLAUDE.md), and a batch abandoned mid-confirmation is a price change with
  no record. The modules screen shows "N fiyat gönderimi pazaryeri onayı bekliyor" until the
  count is zero.
- **Queued (unsubmitted) rows are *not* cancelled** — changed from this spec's first draft while
  building it. A cancelled row would leave its listing's `repricing_state.pending_submission_id`
  pointing at a submission that never resolves. The rows stay queued, exactly as they do behind
  the price switch today; because turning the module off engages that switch, turning it back on
  does **not** quietly submit days-old decisions — the operator releases the switch on the
  dashboard, deliberately, as after any stop.
- **Data is never deleted** by disabling a module. Enabling it again resumes where it stopped.
- **Existing installs** need no migration: an absent `modules.*` row reads as **enabled**
  (`parseEnabledModules`), so an upgrade removes nothing from anybody's screen. Only the literal
  `"false"` disables a module, and both rows `"false"` — which the settings route refuses to
  write — is read as corrupt and answered with both enabled.
- **Public-page sources no longer need seller credentials.** The worker used to build the
  scraping sources only where a marketplace *adapter* existed, i.e. only with seller credentials
  stored. They are now built for every **enabled** marketplace, and brand jobs are ticked for
  enabled marketplaces rather than for adapters. Without this a brand-only install had no
  sources and every brand job failed.

### 1.4 Setup wizard — "Kullanım amacı"

Two checkboxes, at least one required: _Pazaryeri satıcısıyım_ and _Marka ürün yöneticisiyim_.
It is the wizard's **second** step, right after the database — not step 0 as first drawn: the
choice is stored in `app_settings`, and there is no database to store it in until step 1 ran.
The wizard then shows only the steps of the enabled modules (§1.2).

A brand-only install sees four steps: _Veritabanı → Kullanım Amacı → Pazaryerleri → Gözden
Geçir_. It never asks for seller API credentials: every brand-module source is a public page
(api-references §1.6, §1.7, §2.11, §2.13, §2.14). Its marketplaces step is on/off switches only
(`/api/setup/marketplace/enable`), because the `marketplaces` rows are still needed —
`tracked_products.marketplace_code` references them — and must be enabled for the worker to
build their public-page sources.

**Choosing the brand module is the business decision the brand scanning jobs wait for**
(decided 2026-09-19). Finishing setup with it ticked stores `job.<name>.enabled = true` for the
brand jobs that are off in the catalogue — `SweepTrackedProducts`, `SweepBrandCatalogue`,
`ResolveProductBarcodes` (`enableBrandScanJobsAtSetup`) — so a new brand install scans from the
start. All three read public pages; none uses seller credentials. `ScrapeCompetitors` belongs to
the seller module and stays off. A job that already has a stored setting is left alone, so
re-running the wizard never re-enables one an operator switched off, and an upgraded install
that never ran the purpose step keeps its switches exactly as they were.

---

## 2. Brand products and card links

### 2.1 The model

```
brand_products   (the manager's own product; own PK; marketplace-independent)
   name · PSF · min? · max? · barcode?
      │
      ├── brand_product_cards ── tracked_products (Trendyol  -p-123456)   ×1  primary (TY)
      ├── brand_product_cards ── tracked_products (Trendyol  -p-789012)   ×3
      └── brand_product_cards ── tracked_products (Hepsiburada HBCV…)     ×1  primary (HB)
```

- A **brand product** is what the manager sells as a product. It exists independently of any
  marketplace, because one product lives on Trendyol and Hepsiburada at once.
- A **card** is a marketplace product page, which in this system is always a `tracked_products`
  row. Cards come from the Excel import, from brand catalogue sweeps, or from a pasted link.
- A **card link** says "this card sells this product", with a **unit multiplier**: how many units
  of the product one purchase of the card delivers. A card selling a three-pack is ×3.
- **A card belongs to at most one brand product.** Two would count the same seller's stock and the
  same buybox under two products.
- **At most one primary card per (brand product, marketplace).** The primary is the card the
  manager's Excel row named. It is the product's re-import key (§3.3) and is assumed ×1 on
  creation, editable afterwards.
- Every link records **how it was made**: `excel`, `manual`, `barcodeSuggestion` or `migration`.
  An operator's link and a barcode match are different levels of certainty, and once barcodes fill
  in, the difference is the only way to see a disagreement.

### 2.2 Prices are per unit

PSF, min and max are **per unit** of the brand product. A card is compared against them after
scaling by its multiplier, and the comparison is done **by multiplying the threshold, never by
dividing the price**: `price < min × m`, not `price / m < min`. Money is bigint kuruş, and a
kuruş amount divided by three has no exact answer. Multiplying keeps every comparison exact.
The unit price is **displayed** (rounded half-up to the kuruş, at the display boundary only) but
never compared.

Stock aggregates across cards are also per unit: a seller offering 10 of a ×3 card offers 30
units. This is what makes "kimler bu ürünü kaç stokla satıyor" answerable across every card of a
product rather than one card at a time.

### 2.3 Effective band

| Bound | Rule |
|-------|------|
| Lower | `min` if set. **No `min`, no lower-bound alarm.** |
| Upper | `max` if set, **otherwise PSF**. PSF is mandatory, so every brand product always has an upper bound. |

The effective upper bound is **derived in `packages/core`**, never stored. A stored copy would
go stale the first time someone edited PSF, and CLAUDE.md puts the rule in the core anyway.

The comparison is strict: a buybox exactly at the bound is inside the band. No tolerance is
applied. Unlike `referenceBelowPct` (doc 08 §13), which exists because a published list price is
rounded to the lira, min and max are thresholds the manager typed specifically for this purpose.

### 2.4 Linking a card to a product

- **From Takip Edilen Ürünler:** row action _Ürünüme bağla_ → search brand products → **unit
  multiplier, required, no default** → save. The field is deliberately empty: the product owner's
  requirement is that the question is *asked*, and a pre-filled 1 is a question nobody reads.
  Built 2026-09-20: the action opens a panel above the grid, is disabled on a card that is
  already linked (the row's _Stok Ürünü_ column links to the product instead), and the API
  refuses a missing or fractional multiplier rather than defaulting it.
- **From a brand product's detail page:** _Kart ekle_ → search tracked products (all watched
  brands) or paste a link → multiplier → save. A pasted link that is not yet tracked creates the
  `tracked_products` row (as the existing add-by-link does) and links it.
- **Barcode suggestions.** When a brand product has a barcode and an unlinked tracked product has
  the same barcode, the detail page offers it: _Bu kart senin ürünün olabilir_. Accepting still
  asks the multiplier. Suggestions are **never applied automatically**. Hepsiburada cards carry
  barcodes (api-references §2.14); Trendyol cards currently do not, so suggestions are
  Hepsiburada-only until a Trendyol source states one.
- **Name similarity is not a suggestion source.** Names differ by pack size and punctuation, and
  pack size is precisely the thing the multiplier must get right.
- **Unlinking** is a screen action with a confirmation. It resolves the card's open band
  violations with reason `unlinked` (§5.3).
- **Changing the primary** is allowed. The old primary stays linked as an ordinary card.

### 2.5 Where PSF moves from

PSF was introduced on 2026-09-03 as `tracked_products.reference_price` (doc 05, doc 06 §12.4),
per card. It now lives on `brand_products.reference_price`, per unit. Every reader of the old
column is repointed:

- the `belowReferencePrice` audit finding compares a card's offers against **PSF × multiplier**
  of the card's brand product; an unlinked card has no PSF and produces no such finding;
- the rotation weight `hasReferencePrice` becomes **"the card is in İlanlar"** (§4), because that
  is what the weight was a proxy for: "an operator said this product matters". Built as
  `ROTATION_WEIGHTS.listed` (doc 08); `listProductsToScrape` carries each card's `isLinked`;
- the Takip Edilen Ürünler grid's _Tavsiye Fiyat_ / _Tavsiyeye Fark_ columns and its export show
  PSF × multiplier of the linked product, and the coverage figures count linked cards.

**The old reference-price import is gone** (built 2026-09-19, 11.2). Its route
(`/api/tracked-products/reference-prices`) and its block on Takip Edilen Ürünler wrote the old
per-card column, which nothing reads any more; kept alive, it would have reported "N ürüne fiyat
yazıldı" for prices no finding could see. PSF is entered through §3's import from 11.3 on. The
exact amount parser in `lib/reference-price-import.ts` stays for that import to reuse.

**Migration.** For every `tracked_products` row with a `reference_price`, create a brand product
(name = the row's `label`, PSF = the price, source `migration`) with that card as its ×1 primary.
The live install has no such rows today; the migration exists so an install that does is not
silently stripped of its prices. The three old columns are dropped in a **later** migration, once
no reader remains.

Built as plain SQL appended to migration 0022 in each dialect, so it runs inside the migration
that creates the tables and cannot be half-applied. The product and the link **reuse the card's
id** (different tables, so no collision), which makes the result deterministic and the SQL the
same shape on all three engines. *Changed from the first draft:* the migration does not
"report how many products it created" — a SQL migration has nowhere to report to. The figure is
the count of brand products with `source = 'migration'`, which the Stok screen (11.4) can filter
on. `created_at` and `linked_at` take the old `reference_price_updated_at`, falling back to the
card's `added_at`.

---

## 3. Excel import (Stok → _Excel'den yükle_)

### 3.1 The file

Accepted formats: `.xlsx` and `.csv`. A template is downloadable from the same screen.

| Column | Required | Notes |
|--------|----------|-------|
| `Ürün Adı` | ✔ | Display name of the brand product |
| `PSF` | ✔ | Per unit. Turkish (`1.249,90`) and English (`1249.90`) decimals, read by the existing exact parser into bigint kuruş (`reference-price-import.ts`) — never `parseFloat` |
| `Max Fiyat` | | Per unit. Empty = PSF is the upper bound (§2.3) |
| `Min Fiyat` | | Per unit. Empty = no lower-bound alarm |
| `Trendyol Linki` | one of the two | The product's primary Trendyol card |
| `Hepsiburada Linki` | one of the two | The product's primary Hepsiburada card |
| `Barkod` | | Used for suggestions (§2.4), never as a key. **Checked since 2026-09-25:** scientific notation (`8.69E+12` — Excel has already rounded the digits away) is a row error, `barcodeScientific`; a value that is not a valid EAN/GTIN is kept with the warning `barcodeNotGtin`, since it can never match a card |

Header names are folded as the existing importers fold them (case, Turkish characters,
whitespace), so `ürün adi` and `URUN ADI` both work.

### 3.2 Link parsing

A link is reduced to `(marketplace, product ref)`: the Trendyol `contentId` from `-p-{digits}`,
the Hepsiburada SKU from `-p-{SKU}`, with query strings and fragments ignored. **An unrecognised
URL shape is an error on that row, never a guess.** A Trendyol link in the Hepsiburada column
(or the reverse) is an error. The accepted shapes must be checked against real links and recorded
in `api-references.md` (§1.6 / §2.11) before the parser is written.

**Built 2026-09-20** as `parseProductLinkForMarketplace` (`packages/adapters`), with the shapes
measured against the live install's 7,309 tracked rows and recorded in api-references §1.6. Three
things the measurement changed:

- A **relative path** is accepted (`/{marka}/{slug}-p-{id}?boutiqueId=…`). It is what this app's
  own sweep stores for 7,308 of those rows, so it is what an operator copying out of our own
  screens pastes. The column already names the marketplace, so nothing is guessed.
- `boutiqueId` and `merchantId` are **never** identity — they name a boutique and a seller.
- A Hepsiburada `-pm-` link is the **parent product**, not the variant that is sold
  (api-references §2.13). **Since 2026-09-25** it is first looked up among the tracked
  Hepsiburada rows — the catalogue sweep stores exactly this form for every one of them (254 of
  254 measured), so it is what an operator copies out of our own screens. Exactly one tracked
  variant of that family ⇒ the cell is that variant. None or several ⇒ its own error with its own
  message, never a guessed variant. The card picker and "takip listesine ekle" read links the
  same way (`resolveProductLink`), relative paths included — they accepted only absolute links
  before.

A row naming a marketplace this install does not have is refused the same way — as a row, in the
preview, so the rest of the file still imports and the preview never promises something the write
then refuses.

### 3.3 Matching a row to an existing product

The key is the **primary card**: a row whose Trendyol link equals an existing product's
Trendyol primary, or whose Hepsiburada link equals its Hepsiburada primary, updates that product.

| Situation | Outcome |
|-----------|---------|
| Neither link is a primary anywhere | **New** brand product. Each link's card is found in `tracked_products` (a card already discovered by a brand sweep is reused, never duplicated) or created, and linked ×1 as primary |
| One link matches product A's primary, the other is empty or new | **Update** A; a new link becomes A's primary on that marketplace (the previous primary, if any, stays linked as an ordinary card) |
| The two links match **different** products | **Error** — nothing is merged |
| A link is a **non-primary** card of some product | **Error** — "bu kart X ürününe ek kart olarak bağlı" |
| The same link appears on two rows of the file | **Error** on both rows |

### 3.4 What a re-import changes

A row in the file is that product's **complete statement** for the fields it carries:

- `Ürün Adı`, `PSF`, `Max Fiyat`, `Min Fiyat`, `Barkod`: **an empty cell clears the value.** An
  empty `Min Fiyat` removes a previously set min (product owner, 2026-09-19). No hidden old values.
- `Trendyol Linki`, `Hepsiburada Linki`: **an empty cell changes nothing.** A link column is how a
  row is matched, not a field of the product, and unlinking a card is done on the screen where
  its consequences (open violations resolved) are shown. *(This is an implementation decision
  made while writing the spec — see §7.)*
- **Products absent from the file are untouched.** The import never deletes; deletion is a screen
  action.

### 3.5 Validation: preview, then confirm

The import is **two steps**, and no row is written in the first:

1. **Preview.** Counts of new products, updated products, cards that will be created, and a table
   of problems with the file line number, the column and the reason.
2. **Confirm.** _Geçerli N satırı içe aktar?_ The valid rows are written **in one transaction**;
   the invalid rows are not written at all, and are offered as a downloadable file with an added
   `Hata` column, so they can be fixed and re-uploaded on their own.

**Built 2026-09-20.** Preview and confirm run the same code path — parse, read the catalogue,
`planBrandProductImport` — so the counts the operator is shown are produced by the thing that
will do the work, and the confirm re-reads the catalogue rather than trusting a cached plan. The
valid rows are written in one transaction, and the `Hata` file is offered from the preview as well
as after the write. The header must be the file's **first non-empty row**, the same rule the CSV
reader already applied; a file with a title line above the table is refused by a message naming
the line it read.

This deliberately differs from the existing reference-price import, which rejects the whole file
on any error. For a list of thousands of products the product owner wants the good rows in, and
the confirmation step is what keeps that from being a silent partial import: the person applying
it has seen, in numbers, what is left out.

A file that cannot be read as a table at all (wrong format, no recognisable header) is rejected
outright; there are no rows to preview.

| Errors (row rejected) | Warnings (row accepted, flagged) |
|-----------------------|---------------------------------|
| missing name or PSF · unparseable amount · amount ≤ 0 · neither link given · unrecognised link · link in the wrong column · `min` > effective upper bound · any conflict in §3.3 | PSF below `min` or above an explicit `max` · a name equal to another product's name |

### 3.6 After an import

New cards enter `SweepListedProducts`' next pass (§4.2) and are looked at within its cadence.
The import itself makes **no** marketplace request.

---

## 4. İlanlar (brand) and the listings lane

### 4.1 What İlanlar shows

`/brand/listings` shows the cards the manager actually cares about, out of a brand catalogue
where most cards are noise (the product owner's example: a brand with 1,000 cards on Trendyol of
which about 50 really sell). A card is in İlanlar when **either**:

- it is **linked** to a brand product (§2), or
- it is marked **favourite** (`tracked_products.is_favourite`), from Takip Edilen Ürünler.

The two are independent (product owner, 2026-09-19): a favourite need not be the manager's
product, for example a competing brand's card they want in view. A favourite that is not linked
has no PSF, no band and therefore **no alarm**; its band columns show _—_ rather than a status.

Columns: favourite star · brand product (if linked) · marketplace · card · multiplier · buybox
seller · buybox price (`finalPrice`, else `price`, with the source marked) · unit price · PSF ·
min · upper bound (marked _PSF_ when it is the default) · band status (_aralıkta / min altında /
max üstünde / bilinmiyor_) · open violation since · seller count · last look. Grid behaviour
(column chooser, resize, persistence, sort, Excel export) follows doc 15.

**Built 2026-09-20** (build plan 11.4, ahead of 11.6 — see its order note). Everything above
except _açık ihlal süresi_, which needs `band_violations` and lands with 11.6. Two things the
build settled:

- **The band columns are per unit, and the buybox price is the card's.** That is why _birim
  fiyat_ exists between them: it is the card price divided by the multiplier so the eye can read
  it against the PSF beside it. It is **display only** and marked as such on the screen and in
  `unitPriceForDisplay`'s doc comment — a ×6 card one kuruş above six times the PSF rounds to
  exactly the PSF per unit, so a comparison built on it would call an out-of-band price in band.
  Every verdict multiplies the threshold (§2.2), and a table test pins that exact case.
- **The status is computed live from the last look**, by the same `evaluateBand` 11.6 will
  reconcile violations with — not by a second rule that could disagree with the alarm. A card
  whose last look failed, or that nobody has looked at yet, is _bilinmiyor_ rather than in band.

### 4.2 Two sweeps, in parallel

| Job | Reads | Default cadence | Why |
|-----|-------|-----------------|-----|
| `SweepTrackedProducts` (exists, doc 07 §7.4) | every active tracked product | continuous passes | the whole catalogue, for the brand audit |
| `SweepListedProducts` (new) | only the İlanlar cards (§4.1) | a pass every 30 min | freshness where the manager is looking, and where alarms come from |

Each is enabled independently on the Jobs screen, and both may run at the same time. They are the
same implementation with a different candidate set, and they share everything that bounds their
cost:

- **One rate limiter.** Both read through the same source instance and its single shared limiter
  (doc 07 §7.4), so running both **does not raise the request rate** the Trendyol exception was
  measured and authorised at (CLAUDE.md, api-references §1.6). Parallel means the listings lane
  is not stuck behind a five-hour catalogue pass, not that twice as many requests go out.
- **One cursor column.** Both advance `tracked_products.last_scraped_at`. A card read by one lane
  counts as looked-at for the other's open pass, so no card is read twice for the same pass.
- **Separate passes.** `tracked_scrape_passes` gains a `scope` column (`all` | `listed`); pass
  numbering is per (marketplace, scope). The Jobs screen shows both progress bars.
- **Why a 30-minute cadence and not continuous.** A catalogue pass takes hours, so its 60 s
  cadence only governs the gap between passes. A listings pass over ~50 cards takes minutes, and
  a 60 s cadence would re-read the same pages all day.

---

## 5. Price-band alarm

### 5.1 When a card is evaluated

On every **successful** look of a card that is **linked** to a brand product, from the offers of
that look, whether or not the look stored new observation rows (the same rule as doc 12 10C.2).
Both sweeps and `RescanTrackedProducts` evaluate; the logic is a pure function in
`packages/core`, next to the alert rules.

- **Subject: the buybox holder only**, the offer the normaliser returns as rank 1. Other sellers
  below or above the band are reported by the audit findings (doc 06 §12.4), which stay as they
  are (product owner, 2026-09-19: both kept, because "who sells my brand cheaply" and "what price
  is the customer actually shown" are different questions).
- **Price: `finalPrice`, falling back to `price`** when the offer has no `finalPrice`. Which one
  was used is stored on the violation and shown beside it.
- **Two independent checks**, each its own violation kind:
  - `belowMin`: `price < min × multiplier`, only when `min` is set;
  - `aboveMax`: `price > upperBound × multiplier` (§2.3), always.

### 5.2 A violation is a state

Same model as `alerts` and `brand_findings`: a condition with a beginning, a duration and an end.

- **Opened** the first time a look shows the buybox outside the band.
- **Confirmed** by later looks that still show it: `last_seen_at` and the observed price are
  updated, **no new row, no new notification** (_ihlal devam ediyor_).
- **At most one open violation per (card, kind).** If the buybox passes to **another seller who
  is also outside the band**, the open violation is resolved (`buyboxChanged`) and a new one
  opened for the new seller. That is a new fact and is notified.

### 5.3 How it ends

| Event | Outcome |
|-------|---------|
| a successful look shows the buybox inside the band | resolved, `inBand` |
| a successful look shows another seller in the buybox, inside the band | resolved, `buyboxChanged` |
| a successful look finds nobody selling (`noOffers`) | resolved, `noOffers` |
| `min` was cleared and a look runs | the `belowMin` violation resolves, `thresholdRemoved` |
| the card is unlinked | resolved immediately, `unlinked` |
| the brand product is deleted | its violations are deleted with it (the delete dialog says so) |
| **a failed look** | **nothing.** A page we could not read says nothing about the price on it |

Threshold edits (screen or import) take effect at the card's next successful look; they do not
re-judge open violations against an old observation. `threshold_applied` on each violation
records the bound it was measured against, so a violation opened under an old band still reads
correctly.

### 5.4 Where it shows

- **Alarmlar** (`/brand/alerts`): open violations first, grouped by brand product, then recently
  resolved. The same staleness banner as `/alerts` (doc 06 §6.2): zero open violations beside a
  sweep that has not succeeded in hours is "we have not looked", not "all clear".
- **İlanlar**: the band status column and _açık ihlal_ since (§4.1).
- **Panel**: an open-violation count in the brand section, never without the staleness figure.

---

## 6. Notifications

Every violation **opening** (§5.2) is notified. Continuations and resolutions are not: a resolve
notification fires on every threshold edit and teaches people to ignore the channel (the same
reasoning as `EvaluateBrandFindings`, doc 06 §12.4).

### 6.1 Channels

A `NotificationChannel` port in `packages/adapters`, with one adapter per channel:

| Channel | Adapter | Configuration |
|---------|---------|---------------|
| Screen | always on, it is the violation list itself | — |
| Webhook | built (Slack/Teams style, as today) | `ALERTS_WEBHOOK_URL` env |
| E-mail | built, SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` env; recipients in settings |
| SMS | **port and settings built; provider adapter built when a provider is chosen** (§7) | provider credentials in env; phone numbers in settings |

Credentials live in the environment (CLAUDE.md). Recipient addresses and phone numbers are not
credentials and live in `app_settings`, edited from `/settings/notifications`, which also has a
_Test gönder_ button per channel.

### 6.2 Delivery

- A `DeliverNotifications` job (every minute, both modules) drains pending deliveries. A
  **failed send is retried, never lost**, and never fails the evaluation that produced it: the
  violation is stored regardless, exactly as a brand finding is stored when its webhook fails.
- **Batching.** One message per channel per run, listing up to `MAX_VIOLATIONS_PER_MESSAGE` and
  counting the rest. A first sweep over a fresh import can open hundreds at once.
- **SMS is a digest, not a list:** "12 yeni fiyat ihlali — Alarmlar ekranına bakın". An SMS costs
  money per message and is read on a phone.
- **Re-notify quiet period.** A violation that resolves and reopens for the same (card, kind,
  seller) within `BAND_RENOTIFY_QUIET_MS` is recorded as a new violation but **not notified
  again**. A seller oscillating around the bound would otherwise message the manager every half
  hour. The violation history stays honest; only the channel is quiet.
- Moving `EvaluateBrandFindings`' webhook onto the same port is a later cleanup, not part of this
  phase.

---

## 7. Open items

| Item | Blocks | Owner |
|------|--------|-------|
| **SMS provider** (e.g. Netgsm, İleti Merkezi) — choice, account, cost per message | the SMS adapter only; the port, settings and digest are built regardless | product owner |
| **Hepsiburada link shapes** — Trendyol's are measured and recorded (api-references §1.6, 2026-09-20); Hepsiburada's are not, because this install has no Hepsiburada data. The `-p-{SKU}` and `-pm-{productId}` forms are handled from §2.11/§2.13's own examples; a campaign or short link may exist that is refused | nothing — an unrecognised link is a reported row, not a wrong import | product owner: send a few real HB links |
| ~~**`.xlsx` reading library**~~ — **settled 2026-09-20**: `exceljs`, already a dependency for the Excel product source. `readXlsxTable` (`packages/adapters/src/spreadsheet.ts`) returns every cell as text — including a formula's result — so amounts reach the exact parser untouched | — | done |
| **Empty link cell on re-import = no change** (§3.4) — decided while writing the spec, not in conversation | nothing, confirm or change | product owner |
