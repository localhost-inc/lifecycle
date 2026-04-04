#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$APP_DIR/../.." && pwd)"
BUILD_DIR="$APP_DIR/.build/arm64-apple-macosx/debug"
DIST_DIR="$APP_DIR/dist"
APP_NAME="Lifecycle"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
EXECUTABLE_NAME="lifecycle-desktop-mac"
RESOURCE_BUNDLE_NAME="LifecycleDesktopMac_LifecycleDesktopMac.bundle"
APP_ICON_PATH="$APP_DIR/Resources/AppIcon.icns"

"$APP_DIR/scripts/prepare-ghosttykit.sh" >/dev/null

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
  <string>lifecycle-desktop-mac</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>dev.lifecycle.desktop-mac</string>
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
