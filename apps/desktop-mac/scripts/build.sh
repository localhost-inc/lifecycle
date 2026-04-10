#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$APP_DIR/../.." && pwd)"
BUILD_DIR="$APP_DIR/.build/arm64-apple-macosx/debug"
DIST_DIR="$APP_DIR/dist"
APP_NAME="Lifecycle"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
EXECUTABLE_NAME="lifecycle-macos"
RESOURCE_BUNDLE_NAME="LifecycleMac_LifecycleApp.bundle"
APP_ICON_PATH="$APP_DIR/Resources/AppIcon.icns"
BRIDGE_OPENAPI_PATH="$ROOT_DIR/packages/bridge/openapi.json"
APP_OPENAPI_PATH="$APP_DIR/Sources/LifecycleApp/openapi.json"

assert_bridge_openapi_symlink() {
  if [[ ! -L "$APP_OPENAPI_PATH" ]]; then
    echo "Expected $APP_OPENAPI_PATH to be a symlink to $BRIDGE_OPENAPI_PATH." >&2
    exit 1
  fi

  local link_target resolved_target
  link_target="$(readlink "$APP_OPENAPI_PATH")"

  if [[ "$link_target" = /* ]]; then
    resolved_target="$link_target"
  else
    resolved_target="$(
      cd "$(dirname "$APP_OPENAPI_PATH")/$(dirname "$link_target")"
      pwd
    )/$(basename "$link_target")"
  fi

  if [[ "$resolved_target" != "$BRIDGE_OPENAPI_PATH" ]]; then
    echo "Expected $APP_OPENAPI_PATH to resolve to $BRIDGE_OPENAPI_PATH, got $resolved_target." >&2
    exit 1
  fi
}

"$APP_DIR/scripts/prepare-ghosttykit.sh" >/dev/null
(
  cd "$ROOT_DIR/packages/bridge"
  bun run generate:openapi >/dev/null
)
assert_bridge_openapi_symlink

cd "$APP_DIR"
swift build >/dev/null

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"

cp "$BUILD_DIR/$EXECUTABLE_NAME" "$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"
cp -R "$BUILD_DIR/$RESOURCE_BUNDLE_NAME" "$APP_BUNDLE/Contents/Resources/$RESOURCE_BUNDLE_NAME"
cp "$APP_ICON_PATH" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"

cat >"$APP_BUNDLE/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>lifecycle-macos</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>dev.lifecycle.macos</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Lifecycle</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
PLIST

touch "$APP_BUNDLE"
printf '%s\n' "$APP_BUNDLE"
