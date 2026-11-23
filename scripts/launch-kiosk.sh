#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:3000/}"
HEALTH_URL="${URL%/}/api/health"

BROWSER="$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)"
if [ -z "$BROWSER" ]; then
  echo "Error: chromium / chromium-browser not found." >&2
  exit 1
fi

# Wait up to 30s for the local CATHOBAR server to come up at boot
if command -v curl >/dev/null 2>&1; then
  for _ in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

# Hide mouse cursor on X11 if unclutter is installed
if [ -n "${DISPLAY:-}" ] && command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 1 -root >/dev/null 2>&1 &
fi

exec "$BROWSER" \
  --kiosk \
  --app="$URL" \
  --ozone-platform-hint=auto \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  "$URL"
