#!/usr/bin/env bash
set -euo pipefail

PORT=3000
SKIP_BUILD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port)
      PORT="${2:-3000}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    -h|--help)
      echo "Usage: bash scripts/install-pi.sh [--port 3000] [--skip-build]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [ "${EUID:-$(id -u)}" -eq 0 ]; then
  echo "Error: Run this script as your normal desktop user (e.g. pi), not with sudo." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_USER="$(id -un)"
TARGET_HOME="$HOME"

echo "[1/5] Installing system packages & Japanese fonts..."
sudo apt-get update
sudo apt-get install -y git curl ca-certificates fonts-noto-cjk
sudo apt-get install -y unclutter || true

echo "[2/5] Checking Node.js (>= 20)..."
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$NODE_MAJOR" -ge 20 ]; then
    NEED_NODE=0
    echo "  Found Node.js $(node -v)"
  fi
fi

if [ "$NEED_NODE" -eq 1 ]; then
  echo "  Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

NODE_BIN="$(command -v node)"

echo "[3/5] Installing npm dependencies & building CATHOBAR..."
cd "$REPO_DIR"
if [ "$SKIP_BUILD" -eq 1 ]; then
  echo "  --skip-build specified: skipping npm build (installing production deps if needed)"
  if [ ! -d node_modules ]; then
    npm ci --omit=dev || npm install --omit=dev
  fi
else
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
  npm run build
fi

chmod +x "$REPO_DIR/scripts/launch-kiosk.sh" "$REPO_DIR/scripts/install-pi.sh" "$REPO_DIR/scripts/uninstall-pi.sh"

echo "[4/5] Registering systemd service (cathobar.service)..."
SERVICE_FILE="/etc/systemd/system/cathobar.service"
sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=CATHOBAR Modern ANOBAR8 Ticker Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$TARGET_USER
WorkingDirectory=$REPO_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=$NODE_BIN $REPO_DIR/packages/server/dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now cathobar.service

echo "[5/5] Configuring desktop kiosk autostart (Wayland labwc & X11)..."
KIOSK_URL="http://localhost:${PORT}/"
KIOSK_CMD="bash $REPO_DIR/scripts/launch-kiosk.sh $KIOSK_URL"

# Wayland (labwc) autostart
LABWC_DIR="$TARGET_HOME/.config/labwc"
LABWC_AUTOSTART="$LABWC_DIR/autostart"
mkdir -p "$LABWC_DIR"
touch "$LABWC_AUTOSTART"
if ! grep -q "# CATHOBAR-KIOSK" "$LABWC_AUTOSTART"; then
  cat >>"$LABWC_AUTOSTART" <<EOF

# CATHOBAR-KIOSK
($KIOSK_CMD) &
EOF
fi

# X11 (.desktop) autostart
XDG_AUTOSTART_DIR="$TARGET_HOME/.config/autostart"
mkdir -p "$XDG_AUTOSTART_DIR"
cat >"$XDG_AUTOSTART_DIR/cathobar.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=CATHOBAR Kiosk
Comment=Modern ANOBAR8 Ticker Display
Exec=$KIOSK_CMD
X-GNOME-Autostart-enabled=true
Terminal=false
EOF

HOST_NAME="$(hostname)"
LAN_IPS="$(hostname -I 2>/dev/null || true)"

echo ""
echo "============================================================"
echo " CATHOBAR Raspberry Pi setup complete!"
echo "============================================================"
echo " Display URL : $KIOSK_URL"
echo " Admin UI    : http://${HOST_NAME}.local:${PORT}/admin"
for ip in $LAN_IPS; do
  case "$ip" in
    *:*) ;;
    *) echo " LAN Admin   : http://${ip}:${PORT}/admin" ;;
  esac
done
echo ""
echo " Next manual steps (if not already done):"
echo "  1. Rotate your bar monitor to landscape in:"
echo "     Preferences -> Screen Configuration -> Orientation"
echo "  2. Disable screen blanking:"
echo "     sudo raspi-config -> Display Options -> Screen Blanking -> No"
echo "  3. Reboot to test automatic kiosk startup: sudo reboot"
echo "============================================================"
