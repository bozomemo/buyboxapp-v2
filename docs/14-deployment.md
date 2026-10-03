# 14 — Deployment and the customer installer

Status: specification. Added 2026-08-23.

## 1. What this covers

How the system gets onto a customer's machine and becomes usable without the customer knowing
what Node.js is.

The delivery target agreed with the product owner on 2026-08-23 is a **single-machine Windows
install**: one office PC runs everything, and the operator uses it from a browser on that same
PC. Ubuntu is a stated future target and §11 records what changes for it, but nothing in §2–§10
may assume more than one machine.

Out of scope: multi-tenant hosting and high availability.

**Revised 2026-09-27: remote access is now in scope.** The product owner is moving the
application to a VPS and using it from browsers on other computers. What made that forbidden
until now was the absence of sign-in, which `docs/18-authentication-and-access.md` supplies.
§13 describes the server deployment. It is **still one machine**: the VPS runs the service, the
reverse proxy and the database together. §4.4 keeps the service itself on loopback in every
install shape.

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

Since 2026-09-08 the Grafana Alloy installer is bundled too, by the same argument — ~109 MB of
staging and **+101 MB** compressed, measured on the 0.1.10 build: 279 MB → **385 MB** (doc 16
§5.1). LZMA2 buys almost nothing on it, because Alloy's installer is already compressed. It is the one bundled component
whose absence is a build *warning* rather than an error: without WinSW the package cannot run at
all, while without Alloy it installs a completely working product that simply has no remote
monitoring. Making every developer build depend on a 109 MB binary unrelated to pricing would buy
nothing.

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
| `PUBLIC_ORIGIN` | **not written** on a local install | Setting it switches the install into network mode (§13, doc 18). Set on the service by the server setup, never by the Windows installer |
| `TRUST_PROXY` | **not written** on a local install | `1` only behind the §13 reverse proxy, so the client address is read from `X-Forwarded-For` (doc 18 §3.3) |

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

**Revised 2026-09-27.** The original reason still holds until Phase 12 is built. N-7 was a
*should* and was not built, so the application trusted every request it received. An install
reachable from the office LAN would let anyone on that LAN change prices on live marketplace
listings with no credential at all.

What changes with doc 18 is how remote access is allowed, not the binding:

- **The service binds `127.0.0.1` in every install shape, and always will.** The installer
  creates no Windows Firewall rule. Binding to `0.0.0.0` is still not a configuration option.
- **Remote access goes through a TLS reverse proxy on the same machine (§13).** The proxy is the
  only thing listening on the network. It terminates HTTPS, sets HSTS and forwards to
  `127.0.0.1:<port>`.
- **Sign-in is required even on a loopback-only install** (doc 18 §1). Loopback only limits who
  can reach the service; it does not identify who is using it.

Why the service never listens on the network itself, even with sign-in:

- it would serve the session cookie over plain HTTP;
- `/api/health` and `/api/metrics` would be reachable directly (doc 18 §7.3);
- two ways in means two configurations to keep right.

R-DEP-4 and R-DEP-16 hold this.

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

   **The log structure the service produces** (`installer/BuyBoxApp.xml.template`, settled
   2026-09-03). There are two records of what the install did, and an operator diagnosing a
   production fault should know which one to open:

   | | File log | `app_events` |
   |---|---|---|
   | Where | `ProgramData\BuyBox\logs\BuyBoxApp.out.log` / `.err.log` | the database, `/events` screen |
   | What | every line the process wrote to stdout/stderr — one JSON object per line, plus anything a dependency prints | only what the app chose to record, with `code`, `marketplaceCode`, `listingId`, `jobRunId` |
   | Rotation | WinSW `roll-by-size-time`: rolls at 10 MB, keeps 30 files — **no timed roll** (see below) | `PruneHistory` nightly: info/debug 3 days, warn/error 30 days (doc 05 §10) |
   | Answers | "the process died / a dependency complained / nothing reached the database" | "which listing, which job, which marketplace" |

   **Why there is no midnight roll** (found in production 2026-10-03). The template used to set
   `<autoRollAtTime>00:00:00</autoRollAtTime>`. WinSW 2.12's timed roll crashes the wrapper
   (`ObjectDisposedException: Cannot access a closed file` in
   `RollingSizeTimeLogAppender.CopyStreamWithRotation`, Windows Application log, `.NET Runtime`
   event 1026). The wrapper dies **without stopping `node.exe`**: the orphan keeps port 3000, each
   restart WinSW attempts exits with `EADDRINUSE`, and the service only comes back when the
   orphan exits a few minutes later — killing whatever job it held. It happened every night from
   the first one after install. The process side now shuts down gracefully when orphaned (see
   `apps/web/src/instrumentation-orphan.ts`), but the cause is removed here: a size-only roll at
   the measured ~230 KB/day keeps well over the 30 days `app_events` keeps.

   Stdout carries `debug`/`info`, stderr `warn`/`error` (`packages/shared/src/logger.ts`), so
   `BuyBoxApp.err.log` alone is usually the whole investigation. Every line is a single JSON
   object — `time`, `level`, `name`, `message`, then the call's own fields — which is what makes
   the files greppable a month later.

   Three properties of that writer are load-bearing and easy to lose in a refactor (all added
   2026-09-03, see the module comment): `Error` values are expanded to `name`/`message`/`stack`
   (`JSON.stringify(new Error())` is `{}`, so every logged failure used to be an empty object);
   `bigint` is written as a string (money is `bigint` here, and `JSON.stringify` *throws* on
   one — a log call that throws turns a logged failure into an unlogged crash); and fields whose
   *name* says credential (`password`, `secret`, `token`, `apiKey`, `authorization`, …) are
   replaced with `[redacted]`, because marketplace credentials travel inside the request objects
   that get attached to errors.

   A fault that escapes everything — `uncaughtException`, `unhandledRejection` — is caught by
   `registerProcessErrorHandlers` (`packages/shared/src/process-errors.ts`) and written to both
   records before the process exits, rather than arriving as a bare Node stack trace that never
   reaches `app_events`. An uncaught exception then exits deliberately and WinSW's `onfailure`
   restarts within ten seconds; an unhandled rejection is logged and the run continues, because
   the scheduler already isolates per-job failure and killing the host would drop every in-flight
   submission with it.

   On an **upgrade** the service already exists, so the step rewrites `BuyBoxApp.xml` and starts
   it again — and that is all it does. Everything the service *runs* (executable, arguments,
   working directory, every `<env>`, the log configuration, the stop timeout) is read out of that
   file at each start. Only the registration-time properties — start mode, failure actions,
   description — need a command, and the vendored WinSW **2.12.0 has none**: `refresh` is a 3.x
   command and calling it on 2.x is a fatal `Unknown command: refresh`. See §5.6. Changing one of
   those properties in the template therefore needs an uninstall/install, not this script.
8. **Verify.** Start the service and poll `GET http://127.0.0.1:<port>/api/health` for up to
   90 s, requiring `status: ok`. **Anything less fails the install** — say so, report the last
   status seen, and name the log file. An installer that reports success over a broken service is
   worse than one that fails, because the failure surfaces later without the installation context.

   Requiring `ok` rather than merely a response is a correction, made 2026-08-24 after the first
   real install passed this step and then returned 500 on every page (§8.2). `/api/health` answers
   200 while degraded by design, so a 200 alone proves only that a process is listening.

   **Where these steps run is part of the requirement**, not an implementation detail — see §5.6.
   Steps 4, 6, 7 and 8 are driven from Inno's `CurStepChanged(ssPostInstall)`, which checks each
   exit code, because an Inno `[Run]` entry's exit code is ignored and the check above then means
   nothing. "Fails the install" is spelled out there too: the operator is shown the failing
   script's own output and the finish page's launch button is withheld, but the installed files
   are deliberately **not** rolled back.
8b. **Remote monitoring (optional).** Install and configure Grafana Alloy so logs and metrics
   reach Grafana Cloud without a remote desktop session — `install-monitoring.ps1`, specified in
   `docs/16-remote-observability.md` §5.

   **This step is the one exception to step 8's rule, and deliberately so: it cannot fail the
   install.** Every other step is required for a working product; this one is not. An operator who
   leaves the Grafana fields blank, or a machine with no internet during setup, must still finish
   with a working BuyBox — so the script exits 0 on every path it can reach and reports what it
   did in its own output, and `buybox.iss` calls it with `Exec` rather than `RunStep`. This is not
   a relapse into the 2026-09-02 defect where an ignored exit code hid a real failure (§5.6):
   there, a failure meant the product was broken; here, there is no failure to hide.

   It runs **last**, after step 8's verification, so that by the time it executes the product is
   already installed, started and proven healthy. Nothing it does can take that away.

   Alloy is installed into **its own directory**, not `{app}`. Step 3 empties `{app}` wholesale on
   an upgrade, and an agent outside that tree keeps shipping straight through the upgrade — which
   is exactly when watching it remotely is most useful.
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

Beyond connectivity it reports, and warns on, the **contradictions between two halves that are
each individually healthy** — the class of failure that has cost the most diagnosis time on this
product. Three so far:

| Warning | The failure it names |
|---|---|
| Worker on a different database than the configuration | 2026-08-24: both halves fine, jobs queued forever (§8.3) |
| Worker has not ticked in over a minute | The scheduler loop stopped, whatever the reason |
| An **enabled marketplace the worker has no adapter for** | Added 2026-09-02, below |

The third: a marketplace is switched on in the database while its credentials live in the secret
store, and the two can disagree. An enabled row whose credentials are absent or unreadable leaves
`buildAdapters` with nothing to register, and every job targeting it then fails with
`No marketplace adapter registered for "trendyol"` — while Settings > Marketplaces still shows it
ticked, carrying a merchant ref, beside a green "Sistem Çalışıyor". Nothing compared the two, so
the only evidence was the job errors themselves. `worker.marketplaces` now reports the live
registry, the mismatch is a warning, and the worker additionally logs
`worker.marketplaceEnabledWithoutCredentials` at boot — on **stderr**, so it lands in
`BuyBoxApp.err.log`, not the out log.

It is raised only against a marketplace the operator actually enabled, which is what keeps it off
a fresh install: nothing is enabled there, so step 8's `status: ok` is unaffected. A brief
`degraded` right after enabling one is correct rather than noise — the worker rebuilds its
registries within `MARKETPLACE_RELOAD_INTERVAL_MS` (§5.5), and jobs really do fail until it has.

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

### 5.6 An install step that cannot fail the install is not a check

Added 2026-09-02, from a customer machine. The whole of an upgrade's evidence was four lines:

```
2026-09-01 13:51:38 DEBUG - Starting WinSW in console mode
2026-09-01 13:51:38 FATAL - Unhandled exception
System.Exception: Unknown command: refresh
   at WinSW.Program.Run(String[] argsArray, IServiceConfig config)
```

Two separate faults, and the second is the one that matters.

**The fault.** `install-service.ps1` called `& $winsw refresh` on the upgrade branch. `refresh`
is a WinSW **3.x** command; the vendored binary is 2.12.0, whose command list does not contain
it, so the call is a fatal error and a non-zero exit code. `$ErrorActionPreference = 'Stop'` and
the exit-code check then threw the script — *before* `& $winsw start`. The service had already
been stopped by step 3 so that its files could be replaced, and nothing started it again. The
customer was left with an upgraded installation and no running service until the machine next
rebooted into the delayed auto-start.

Nothing about the upgrade needed the command. §5 step 7 records why: on 2.x an XML rewrite
already covers everything the service reads at start.

**The fault that hid it.** Steps 4, 6, 7 and 8 were Inno `[Run]` entries, under a comment
asserting that "each step is checked: a failure here fails the installation". **Inno ignores a
`[Run]` entry's exit code entirely.** So `install-service.ps1` threw, `verify-health.ps1` then
polled a stopped service for 90 seconds and exited 1, and the wizard finished on
"Kurulum tamamlandi". The check §5 step 8 requires had been written, shipped, and disconnected.

**Rule: every installation step whose failure must stop the install runs from
`CurStepChanged(ssPostInstall)`, where its exit code is read.** A failure there stops the
remaining steps, is written to the setup log, is shown to the operator as the failing script's
own Turkish output, and withholds the finish page's "BuyBox'i simdi ac" button — sending someone
to a page that cannot load is not a finish. Only the browser launch is left in `[Run]`, guarded
by a `Check` on that same flag.

The installed files are **not** rolled back on failure. On an upgrade a rollback would take the
working previous installation with it, and `ProgramData\BuyBox` is untouched either way, so
re-running the installer is the recovery and the operator keeps a machine they can still use.

The generalisation is §8.2's, one level up: it is not enough for a check to exist and pass in
isolation — something has to be able to *act* on its answer.

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
| `install-monitoring.ps1` | §5 step 8b; renders `monitoring\alloy\config.alloy.template` and silently installs Alloy. Doc 16 §5. The only install script that never fails the installation |
| `uninstall-service.ps1` | §10 D-6 — the BuyBox service, the Alloy agent, and the Defender exclusion |
| `BuyBoxApp.xml.template` | WinSW definition, with the install paths and port as tokens |
| `boot.mjs` | §4.1's launcher |
| `vendor\WinSW.exe` | Vendored, not downloaded during a build: the binary that runs as a service on a customer machine should be one we chose and hashed once |
| `vendor\alloy-installer-windows-amd64.exe` | Vendored for the same reason, plus its size. **Optional**: a build without it warns and produces a working package with no remote monitoring |
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
| D-1 | On a clean Windows 10/11 VM with no Node, no Chromium and no internet, the installer completes, its final page shows the setup token, and the browser lands on `/bootstrap` (doc 18 §8.1; was `/license` before 2026-09-27) |
| D-2 | `SECRET_STORE_KEY` differs between two installs made from the same package |
| D-3 | Rebooting the VM brings the service back without a login |
| D-4 | Upgrading over an existing install preserves `SECRET_STORE_KEY`, `app.db`, `secrets.enc.json` and the licence, and applies pending migrations |
| D-5 | A deliberately broken build (bad `DATABASE_URL`) makes the installer **fail** at step 8 and name the log file |
| D-16 | A **step 7** failure — the service registration itself, not the health poll — stops the install with the script's own Turkish message, leaves no "BuyBox'i simdi ac" button, and is in the setup log. A wizard that finishes over a stopped service is the defect (§5.6) |
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

## 11. Ubuntu

Status: planning, added 2026-09-08. Nothing in this section is built yet — it is the ordered
plan for building it, in the same spirit as `docs/12-build-plan.md`: each step has a definition
of done, and a step is not started before the previous one's is met.

### 11.1 What an audit of the repository found, and why this is a packaging problem, not a code problem

Before planning the packaging, the application code (`packages/*`, `apps/web`, `apps/worker`)
was checked for anything that would refuse to run on Linux. It does not exist:

- Every path is built with `node:path`'s `path.join`/`path.resolve` (`apps/web/src/lib/server/db.ts`,
  `scripts/migrate.mjs`, `packages/db/src/dialect.ts`). Nothing concatenates a literal `\`.
- Nothing branches on `process.platform`. `grep -r "process.platform" apps packages` outside
  `node_modules` returns zero hits.
- The `C:\ProgramData\BuyBox\...` and `C:\BuyBox\app.db` strings that do exist
  (`apps/web/src/app/api/setup/database/migrate/route.ts`,
  `apps/web/src/app/setup/steps/step1-database.tsx`) are **Turkish-language example text inside
  error messages**, not path logic — they tell the operator what an absolute path looks like on
  the machine they're sitting at. They need a platform-conditional example, not a rewrite of the
  validation itself (§11.9).
- `better-sqlite3`, `pg`, `mysql2` are all in `serverExternalPackages` already and all ship
  prebuilt or build cleanly on Linux; none of the three is Windows-only.

So §3–§10 above — dependencies eliminated rather than checked, the code/data directory split,
`AUTO_MIGRATE` at boot, the `/api/health` contradiction checks, the ASCII-scripts lesson, the
"boot the package before shipping it" lesson — all of it **carries over unchanged**, because none
of it is about Windows. What is Windows-specific and has no Linux equivalent yet is narrower than
it looks: WinSW, Inno Setup, the five PowerShell orchestration scripts, and Windows Defender.
Everything else in this document is either already portable or generalises by substitution.

### 11.2 Installed layout

Parallel to §4, substituting the Filesystem Hierarchy Standard for `Program Files`/`ProgramData`:

```
/opt/buybox/                      — code. Replaced wholesale on upgrade. Owned by root.
  node/                              bundled Node 22 runtime
  app/                               next build --output standalone result
    server.js
    .next/static/
    public/
  chromium/                         Playwright browser, pinned by PLAYWRIGHT_BROWSERS_PATH
  scripts/migrate.mjs
  boot.mjs

/var/lib/buybox/                  — data. Never touched by an upgrade. Owned by the buybox user.
  .env.local
  app.db                             SQLite, when the operator keeps the default
  secrets.enc.json
  backups/

/var/log/buybox/                  — logs, owned by the buybox user, rotated by logrotate (§11.5)

/etc/buybox/                      — nothing today; reserved, not used, so an operator does not
                                     go looking for config in a third place. Everything
                                     configurable lives in /var/lib/buybox/.env.local, exactly as
                                     on Windows (§4.3): it is the one file the setup wizard writes.
```

`/opt` is standard for third-party, self-contained application trees (FHS §4.9); `/var/lib` is
standard for a service's persistent state (FHS §5.8, the same category PostgreSQL and Docker use
for theirs). This is the direct substitution the original §11 named, kept because nothing in the
audit above found a reason to deviate from it.

A dedicated **system user and group, `buybox`** (`useradd --system --home /var/lib/buybox
--shell /usr/sbin/nologin buybox`), owns `/var/lib/buybox` and `/var/log/buybox` and runs the
service. It owns nothing under `/opt/buybox` — the same reasoning as the Windows service account
having no write access to `Program Files` (§4.1): a compromised or buggy process should not be
able to modify the code it is running.

### 11.3 The working-directory design carries over exactly

§4.1's problem is not Windows-specific: Next's generated `server.js` calls
`process.chdir(__dirname)` on every platform, and `boot.mjs` (`installer/boot.mjs`) already
captures and restores the real working directory using only `process.cwd()`/`process.chdir()` —
no Windows API. **No change to `boot.mjs` is needed.** systemd sets the working directory the
same way WinSW's XML does:

```ini
[Service]
WorkingDirectory=/var/lib/buybox
ExecStart=/opt/buybox/node/bin/node /opt/buybox/app/boot.mjs
```

`BUYBOX_DATA_DIR=/var/lib/buybox` is set as an `Environment=` line in the unit, exactly as it is
set on the Windows service today (§4.3) — it is a deployment fact, not something
`.env.local`-editable, for the same reason given there.

### 11.4 systemd unit — the WinSW substitution

Parallel to §5 step 7. `installer/BuyBoxApp.xml.template` becomes
`installer/linux/buybox.service.template`:

```ini
[Unit]
Description=BuyBox repricing service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=buybox
Group=buybox
WorkingDirectory=/var/lib/buybox
Environment=BUYBOX_DATA_DIR=/var/lib/buybox
Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/buybox/chromium
Environment=BUYBOX_MIGRATIONS_DIR=/opt/buybox/app/migrations
Environment=AUTO_MIGRATE=1
Environment=PORT=__PORT__
ExecStart=/opt/buybox/node/bin/node /opt/buybox/app/boot.mjs
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/buybox/buybox.out.log
StandardError=append:/var/log/buybox/buybox.err.log
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/buybox /var/log/buybox
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Why this is a smaller, not larger, problem than WinSW: §5 step 7 spent most of its reasoning on
*why WinSW instead of `node-windows`/NSSM* — none of that choice exists on Linux, because systemd
is already present on every supported Ubuntu release and is the one process supervisor, not a
choice among three. There is no `refresh`-vs-`start` command-set mismatch to trip over (§5.6):
`systemctl daemon-reload` always re-reads the unit file, on every systemd version Ubuntu has
shipped, so the class of bug that caused D-16 cannot recur in the same shape. The `Restart=`
directive is systemd's equivalent of WinSW's `onfailure`.

**Log rotation** is `logrotate`, not WinSW's `roll-by-size-time`: a dropped-in
`/etc/logrotate.d/buybox` rotating `/var/log/buybox/*.log` daily or at 10 MB, keeping 30,
reproduces §5 step 7's table exactly. `app_events` (the database-backed record) is unaffected —
`PruneHistory` (doc 05 §10) already runs from the application, not the OS.

The hardening lines (`NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths`, `ProtectHome`)
have no Windows analogue in this document and are not required for parity — they are added
because systemd makes them nearly free and CLAUDE.md's "no credential in source" posture implies
the same caution at the OS layer: a compromised BuyBox process should not be able to write outside
`/var/lib/buybox` and `/var/log/buybox`, full stop.

### 11.5 Script-by-script mapping

Every PowerShell script under `installer/` gets a named Linux equivalent. None is a
line-for-line port — each is re-derived from what its Windows counterpart is actually *for*
(stated in the table below), because the failure modes differ by platform (there is no
"file in use" on Linux the way Windows locks a running executable, for instance).

| Windows script | What it's actually for (§ above) | Linux equivalent |
|---|---|---|
| `preflight.ps1` | §5 step 1 — refuse before touching anything | `installer/linux/preflight.sh`: Ubuntu version (22.04+ LTS, matching the Node 22 / Playwright support matrix), `dpkg --print-architecture` is amd64 or arm64, ~1.5 GB free on `/opt` and `/var`, running as root |
| `configure-env.ps1` | §5 step 4 — write/preserve `.env.local` | `installer/linux/configure-env.sh`, identical preserve-on-upgrade rule (§5 step 4), same key table (§4.3) with Linux paths |
| `install-service.ps1` | §5 step 7 — register and (re)start the service | `installer/linux/install-service.sh`: renders `buybox.service.template`, `systemctl daemon-reload`, `systemctl enable --now buybox` |
| `stop-service.ps1` | §5 step 3 — stop before files are replaced, wait for exit | `systemctl stop buybox` blocks until the unit is fully stopped by design (unlike SCM's async stop that Windows had to poll for) — the script becomes a thin wrapper that also waits out `TimeoutStopSec` |
| `uninstall-service.ps1` | §10 D-6 | `installer/linux/uninstall-service.sh`: `systemctl disable --now buybox`, remove the unit file — but on Ubuntu this step mostly **disappears into `postrm`** (§11.6) |
| `verify-health.ps1` | §5 step 8 — poll `/api/health`, require `status: ok` | `installer/linux/verify-health.sh`, same 90 s poll loop and same "anything less fails the install" rule, `curl` instead of `Invoke-WebRequest` |
| `install-monitoring.ps1` | §5 step 8b — optional Alloy install, never fails the install | `installer/linux/install-monitoring.sh` using Grafana's `.deb` repo or the `alloy-linux-amd64.zip` binary (vendor the binary, per §8's reasoning for the Windows one — a build should not depend on Grafana's servers being up); same "exit 0 on every path" rule from doc 16 §5 |
| `boot.mjs` | §4.1 | **unchanged** (§11.3) |
| `build-package.ps1` | §8, the whole pipeline | `installer/linux/build-package.sh` (§11.7) |
| — (no Windows equivalent) | — | `postinst`/`postrm`/`prerm` (§11.6) — Debian's own script hooks replace the Inno `CurStepChanged` sequencing problem from §5.6 outright, see below |

Nothing here is "ASCII-only" in the way §8.4 required (that was specifically PowerShell 5.1
misreading a BOM-less UTF-8 file as ANSI) — bash scripts are read as UTF-8 by default on Ubuntu,
so the Turkish messages in the Linux scripts can use proper diacritics. The ASCII constraint does
**not** carry over; it was a Windows PowerShell defect, not a general packaging lesson, and
inventing a parallel constraint here would be imitating a symptom instead of the underlying rule
(CLAUDE.md's instruction not to resolve ambiguity by imitation applies to migrating our own
scripts too).

### 11.6 Packaging as a `.deb`, and why `postinst`/`postrm` genuinely simplify §5.6's problem

The package is `buybox_<version>_amd64.deb` (and `arm64`, if a customer runs one), built with
`dpkg-deb` from a staged tree, not a hand-rolled shell installer.

**Dependencies go in `Depends:` instead of a script we wrote and must maintain.** Playwright's
Chromium needs `libnss3`, `libatk-bridge2.0-0`, `libgbm1`, `libasound2`, `libxkbcommon0`, and the
rest of the list `npx playwright install-deps --dry-run` prints for the target Ubuntu version —
that command's own output, captured during the build in §11.7, is copy-pasted into `debian/control`
rather than retyped, because Playwright's own required-package list is versioned with Chromium and
should not be hand-maintained twice. **apt** then resolves and installs them, which is exactly
§3's "detection means the install can fail" argument turned around: on Windows there was nothing
to delegate to, so everything ships inside the package; on Ubuntu there is a dependency resolver
already on every machine, so delegating to it is the more reliable choice, not a departure from
§3's reasoning. Node itself is still **bundled**, not a `Depends:` on `nodejs` — §3's argument
against relying on a version already on the customer's PATH applies identically on Linux (a
distro-packaged Node is frequently the wrong major version).

**`postinst` performs §5 steps 4–8** (environment, optional monitoring is 8b, service
registration, health verification) using the scripts in §11.5, run in the same order for the same
reasons. **`preinst`** performs §5 step 3 (stop the running service, if any, before the package
manager overwrites `/opt/buybox`) and creates the `buybox` user idempotently.

This is where Debian packaging genuinely removes a class of bug rather than merely relocating it.
§5.6's root cause was that an Inno `[Run]` entry silently discards a step's exit code, so a
script could throw and the installer would still report success. **`dpkg` has no equivalent
failure mode**: a `postinst` that exits non-zero fails the package installation outright and
`apt`/`dpkg` reports it as failed, with no separate "did anyone check the exit code" step to get
wrong. The fix that took a dedicated incident, a rule, and a table of scripts moved off `[Run]`
on Windows (§5.6) is the *default* behaviour of `dpkg` on Ubuntu. That does not mean the health
check is now optional — `postinst` must still call `verify-health.sh` and `exit 1` if it fails,
exactly as `install-service.ps1`/`verify-health.ps1` do today — it means the platform no longer
lets that failure go unreported by construction.

**`postrm`** keeps `/var/lib/buybox` and `/var/log/buybox` on `remove`, and deletes them only on
`purge` (`apt purge buybox`) — the direct equivalent of D-6's "leaves ProgramData\BuyBox unless
the operator ticks the box; the default is to keep it". Debian's remove/purge distinction gives
this for free where Inno needed an explicit checkbox and a script to honour it.

**Defender exclusion (§5 step 6) has no Ubuntu equivalent and is dropped, not substituted.**
Server-oriented Ubuntu installs do not run a signature-scanning AV by default the way Windows
does; if a customer has installed one (ClamAV, or a commercial EDR), excluding `/var/lib/buybox`
from it is a decision for that customer's own security tooling, not something this package should
configure on their behalf. This is a genuine scope reduction, not an oversight — record it as
such rather than silently forgetting §5 step 6 existed.

### 11.7 Build pipeline

Parallel to §8, on an `ubuntu-latest` (or a pinned `ubuntu-22.04`, to match the oldest supported
target rather than whatever GitHub moves `latest` to) GitHub Actions runner — a **new** workflow,
`.github/workflows/release-linux.yml`, alongside the existing `release-windows.yml`, not a
replacement for it:

1. `npm ci` — on the Linux runner, so `better-sqlite3` is built for the **Linux** Node ABI. §3.1's
   constraint is symmetric: a `node_modules` built on Windows next to a Linux `node` binary fails
   exactly the same way, just on the other platform. This is the one CI step whose entire reason
   for existing is platform-specific, and it is easy to get backwards by copying the Windows job —
   watch for that in review.
2. `npm test` and `npm run typecheck` — identical to §8 step 2; these are platform-independent
   already, but running them again on Linux (rather than trusting the Windows run) is what catches
   a Linux-only regression before it reaches packaging, and it's nearly free on a matrix build.
3. `npm run build` with `output: 'standalone'` — identical to §8 step 3.
4. Assemble `app/`: identical purge-and-assert rule from §8.1 (`.env*`, `*.db`, `*.db-wal`,
   `*.db-shm`, `*.sqlite`, `*.sqlite3`, `secrets.enc.json`, `data/`) — this defends against the
   same developer-state leak on either platform and needs no platform conditional.
5. Copy the Linux Node 22 runtime into `node/`. CI asserts the major version matches the one
   `npm ci` ran under, same as §8 step 5.
6. `PLAYWRIGHT_BROWSERS_PATH=<staging>/chromium npx playwright install chromium --with-deps
   --dry-run` first, to capture the apt package list for `debian/control` (§11.6), then without
   `--dry-run` to actually stage the browser.
7. Run `debian/postinst`'s steps 4–8 against a throwaway data directory inside the CI runner —
   the direct Linux equivalent of §8.2's "boot the assembled package the way the service boots
   it" — requiring `/api/health` to report `status: ok` and `/` not to return 5xx before the `.deb`
   is even built. §8.2's two specific failures (Playwright's `browsers.json` not traced;
   migration SQL not traced because `@buybox/db` is `transpilePackages`d) are Next/Node build
   artefacts, not Windows artefacts — they reproduce identically on Linux if the same copy-and-
   assert steps are skipped, so this check is not optional here either.
8. Build the `.deb` with `dpkg-deb --build --root-owner-group`.
9. Sign — see §11.10.

### 11.7a A fourth §8.2-shaped failure, found building this for real — relative symlinks

Doc 14 §8.2 names two things Next's file tracing gets wrong (`browsers.json`, migration SQL) and
calls the lesson "a package is a different artefact from the repository it was built from, and
the only reliable way to know it works is to run it." The first real Linux build (2026-09-08)
found a third, and it is the first one that is Linux-specific in its *symptom* while still being
platform-independent in its *cause* — worth separating those two clearly, because the instinct
to write it off as "a Linux thing" would have been wrong.

Next's standalone output gives native modules (`better-sqlite3` among them) a **relative
symlink** under `.next/node_modules/`, computed for their original nested depth in a workspace
build — `apps/web/.next/node_modules/better-sqlite3-<hash>` pointing `../../../../node_modules/
better-sqlite3` (four levels up) at the real copy Next places at the standalone root. §8's step 3
(`build-package.ps1`/`build-package.sh` step 3) flattens `apps/web/*` up into `app/`, exactly as
the Windows build always has, to keep the service's command line from having to know the
repository's shape. That flatten shortens the symlink's own location by exactly two path
components — but the symlink's *stored target text* does not move with it, so after the flatten
every one of these pointed two levels too far up and dangled.

**This has always been true of the Windows build too — it just never manifested there.**
`Copy-Item` does not preserve an NTFS reparse point the way `cp -a` preserves a POSIX symlink;
the exact mechanism was not investigated further because the outcome (no dangling link) made it
moot on that platform. The bug is in the flatten step's assumption that nothing inside the moved
tree references its own location by a relative path — an assumption that was always false, and
happened to go unexercised on Windows rather than being platform-correct there.

The fix (`installer/linux/build-package.sh`) is general, not a `better-sqlite3` special case:
after the flatten, every symlink under the assembled `app/` whose target starts with the
pre-flatten depth (`../../../../`) has exactly two levels removed, and the result is verified to
resolve — a build fails loudly if a native module added later produces a symlink this rule
doesn't fix, rather than shipping a silently broken one the way the first run did.

Whether the equivalent fix belongs in `build-package.ps1` too is worth checking rather than
assuming "it works today" means "it is correct" — the Windows build not hitting this may be
independent of whether some future NTFS/Node/npm combination starts preserving symlinks there
as well.

### 11.8 Chromium's shared-library dependencies

Recorded here rather than left implicit, because §11.6 depends on capturing this list correctly
and it is worth stating what "correctly" means: **the authoritative source is
`npx playwright install-deps --dry-run` run during the build (§11.7 step 6) against the exact
Playwright version this project has pinned, on the exact Ubuntu version being targeted** — not a
list copied from Playwright's documentation or from this paragraph, both of which can drift from
the pinned version. The known members of that list as of Playwright's current Chromium build
include `libnss3`, `libnspr4`, `libatk1.0-0`, `libatk-bridge2.0-0`, `libcups2`, `libdrm2`,
`libgbm1`, `libxkbcommon0`, `libasound2`, `libatspi2.0-0`, `libxcomposite1`, `libxdamage1`,
`libxfixes3`, `libxrandr2`; this is illustrative, not the list to paste into `debian/control` —
step 6 of §11.7 generates the real one on every build so it cannot go stale the way a hand-
maintained list would.

### 11.9 Loopback binding and firewall — no functional change, one UI-text change

§4.4's requirement — `HOSTNAME=127.0.0.1`, no rule opening the port to the LAN — is enforced in
`apps/web`'s own listener configuration, not by a Windows Firewall rule the installer wrote. Search
of the installer scripts confirms `installer/*.ps1` never touches Windows Firewall today; the
binding alone is what does the work. That means **§4.4 carries over with zero packaging change**:
the Linux service binds `127.0.0.1` the same way, and `ufw`/`iptables` are not touched by
`postinst`, matching D-7's requirement ("not reachable from a second machine on the same LAN")
identically on both platforms.

**Still true after 2026-09-27, with one addition.** The `.deb` still opens no port. Network access
is a separate, deliberate step on a server: the §13 reverse proxy and firewall. It is not part of
the package, so installing the package can never open a port.

The one change: the absolute-path example text in
`apps/web/src/app/api/setup/database/migrate/route.ts` and
`apps/web/src/app/setup/steps/step1-database.tsx` (`C:\ProgramData\BuyBox\data\app.db`,
`C:\BuyBox\app.db`) should show a platform-appropriate example. The validation itself is already
platform-neutral (it checks for an absolute path via `path.isAbsolute`-equivalent logic, not a
Windows-shaped regex — confirm this when making the change rather than assuming it); only the
*example string* in the Turkish error message is Windows-flavoured. The cheapest correct fix is
to pick the example from `process.platform` at render time (`/var/lib/buybox/app.db` on Linux),
not to fork the validator.

### 11.10 Code signing / package integrity

There is no Authenticode-equivalent SmartScreen/Smart App Control problem on Ubuntu — §9's
concerns are Windows-specific and do not recur in the same shape. The Linux equivalent of "prove
what the customer downloaded is what we built" is:

- Sign the `.deb` with `dpkg-sig` or, preferably, publish it behind a signed **apt repository**
  (a `Release` file signed with a GPG key the customer's `apt` trusts once, via
  `apt-key`/`signed-by`) — this is the closer analogue to a code-signing certificate because it
  lets `apt upgrade` verify every future release automatically, which manual SHA-256 checking
  (§9's fallback on Windows) does not give you.
- Until a signing key and a hosted repository exist, ship the same fallback §9 uses today:
  publish the SHA-256 of each release so it can be verified by hand, and say so in the Linux
  install note.
- This is lower urgency than §9 on Windows: there is no Smart App Control-shaped hard block on
  Ubuntu that can make an unsigned package simply refuse to run. It should still be done before
  selling to a customer with a managed Ubuntu fleet, for the same trust reasons, just without §9's
  "cannot be worked around" urgency.

### 11.11 Docker Compose — a third option, not the primary path here either

`packages/db/docker-compose.test.yml` already exists as a starting shape for a technically
staffed customer who would rather run a container than a `.deb`. It remains explicitly
**secondary** on Ubuntu for the same reason it was ruled out as primary on Windows (original text,
kept): it is a second thing to operate (image builds, volume management, container restart
policy) in exchange for nothing the `.deb` doesn't already give a single-machine install. Revisit
only if a specific customer's environment (e.g., an existing Kubernetes/container platform) makes
the `.deb` the wrong fit for them specifically — not as a default alternative to build alongside
the package.

### 11.12 Definition of done

Mirrors §10, substituted for the platform. Each existing Windows check has a named Ubuntu
counterpart so neither list can silently drift out of parity with the other; a few (D-2 through
D-5, D-10 through D-13) are stated once in §10 because their logic lives in `apps/worker` and is
platform-independent — they are **not** re-tested here, they are **re-run** here, on the Linux
build, to catch a platform-specific regression in code that is supposed to have none.

| # | Check |
|---|---|
| D-U1 | On a clean Ubuntu 22.04 LTS container/VM with no Node, no Chromium and no internet after the `.deb` is copied in, `apt install ./buybox_<version>_amd64.deb` completes, prints how to read the setup token, and the browser (or `curl`) reaches `/bootstrap` |
| D-U2 | `SECRET_STORE_KEY` differs between two installs made from the same package (= D-2, re-run) |
| D-U3 | Rebooting the machine brings the service back with no login (`systemctl is-enabled buybox` is `enabled`) |
| D-U4 | `apt install` over an existing install preserves `SECRET_STORE_KEY`, `app.db`, `secrets.enc.json` and the licence, and applies pending migrations (= D-4, re-run) |
| D-U5 | `apt remove buybox` stops the service and deletes `/opt/buybox`, leaving `/var/lib/buybox` and `/var/log/buybox`; `apt purge buybox` deletes those too (= D-6, Debian-shaped) |
| D-U6 | The port is not reachable from a second machine on the same LAN (= D-7, re-run — confirms §11.9's "zero packaging change" claim rather than assuming it) |
| D-U7 | Trendyol competitor collection succeeds on the installed container, proving the bundled Chromium finds its shared libraries via `Depends:` and `PLAYWRIGHT_BROWSERS_PATH` (= D-8, and the sharpest test of §11.6/§11.8) |
| D-U8 | An ABI-mismatched package (Windows-built `better-sqlite3` staged into a Linux package by mistake) fails in CI, not on a customer machine (= D-9, and the specific regression §11.7 step 1 warns about) |
| D-U9 | A `postinst` failure (deliberately broken health check) leaves `dpkg`/`apt` reporting the package as failed, with the service left in whatever state `preinst`/`postinst` reached — never a silently "successful" install over a broken service, proving §11.6's claim that this class of bug cannot recur the way D-16 did |
| D-U10 | `journalctl -u buybox` and `/var/log/buybox/buybox.err.log` both show the same crash for a deliberately induced uncaught exception, proving `registerProcessErrorHandlers` (§5 step 7) needs no Linux-specific change |

### 11.13 What to build, in order

1. ✅ **Written 2026-09-08, not yet run.** `installer/linux/preflight.sh`, `configure-env.sh`,
   `install-service.sh`, `stop-service.sh`, `verify-health.sh`, `uninstall-service.sh`,
   `buybox.service.template`, `buybox.logrotate` (§11.4, §11.5) — syntax-checked
   (`bash -n`) but not yet executed against a real machine. These can be tested in a container
   **before** `.deb` packaging is exercised, by running them by hand the way
   `install-from-staging.ps1` lets the Windows scripts be tested without a real installer (§9);
   see `installer/linux/README.md` for the exact sequence.
2. ✅ **Written 2026-09-08, not yet run.** `installer/linux/debian/control.template`,
   `preinst`, `postinst`, `prerm`, `postrm`, `conffiles` (§11.6), and
   `monitoring/alloy/config.linux.alloy` (doc 16 §9-10 — this file predates this section and was
   found, not written, during implementation; its journald/Docker log-source ambiguity was
   settled in favour of file-based capture to match §11.4's systemd unit, see that file's header)
   plus `installer/linux/install-monitoring.sh` (§11.5) wiring the scripts from step 1 together
   — including the remove/purge split (D-U5) and the never-fails-the-install rule for monitoring
   (§5 step 8b's exemption, reproduced).
3. ✅ **Written 2026-09-08, not yet run.** `installer/linux/build-package.sh` — assembles the
   staging tree, generates the `Depends:` list from `playwright install-deps --dry-run` rather
   than a hand-maintained one (§11.8), runs the §8.2-equivalent smoke test, and calls
   `dpkg-deb --build`. **Missing before it can produce a real package:**
   `.github/workflows/release-linux.yml` (an `ubuntu-22.04` runner calling this script) and
   `installer/linux/vendor/alloy-linux-<arch>` (the vendored Alloy binary — optional, same as
   the Windows build).
4. **Not started.** A signed apt repository or `dpkg-sig` signing (§11.10) — deferred the same
   way §9 was on Windows, lower urgency here because there is no Smart App Control-shaped hard
   block on Ubuntu.
5. **Not started — the next action.** Run §11.12 (D-U1 … D-U10) top to bottom in a clean Ubuntu
   22.04+ container: the scripts from steps 1–2 run by hand first (proving the pieces before
   proving the packaging), then the full `.deb` once a build has been produced by hand
   (`installer/linux/build-package.sh`, no CI required yet).

Nothing in steps 1–3 has executed against a real Linux machine yet — they are written to the
same reasoning as their Windows counterparts and syntax-checked, not proven. Step 5 is where
that changes.

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

## 13. Server (VPS) deployment

Status: specification, added 2026-09-27. Not built. It depends on Phase 12 (sign-in,
doc 18) and on §11.13 step 5 (the `.deb` proven on a real Ubuntu machine). Neither exists yet.

The product owner is moving the application from a Windows machine in a data centre to a VPS,
used from browsers on other computers (doc 18 §1). **Trendyol collection was measured to work
from the VPS on 2026-09-27**, so the Playwright exception (api-references §1.6) needs no change
for this move.

### 13.1 Shape

```
internet ──443──▶ Caddy (TLS, HSTS) ──▶ 127.0.0.1:3000  BuyBox service (§11 .deb)
         ──80───▶ Caddy (→ 443, ACME)                    ├─ app.db (SQLite)
         ──22───▶ sshd (keys only)                       ├─ secrets.enc.json
                                                         └─ Alloy ──push──▶ Grafana Cloud (doc 16)
```

- **Operating system: Ubuntu 22.04 or 24.04 LTS, using the §11 `.deb`.** A Windows VPS would
  also work with the existing installer plus IIS or Caddy for Windows. It was not chosen because
  §11 already describes the Linux service, and a Linux VPS is the common, cheaper product.
- **Database: SQLite stays the default.** A handful of users adds almost no write load compared
  with the jobs. PostgreSQL remains available through the setup wizard (doc 10 §7) if the product
  owner wants the database on managed hosting.
- **Reverse proxy: Caddy.** It obtains and renews the TLS certificate from Let's Encrypt itself,
  with one short configuration file and no cron job. nginx with certbot is an acceptable
  substitute; the requirements in §13.2 are what matter, not the product.
- **A domain name is required** (for example `fiyat.<firma>.com.tr`), with an A record pointing
  at the VPS. Let's Encrypt does not issue a certificate for a bare IP address. This is an open
  item for the product owner (doc 18 §12).

### 13.2 Reverse proxy and network mode

`/etc/caddy/Caddyfile`:

```
fiyat.example.com.tr {
    # Machine-local endpoints: the installer, Alloy and the break-glass read these on
    # 127.0.0.1:3000 directly. From outside they do not exist.
    @internal path /api/health /api/health/* /api/metrics /api/metrics/*
    respond @internal 404

    header Strict-Transport-Security "max-age=31536000"
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Caddy sets `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host` itself. If the
office has a fixed address, an allow-list can go in the same site block (`@office
remote_ip …`). It is optional; sign-in does not depend on it.

Ready-to-edit copies of both files are in `installer/linux/network/` (`Caddyfile.example`, and
`buybox-network.conf.example` for the drop-in below).

Two service environment values switch the application into **network mode**. They are set in the
systemd unit's drop-in (`systemctl edit buybox`), not in `.env.local`, for the reason §4.3 gives
about deployment facts:

| Key | Value | Effect |
|---|---|---|
| `PUBLIC_ORIGIN` | `https://fiyat.example.com.tr` | Network mode: `__Host-` Secure cookie, second factor required, and the Origin check compares against this value (doc 18 §4, §5.1) |
| `TRUST_PROXY` | `1` | Client address taken from the last `X-Forwarded-For` entry (doc 18 §3.3) |

`HOSTNAME` stays `127.0.0.1`. **The service refuses to boot when `PUBLIC_ORIGIN` is set and
either `PUBLIC_ORIGIN` is not `https://` or `HOSTNAME` is not a loopback address** (R-DEP-16).
A half-configured network mode fails at startup, not in production.

### 13.3 Server hardening

Only the minimum that the application's own security depends on. Doc 18 §2 makes shell access
the root of trust, so this is part of the application's security, not optional extra.

- **Firewall (`ufw`):** allow 22, 80 and 443; deny everything else inbound. If the office has a
  fixed address, restrict 22 to it. Port 3000 is never opened. The service is on loopback anyway,
  and this is the second lock.
- **SSH:**
  - `PasswordAuthentication no` and `PermitRootLogin no`.
  - Sign in with keys, as a named sudo user.
  - `fail2ban` or the provider's firewall is optional once passwords are off.
- **Updates:** `unattended-upgrades` for security updates. The application itself is upgraded by
  hand, as before (§12).
- **Time:** the VPS clock is synchronised (`systemd-timesyncd`, on by default).
  - TOTP codes are time-based (doc 18 §5.2) and the licence rejects a clock wound back
    (doc 13 §4.3), so drift breaks sign-in first.
  - The host time zone may stay UTC. D-S7 checks that nothing depends on it.
- **Backups off the machine:**
  - Losing the VPS must not lose the data. A nightly job copies an online SQLite backup
    (`sqlite3 app.db ".backup …"`) and `secrets.enc.json` to storage **outside the VPS** (the
    provider's backup product or object storage).
  - `SECRET_STORE_KEY` is kept **separately** from those copies (a password manager), because a
    backup holding both the encrypted file and its key is an unencrypted backup.
  - This is new with the server. The Windows install relied on the machine it ran on (§5.2b).

### 13.4 Moving the live install from Windows to the VPS

The live install carries real sales history and real marketplace credentials. **Two instances
able to submit prices at once is the one outcome this procedure exists to prevent**
(R-DEP-17). Both would reprice the same listings against each other and spend the same daily
update budget twice.

1. **Prepare the VPS without data:** install the `.deb`, Caddy, the firewall and the network-mode
   values (§13.2–§13.3). Confirm `https://<domain>/bootstrap` answers. **Do not complete
   bootstrap**; the migrated database brings its own state.
2. **On Windows: pause, then stop.**
   - Engage the system pause from the UI, so the database leaves in a paused state.
   - Stop the service and **disable** it (`sc config BuyBoxApp start= disabled`), so a reboot
     cannot bring it back.
3. **Stop the VPS service** (`systemctl stop buybox`), so it is not holding its empty
   `app.db` open while that file is replaced. Then **copy, over SSH (`scp`), never by e-mail
   or shared drive:**
   - `C:\ProgramData\BuyBox\app.db` to `/var/lib/buybox/app.db`;
   - `secrets.enc.json` to `/var/lib/buybox/`;
   - the `SECRET_STORE_KEY` value from the Windows `.env.local`, into the VPS `.env.local`.
     **Only that value.** Copying the whole file would bring a Windows `DATABASE_URL` with it.
     Without the matching key, the copied secret store cannot be read, and the marketplace
     credentials have to be entered again.

   Then `chown buybox:buybox` and `chmod 600` the copied files.
4. **First boot on the VPS:**
   - `AUTO_MIGRATE` applies Phase 12's migrations (and backs up first, §5.2b). The database has no
     users, so the install enters bootstrap mode (doc 18 §8.1).
   - Create the first Yönetici with the token from `/var/lib/buybox/bootstrap-token.txt`, and
     enrol a second factor.
5. **Licence:** the install fingerprint changes with the machine, which shows a warning banner
   and does not stop anything (doc 13 §5, R-LIC-7). Issue a licence for the new install when
   convenient.
6. **Verify while still paused:**
   - `/api/health` is green on `127.0.0.1`;
   - both marketplaces' _Bağlantıyı Test Et_ pass (the credentials survived the move);
   - one Trendyol collection runs (D-S5);
   - the listings and history look like they did on Windows.
7. **Release the pause.** Only now can the VPS submit prices.
8. **Keep the Windows install stopped and disabled, not uninstalled**, for a week as a rollback.
   Rolling back is this procedure in reverse, including the pause on the side being left. Delete
   the Windows data only after that week, because it holds live credentials.

### 13.5 Definition of done

| # | Check |
|---|---|
| D-S1 | `https://<domain>` serves `/login` with a valid certificate; `http://` redirects to it; the response carries HSTS |
| D-S2 | From outside the VPS, `/api/health` and `/api/metrics` answer 404, and port 3000 does not answer at all. On the VPS, `curl 127.0.0.1:3000/api/health` is green and Alloy's metrics reach Grafana |
| D-S3 | Starting the service with `PUBLIC_ORIGIN=http://…`, or with `HOSTNAME=0.0.0.0` in network mode, fails at boot with a named reason (R-DEP-16) |
| D-S4 | A user without a second factor cannot reach any screen but enrolment; a viewer's price-edit request is refused with 403 (doc 18 R-AUTH-5, R-AUTH-10) |
| D-S5 | Trendyol competitor collection succeeds on the VPS (= D-U7, and re-confirms the 2026-09-27 measurement from the installed package, not a development checkout) |
| D-S6 | The nightly off-machine backup exists, and restoring it on a scratch VM with the separately kept `SECRET_STORE_KEY` produces a working install |
| D-S7 | With the host time zone set to UTC, the daily update budget rolls over at midnight Europe/Istanbul, and dates on screen are Turkish local time |
| D-S8 | During the §13.4 move, there is no moment at which both installs have the pause released (R-DEP-17) |

### 13.6 Installing the sign-in release on an existing install

Written 2026-09-27 for the live Windows install, which gets this release **before** it moves to
the VPS (§13.4). It is the ordinary upgrade of §5; this section is only what is new about it.
Rehearsed on a copy of a real database: the migration (22 → 25) kept every row, and the first
administrator, sign-in, listings, licence and marketplace settings all worked.

1. **Back up** `C:\ProgramData\BuyBox\app.db` and `secrets.enc.json` by hand, in addition to the
   automatic pre-migration backup (§5.2b).
2. **Run the installer.** The service restarts, applies migration 0024 (new tables only; nothing
   existing changes), finds no administrator, and writes a setup token. **The installer's finish
   page shows the token**, and the file is `C:\ProgramData\BuyBox\bootstrap-token.txt`.
3. **Open BuyBox.** It opens on _İlk yönetici_. Enter the token, then create your own account:
   a username, your name, and a password of at least 10 characters.
4. **Licence and settings are as they were.** Nothing in them changes with this release. Every
   change from now on is recorded against the person who made it; older records show
   _Operatör (eski kayıt)_.
5. **Set up the authenticator app** from _Hesabım_ (the name in the header) → _Doğrulama
   uygulaması → Kur_, and save the ten recovery codes somewhere other than the phone.
   - On this loopback install a second factor is optional unless _Ayarlar → Kullanıcılar →
     İki adımlı doğrulama → Herkes için zorunlu_ is ticked.
   - On the VPS (§13) it is always required.
6. **Create the other users** in _Ayarlar → Kullanıcılar_ with a role and a temporary password
   that you pass on yourself. Each changes it at first sign-in.
7. **Keep the install on loopback** until the move of §13.4. Nothing about this release opens a
   port.

If the administrator's password or phone is lost, use the break-glass command (doc 18 §8.3). It
ships bundled with the app as `app/admin.mjs` and reads `.env.local` from the directory it is run
in, which must be the data directory:

```
Windows (PowerShell, as Administrator):
  cd C:\ProgramData\BuyBox
  & "C:\Program Files\BuyBox\node\node.exe" "C:\Program Files\BuyBox\app\admin.mjs" reset-password <user>

Linux:
  cd /var/lib/buybox && sudo -u buybox /opt/buybox/node/bin/node /opt/buybox/app/admin.mjs reset-password <user>
```

The commands are `list-users`, `create-admin <user>`, `reset-password <user>`, `reset-mfa <user>`
and `unlock <user>`. In a development checkout it is `npm run admin -- <command>`.
