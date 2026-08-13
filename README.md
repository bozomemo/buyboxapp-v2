# BuyBoxApp

A marketplace repricing and listing-management system for a Turkish online retailer. It keeps
selling prices on **Trendyol** and **Hepsiburada** at the most profitable price that still wins
or defends the buybox, while never selling below a computed floor price.

This is a **greenfield rebuild**. The `docs/` folder is a complete specification, written to be
sufficient to build the system from scratch without reading the retired implementation.

> **Agents: start with [`CLAUDE.md`](CLAUDE.md), then [`docs/12-build-plan.md`](docs/12-build-plan.md).**

---

## Where to start

1. [`CLAUDE.md`](CLAUDE.md) — hard rules, documentation map, the marketplace-API rule
2. [`docs/12-build-plan.md`](docs/12-build-plan.md) — ordered phases, each with a definition of done
3. Then the document for whatever phase you are on

**Do not begin a phase before the previous phase's definition of done is met.**

## The specification

| # | Document | Answers |
|---|----------|---------|
| 00 | [System Overview](docs/00-system-overview.md) | What the product does, actors, glossary |
| 01 | [Domain Model](docs/01-domain-model.md) | Entities, stock-code grammar, bundles, invariants |
| 02 | [Cost & Price Model](docs/02-cost-and-price-model.md) | Every pricing formula, VAT treatment, test vectors |
| 03 | [Repricing Engine](docs/03-repricing-engines.md) | Decision state machine, budget, confirmation |
| — | [**API Reference**](docs/api-references.md) | **Every marketplace endpoint + official doc links** |
| — | [Trendyol Scraping Guide](docs/trendyol-merchants-scraping-guide.md) | The public product-page payload: extraction and normalisation rules (reporting only). Hepsiburada's equivalent is a JSON endpoint, documented in api-references §2.11 |
| 05 | [Data Model](docs/05-data-model.md) | Target schema, portability rules, retention, migration map |
| 06 | [User Interface](docs/06-user-interface.md) | Screens, grids, filters, highlighting |
| 07 | [Processes & Jobs](docs/07-processes-and-jobs.md) | Jobs, scheduling, rate limits, failure semantics |
| 08 | [Configuration & Constants](docs/08-configuration-and-constants.md) | Every tunable, and the legacy values |
| 09 | [Known Defects & Risks](docs/09-known-defects-and-risks.md) | What was wrong with the retired system |
| 10 | [Target Architecture](docs/10-target-architecture.md) | Modules, ports, deployment, migration plan |
| 11 | [Requirements](docs/11-rewrite-requirements.md) | Numbered acceptance criteria; resolved and open questions |
| 12 | [Build Plan](docs/12-build-plan.md) | **Phase-by-phase, with definitions of done** |

Docs 00, 01, 04, 08 and 09 describe the **retired** system, for context and migration.
Docs 02, 03, 05, 06, 07, 10, 11, 12 and the API reference are **target specifications** —
build from these.

---

## Target stack

| | |
|---|---|
| Client | Next.js 16 · TypeScript · Tailwind |
| Runtime | Node — one process locally (`SINGLE_PROCESS=1`), web + worker on a server |
| Database | SQLite · PostgreSQL · MySQL, via Drizzle. Code-first, migrated, idempotent |
| Queue | Database-backed. No Redis |
| Domain | `packages/core` — pure, no I/O, fully unit-tested |

```
packages/{core,shared,db,adapters,jobs}
apps/{web,worker}
docs/
reference/          quarantined legacy material
```

---

## Four things to know before writing any code

**1. The retired system's floor prices are wrong.** Cost is VAT-exclusive and selling price is
VAT-inclusive, but its formula has no product-VAT term. Floors were understated by 17% at 10%
VAT and 31% at 20% VAT — losses were being treated as profits.
See [doc 02 §6.1](docs/02-cost-and-price-model.md).

**2. Holding the optimum price is mandatory, not an optimisation.** Hepsiburada allows only
**10 × listing count** listing updates per day. A loop that reprices everything every cycle
cannot function at all. See [doc 03 §8](docs/03-repricing-engines.md).

**3. Competitor collection is not on the critical path.** Trendyol has an official buybox
endpoint returning our rank plus the top three prices; Hepsiburada exposes buybox rank. The
public sources — Trendyol's product page and Hepsiburada's public listings endpoint — exist
only to build competitor history for reporting, and their failure must never stop repricing.
They ship **disabled**: turning them on is an explicit business decision, and declining costs
nothing but competitor reporting. See [doc 10 §5.1](docs/10-target-architecture.md),
[api-references §1.6 and §2.11](docs/api-references.md) and the
[scraping guide](docs/trendyol-merchants-scraping-guide.md).

**4. 📌 Settlement validation is deferred.** The cost model's *parameters* (commission base,
cargo bands, expenditure bands) have not been confirmed against a real settlement statement.
This **does not block development** — they are configuration, not code. It **is** a hard gate
before enabling live writes. See [doc 12 Phase 0.3 and 8.3b](docs/12-build-plan.md).

---

## `reference/` is quarantined

| Path | What it is |
|------|------------|
| `reference/legacy-app/` | The retired .NET WinForms application. Answers "what was the business rule?" — **never** a design, pattern or formula reference |
| `reference/legacy-schema.sql` | MySQL schema dump, 2024-02-02. Needed for the Phase 8 backfill |
| `reference/hepsiburada-portal-research.md` | Source material consolidated into `docs/api-references.md` §2 |

The retired application targets a Trendyol API host that no longer exists and carries 33
documented defects. Read the specification instead.

---

## ⚠️ Credentials

The retired application contained live marketplace and database credentials in plain text.
They must be rotated before anything is shared — see
[doc 12 Phase 0](docs/12-build-plan.md) and [doc 09 §1](docs/09-known-defects-and-risks.md).

No credential may appear in source, in committed configuration, or in a database column.
