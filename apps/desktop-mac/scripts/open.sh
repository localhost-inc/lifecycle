#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_BUNDLE="$("$SCRIPT_DIR/build.sh")"

pkill -f lifecycle-desktop-mac >/dev/null 2>&1 || true
open -na "$APP_BUNDLE"
