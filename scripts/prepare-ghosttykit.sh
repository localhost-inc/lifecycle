#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_DIR="$ROOT_DIR/apps/desktop/src-tauri"
GENERATED_DIR="$TAURI_DIR/.generated/ghostty"
SOURCE_DIR="${LIFECYCLE_GHOSTTY_SOURCE_DIR:-$GENERATED_DIR/source}"
OUTPUT_DIR="$GENERATED_DIR/GhosttyKit.xcframework"
STAMP_FILE="$GENERATED_DIR/ghosttykit.stamp"
LOCK_FILE="$ROOT_DIR/vendor/ghostty.lock"

read_lock_value() {
  local expected_key="$1"
  local value
  value="$(
    awk -F '=' -v expected_key="$expected_key" '
      /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
      {
        key = $1
        value = substr($0, index($0, "=") + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        if (key == expected_key) {
          print value
          exit
        }
      }
    ' "$LOCK_FILE"
  )"

  if [[ -z "$value" ]]; then
    echo "ghostty lock file missing value for '$expected_key': $LOCK_FILE" >&2
    exit 1
  fi

  printf '%s\n' "$value"
}

if [[ ! -f "$LOCK_FILE" ]]; then
  echo "ghostty lock file not found: $LOCK_FILE" >&2
  exit 1
fi

GHOSTTY_REPOSITORY="$(read_lock_value repo)"
GHOSTTY_COMMIT="$(read_lock_value commit)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "prepare-ghosttykit.sh only supports macOS." >&2
  exit 1
fi

mkdir -p "$GENERATED_DIR"

if [[ -z "${LIFECYCLE_GHOSTTY_SOURCE_DIR:-}" ]] && [[ -f "$OUTPUT_DIR/Info.plist" ]] && \
  [[ -f "$STAMP_FILE" ]] && [[ "$(cat "$STAMP_FILE")" == "$GHOSTTY_COMMIT" ]]; then
  printf '%s\n' "$OUTPUT_DIR"
  exit 0
fi

if ! command -v zig >/dev/null 2>&1; then
  echo "zig is required to build GhosttyKit." >&2
  exit 1
fi

if ! /usr/bin/xcrun -sdk macosx metal -v >/dev/null 2>&1; then
  /usr/bin/xcodebuild -downloadComponent MetalToolchain >/dev/null
fi

if [[ -z "${LIFECYCLE_GHOSTTY_SOURCE_DIR:-}" ]]; then
  if [[ ! -d "$SOURCE_DIR/.git" ]]; then
    rm -rf "$SOURCE_DIR"
    git clone "$GHOSTTY_REPOSITORY" "$SOURCE_DIR" >/dev/null
  fi

  (
    cd "$SOURCE_DIR"
    if [[ "$(git rev-parse HEAD)" != "$GHOSTTY_COMMIT" ]]; then
      git fetch --depth 1 origin "$GHOSTTY_COMMIT" >/dev/null
      git checkout --detach "$GHOSTTY_COMMIT" >/dev/null
    fi
  )
elif [[ ! -d "$SOURCE_DIR" ]]; then
  echo "LIFECYCLE_GHOSTTY_SOURCE_DIR does not exist: $SOURCE_DIR" >&2
  exit 1
fi

(
  cd "$SOURCE_DIR"
  # The zig build may exit non-zero because xcodebuild for the full Ghostty
  # macOS app can fail (e.g. Swift version mismatches). We only need the
  # GhosttyKit.xcframework which is built before that step.
  zig build -Demit-xcframework=true -Dxcframework-target=native -Doptimize=ReleaseFast >/dev/null || true
)

if [[ ! -d "$SOURCE_DIR/macos/GhosttyKit.xcframework" ]]; then
  echo "GhosttyKit.xcframework was not produced" >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
cp -R "$SOURCE_DIR/macos/GhosttyKit.xcframework" "$OUTPUT_DIR"

if [[ -z "${LIFECYCLE_GHOSTTY_SOURCE_DIR:-}" ]]; then
  printf '%s\n' "$GHOSTTY_COMMIT" >"$STAMP_FILE"
else
  rm -f "$STAMP_FILE"
fi

printf '%s\n' "$OUTPUT_DIR"
