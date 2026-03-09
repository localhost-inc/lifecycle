# Native Open In Menu Appearance - 2026-03-09

## Context

The workspace title bar now opens a native macOS `Open in` menu so it can render above the embedded native terminal surface. That menu initially appeared in macOS light mode even when the app was running under a dark preset like Nord.

## Learning

1. A native AppKit menu does not inherit the web app's custom preset theme. It only responds to the host application's effective light or dark appearance.
2. Once a native terminal surface is mounted as a sibling `NSView` above the Tauri webview, DOM popovers cannot out-layer it. Any menu that must appear above that surface has to be native or in a separate native window.
3. When the app uses web-managed theme state, native menus need an explicit bridge from the resolved appearance (`light` or `dark`) into `NSApp.appearance` before the menu is shown.
4. Preset themes like Nord still collapse to native `DarkAqua` for AppKit chrome. Native menus can match dark vs light mode, but not the app's full custom palette.

## Milestone Impact

1. M5: workspace lifecycle controls in the title bar can use native menus without breaking above native terminal surfaces.
2. M5: dark presets now keep macOS-native affordances visually coherent enough for mixed web/native shell UI.
3. M6: future native overlays around workspace controls should treat appearance sync as part of the contract, not as a visual polish follow-up.

## Follow-Up Actions

1. Reuse the same resolved-appearance bridge for future native popovers, menus, or sheet-style overlays.
2. Keep macOS-only native menu expectations narrow: light/dark parity is realistic, full preset styling is not.
3. If a future control needs exact custom styling above native surfaces, implement it as a dedicated child window rather than a DOM popover.
