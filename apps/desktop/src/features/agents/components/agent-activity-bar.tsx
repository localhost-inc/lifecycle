import { Shimmer } from "@lifecycle/ui";
import type { AgentTurnActivity } from "@lifecycle/agents";

function formatTurnActivity(
  activity: AgentTurnActivity | null,
  providerStatus: string | null,
): string {
  if (providerStatus) return providerStatus;
  if (!activity) return "Working";
  switch (activity.phase) {
    case "thinking":
      return "Thinking";
    case "responding":
      return "Writing";
    case "tool_use": {
      switch (activity.toolName) {
        case "Grep":
        case "Glob":
          return "Searching";
        case "Read":
          return "Reading";
        case "Edit":
          return "Editing";
        case "Write":
          return "Writing";
        case "Delete":
        case "DeleteFile":
          return "Deleting";
        case "Bash":
        case "command_execution":
          return "Running command";
        case "Agent":
          return "Delegating";
        default:
          return activity.toolName ? `Running ${activity.toolName}` : "Working";
      }
    }
    default:
      return "Working";
  }
}

export interface AgentActivityBarProps {
  turnActivity: AgentTurnActivity | null;
  providerStatus: string | null;
  elapsedSeconds: number;
  queuedMessageCount?: number;
}

export function AgentActivityBar({
  turnActivity,
  providerStatus,
  elapsedSeconds,
  queuedMessageCount = 0,
}: AgentActivityBarProps) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] text-[var(--muted-foreground)]">
      <span className="agent-cursor-blink">&#8226;</span>
      <Shimmer as="span" duration={2} spread={2} className="text-[12px]">
        {formatTurnActivity(turnActivity, providerStatus)}
      </Shimmer>
      <span className="text-[var(--muted-foreground)]/40">
        {elapsedSeconds}s{queuedMessageCount > 0 ? ` · ${queuedMessageCount} queued` : ""}
        {" · esc to interrupt"}
      </span>
    </div>
  );
}
