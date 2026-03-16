# Hosted Overlay Retirement

Date: 2026-03-15
Milestone: M4

## Context

Lifecycle tried two versions of a shared desktop overlay host for surfaces that needed to appear above native terminal `NSView`s:

1. a separate hosted `WebviewWindow`
2. a same-window child webview

Both approaches added app-wide routing, lifecycle, and input coupling for a problem that only affected a narrow set of flows. The same-window host still regressed main app navigation and left a dormant overlay stack in the tree even when globally disabled.

## Learning

1. Desktop popovers and menus should stay in their local DOM/popover implementation unless they have a proven native-layering requirement in a live flow.
2. Workspace-local modal flows that collide with native terminals are better handled as route-driven dialogs with temporary native-terminal suppression than as a shared overlay transport.
3. Disabled infrastructure is still product and maintenance cost. If an overlay host is not shippable, remove its route, contracts, shortcuts, and compatibility callers instead of keeping a dead fallback path.
4. The real boundary is still native-terminal layering, but the fix should match the scope of the problem:
   - popovers stay local
   - route dialogs take over the workspace surface
   - native terminals are suppressed while that modal route is active

## Milestone Impact

1. M4 local Changes review stays reliable because it uses a workspace-route dialog instead of depending on a second overlay runtime.
2. M4 workspace navigation and relaunch behavior stay simpler because there is no parallel overlay-host route competing with the main app shell.
3. M5 future above-terminal UX should start from route ownership and native-surface suppression before adding new native or webview infrastructure.

## Follow-Up Actions

1. Keep the workspace route-dialog host as the default pattern for singleton workspace review flows with modal intent.
2. Reintroduce shared overlay infrastructure only if a specific live workflow cannot be solved by local popovers or route-level dialog ownership.
3. When testing desktop surfaces that mix DOM and native terminals, include relaunch, route navigation, and input/focus checks before promoting the pattern.
