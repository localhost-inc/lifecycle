#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OPEN_SCRIPT="$SCRIPT_DIR/open.sh"
WATCH_NAME="lifecycle-desktop-mac-dev"

cleanup() {
  watchman watch-del "$APP_DIR" >/dev/null 2>&1 || true
  pkill -f lifecycle-desktop-mac >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Initial build + launch
echo "Building and launching…"
"$OPEN_SCRIPT"
echo "Watching for changes in apps/desktop-mac/Sources…"

# Subscribe to Swift/ObjC/C/header changes via watchman
watchman watch-del "$APP_DIR" >/dev/null 2>&1 || true
watchman watch "$APP_DIR" >/dev/null
watchman -- trigger "$APP_DIR" "$WATCH_NAME" \
  -p '**/*.swift' '**/*.m' '**/*.c' '**/*.h' \
  -X '.build/**' -X 'dist/**' \
  -- "$OPEN_SCRIPT" >/dev/null

echo "Hot reload active. Edit any Swift/ObjC file to rebuild."
echo "Press Ctrl+C to stop."

# Keep the script alive so the trap fires on exit
while true; do
  sleep 86400
done
