export const WORKSPACE_ACTIVITY_EVENT_NAMES = [
  "turn.started",
  "turn.completed",
  "tool.started",
  "tool.completed",
  "waiting.started",
  "waiting.completed",
] as const;

export type WorkspaceActivityEventName = (typeof WORKSPACE_ACTIVITY_EVENT_NAMES)[number];

export const TERMINAL_ACTIVITY_STATES = [
  "idle",
  "command_running",
  "turn_active",
  "tool_active",
  "waiting",
  "interactive_quiet",
  "interactive_active",
  "unknown",
] as const;

export type TerminalActivityState = (typeof TERMINAL_ACTIVITY_STATES)[number];

export interface WorkspaceActivityTerminalRecord {
  busy: boolean;
  last_event_at: string | null;
  metadata: Record<string, unknown> | null;
  provider: string | null;
  source: "explicit" | "shell" | "heuristic";
  state: TerminalActivityState;
  terminal_id: string;
  tool_name: string | null;
  turn_id: string | null;
  updated_at: string | null;
  waiting_kind: string | null;
}

export interface WorkspaceActivitySummary {
  busy: boolean;
  terminals: WorkspaceActivityTerminalRecord[];
  updated_at: string | null;
  workspace_id: string;
}
