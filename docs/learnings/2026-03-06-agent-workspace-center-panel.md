# Agent Workspace Center Panel - 2026-03-06

## Context

The terminal-based center pane has been costly to stabilize and forces Lifecycle to inherit provider-specific CLI behavior that does not map cleanly to a collaborative control-plane product.

## Learning

The right product split is:

1. Lifecycle should own the main agent workspace UI, session model, task model, approvals, and artifacts.
2. Raw shell terminals should remain available, but as a secondary shell/debug surface rather than the primary agent experience.
3. Agent-agnostic does not mean UI-neutral. Lifecycle can provide one normalized control surface while keeping runtimes pluggable underneath.
4. The persistence model must be renovated around portable `agent_*` records so local SQLite and future cloud storage can share the same logical schema.
5. AI SDK `useChat` should sit at the UI edge for composer/stream UX, but persisted `agent_*` state must remain authoritative for replay.
6. Structured filesystem, shell, git, and workspace-context tools need to be first-class milestone scope rather than an implicit later add-on.
7. Claude Code and Codex should be treated as execution backends or raw-terminal fallbacks, not as the center-panel UI contract to imitate.
8. AI SDK Core `ToolLoopAgent` is the right default primitive for the first native runtime path; we should only drop lower when product requirements force it.
9. AI SDK attachments should be treated as `file` parts at the UI boundary, while `agent_attachment` remains the Lifecycle persistence model underneath.

## Milestone Impact

1. Backlog: preserves the Lifecycle-native agent workspace concept outside the active milestone sequence.
2. M4: resumes as the next active post-M3 milestone for local workspace environment and lifecycle controls.
3. M5: keeps the CLI focused on machine-friendly workspace control and observability instead of defining the primary agent UX.
4. M6: can later project the same agent session/task/tool/artifact model into cloud workspaces without redesigning the desktop surface if the backlog item is revived.

## Follow-Up Actions

1. Define normalized entities for sessions, messages, message parts, tool calls, tasks, approvals, and artifacts before implementation starts.
2. Keep PTY transport and agent session transport separate so shell behavior does not leak into the center-panel contract.
3. Treat terminal-backed agents as compatibility adapters, not the source of truth for the primary Lifecycle UX.
4. Keep provider SDKs and workspace mutation tools behind Lifecycle transport/capability boundaries rather than calling them directly from React.
5. Keep raw Claude/Codex terminals available even if center-panel adapter support ships incrementally.
6. Decide runtime placement early enough to choose between `DirectChatTransport` and a Tauri/cloud-aware custom transport without mid-implementation churn.
