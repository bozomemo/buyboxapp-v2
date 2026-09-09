#!/usr/bin/env bash
#
# Doc 14 section 10 D-6 / 11.6, 11.12 (D-U5) -- undo everything the install did outside its own
# directories. Linux equivalent of installer/uninstall-service.ps1.
#
# On Ubuntu this script is invoked from debian/postrm (doc 14 section 11.6), which already
# gives the remove/purge distinction Windows needed a checkbox and a script to reproduce:
# `apt remove buybox` calls this with --keep-data (implicit, see below), `apt purge buybox`
# additionally deletes the data and log directories, which postrm does itself, not this script.
#
# Tolerant on purpose: an uninstall must finish even if the service is already gone, already
# stopped, or wedged. A half-uninstalled product that cannot be uninstalled again is the worst
# state to leave a machine in.
set -uo pipefail

if systemctl list-unit-files buybox.service >/dev/null 2>&1 \
   && systemctl list-unit-files buybox.service | grep -q buybox.service; then
  if systemctl is-active --quiet buybox 2>/dev/null; then
    systemctl stop buybox || echo "buybox servisi durdurulamadi; devam ediliyor." >&2
  fi
  systemctl disable buybox >/dev/null 2>&1 || true
fi

rm -f /etc/systemd/system/buybox.service
systemctl daemon-reload || true

# --- Monitoring agent (doc 16 section 5, doc 14 section 11.5) -----------------------------------
# Alloy is a separate product in its own directory, but *we* installed it, so it comes back out.
# Entirely best effort: Alloy may have been installed by hand before BuyBox was, or be shared
# with something else on this machine, and removing BuyBox must never depend on removing it.
if systemctl list-unit-files alloy.service >/dev/null 2>&1 \
   && systemctl list-unit-files alloy.service | grep -q alloy.service; then
  if dpkg -S /etc/systemd/system/alloy.service >/dev/null 2>&1; then
    echo "Grafana Alloy paketle kuruldu (apt); ayri kaldirilmasi gerekiyorsa 'apt remove alloy'."
  else
    echo "Grafana Alloy servisi bulundu ama BuyBox tarafindan mi kuruldugu belirsiz; elle kontrol edin."
  fi
fi

exit 0
