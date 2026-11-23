#!/usr/bin/env bash
set -euo pipefail

echo "Stopping and removing cathobar.service..."
if systemctl list-unit-files | grep -q '^cathobar\.service'; then
  sudo systemctl disable --now cathobar.service || true
fi
sudo rm -f /etc/systemd/system/cathobar.service
sudo systemctl daemon-reload

echo "Removing kiosk autostart entries..."
rm -f "$HOME/.config/autostart/cathobar.desktop"

LABWC_AUTOSTART="$HOME/.config/labwc/autostart"
if [ -f "$LABWC_AUTOSTART" ]; then
  TMP_FILE="$(mktemp)"
  awk '
    /# CATHOBAR-KIOSK/ { skip=1; next }
    skip && /launch-kiosk\.sh/ { skip=0; next }
    { skip=0; print }
  ' "$LABWC_AUTOSTART" >"$TMP_FILE"
  mv "$TMP_FILE" "$LABWC_AUTOSTART"
fi

echo "CATHOBAR Raspberry Pi autostart & service removed."
