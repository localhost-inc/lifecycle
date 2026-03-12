# Turn Completion Notifications Need App-Owned Policy And Sound Profiles

Date: 2026-03-12
Milestone: M3

## Context

Lifecycle already emits semantic `terminal.harness_turn_completed` events and uses them for tab-level response-ready indicators. We now also want desktop notifications when a harness turn finishes, plus user control over when those notifications fire and what they sound like.

## Learning

1. The right trigger remains the existing `terminal.harness_turn_completed` event. Notification delivery should stay a consumer of the event foundation instead of introducing a second completion detector in React.
2. Notification policy belongs in app settings, not inside workspace UI state. The policy needs to be global, durable, and independent of whichever workspace surface happens to be mounted.
3. `always | when-unfocused | off` is the minimal durable contract for turn-complete notifications. It covers the main user intent without coupling the settings model to platform-specific behaviors like dock bounce or badge counts.
4. App-owned synthesized sounds are a better first step than bundling downloaded audio assets. They avoid licensing/source churn, keep the repo text-first, and let us ship a few distinct sounds without adding binary files.
5. Native system notifications still need platform permission plumbing. In Tauri, that means explicit plugin setup and capability permissions even when the app already has an internal event stream.

## Milestone Impact

1. M3: turns existing harness completion semantics into a user-visible desktop notification flow.
2. M3: keeps completion detection, tab attention state, and desktop notifications layered on the same semantic event rather than duplicating logic.
3. M3: adds the first notification settings surface without overcommitting to a larger notification-center architecture.

## Follow-Up Actions

1. Consider adding dock attention or badge counts as separate policy controls if notification volume becomes too easy to miss.
2. If users want imported sound files later, add that as an explicit settings contract instead of overloading the built-in sound selector.
3. If more completion-triggered behaviors appear, centralize them behind a shared notification manager rather than adding more direct event listeners.
