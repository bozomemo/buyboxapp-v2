# 14 — Deployment and the customer installer

Status: specification. Added 2026-08-23.

## 1. What this covers

How the system gets onto a customer's machine and becomes usable without the customer knowing
what Node.js is.

The delivery target agreed with the product owner on 2026-08-23 is a **single-machine Windows
install**: one office PC runs everything, and the operator uses it from a browser on that same
PC. Ubuntu is a stated future target and §11 records what changes for it, but nothing in §2–§10
may assume more than one machine.

Out of scope: multi-tenant hosting, high availability, and any deployment where the web app is
reachable from another computer. §4.4 explains why the last one is *forbidden* for now rather
than merely unimplemented.

Also out of scope, deliberately: **automatic self-update**. Decided 2026-08-24 — upgrades are
manual for now, the vendor sends a new installer and the operator runs it. §12 records what was
considered and what would have to be true before it is built, so the decision is revisitable
rather than forgotten.

## 2. What the installer actually has to do

Less than it first appears, because four things are already solved in the application:

| Already solved | Where | Consequence for the installer |
|---|---|---|
| Single-process operation | `SINGLE_PROCESS=1` boots the scheduler inside the Next.js process (`packages/shared/src/config/env.ts`) | One service, not two |
| First-run configuration | The eight-step wizard at `/setup` | The installer asks **no** business questions |
| Licence entry | `/license` and the gate in `apps/web/src/proxy.ts` | The installer asks for **no** licence key (§7) |
| Schema migration | `checkSchemaVersion` / `runMigrations` at worker boot (§5.2) | The installer runs no migration step of its own |

So the installer's whole job is: put the runtime and the built application on disk, create the
bootstrap environment, register a service, and open a browser. Everything a human has to decide
is decided in the browser afterwards, and everything the *database* needs is done by the service
on its first boot.

## 3. Dependencies, and why they are eliminated rather than checked

There are exactly three runtime dependencies:

1. **Node.js ≥ 20** (`package.json` `engines`).
2. **Playwright's Chromium** — mandatory, not optional: Trendyol competitor collection needs a
   real browser because a spoofed header alone is not enough (`CLAUDE.md`, api-references §1.6).
3. **`better-sqlite3`'s native binary**, plus `pg`/`mysql2` if the operator later switches
   engines. All three are declared in `serverExternalPackages` (`apps/web/next.config.ts`).

The obvious design is to detect these on the customer's machine and install what is missing.
**Rejected.** Detection means the install can fail on a wrong Node version already on PATH, on
a corporate proxy blocking a download, on a machine with no administrator rights, or on any of
the several ways a shared PATH goes wrong — and every one of those failures becomes a support
call in Turkish about a tool the customer never asked to have.

Instead all three ship **inside the package**. The installer looks for nothing and installs
nothing else. The cost is the download size, paid once by us; the benefit is that the install is
offline-capable and has no failure mode that depends on the customer's existing software.

Measured on the first real build, 2026-08-24: **265 MB installer**, from a ~890 MB staging tree
(Chromium ~700 MB of it, Node 91 MB, the app 82 MB, WinSW 17 MB). LZMA2/max does the rest, at the
cost of a ~5-minute compile.

Chromium is that large because `playwright install chromium` fetches Chrome for Testing *and* the
headless shell *and* ffmpeg. Whether the headless shell alone would serve `playwright-fetch.ts` is
worth asking if the download size ever becomes a problem — but it is a size question, not a
correctness one, and it is not worth risking the one browser the Trendyol source is known to work
with in order to shave a download.

### 3.1 The native-module constraint this creates

`better-sqlite3` is compiled against a specific Node ABI (`NODE_MODULE_VERSION`). The bundled
Node runtime and the bundled `node_modules` must therefore be built **together, on Windows,
for the same Node major version**. A package assembled by copying a Linux-built `node_modules`
next to a Windows `node.exe` fails at first request with an ABI mismatch, and it fails on the
customer's machine rather than in CI. The build pipeline in §8 exists mainly to make this
impossible.

## 4. Installed layout

```
C:\Program Files\BuyBox\          — code. Replaced wholesale on upgrade.
  node\                             bundled Node 22 runtime
  app\                              next build --output standalone result
    server.js
    .next\static\
    public\
  chromium\                         Playwright browser, pinned by PLAYWRIGHT_BROWSERS_PATH
  scripts\migrate.mjs
  service\BuyBoxApp.exe             WinSW wrapper
  service\BuyBoxApp.xml

C:\ProgramData\BuyBox\            — data. Never touched by an upgrade.
  .env.local
  app.db                            SQLite, when the operator keeps the default
  secrets.enc.json
  logs\
```

The split is the single most important decision in this document: an upgrade deletes and
rewrites `Program Files` and must not be able to reach anything the operator created.

### 4.1 The service's working directory is the data directory

`apps/web/src/lib/server/db.ts` resolves `.env.local` as `path.join(process.cwd(), '.env.local')`,
and the setup wizard **writes** that file when the operator finishes step 1. `scripts/migrate.mjs`
resolves relative SQLite paths against the same directory for the same reason.

If the service ran with its working directory in `Program Files`, the wizard's write would fail
(a service account has no write access there), and if it somehow succeeded the file would be
destroyed by the next upgrade.

Therefore: **the service runs `C:\Program Files\BuyBox\node\node.exe app\boot.mjs` with its
working directory set to `C:\ProgramData\BuyBox\`.** This makes the existing `process.cwd()`
behaviour correct rather than requiring a code change, and it makes a bare relative
`DATABASE_URL` land in the data directory by construction. No change to `db.ts` is needed or
wanted.

`boot.mjs` (`installer/boot.mjs`, copied next to Next's generated `server.js`) is a short
launcher that does two things the working-directory design turns out to need. Both were found by
inspecting Next 16's generated output on 2026-08-24, not predicted.

**It puts the working directory back.** Next's generated `server.js` calls
`process.chdir(__dirname)` while it boots. Left alone, that moves the working directory into
`C:\Program Files\BuyBox\app` — where the service account cannot write, and where an upgrade
deletes everything — and the setup wizard's `.env.local` write would land there. `boot.mjs`
captures the real working directory, imports `server.js`, and restores it. Next is unaffected: it
resolved its own directory to an absolute path before anything was restored.

**It loads `.env.local` itself.** Whether Next's standalone server reads that file is an
implementation detail of Next rather than a contract, and the failure mode if it ever changed —
an install that cannot find its own database — is too expensive to rest on a detail. Values
already in the environment win, so the service's own settings (below) are never shadowed by a
stale line in the file.

### 4.2 `output: 'standalone'`

`apps/web/next.config.ts` must gain `output: 'standalone'`. Without it there is no self-contained
server bundle to ship, and the alternative — copying the monorepo's whole `node_modules` — is
several times larger and carries dev dependencies onto a customer machine.

Standalone does not copy `.next/static` or `public`; the build step in §8 copies them explicitly.

### 4.3 Bootstrap environment written at install time

The installer writes `C:\ProgramData\BuyBox\.env.local`:

| Key | Value | Note |
|---|---|---|
| `DATABASE_URL` | `file:C:\ProgramData\BuyBox\app.db` | Absolute, see below. SQLite is the default per §6 |
| `SECRET_STORE_KEY` | 32 random bytes, hex | **Generated on the customer's machine at install time** |
| `SECRET_STORE_PATH` | `C:\ProgramData\BuyBox\secrets.enc.json` | Absolute, see below |
| `SINGLE_PROCESS` | `1` | |
| `PORT` | `3000`, or the port chosen in §5 step 2 | |
| `HOSTNAME` | `127.0.0.1` | §4.4 |
| `PLAYWRIGHT_BROWSERS_PATH` | `C:\Program Files\BuyBox\chromium` | Absolute: it points into the code directory, not the data directory |
| `AUTO_MIGRATE` | `1` | §5.2. Written **only** by the installer — a development checkout never has it |
| `APP_VERSION` | the installed version | Names the build in `/api/health` and in backup filenames |
| `BUYBOX_DATA_DIR` | `C:\ProgramData\BuyBox` | The anchor a relative SQLite path resolves against (§8.3). Set on the **service**, not in `.env.local` |

`SECRET_STORE_KEY` is generated per install and never ships in the package. A key baked into
the installer would be one key protecting every customer's marketplace credentials, which is
the same as no key. It is generated by the bundled Node (`randomBytes(32)`), not by an installer
scripting language, so there is one implementation of "random" in the product.

The two paths are **absolute**, which reads as redundant given §4.1 — the working directory is
already the data directory, so `file:app.db` would resolve to the same place. It is defence
against exactly one window: `server.js` chdirs into the application directory while it boots
(§4.1), and a relative path read during that window would quietly create a second, empty database
under `Program Files` rather than failing. `boot.mjs` closes that window; absolute paths mean the
operator's data does not depend on it having closed it.

**That defence was not enough, and §8.4 records why.** The installer wrote an absolute path and
the setup wizard then overwrote it with a relative one, because the wizard offered `file:./data/app.db`
as its SQLite default. Guarding the value the installer writes does not guard the value the
operator ends up with. Three things now hold the line instead of one: `BUYBOX_DATA_DIR` anchors a
relative path wherever it comes from, the wizard suggests an absolute path supplied by the server,
and the wizard's API refuses a relative SQLite path outright.

These do not all live in the same place, and the split matters. `.env.local` holds only what the
setup wizard can later change — `DATABASE_URL`, `SECRET_STORE_KEY`, `SECRET_STORE_PATH`,
`SINGLE_PROCESS`. The rest are deployment facts the operator cannot change from the UI, and they
are set on the **service** (`BuyBoxApp.xml`) instead. Putting a wizard-editable value in the
service definition would silently override the operator's own change at the next restart; putting
a deployment fact only in the file would let a stale line contradict what the service actually
does.

`SCRAPER_USER_AGENT` and `SCRAPER_BROWSER_USER_AGENT` are deliberately **not** written. They have
defaults in `BootstrapEnvSchema`, and the browser user agent is expected to go stale and be
refreshed (`env.ts`); pinning it at install time would freeze a value the schema is designed to
let us update.

### 4.4 Loopback only, and why that is a requirement rather than a default

`docs/11-rewrite-requirements.md` N-7 — authentication on the web app — is a *should*, and is
not built. The application therefore trusts every request it receives.

The service binds `127.0.0.1` and the installer creates **no** Windows Firewall rule. An install
reachable from the office LAN would let anyone on that LAN change prices on live marketplace
listings with no credential at all. Binding to `0.0.0.0` is not a configuration option we expose
until N-7 is implemented; when it is, that change belongs in this document's §11 and in a
requirement of its own.

## 5. Installation sequence

The installer is an Inno Setup executable, `BuyBoxSetup-<version>.exe`, requiring administrator
elevation (it writes to `Program Files` and registers a service).

1. **Preflight.** Windows 10 1809+ x64; ~1.5 GB free on the system drive; administrator rights.
   A failed check stops the install with a sentence naming what is wrong, in Turkish. It never
   continues in a degraded mode.
2. **Port.** Probe `3000`. If it is in use, ask for another port rather than failing — a
   developer machine with something already on 3000 is common and is not an error.

   On an upgrade two things change, both added 2026-08-27. The port offered is the one the
   installed service is already using, read from the previous installation's
   `service\BuyBoxApp.xml`, not `3000`: defaulting back would silently move a customer who chose
   `3500` at first install, taking the service and both shortcuts with it. And a listener whose
   executable lives under the previous installation **counts as free**, because the port is held
   by our own still-running service — step 3 stops it, and step 3 runs after the wizard. Without
   that exception the in-use check made it impossible to upgrade onto the port the product was
   already using: the operator was told to enter a different value and could not proceed
   otherwise. Any other program on the port still blocks, as before.
3. **Stop and files.** On an upgrade the previous version is *running out of the directory
   about to be overwritten*: `node.exe`, the WinSW executable and the bundled Chromium are all
   held open, and Windows will not let the wizard replace a file that is in use. So the service
   is stopped first (`stop-service.ps1`, from Inno's `PrepareToInstall`, before a single file is
   touched), and only then is `Program Files\BuyBox` emptied and unpacked per §4;
   `ProgramData\BuyBox` is never touched. The stop goes through the SCM rather than
   `BuyBoxApp.exe stop`, so WinSW performs its normal graceful shutdown and the step does not
   depend on the old installation's files. `install-service.ps1` starts the service again at
   step 7.

   Emptying `{app}` first (Inno's `[InstallDelete]`) matters beyond tidiness: the payload is a
   Next standalone build, and a chunk the new version no longer ships is loaded exactly as if it
   belonged if it is left behind.

   Added 2026-08-26 — the first cut of the installer performed neither, so a second install on a
   machine hit "file in use" and, where Windows deferred the copy to a reboot, left the old code
   running against a database the new build had already migrated.
4. **Environment.** Write `.env.local` per §4.3 — but on an upgrade, **preserve every key that
   already exists**, in particular `SECRET_STORE_KEY`. Regenerating it would render the existing
   `secrets.enc.json` undecryptable and silently destroy the customer's stored marketplace
   credentials. This is the one step where an upgrade bug is unrecoverable, so it gets its own
   check in §10.
5. *(No migration step.)* The schema is created and upgraded by the service itself at boot
   (§5.2). The installer verifies the outcome at step 8 rather than performing it.
6. **Defender exclusion** (optional, default on, one checkbox). Add
   `C:\ProgramData\BuyBox` to Windows Defender's exclusion list. Real-time scanning of a SQLite
   file being written by every job is a measurable throughput cost. Offered, never silent.
7. **Service.** Register `BuyBoxApp` via WinSW: automatic (delayed start), restart on failure,
   working directory and command line per §4.1, stdout/stderr to `ProgramData\BuyBox\logs\`
   with rotation. WinSW is chosen over `node-windows` (which needs Node on PATH and generates
   scripts at runtime) and over NSSM (unmaintained): WinSW is a single executable configured by
   one XML file we ship, so what runs on the customer's machine is what we tested.
8. **Verify.** Start the service and poll `GET http://127.0.0.1:<port>/api/health` for up to
   90 s, requiring `status: ok`. **Anything less fails the install** — say so, report the last
   status seen, and name the log file. An installer that reports success over a broken service is
   worse than one that fails, because the failure surfaces later without the installation context.

   Requiring `ok` rather than merely a response is a correction, made 2026-08-24 after the first
   real install passed this step and then returned 500 on every page (§8.2). `/api/health` answers
   200 while degraded by design, so a 200 alone proves only that a process is listening.
9. **Shortcuts and launch.** Desktop and Start Menu shortcuts to `http://127.0.0.1:<port>`. On
   finish, open the default browser there. The licence gate (`proxy.ts`) redirects to `/license`;
   after a valid key is pasted the operator lands in `/setup`. The installer explains neither —
   both screens explain themselves.

### 5.1 `/api/health`

A route that returns 200 with the application version and schema-migration state, and a
`status` of `ok` only when the database is reachable and its schema matches the build. It must be **exempt from the licence gate** (added to `EXEMPT_PREFIXES`
in `apps/web/src/proxy.ts`), because step 8 runs before any licence exists and a 402 there would
make every first install look broken. It must not require a database connection to return 200 —
it reports connectivity, it does not depend on it.

### 5.2 Migrations run at boot, not at install

Decided 2026-08-24, replacing the installer-run `scripts/migrate.mjs` step.

`startWorker` today refuses to boot on a schema mismatch and tells the operator to run
migrations from the setup wizard or `npm run migrate` (`apps/worker/src/index.ts`). That is right
for a developer checkout and wrong for a packaged install: there is nobody at a terminal, and an
upgrade would otherwise need the installer to know how to migrate a database whose engine and
location the *operator* chose in the wizard, possibly a PostgreSQL server on another host.

So when `AUTO_MIGRATE=1` is set (§4.3 — the installer sets it; a development checkout never does),
`startWorker` applies pending migrations itself instead of refusing. This is the only mechanism:
the installer performs no migration, and a fresh install and an upgrade take the same code path,
which is the path we test on every boot rather than once per release.

Four guards make that safe. None is optional — automatic DDL against a customer's only copy of
their pricing data is the most destructive thing this product does.

**a) Forward only; a database ahead of the build still refuses.** `checkSchemaVersion` currently
reports `upToDate: appliedCount === expectedCount`, which conflates "behind" with "ahead". Under
automatic migration that distinction becomes load-bearing, so it must gain a direction:
`behind` migrates, `ahead` refuses to start exactly as today. A database ahead of the running
build means an older app was pointed at a newer database, and applying this build's DDL to a
schema it does not recognise corrupts it.

**b) Back up before applying, on SQLite.** Copy `app.db` to `backups\app-<version>-<timestamp>.db`
before the first statement, and keep the most recent few. Not on a database with nothing applied
yet — a fresh install has nothing to lose, and an empty snapshot that looks like a restore point
and is not one is worse than no snapshot. Migrations are forward-only with no
`down`, so without this a bad migration is unrecoverable; with it, recovery is a file copy.
On PostgreSQL and MySQL no backup is taken — we do not have the credentials or the tooling to do
it correctly — and the boot log says so. Those installs have an administrator; the SQLite
default does not, which is exactly why the default is the one that gets the safety net.

**c) One migrator at a time.** A lock file (`.migrate.lock`, in the data directory) serialises
migration between processes, and a lock older than fifteen minutes is treated as abandoned by a
crashed process rather than as held — otherwise one crash leaves an install that can never start
again.

Revised 2026-08-24, during implementation: this was specified as "the same advisory lock the
scheduler already uses", and that cannot work. The scheduler's lock is a row in `job_queue`, a
table that does not exist until the very migrations it would be guarding have run. A lock that
needs the schema cannot protect the creation of the schema.

The honest limit of a lock file: it serialises processes on **one machine**, which is the shipped
deployment and the only one where SQLite is involved. It does not serialise two hosts sharing one
PostgreSQL or MySQL server. There the engine is the backstop — a weaker one on MySQL, whose DDL is
not transactional — and those installs, which have an administrator, are told to stop one host
before upgrading.

**d) Failure is loud and stops the service.** A migration error aborts the boot, is written to
the log directory, and is reported by `/api/health` (§5.1) with the reason. A half-migrated schema
must never serve traffic; the install then fails visibly at §5 step 8, which is where an operator
is still watching.

`scripts/migrate.mjs` stays. It remains the right tool for a developer after a `git pull`, and
for any install that deliberately runs without `AUTO_MIGRATE`.

### 5.3 A fresh install must not be born paused

The system pause is fail-closed (`isKillSwitchEngaged`): a missing or unreadable value means
paused. That is the right failure for a running system whose setting was lost — stopping is the
safe direction for something that submits prices — but a fresh install has no row at all, so
every new installation started paused with nothing on any screen saying so. On a real install
(2026-08-24) this was indistinguishable from a broken scheduler and was misdiagnosed twice.

`POST /api/setup/finish` therefore writes `system.pause = false` explicitly, and only when no row
exists — re-running the wizard must never resume a system somebody paused on purpose. Completing
setup is the operator declaring the system configured, which is the moment the state stops being
a default and becomes a decision.

The pause stays fail-closed everywhere else, and the Jobs screen now names it as the reason
nothing is running (§5.1).

### 5.4 The wizard must offer the database the install already has

The installer writes `DATABASE_URL=file:<data dir>\app.db` before the operator ever reaches the
wizard (§4.3). The wizard's database step then *suggested a path of its own* —
`<data dir>\data\app.db`, one directory deeper, because it appended a `data` segment that only a
checkout needs: `BUYBOX_DATA_DIR` **is** the data directory, it does not contain one.

Accepting that suggestion, which is the obvious thing to do, migrated and adopted a **second**
database while the running service kept the first open. Both were healthy, both were live, and
neither saw the other's jobs. Measured on a real install 2026-08-24: the web wrote configuration
to `C:\ProgramData\BuyBox\data\app.db` while the worker ticked against
`C:\ProgramData\BuyBox\app.db`, reporting `paused` forever.

It also silently discarded the licence. The licence gate stands in front of the wizard (doc 13
§6), so the operator had already activated one — into the *outgoing* database. The new one had no
licence row, so finishing setup returned them to `/license` with no explanation, which is the loop
the operator was stuck in.

Two rules, both now enforced:

1. **An install that is already configured is offered its own database, never a reconstructed
   guess at one** (`/api/setup/database/suggest`). A path is derived only when there is nothing to
   read — the one case where no second database can exist yet. The wizard says so on screen, so
   the operator knows that accepting it is correct and that typing another path is what splits it.
2. **A deliberate change of database carries the licence forward**
   (`/api/setup/database/migrate`). Moving to PostgreSQL is legitimate and must not lock the
   operator out of the screen they would fix it from. Best-effort: it never fails a migration that
   is otherwise fine.

`/api/health` already compared the worker's open database against the configured one and warned
when they diverged (§5.1) — that warning is what identified this, and it stays.

### 5.5 The worker must pick up credentials entered after it booted

The service starts before anybody has configured anything. On a fresh install that ordering is
not a race, it is the only possible order: the worker boots, the operator then opens the wizard
and enters marketplace credentials minutes later.

Everything a job needs to reach a marketplace used to be resolved exactly once, at worker boot —
the adapter registry, the reporting-only competitor sources, and the list of marketplace codes
the cadence tickers enqueue for. All three were therefore empty for the life of the process on
every new installation. Measured end-to-end on a clean 0.1.2 install, 2026-08-24:

```
ImportListings      failed   error="No marketplace adapter registered for \"trendyol\""
ScrapeCompetitors   failed   error="no competitor source registered for trendyol"
```

`/api/health` reported `status: ok` throughout — the web half, the worker and the database were
all genuinely fine — and nothing on any screen connected the failures to the missing restart.
The operator's only route out was to restart the service, which they had no reason to suspect.

**Rule: marketplace configuration is re-read while the worker runs, not only at boot.**
`apps/worker` polls a cheap revision of the marketplace table (`code:enabled:updatedAt`, sorted)
every 10 seconds and rebuilds the adapters, the competitor sources and the ticker's marketplace
list when it changes. Both routes that store credentials upsert the marketplace row with a fresh
`updatedAt` in the same request, so a credential change is covered as well as an enable/disable —
without the credentials themselves ever being read to detect the change.

Two constraints on the reload, both load-bearing:

- **It is deferred while any job is in flight.** The outgoing competitor sources own a Playwright
  browser which is closed on replace, and closing it under a running scrape would fail that
  scrape rather than the reload. The check simply runs again on the next interval.
- **The revision is read before the rebuild, never after.** A change landing mid-rebuild is then
  picked up on the following pass instead of being recorded as already applied.

Covered by `apps/worker/src/index.test.ts` — "picks up a marketplace configured after boot,
without a restart".

## 6. Database

SQLite is the installed default (`DATABASE_URL=file:app.db`). It adds no dependency, no service,
and no uninstall residue, and a single-machine install has one writer.

The operator can move to PostgreSQL or MySQL at any time from step 1 of the setup wizard, which
already offers it. The installer does **not** install or offer a database engine: doing so would
add a second product to install, upgrade, back up and uninstall, in exchange for a capability
the wizard already provides to the customers who need it.

Backups are the operator's responsibility and are one file copy from `ProgramData\BuyBox`. The
UI should say so somewhere; that is a doc 06 concern, not an installer one.

## 7. Licensing

The installer neither asks for nor validates a licence key. `docs/13-licensing.md` §6 makes the
gate in `proxy.ts` the only web-side enforcement point, deliberately, and R-LIC-5 requires that
pasting a licence into a stopped install revives it with no restart. An installer-side check
would duplicate that gate, would need the Ed25519 verifier compiled into the installer, and
would create a second place a licence can be rejected with different wording.

Consequence: a customer can install before their licence is issued, and a lapsed customer fixes
their install by pasting a key rather than by reinstalling.

The install fingerprint of doc 13 §5 is computed by the application from the machine id and
database name. The installer contributes nothing to it and must not persist one.

## 8. Build pipeline

Two constraints drive it: the ABI problem of §3.1, and the fact that Chromium's version is
pinned by Playwright's version, so a hand-assembled `chromium\` folder goes stale silently.

Everything therefore runs on a **Windows CI runner**, in this order:

1. `npm ci` — on Windows, so `better-sqlite3` is built for the Windows Node ABI.
2. `npm test` and `npm run typecheck`. An installer is not built from a red build.
3. `npm run build` with `output: 'standalone'`.
4. Assemble `app\`: the standalone output, plus `.next\static` and `public` copied in, **minus
   every `.env*` file** — see §8.1.
5. Copy the Node 22 runtime into `node\`. Its major version must match the one `npm ci` ran
   under; CI asserts this rather than assuming it.
6. `PLAYWRIGHT_BROWSERS_PATH=<staging>\chromium npx playwright install chromium`.
7. Compile `installer\buybox.iss` with Inno Setup.
8. Sign — see §9.

Files under `installer\`:

| File | Role |
|---|---|
| `build-package.ps1` | The pipeline above, runnable locally and from CI |
| `buybox.iss` | Inno Setup script. Thin — it sequences the scripts below rather than reimplementing them in Pascal |
| `preflight.ps1` | §5 step 1 |
| `stop-service.ps1` | §5 step 3 — stops the running service before its files are replaced, and waits for the processes under `{app}` to actually exit |
| `configure-env.ps1` | §5 step 4, including the upgrade-preservation rule |
| `install-service.ps1` | §5 step 7; renders `BuyBoxApp.xml.template` |
| `verify-health.ps1` | §5 step 8 |
| `uninstall-service.ps1` | §10 D-6 |
| `BuyBoxApp.xml.template` | WinSW definition, with the install paths and port as tokens |
| `boot.mjs` | §4.1's launcher |
| `vendor\WinSW.exe` | Vendored, not downloaded during a build: the binary that runs as a service on a customer machine should be one we chose and hashed once |
| `README-build.md` | How to produce a package locally, and what to test on a clean VM |

`.github/workflows/release-windows.yml` runs the same script on a `windows-latest` runner.

### 8.1 The package must contain no developer state

**Next's standalone output copies more of the developer's working tree into the package than the
package has any business containing.** Neither instance below was predicted; both were found by
building, and the second was found on a customer's machine.

| Date | What leaked | Where it ended up |
|---|---|---|
| 2026-08-24 | `apps/web/.env.local`, `SECRET_STORE_KEY` and all | `staging\app\.env.local` |
| 2026-08-24 | `apps/web/data/app.db`, a 4.8 MB development database | installed as `Program Files\BuyBox\app\data\app.db` |

Both are faults, not untidiness. An `.env.local` gives every customer the same key protecting
their marketplace credentials, which CLAUDE.md forbids outright — the environment written on the
customer's machine at install time (§4.3) must be the only one that exists. A database file gives
them somebody else's data, and leaves a second, stale database inside the install directory where
a mistake — a relative path, a wrong working directory (§8.3) — can open it.

**The first fix caused the second.** Deleting `.env*` named the file that had gone wrong instead
of stating what the package is allowed to contain, so `data\app.db` shipped past it untouched. It
was invisible to every other check too: `data/` is `.gitignore`d, so nothing in review has ever
shown it.

`build-package.ps1` therefore purges a *class* of thing — `.env*`, `*.db`, `*.db-wal`, `*.db-shm`,
`*.sqlite`, `*.sqlite3`, `secrets.enc.json`, and a `data\` directory — and then **fails the
build** if any of it survived. The assertion runs after every copy into `app\`, not beside the
deletion, so it also covers what a later assembly step brings in.

`outputFileTracingExcludes` in `apps/web/next.config.ts` keeps `data/` out of the trace in the
first place. That is the weaker of the two defences and is not the one relied on: it depends on
tracing honouring the exclusion, whereas the assertion inspects the artefact about to be compiled.

The rule to apply to a third instance: state what the package may contain, and assert it. Do not
add a pattern.

### 8.2 The packaged app must be booted before it is shipped

The first package built from this specification installed cleanly, passed its health check, and
then returned **500 on every request**. Two runtime files were missing from it, and nothing in
the pipeline could see that: typecheck, the full test suite and the Node ABI assertion were all
green, because every one of them exercises the *repository*, not the *package*.

Both failures came from the same place — Next's file tracing keeps what it can see being
imported, and neither of these is imported:

1. **`playwright-core/browsers.json`.** Playwright reads it from its own package directory at
   runtime. Tracing copied the library and left the data file, so the instrumentation hook —
   which starts the embedded worker, which loads the adapters, which load Playwright — threw
   before the server finished preparing. A server that fails to prepare answers every request,
   including `/api/health`, with 500.
2. **The migration SQL files.** They were not in the package at all, and could not have been
   found if they were: `@buybox/db` is in `transpilePackages`, so `defaultMigrationsFolder`'s
   `import.meta.url` resolves inside a bundle chunk rather than inside the package. The packaged
   app looked for migrations at a path that has never existed on any machine. Hence
   `BUYBOX_MIGRATIONS_DIR`, which the service sets and a checkout does not.

`build-package.ps1` now copies both, and asserts each is present. But the durable fix is the
third one: **it boots the assembled package the way the service boots it, against a throwaway
data directory, and requires `/api/health` to report `status: ok` and `/` not to return 5xx.**
Neither bug survives that check, and neither was catchable by anything cheaper.

The lesson generalises beyond these two files. A package is a different artefact from the
repository it was built from, and the only reliable way to know it works is to run it.

### 8.3 One `DATABASE_URL` must mean one database

The first customer install reached the Jobs screen with two jobs queued, `failed: 0`, and
nothing running — for two hours, with no error in any log. The web half was writing to
`C:\ProgramData\BuyBox\data\app.db` and the embedded worker was polling
`C:\ProgramData\BuyBox\app.db`. Both were healthy. Both were doing exactly what they were told.

The setting was `DATABASE_URL=file:./data/app.db`. A relative SQLite path is resolved by whoever
opens the connection, at the moment they open it — and the two halves of a single-process install
open theirs under different working directories, because `server.js` calls `process.chdir(__dirname)`
during boot (§4.1) and the embedded worker starts inside that window while every web request runs
after `boot.mjs` has put the directory back.

The value came from the setup wizard, which offered `file:./data/app.db` as its SQLite default and
wrote it over the absolute path the installer had put there.

Four changes, because no single one of them is sufficient:

1. **`BUYBOX_DATA_DIR`** (§4.3) is the anchor a relative SQLite path resolves against, so the
   answer no longer depends on *when* the connection is opened.
2. **The wizard's SQLite suggestion comes from the server** (`/api/setup/database/suggest`) and is
   absolute. There is no compiled-in relative default left to accept without reading.
3. **The wizard's API refuses a relative SQLite path**, rather than silently rewriting what the
   operator typed.
4. **`/api/health` reports the worker** — whether it is running, when it last ticked, and which
   database it opened — and reports `degraded` when that database is not the configured one. The
   Jobs screen shows the same thing as a banner. The build's smoke test now asserts it, using a
   deliberately relative `DATABASE_URL` so the split would reappear if the anchor regressed.

The first three prevent this failure. The fourth is the one that matters more, because it is not
about this failure: nothing in the product could answer "is the worker running, and is it looking
at my database?" A component that can fail silently and completely needs a way to say so.

### 8.4 Installer scripts are ASCII-only

Also found by building, 2026-08-24. Windows PowerShell 5.1 — what a customer machine runs, and
what the installer invokes — reads a BOM-less UTF-8 file as ANSI. One em dash in a comment became
mojibake containing a quote character, which terminated a string early and made the script fail
to **parse**, not to run.

The Turkish messages in these scripts are already written without diacritics for the same reason.
`build-package.ps1` asserts that every script it packages is pure ASCII.

The installer version comes from the root `package.json` version, which is currently `0.0.0` and
has to start being maintained.

## 9. Code signing

There is no certificate today (product owner, 2026-08-23), so the first packages ship unsigned.
This is a known, accepted, and temporary state, and it has costs worth writing down rather than
discovering:

- SmartScreen shows "Bilinmeyen yayıncı" and hides the run button behind "Daha fazla bilgi".
  Some customers will stop there.
- An unsigned `node.exe` next to an unsigned Chromium is a shape corporate antivirus products
  quarantine, sometimes silently and sometimes after the install appears to have succeeded.

- **Smart App Control blocks the installer outright.** Not a dialog with a way past it: the
  process never starts and PowerShell reports `An Application Control policy has blocked this
  file`. Measured 2026-08-24 on the development machine — `VerifiedAndReputablePolicyState: 1`,
  user-mode code integrity enforced — where the 0.1.3 package was blocked while 0.1.1 and 0.1.2
  had installed from the same directory hours earlier. Smart App Control judges each unsigned
  binary on cloud reputation, so a package that installs today is no evidence the next one will.
  It is **on by default on new Windows 11 installations**, and it cannot be re-enabled once
  turned off without resetting Windows — so "ask the customer to disable it" is not a mitigation
  that can be offered.

Mitigation until a certificate exists: publish the SHA-256 of each release so a customer can
verify what they downloaded, and ship a one-page Turkish install note covering the SmartScreen
dialog. Neither is a substitute, and neither touches Smart App Control. An OV/EV certificate
should be treated as a prerequisite for selling to any customer with managed endpoints — and,
after the measurement above, for any customer on a recent Windows 11 machine at all. EV is what
carries reputation with Smart App Control immediately; OV accrues it slowly and unpredictably.

**Testing around the block.** `installer\install-from-staging.ps1`-style manual installation —
copying `installer\staging`'s five directories into place and running `configure-env.ps1`,
`install-service.ps1` and `verify-health.ps1` with the arguments `buybox.iss` passes them —
installs the identical payload without the blocked executable. It exercises the service, the
worker and the wizard; it does **not** exercise the installer, the uninstaller or the shortcuts,
so it is a development workaround and never a release check. D-1 still requires the real package.

## 10. Definition of done

| # | Check |
|---|---|
| D-1 | On a clean Windows 10/11 VM with no Node, no Chromium and no internet, the installer completes and the browser lands on `/license` |
| D-2 | `SECRET_STORE_KEY` differs between two installs made from the same package |
| D-3 | Rebooting the VM brings the service back without a login |
| D-4 | Upgrading over an existing install preserves `SECRET_STORE_KEY`, `app.db`, `secrets.enc.json` and the licence, and applies pending migrations |
| D-5 | A deliberately broken build (bad `DATABASE_URL`) makes the installer **fail** at step 8 and name the log file |
| D-14 | Installing over a **running** install succeeds: no "file in use" prompt, no deferred-to-reboot copy, and the service is running the new build when the wizard finishes (§5 step 3) |
| D-15 | Upgrading an install made on a non-default port offers that port, accepts it while the old service still holds it, and finishes with the service and both shortcuts still on it (§5 step 2) |
| D-10 | A fresh install creates the schema on first boot with no migration step in the installer (§5.2) |
| D-11 | An upgrade carrying a new migration applies it on the first service start, and a SQLite backup file exists afterwards |
| D-12 | An older build pointed at a newer database refuses to start and says so, rather than migrating (§5.2a) |
| D-13 | A migration that throws leaves the service stopped and `/api/health` reporting the reason — never a half-migrated schema serving traffic |
| D-6 | Uninstall removes the service and `Program Files\BuyBox`, and leaves `ProgramData\BuyBox` unless the operator ticks the box; the default is to keep it |
| D-7 | The port is not reachable from a second machine on the same LAN (§4.4) |
| D-8 | Trendyol competitor collection succeeds on the installed machine, proving the bundled Chromium is found via `PLAYWRIGHT_BROWSERS_PATH` |
| D-9 | An ABI-mismatched package fails in CI, not on a customer machine (§3.1 assertion in step 5) |

## 11. Ubuntu, later

The layout generalises without redesign: `/opt/buybox` for code, `/var/lib/buybox` for data,
systemd `WorkingDirectory=/var/lib/buybox` reproducing §4.1, a `buybox` system user, and
`ExecStart` on the bundled Node.

The packaging is a `.deb`, not a shell script. Chromium's shared-library needs
(`libnss3`, `libatk-bridge2.0-0`, `libgbm1`, and the rest of Playwright's list) go in `Depends:`,
so **apt** performs the dependency resolution instead of a script we wrote — strictly more
reliable, and it makes the "check dependencies" requirement disappear into the package manager.
`postinst` performs §5 steps 4–8; `postrm` keeps data except on `purge`.

Docker Compose is a reasonable third option for a technically staffed customer running a server,
and the repository already has `packages/db/docker-compose.test.yml` as a starting shape. It is
explicitly **not** the primary path on Windows: Docker Desktop is a second product to install and
upgrade, and it is not free for larger companies.

## 12. Automatic self-update — deferred, and what it would take

Decided 2026-08-24: **not built.** Distribution is manual — the vendor sends a new
`BuyBoxSetup-<version>.exe`, the operator runs it, and §5 handles the rest. With §5.2 in place an
upgrade is genuinely one double-click, which is enough at the current number of installs.

Recorded here so the decision can be revisited on evidence rather than re-derived:

**GitHub Releases is the right build host and the wrong distribution host.** GitHub Actions on a
Windows runner is already what §8 requires. Serving the artefact from Releases is not: a private
repository would need a GitHub token sitting on the customer's machine, which leaks the whole
source if it leaks, and a public one publishes a commercial product. The artefact would belong in
our own object store (S3/R2) at an unguessable path instead.

**The manifest would reuse the licensing key machinery, with a different key.** A signed
`update.json` (version, url, sha256), verified with the Ed25519 verifier already in
`packages/shared/src/license/`, then the download verified against the hash before anything runs.
An unsigned manifest hands anyone who can spoof DNS administrator-level code execution on a
customer machine. The release key must be **separate** from the licence key so one leak is not both.

**Code signing stops being a sales concern and becomes a functional prerequisite.** A service
silently launching an unsigned installer with elevation is the exact behaviour EDR products
classify as a malicious updater. §9 would have to be resolved first.

**Download automatically, install on one click — not silently.** This product changes live prices
with real money, there is no staged rollout at this install count, and the customer has no
rollback. A network failure should pass unnoticed; an upgrade should happen when the operator
chose it.

**It must not become a licence heartbeat.** `docs/13-licensing.md` §2 promises offline
verification with no vendor call. An update check is not that, but it is still regular vendor
contact: it would have to sit entirely outside the pricing path (a failure is recorded and the
run continues, as with the reporting scrapers), send no licence id, and be exempt from the
licence gate — otherwise an expired install could be stuck on a build that cannot be updated.
