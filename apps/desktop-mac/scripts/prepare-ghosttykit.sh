#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$APP_DIR/../.." && pwd)"

export LIFECYCLE_GHOSTTY_GENERATED_DIR="$APP_DIR/.generated/ghostty"

"$ROOT_DIR/scripts/prepare-ghosttykit.sh"
