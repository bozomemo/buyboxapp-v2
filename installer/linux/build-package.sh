#!/usr/bin/env bash
#
# Doc 14 section 8 / 11.7 -- assemble the staging tree and build the .deb. Linux sibling of
# installer/build-package.ps1; read that file's comments for the reasoning behind each step,
# this one's comments cover only what differs on this platform.
#
# Must run on Linux, for the same reason the Windows script must run on Windows: `better-sqlite3`
# is compiled against a specific Node ABI, and pairing a Windows-built node_modules with a Linux
# node binary (or the reverse) fails at the customer's first request rather than in CI
# (doc 14 section 3.1 / 11.7 step 1). Step 5 below asserts the pairing instead of trusting it.
#
# Usage (from the repository root):
#   installer/linux/build-package.sh
#   installer/linux/build-package.sh --skip-tests            # local iteration only
#   installer/linux/build-package.sh --skip-compile           # stage only, do not build the .deb
#   installer/linux/build-package.sh --skip-smoke-test
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
staging="$script_dir/staging"
out_dir="$script_dir/out"
web_dir="$repo_root/apps/web"
arch="$(dpkg --print-architecture 2>/dev/null || echo amd64)"

skip_tests=0 skip_compile=0 skip_smoke_test=0
for arg in "$@"; do
  case "$arg" in
    --skip-tests) skip_tests=1 ;;
    --skip-compile) skip_compile=1 ;;
    --skip-smoke-test) skip_smoke_test=1 ;;
    *) echo "Bilinmeyen secenek: $arg" >&2; exit 2 ;;
  esac
done

version="$(node -e "process.stdout.write(require('$repo_root/package.json').version)")"
echo "== BuyBox installer package $version ($arch) =="

# --- 1. Clean staging ---------------------------------------------------------------------------
rm -rf "$staging"
mkdir -p "$staging/opt/buybox" "$staging/etc/logrotate.d" "$staging/DEBIAN" "$out_dir"

# --- 2. Build (and, unless skipped, prove the build is green) --------------------------------------
pushd "$repo_root" >/dev/null
if [ "$skip_tests" -eq 0 ]; then
  echo "-- typecheck"; npm run typecheck
  echo "-- test";      npm test
fi
echo "-- build"
npm run build
popd >/dev/null

# --- 3. Assemble app/ from the standalone output ----------------------------------------------------
standalone="$web_dir/.next/standalone"
[ -d "$standalone" ] || { echo "Standalone output missing at $standalone. Is output: 'standalone' still set in apps/web/next.config.ts?" >&2; exit 1; }

app_dir="$staging/opt/buybox/app"
cp -a "$standalone" "$app_dir"

# In a workspace build the standalone tree mirrors the monorepo (apps/web/server.js). Flatten it
# so the service's command line does not have to know the repository's shape.
if [ -f "$app_dir/apps/web/server.js" ]; then
  nested="$app_dir/apps/web"
  find "$nested" -mindepth 1 -maxdepth 1 -exec mv -t "$app_dir" {} +
  rm -rf "$app_dir/apps"
fi
[ -f "$app_dir/server.js" ] || { echo "server.js not found in the assembled app directory." >&2; exit 1; }

# Found by building, 2026-09-08 -- not in the Windows script, and not a platform difference to
# imitate blindly (CLAUDE.md's instruction on the legacy app applies to our own scripts too:
# don't resolve an ambiguity by copying a pattern, understand it first). Next's standalone output
# gives native modules (better-sqlite3 among them) a RELATIVE symlink under `.next/node_modules/`,
# computed for their original nested depth: `apps/web/.next/node_modules/<pkg>-<hash>` pointing
# `../../../../node_modules/<pkg>` (four levels up) at the real copy Next placed at the
# standalone root. Flattening `apps/web/*` up into `app/` (above) shortens that path by exactly
# two components -- `.next/node_modules/` now sits two levels closer to `app/node_modules/` -- but
# a symlink's stored target text does not move with it, so every one of these now points two
# levels too far up and dangles. `Copy-Item` on the Windows build does not preserve NTFS
# symlinks the same way `cp -a` preserves POSIX ones, which is why this never surfaced there:
# it is a Linux-specific consequence of a platform-independent bug, not a Linux-only bug.
#
# Fixed generally rather than special-cased to better-sqlite3: every relative symlink under the
# flattened tree that starts with the pre-flatten depth (`../../../../`) has exactly two levels
# removed, and the result is verified to resolve -- so a native module added later fails the
# build loudly instead of shipping a silently broken symlink the way this one did on the first
# real run.
while IFS= read -r -d '' link; do
  target="$(readlink "$link")"
  case "$target" in
    ../../../../*)
      fixed="${target#../../}"
      ln -sfn "$fixed" "$link"
      if [ ! -e "$link" ]; then
        echo "Broken symlink after flatten-depth fix: $link -> $fixed (was $target)" >&2
        exit 1
      fi
      ;;
  esac
done < <(find "$app_dir" -type l -print0)

cp -a "$web_dir/.next/static" "$app_dir/.next/static"
[ -d "$web_dir/public" ] && cp -a "$web_dir/public" "$app_dir/public"

# installer/boot.mjs, not a local copy: it needs no Linux-specific version (doc 14 section 11.3
# — process.cwd()/process.chdir() only, nothing platform-specific), so there is exactly one
# implementation shared by both builds rather than two copies that could drift apart.
cp "$repo_root/installer/boot.mjs" "$app_dir/boot.mjs"

# !! Next's standalone output copies more of the developer's working tree than the package has
# any business containing (doc 14 section 8.1 / 11.7 step 4). Same purge-and-assert rule as the
# Windows build, unchanged: the failure mode (a shared SECRET_STORE_KEY, someone else's database)
# is not platform-specific, so the defence isn't either.
forbidden=('.env*' '*.db' '*.db-wal' '*.db-shm' '*.sqlite' '*.sqlite3' 'secrets.enc.json')

assert_no_developer_state() {
  local found=()
  for pattern in "${forbidden[@]}"; do
    while IFS= read -r -d '' f; do found+=("$f"); done \
      < <(find "$app_dir" -type f -name "$pattern" -print0 2>/dev/null)
  done
  [ -d "$app_dir/data" ] && found+=("$app_dir/data")
  if [ "${#found[@]}" -gt 0 ]; then
    echo "Refusing to package: developer state present in $app_dir -- ${found[*]}" >&2
    exit 1
  fi
}

for pattern in "${forbidden[@]}"; do
  find "$app_dir" -type f -name "$pattern" -print -delete 2>/dev/null | sed "s#^#-- removing (from package): #"
done
[ -d "$app_dir/data" ] && { echo "-- removing data/ from the package"; rm -rf "$app_dir/data"; }

# Next's file tracing keeps what it can see being imported. Two things it cannot see, both found
# on a real Windows install 2026-08-24 (doc 14 section 8.2) and equally invisible on Linux,
# because neither is a Windows artefact:
#
# 1. playwright-core reads browsers.json at runtime from its own package directory. Overlay the
#    real packages rather than trusting the traced subset.
for pkg in playwright-core playwright; do
  source="$repo_root/node_modules/$pkg"
  target="$app_dir/node_modules/$pkg"
  [ -d "$source" ] || { echo "$pkg is not installed in the repository; run npm ci." >&2; exit 1; }
  rm -rf "$target"
  cp -a "$source" "$target"
done
[ -f "$app_dir/node_modules/playwright-core/browsers.json" ] || { echo "playwright-core/browsers.json is missing from the package; the app will fail to start." >&2; exit 1; }

# 2. The migration SQL files are read from disk at runtime, and @buybox/db is bundled
#    (transpilePackages), so the package cannot locate them by relative path at all.
migrations_source="$repo_root/packages/db/migrations"
[ -f "$migrations_source/sqlite/meta/_journal.json" ] || { echo "Migrations not found at $migrations_source." >&2; exit 1; }
cp -a "$migrations_source" "$app_dir/migrations"

# Asserted here rather than beside the purge above: every copy into the app directory has now
# happened, so this covers what later steps bring in too.
assert_no_developer_state

# --- 4. Bundle the Node runtime ---------------------------------------------------------------------
# Unlike node.exe, a Linux Node build is a directory tree (bin/, lib/, include/, share/), not one
# self-contained file -- `command -v node` only names the executable, so the whole prefix it
# lives under is what gets copied. actions/setup-node (the CI runner, doc 14 section 11.7) and
# nvm both install a complete extracted tarball this way, so `bin/../` reliably finds the root.
node_bin_path="$(command -v node)"
node_prefix="$(cd "$(dirname "$node_bin_path")/.." && pwd)"
mkdir -p "$staging/opt/buybox/node"
cp -a "$node_prefix/." "$staging/opt/buybox/node/"
[ -x "$staging/opt/buybox/node/bin/node" ] || { echo "Bundled node binary missing after copy from $node_prefix." >&2; exit 1; }

# --- 5. Verify the Node ABI matches the native modules we just built ----------------------------------
sqlite_entry="$app_dir/node_modules/better-sqlite3/lib/index.js"
[ -f "$sqlite_entry" ] || { echo "better-sqlite3 is not in the standalone output ($sqlite_entry)." >&2; exit 1; }
if ! (cd "$app_dir" && "$staging/opt/buybox/node/bin/node" -e "
  const D = require('better-sqlite3'); const d = new D(':memory:');
  d.exec('create table t(x)'); d.close(); process.stdout.write('abi-ok');
"); then
  echo "Node ABI mismatch: the bundled node binary cannot load the better-sqlite3 binary built by npm ci. Build the package on the same Node major version you install with (doc 14 section 3.1)." >&2
  exit 1
fi

# --- 6. Chromium, and the apt Depends: list that ships it (doc 14 section 11.6, 11.8) ------------------
chromium_dir="$staging/opt/buybox/chromium"
mkdir -p "$chromium_dir"
pushd "$repo_root" >/dev/null
# The authoritative source for the shared-library list is this project's own pinned Playwright
# version, captured fresh on every build rather than hand-maintained (doc 14 section 11.8) --
# --dry-run prints the apt packages without installing anything on the build machine.
# Scoped to `chromium` specifically. Found by building, 2026-09-08: an unscoped
# `install-deps --dry-run` prints the union of every browser engine Playwright knows about
# (Firefox, WebKit) rather than just the one this package ships (doc 14 section 3 -- Chromium
# only, for the Trendyol source). The unscoped list pulled in ~300 packages including gstreamer,
# ghostscript and spellcheckers -- WebKit/Firefox media and forms support this headless scraper
# never touches -- and would have shipped every one of them in `Depends:` to every customer.
#
# `--dry-run` reports what is MISSING, not what Chromium needs in the abstract -- it prints
# nothing on a machine that already has these libraries (from a previous build or a previous
# `apt install` of this same package on this same machine), and this then fails loudly below
# rather than silently shipping an empty `Depends:`. A stateless CI runner (doc 14 section 11.7)
# never hits this; a persistent local/test machine that has already installed a build of this
# package does, and the fix there is `apt purge` of the previous build's dependency packages
# (or a fresh container) before rebuilding, not a change to this script.
playwright_deps="$(npx playwright install-deps chromium --dry-run 2>/dev/null \
  | grep -oE '^\s+[a-z0-9][a-z0-9.+-]*' | sed 's/^\s*//' | sort -u | paste -sd, - || true)"
if [ -z "$playwright_deps" ]; then
  echo "Could not determine Playwright's apt dependency list (install-deps --dry-run produced nothing)." >&2
  echo "If this is a persistent machine that already has Chromium's deps installed (e.g. from a" >&2
  echo "previous build or 'apt install' of this package), that is the likely cause, not a broken" >&2
  echo "Playwright version -- purge them first or use a fresh machine/container." >&2
  exit 1
fi
PLAYWRIGHT_BROWSERS_PATH="$chromium_dir" npx playwright install chromium
popd >/dev/null

# --- 7. Scripts and the systemd unit template ---------------------------------------------------------
scripts_dir="$staging/opt/buybox/scripts"
mkdir -p "$scripts_dir"
for name in preflight.sh stop-service.sh configure-env.sh install-service.sh install-monitoring.sh verify-health.sh uninstall-service.sh; do
  cp "$script_dir/$name" "$scripts_dir/$name"
  chmod 755 "$scripts_dir/$name"
done

service_dir="$staging/opt/buybox/service"
mkdir -p "$service_dir"
cp "$script_dir/buybox.service.template" "$service_dir/buybox.service.template"

cp "$script_dir/buybox.logrotate" "$staging/etc/logrotate.d/buybox"

# --- 7b. Monitoring agent (doc 16, doc 14 section 11.5) ------------------------------------------------
# Same optionality as the Windows build: absence is a warning, not an error. A package without
# it installs and runs a completely working BuyBox with no remote monitoring.
monitoring_dir="$staging/opt/buybox/monitoring"
mkdir -p "$monitoring_dir"
cp "$repo_root/monitoring/alloy/config.linux.alloy" "$monitoring_dir/config.linux.alloy"
alloy_source="$script_dir/vendor/alloy-linux-$arch"
if [ -f "$alloy_source" ]; then
  cp "$alloy_source" "$monitoring_dir/alloy-linux-$arch"
  chmod 755 "$monitoring_dir/alloy-linux-$arch"
else
  echo "WARNING: Alloy is missing at $alloy_source. The package will install and run normally, but with no remote monitoring (doc 16)." >&2
fi

# --- 8. Smoke test: boot the assembled tree and require a healthy answer -------------------------------
# The Linux equivalent of doc 14 section 8.2's rule: typecheck, tests and the ABI assertion all
# exercise the repository, never the package. This runs the package itself, the way the systemd
# unit runs it (same env vars as buybox.service.template, working directory as the data
# directory), which is the only thing that would have caught the two Windows packaging bugs that
# rule was written about -- neither is Windows-specific, both reproduce identically here if this
# step is skipped.
if [ "$skip_smoke_test" -eq 0 ]; then
  echo "-- smoke test"
  smoke_dir="$(mktemp -d)"
  smoke_port=3999
  smoke_key="$("$staging/opt/buybox/node/bin/node" -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
  # Deliberately RELATIVE DATABASE_URL. This is what proves BUYBOX_DATA_DIR anchors it correctly
  # (doc 14 section 8.3) rather than merely assuming the fix still works.
  cat > "$smoke_dir/.env.local" <<ENV
DATABASE_URL=file:./data/app.db
SECRET_STORE_KEY=$smoke_key
SECRET_STORE_PATH=$smoke_dir/secrets.enc.json
SINGLE_PROCESS=1
ENV

  smoke_log="$smoke_dir/smoke.log"
  (
    cd "$smoke_dir"
    NODE_ENV=production \
    PORT="$smoke_port" \
    HOSTNAME=127.0.0.1 \
    AUTO_MIGRATE=1 \
    APP_VERSION="$version" \
    PLAYWRIGHT_BROWSERS_PATH="$chromium_dir" \
    BUYBOX_MIGRATIONS_DIR="$app_dir/migrations" \
    BUYBOX_DATA_DIR="$smoke_dir" \
    "$staging/opt/buybox/node/bin/node" "$app_dir/boot.mjs" >"$smoke_log" 2>&1 &
    echo $! > "$smoke_dir/pid"
  )
  smoke_pid="$(cat "$smoke_dir/pid")"

  cleanup_smoke() {
    kill "$smoke_pid" >/dev/null 2>&1 || true
    wait "$smoke_pid" 2>/dev/null || true
    rm -rf "$smoke_dir"
  }
  trap cleanup_smoke EXIT

  healthy=0 last_seen="(no response)"
  deadline=$((SECONDS + 90))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if body="$(curl -fsS --max-time 5 "http://127.0.0.1:$smoke_port/api/health" 2>/dev/null)"; then
      last_seen="$body"
      status="$(printf '%s' "$body" | grep -o '"status"[[:space:]]*:[[:space:]]*"[a-z]*"' | head -n1 | sed -E 's/.*"([a-z]+)"$/\1/')"
      [ "$status" = "ok" ] && { healthy=1; break; }
    fi
    sleep 3
  done

  if [ "$healthy" -ne 1 ]; then
    echo "--- smoke log ---"
    tail -n 40 "$smoke_log" || true
    echo "Smoke test failed: the packaged app never reported healthy. Last response: $last_seen" >&2
    exit 1
  fi

  # The worker must be running, and on the SAME database as the web half (doc 14 section 8.4).
  health="$(curl -fsS --max-time 10 "http://127.0.0.1:$smoke_port/api/health")"
  worker_running="$(printf '%s' "$health" | grep -o '"running"[[:space:]]*:[[:space:]]*[a-z]*' | head -n1 | sed -E 's/.*:\s*//')"
  if [ "$worker_running" != "true" ]; then
    echo "Smoke test failed: the embedded worker is not running in the packaged app." >&2
    exit 1
  fi

  root_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$smoke_port/")"
  if [ "$root_status" -ge 500 ]; then
    echo "Smoke test failed: / returned $root_status." >&2
    exit 1
  fi

  echo "-- smoke test passed (health ok, worker running, / returned $root_status)"
  trap - EXIT
  cleanup_smoke
fi

# --- 9. debian/control and maintainer scripts -----------------------------------------------------------
sed \
  -e "s#{{VERSION}}#$version#g" \
  -e "s#{{ARCH}}#$arch#g" \
  -e "s#{{PLAYWRIGHT_DEPS}}#$playwright_deps#g" \
  "$script_dir/debian/control.template" > "$staging/DEBIAN/control"

for name in preinst postinst prerm postrm conffiles; do
  cp "$script_dir/debian/$name" "$staging/DEBIAN/$name"
done
chmod 755 "$staging/DEBIAN/preinst" "$staging/DEBIAN/postinst" "$staging/DEBIAN/prerm" "$staging/DEBIAN/postrm"

# --- 10. Build ------------------------------------------------------------------------------------------
if [ "$skip_compile" -eq 1 ]; then
  echo "Staging ready at $staging (build skipped)."
  exit 0
fi

deb_path="$out_dir/buybox_${version}_${arch}.deb"
dpkg-deb --build --root-owner-group "$staging" "$deb_path"

# Doc 14 section 9 / 11.10: until packages are signed, the published hash is how a customer can
# tell they have what we built.
sha256sum "$deb_path" | awk '{print $1"  buybox_'"${version}"'_'"${arch}"'.deb"}' > "$deb_path.sha256"

echo
echo "Package: $deb_path"
echo "SHA-256: $(cut -d' ' -f1 "$deb_path.sha256")"
