#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WATCH_DIR="$APP_DIR/Sources"
OPEN_SCRIPT="$SCRIPT_DIR/open.sh"
WATCH_NAME="lifecycle-desktop-mac-dev"

cleanup() {
  watchman trigger-del "$WATCH_DIR" "$WATCH_NAME" >/dev/null 2>&1 || true
  watchman watch-del "$WATCH_DIR" >/dev/null 2>&1 || true
  pkill -f lifecycle-desktop-mac >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Initial build + launch
echo "Building and launching…"
"$OPEN_SCRIPT"
echo "Watching for changes in apps/desktop-mac/Sources…"

# Watchman CLI glob flags are version-sensitive here; register the trigger via
# JSON so Swift/ObjC edits reliably rebuild and relaunch the app.
watchman watch-del "$WATCH_DIR" >/dev/null 2>&1 || true
watchman watch "$WATCH_DIR" >/dev/null
cat <<EOF | watchman -j >/dev/null
["trigger", "$WATCH_DIR", {
  "name": "$WATCH_NAME",
  "expression": [
    "anyof",
    ["suffix", "swift"],
    ["suffix", "m"],
    ["suffix", "mm"],
    ["suffix", "c"],
    ["suffix", "h"]
  ],
  "command": ["$OPEN_SCRIPT"]
}]
EOF

if ! watchman -- trigger-list "$WATCH_DIR" | grep -q "\"name\": \"$WATCH_NAME\""; then
  echo "Failed to register the desktop-mac hot reload trigger." >&2
  exit 1
fi

echo "Hot reload active. Edit any Swift/ObjC file to rebuild."
echo "Press Ctrl+C to stop."

# Keep the script alive so the trap fires on exit
while true; do
  sleep 86400
done
