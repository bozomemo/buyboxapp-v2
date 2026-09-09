# Linux (Ubuntu) installer — build and test

Doc 14 section 11 is the specification this directory implements. Nothing here has been run in
anger yet — this is the "build it" half of section 11.13; the container run is the "prove it"
half, done separately from a clean Ubuntu image.

## Layout

| Path | Role (doc 14 section) |
|---|---|
| `preflight.sh` | 11.5 — refuse before touching anything |
| `configure-env.sh` | 11.5 — write/preserve `.env.local` |
| `install-service.sh` | 11.4, 11.5 — creates the `buybox` user, renders `buybox.service.template`, registers and starts the systemd unit |
| `stop-service.sh` | 11.5 — stop before files are replaced |
| `verify-health.sh` | 11.5 — poll `/api/health`, require `status: ok` |
| `install-monitoring.sh` | 11.5 — optional Grafana Alloy install, never fails |
| `uninstall-service.sh` | 11.5 — standalone equivalent of the `debian/prerm` service teardown, for a non-`.deb` uninstall |
| `buybox.service.template` | 11.4 — the systemd unit, tokens filled in by `install-service.sh` |
| `buybox.logrotate` | 11.4 — shipped as `/etc/logrotate.d/buybox`, see `debian/conffiles` |
| *(none — see below)* | 11.3 — `build-package.sh` copies `installer/boot.mjs` (the Windows script's own file) unchanged; no Linux-specific version exists or is needed |
| `build-package.sh` | 11.7 — assembles the staging tree and builds the `.deb` |
| `debian/` | 11.6 — `control.template`, `preinst`, `postinst`, `prerm`, `postrm`, `conffiles` |
| `vendor/alloy-linux-<arch>` | not present yet — see below |

## What is NOT here yet

- **`vendor/alloy-linux-<arch>`** — the vendored Grafana Alloy Linux binary. `build-package.sh`
  warns and continues without it (doc 14 section 3, "optional" bundling, same as the Windows
  vendored installer). Fetch and pin one before testing doc 16's monitoring path end to end.
- **`.github/workflows/release-linux.yml`** — the CI job that runs `build-package.sh` on an
  `ubuntu-22.04` runner. Not yet written; run the script by hand for now (below).
- A signed apt repository (doc 14 section 11.10) — packages build unsigned today, same interim
  state as the Windows build before a certificate exists (section 9).

## Testing by hand, without building a `.deb` first

Mirrors what `installer/install-from-staging.ps1` does on Windows — proves the scripts before
proving the packaging. Run as root inside a disposable container or VM, never on a machine that
matters:

```bash
# From the repository root, after `npm ci && npm run build` has produced
# apps/web/.next/standalone (or after running build-package.sh --skip-compile,
# which leaves a ready-made staging/opt/buybox tree to copy from instead).

install_dir=/opt/buybox
data_dir=/var/lib/buybox
port=3000
version=0.0.0-dev

installer/linux/preflight.sh
installer/linux/configure-env.sh --data-dir "$data_dir" --install-dir "$install_dir"
installer/linux/install-service.sh --install-dir "$install_dir" --data-dir "$data_dir" \
  --port "$port" --version "$version"
installer/linux/verify-health.sh --port "$port" --data-dir "$data_dir"
```

Then check the doc 14 section 11.12 table (D-U1 … D-U10) top to bottom.

## Building and testing the `.deb`

```bash
installer/linux/build-package.sh                 # full build: tests, typecheck, smoke test
installer/linux/build-package.sh --skip-tests     # faster local iteration
```

produces `installer/linux/out/buybox_<version>_<arch>.deb`. Install it in a clean Ubuntu
22.04+ container:

```bash
apt-get update
apt-get install -y ./buybox_<version>_<arch>.deb
curl -s http://127.0.0.1:3000/api/health
```

An `apt install` failure at `postinst` (deliberately broken health check, D-U9) should leave
`dpkg -l buybox` reporting the package as failed/half-configured — that is the property doc 14
section 11.6 claims dpkg gives for free, and it is worth deliberately breaking something once to
watch happen before trusting it.
