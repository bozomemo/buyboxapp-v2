#!/usr/bin/env bash
#
# Doc 14 section 5 step 3 / 11.5 -- stop the running service before a single file under the
# install directory is replaced. Linux equivalent of installer/stop-service.ps1.
#
# `systemctl stop` is synchronous by design -- unlike the Windows SCM's async stop that
# stop-service.ps1 had to poll for with WaitForStatus, it does not return until the unit's whole
# cgroup has actually exited (or TimeoutStopSec, set in the unit, has elapsed and systemd
# escalates to SIGKILL). That is the guarantee stop-service.ps1 needs a manual process-list poll
# to get; here it is the meaning of `systemctl stop` succeeding. See the second comment below for
# what that implies about the leftover-process check that follows it.
#
# Exit code 0 = safe to proceed; anything else stops the installation. A machine with no
# service registered is a fresh install and is not an error.
set -euo pipefail

usage() { echo "Kullanim: $0 [--install-dir DIR] [--timeout-seconds N]" >&2; exit 2; }

install_dir=""
timeout_seconds=90
while [ $# -gt 0 ]; do
  case "$1" in
    --install-dir) install_dir="$2"; shift 2 ;;
    --timeout-seconds) timeout_seconds="$2"; shift 2 ;;
    *) usage ;;
  esac
done

if ! systemctl list-unit-files buybox.service >/dev/null 2>&1 \
   || ! systemctl list-unit-files buybox.service | grep -q buybox.service; then
  echo "buybox servisi kayitli degil."
else
  if systemctl is-active --quiet buybox 2>/dev/null; then
    echo "Calisan buybox servisi durduruluyor..."
    if ! timeout "$timeout_seconds" systemctl stop buybox; then
      echo "buybox servisi durdurulamadi." >&2
      echo "  Servis ${timeout_seconds} saniye icinde durmadi." >&2
      echo "  'systemctl status buybox' ile kontrol edip kurulumu tekrar baslatin." >&2
      exit 1
    fi
  fi
fi

# Belt-and-suspenders: WARN, do not fail, if something still matches the install directory.
#
# This was a hard failure (`exit 1`) until running it for real, 2026-09-08, twice over:
#
# First: this script's own path is `$install_dir/scripts/stop-service.sh`, so
# `pgrep -f -- "$install_dir"` matched the full command line of the very process running this
# check, every time, regardless of whether anything was actually still running. Excluding our
# own PID ($$) fixed that specific self-match.
#
# Second, still real after that fix: a genuine but short-lived straggler process (neither this
# script nor the tracked service) was caught mid-exit and the check failed a clean upgrade over
# it, even though `systemctl status` afterward showed the unit itself had "Deactivated
# successfully" with exit status 0 -- not a crash, not a hang, just a process outside the unit's
# tracked main PID taking its own time to go away. That exposed the comment above as wrong on
# Linux specifically: `systemctl stop` returning IS already the strong guarantee this check was
# written to compensate for -- it does not return `Deactivated successfully` until the unit's
# whole cgroup is empty, which is exactly the guarantee the Windows SCM's async stop does not
# give and `stop-service.ps1` has to poll for instead. A substring match on the full command line
# of whatever else happens to be running is a weaker, not stronger, signal than that, and failing
# an install on it moves a real Windows-shaped race into a false alarm on a platform that doesn't
# have it.
#
# So on Linux this stays as a diagnostic aid, not a gate: it still waits briefly and still names
# what it saw, so a genuinely stuck process is visible in the install log, but only a failed
# `systemctl stop` above -- not this -- can stop the install.
if [ -n "$install_dir" ]; then
  deadline=$((SECONDS + 10))
  holders=""
  while [ "$SECONDS" -lt "$deadline" ]; do
    holders="$(pgrep -f -- "$install_dir" | grep -vx "$$" || true)"
    [ -z "$holders" ] && break
    sleep 0.5
  done
  if [ -n "$holders" ]; then
    echo "Uyari: kurulum klasoruyle eslesen surecler hala goruluyor (bilgi amacli, kurulumu durdurmuyor):" >&2
    echo "  PID'ler: $holders" >&2
  fi
fi

echo "Kurulum klasoru serbest; kuruluma devam edilebilir."
exit 0
