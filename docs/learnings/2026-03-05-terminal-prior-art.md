# Terminal Prior Art Before M3

## Context

Before starting terminal work, we looked at prior art from VS Code and xterm to avoid baking local-only assumptions into Lifecycle's first terminal implementation.

## Learning

The useful patterns are:

1. Separate terminal UI from terminal process hosting.
   - VS Code moved terminal processes into a dedicated host process so terminal lifecycle is not tightly coupled to the renderer/window.
   - For Lifecycle, this reinforces the boundary between the desktop UI and the local terminal supervisor, and leaves room for a future daemon or cloud terminal broker.

2. Be explicit about reconnection semantics.
   - VS Code distinguishes between in-window tab behavior, restored sessions, and persistent process reconnection.
   - For Lifecycle M3, local terminal reattach should be scoped to the running desktop app session only. App-restart persistence is a different capability and should not be implied accidentally.

3. Treat PTY output as a stream, not general app state.
   - Terminal bytes are high-frequency and need batching, replay, and backpressure.
   - Metadata such as terminal status belongs in the reactive store; PTY output does not.

4. Treat terminal output as untrusted.
   - xterm guidance is clear: terminal content must stay inside the terminal emulator rendering path and never become arbitrary DOM/HTML.

5. Shell integration is valuable, but secondary.
   - VS Code's shell integration unlocks cwd detection, command boundaries, exit code tracking, and better command-aware UX.
   - Lifecycle should keep room for this, but it should not block the core M3 PTY and transport architecture.

## Milestone Impact

1. M3: confirms the local-first terminal design should use a dedicated stream channel plus explicit lifecycle commands.
2. M3: confirms that tab close, tab switch, app quit, and app restart must be treated as distinct terminal behaviors.
3. M7: keeps cloud terminal work compatible with the same domain model by avoiding local-only reconnect assumptions.

## Follow-Up Actions

1. Keep local PTY supervision behind a provider-owned backend boundary rather than letting xterm or UI components own terminal lifecycle.
2. Add shell-integration follow-up work after the core terminal path is stable.
3. If restart persistence becomes important, introduce a true persistent host (daemon or tmux-backed adapter) rather than stretching the M3 Tauri-owned supervisor beyond its natural scope.

## Sources

- VS Code terminal process layout and persistent sessions: https://code.visualstudio.com/updates/v1_54
- VS Code terminal restore on startup: https://code.visualstudio.com/updates/v1_82
- VS Code terminal shell integration: https://code.visualstudio.com/docs/terminal/shell-integration
- xterm addon guidance: https://xtermjs.org/docs/guides/using-addons/
- xterm security guidance: https://xtermjs.org/docs/guides/security/
