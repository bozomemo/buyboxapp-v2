#!/usr/bin/env bash
#
# Doc 14 section 5 step 1 / 11.5 -- refuse an install that cannot work, before anything is
# written. Linux equivalent of installer/preflight.ps1.
#
# Every message is Turkish and names what is wrong, because the person reading it is the
# customer, not us. Exit code 0 = proceed; anything else stops the installer.
#
# It deliberately checks nothing about Node, Chromium or a database: those ship inside the
# package (doc 14 section 3), so there is nothing to find and nothing to fail on.
set -euo pipefail

required_free_mb="${1:-1500}"
problems=()

# --- 64-bit, and a recent-enough Ubuntu LTS -----------------------------------------------
arch="$(dpkg --print-architecture 2>/dev/null || uname -m)"
case "$arch" in
  amd64|arm64) ;;
  *) problems+=("Bu uygulama yalnizca amd64 veya arm64 mimarisinde calisir. Bu makine: $arch.") ;;
esac

if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ]; then
    problems+=("Bu paket Ubuntu icin hazirlandi. Tespit edilen: ${PRETTY_NAME:-bilinmiyor}.")
  else
    major="${VERSION_ID%%.*}"
    if [ -z "$major" ] || [ "$major" -lt 22 ]; then
      problems+=("Ubuntu 22.04 LTS veya daha yenisi gerekiyor. Bu makine: ${VERSION_ID:-bilinmiyor}.")
    fi
  fi
else
  problems+=("Isletim sistemi tespit edilemedi (/etc/os-release yok).")
fi

# --- Root ------------------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
  problems+=("Kurulum root olarak calistirilmali (sudo ile deneyin).")
fi

# --- systemd present ---------------------------------------------------------------------------
if ! command -v systemctl >/dev/null 2>&1; then
  problems+=("systemd bulunamadi. Bu paket systemd tabanli servis yonetimi gerektirir.")
fi

# --- Disk space on /opt and /var ------------------------------------------------------------
for target in /opt /var; do
  avail_mb="$(df -Pm "$target" 2>/dev/null | awk 'NR==2 {print $4}')"
  if [ -z "${avail_mb:-}" ]; then
    problems+=("$target icin bos alan hesaplanamadi.")
  elif [ "$avail_mb" -lt "$required_free_mb" ]; then
    problems+=("Yetersiz disk alani: $target uzerinde ${avail_mb} MB bos yer var, en az ${required_free_mb} MB gerekiyor.")
  fi
done

if [ "${#problems[@]}" -gt 0 ]; then
  echo "Kurulum baslatilamiyor:"
  for p in "${problems[@]}"; do
    echo "  - $p"
  done
  exit 1
fi

echo "Sistem kontrolleri tamam."
exit 0
