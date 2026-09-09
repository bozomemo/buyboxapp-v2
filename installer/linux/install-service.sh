#!/usr/bin/env bash
#
# Doc 14 section 5 step 7 / 11.4, 11.5 -- render the systemd unit and register the service.
# Linux equivalent of installer/install-service.ps1.
#
# Idempotent: on an upgrade the unit file is simply rewritten and `systemctl daemon-reload`
# always re-reads it -- there is no WinSW-shaped "refresh command missing in this version"
# trap (doc 14 section 5.6 / 11.4), because daemon-reload has behaved the same way on every
# systemd release Ubuntu has shipped.
set -euo pipefail

usage() {
  echo "Kullanim: $0 --install-dir DIR --data-dir DIR --port N --version V" >&2
  exit 2
}

install_dir=""
data_dir=""
port=""
version=""
while [ $# -gt 0 ]; do
  case "$1" in
    --install-dir) install_dir="$2"; shift 2 ;;
    --data-dir) data_dir="$2"; shift 2 ;;
    --port) port="$2"; shift 2 ;;
    --version) version="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$install_dir" ] && [ -n "$data_dir" ] && [ -n "$port" ] && [ -n "$version" ] || usage

log_dir="$data_dir/logs"
unit_path="/etc/systemd/system/buybox.service"
template="$install_dir/service/buybox.service.template"

# --- The buybox system user ---------------------------------------------------------------------
# Created here, not assumed: a fresh install has no user yet, and creating it idempotently is
# cheaper than a separate preinst-only code path. --system gives it no login shell and no
# password; --home anchors it at the data directory the same way the Windows service account's
# working directory does (doc 14 section 4.1 / 11.3).
if ! id -u buybox >/dev/null 2>&1; then
  useradd --system --home-dir "$data_dir" --shell /usr/sbin/nologin buybox
fi

mkdir -p "$data_dir" "$log_dir"
chown -R buybox:buybox "$data_dir" "$log_dir"

if [ ! -f "$template" ]; then
  echo "Servis sablonu bulunamadi: $template" >&2
  exit 1
fi

sed \
  -e "s#{{INSTALL_DIR}}#$install_dir#g" \
  -e "s#{{DATA_DIR}}#$data_dir#g" \
  -e "s#{{LOG_DIR}}#$log_dir#g" \
  -e "s#{{PORT}}#$port#g" \
  -e "s#{{VERSION}}#$version#g" \
  "$template" > "$unit_path"

systemctl daemon-reload

if systemctl is-active --quiet buybox 2>/dev/null; then
  systemctl restart buybox
else
  systemctl enable --now buybox
fi

if ! systemctl is-active --quiet buybox; then
  echo "Servis baslatilamadi. 'journalctl -u buybox' ile ayrintiya bakin." >&2
  exit 1
fi

echo "buybox servisi kuruldu ve baslatildi."
