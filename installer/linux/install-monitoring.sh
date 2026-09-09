#!/usr/bin/env bash
#
# Doc 16 section 5, doc 14 section 11.5 -- install Grafana Alloy and render its configuration.
# Linux equivalent of installer/install-monitoring.ps1.
#
# Three rules shape it, identical to the Windows script and for the same reasons:
#
# 1. IT NEVER FAILS THE INSTALLATION. Every path here exits 0 and explains itself. This is the
#    opposite of install-service.sh, where a failure genuinely means the product is broken.
# 2. IT ONLY EVER ADDS WHAT IS MISSING. On an upgrade the wizard's fields come through empty,
#    meaning "keep what is already configured".
# 3. THE TOKEN IS NEVER WRITTEN WHERE ANOTHER USER CAN READ IT. It goes into its own file under
#    the data directory, owned by root, mode 600. Alloy's systemd unit runs as root — the
#    buybox.out.log/buybox.err.log files it tails are owned by buybox:buybox (the service user,
#    installer/linux/install-service.sh), and running Alloy as root avoids granting a second,
#    reporting-only process membership in that group just to read two log files. Nobody but root
#    can read the token either way.
set -uo pipefail

usage() {
  echo "Kullanim: $0 --install-dir DIR --data-dir DIR --port N [--instance S] [--loki-url S]" >&2
  echo "           [--loki-user S] [--prom-url S] [--prom-user S] [--token S]" >&2
  exit 2
}

install_dir="" data_dir="" port=""
instance="" loki_url="" loki_user="" prom_url="" prom_user="" token=""
while [ $# -gt 0 ]; do
  case "$1" in
    --install-dir) install_dir="$2"; shift 2 ;;
    --data-dir) data_dir="$2"; shift 2 ;;
    --port) port="$2"; shift 2 ;;
    --instance) instance="$2"; shift 2 ;;
    --loki-url) loki_url="$2"; shift 2 ;;
    --loki-user) loki_user="$2"; shift 2 ;;
    --prom-url) prom_url="$2"; shift 2 ;;
    --prom-user) prom_user="$2"; shift 2 ;;
    --token) token="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$install_dir" ] && [ -n "$data_dir" ] && [ -n "$port" ] || usage

monitor_dir="$data_dir/monitoring"
settings_path="$monitor_dir/settings.env"
token_path="$monitor_dir/grafana-token.txt"
config_path="$monitor_dir/config.alloy"
env_file_path="$monitor_dir/alloy.env"
# monitoring/alloy/config.linux.alloy, not a per-install template: it reads its settings from
# the process environment (`sys.env(...)`) rather than from {{TOKEN}} placeholders, so there is
# nothing to `sed` here -- the file is copied as-is and an EnvironmentFile= supplies the values
# (doc 16 section 9-10). This is a deliberate difference from the Windows script, not an
# oversight: config.linux.alloy already existed in this shape before install-monitoring.sh did.
config_source="$install_dir/monitoring/config.linux.alloy"
alloy_bin="$install_dir/monitoring/alloy-linux-$(dpkg --print-architecture 2>/dev/null || echo amd64)"

mkdir -p "$monitor_dir"

# --- Merge: what was already configured, overridden by whatever the wizard supplied ---------------
declare -A settings=()
if [ -f "$settings_path" ]; then
  if ! while IFS= read -r line || [ -n "$line" ]; do
    trimmed="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [ -z "$trimmed" ] && continue
    case "$trimmed" in \#*) continue ;; esac
    if [[ "$trimmed" =~ ^([A-Z0-9_]+)=(.*)$ ]]; then
      settings["${BASH_REMATCH[1]}"]="${BASH_REMATCH[2]}"
    fi
  done < "$settings_path"; then
    # The settings exist but cannot be read. Stopping here, having changed nothing, is the only
    # safe answer -- see the .ps1 comment: carrying on would rebuild from a set of blanks on an
    # upgrade, silently disconnecting a working installation.
    echo "Mevcut izleme ayarlari okunamadi ($settings_path)."
    echo "Hicbir sey degistirilmedi; onceki izleme yapilandirmasi gecerli kalir."
    exit 0
  fi
fi

[ -n "$instance" ] && settings[INSTANCE]="$instance"
[ -n "$loki_url" ] && settings[LOKI_URL]="$loki_url"
[ -n "$loki_user" ] && settings[LOKI_USER]="$loki_user"
[ -n "$prom_url" ] && settings[PROM_URL]="$prom_url"
[ -n "$prom_user" ] && settings[PROM_USER]="$prom_user"

# --- Complete a bare host into a push URL ----------------------------------------------------
# Grafana Cloud shows a bare host on some of its pages and a full push URL on others (measured
# 2026-09-08, doc 16). Only completed when the URL has no path of its own; a path the operator
# already supplied is left exactly as given.
complete_push_url() {
  local url="$1" default_path="$2"
  [ -z "$url" ] && { echo ""; return; }
  local path_part="${url#*://*/}"
  if [ "$path_part" = "$url" ] || [ -z "$path_part" ]; then
    echo "${url%/}$default_path"
  else
    echo "$url"
  fi
}
[ -n "${settings[LOKI_URL]:-}" ] && settings[LOKI_URL]="$(complete_push_url "${settings[LOKI_URL]}" '/loki/api/v1/push')"
[ -n "${settings[PROM_URL]:-}" ] && settings[PROM_URL]="$(complete_push_url "${settings[PROM_URL]}" '/api/prom/push')"

# A blank instance on a first install is not worth stopping for -- the machine name is a better
# default than nothing.
[ -z "${settings[INSTANCE]:-}" ] && settings[INSTANCE]="$(hostname)"

if [ -n "$token" ]; then
  # No trailing newline: local.file hands the file's bytes to basic_auth verbatim, and a stray
  # newline in the password produces a 401 that looks exactly like a wrong token.
  printf '%s' "$token" > "$token_path"
  chown root:root "$token_path" 2>/dev/null || true
  chmod 600 "$token_path"
fi

# --- Nothing configured? Say so and stop, successfully --------------------------------------------
if [ ! -f "$token_path" ] || [ -z "${settings[LOKI_URL]:-}" ] || [ -z "${settings[PROM_URL]:-}" ]; then
  echo "Uzaktan izleme yapilandirilmadi; bu adim atlandi. BuyBox normal calisiyor."
  echo "Daha sonra kurmak icin: docs/16-remote-observability.md, bolum 5."
  exit 0
fi

{
  for k in "${!settings[@]}"; do printf '%s=%s\n' "$k" "${settings[$k]}"; done
} > "$settings_path"

# --- Place the configuration and its environment file -----------------------------------------
if [ ! -f "$config_source" ]; then
  echo "Alloy yapilandirmasi bulunamadi: $config_source. Uzaktan izleme kurulmadi."
  exit 0
fi
install -m 644 "$config_source" "$config_path"

# Everything config.linux.alloy reads via sys.env(...). BUYBOX_DATA_DIR is what points it at the
# right log files (doc 16 section 9's point 1); the rest name the endpoints and the token file.
{
  printf 'BUYBOX_TOKEN_FILE=%s\n' "$token_path"
  printf 'BUYBOX_DATA_DIR=%s\n' "$data_dir"
  printf 'BUYBOX_INSTANCE=%s\n' "${settings[INSTANCE]}"
  printf 'BUYBOX_ADDRESS=127.0.0.1:%s\n' "$port"
  printf 'GRAFANA_CLOUD_LOKI_URL=%s\n' "${settings[LOKI_URL]}"
  printf 'GRAFANA_CLOUD_LOKI_USER=%s\n' "${settings[LOKI_USER]:-}"
  printf 'GRAFANA_CLOUD_PROM_URL=%s\n' "${settings[PROM_URL]}"
  printf 'GRAFANA_CLOUD_PROM_USER=%s\n' "${settings[PROM_USER]:-}"
} > "$env_file_path"

chmod 600 "$config_path" "$env_file_path"

# --- Install or update the Alloy service -----------------------------------------------------------
# Everything below is best effort. A failed monitoring install leaves a working BuyBox.
{
  if ! systemctl list-unit-files alloy.service >/dev/null 2>&1 \
     || ! systemctl list-unit-files alloy.service | grep -q alloy.service; then
    if [ ! -x "$alloy_bin" ]; then
      echo "Alloy calistirilabilir dosyasi pakette yok: $alloy_bin. Uzaktan izleme kurulmadi."
      exit 0
    fi
    install -m 755 "$alloy_bin" /usr/local/bin/alloy
    cat > /etc/systemd/system/alloy.service <<UNIT
[Unit]
Description=Grafana Alloy (BuyBox remote monitoring)
After=network-online.target buybox.service
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=$env_file_path
ExecStart=/usr/local/bin/alloy run --storage.path=$monitor_dir/data $config_path
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable --now alloy
  else
    # Alloy reloads on SIGHUP in principle; a restart is what's guaranteed to pick up a config
    # path or content change on every version, and it's what the Windows script does too.
    systemctl restart alloy
  fi

  if systemctl is-active --quiet alloy; then
    echo "Uzaktan izleme kuruldu. Makine adi: ${settings[INSTANCE]}"
  else
    echo "Alloy servisi baslatilamadi. Uzaktan izleme etkin degil; 'journalctl -u alloy' bakin."
  fi
} || {
  echo "Uzaktan izleme kurulamadi. BuyBox normal calisiyor. Ayrintilar icin docs/16-remote-observability.md."
}

exit 0
