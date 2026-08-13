# CLAUDE.md

Project guidance for AI agents working in this repository.

## What this project is

A marketplace repricing and listing-management system for a Turkish online retailer. It keeps
selling prices on Trendyol and Hepsiburada at the most profitable price that still wins or
defends the buybox, while never selling below a computed floor price.

This is a **greenfield rebuild**. The `docs/` folder is the **authoritative specification** and
is written to be sufficient to build the system from scratch. When specification and code
disagree, the specification wins — fix the code, or change the spec deliberately and say so.

Start at `docs/12-build-plan.md`. Do not start a phase before the previous phase's definition
of done is met.

## ⚠️ `reference/legacy-app/` is quarantined

The retired .NET Framework WinForms application is kept under `reference/` **only** to answer
questions about what the business rules were. It is **not** a design reference:

- It targets a Trendyol API host that no longer exists.
- Its pricing formulas omit product VAT and are wrong (see `docs/02-cost-and-price-model.md` §6.1).
- `docs/09-known-defects-and-risks.md` lists 33 defects in it, seven of which risk money.

**Never copy a pattern, a formula, a constant or a schema from it.** Read the specification
instead. If the specification is ambiguous, say so and ask — do not resolve the ambiguity by
imitating the legacy code.

## Documentation map

Read the document that covers your task. Do not read all of them.

| Working on… | Read |
|-------------|------|
| Anything, first time | `docs/00-system-overview.md` |
| Stock codes, bundles, entities | `docs/01-domain-model.md` |
| Any pricing formula | `docs/02-cost-and-price-model.md` |
| The repricing decision logic | `docs/03-repricing-engines.md` |
| **Any marketplace API call** | **`docs/api-references.md` (mandatory — see below)** |
| **Trendyol competitor scraping** | **`docs/trendyol-merchants-scraping-guide.md` (mandatory — see below)** |
| **Hepsiburada competitor data** | **`docs/api-references.md` §2.11 (mandatory — see below)** |
| Database schema, migrations | `docs/05-data-model.md` |
| UI, grids, columns | `docs/06-user-interface.md` |
| Background jobs, scheduling | `docs/07-processes-and-jobs.md` |
| Configuration, constants | `docs/08-configuration-and-constants.md` |
| Legacy behaviour and its bugs | `docs/09-known-defects-and-risks.md` |
| Architecture, module boundaries | `docs/10-target-architecture.md` |
| Acceptance criteria | `docs/11-rewrite-requirements.md` |

## Rule: marketplace API work

**Before writing or changing any code that calls a marketplace API, open
`docs/api-references.md`, find the endpoint, and follow the official documentation link
recorded there.** Marketplace APIs change without notice and the vendor docs are the only
source of truth for paths, field names, limits and auth.

When you change an integration:

1. Verify the endpoint against its official documentation link.
2. Update the endpoint's entry in `docs/api-references.md` if anything differs.
3. Record the date you verified it in that entry.

Never infer an endpoint's shape from existing code. The legacy implementation in this
repository targets a **retired** Trendyol API host and is not a reference.

## Rule: competitor sources (reporting only)

Competitor collection is **reporting only**. It reads public, undocumented, unsupported
endpoints to build competitor history; nothing in the pricing path may depend on it, and a
failure is recorded and the run continues.

Two sources exist, and they are **not** the same kind of thing:

| Marketplace | What it reads | Read before changing it |
|---|---|---|
| Trendyol | HTML page with embedded `__envoy__SHARED_PROPS` state | `docs/trendyol-merchants-scraping-guide.md` + api-references §1.6 |
| Hepsiburada | public JSON endpoint `/api/v1/product/listings/{sku}` | api-references §2.11 |

**Before writing or changing any code under `packages/adapters/src/*/public-page/`,
`packages/adapters/src/*/public-listings/` or `ScrapeCompetitors`, read the row above that
applies.** Trendyol's payload in particular has traps that look like ordinary field access and
silently produce wrong data — `merchantListing` is an object rather than an array, the buybox
seller is stored apart from the other sellers and is lost if not joined, and price nodes carry
both a numeric `value` and a locale-formatted `text` of which only the first is data.

- Never derive a price, a rank or a seller identity from display text, a CSS class or a
  Turkish label. Ids, enums, booleans and numeric fields only.
- Never let a failure reach a pricing decision. It is recorded and the run continues.
- Never map a value whose **unit** the payload does not state. Both normalisers leave
  competitor dispatch time unknown rather than risk hours-for-days.
- `docs/04-marketplace-integrations.md` §1.5 describes the **retired** scraper's page
  structure. It is obsolete. Read the guide instead.
- **Browser impersonation is Hepsiburada-only and is not a pattern to copy.** That endpoint
  returns 403 to an honest user agent (api-references §2.11 records the measurements), so the
  product owner authorised an exception on 2026-08-13. Trendyol identifies itself honestly and
  must keep doing so. Any new source starts honest until measurement proves otherwise.

## Hard rules

- **Money is `bigint` in minor units (kuruş).** Never a float, never a JS `number`, in any
  layer — database, domain, API, UI. Format only at the display boundary.
- **No credential in source, in committed config, or in a database column.** Secrets come from
  the environment or the secret store. See `docs/08-configuration-and-constants.md`.
- **No business logic in the database.** No pricing stored procedures, no computed views. The
  domain core in `packages/core` is the only home for pricing rules.
- **The domain core is pure.** No I/O, no database, no HTTP, no clock. Everything it needs is
  passed in. This is what makes it testable.
- **Culture-invariant serialisation on the wire.** Turkish locale formatting is a display
  concern only.
- **Never submit a price below the listing's floor price** on a decrease, on any marketplace.
- **Write a price-change audit record only after the marketplace confirms the submission.**

## Repository layout

```
packages/core      pure domain: stock codes, cost, fees, pricing, decision engine
packages/shared    Money, Result, config schemas, logging
packages/db        Drizzle schema, migrations, repositories
packages/adapters  marketplace + product-source adapters behind ports
packages/jobs      job definitions and the DB-backed queue
apps/web           Next.js 16 UI and API routes
apps/worker        long-running job host
docs/              the specification
reference/         quarantined legacy material — never a design reference
```

## Conventions

- TypeScript strict mode; no `any` in `packages/core`.
- Database access only through `packages/db` repositories.
- Every pricing formula and every decision branch has a table-driven unit test.
- Marketplace adapters are tested against recorded response fixtures, never live APIs.
